import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from qiskit import QuantumCircuit  # noqa: E402
from qiskit.quantum_info import Statevector  # noqa: E402

from qchess import Game, IllegalMove, parse  # noqa: E402
from qchess.board import KING, QUEEN, Piece  # noqa: E402
from qchess.quantum import ISWAP, ISWAP_DG, SQRT_ISWAP, SQRT_ISWAP_DG  # noqa: E402

S = parse


def empty_game(pieces, seed=0, turn="w"):
    """A game with only the given {square_name: (color, kind)} pieces."""
    g = Game(seed=seed)
    g.pieces = {S(sq): Piece(f"{c}{k}{sq}", c, k) for sq, (c, k) in pieces.items()}
    g.turn = turn
    return g


# ---------------------------------------------------------------- gates
def test_split_circuit_gives_fifty_fifty():
    qc = QuantumCircuit(3)
    qc.x(0)
    qc.append(SQRT_ISWAP, [0, 1])
    qc.append(ISWAP, [0, 2])
    probs = Statevector(qc).probabilities_dict()
    assert probs == pytest.approx({"010": 0.5, "100": 0.5})


def test_merge_is_exact_inverse_of_split():
    qc = QuantumCircuit(3)
    qc.x(0)
    qc.append(SQRT_ISWAP, [0, 1])
    qc.append(ISWAP, [0, 2])
    qc.append(ISWAP_DG, [0, 2])
    qc.append(SQRT_ISWAP_DG, [0, 1])
    assert Statevector(qc).probabilities_dict() == pytest.approx({"001": 1.0})


# ---------------------------------------------------------------- setup
def test_starting_position():
    g = Game()
    assert len(g.pieces) == 20
    assert g.pieces[S("e1")].kind == KING and g.pieces[S("d5")].kind == QUEEN
    assert g.q.num_qubits == 0


def test_classical_moves_use_no_qubits():
    g = Game()
    g.move(S("b1"), S("c3"))         # knight jump
    g.move(S("a4"), S("a3"))         # black pawn push
    assert g.q.num_qubits == 0
    assert g.pieces[S("c3")].kind == "N"


# ---------------------------------------------------------------- split / merge
def test_split_then_merge_returns_piece_with_certainty():
    g = Game(seed=1)
    g.split(S("b1"), S("a3"), S("c3"))
    assert g.prob(S("a3")) == pytest.approx(0.5)
    assert g.prob(S("c3")) == pytest.approx(0.5)
    assert S("b1") not in g.pieces
    g.move(S("e4"), S("e3"))         # black passes the time
    g.merge(S("a3"), S("c3"), S("b1"))
    assert g.prob(S("b1")) == pytest.approx(1.0)
    assert S("a3") not in g.pieces and S("c3") not in g.pieces
    assert g.q.num_qubits == 0


def test_pawns_cannot_split():
    g = Game()
    assert g.options(S("a2"))["split"] == []


def test_split_needs_two_distinct_empty_targets():
    g = Game()
    with pytest.raises(IllegalMove):
        g.split(S("b1"), S("c3"), S("c3"))
    with pytest.raises(IllegalMove):
        g.split(S("b1"), S("d2"), S("c3"))   # d2 has a pawn


# ---------------------------------------------------------------- entanglement
def test_slide_past_maybe_piece_entangles():
    g = empty_game({"a1": ("w", "R"), "e1": ("w", "K"), "c3": ("b", "N"), "e5": ("b", "K")},
                   turn="b")
    g.split(S("c3"), S("a2"), S("b5"))       # knight 50% on a2 (in the rook's file)
    g.move(S("a1"), S("a4"))                  # rook slides past the "maybe" knight
    assert g.prob(S("a4")) == pytest.approx(0.5)
    assert g.prob(S("a1")) == pytest.approx(0.5)
    # rook on a4 exactly when the knight is not on a2: perfectly anti-correlated
    sv = g.q.sv
    ka, ra = g.q.active.index(S("a2")), g.q.active.index(S("a4"))
    probs = sv.probabilities([ka, ra])          # index = knight_bit + 2 * rook_bit
    assert probs[0] == pytest.approx(0) and probs[3] == pytest.approx(0)
    assert probs[1] == pytest.approx(0.5) and probs[2] == pytest.approx(0.5)


# ---------------------------------------------------------------- measurement
def test_capture_of_maybe_piece_measures_it():
    outcomes = set()
    for seed in range(20):
        g = empty_game({"a1": ("w", "R"), "e1": ("w", "K"), "c3": ("b", "N"), "e5": ("b", "K")},
                       seed=seed, turn="b")
        g.split(S("c3"), S("a2"), S("b5"))
        g.move(S("a1"), S("a2"))              # rook attacks the 50% knight
        assert g.q.num_qubits == 0            # everything collapsed
        assert g.pieces[S("a2")].kind == "R"
        knight_alive = S("b5") in g.pieces
        outcomes.add(knight_alive)
        assert g.log[-1]["ok"]
    assert outcomes == {True, False}          # both branches really happen


def test_capturing_king_wins():
    g = empty_game({"a1": ("w", "R"), "e1": ("w", "K"), "a5": ("b", "K")})
    g.move(S("a1"), S("a5"))
    assert g.winner == "w"
    with pytest.raises(IllegalMove):
        g.move(S("e1"), S("e2"))


def test_probabilities_always_sum_per_piece():
    rng = np.random.default_rng(3)
    for seed in range(15):
        g = Game(seed=seed)
        for _ in range(40):
            if g.winner:
                break
            moves = []
            for sq, p in list(g.pieces.items()):
                if p.color != g.turn:
                    continue
                o = g.options(sq)
                moves += [("move", sq, t) for t in o["move"] + o["capture"]]
                if len(o["split"]) >= 2:
                    moves.append(("split", sq, o["split"][0], o["split"][1]))
                for s2, ts in o["merge"].items():
                    moves.append(("merge", sq, s2, ts[0]))
            m = moves[rng.integers(len(moves))]
            if m[0] == "move":
                g.move(m[1], m[2])
            elif m[0] == "split":
                g.split(m[1], m[2], m[3])
            else:
                g.merge(m[1], m[2], m[3])
            # each piece's total probability over its squares is 1
            totals = {}
            for sq, p in g.pieces.items():
                totals[p.pid] = totals.get(p.pid, 0) + g.prob(sq)
            for pid, t in totals.items():
                assert t == pytest.approx(1.0, abs=1e-6), (seed, pid, t)
            assert g.q.num_qubits <= 16


def test_classical_baseline_has_no_quantum_moves():
    g = Game(quantum=False)
    assert g.options(S("b1"))["split"] == []
