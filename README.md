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
  * **Number of Qubits:** `One per square (25), but only uncertain squares are simulated; capped at 16 live qubits (the engine forces a measurement beyond that)`
  * **Key Gates Used:** `X, iSWAP, iSWAP^(1/2), iSWAP^(-1), iSWAP^(-1/2), iSWAP controlled on |0⟩ (open control), Measurement`. Circuit drawings write √iSWAP with a radical whose bar covers the whole name (the square root of the iSWAP gate) and iSWAP† for its inverse, and a key under each circuit explains every box in plain words.
  * **Primitives Used:** `qiskit.quantum_info.Statevector (evolve + measure) in the engine; StatevectorSampler and Qiskit Aer (noise model) in the notebook`
  * **Other Technologies Used:** `FastAPI + Uvicorn (backend API), HTML/CSS/JavaScript (frontend, no build step), Matplotlib (circuit drawings), pytest (tests)`

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
│   └── api.py              # FastAPI server: game API + serves the web UI
├── web/                    # Single-page app: Play, How to play (illustrated manual),
│                           #   Puzzles, Blog (articles with live experiments), Settings
│   ├── engine.js           # In-browser port of the engine, used only when the server is off
│   ├── bot.js              # Computer opponents: exact outcome-weighted search
│   ├── learn.js            # Animated tutorials (split, merge, entanglement, capture)
│   └── puzzles-core.js     # Puzzle positions, exact solver and endless generator
├── docs/index.html         # The whole app bundled into one offline HTML file
├── tools/                  # build_single_page.py (creates docs/index.html)
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
   # Start the game with the Qiskit engine (API + web UI), then open http://127.0.0.1:8000
   uvicorn src.api:app

   # Or open docs/index.html directly in a browser: the same app, offline,
   # running the in-browser port of the engine (no Python needed)

   # Run the tests (includes the Qiskit vs in-browser engine cross-check; needs Node.js):
   pytest tests

   # Rebuild docs/index.html after changing anything in web/:
   python tools/build_single_page.py

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

  The web app is a single page with five parts:
  * **Play**: the board, move list and live circuit. A setup bar chooses the opponent: two players at one board, or one of three computer opponents, **Kitten** (easy), **Heisenberg** (intermediate) and **Deep Dirac** (advanced). The bots search every legal action and value each one as the exact Born-rule-weighted average over its measurement outcomes (depth 0, 1 and 2 plies plus a capture-only look-ahead). With the Qiskit server, a bot thinks on an exact mirror of the game rebuilt from the move log (same measurement results) and its move is then played by Qiskit. **Take back** undoes the last move (your move and the bot's reply) by replaying the game in Qiskit without them; the side you play and the quantum/classical rules are chosen in the same bar.
  * **How to play**: four animated video-style tutorials (split, merge, entanglement, capture), each frame computed by the engine and showing the board, the state |ψ⟩ and the circuit, followed by an illustrated rule manual with 13 board diagrams.
  * **Puzzles**: 10 hand-made positions in three levels (beginner, intermediate, advanced) plus an endless mode that generates new positions from random quantum games. Every answer is graded by an exact solver that enumerates every measurement outcome with its Born-rule probability, so feedback is precise ("this capture wins 25%; the best move wins 50%").
  * **Blog**: articles about the project. Article 01, "Same board, different universe: classical vs quantum 5×5 chess" by Mohamed Thoufic, compares the two games with two experiments that run live in the browser.
  * **Settings**: dark, light or system appearance, four board themes, coordinates, probability readout, move hints, animations, board flip, and the engine choice.

  **Engines:** when served by `uvicorn src.api:app`, every gate and measurement runs in Qiskit and the page shows "⚛ Qiskit". When opened as a plain file (`docs/index.html`), it falls back to `web/engine.js`, a JavaScript port of the same engine, shown as "◐ In-browser engine". `tests/test_js_engine.py` replays 25 random games (850+ moves, including splits, merges, entangling slides and measured captures) through both engines and requires every square's probability to match Qiskit to within 1e-9. The demo in the video uses the Qiskit engine.

* **Key Screenshots / Terminal Output:**  
  `[To be added once the game is running]`

---

## 5. Classical vs. Quantum Comparison

* **Classical Baseline / Counterpart:**  
  The same engine with quantum moves disabled, which is ordinary 5×5 Gardner minichess.

* **Comparative Analysis:**  
  * **Branching factor:** over 40 random games, a player has on average **21.1** actions per turn in quantum chess vs **13.5** in the classical baseline (notebook section 6), so the quantum moves genuinely enlarge the strategy space.
  * **Interference has no classical counterpart:** after a split, the quantum merge returns the knight to b1 with probability **1.0**; a classical 50/50 mixture pushed through the same gates only gets back with probability **0.5** (notebook section 2).
  * **Measurement creates real risk:** in 20 simulated captures of a 50/50 knight, the knight was taken 8 times and escaped 12 times; outcomes are sampled by Qiskit's statevector measurement, not by a classical random number generator.

---

## 6. Performance, Results & Limitations

* **Key Results & Observations:**  
  * All four quantum mechanics (split, merge, entangling slide, measured capture) run on Qiskit statevectors and are covered by 23 automated tests, including a check over random games that every piece's probabilities always sum to 1, a cross-check that the in-browser engine reproduces Qiskit's probabilities, a check that every puzzle's intended answer is the one the exact solver accepts, and a rules audit: classical move generation matches an independent 5×5 move generator in 10,000+ positions, more than 10,000 random quantum moves keep every rule invariant (probabilities sum to 1, pawns never split, promotion, king capture), every move the engine refuses leaves the game unchanged, every bot move is legal with the stronger bots beating the weakest, and taking back a move restores the exact position.
  * In a stress test of 150 random quantum-heavy games (about 10,000 moves), no move took longer than 0.5 s and the statevector never exceeded the 16-qubit cap.
  * With a depolarizing noise model on Qiskit Aer, the split-then-merge round trip (8 CNOTs after transpiling) brings the knight back with probability 1.000 noiseless, 0.847 at 0.5% gate error, 0.724 at 1% and 0.531 at 2% (notebook section 7).

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
* [FastAPI](https://fastapi.tiangolo.com/) — backend API.
* Chess piece images: "cburnett" set by Colin M.L. Burnett, from the [lichess.org repository](https://github.com/lichess-org/lila), licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
* Board colours and layout inspired by the look of popular online chess sites; all UI code is original.
* AI assistance (Claude) was used for brainstorming, planning and coding help; all code was reviewed and is understood by the author.
