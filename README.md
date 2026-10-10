# Project Title

## Project Metadata

* **Project Title:** `Quantum Chess 5×5: Superposition Chess on a Gardner Minichess Board`
* **Team Name:** `Solo — Mohamed Thoufic`
* **Chosen Track:** `Track 1: Quantum Games & Interactive Puzzles`
* **Video Presentation Link:** `[Insert YouTube Unlisted / Google Drive / Loom URL here]`
  *(⚠️ Crucial: Ensure link access is set to "Anyone with the link can view" on Google Drive or "Unlisted / Public" on YouTube. Locked/inaccessible links cannot be scored!)*
* **Live Demo Timestamp in Video:** `[MM:SS]`

### Team Members (Max 4 members)
| Name | Email | GitHub Username |
| :--- | :--- | :--- |
| `Mohamed Thoufic` | `iamthoufic@gmail.com` | `@iamthoufic` |

---

## 1. Project Overview & Motivation

* **Summary (3–4 sentences):**  
  Quantum Chess 5×5 is a two-player chess game on Martin Gardner's 5×5 minichess board in which pieces can be in two places at once. Every square is a qubit, every move is a quantum gate, and every capture is a measurement, all simulated with Qiskit. Players can split a piece across two squares, merge it back through interference, entangle pieces by sliding past a "maybe" piece, and force the board to collapse by capturing. The game runs as an interactive web app backed by the same Qiskit engine that the project notebook demonstrates.

* **Why this problem / game?**  
  Chess is a game everyone understands, which makes it an ideal stage for counter-intuitive quantum behaviour: a knight that is "50% here and 50% there" is instantly understandable, and watching a merge return it to one square with certainty shows interference in a way a coin flip never could. The 5×5 board keeps every piece type while staying small enough (25 squares) to simulate exactly, so each quantum effect in the game is a real Qiskit statevector operation, not a random number.

---

## 2. Quantum Architecture & Mechanics

* **Core Quantum Principles Used:**  
  Superposition (split moves), Interference (merge moves), Entanglement (sliding through a superposed piece), and Measurement Collapse (captures).

