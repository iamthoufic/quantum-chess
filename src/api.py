"""FastAPI server: exposes the Qiskit engine to the web frontend and serves the UI.

Run from the repository root:
    uvicorn src.api:app --reload
then open http://127.0.0.1:8000
"""

import io
import sys
import uuid
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qchess import Game, IllegalMove, name, parse  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

app = FastAPI(title="Quantum Chess 5x5")


@app.middleware("http")
async def no_stale_files(request, call_next):
    """Browsers must revalidate the page's files, so an update never shows a stale script."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response
games: dict[str, Game] = {}
circuits: dict[str, dict] = {}       # gid -> {ply: QuantumCircuit}, so any past move can be drawn while reviewing


def remember_circuit(gid: str, game: Game) -> None:
    store = circuits.setdefault(gid, {})
    for ply in [p for p in store if p > game.ply]:      # after a take-back
        del store[ply]
    if game.last_circuit is not None:
        store[game.ply] = game.last_circuit


class NewGame(BaseModel):
    quantum: bool = True
    seed: int | None = None


class Play(BaseModel):
    kind: str                 # "move" | "split" | "merge"
    src: str
    dst: str
    extra: str | None = None  # second target (split) or second source (merge)


def get(gid: str) -> Game:
    if gid not in games:
        raise HTTPException(404, "unknown game")
    return games[gid]


KEY_IDS = {"x": "x", "ψ": "psi", "iSWAP": "iswap", r"$\sqrt{\mathrm{iSWAP}}$": "sqrt",
           r"$\mathrm{iSWAP}^{\dagger}$": "iswapdg", r"$\sqrt{\mathrm{iSWAP}}^{\,\dagger}$": "sqrtdg"}


def circuit_key(qc) -> list[str]:
    """Ids of the box types used in a circuit drawing, for the key under it."""
    keys = set()
    for ins in qc.data:
        op = ins.operation
        if op.name == "measure":
            keys.add("measure")
        elif getattr(op, "num_ctrl_qubits", 0):
            keys.update(["control", "iswap"])
        else:
            keys.add(KEY_IDS.get(op.label or op.name, op.name))
    return sorted(keys)


def snapshot(gid: str, game: Game) -> dict:
    squares = []
    for sq in range(25):
        piece = game.pieces.get(sq)
        squares.append({
            "sq": name(sq),
            "piece": None if piece is None else
            {"pid": piece.pid, "color": piece.color, "kind": piece.kind},
            "prob": round(game.prob(sq), 4),
            "quantum": game.q.is_active(sq),
        })
    return {
        "id": gid, "turn": game.turn, "winner": game.winner, "end_reason": game.end_reason, "quantum": game.quantum,
        "check": game.in_check(game.turn), "check_sq": name(game.king_square(game.turn)) if game.in_check(game.turn) else None,
        "ply": game.ply, "qubits": game.q.num_qubits, "squares": squares,
        "log": game.log, "has_circuit": game.last_circuit is not None,
        "circuit_text": str(game.last_circuit.draw("text", fold=-1)) if game.last_circuit else "",
        "circuit_key": circuit_key(game.last_circuit) if game.last_circuit else [],
        "trace": game.last_trace,
    }


@app.get("/api/info")
def info():
    import qiskit
    return {"engine": "qiskit", "qiskit": qiskit.__version__}


@app.post("/api/new")
def new_game(req: NewGame):
    gid = uuid.uuid4().hex[:8]
    games[gid] = Game(seed=req.seed, quantum=req.quantum)
    return snapshot(gid, games[gid])


@app.get("/api/{gid}")
def state(gid: str):
    return snapshot(gid, get(gid))


@app.get("/api/{gid}/options/{sq}")
def options(gid: str, sq: str):
    game = get(gid)
    o = game.options(parse(sq))
    return {
        "move": [name(s) for s in o["move"]],
        "capture": [name(s) for s in o["capture"]],
        "split": [name(s) for s in o["split"]],
        "merge": {name(k): [name(s) for s in v] for k, v in o["merge"].items()},
    }


class Undo(BaseModel):
    plies: int = 1


@app.post("/api/{gid}/undo")
def undo(gid: str, req: Undo):
    """Take back the last move(s): the game is replayed in Qiskit without them."""
    game = get(gid)
    if not game.log:
        raise HTTPException(400, "nothing to take back")
    games[gid] = game.undo(max(1, min(req.plies, len(game.log))))
    remember_circuit(gid, games[gid])
    return snapshot(gid, games[gid])


@app.post("/api/{gid}/play")
def play(gid: str, req: Play):
    game = get(gid)
    try:
        src, dst = parse(req.src), parse(req.dst)
        if req.kind in ("split", "merge") and not req.extra:
            raise IllegalMove(f"{req.kind} needs a second square")
        if req.kind == "move":
            game.move(src, dst)
        elif req.kind == "split":
            game.split(src, dst, parse(req.extra))
        elif req.kind == "merge":
            game.merge(src, parse(req.extra), dst)
        else:
            raise IllegalMove(f"unknown move kind {req.kind!r}")
    except (IllegalMove, ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc))
    remember_circuit(gid, game)
    return snapshot(gid, game)


@app.get("/api/{gid}/circuit.svg")
def circuit_svg(gid: str, ply: int | None = None):
    """The circuit of the last move, or of the move that ended at `ply` (for reviewing)."""
    game = get(gid)
    qc = game.last_circuit if ply is None or ply == game.ply else circuits.get(gid, {}).get(ply)
    if qc is None:
        raise HTTPException(404, "no circuit for that move")
    fig = qc.draw("mpl", style="iqp", fold=-1)
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", transparent=True)
    plt.close(fig)
    return Response(buf.getvalue(), media_type="image/svg+xml")


# the web UI (index.html, app.js, engine.js, ...) is served from the site root
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
