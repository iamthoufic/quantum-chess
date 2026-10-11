// Content pages: the illustrated manual and the blog (an article list plus the articles).
// Uses buildBoard / barChart / lineChart from app.js and the QC engine from engine.js.
"use strict";

// ------------------------------------------------------------------ figures
/**
 * A rule diagram: a small board rendered with the real board styles.
 * pieces: { a3: "wN" } or { a3: ["wN", 0.5] };  marks: { c3: "dot" };  arrows: [["b1","a3"], ...]
 */
function figure({ pieces = {}, marks = {}, arrows = [], last = [], sel = null, caption = "", n = "" }) {
  const cells = {};
  for (const [sq, spec] of Object.entries(pieces)) {
    if (!spec) continue;                       // lets a figure remove a piece: { b1: undefined }
    const [sym, prob] = Array.isArray(spec) ? spec : [spec, 1];
    cells[sq] = { color: sym[0], kind: sym[1], prob };
  }
  const fig = document.createElement("figure");
  fig.className = "fig";
  const wrap = document.createElement("div");
  wrap.className = "fig-board";
  wrap.appendChild(buildBoard(cells, { marks, last, sel, mini: true, coords: true, badges: true }));
  if (arrows.length) {
    const c = (sq) => [("abcde".indexOf(sq[0]) + 0.5) * 20, (5 - Number(sq[1]) + 0.5) * 20];
    let svg = `<svg class="fig-arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="rgba(255,170,0,0.95)"/></marker></defs>`;
    for (const [a, b] of arrows) {
      const [x1, y1] = c(a), [x2, y2] = c(b);
      const k = 7 / Math.hypot(x2 - x1, y2 - y1);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2 - (x2 - x1) * k}" y2="${y2 - (y2 - y1) * k}" stroke="rgba(255,170,0,0.9)" stroke-width="2.6" stroke-linecap="round" marker-end="url(#ah)"/>`;
    }
    wrap.insertAdjacentHTML("beforeend", svg + "</svg>");
  }
  fig.appendChild(wrap);
  fig.insertAdjacentHTML("beforeend", `<figcaption><b>${n}</b> ${caption}</figcaption>`);
  return fig;
}

function figRow(...figs) {
  const row = document.createElement("div");
  row.className = "fig-row";
  figs.forEach((f) => row.appendChild(f));
  return row;
}

function section(parent, html) {
  const s = document.createElement("section");
  s.innerHTML = html;
  parent.appendChild(s);
  return s;
}

const START = {
  a5: "bR", b5: "bN", c5: "bB", d5: "bQ", e5: "bK", a4: "bP", b4: "bP", c4: "bP", d4: "bP", e4: "bP",
  a2: "wP", b2: "wP", c2: "wP", d2: "wP", e2: "wP", a1: "wR", b1: "wN", c1: "wB", d1: "wQ", e1: "wK",
};
const img = (s) => `<img class="inline-piece" src="${pieceUrl(s[0], s[1])}" alt="">`;
// the author's photo (the one-file build inlines it as window.AUTHOR_IMG)
const authorPhoto = (name) => `<img class="av" src="${window.AUTHOR_IMG || "img/author.jpg"}" alt="${name}">`;

