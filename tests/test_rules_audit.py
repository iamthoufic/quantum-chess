"""Audit of the chess rules.

1. Classical moves are checked against an independent, deliberately simple
   5x5 move generator written here from the rules, over many random games.
2. Quantum games are checked for invariants after every move: probabilities,
   pawns, promotion, king capture, legality of offered and refused moves.
"""

import copy
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from qchess import Game, IllegalMove  # noqa: E402
from qchess.quantum import MAX_QUBITS  # noqa: E402

DIRS = {
    "R": [(1, 0), (-1, 0), (0, 1), (0, -1)],
    "B": [(1, 1), (1, -1), (-1, 1), (-1, -1)],
}
DIRS["Q"] = DIRS["R"] + DIRS["B"]
KNIGHT = [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]
KING = DIRS["Q"]


def reference_moves(board, sq):
    """Legal destinations for the piece on sq, from the rules alone. board: sq -> (color, kind)."""
    color, kind = board[sq]
    f0, r0 = sq % 5, sq // 5
    inside = lambda f, r: 0 <= f < 5 and 0 <= r < 5
    out = set()
    if kind == "P":
        step = 1 if color == "w" else -1
        f, r = f0, r0 + step
        if inside(f, r) and (r * 5 + f) not in board:
            out.add(r * 5 + f)
        for df in (-1, 1):
            if inside(f0 + df, r) and board.get(r * 5 + f0 + df, (color,))[0] != color:
                out.add(r * 5 + f0 + df)
        return out
    if kind in ("N", "K"):
        for df, dr in (KNIGHT if kind == "N" else KING):
            f, r = f0 + df, r0 + dr
            if inside(f, r) and board.get(r * 5 + f, (None,))[0] != color:
                out.add(r * 5 + f)
        return out
    for df, dr in DIRS[kind]:
        f, r = f0 + df, r0 + dr
        while inside(f, r):
            t = r * 5 + f
            if t in board:
                if board[t][0] != color:
                    out.add(t)
                break
            out.add(t)
            f, r = f + df, r + dr
    return out


def test_classical_moves_match_an_independent_generator():
    checked = 0
    for seed in range(300):
        g = Game(seed=seed, quantum=False)
        rng = np.random.default_rng(seed)
        for _ in range(80):
            if g.winner:
                break
            board = {s: (p.color, p.kind) for s, p in g.pieces.items()}
            legal = []
            for sq, p in list(g.pieces.items()):
                if p.color != g.turn:
                    continue
                o = g.options(sq)
                engine = set(o["move"]) | set(o["capture"])
                assert engine == reference_moves(board, sq), (seed, g.ply, sq)
                legal += [(sq, t) for t in engine]
                checked += 1
            src, dst = legal[rng.integers(len(legal))]
            g.move(src, dst)
            assert g.q.num_qubits == 0                      # classical play never needs a qubit
    assert checked > 10000


def random_action(g, rng):
    acts = []
    for sq, p in list(g.pieces.items()):
        if p.color != g.turn:
            continue
        o = g.options(sq)
        acts += [("move", sq, t) for t in o["move"] + o["capture"]]
        if len(o["split"]) >= 2:
            acts += [("split", sq, o["split"][0], o["split"][-1])] * 3
        acts += [("merge", sq, s2, ts[0]) for s2, ts in o["merge"].items()] * 3
    return acts[rng.integers(len(acts))]


def check_invariants(g, before_count):
    totals = {}
    for sq, p in g.pieces.items():
        pr = g.prob(sq)
        assert 0 < pr <= 1 + 1e-9
        totals[p.pid] = totals.get(p.pid, 0) + pr
        if p.kind == "P":
            assert pr > 1 - 1e-9, "a pawn is in superposition"
            assert sq // 5 not in (0, 4), "a pawn stands on a promotion rank"
    for pid, t in totals.items():
        assert t == pytest.approx(1, abs=1e-6), pid
    kings = {p.color for p in g.pieces.values() if p.kind == "K"}
    if g.winner in ("w", "b"):
        loser = "b" if g.winner == "w" else "w"
        assert loser not in kings and g.winner in kings
    else:
        assert kings == {"w", "b"}, "a king vanished without a winner"
    assert len(totals) <= before_count
    assert g.q.num_qubits <= MAX_QUBITS


def test_quantum_games_keep_every_rule_invariant():
    rng_moves = 0
    for seed in range(200):
        g = Game(seed=seed)
        rng = np.random.default_rng(1000 + seed)
        for _ in range(120):
            if g.winner:
                break
            before = len({p.pid for p in g.pieces.values()})
            a = random_action(g, rng)
            getattr(g, a[0])(*a[1:])
            check_invariants(g, before)
            rng_moves += 1
    assert rng_moves > 10000


def test_refused_moves_change_nothing():
    """Moves the engine does not offer must raise IllegalMove and leave the game untouched."""
    refused = 0
    for seed in range(60):
        g = Game(seed=seed)
        rng = np.random.default_rng(seed)
        for _ in range(40):
            if g.winner:
                break
            for sq, p in list(g.pieces.items()):
                if p.color != g.turn:
                    continue
                o = g.options(sq)
                offered = set(o["move"]) | set(o["capture"])
                for t in range(25):
                    if t in offered or t == sq:
                        continue
                    snap = (dict(g.pieces), g.turn, g.ply, g.q.num_qubits)
                    with pytest.raises(IllegalMove):
                        g.move(sq, t)
                    assert snap == (dict(g.pieces), g.turn, g.ply, g.q.num_qubits)
                    refused += 1
                    break
            a = random_action(g, rng)
            getattr(g, a[0])(*a[1:])
    assert refused > 500


def test_wrong_side_and_finished_game_are_refused():
    g = Game()
    with pytest.raises(IllegalMove):
        g.move(20, 15)            # black pawn a5... a4 is black's, it's white's turn
    with pytest.raises(IllegalMove):
        g.split(1, 10, 11)        # b1 knight cannot reach b3
    g2 = copy.deepcopy(g)
    g2.winner = "w"
    with pytest.raises(IllegalMove):
        g2.move(5, 10)


def bare_game(pieces, turn="w"):
    from qchess.board import Piece
    g = Game(seed=0)
    g.pieces = {sq: Piece(f"{c}{k}{sq}", c, k) for sq, (c, k) in pieces.items()}
    g.turn = turn
    return g


def test_draw_when_only_kings_remain():
    # white king a1, black king e5, black knight b3 next to... white king takes it, leaving bare kings
    g = bare_game({0: ("w", "K"), 24: ("b", "K"), 6: ("b", "N")})
    g.move(0, 6)
    assert g.winner == "draw" and "kings" in g.end_reason


def test_fifty_move_rule():
    g = bare_game({0: ("w", "K"), 24: ("b", "K"), 2: ("w", "R")})
    shuffle = [(2, 3), (24, 23), (3, 2), (23, 24)]
    for i in range(100):
        assert g.winner is None
        g.move(*shuffle[i % 4])
    assert g.winner == "draw" and "50 moves" in g.end_reason


def test_capture_resets_the_fifty_move_clock():
    g = bare_game({0: ("w", "K"), 24: ("b", "K"), 2: ("w", "R"), 14: ("b", "P")})
    g.move(2, 4)          # rook c1 -> e1
    g.move(24, 23)
    assert g.quiet_plies == 2
    g.move(4, 14)         # rook takes the pawn on e3
    assert g.quiet_plies == 0
