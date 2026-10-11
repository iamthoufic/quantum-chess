# Presenter notes: Quantum Chess 5×5

Deck: https://claude.ai/artifact/EqrxiQwk6JwXQG6Pv43Xs6
Target length: 10 minutes total, with 3 to 4 minutes of live demo (slides 14 to 16).

Suggested timing
- Slides 1 to 3 (intro): 1 min
- Slides 4 to 5 (basics): 1.5 min
- Slides 6 to 8 (inspirations, rules, model): 1 min
- Slides 9 to 12 (the four moves): 2 min
- Slides 13 to 16 (stack and live demo): 3.5 min
- Slides 17 to 20 (results, limits, close): 1 min

The one sentence to repeat three times (cover, slide 8, close):
"Every square is a qubit, every move is a gate, every capture is a measurement."

---

## 1. Cover (20 s)

Say who you are, the track, and the sentence above. Then: "Everything you are about to see is in the repo and runs on Qiskit 2.5. Nothing in this talk is a mock-up."

## 2. Agenda (15 s)

"Four parts: the quantum ideas a chess player needs, the game built from them, how it is engineered, and what the numbers say, including what would break on real hardware."

## 3. Why a quantum game, why chess (40 s)

Explain the brief in your own words: "Track 1 is not about a quantum theme. The circuit has to decide what happens on the board. If I replaced Qiskit with a dice roll, I would be disqualified, and rightly so."

Then the two reasons for chess:
- Familiarity: "Nobody needs me to explain what a knight is. So all of their attention goes to the one new thing: the knight can be on two squares."
- Exactness: "25 squares means I can simulate the state exactly. I am never approximating. Every percentage on the board is computed, not estimated."

## 4. Basics 1: the qubit (45 s)

Goal: the audience should leave with "a qubit is a square, and the square can be undecided".

Script:
- "A classical square is a light switch: on means a piece is there, off means empty."
- "A qubit is a switch that can be in a blend of on and off. But here is the catch: the moment you look, you only ever see on or off. The blend tells you the odds."
- Point at the third card: "α and β are the amplitudes. Square them and you get the probability. With equal amplitudes you get a true 50/50."

The key line, say it slowly: "Amplitudes are not probabilities. They have a sign, a direction. Two amplitudes can point opposite ways and cancel. Probabilities can never cancel; they only add. That one difference is the whole reason this game is quantum rather than random."

If you want an analogy: noise-cancelling headphones. Two sounds, each loud on its own, cancel to silence when their waves are opposite. Probabilities can't do that; amplitudes can.

## 5. Basics 2: the four effects (45 s)

Walk the four rows, one sentence each, always ending with the chess move:
- Superposition: "A piece that is genuinely on two squares. Not 'I don't know where it is'; it has not decided. In the game: Split."
- Interference: "Amplitudes adding up here and cancelling there. In the game: Merge, which brings a split piece back with certainty."
- Entanglement: "Two pieces whose answers are linked, even though neither has been looked at. In the game: sliding a rook past a square that is maybe occupied."
- Measurement: "Looking forces the universe to pick. In the game: a capture."

"The next seven slides are these four rows, with the actual gates."

## 6. Inspirations (30 s)

Be clear about what is borrowed and what is yours. Judges reward honesty and originality.
- "The square-as-qubit model and the iSWAP moves come from Chris Cantwell's Quantum Chess paper. I did not invent the physics."
- "The 5×5 board is Martin Gardner's minichess from 1969."
- "What is new: the 5×5 adaptation, exact simulation with a live qubit cap, the exact puzzle solver, the bots, the in-browser port, and the whole app."

## 7. Rules (30 s)

Don't read the table. Say: "Three actions per turn: a normal move, a split, a merge. Captures measure. Capture the king to win."

Then the justification for what is missing, because a judge will ask: "I dropped check, castling and en passant. 'Is the king in check?' has no clean answer when the king is 50% on e1 and 50% on d2. Rather than invent an arbitrary rule, I kept the rule set to things that are well-defined for every state the engine can reach. Classical mode still has real check and checkmate."