// ------------------------------------------------------------------ manual
function buildManual(root) {
  root.innerHTML = `
    <p class="eyebrow">Instruction manual</p>
    <h1>How to play Quantum Chess 5×5</h1>
    <p class="lede">Chess on Martin Gardner's 5×5 board, where pieces can be in two places at once.
    Every square is a qubit, every quantum move is a gate, and every capture is a measurement.</p>
`;
  root.appendChild(buildTutorials());
  const toc = $("manualToc");
  toc.innerHTML = `<div class="toc-title">Contents</div><nav class="toc">
      <a href="#m-videos">Video tutorials</a><a href="#m-goal">Goal and board</a><a href="#m-pieces">The pieces</a><a href="#m-turn">Your turn</a>
      <a href="#m-split">Split</a><a href="#m-merge">Merge</a><a href="#m-entangle">Entanglement</a>
      <a href="#m-capture">Captures</a><a href="#m-pawns">Pawns</a><a href="#m-end">Winning</a>
      <a href="#m-controls">Controls</a><a href="#m-fair">Engines and fair play</a>
      <i class="toc-ind"></i>
    </nav>`;
  toc.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
  }));

  let s = section(root, `
    <h2 id="m-goal">Goal and board</h2>
    <p><b>Capture the enemy king.</b> There is no check or checkmate: a king that might be in two places
    can't be "in check" in any meaningful way, so you simply have to take it, and a capture of a "maybe" king
    only succeeds if a measurement finds it there.</p>
    <p>The board is Gardner's Minichess (1969): 5×5 squares, each side with a king, queen, rook, bishop,
    knight and five pawns. White moves first.</p>`);
  s.appendChild(figure({ pieces: START, n: "Figure 1.", caption: "Starting position. White plays up the board." }));

  section(root, `
    <h2 id="m-pieces">The pieces</h2>
    <table class="rules-table">
      <tr><th>Piece</th><th>Moves like</th><th>Quantum abilities</th></tr>
      <tr><td>${img("wK")} King</td><td>One square in any direction</td><td>Split, merge. Must be found by a measurement to be captured.</td></tr>
      <tr><td>${img("wQ")} Queen</td><td>Any distance, straight or diagonal</td><td>Split, merge, entangling slides</td></tr>
      <tr><td>${img("wR")} Rook</td><td>Any distance, straight</td><td>Split, merge, entangling slides</td></tr>
      <tr><td>${img("wB")} Bishop</td><td>Any distance, diagonal</td><td>Split, merge, entangling slides</td></tr>
      <tr><td>${img("wN")} Knight</td><td>L-shape, jumps over pieces</td><td>Split, merge (jumps never entangle)</td></tr>
      <tr><td>${img("wP")} Pawn</td><td>One step forward; captures one step diagonally</td><td>None: pawns are always classical</td></tr>
    </table>
    <p>A piece shown <b>translucent, with a cyan and pink colour fringe and a % tag</b>, is in superposition: the tag
    (and the thin bar along the bottom of its square) is the probability that it is really on that square. The two halves of a split piece always add up to 100%.</p>`);

  s = section(root, `
    <h2 id="m-turn">Your turn: one action</h2>
    <p>Each turn you do exactly one of these. Choose the type with the <b>Move / Split / Merge</b> buttons
    (or keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>).</p>
    <ul class="ticks">
      <li><b>Move</b>: an ordinary chess move. Grey dots show quiet moves, grey rings show captures.</li>
      <li><b>Split</b>: put a piece on two empty squares at once.</li>
      <li><b>Merge</b>: bring the two halves of a split piece together on one square.</li>
      <li><b>Capture</b>: move onto an enemy piece. If anything involved is uncertain, the board is measured first.</li>
    </ul>
    <p>A move that fails (for example a capture whose attacker turned out not to be there) still uses your turn.</p>`);
  s.appendChild(figure({ pieces: { ...START, b1: undefined, c3: "wN" }, marks: { b1: "dot", a4: "ring", b5: "ring", d5: "ring", e4: "ring" }, sel: "c3",
    n: "Figure 2.", caption: "Knight on c3 selected: dots are empty squares, rings are captures." }));

  s = section(root, `
    <h2 id="m-split">Split: superposition</h2>
    <p>Choose <b>Split</b>, click a non-pawn piece, then click <b>two empty squares</b> it could reach
    (dashed cyan circles). The piece now stands on both squares with 50% probability each.</p>
    <p class="qbox"><b>Under the hood:</b> the piece's square is a qubit in state |1⟩. A ${RAD} gate (the square root of iSWAP) with the first target
    sends half of the amplitude there; a full <code>iSWAP</code> with the second target sends the rest.
    The state is <code>i(|a3⟩ + |c3⟩)/√2</code>.</p>`);
  s.appendChild(figRow(
    figure({ pieces: START, marks: { a3: "qdot", c3: "qdot" }, arrows: [["b1", "a3"], ["b1", "c3"]], n: "Figure 3a.", caption: "Split the b1 knight towards a3 and c3." }),
    figure({ pieces: { ...START, b1: undefined, a3: ["wN", 0.5], c3: ["wN", 0.5] }, last: ["b1", "a3", "c3"], n: "Figure 3b.", caption: "Result: the knight is 50% on a3 and 50% on c3." }),
  ));

  s = section(root, `
    <h2 id="m-merge">Merge: interference</h2>
    <p>Choose <b>Merge</b>, click one half of a split piece, click its other half (outlined), then click an
    empty square both halves can reach. The halves recombine there.</p>
    <p>If the two halves still have the phases a split gave them, the merge is <b>certain (100%)</b>: the
    amplitudes add up on the target and cancel elsewhere. If one half has moved on its own since, the phases
    differ and the merge may leave some probability behind. That is real quantum interference, and you can
    use it.</p>
    <p class="qbox"><b>Under the hood:</b> the split run backwards: iSWAP<sup>†</sup>, then ${RAD}<sup>†</sup>.</p>`);
  s.appendChild(figRow(
    figure({ pieces: { ...START, b1: undefined, a3: ["wN", 0.5], c3: ["wN", 0.5] }, marks: { a3: "partner", c3: "partner", b1: "qdot" }, arrows: [["a3", "b1"], ["c3", "b1"]], n: "Figure 4a.", caption: "Merge both halves back onto b1." }),
    figure({ pieces: START, last: ["b1"], n: "Figure 4b.", caption: "Result: the knight is back on b1 with 100% certainty." }),
  ));

  s = section(root, `
    <h2 id="m-entangle">Sliding past a "maybe" piece: entanglement</h2>
    <p>Rooks, bishops and queens may slide <b>through</b> a square that holds a piece in superposition. The
    move happens only in the branch where that square is empty, so your piece becomes <b>entangled</b> with it:
    if one is later measured, the other is decided too.</p>
    <p class="qbox"><b>Under the hood:</b> an <code>iSWAP</code> on (from, to) controlled on the path square being
    |0⟩ (an open control dot). After the move: rook on a4 ⇔ knight not on a2.</p>`);
  s.appendChild(figRow(
    figure({ pieces: { a1: "wR", e1: "wK", a2: ["bN", 0.5], b5: ["bN", 0.5], e5: "bK" }, arrows: [["a1", "a4"]], marks: { a4: "dot" }, n: "Figure 5a.", caption: "Black's knight is 50% on a2. White's rook slides a1 → a4 through it." }),
    figure({ pieces: { a1: ["wR", 0.5], a4: ["wR", 0.5], e1: "wK", a2: ["bN", 0.5], b5: ["bN", 0.5], e5: "bK" }, last: ["a1", "a4"], n: "Figure 5b.", caption: "Entangled: either (knight a2, rook a1) or (knight b5, rook a4)." }),
  ));

  s = section(root, `
    <h2 id="m-capture">Captures are measurements</h2>
    <p>When a capture involves anything uncertain, the engine measures in this order:</p>
    <ol class="steps">
      <li><b>The attacker's square.</b> If your piece isn't really there, the capture fizzles.</li>
      <li><b>Any "maybe" pieces on the path</b> (sliders only). If one is really there, the capture is blocked.</li>
      <li><b>The target square.</b> If the enemy is there, it is captured; if not, your piece just moves onto the empty square.</li>
    </ol>
    <p>Each measurement collapses the state: probabilities snap to 0% or 100% everywhere they are linked.
    Measured squares pulse cyan and the move list shows each result.</p>`);
  s.appendChild(figRow(
    figure({ pieces: { a1: "wR", e1: "wK", a2: ["bN", 0.5], b5: ["bN", 0.5], e5: "bK" }, marks: { a2: "ring" }, arrows: [["a1", "a2"]], n: "Figure 6a.", caption: "The rook attacks a 50% knight on a2." }),
    figure({ pieces: { a2: "wR", e1: "wK", e5: "bK" }, last: ["a1", "a2"], n: "Figure 6b.", caption: "Outcome 1 (50%): the knight was there and is captured." }),
    figure({ pieces: { a2: "wR", e1: "wK", b5: "bN", e5: "bK" }, last: ["a1", "a2"], n: "Figure 6c.", caption: "Outcome 2 (50%): a2 was empty; the knight is now certainly on b5." }),
  ));

  s = section(root, `
    <h2 id="m-pawns">Pawns</h2>
    <ul class="ticks">
      <li>Pawns move one square forward (no double step) and capture one square diagonally forward.</li>
      <li>Pawns never split or merge.</li>
      <li><b>Measured push:</b> if the square in front holds a "maybe" piece, it is measured. Empty: the pawn moves. Occupied: the pawn is blocked and the turn is used.</li>
      <li>A pawn reaching the last rank becomes a queen.</li>
    </ul>`);
  s.appendChild(figRow(
    figure({ pieces: { ...START, b1: undefined, a3: ["wN", 0.5], c3: ["wN", 0.5] }, arrows: [["c4", "c3"]], marks: { c3: "dot" }, n: "Figure 7a.", caption: "Black pushes c4 into the 50% knight square." }),
    figure({ pieces: { ...START, b1: undefined, c3: "wN" }, last: ["c3"], n: "Figure 7b.", caption: "Measured: the knight was on c3, so the pawn is blocked." }),
  ));

  section(root, `
    <h2 id="m-end">Winning, draws and the qubit budget</h2>
    <ul class="ticks">
      <li><b>Win</b> by capturing the enemy king.</li>
      <li><b>Draw</b> if only the two kings are left, after 50 moves each without a capture or a pawn move
      (the 50-move rule), or if the side to move has no legal action.</li>
      <li>No check, no castling, no en passant.</li>
      <li><b>Qubit budget:</b> only uncertain squares cost qubits, and at most 16 can be uncertain at once.
      If a move would exceed that, the oldest uncertain square is measured first ("forced measurement").</li>
    </ul>`);

  section(root, `
    <h2 id="m-controls">Controls</h2>
    <table class="rules-table">
      <tr><th>Action</th><th>How</th></tr>
      <tr><td>Move / capture</td><td>Move mode: click a piece, then a dot or ring</td></tr>
      <tr><td>Split</td><td>Split mode (<kbd>2</kbd>): click a piece, then two dashed circles</td></tr>
      <tr><td>Merge</td><td>Merge mode (<kbd>3</kbd>): click one half, its outlined partner, then a dashed circle</td></tr>
      <tr><td>Cancel a selection</td><td><kbd>Esc</kbd></td></tr>
      <tr><td>Change theme, hints, coordinates, board flip, engine</td><td>Settings (sliders icon, top right)</td></tr>
      <tr><td>Play without quantum moves</td><td>"Classical" button under the move list</td></tr>
    </table>`);

  section(root, `
    <h2 id="m-fair">Engines and fair play</h2>
    <p>The quantum state is a full statevector simulation. The label at the top right shows which engine computes it:</p>
    <ul class="ticks">
      <li><b>Qiskit</b> (cyan dot): when the page is served by <code>uvicorn src.api:app</code>, every gate and measurement
      runs in Qiskit (<code>Statevector.evolve</code> and <code>Statevector.measure</code>), and the circuit panel shows Qiskit's own drawing.</li>
      <li><b>In-browser engine</b> (grey dot): when the page is opened as a file or offline, a JavaScript port of the same engine
      runs locally. The test <code>tests/test_js_engine.py</code> replays hundreds of moves through both engines and
      checks that every probability matches Qiskit's.</li>
    </ul>`);
  watchManualSections();
}

