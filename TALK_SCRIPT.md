# Quantum Chess 5×5 — 20-minute talk script

Timing plan (total 20:00)

| # | Slide | Time |
|---|-------|------|
| 1 | Title | 0:30 |
| 2 | Agenda | 0:30 |
| 3 | Why a quantum game, why chess | 0:45 |
| 4 | A qubit is a square | 1:15 |
| 5 | Four effects, four moves | 1:15 |
| 6 | Inspirations | 0:30 |
| 7 | The rule set | 1:15 |
| 8 | Every square is a qubit | 0:45 |
| 9 | Split | 1:30 |
| 10 | Merge | 1:30 |
| 11 | Entanglement | 1:15 |
| 12 | Capture | 1:15 |
| 13 | Tech stack | 0:45 |
| 14 | Demo: Play | 1:30 |
| 15 | Demo: Bots | 1:00 |
| 16 | Demo: Puzzles and manual | 1:00 |
| 17 | Classical vs quantum | 1:15 |
| 18 | NISQ limitations | 1:15 |
| 19 | Tests | 0:30 |
| 20 | Try it | 0:30 |

---

## Slide 1 · Title (0:30)

Hello everyone. I'm Mohamed Thoufic, and this is my solo entry for Track 1, Quantum Games. The project is called Quantum Chess 5×5.

The whole idea fits in one sentence, and it's on the slide: every square is a qubit, every move is a gate, and every capture is a measurement. The picture on the right is the move that makes this game different from chess: a knight that has gone to two squares at once. For the next twenty minutes I'll show you what that means, how it's built in Qiskit, and what happens when you actually play it.

## Slide 2 · Agenda (0:30)

Four parts. First, the basics: superposition, interference, entanglement and measurement, but explained on chess squares rather than on a blackboard. Second, the game itself: where it comes from, the rules, and the four quantum moves written as Qiskit gates. Third, under the hood: the engine, the API, and a tour of the app. And fourth, results: how the quantum game differs from the classical one in numbers, what real hardware would do to it, and how it's tested.

## Slide 3 · Why a quantum game, and why chess? (0:45)

The Track 1 brief is strict in one way: quantum has to be the mechanic, not the theme. If you take a normal game, replace the dice with a random number generator and call it quantum, that doesn't count. The circuits have to drive the state.

So why chess? Because everyone already knows the board. If I tell you a knight is fifty percent here and fifty percent there, you don't need a physics lecture. And when I merge it back and it returns to one square with certainty, you're watching interference, which a coin flip can never show you.

And why 5×5? Gardner's minichess board keeps every piece type but has only 25 squares. That's small enough to simulate exactly, so every effect in the game is a real statevector operation, not a dice roll dressed up as physics.

## Slide 4 · A qubit is a square that can be empty, occupied, or both (1:15)

Let's start with the one concept everything rests on. In this game a qubit is a square.

State zero means empty: look at the square, you always find nothing. State one means occupied: look, and you always find the piece. Those two are just classical bits.

The third box is the new thing. A square can be in a superposition: alpha times empty plus beta times occupied. Alpha and beta are complex numbers called amplitudes. When you look, you get "occupied" with probability beta squared. That's the Born rule. If alpha squared and beta squared are both one half, the square is a true fifty-fifty.

Now the line at the bottom, which is the most important sentence in the talk. A probability is always positive. An amplitude is not: it carries a sign and a phase. So two paths to the same square can add up, or they can cancel each other out. That single fact is what makes the next slide's effects possible, and it's what separates quantum from random.

## Slide 5 · Four quantum effects, and the chess move each one becomes (1:15)

Here's the entire design of the game on one slide. There are four quantum effects, and each one becomes exactly one chess move.

Superposition becomes Split: one piece goes to two squares, half the amplitude on each, and nothing is decided yet.

Interference becomes Merge: run the split backwards, the two amplitudes add up on one square and cancel on the other, and certainty is restored.

Entanglement becomes sliding past a "maybe" piece: if a rook slides through a square that might hold an enemy, the two pieces' fates get linked. If the blocker turns out to be there, the rook was stopped. If not, it got through.

And measurement becomes Capture: looking forces one answer, the board collapses to a definite position, and the capture either lands or fizzles.

If you remember one slide from this talk, remember this one. Everything else is detail about how these four are implemented.

## Slide 6 · Built on three shoulders (0:30)

Three sources. Chris Cantwell's 2019 Quantum Chess paper gives the square-as-qubit model and the iSWAP-based moves; I borrowed that framework and shrank it to a board I can simulate exactly. Martin Gardner's 1969 minichess gives the 5×5 starting position with every piece type. And Qiskit 2.5 is the rules engine: QuantumCircuit and Statevector run every gate and every measurement in the game, and the sampler and Aer noise model power the notebook experiments. The piece images are the cburnett set from lichess, and all UI code is original.

## Slide 7 · The whole rule set fits on one slide (1:15)

Here are all the rules. It's Gardner's layout: rook, knight, bishop, queen, king and five pawns per side.