* **How the Quantum Circuit is Integrated:**  
  Each square is modelled as a qubit, where |1⟩ means a piece occupies it and |0⟩ means it is empty (following the square-as-qubit model of Cantwell's *Quantum Chess*). Classical pieces need no qubit; only pieces in superposition are tracked, grouped by entanglement into small circuits capped at about 20 qubits. Player moves are translated into gates on those circuits:
  * **Split:** `iSwapGate().power(0.5)` on (source, target 1), then `iSwapGate()` on (source, target 2), giving 50% on each target.
  * **Merge:** the split run in reverse, so the amplitudes interfere back onto one square.
  * **Entangling slide:** an iSWAP controlled on the path square being empty (`ctrl_state=0`), so the slider's position becomes entangled with the blocker's.
  * **Capture:** `Statevector.measure()` on the attacker's and target's squares; the state collapses and the capture succeeds or fizzles.

* **Circuit Details:**  
  * **Number of Qubits:** `Up to 25 (one per square); in practice ≤ 20 live qubits per entangled group`
  * **Key Gates Used:** `X, iSWAP, iSWAP^0.5 and its inverse, controlled iSWAP, Measurement`
  * **Primitives Used:** `qiskit.quantum_info.Statevector, StatevectorSampler`
  * **Other Technologies Used:** `FastAPI (backend API), React + Vite (frontend), pytest (tests)`

```python
from qiskit import QuantumCircuit
from qiskit.circuit.library import iSwapGate
from qiskit.quantum_info import Statevector

def split(qc, src, t1, t2):
    qc.append(iSwapGate().power(0.5), [src, t1])  # half the amplitude to t1
    qc.append(iSwapGate(), [src, t2])             # the rest to t2

qc = QuantumCircuit(3)  # qubits: b1, a3, c3
qc.x(0)                 # knight starts on b1
split(qc, 0, 1, 2)
print(Statevector(qc).probabilities_dict())  # expected: {'010': 0.5, '100': 0.5}
```

---

## 3. Repository Structure & How to Run

### Project Structure
```text
├── README.md               # Project documentation (this file)
├── requirements.txt        # Python dependencies
├── src/
│   ├── qchess/             # Qiskit game engine (board, rules, quantum moves)
│   └── api.py              # FastAPI server exposing the engine to the frontend
├── web/                    # React + Vite frontend
├── tests/                  # Unit tests for rules and quantum moves
├── notebooks/
│   └── solution.ipynb      # Main runnable notebook with outputs
└── references/             # Hackathon reference guides (Track 1 & Track 2)
```

### Installation & Execution Instructions

> 💡 **Environment Recommendation:** To avoid package conflicts, we strongly suggest using a fresh Python virtual environment or Google Colab:
> ```bash
> python -m venv venv
> source venv/bin/activate    # On Windows: venv\Scripts\activate
> pip install -r requirements.txt
> ```

1. **Clone the repository:**
   ```bash
   git clone https://github.com/iamthoufic/quantum-chess.git
   cd quantum-chess
   ```
2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Run the project / demo:**
   ```bash
   # Start the game API:
   uvicorn src.api:app --reload

   # In a second terminal, start the frontend:
   cd web && npm install && npm run dev

   # Or open the Jupyter Notebook:
   jupyter notebook notebooks/solution.ipynb
   ```

---

## 4. Implementation Walkthrough & Live Demo

* **Walkthrough of Gameplay / Optimization Pipeline:**  
  1. The player selects a piece and a move type (Classical, Split or Merge) in the web UI; legal target squares are highlighted.
  2. The frontend sends the move to the FastAPI backend.
  3. The engine checks the move against the 5×5 rules.
  4. The engine appends the matching gates to the Qiskit circuit of the affected piece group and evolves its statevector.
  5. For captures, the engine measures the relevant squares and the state collapses.
  6. The API returns each square's occupation probability and the circuit; the board redraws pieces with opacity matching their probability.

* **Key Screenshots / Terminal Output:**  
  `[To be added once the game is running]`

---

## 5. Classical vs. Quantum Comparison

* **Classical Baseline / Counterpart:**  
  The same engine with quantum moves disabled, which is ordinary 5×5 Gardner minichess.

* **Comparative Analysis:**  
  `[To be added: moves available per turn in classical vs quantum play, and a demonstration that a merge returns a split piece to one square with 100% certainty, which no classical 50/50 randomisation can reproduce.]`

---

## 6. Performance, Results & Limitations

* **Key Results & Observations:**  
  `[To be added after testing and gameplay]`

* **Critical Reflection on Limitations:**  
  * Exact statevector simulation doubles in memory with every qubit, which is why live qubits are capped and the board cannot be one 25-qubit state in an interactive game.
  * On real NISQ hardware, each iSWAP decomposes into 2–3 CNOTs, so gate errors would leak probability into "ghost" pieces on wrong squares and break the certainty of merges.
  * A long game would outlast qubit coherence times, and limited qubit connectivity would add SWAP overhead between distant squares.
  * Rule simplifications (no check, castling or en passant; classical pawns) were made because these rules become ambiguous in superposition.

---

## 7. References & Acknowledgments

* Chris Cantwell, *Quantum Chess: Developing a Mathematical Framework and Design Methodology for Creating Quantum Games*, arXiv:1906.05836 (2019) — the square-as-qubit model and iSWAP-based moves.
* Martin Gardner, 5×5 minichess starting position (1969).
* [Qiskit](https://github.com/Qiskit/qiskit) — circuits and `quantum_info` simulation.
* [FastAPI](https://fastapi.tiangolo.com/) and [React](https://react.dev/) / [Vite](https://vitejs.dev/) — backend and frontend.
* AI assistance (Claude) was used for brainstorming, planning and coding help; all code was reviewed and is understood by the author.