function watchManualSections() {
  const links = [...document.querySelectorAll("#manualToc a")];
  const heads = [...document.querySelectorAll("#manualBody h2[id]")];
  const update = () => {
    if ($("view-manual").classList.contains("hidden")) return;
    const line = innerHeight * 0.3;
    let current = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top <= line) current = h;
    // at the very bottom the last sections can never reach the line: light the last one
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) current = heads[heads.length - 1];
    links.forEach((a) => a.classList.toggle("active", current && a.getAttribute("href") === "#" + current.id));
    // only the indicator moves: slide it to the active entry
    const on = links.find((a) => a.classList.contains("active")), ind = document.querySelector("#manualToc .toc-ind");
    if (on && ind) { ind.style.top = on.offsetTop + "px"; ind.style.height = on.offsetHeight + "px"; }
  };
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();
}

// ------------------------------------------------------------------ blog
const NOISE = [[0, 1.0], [0.005, 0.847], [0.01, 0.724], [0.02, 0.531], [0.05, 0.245], [0.1, 0.144]];

const ARTICLES = [
  {
    slug: "history", no: "02", author: "Mohamed Thoufic", date: "11 October 2026", read: "7 min read",
    title: "From chaturanga to qubits: the story of 5×5 quantum chess",
    titleHtml: "From chaturanga to <em>qubits</em>: the story of 5×5 quantum chess",
    dek: "Fifteen centuries of chess, a pocket-sized board from Martin Gardner, a game designer who taught pieces to be in two places at once, and the machines that kept changing what the game could be.",
    tags: ["History", "Quantum games"],
    build: buildHistory,
  },
  {
    slug: "classical-vs-quantum", no: "01", author: "Mohamed Thoufic", date: "11 October 2026", read: "8 min read",
    title: "Same board, different universe: classical vs quantum 5×5 chess",
    titleHtml: "Same board, <em>different universe</em>: classical vs quantum 5×5 chess",
    dek: "Gardner's 5×5 minichess is small enough that computers have solved it. What happens to such a tidy game when pieces are allowed to be in two places at once?",
    tags: ["Quantum games", "Live experiments"],
    build: buildClassicalVsQuantum,
  },
];