On your turn you take exactly one action: a classical move, a split, or a merge. A split sends any non-pawn piece onto two empty squares, fifty percent each. A merge brings a split piece back onto one square with certainty. Captures measure the squares involved, and the capture either lands or fizzles.

You win in quantum mode by capturing the king. The classical mode, which is the baseline for comparison, has real check, checkmate and stalemate.

What's left out: castling, en passant, check in superposition, and pawns stay classical. The box on the right explains why. The moment a king or a pawn might be on two squares, "is the king in check" has no single answer. Dropping those rules keeps every rule well defined for any superposition the engine can reach. That was a deliberate trade: a smaller rule set that's always consistent, rather than a bigger one with holes.

## Slide 8 · Every square is a qubit (0:45)

Now under the hood. Every square is a qubit: one means a piece is there, zero means empty.

Three numbers. There are 25 squares, so at most 25 qubits, but we never simulate all of them at once. A classical piece needs no qubit at all. Only uncertain squares are simulated, and the moment a square becomes certain again, its qubit is projected out. So classical play costs nothing.

The cap is 16 live qubits. If a move would push past that, the engine forces a measurement of the oldest uncertain square to make room. And there's one statevector, evolved and measured by Qiskit.

## Slide 9 · Split: one knight, two squares (1:30)

Let's look at the gates. The knight on b1 splits to a3 and c3. We need three qubits, one per square.

The X gate puts the knight on b1. Then the square root of iSWAP between b1 and a3 moves half the amplitude from b1 to a3. Then a full iSWAP between b1 and c3 moves everything that's left on b1 over to c3. Two gates, that's the whole move.

The probabilities dictionary on the left is what Qiskit returns: the state 010 and the state 100, each at one half. In square terms, fifty percent on a3, fifty percent on c3, and b1 is empty with certainty, so its qubit gets dropped.

Why iSWAP? Because it moves the "occupied" excitation from one qubit to another without ever creating or destroying one. A piece can never duplicate or vanish by accident. Piece count is conserved by construction.

The circuit on the right isn't an illustration. It's what the app draws after the move, straight from Qiskit's circuit drawer.

## Slide 10 · Merge: the split run backwards (1:30)

The merge is the split in reverse. Apply the inverse of iSWAP, then the inverse of the square root of iSWAP, in the opposite order. The two amplitudes travel back toward b1. They add up on b1 and cancel everywhere else.

The two numbers on the left are the heart of this project. The quantum merge puts the knight back on b1 with probability one point zero. Now take a classical fifty-fifty mixture, a knight that is genuinely on one of the two squares and we just don't know which, and push it through the same gates. It only gets back half the time.

That difference is interference. It has no classical counterpart, and it's the reason this is a quantum game rather than a random one. Notebook section 2 reproduces this exactly.

One subtlety I like: the merge is not an undo button. It only reassembles the piece because the phases from the split still line up. If one half wanders around the board first, every move adds a phase, and the merge can land only partially. The engine doesn't cheat. It applies the same gates and lets the physics decide.

## Slide 11 · Sliding past a "maybe" piece entangles the two (1:15)

The third move. A rook slides along a line, and one square on that line is half-occupied by a split piece.

The engine applies an iSWAP that is controlled on the path square being empty. In Qiskit that's a control with ctrl_state zero, an open control. So the rook moves only in the branch of the state where the path is clear.

Look at the four joint outcomes on the right. Blocker present and rook stayed home: fifty percent. Blocker absent and rook got through: fifty percent. The other two combinations are exactly zero. Blocker present and rook through can't happen. Blocker absent and rook stayed can't happen either.

Neither piece has been measured. But their answers are now correlated. That's entanglement. Measure the blocker later, say by capturing it, and the rook's position is instantly settled too, and the other way round. Notebook section 3 shows the joint probabilities.

## Slide 12 · A capture is a measurement (1:15)

The last move, and the only one that removes pieces from the board.

To capture, the engine measures the attacker's square and the target's square using Statevector dot measure. That's Born-rule sampling done inside Qiskit. The state collapses to whatever outcome was sampled, and only then does the classical capture happen.

The order matters. First the attacker: if it was only maybe there and turns out absent, the capture fizzles. Then any maybe-pieces on the path. Then the target. If the target is found, the capture lands and the piece is gone. If the target turns out to be elsewhere, the capture fizzles, but now the board is certain about that piece. Either way the player has spent a turn to learn something, which is a real strategic cost.

The panel on the right: twenty simulated captures of a fifty-fifty knight. Eight times the knight was taken, twelve times it escaped. Every one of those outcomes was sampled by Qiskit's statevector measurement, never by a classical random number generator.

## Slide 13 · One Qiskit engine, served two ways (0:45)

The stack. The Python engine in src/qchess holds the board, the rules and the quantum moves, using one circuit per entangled group and a Statevector to evolve and measure. A FastAPI server exposes it: new game, options, play, undo, and a circuit SVG for every past move. The front end is a single-page app in plain HTML, CSS and JavaScript, no build step.

