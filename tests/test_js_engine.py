"""Check that the in-browser engine (web/engine.js) reproduces the Qiskit engine.

Random move sequences (splits, merges, entangling slides, captures) are played by
the Python/Qiskit engine; node then replays them through engine.js and every
square's probability must match after every move. Measurements are made
deterministic in both engines (outcome 1 iff P(1) > 0.5) so the runs line up.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from qiskit.quantum_info import Statevector  # noqa: E402

from qchess import Game  # noqa: E402
from qchess.quantum import QuantumState  # noqa: E402

NODE = shutil.which("node")

NODE_SCRIPT = r"""
const QC = require(process.argv[2]);
const games = JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"));
const out = games.map(({ quantum, moves }) => {
  const g = new QC.Game({ seed: 0, quantum });
  g.q.forceOutcome = (p) => (p > 0.5 - 1e-6 ? 1 : 0);
  return moves.map((m) => {
    const sq = m.slice(1).map(QC.parse);
    if (m[0] === "move") g.move(sq[0], sq[1]);
    else if (m[0] === "split") g.split(sq[0], sq[1], sq[2]);
    else g.merge(sq[0], sq[1], sq[2]);
    return Array.from({ length: 25 }, (_, s) => g.prob(s));
  });
});
console.log(JSON.stringify(out));
"""


def forced_measure(self, sq):
    """Deterministic stand-in for QuantumState.measure (same rule as the JS side)."""
    k = self.active.index(sq)
    p1 = float(self.sv.probabilities([k])[1])
    result = 1 if p1 > 0.5 - 1e-6 else 0
    n = self.num_qubits
    data = self.sv.data.reshape([2] * n).copy()
    idx = [slice(None)] * n
    idx[n - 1 - k] = 1 - result
    data[tuple(idx)] = 0
    data = data.reshape(-1)
    self.sv = Statevector(data / np.linalg.norm(data))
    self.trace.append(("measure", sq, result))
    return result


def play_random(seed, quantum, plies=40):
    g = Game(seed=seed, quantum=quantum)
    rng = np.random.default_rng(seed)
    moves, probs = [], []
    for _ in range(plies):
        if g.winner:
            break
        acts = []
        for sq, p in list(g.pieces.items()):
            if p.color != g.turn:
                continue
            o = g.options(sq)
            acts += [("move", sq, t) for t in o["move"] + o["capture"]]
            if len(o["split"]) >= 2:
                acts += [("split", sq, o["split"][0], o["split"][-1])] * 3
            acts += [("merge", sq, s2, ts[0]) for s2, ts in o["merge"].items()] * 3
        a = acts[rng.integers(len(acts))]
        getattr(g, a[0])(*a[1:])
        moves.append([a[0]] + [f"{'abcde'[s % 5]}{s // 5 + 1}" for s in a[1:]])
        probs.append([g.prob(s) for s in range(25)])
    return moves, probs


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_js_engine_matches_qiskit(monkeypatch, tmp_path):
    monkeypatch.setattr(QuantumState, "measure", forced_measure)
    games, expected = [], []
    for seed in range(25):
        moves, probs = play_random(seed, quantum=seed % 5 != 0)
        games.append({"quantum": seed % 5 != 0, "moves": moves})
        expected.append(probs)

    (tmp_path / "games.json").write_text(json.dumps(games))
    (tmp_path / "replay.js").write_text(NODE_SCRIPT)
    run = subprocess.run([NODE, str(tmp_path / "replay.js"), str(ROOT / "web" / "engine.js"),
                          str(tmp_path / "games.json")], capture_output=True, text=True, check=True)
    actual = json.loads(run.stdout)

    n_moves = 0
    for g_exp, g_act in zip(expected, actual):
        assert len(g_exp) == len(g_act)
        for p_exp, p_act in zip(g_exp, g_act):
            assert p_act == pytest.approx(p_exp, abs=1e-9)
            n_moves += 1
    assert n_moves > 500