function renderBlog(root, slug) {
  const art = ARTICLES.find((a) => a.slug === slug);
  if (!art) {
    root.innerHTML = `
      <p class="eyebrow">Blog</p>
      <h1>Notes from building Quantum Chess</h1>
      <p class="lede">Articles on the ideas behind the game: what quantum mechanics changes about chess, and what it costs.</p>

      <div class="post-list">${ARTICLES.map((a) => `
        <a class="post-card" href="#blog/${a.slug}">
          <div class="post-meta"><span class="post-no">Article ${a.no}</span><span>${a.date}</span><span>${a.read}</span></div>
          <h2 class="post-title">${a.titleHtml}</h2>
          <p class="post-dek">${a.dek}</p>
          <div class="post-foot">${authorPhoto(a.author)}<span class="post-by"><b>${a.author}</b><small>${a.date} · ${a.read}</small></span><span class="post-read">Read article <svg class="ic"><use href="#i-arrow"/></svg></span></div>
        </a>`).join("")}
      </div>`;
    return;
  }
  art.build(root, art);
}

function buildHistory(root, art) {
  const ev = (year, title, text) => `<li><span class="tl-year">${year}</span><div><b>${title}</b><p>${text}</p></div></li>`;
  root.innerHTML = `
    <a class="back-link" href="#blog"><svg class="ic"><use href="#i-prev"/></svg>All articles</a>
    <p class="eyebrow">Article ${art.no} · ${art.tags.join(" · ")}</p>
    <h1>${art.titleHtml}</h1>
    <p class="lede">${art.dek}</p>
    <div class="byline">${authorPhoto(art.author)}<div><span class="author-kicker">Published by</span><b>${art.author}</b><span>${art.date} · ${art.read}</span></div></div>

    <h2>A game older than most languages</h2>
    <p>Chess began in India as <b>chaturanga</b>, around the 6th century: a war game with infantry, cavalry,
    elephants and chariots. It travelled to Persia as <b>shatranj</b>, spread across the Islamic world, and reached
    Europe a few centuries later. The game we know today took shape in late 15th-century Europe, when the queen and
    the bishop gained their long, sweeping moves and play became fast enough to be decided in an evening.</p>
    <p>For most of that history, chess was a test of calculation and memory: every piece is always somewhere,
    both players see the whole board, and nothing is left to chance.</p>

    <h2>Shrinking the board</h2>
    <p>Players have always experimented with smaller boards, partly for fun and partly because a smaller game is easier
    to study. The most famous of these <b>minichess</b> variants comes from <b>Martin Gardner</b>, who presented a 5×5
    setup in his <i>Mathematical Games</i> column in <i>Scientific American</i> in 1969: one king, queen, rook, bishop
    and knight per side, five pawns, no castling and no double pawn step.</p>
    <p>It looks like a toy, but it is a real game. It is also small enough for computers to explore completely: in 2013
    Mehdi Mhalla and Frédéric Prost showed that with perfect play, Gardner's minichess is a <b>draw</b>.</p>

    <h2>A note on the machine</h2>
    <p>Chess and computers grew up together. Around 1948 <b>Alan Turing</b> wrote a chess-playing program on paper,
    before any computer existed that could run it, and later played a game by working through its rules by hand.
    In 1950 <b>Claude Shannon</b> published <i>Programming a Computer for Playing Chess</i>, the paper that laid out how a
    machine could search ahead through possible moves. Almost half a century later, in 1997, IBM's <b>Deep Blue</b>
    beat world champion Garry Kasparov in a six-game match.</p>
    <p>Those were classical machines: they play the same chess as people, only faster. A quantum computer is a
    different kind of machine. It is not a faster chess engine; it stores a state that can be a combination of many
    possibilities at once, and it only gives a definite answer when it is measured. That is exactly the behaviour
    quantum chess puts on the board.</p>
    <blockquote class="pull">Classical computers learned to play chess. Quantum computers suggest a different chess to play.</blockquote>

    <h2>Enter quantum chess</h2>
    <p>The idea of a chess game with quantum rules appeared in research around 2010; computer scientist
    <b>Selim Akl</b> of Queen's University in Canada was among the first to propose one, as a way to show that a game can
    be hard for any player, human or machine, who cannot see the quantum state.</p>
    <p>The version most people know was created by <b>Chris Cantwell</b>, who developed <i>Quantum Chess</i> while studying
    at the University of Southern California. In his design every square behaves like a qubit, pieces can split onto
    two squares, and moves are built from the <b>iSWAP</b> family of quantum gates, the same model this project
    follows. He later described the full mathematical framework in a 2019 paper.</p>
    <p>The game reached a wide audience in 2016 through <i>Anyone Can Quantum</i>, a short film from Caltech's Institute
    for Quantum Information and Matter in which actor Paul Rudd plays quantum chess against Stephen Hawking.</p>

    <h2>Why 5×5, and why now</h2>
    <p>Quantum chess on a full 8×8 board needs a lot of quantum state to track. Gardner's 5×5 board keeps every piece
    type and the feel of real chess, but with 25 squares it is small enough to simulate exactly. That makes it a good
    fit for a 24-hour build at <b>Qiskit Fall Fest 2026</b>: every split, merge and measured capture in this game is a
    real operation on a Qiskit statevector, and only the squares that are actually uncertain cost a qubit.</p>
    <p>It also turns a solved game back into an open one. Classical 5×5 chess is a draw with perfect play; quantum
    5×5 chess adds hidden information, interference and genuine chance, and nobody has solved that yet.</p>

    <h2>Timeline</h2>
    <ol class="timeline">
      ${ev("c. 600", "Chaturanga", "The ancestor of chess is played in India.")}
      ${ev("c. 1000", "Shatranj", "The game has spread through Persia and the Islamic world.")}
      ${ev("c. 1475", "Modern chess", "In Europe the queen and bishop gain their long moves.")}
      ${ev("1948", "Turing's paper machine", "Alan Turing writes a chess program before a computer can run it.")}
      ${ev("1950", "Shannon's paper", "Claude Shannon describes how a computer could play chess.")}
      ${ev("1969", "Gardner's 5×5 board", "Martin Gardner presents the 5×5 minichess setup.")}
      ${ev("1997", "Deep Blue", "IBM's machine beats world champion Garry Kasparov.")}
      ${ev("c. 2010", "Quantum chess proposed", "Selim Akl and others describe chess with quantum rules.")}
      ${ev("2013", "5×5 solved", "Mhalla and Prost show Gardner's minichess is a draw.")}
      ${ev("2016", "Anyone Can Quantum", "Paul Rudd plays Chris Cantwell's Quantum Chess against Stephen Hawking.")}
      ${ev("2019", "The framework", "Cantwell publishes the mathematics behind Quantum Chess.")}
      ${ev("2026", "5×5 Quantum Chess", "This project: Gardner's board with quantum rules, built on Qiskit in 24 hours.")}
    </ol>
    <p class="note">Dates before the modern era are approximate; historians place chaturanga between the 6th and 7th centuries.</p>

    <h3>Further reading</h3>
    <ol class="refs">
      <li>M. Gardner, Mathematical Games column, <i>Scientific American</i>, 1969.</li>
      <li>C. E. Shannon, "Programming a Computer for Playing Chess", <i>Philosophical Magazine</i>, 1950.</li>
      <li>M. Mhalla, F. Prost, "Gardner's Minichess Variant is Solved", <i>ICGA Journal</i> 36(4), 2013.</li>
      <li>S. G. Akl, "On the importance of being quantum", <i>Parallel Processing Letters</i>, 2010.</li>
      <li>C. Cantwell, "Quantum Chess: Developing a Mathematical Framework and Design Methodology for Creating Quantum Games", arXiv:1906.05836, 2019.</li>
      <li><i>Anyone Can Quantum</i>, Institute for Quantum Information and Matter, Caltech, 2016.</li>
    </ol>
    <p class="next-art">Next: <a href="#blog/classical-vs-quantum">Article 01 · Same board, different universe: classical vs quantum 5×5 chess</a></p>`;
}