Three supporting pieces. An in-browser JavaScript port of the engine runs the offline one-file build, and it's cross-checked against Qiskit to one part in a billion over 850 replayed moves. The notebook imports the same engine, with the sampler for shots and Aer for noise. And 23 pytest tests cover rules, puzzles, bots and the JavaScript-versus-Qiskit replay.

## Slide 14 · Demo, Play (1:30)

[Switch to the live app if you can; otherwise narrate the screenshot.]

This is the Play tab. Two players at one board. The badge in the top right says Qiskit 2.5.2, which means the Python engine is live behind this page.

I've played one move: knight b1 split to a3 and c3. Both squares show a fifty percent badge, and that number comes straight from Qiskit's probabilities, not from the UI guessing.

Move, Split and Merge are one keypress each, and legal targets light up when you pick a piece. The circuit panel on the right draws the gates the engine just ran, the X, the square root of iSWAP and the iSWAP you saw on slide 9. There's an "Explained" toggle that describes each box in plain words for newcomers.

And you can click any move in the move list to review that position together with its circuit, so the whole game is a readable history of quantum operations.

## Slide 15 · Three opponents that reason about measurement odds (1:00)

The Bots tab gives you three computer opponents.

Kitten is easy: weighted random, likes captures, never hangs its king outright. Heisenberg does a one-ply search over every legal action, and values each action as the exact Born-rule average over all of its measurement outcomes. No sampling, every branch weighted by its true probability. Deep Dirac searches two plies plus a capture-only look-ahead, and it uses splits to hedge.

How it works with the server: the bot thinks on an exact mirror of the game rebuilt from the move log, with the same measurement results, and then its chosen move is played by Qiskit. Take back replays the game without the last pair of moves, which is possible because every measurement outcome is logged.

## Slide 16 · Learning the game inside the game (1:00)

Two more tabs. Puzzles has 16 hand-made positions in three levels, six of them played as Black, plus an endless mode that generates fresh positions from random quantum games. The grader is an exact solver that enumerates every measurement outcome, so the feedback is precise: "this capture wins 25 percent of the time; the best move wins 50 percent."

How to play has four animated lessons, one per quantum move. Every frame is computed by the engine, so the board, the state vector and the circuit you see are the real ones, not drawings. Below that is a 13-diagram rule manual.

## Slide 17 · Same board, different universe (1:15)

Now the results. The baseline is the same engine with quantum moves switched off, so every row compares like with like.

Branching factor: over 40 random games, a player has about 11 actions per turn in classical 5×5 and about 21 in quantum. The quantum moves genuinely double the strategy space.

The merge: a knight comes home after split-then-merge with probability one in the quantum game, and one half in a classical mixture. That's interference.

Attacking a piece that's fifty percent on the target: classically it either always lands or never applies. In the quantum game it's measured, and we saw 8 taken and 12 escaped in 20 tries.

Correlations between two unmeasured pieces: none classically; entangled in the quantum game, with two of the four joint outcomes at zero.

And the game ends by checkmate or stalemate in one, and by king capture in the other. All figures are from the executed notebook, sections 2 to 6.

## Slide 18 · What real NISQ hardware would do to this game (1:15)

I also asked what happens off the simulator. I ran the split-then-merge round trip under a depolarizing noise model in Qiskit Aer. After transpiling, the round trip is 8 CNOTs.

With no noise the knight returns with probability one. At half a percent two-qubit gate error it's 0.85. At one percent, 0.72. At two percent, 0.53, barely better than a coin flip. So the "certain" merge, which is the signature effect of the game, is exactly the thing noise destroys first.

Three more limits. Memory doubles with every qubit, which is why live qubits are capped at 16 and the board is never one 25-qubit state. Ghost pieces: each iSWAP becomes two or three CNOTs on hardware, and gate errors leak probability onto wrong squares. And coherence and connectivity: a long game outlasts qubit coherence, and distant squares need SWAP overhead on a sparse coupling map. Notebook section 7.

## Slide 19 · Tested like a chess engine, checked like a physics model (0:30)

Rigor in six numbers. 23 automated tests. The in-browser engine must match Qiskit to one part in a billion across 850 replayed moves. Classical move generation agrees with an independent 5×5 generator in over ten thousand positions. Every piece's probabilities sum to one after ten thousand random quantum moves, pawns never split, and a refused move changes nothing. The slowest move in 150 quantum-heavy games took under half a second and the 16-qubit cap was never hit. And all 16 puzzles have the answer the exact solver accepts.

## Slide 20 · Play a game where the board is a statevector (0:30)

Three commands to run it: clone, pip install, uvicorn. Or open docs/index.html for the offline build, and the notebook for the experiments.

What comes next: run the split-then-merge on real IBM hardware through Qiskit Runtime and compare with the Aer curve; quantum pawns and a well-defined notion of check in superposition; and deeper bots using the same exact outcome enumeration.

Thank you. The repo is github.com/iamthoufic/quantum-chess, built in the 24-hour window with Qiskit 2.5. Happy to take questions.
