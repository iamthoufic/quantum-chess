// Puzzles page: curated positions plus an endless generator, graded by the exact solver.
"use strict";

const PZ = {
  pz: null, game: null, mode: "move", sel: null, opts: null, picks: [], partner: null,
  done: false, solved: new Set(), cache: {},
};

function loadSolved() {
  try { PZ.solved = new Set(JSON.parse(localStorage.getItem("qc-puzzles") || "[]")); } catch (e) { /* storage unavailable */ }
}
function saveSolved() {
  try { localStorage.setItem("qc-puzzles", JSON.stringify([...PZ.solved])); } catch (e) { /* storage unavailable */ }
}

const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const sqName = (s) => (typeof s === "number" ? QC.name(s) : s);

function actionText(a) {
  const p = PZ.game.pieces.get(typeof a[1] === "number" ? a[1] : QC.parse(a[1]));
  const kind = p ? p.kind : "", s = a.slice(1).map(sqName);
  const name = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" }[kind] || "Piece";
  if (a[0] === "split") return `Split the ${name.toLowerCase()} on ${s[0]} to ${s[1]} and ${s[2]}`;
  if (a[0] === "merge") return `Merge the ${name.toLowerCase()} from ${s[0]} and ${s[1]} onto ${s[2]}`;
  const target = PZ.game.pieces.get(typeof a[2] === "number" ? a[2] : QC.parse(a[2]));
  return `${name} ${s[0]} ${target && p && target.color !== p.color ? "×" : "→"} ${s[1]}`;
}

// ------------------------------------------------------------------ page
function buildPuzzles(root) {
  loadSolved();
  const levels = ["Beginner", "Intermediate", "Advanced"];
  // three columns that fit one screen: puzzle list | board | puzzle panel
  root.innerHTML = `
    <div class="pz-layout">
      <aside class="pz-side">
        <div class="pz-intro">
          <p class="eyebrow">Practice</p>
          <h1>Puzzles</h1>
          <p class="pz-sub">${QCPuzzles.PUZZLES.length} hand-made positions, graded by an exact solver, plus endless generated ones.</p>
        </div>
        <div class="pz-progress" id="pzProgress"></div>
        <div class="pz-strip">
          ${levels.map((lv) => `<div class="pz-group"><span class="pz-level">${lv}</span><div class="pz-tiles">
            ${QCPuzzles.PUZZLES.filter((p) => p.level === lv).map((p) => `<button class="pz-tile" data-id="${p.id}" title="${p.title}">${p.id.slice(1)}</button>`).join("")}
          </div></div>`).join("")}
          <div class="pz-group"><span class="pz-level">Endless</span><div class="pz-tiles">
            <button class="pz-tile endless" id="pzEndless" title="Generate a new position"><svg class="ic"><use href="#i-dice"/></svg><span>New position</span></button></div></div>
        </div>
      </aside>
      <section class="board-col">
        <div class="player-bar turn" id="pzBar"><div class="avatar white" id="pzAvatar"></div>
          <div class="pinfo"><div class="pname" id="pzSide">White to move</div></div><div class="turn-flag">your move</div></div>
        <div class="board-wrap"><div id="pzBoard" class="board"></div></div>
      </section>
      <aside class="panel pz-panel">
        <header>
          <div class="kicker" id="pzKicker"></div>
          <div class="status" id="pzTitle"></div>
        </header>
        <p class="pz-task" id="pzTask"></p>
        <div class="pz-goal" id="pzGoal"></div>
        <div class="segmented" role="tablist" aria-label="Move type">
          <button class="mode pz-mode active" data-mode="move"><svg class="ic"><use href="#i-move"/></svg>Move</button>
          <button class="mode pz-mode" data-mode="split"><svg class="ic"><use href="#i-split"/></svg>Split</button>
          <button class="mode pz-mode" data-mode="merge"><svg class="ic"><use href="#i-merge"/></svg>Merge</button>
        </div>
        <div class="pz-feedback" id="pzFeedback"></div>
        <footer class="pz-actions">
          <button class="btn ghost" id="pzHint"><svg class="ic"><use href="#i-bulb"/></svg>Hint</button>
          <button class="btn ghost" id="pzReset"><svg class="ic"><use href="#i-reset"/></svg>Reset</button>
          <button class="btn ghost" id="pzShow"><svg class="ic"><use href="#i-eye"/></svg>Solution</button>
          <button class="btn primary" id="pzNext"><svg class="ic"><use href="#i-arrow"/></svg>Next</button>
        </footer>
      </aside>
    </div>`;

  root.querySelectorAll(".pz-tile[data-id]").forEach((b) => b.addEventListener("click", () => openPuzzle(QCPuzzles.PUZZLES.find((p) => p.id === b.dataset.id))));
  $("pzEndless").addEventListener("click", openEndless);
  root.querySelectorAll(".pz-mode").forEach((b) => b.addEventListener("click", () => pzSetMode(b.dataset.mode)));
  $("pzHint").addEventListener("click", () => showFeedback("hint", card({ badge: "Hint", body: PZ.pz.hint })));
  $("pzReset").addEventListener("click", () => openPuzzle(PZ.pz));
  $("pzShow").addEventListener("click", showSolution);
  $("pzNext").addEventListener("click", nextPuzzle);

  const first = QCPuzzles.PUZZLES.find((p) => !PZ.solved.has(p.id)) || QCPuzzles.PUZZLES[0];
  openPuzzle(first);
}