function buildClassicalVsQuantum(root, art) {
  root.innerHTML = `
    <a class="back-link" href="#blog"><svg class="ic"><use href="#i-prev"/></svg>All articles</a>
    <p class="eyebrow">Article ${art.no} · ${art.tags.join(" · ")}</p>
    <h1>${art.titleHtml}</h1>
    <p class="lede">${art.dek}</p>
    <div class="byline">${authorPhoto(art.author)}<div><span class="author-kicker">Published by</span><b>${art.author}</b><span>${art.date} · ${art.read} · experiments run in your browser</span></div></div>

    <h2>A small game with a big result</h2>
    <p>Martin Gardner introduced the 5×5 setup in 1969 as a pocket version of chess: one of each major piece
    plus five pawns per side, no castling, no double pawn steps. Because the board is so small, the game is
    within reach of exhaustive search, and in 2013 Mehdi Mhalla and Frédéric Prost showed that with perfect play
    it is a <b>draw</b>. Classical 5×5 chess is a game of complete information: both players see everything, and
    the best move in any position is a fixed fact.</p>

    <h2>Four rules that change everything</h2>
    <p>Quantum 5×5 chess keeps the board and the pieces, and adds four mechanics, each one a real quantum effect:</p>
    <div class="compare-cards">
      <div class="cc"><span class="cc-k">Split</span><h3>Superposition</h3><p>A split puts one piece on two squares. Nobody, not even its owner, knows which is "real".</p></div>
      <div class="cc"><span class="cc-k">Merge</span><h3>Interference</h3><p>A merge recombines the halves with certainty, something no coin-flip game can do.</p></div>
      <div class="cc"><span class="cc-k">Slide</span><h3>Entanglement</h3><p>Sliding past a "maybe" piece ties two pieces' fates together.</p></div>
      <div class="cc"><span class="cc-k">Capture</span><h3>Measurement</h3><p>Captures force the board to decide, and the decision is genuinely random.</p></div>
    </div>

    <h2>Side by side</h2>
    <table class="rules-table compare">
      <tr><th></th><th>Classical 5×5</th><th>Quantum 5×5</th></tr>
      <tr><td>State of the board</td><td>One position</td><td>A superposition of positions (a statevector)</td></tr>
      <tr><td>Actions per turn</td><td>Moves and captures</td><td>Moves, captures, splits, merges</td></tr>
      <tr><td>Information</td><td>Complete</td><td>Incomplete for <i>both</i> players until measured</td></tr>
      <tr><td>Chance</td><td>None</td><td>Measurement outcomes follow the Born rule</td></tr>
      <tr><td>Check / checkmate</td><td>Yes</td><td>No: you must actually capture the king</td></tr>
      <tr><td>Solved?</td><td>Yes, a draw (2013)</td><td>No: chance and hidden state make "best play" a probability</td></tr>
    </table>

    <h2>Experiment 1: how much bigger is the game?</h2>
    <p>The simplest measure of a game's complexity is its <b>branching factor</b>, the number of options a player
    has each turn. The button below plays random games with the in-browser engine in both modes and counts.</p>
    <div class="experiment" id="exp1">
      <div class="exp-head"><span class="exp-title">Experiment 01 · branching factor</span><button class="btn primary" id="exp1Run"><svg class="ic"><use href="#i-play"/></svg>Run 60 games per mode</button></div>
      <div id="exp1Out"></div>
      <p class="exp-status" id="exp1Status"></p>
    </div>

    <h2>Experiment 2: interference vs a coin flip</h2>
    <p>Split a knight, then merge it straight back. A quantum split followed by a merge returns the knight
    every time. Replace the split with a fair coin flip ("the knight is on a3 or c3, I just don't know which")
    and run the very same merge gates: it only comes back half the time. The difference is
    <b>phase</b>, and it is the clearest proof that these moves are not dice in disguise.</p>
    <div class="experiment" id="exp2">
      <div class="exp-head"><span class="exp-title">Experiment 02 · interference</span><button class="btn primary" id="exp2Run"><svg class="ic"><use href="#i-play"/></svg>Run 1000 trials</button></div>
      <div id="exp2Out"><p class="note">Each trial splits a knight from b1 and merges it straight back, then looks.</p></div>
      <p class="exp-status" id="exp2Status"></p>
    </div>

    <blockquote class="pull">A coin flip hides where the knight is. A superposition remembers how it got there.</blockquote>

    <h2>How the strategy changes</h2>
    <ul class="ticks">
      <li><b>Hedging your king.</b> A split king is harder to capture: an attack only succeeds if the measurement finds it.</li>
      <li><b>Every capture is a gamble with information.</b> Even a failed capture collapses the state, telling both players where pieces really are.</li>
      <li><b>Tempo has a price.</b> A capture that fizzles still uses your turn, so attacking uncertain pieces is a real risk.</li>
      <li><b>Bluffing becomes legal.</b> A 50% queen controls twice the squares, and your opponent must decide whether to test it.</li>
    </ul>

    <h2>Reality check: this needs a perfect quantum computer</h2>
    <p>Every quantum move here is simulated exactly. On today's noisy (NISQ) hardware each iSWAP compiles to
    several CNOT gates, and errors leak probability onto squares where no piece should be. The chart shows the
    split-then-merge round trip from Experiment 2 run on Qiskit Aer with a depolarizing noise model
    (notebook section 7): already at 1% gate error, the "certain" merge only succeeds 72% of the time.</p>
    <div class="experiment"><div class="exp-head"><span class="exp-title">From the notebook · Qiskit Aer noise study</span></div>${lineChart(NOISE, { xLabel: "1-qubit gate error rate (2-qubit error = 2×)", yLabel: "P(knight back on b1)" })}
      <p class="note">P(knight back on b1) after split + merge, 4000 shots per point, transpiled to 8 CNOTs.</p></div>
    <p>Long games would also outlast qubit coherence times, and exact simulation doubles in cost with every
    extra uncertain square, which is why the engine caps the game at 16 uncertain squares.</p>

    <h2>Verdict</h2>
    <p>Classical 5×5 chess is a solved puzzle. The quantum version turns it back into a game: more options per
    turn, hidden information that neither player controls, and outcomes decided by measurement. Its quantum
    features are not decoration: interference makes merges work, entanglement links pieces, and measurement
    decides captures, all computed with Qiskit statevectors.</p>

    <h3>References</h3>
    <ol class="refs">
      <li>M. Mhalla, F. Prost, "Gardner's Minichess Variant is Solved", <i>ICGA Journal</i> 36(4), 2013.</li>
      <li>M. Gardner, Mathematical Games column, <i>Scientific American</i>, 1969.</li>
      <li>C. Cantwell, "Quantum Chess: Developing a Mathematical Framework and Design Methodology for Creating Quantum Games", arXiv:1906.05836, 2019.</li>
      <li>Qiskit, <i>quantum_info.Statevector</i> and Qiskit Aer noise models.</li>
    </ol>`;

  $("exp1Out").innerHTML = exp1Chart({ classical: 13.5, quantum: 21.1 }, null, true);
  $("exp1Run").addEventListener("click", runExperiment1);
  $("exp2Run").addEventListener("click", runExperiment2);
}

