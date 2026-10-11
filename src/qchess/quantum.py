"""The quantum part of the board: a Qiskit Statevector over the uncertain squares.

Model (after Cantwell's Quantum Chess): every square is a qubit, |1> = "a piece is
here", |0> = "empty". Simulating all 25 squares at once would need 2**25
amplitudes, so only *active* squares get a qubit: squares whose occupancy is
uncertain, plus squares a quantum move is about to touch. A square whose
occupancy becomes certain (probability 0 or 1) is projected out of the
statevector again, so classical play costs no qubits at all.

Everything that changes the quantum state goes through Qiskit:
  * gates are applied with QuantumCircuit + Statevector.evolve
  * measurements use Statevector.measure (Born-rule sampling inside Qiskit)
"""

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import UnitaryGate, XGate, iSwapGate
from qiskit.quantum_info import Operator, Statevector

from .board import name

EPS = 1e-9
MAX_QUBITS = 16  # 2**16 amplitudes: still instant to simulate on a laptop


def _labelled(gate, label):
    """Same unitary, wrapped so circuit drawings show a clean name instead of parameters."""
    return UnitaryGate(Operator(gate), label=label)


# Labels are matplotlib mathtext, so the drawing shows a real radical whose bar
# covers the whole name: the square root OF iSWAP, not "√i" followed by "SWAP".
ISWAP = iSwapGate(label="iSWAP")
ISWAP_DG = _labelled(iSwapGate().inverse(), r"$\mathrm{iSWAP}^{\dagger}$")
SQRT_ISWAP = _labelled(iSwapGate().power(0.5), r"$\sqrt{\mathrm{iSWAP}}$")
SQRT_ISWAP_DG = _labelled(iSwapGate().power(-0.5), r"$\sqrt{\mathrm{iSWAP}}^{\,\dagger}$")


def controlled_iswap(n_controls: int):
    """iSWAP that fires only when all `n_controls` control squares are EMPTY (|0>)."""
    if n_controls == 0:
        return ISWAP
    return iSwapGate(label="iSWAP").control(n_controls, ctrl_state="0" * n_controls)


class QuantumState:
    def __init__(self, seed=None):
        self.active: list[int] = []      # active[k] = square held by qubit k
        self.sv: Statevector | None = None
        self.rng = np.random.default_rng(seed)
        self.trace: list[tuple] = []      # operations of the current turn, for drawing

    # ---------- queries ----------
    def is_active(self, sq: int) -> bool:
        return sq in self.active

    def prob(self, sq: int) -> float:
        """Probability that `sq` is occupied (only meaningful for active squares)."""
        k = self.active.index(sq)
        return float(self.sv.probabilities([k])[1])

    @property
    def num_qubits(self) -> int:
        return len(self.active)

    # ---------- state changes ----------
    def activate(self, sq: int, occupied: bool):
        """Give `sq` a qubit, prepared in |1> if occupied else |0>."""
        if sq in self.active:
            return
        bit = Statevector.from_label("1" if occupied else "0")
        # new qubit becomes the highest index: tensor puts `bit` on the left
        self.sv = bit if self.sv is None else bit.tensor(self.sv)
        self.active.append(sq)
        self.trace.append(("init", sq, occupied))

    def apply(self, gate, squares: list[int]):
        """Apply `gate` to the qubits of `squares` (all must be active)."""
        qc = QuantumCircuit(self.num_qubits)
        qc.append(gate, [self.active.index(s) for s in squares])
        self.sv = self.sv.evolve(qc)
        self.trace.append(("gate", gate, list(squares)))

    def measure(self, sq: int) -> int:
        """Measure one square's qubit with Qiskit; the state collapses. Returns 0 or 1."""
        k = self.active.index(sq)
        self.sv.seed(int(self.rng.integers(2**32)))
        outcome, self.sv = self.sv.measure([k])
        result = int(outcome)
        self.trace.append(("measure", sq, result))
        return result

    def compact(self) -> dict[int, int]:
        """Project out every qubit whose value is now certain.

        Returns {square: 0 or 1} for the squares that left the statevector, so the
        game can update which squares hold pieces.
        """
        settled = {}
        changed = True
        while changed and self.sv is not None:
            changed = False
            for k, sq in enumerate(self.active):
                p1 = float(self.sv.probabilities([k])[1])
                if p1 < EPS or p1 > 1 - EPS:
                    value = int(p1 > 0.5)
                    self._drop(k, value)
                    settled[sq] = value
                    changed = True
                    break
        return settled

    def _drop(self, k: int, value: int):
        n = self.num_qubits
        if n == 1:
            self.sv, self.active = None, []
            return
        # Qiskit is little-endian: qubit k is axis n-1-k of the reshaped tensor
        data = self.sv.data.reshape([2] * n)
        data = np.take(data, value, axis=n - 1 - k).reshape(-1)
        data = data / np.linalg.norm(data)
        self.sv = Statevector(data)
        self.active.pop(k)

    # ---------- drawing ----------
    def take_trace(self):
        trace, self.trace = self.trace, []
        return trace


GATE_NAMES = {id(ISWAP): "iSWAP", id(SQRT_ISWAP): "√iSWAP", id(ISWAP_DG): "iSWAP†", id(SQRT_ISWAP_DG): "√iSWAP†"}


def trace_to_json(trace) -> list[dict]:
    """The same operations as plain data, for the web UI's circuit views."""
    out = []
    for op in trace:
        if op[0] == "init":
            out.append({"op": "init", "sq": name(op[1]), "occupied": bool(op[2])})
        elif op[0] == "measure":
            out.append({"op": "measure", "sq": name(op[1]), "result": int(op[2])})
        else:
            gate, sqs = op[1], op[2]
            n = getattr(gate, "num_ctrl_qubits", 0) or 0
            out.append({"op": "gate", "gate": "iSWAP" if n else GATE_NAMES[id(gate)],
                        "controls": [name(s) for s in sqs[:n]], "squares": [name(s) for s in sqs[n:]]})
    return out


def trace_to_circuit(trace) -> QuantumCircuit | None:
    """Turn one turn's operations into a small circuit with one named qubit per square."""
    if not trace:
        return None
    order = []
    for op in trace:
        sqs = op[2] if op[0] == "gate" else [op[1]]
        for s in sqs:
            if s not in order:
                order.append(s)
    regs = {s: QuantumRegister(1, name(s)) for s in order}
    n_meas = sum(1 for op in trace if op[0] == "measure")
    qc = QuantumCircuit(*regs.values())
    creg = None
    if n_meas:
        creg = ClassicalRegister(n_meas, "m")
        qc.add_register(creg)
    # squares that were already uncertain before this turn start from their
    # existing state, shown as a "ψ" box, rather than from |0>
    inited = {op[1] for op in trace if op[0] == "init"}
    for s in order:
        if s not in inited:
            qc.append(UnitaryGate(np.eye(2), label="ψ"), [regs[s][0]])
    m = 0
    for op in trace:
        if op[0] == "init":
            if op[2]:
                qc.append(XGate(), [regs[op[1]][0]])   # the piece starts here
        elif op[0] == "gate":
            qc.append(op[1], [regs[s][0] for s in op[2]])
        else:
            qc.measure(regs[op[1]][0], creg[m])
            m += 1
    return qc