function openPuzzle(pz) {
  PZ.pz = pz;
  PZ.cache = {};
  PZ.game = pz.factory ? pz.factory() : QCPuzzles.makePuzzleGame(pz);
  PZ.done = false;
  pzSetMode("move");
  $("pzKicker").textContent = `${pz.level} · ${pz.id.startsWith("x") ? "generated" : "puzzle " + pz.id.slice(1)}`;
  $("pzTitle").textContent = pz.title;
  $("pzTask").textContent = pz.task;
  const g = pz.goal;
  $("pzGoal").innerHTML = g.type === "win" ? `<span>Goal</span>${g.min >= 1 ? "Win this move with certainty (100%)" : `Win this move with at least ${pct(g.min)} chance`}`
    : g.type === "best" ? `<span>Goal</span>Find the best possible chance to win`
    : g.type === "survive" ? `<span>Goal</span>Black's best reply wins ≤ ${pct(g.max)} of the time`
    : `<span>Goal</span>End with the piece 100% on the target`;
  const black = pz.side === "b";
  $("pzSide").textContent = `${black ? "Black" : "White"} to move`;
  $("pzAvatar").className = "avatar " + (black ? "black" : "white");
  showFeedback("idle", `<svg class="ic"><use href="#i-target"/></svg>Make your move on the board. Use Move, Split or Merge above.`);
  setRetry(false);
  document.querySelectorAll(".pz-tile[data-id]").forEach((t) => {
    t.classList.toggle("active", t.dataset.id === pz.id);
    t.classList.toggle("solved", PZ.solved.has(t.dataset.id));
  });
  $("pzEndless").classList.toggle("active", pz.id.startsWith("x"));
  $("pzShow").disabled = false;
  updateProgress();
  renderPuzzle();
  fitPuzzleBoard();
}

/**
 * Size the board so its column is exactly as tall as the panel. The panel is
 * measured once per puzzle with its longest message (the solved card), so the
 * board doesn't jump when feedback appears.
 */
function fitPuzzleBoard() {
  const layout = document.querySelector(".pz-layout"), panel = document.querySelector(".pz-panel"), fb = $("pzFeedback");
  if (!layout || !panel || !panel.offsetParent || !PZ.pz) return;
  layout.style.removeProperty("--sq");
  panel.style.minHeight = "";
  if (innerWidth <= 760) return;
  const saved = [fb.className, fb.innerHTML];
  fb.className = "pz-feedback good";
  fb.innerHTML = card({ badge: "Solved", value: "100%", label: "chance to win", move: "Knight b1 × c3",
    why: PZ.pz.lesson, roll: "measured a3: knight present · captured the black king on e5" });
  const h = panel.getBoundingClientRect().height;
  fb.className = saved[0];
  fb.innerHTML = saved[1];
  const bar = 52 + 8;                                   // player bar + gap above the board
  // the board also has to fit the window: below the top bar, and beside the list and the panel
  const stacked = innerWidth <= 1180;                  // the puzzle list sits above the board
  const above = stacked ? document.querySelector(".pz-side").getBoundingClientRect().height + 28 : 0;
  const byHeight = (innerHeight - 60 - 48 - above - bar) / 5;
  const side = stacked ? 0 : 230 + 28;
  const byWidth = (innerWidth - side - 400 - 28 - 48) / 5;
  const sq = Math.max(64, Math.min(124, (h - bar) / 5, byHeight, byWidth));
  layout.style.setProperty("--sq", sq + "px");
  panel.style.minHeight = sq * 5 + bar + "px";
}
window.addEventListener("resize", () => fitPuzzleBoard());