## 8. Every square is a qubit (30 s)

This is the engineering idea judges should remember.
- "25 squares would be 25 qubits, which is 2 to the 25, about 33 million amplitudes. Too slow for a game."
- "But a piece that has not been split does not need a qubit at all. Only uncertain squares are simulated, and they are grouped by entanglement. A split knight is a 3-qubit circuit: 8 amplitudes."
- "I cap live qubits at 16. If a move would exceed that, the engine forces a measurement first. In testing it never happened."

## 9. Split (45 s)

Walk the code literally, it is only two lines:
- "√iSWAP on b1 and a3. An iSWAP swaps two qubits and adds a phase. The square root of it does half a swap, so half the amplitude moves to a3."
- "Then a full iSWAP on b1 and c3 moves whatever is left to c3."
- "Qiskit then tells me the probabilities: 0.5 and 0.5. Those numbers are exactly the 50% badges on the board."

Point at the circuit image: "This drawing is Qiskit's own circuit drawer; the app shows it after every quantum move."

## 10. Merge (60 s, the most important slide)

Slow down here. This is the slide that proves it is quantum.
- "A merge is the split run backwards: inverse iSWAP, then inverse √iSWAP."
- "The amplitude on a3 and the amplitude on c3 travel back to b1. They add up on b1 and cancel everywhere else. The knight comes home with probability 1.0."
- Now the contrast: "Imagine I had cheated and used a random number. After the split, the knight would be on a3 or c3, I just would not know which. Push that through the same gates and it comes home only half the time. 0.5 versus 1.0."
- "So the merge is a test the audience can run. A coin flip cannot be un-flipped. A quantum split can be un-split, because the engine kept the phases."

Analogy if needed: "It is the difference between a shuffled deck, where the card is somewhere and you don't know where, and a wave, which really is spread out and can be refocused."

## 11. Entangling slide (45 s)

- Set the scene: "A rook wants to slide along a file, and halfway along there is a square where a split bishop is 50% present."
- The gate: "I apply the iSWAP for the rook's move, but controlled on the path square being empty. In Qiskit that is ctrl_state=0, an open control. The move happens only in the branch where the blocker is absent."
- The result, point at the four boxes: "Classically there are four stories: blocker there or not, rook through or not. After this gate only two survive. If the rook got through, the blocker was not there. If it was stopped, the blocker was there. The other two stories have exactly zero probability."
- "Neither piece has been measured, yet their answers are locked together. That is entanglement, and you can see it on the board."

## 12. Capture (45 s)

- "A capture is the only place the board gets looked at. The engine measures the attacker's square and the target's square with Statevector.measure, which samples by the Born rule and collapses the state."
- "If the target was there, the capture lands. If not, it fizzles, but now everyone knows where that piece is, and you spent a turn to learn it."
- Numbers: "20 captures of a 50/50 knight: taken 8 times, escaped 12. Within normal variance of 50%. The point is not the number; it is where the randomness comes from. It is a measurement of a real statevector, never Math.random."

## 13. Tech stack (30 s)

- "One Python engine in src/qchess. It builds a QuantumCircuit per entangled group and uses quantum_info.Statevector to evolve and measure."
- "FastAPI serves it and keeps every move's circuit so the app can draw it and you can review past positions."
- "The front end is plain HTML, CSS and JavaScript, no build step."
- The fallback, phrase carefully: "There is also a JavaScript port so the game runs as a single offline file. It is the same math, and a test replays 850 moves through both engines and requires every probability to match Qiskit to one part in a billion. The demo you are about to see runs on the Qiskit engine; the badge in the header says so."

## 14 to 16. Live demo (3 to 4 min)

Narrate what the circuit panel shows at each step; that is what judges want to see.