function exp1Chart(branch, extra, fromNotebook = false) {
  let html = barChart([
    { label: "Classical 5×5", value: branch.classical, text: branch.classical.toFixed(1), color: "#6f6b63" },
    { label: "Quantum 5×5", value: branch.quantum, text: branch.quantum.toFixed(1), color: "#5fd4e8" },
  ]);
  html += `<p class="note">${fromNotebook ? "Average actions per turn from the Qiskit notebook (40 games per mode). Press the button to rerun it here." : "Average actions per turn (every move, capture, split pair and merge counts as one action)."}</p>`;
  if (extra) {
    html += `<table class="rules-table compact"><tr><th></th><th>Classical</th><th>Quantum</th></tr>
      <tr><td>Average game length (plies)</td><td>${extra.len.classical.toFixed(1)}</td><td>${extra.len.quantum.toFixed(1)}</td></tr>
      <tr><td>Games ending with a king capture</td><td>${extra.decisive.classical}%</td><td>${extra.decisive.quantum}%</td></tr>
      <tr><td>Measurements per game</td><td>0</td><td>${extra.meas.toFixed(1)}</td></tr></table>`;
  }
  return html;
}

function randomGame(quantum, seed, maxPlies = 80) {
  const g = new QC.Game({ seed, quantum });
  let rnd = seed * 9301 + 49297;
  const rand = (n) => { rnd = (rnd * 9301 + 49297) % 233280; return Math.floor((rnd / 233280) * n); };
  const counts = [];
  let meas = 0;
  for (let i = 0; i < maxPlies && !g.winner; i++) {
    const acts = [];
    for (const [sq, p] of g.pieces) {
      if (p.color !== g.turn) continue;
      const o = g.options(sq);
      for (const t of o.move.concat(o.capture)) acts.push(["move", sq, t]);
      for (let a = 0; a < o.split.length; a++) for (let b = a + 1; b < o.split.length; b++) acts.push(["split", sq, o.split[a], o.split[b]]);
      for (const [s2, ts] of o.merge) for (const t of ts) acts.push(["merge", sq, s2, t]);
    }
    counts.push(acts.length);
    const a = acts[rand(acts.length)];
    const e = g[a[0]](a[1], a[2], a[3]);
    meas += e.events.filter((ev) => ev.startsWith("measured")).length;
  }
  return { branch: counts.reduce((x, y) => x + y, 0) / counts.length, len: g.ply, decisive: g.winner === "w" || g.winner === "b", meas };
}