function openEndless() {
  showFeedback("hint", card({ badge: "Endless", body: "Generating a position…" }));
  setTimeout(() => {
    const seed = 1 + Math.floor(Math.random() * 99999);
    const pz = QCPuzzles.generateChallenge(seed);
    if (pz) openPuzzle(pz); else showFeedback("bad", card({ badge: "Endless", body: "Could not generate a position, try again." }));
  }, 20);
}

function nextPuzzle() {
  const list = QCPuzzles.PUZZLES;
  const i = list.findIndex((p) => p.id === PZ.pz.id);
  if (i < 0 || i === list.length - 1) return openEndless();
  openPuzzle(list.find((p, j) => j > i && !PZ.solved.has(p.id)) || list[i + 1]);
}

function updateProgress() {
  const n = QCPuzzles.PUZZLES.filter((p) => PZ.solved.has(p.id)).length, total = QCPuzzles.PUZZLES.length;
  $("pzProgress").innerHTML = `<div class="pzp-num"><b>${n}</b> / ${total}</div><div class="pzp-label">solved</div>
    <div class="qm-bar"><i style="width:${(100 * n) / total}%"></i></div>`;
}

// ------------------------------------------------------------------ interaction
function pzSetMode(mode) {
  PZ.mode = mode; PZ.sel = null; PZ.opts = null; PZ.picks = []; PZ.partner = null;
  document.querySelectorAll(".pz-mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  if (PZ.game) renderPuzzle();
}

function pzOptions(sq) {
  const o = PZ.game.options(QC.parse(sq));
  return {
    move: o.move.map(QC.name), capture: o.capture.map(QC.name), split: o.split.map(QC.name),
    merge: Object.fromEntries([...o.merge].map(([k, v]) => [QC.name(k), v.map(QC.name)])),
  };
}

function pzClick(sq) {
  if (PZ.done) return;
  const o = PZ.opts;
  const pick = (a) => submit(a);
  if (PZ.mode === "move") {
    if (PZ.sel && o && (o.move.includes(sq) || o.capture.includes(sq))) return pick(["move", PZ.sel, sq]);
  } else if (PZ.mode === "split") {
    if (PZ.sel && o && o.split.includes(sq) && !PZ.picks.includes(sq)) {
      PZ.picks.push(sq);
      if (PZ.picks.length === 2) return pick(["split", PZ.sel, PZ.picks[0], PZ.picks[1]]);
      return renderPuzzle();
    }
  } else {
    if (PZ.sel && o && !PZ.partner && o.merge[sq]) { PZ.partner = sq; return renderPuzzle(); }
    if (PZ.sel && PZ.partner && o.merge[PZ.partner].includes(sq)) return pick(["merge", PZ.sel, PZ.partner, sq]);
  }
  const p = PZ.game.pieces.get(QC.parse(sq));
  if (p && p.color === PZ.game.turn) {
    PZ.sel = sq; PZ.picks = []; PZ.partner = null; PZ.opts = pzOptions(sq);
  } else { PZ.sel = null; PZ.opts = null; }
  renderPuzzle();
}

function submit(a) {
  const act = [a[0], ...a.slice(1).map(QC.parse)];
  const res = QCPuzzles.grade(PZ.pz, act, PZ.cache);
  const text = actionText(act);
  // play it on the board too, with a real measurement, so the player sees what happened
  const entry = QCPuzzles.doAction(PZ.game, act);
  PZ.done = true; PZ.sel = null; PZ.opts = null; PZ.picks = []; PZ.partner = null;
  renderPuzzle([entry.from, entry.to, entry.extra].filter(Boolean));
  const roll = entry.events.length ? plainEvents(entry.events) : "";
  const gt = PZ.pz.goal.type;
  const target = gt === "survive" ? `goal ≤ ${pct(res.best)}` : gt === "certain" ? "goal 100%" : gt === "win" ? `goal ≥ ${pct(res.best)}` : `best is ${pct(res.best)}`;
  const lucky = PZ.game.winner === PZ.pz.side;
  if (res.ok) {
    PZ.solved.add(PZ.pz.id); saveSolved(); updateProgress();
    document.querySelector(`.pz-tile[data-id="${PZ.pz.id}"]`)?.classList.add("solved");
    showFeedback("good", card({ badge: "Solved", value: pct(res.value), label: res.label, move: text, why: PZ.pz.lesson, roll }));
  } else {
    showFeedback("bad", card({ badge: lucky ? "Lucky, but not quite" : "Not quite", value: pct(res.value), label: `${res.label} · ${target}`, move: text,
      body: lucky ? "It worked this time, but the same move fails too often. Look for a better one." : "Try another idea, or take a hint.", roll }));
    setRetry(true);
  }
}

function showSolution() {
  const pz = PZ.pz;
  let ans = pz.answer;
  if (!ans) {           // generated puzzle: let the solver find the best capture
    const g = pz.factory();
    let best = -1;
    for (const a of QCPuzzles.allActions(g)) {
      const v = QCPuzzles.winChance(pz.factory, a, g.turn);
      if (v > best) { best = v; ans = [a[0], ...a.slice(1).map(QC.name)]; }
    }
  }
  openPuzzle(pz);
  const marks = {};
  ans.slice(1).forEach((s, i) => (marks[s] = i === 0 ? "partner" : "qdot"));
  renderPuzzle([], marks);
  const act = [ans[0], ...ans.slice(1).map(QC.parse)];
  showFeedback("hint", card({ badge: "Solution", move: actionText(act), why: pz.lesson }));
}

// after a wrong move the Reset button becomes the obvious next step
function setRetry(on) {
  const b = $("pzReset");
  b.classList.toggle("retry", on);
  b.innerHTML = `<svg class="ic"><use href="#i-reset"/></svg>${on ? "Try again" : "Reset"}`;
}

const PIECE_WORD = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };

// engine events in plain words: "captured bK on e5" -> "captured the black king on e5"
function plainEvents(events) {
  return events.map((e) => e
    .replace(/\b([wb])([KQRBNP])\b/g, (_, c, k) => `the ${c === "w" ? "white" : "black"} ${PIECE_WORD[k]}`)
    .replace(/: ([KQRBNP]) (present|absent)/, (_, k, st) => `: ${PIECE_WORD[k]} ${st}`)
  ).join(" · ");
}

/** One feedback card: badge + big number, then your move, then why, then what happened. */
function card({ badge, value = "", label = "", move = "", why = "", body = "", roll = "" }) {
  return `<div class="fb-head"><span class="fb-badge">${badge}</span>${value ? `<span class="fb-stat"><b>${value}</b><small>${label}</small></span>` : ""}</div>`
    + (move ? `<div class="fb-row"><span>Your move</span>${move}</div>` : "")
    // the explanation folds away so the whole puzzle page fits on one screen
    + (why ? `<details class="fb-why"><summary>Why this works</summary><p>${why}</p></details>` : "")
    + (body ? `<p class="fb-body">${body}</p>` : "")
    + (roll ? `<div class="fb-roll">This time: ${roll}</div>` : "");
}

function showFeedback(kind, html) {
  const box = $("pzFeedback");
  box.className = "pz-feedback " + kind;
  box.innerHTML = html;
}

function renderPuzzle(last = [], forced = null) {
  const g = PZ.game, cells = {};
  for (const [sq, p] of g.pieces) cells[QC.name(sq)] = { color: p.color, kind: p.kind, prob: g.prob(sq) };
  let marks = forced || {};
  const o = PZ.opts;
  if (!forced && PZ.sel && o && settings.hints) {
    if (PZ.mode === "move") { o.move.forEach((s) => (marks[s] = "dot")); o.capture.forEach((s) => (marks[s] = "ring")); }
    else if (PZ.mode === "split") o.split.forEach((s) => (marks[s] = PZ.picks.includes(s) ? "picked" : "qdot"));
    else if (!PZ.partner) Object.keys(o.merge).forEach((s) => (marks[s] = "partner"));
    else { marks[PZ.partner] = "partner"; o.merge[PZ.partner].forEach((s) => (marks[s] = "qdot")); }
  }
  const board = buildBoard(cells, {
    marks, sel: PZ.sel, last, coords: settings.coords, badges: settings.badges,
    flip: PZ.pz.side === "b", onClick: pzClick,
  });
  board.id = "pzBoard";
  $("pzBoard").replaceWith(board);
}