Script:
1. Play tab, new quantum game. "Press 2 for Split, click the knight, click a3 and c3." Point at the 50% badges and the circuit: X, √iSWAP, iSWAP. "Qubits: 2 of 16."
2. Make any black move. "Classical move, no qubits needed, the panel says so."
3. Press 3 for Merge, click the knight, click b1. "Back with certainty. Look at the circuit: the inverse gates appended."
4. Split again, then have Black attack one of the two squares. "This is a capture, so it measures. Watch." Whatever happens, explain it: taken or fizzled, and the knight is now certain.
5. If time: click a past move in the move list to show review mode with that move's circuit.
6. Bots tab: pick Heisenberg, play two moves. "The bot values every legal move as the exact probability-weighted average of its outcomes. It does not sample."
7. Puzzles tab: solve puzzle 1 and show the feedback percentage. "An exact solver enumerates every measurement branch."
8. How to play tab: play one animated lesson for a few seconds. "Every frame is computed by the engine."

If the demo breaks: switch to docs/index.html (offline build) and say so plainly. Same engine math, verified against Qiskit.

## 17. Classical vs quantum (40 s)

- "The baseline is the same engine with quantum moves off, so this is like for like."
- "Branching factor almost doubles, 11.2 to 21.1. The strategy space is genuinely larger."
- "The merge row is the one with no classical counterpart: 1.0 versus 0.5."
- "And captures carry real risk now; you can attack a piece that turns out not to be there."

## 18. NISQ limits (45 s)

Judges score critical understanding. Be blunt.
- "This game is designed for an exact simulator. On real hardware the headline effect degrades fast."
- Table: "The split-then-merge transpiles to 8 CNOTs. With a 1% two-qubit gate error the knight comes home 72% of the time. At 2% it is 53%, barely better than a coin flip. The 'certain' merge is the first thing noise destroys."
- Three more limits, one sentence each: memory doubles per qubit (hence the cap); each iSWAP is 2 to 3 CNOTs on hardware so errors leak probability onto wrong squares, 'ghost pieces'; a long game outlasts coherence and distant squares need SWAPs.
- Next step: "Run a single split-then-merge on IBM hardware through Qiskit Runtime and overlay it on this Aer curve."

## 19. Tests (30 s)

"I tested it like a chess engine and checked it like a physics model." Pick three numbers: 23 tests; 1e-9 agreement between the two engines; probabilities sum to one after 10,000 random quantum moves. Mention speed: no move over half a second in 150 games.

## 20. Close (20 s)

Repeat the sentence. "Every square is a qubit, every move is a gate, every capture is a measurement." Give the repo. Invite questions.

---

## Likely judge questions and short answers

- Why are pawns classical? Pawn moves depend on captures and promotion, both of which are ambiguous in superposition. Keeping pawns classical keeps the rules well-defined.
- Why no check? "Is the king attacked?" has no single answer when the king or the attacker is split. Capturing the king is the clean quantum win condition.
- How do we know it is not random numbers? The merge. A classical mixture returns home 50% of the time; the game returns 100%. The notebook shows both.
- What happens at the 16-qubit cap? The engine measures the oldest superposition before the move, collapsing it. In 150 random games the cap was never reached.
- What does ctrl_state=0 do? It makes the control fire when the qubit is 0 (square empty) instead of 1. That is what "move only if the path is clear" means as a gate.
- Why iSWAP and not SWAP? iSWAP is the native two-qubit "hop" in Cantwell's framework and its square root gives a clean 50/50 split. Plain SWAP has no useful square root for this purpose.
- Is the JavaScript engine cheating the rule? No. The scored demo runs on Qiskit. The JS port exists for offline play and is verified against Qiskit to 1e-9 on every square's probability.
- Does the bot cheat by seeing the measurement results? It rebuilds an exact mirror from the move log including past measurement outcomes, which both players already know. It cannot see the future outcome of a capture; it averages over them.
- How much was AI-assisted? Be honest: brainstorming, planning and coding help; every line reviewed and understood. Then explain any line they point at.