function runExperiment1() {
  const N = 60, out = { classical: [], quantum: [] };
  const btn = $("exp1Run");
  btn.disabled = true;
  let i = 0;
  const step = () => {
    const end = Math.min(i + 6, 2 * N);
    for (; i < end; i++) out[i < N ? "classical" : "quantum"].push(randomGame(i >= N, 1000 + (i % N)));
    $("exp1Status").textContent = `${i} / ${2 * N} games`;
    if (i < 2 * N) return setTimeout(step, 0);
    const avg = (arr, k) => arr.reduce((s, r) => s + Number(r[k]), 0) / arr.length;
    $("exp1Out").innerHTML = exp1Chart(
      { classical: avg(out.classical, "branch"), quantum: avg(out.quantum, "branch") },
      {
        len: { classical: avg(out.classical, "len"), quantum: avg(out.quantum, "len") },
        decisive: { classical: Math.round(100 * avg(out.classical, "decisive")), quantum: Math.round(100 * avg(out.quantum, "decisive")) },
        meas: avg(out.quantum, "meas"),
      });
    $("exp1Status").textContent = "Done (random players, so these measure the rules, not good play).";
    btn.disabled = false;
  };
  step();
}

function runExperiment2() {
  const T = 1000, b1 = QC.parse("b1"), a3 = QC.parse("a3"), c3 = QC.parse("c3");
  let quantumBack = 0, classicalBack = 0;
  for (let t = 0; t < T; t++) {
    // quantum: split then merge, then look
    const q = new QC.QuantumState(t);
    q.activate(b1, true); q.activate(a3, false); q.activate(c3, false);
    q.apply("√iSWAP", [], b1, a3); q.apply("iSWAP", [], b1, c3);
    q.apply("iSWAP†", [], b1, c3); q.apply("√iSWAP†", [], b1, a3);
    quantumBack += q.measure(b1);
    // classical: a coin decides a3 or c3, then the same merge gates
    const c = new QC.QuantumState(T + t);
    const heads = c.rng() < 0.5;
    c.activate(b1, false); c.activate(a3, heads); c.activate(c3, !heads);
    c.apply("iSWAP†", [], b1, c3); c.apply("√iSWAP†", [], b1, a3);
    classicalBack += c.measure(b1);
  }
  $("exp2Out").innerHTML = barChart([
    { label: "Quantum split → merge", value: quantumBack, text: `${quantumBack} / ${T}`, color: "#5fd4e8" },
    { label: "Coin flip → same merge", value: classicalBack, text: `${classicalBack} / ${T}`, color: "#6f6b63" },
  ], { max: T }) + `<p class="note">Knight found back on b1, out of ${T} trials each.</p>`;
  $("exp2Status").textContent = "Done.";
}
