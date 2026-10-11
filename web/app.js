// Quantum Chess 5x5: single-page app (Play, How to play, Puzzles, Blog, Settings).
// The quantum state is computed by the Qiskit server when it is running, otherwise
// by the in-browser port in engine.js (window.QC).
"use strict";

const FILES = "abcde";
const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
const $ = (id) => document.getElementById(id);

// ================================================================== settings
const THEMES = [
  { id: "blue", label: "Ocean blue", sub: "Default", light: "#e9eef5", dark: "#7f9cc2" },
  { id: "pink", label: "Rose pink", sub: "Soft contrast", light: "#fcf0f3", dark: "#d98fa8" },
  { id: "lavender", label: "Lavender", sub: "Low glare", light: "#f2eefa", dark: "#9886c4" },
  { id: "green", label: "Tournament", sub: "Classic green", light: "#ecedd1", dark: "#779657" },
];
const DEFAULTS = { theme: "blue", ui: "dark", coords: true, badges: true, hints: true, anim: true, flip: false, engine: "auto", cview: "qiskit",
  opponent: "heisenberg", side: "w", rules: "quantum" };

// ---- match setup: who plays whom
// bots only play in the Bots section; the Play section is always two players
const botLevel = () => (S.mode === "bots" ? QBOT.LEVELS.find((l) => l.id === settings.opponent) || QBOT.LEVELS[1] : null);
const botSide = () => (botLevel() ? (settings.side === "w" ? "b" : "w") : null);
const isBotTurn = () => !!(S.state && !S.state.winner && botSide() === S.state.turn);
// the board is flipped by the Settings toggle, and also when you play Black against a bot
const boardFlipped = () => settings.flip !== (botSide() !== null && settings.side === "b");
function sideName(color) {
  const bot = botLevel();
  if (bot) return botSide() === color ? bot.name : "You";
  return color === "w" ? "White" : "Black";
}
const prefersLight = matchMedia("(prefers-color-scheme: light)");

// "dark" | "light" | "system" -> the appearance actually shown
function applyAppearance() {
  const ui = settings.ui === "system" ? (prefersLight.matches ? "light" : "dark") : settings.ui;
  document.documentElement.dataset.ui = ui;
}
prefersLight.addEventListener("change", () => { if (settings.ui === "system") applyAppearance(); });
let settings = { ...DEFAULTS };

function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("qc-settings") || "{}") }; } catch (e) { /* storage unavailable */ }
}
function saveSettings() {
  try { localStorage.setItem("qc-settings", JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}
function applySettings() {
  applyAppearance();
  document.querySelectorAll("[data-ui-mode]").forEach((el) => el.classList.toggle("active", el.dataset.uiMode === settings.ui));
  document.body.dataset.theme = settings.theme;
  document.body.classList.toggle("no-anim", !settings.anim);
  document.querySelectorAll("[data-setting]").forEach((el) => (el.checked = !!settings[el.dataset.setting]));
  document.querySelectorAll("input[name=engine]").forEach((el) => (el.checked = el.value === settings.engine));
  document.querySelectorAll(".theme-card").forEach((el) => el.classList.toggle("active", el.dataset.theme === settings.theme));
  const top = boardFlipped() ? "w" : "b", bottom = boardFlipped() ? "b" : "w";
  const label = (c) => sideName(c) + (botSide() === c ? ` <svg class="ic bot-ic"><use href="#i-robot"/></svg>` : "");
  $("nameTop").innerHTML = label(top);
  $("nameBottom").innerHTML = label(bottom);
  document.querySelector("#barTop .avatar").className = "avatar " + (top === "w" ? "white" : "black");
  document.querySelector("#barBottom .avatar").className = "avatar " + (bottom === "w" ? "white" : "black");
  document.querySelectorAll(".bot-card").forEach((el) => el.classList.toggle("active", el.dataset.opp === settings.opponent));
  document.body.dataset.mode = S.mode;
  document.querySelectorAll("[data-side]").forEach((el) => el.classList.toggle("active", el.dataset.side === settings.side));
  document.querySelectorAll("[data-rules]").forEach((el) => el.classList.toggle("active", el.dataset.rules === settings.rules));

  if (S.state) render();
}

// ================================================================== engines
class LocalEngine {
  constructor() { this.kind = "local"; this.label = "In-browser engine"; }
  async newGame(quantum) { this.g = new QC.Game({ quantum }); return this.g.snapshot(); }
  async undo(plies) { this.g = QC.Game.fromLog(this.g.log.slice(0, -plies), { quantum: this.g.quantum }); return this.g.snapshot(); }
  async options(sq) {
    const o = this.g.options(QC.parse(sq));
    return {
      move: o.move.map(QC.name), capture: o.capture.map(QC.name), split: o.split.map(QC.name),
      merge: Object.fromEntries([...o.merge].map(([k, v]) => [QC.name(k), v.map(QC.name)])),
    };
  }
  async play(kind, src, dst, extra) {
    const [a, b] = [QC.parse(src), QC.parse(dst)];
    if (kind === "move") this.g.move(a, b);
    else if (kind === "split") this.g.split(a, b, QC.parse(extra));
    else this.g.merge(a, QC.parse(extra), b);
    return this.g.snapshot();
  }
  circuit(state) { return state.trace && state.trace.length ? circuitSVG(state.trace, settings.cview) : null; }
  key(state) { return state.trace ? traceKey(state.trace) : []; }
}

class ServerEngine {
  constructor(version) { this.kind = "qiskit"; this.label = `Qiskit ${version}`; }
  async call(path, body) {
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
  }
  async newGame(quantum) { const s = await this.call("api/new", { quantum }); this.gid = s.id; return s; }
  async options(sq) { return this.call(`api/${this.gid}/options/${sq}`); }
  async play(kind, src, dst, extra) { return this.call(`api/${this.gid}/play`, { kind, src, dst, extra }); }
  async undo(plies) { return this.call(`api/${this.gid}/undo`, { plies }); }
  circuit(state) {
    if (!state.has_circuit) return null;
    // "Explained" is drawn in the page from the move's gate list; "Qiskit" is Qiskit's own drawing
    if (settings.cview === "explained" && state.trace) return circuitSVG(state.trace, "explained");
    const img = new Image();
    img.alt = "Qiskit circuit of the last move";
    img.src = `api/${this.gid}/circuit.svg?ply=${state.ply}`;
    return img;
  }
  key(state) { return state.trace ? traceKey(state.trace) : []; }
}

async function probeServer() {
  if (location.protocol === "file:") return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch("api/info", { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const info = await res.json();
    return info.engine === "qiskit" ? info.qiskit : null;
  } catch (e) { return null; }
}

let qiskitVersion = null;
async function chooseEngine() {
  qiskitVersion = await probeServer();
  const wantQiskit = settings.engine === "qiskit" || (settings.engine === "auto" && qiskitVersion);
  const make = () => (wantQiskit && qiskitVersion ? new ServerEngine(qiskitVersion) : new LocalEngine());
  S.engines = { play: make(), bots: make() };          // one game per section
  S.states = { play: null, bots: null };
  S.engine = S.engines[S.mode];
  if (!(wantQiskit && qiskitVersion) && settings.engine === "qiskit") toast("Qiskit server not found, so the in-browser engine is used. Start it with: uvicorn src.api:app");
  const pill = $("enginePill");
  pill.innerHTML = `<span class="edot"></span><span>${S.engine.kind === "qiskit" ? S.engine.label : "In-browser engine"}</span>`;
  pill.classList.toggle("qiskit", S.engine.kind === "qiskit");
  const chip = $("qiskitChip");
  chip.textContent = qiskitVersion ? `Connected · Qiskit ${qiskitVersion}` : "Server not running";
  chip.className = "chip " + (qiskitVersion ? "ok" : "off");
  $("circuitTitle").textContent = "Circuit";
  $("engineNote").textContent = qiskitVersion
    ? `Qiskit server detected (Qiskit ${qiskitVersion}). Now using: ${S.engine.label}.`
    : "No Qiskit server detected: the in-browser engine is used. It is a line-for-line port of the Qiskit engine, checked against it by tests/test_js_engine.py.";
}

// ================================================================== game state
const S = { engine: null, state: null, mode: "play", moveMode: "move", sel: null, opts: null, picks: [], partner: null, busy: false,
  engines: {}, states: { play: null, bots: null } };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 3400);
}

async function newGame(quantum) {
  try {
    S.state = S.states[S.mode] = await S.engine.newGame(quantum);
  } catch (e) {
    toast("Engine error: " + e.message);
    return;
  }
  clearSelection();
  S.reviewing = false;
  BOT.thinking = false;
  setMode("move");
  circuitToken++;
  $("circuit").innerHTML = `<span class="empty">Quantum moves draw their circuit here.</span>`;
  $("circuitKey").innerHTML = "";
  render();
}

function clearSelection() { S.sel = null; S.opts = null; S.picks = []; S.partner = null; }

function setMode(mode) {
  if (mode !== "move" && S.state && !S.state.quantum) { toast("Classical baseline: split and merge are switched off."); return; }
  S.moveMode = mode;
  clearSelection();
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  render();
}

const squareInfo = (sq) => S.state.squares.find((s) => s.sq === sq);

async function select(sq) {
  const info = squareInfo(sq);
  if (!info.piece || info.piece.color !== S.state.turn) { clearSelection(); render(); return; }
  S.sel = sq; S.picks = []; S.partner = null;
  S.opts = await S.engine.options(sq);
  if (S.moveMode === "split" && S.opts.split.length < 2) toast("This piece has no two empty squares to split onto.");
  if (S.moveMode === "merge" && Object.keys(S.opts.merge).length === 0) toast("Merge needs a piece that is split across two squares.");
  render();
}

async function play(kind, src, dst, extra = null) {
  S.busy = true;
  try {
    S.state = S.states[S.mode] = await S.engine.play(kind, src, dst, extra);
  } catch (e) {
    toast(e.message);
    S.busy = false;
    return;
  }
  clearSelection();
  S.busy = false;
  render();
  const last = S.state.log[S.state.log.length - 1];
  flashMeasured(last);
  if (last && last.events.length) toast(last.events[last.events.length - 1]);
  showCircuit();
  maybeBotMove();
}

// ---- computer opponent
const BOT = { thinking: false };

async function maybeBotMove() {
  if (!isBotTurn() || BOT.thinking) return;
  const lvl = botLevel();
  BOT.thinking = true;
  S.busy = true;
  $("status").textContent = `${lvl.name} is thinking…`;
  $("hint").textContent = "";
  await new Promise((r) => setTimeout(r, 420));          // let your move land first
  if (!isBotTurn()) { BOT.thinking = false; S.busy = false; return; }
  let a = null;
  try {
    // with the Qiskit server, think on an exact mirror of the game (same moves, same measurement results)
    const g = S.engine.kind === "local" ? S.engine.g : QBOT.mirror(S.state);
    a = QBOT.choose(g, lvl.id);
  } catch (e) { console.error(e); }
  BOT.thinking = false;
  S.busy = false;
  if (!a) { render(); return; }
  const n = QC.name;
  if (a[0] === "merge") await play("merge", n(a[1]), n(a[3]), n(a[2]));   // merge: src, dst, partner
  else await play(a[0], n(a[1]), n(a[2]), a[3] === null ? null : n(a[3]));
}

function newMatch() {
  newGame(S.mode === "bots" ? settings.rules !== "classical" : true).then(() => {
    const lvl = botLevel();
    if (lvl) toast(`New match against ${lvl.name} (${lvl.tag}). You play ${settings.side === "w" ? "White" : "Black"}.`);
    maybeBotMove();
  });
}

async function takeBack() {
  if (BOT.thinking || !S.state || !S.state.log.length) return;
  // against a bot, go back to your previous turn: your move, plus the bot's reply if it made one
  const bot = botSide();
  const last = S.state.log[S.state.log.length - 1];
  const plies = Math.min(S.state.log.length, bot && last.color === bot ? 2 : 1);
  S.busy = true;
  try {
    S.state = S.states[S.mode] = await S.engine.undo(plies);
  } catch (e) { toast(e.message); S.busy = false; return; }
  S.busy = false;
  clearSelection();
  S.reviewing = false;
  render();
  showCircuit();
  toast(plies === 1 ? "Took back the last move." : "Took back your move and the bot's reply.");
  maybeBotMove();
}

async function onSquare(sq) {
  if (S.busy || !S.state || S.state.winner || isBotTurn()) return;
  const o = S.opts;
  if (S.moveMode === "move") {
    if (S.sel && o && (o.move.includes(sq) || o.capture.includes(sq))) return play("move", S.sel, sq);
    return select(sq);
  }
  if (S.moveMode === "split") {
    if (S.sel && o && o.split.includes(sq) && !S.picks.includes(sq)) {
      S.picks.push(sq);
      if (S.picks.length === 2) return play("split", S.sel, S.picks[0], S.picks[1]);
      return render();
    }
    return select(sq);
  }
  if (S.sel && o && !S.partner && o.merge[sq]) { S.partner = sq; return render(); }
  if (S.sel && S.partner && o.merge[S.partner].includes(sq)) return play("merge", S.sel, sq, S.partner);
  return select(sq);
}

// ================================================================== board rendering (shared)
// the one-file build (tools/build_single_page.py) inlines the images as window.PIECE_DATA
const pieceUrl = (color, kind) => (window.PIECE_DATA ? window.PIECE_DATA[color + kind] : `pieces/${color}${kind}.svg`);

/** Build a 5x5 board element. `cells` maps square -> {color, kind, prob}; `marks` maps square -> css class. */
function buildBoard(cells, { marks = {}, last = [], sel = null, coords = true, flip = false, badges = true, onClick = null, mini = false } = {}) {
  const board = document.createElement("div");
  board.className = "board" + (mini ? " mini" : "");
  const ranks = flip ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
  const files = flip ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  for (const r of ranks) {
    for (const f of files) {
      const sq = FILES[f] + (r + 1);
      const el = document.createElement("div");
      el.className = "sq " + ((f + r) % 2 === 0 ? "dark" : "light");
      el.dataset.sq = sq;
      if (last.includes(sq)) el.classList.add("last");
      if (sel === sq) el.classList.add("sel");
      if (coords && f === files[0]) el.insertAdjacentHTML("beforeend", `<span class="coord rank">${r + 1}</span>`);
      if (coords && r === ranks[4]) el.insertAdjacentHTML("beforeend", `<span class="coord file">${FILES[f]}</span>`);
      const c = cells[sq];
      if (c) {
        const p = document.createElement("div");
        p.className = "piece";
        p.style.backgroundImage = `url(${pieceUrl(c.color, c.kind)})`;
        if (c.prob < 0.9999) {
          p.classList.add("maybe");
          p.style.opacity = (0.3 + 0.7 * c.prob).toFixed(2);
          const pct = Math.round(c.prob * 100);
          if (badges) el.insertAdjacentHTML("beforeend", `<span class="prob-num">${pct}%</span><span class="prob-bar"><i style="width:${pct}%"></i></span>`);
        }
        el.appendChild(p);
      }
      if (marks[sq]) el.insertAdjacentHTML("beforeend", `<span class="${marks[sq]}"></span>`);
      if (onClick) el.addEventListener("click", () => onClick(sq));
      board.appendChild(el);
    }
  }
  return board;
}

function render() {
  if (!S.state) return;
  const cells = {};
  for (const s of S.state.squares) if (s.piece) cells[s.sq] = { ...s.piece, prob: s.prob };
  const last = S.state.log[S.state.log.length - 1];
  const board = buildBoard(cells, {
    marks: settings.hints ? hintMap() : {}, sel: S.sel, coords: settings.coords, flip: boardFlipped(),
    badges: settings.badges, last: last ? [last.from, last.to, last.extra].filter(Boolean) : [], onClick: onSquare,
  });
  board.id = "board";
  $("board").replaceWith(board);
  renderPanel();
}

function hintMap() {
  const m = {}, o = S.opts;
  if (!S.sel || !o) return m;
  if (S.moveMode === "move") {
    o.move.forEach((s) => (m[s] = "dot"));
    o.capture.forEach((s) => (m[s] = "ring"));
  } else if (S.moveMode === "split") {
    o.split.forEach((s) => (m[s] = S.picks.includes(s) ? "picked" : "qdot"));
  } else if (!S.partner) {
    Object.keys(o.merge).forEach((s) => (m[s] = "partner"));
  } else {
    m[S.partner] = "partner";
    o.merge[S.partner].forEach((s) => (m[s] = "qdot"));
  }
  return m;
}

function renderPanel() {
  const st = S.state;
  const winnerName = st.winner === "w" || st.winner === "b" ? sideName(st.winner) : "";
  $("status").textContent = st.winner ? (st.winner === "draw" ? "Draw" : `${winnerName} wins`) : (BOT.thinking ? `${botLevel().name} is thinking…` : botLevel() ? (st.turn === botSide() ? `${botLevel().name} to move` : "Your move") : `${st.turn === "w" ? "White" : "Black"} to move`);
  const cap = QC.MAX_QUBITS;
  $("qubits").querySelector(".qm-val").textContent = `${st.qubits} / ${cap}`;
  $("qubits").querySelector(".qm-bar i").style.width = `${(100 * st.qubits) / cap}%`;
  const whiteBottom = !boardFlipped();
  $("barBottom").classList.toggle("turn", !st.winner && st.turn === (whiteBottom ? "w" : "b"));
  $("barTop").classList.toggle("turn", !st.winner && st.turn === (whiteBottom ? "b" : "w"));
  $("modeTag").textContent = `${st.quantum ? "Quantum game" : "Classical baseline"} · move ${Math.floor(st.ply / 2) + 1}`;
  $("hint").textContent = hintText();
  renderMoves();
  renderCaptured(whiteBottom);
  const ov = $("overlay");
  if (st.winner && !S.reviewing) {
    const draw = st.winner === "draw";
    const king = (c) => `<img src="${pieceUrl(c, "K")}" alt="">`;
    $("ovCrown").className = "ov-crown " + (draw ? "draw" : st.winner === "w" ? "white" : "black");
    $("ovCrown").innerHTML = draw ? king("w") + king("b") : king(st.winner);
    $("ovKicker").textContent = `Game over · ${st.quantum ? "quantum game" : "classical baseline"}`;
    $("overlayTitle").textContent = draw ? "Draw" : winnerName === "You" ? "You win" : `${winnerName} wins`;
    $("overlaySub").textContent = st.end_reason || (draw ? "Draw." : "The king was captured.");
    // a short summary of the game
    const ev = st.log.flatMap((e) => e.events);
    const stat = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
    $("ovStats").innerHTML = stat(Math.ceil(st.log.length / 2), "moves")
      + stat(ev.filter((e) => e.startsWith("captured")).length, "captures")
      + stat(st.log.filter((e) => e.kind === "split" || e.kind === "merge").length, "quantum moves")
      + stat(ev.filter((e) => e.startsWith("measured")).length, "measurements");
    ov.classList.remove("hidden");
  } else ov.classList.add("hidden");
}

function hintText() {
  if (S.state.winner) return "Game over.";
  if (BOT.thinking) return "";
  if (isBotTurn()) return `${botLevel().name} to move.`;
  if (S.moveMode === "move") return S.sel ? "Click a dot to move, a ring to capture (captures measure the board)." : "Select a piece to see where it can go.";
  if (S.moveMode === "split") return S.sel ? `Pick two empty squares (${S.picks.length}/2). The piece ends up on both, 50% each.` : "Select a non-pawn piece to split it across two squares.";
  if (!S.sel) return "Select one half of a split piece.";
  return S.partner ? "Pick the square where both halves should interfere." : "Now click its other half (outlined).";
}

function moveText(e) {
  if (e.kind === "split") return `${e.from}<span class="q">→</span>${e.to}<span class="q">|</span>${e.extra}`;
  if (e.kind === "merge") return `${e.from}<span class="q">|</span>${e.extra}<span class="q">→</span>${e.to}`;
  return `${e.from}${e.kind === "capture" ? "×" : "-"}${e.to}`;
}

function renderMoves() {
  const box = $("moves");
  const log = S.state.log;
  if (!log.length) { box.innerHTML = `<p class="empty">No moves yet. ${S.state.turn === "w" ? "White" : "Black"} starts.</p>`; return; }
  // chess.com style: number, White, Black; piece figurine before each move; latest move in a chip
  const last = log.length - 1;
  const cell = (e, i) => {
    if (!e) return `<div class="mv"></div>`;
    const tip = e.events.length ? plainEvents(e.events) : "";
    // the cyan dot marks quantum events only: a measurement, an entanglement or a forced collapse
    const quantumEvent = e.events.some((ev) => /measured|entangled|qubit budget/.test(ev));
    // figurines in one colour for both sides, as chess.com does, so they read on the dark list
    const fig = e.piece === "P" ? "" : `<img class="fig-ico" src="${pieceUrl("w", e.piece)}" alt="${e.piece}">`;
    return `<div class="mv${i === last ? " cur" : ""}${e.ok ? "" : " fail"}"${tip ? ` title="${tip}"` : ""}>`
      + `<span class="mchip">${fig}<span class="mt">${moveText(e)}</span>${quantumEvent ? `<span class="qmark" aria-label="${tip}"></span>` : ""}</span></div>`;
  };
  let html = "";
  for (let i = 0; i < log.length; i += 2) {
    html += `<div class="mrow"><span class="mno">${i / 2 + 1}.</span>${cell(log[i], i)}${cell(log[i + 1], i + 1)}</div>`;
  }
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function renderCaptured(whiteBottom) {
  const alive = new Set(S.state.squares.filter((s) => s.piece).map((s) => s.piece.pid));
  const lost = { w: [], b: [] };
  ["R", "N", "B", "Q", "K"].forEach((k, f) => {
    for (const c of ["w", "b"]) {
      if (!alive.has(`${c}${k}${FILES[f]}`)) lost[c].push(c + k);
      if (!alive.has(`${c}P${FILES[f]}`)) lost[c].push(c + "P");
    }
  });
  const icons = (list) => list.map((s) => `<span style="background-image:url(${pieceUrl(s[0], s[1])})"></span>`).join("");
  // each bar shows what that player has captured
  $(whiteBottom ? "capBottom" : "capTop").innerHTML = icons(lost.b);
  $(whiteBottom ? "capTop" : "capBottom").innerHTML = icons(lost.w);
}

function flashMeasured(entry) {
  if (!entry || !settings.anim) return;
  for (const ev of entry.events) {
    const m = ev.match(/measured ([a-e][1-5])/);
    const el = m && document.querySelector(`#board .sq[data-sq="${m[1]}"]`);
    if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }
}

let circuitToken = 0;
function showCircuit() {
  const box = $("circuit");
  const token = ++circuitToken;            // a slow image from an older move must not overwrite a newer one
  const node = S.engine.circuit(S.state);
  const key = node ? circuitKey(S.engine.key(S.state)) : "";
  const wasOpen = $("circuitKey").querySelector("details")?.open;
  // folded on the Play panel so it keeps the board's height; open on request
  $("circuitKey").innerHTML = key ? `<details${wasOpen ? " open" : ""}><summary>What do these boxes mean?</summary>${key}</details>` : "";
  document.querySelectorAll("[data-cview]").forEach((b) => b.classList.toggle("active", b.dataset.cview === settings.cview));
  if (!node) { box.innerHTML = `<span class="empty">Classical move: no qubits were needed.</span>`; return; }
  box.innerHTML = "";
  if (typeof node === "string") box.innerHTML = node;
  else {
    box.innerHTML = `<span class="empty">Drawing circuit…</span>`;
    node.onload = () => { if (token === circuitToken) { box.innerHTML = ""; box.appendChild(node); } };
    node.onerror = () => { if (token === circuitToken) box.innerHTML = `<span class="empty">Circuit drawing unavailable.</span>`; };
  }
}

// ================================================================== circuit drawing (in-browser engine)
// engine gate names -> key ids
const GATE_ID = { "iSWAP": "iswap", "√iSWAP": "sqrt", "iSWAP†": "iswapdg", "√iSWAP†": "sqrtdg" };

// the gate name as HTML: a radical whose bar covers the whole word, so √iSWAP reads as √(iSWAP)
const RAD = `<span class="rad"><span class="rad-sign">√</span><span class="rad-body">iSWAP</span></span>`;
const GATE_HTML = { iswap: "iSWAP", sqrt: RAD, iswapdg: "iSWAP<sup>†</sup>", sqrtdg: `${RAD}<sup>†</sup>`, x: "X", psi: "ψ" };

// one line per box type, shown under every circuit
const KEY_TEXT = {
  x: "the piece starts on this square",
  psi: "this square's state from earlier moves",
  sqrt: "square root of iSWAP: sends half of the piece's chance to the other square",
  iswap: "sends all of the piece's chance to the other square",
  iswapdg: "iSWAP run backwards (used to merge)",
  sqrtdg: "√iSWAP run backwards (used to merge)",
  control: "the box only acts if this square is empty",
  measure: "look at the square: the piece is there or it isn't",
};
const KEY_ORDER = ["x", "psi", "sqrt", "iswap", "iswapdg", "sqrtdg", "control", "measure"];

function circuitKey(keys) {
  const sym = (k) => k === "control" ? `<span class="ck-sym ck-dot"></span>`
    : k === "measure" ? `<span class="ck-sym ck-meter"></span>`
    : `<span class="ck-sym ${k === "x" ? "ck-blue" : k === "psi" ? "ck-grey" : ""}">${GATE_HTML[k]}</span>`;
  const rows = KEY_ORDER.filter((k) => keys.includes(k));
  if (!rows.length) return "";
  return `<div class="circuit-key"><div class="ck-intro">Each line is a square. Boxes move the piece's chance between squares, left to right.</div>`
    + rows.map((k) => `<div class="ck-row">${sym(k)}<span>${KEY_TEXT[k]}</span></div>`).join("") + `</div>`;
}

function traceKey(trace) {
  const keys = new Set();
  const inited = new Set();
  for (const t of trace) {
    if (t.op === "init") { inited.add(t.sq); if (t.occupied) keys.add("x"); }
    else if (t.op === "measure") keys.add("measure");
    else { keys.add(GATE_ID[t.gate]); if (t.controls.length) keys.add("control"); }
  }
  const wires = new Set(trace.flatMap((t) => (t.op === "gate" ? [...t.controls, ...t.squares] : [t.sq])));
  if ([...wires].some((w) => !inited.has(w))) keys.add("psi");
  return [...keys];
}

// plain-English names for the "Explained" view
const PLAIN = { "iSWAP": "Full swap", "√iSWAP": "Half swap", "iSWAP†": "Undo swap", "√iSWAP†": "Undo half swap" };

// gate name in Qiskit's notation; the radical's bar runs over the whole of "iSWAP"
function gateSVG(name, cx, cy) {
  const sqrt = name.startsWith("√"), dagger = name.endsWith("†");
  const tw = 40;                                  // width of "iSWAP" at 13px
  const lead = sqrt ? 9 : 0, trail = dagger ? 6 : 0;
  const x0 = cx - (lead + tw + trail) / 2, ty = cy + 4.5;
  let s = `<text x="${x0 + lead}" y="${ty}" font-size="13" fill="#fff" textLength="${tw}" lengthAdjust="spacingAndGlyphs">iSWAP</text>`;
  if (sqrt) s += `<path d="M${x0} ${ty - 5} l2.5 -1.5 l3 6.5 l3.5 -13 h${tw + 2}" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>`;
  if (dagger) s += `<text x="${x0 + lead + tw + (sqrt ? 3 : 1)}" y="${ty - 7}" font-size="10" fill="#fff">†</text>`;
  return s;
}

/**
 * Draw one move's circuit as SVG.
 * view "qiskit":    the layout and colours of Qiskit's own drawer (style "iqp"): magenta
 *                   multi-qubit boxes with 0/1 qubit indices, blue X, grey meters with a
 *                   double line down to the classical register, open control dots.
 * view "explained": the same circuit with plain-English box names.
 */
function circuitSVG(trace, view = "qiskit") {
  const plain = view === "explained";
  const MAG = "#9f1853", BLUE = "#002d9c", GREY = "#8d8d8d", INK = "#161616";
  const wires = [];
  const touch = (s) => { if (!wires.includes(s)) wires.push(s); };
  trace.forEach((t) => (t.op === "gate" ? [...t.controls, ...t.squares] : [t.sq]).forEach(touch));
  const inited = new Set(trace.filter((t) => t.op === "init").map((t) => t.sq));
  const nMeas = trace.filter((t) => t.op === "measure").length;

  // columns: the start-of-move boxes (X / ψ) share the first column, then one op per column
  const start = [];
  wires.forEach((w) => { if (!inited.has(w)) start.push({ kind: "psi", wire: w }); });
  trace.forEach((t) => { if (t.op === "init" && t.occupied) start.push({ kind: "x", wire: t.sq }); });
  const cols = [];
  if (start.length) cols.push({ kind: "start", items: start, w: plain ? 70 : 44 });
  let m = 0;
  trace.forEach((t) => {
    if (t.op === "gate") cols.push({ kind: "gate", t, w: plain ? (PLAIN[t.gate].length > 9 ? 112 : 96) : 84 });
    else if (t.op === "measure") cols.push({ kind: "measure", t, idx: m++, w: 56 });
  });

  const L = 58, ROW = 56, TOP = 30, GAP = 16;
  const yOf = (w) => TOP + wires.indexOf(w) * ROW;
  const yC = TOP + wires.length * ROW + (nMeas ? 6 : -ROW + 20);
  const width = L + cols.reduce((a, c) => a + c.w + GAP, GAP) + 10;
  const height = nMeas ? yC + 26 : TOP + (wires.length - 1) * ROW + 34;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif">`;
  svg += `<rect width="${width}" height="${height}" fill="#fff"/>`;

  // wires and their labels (Qiskit sets register names in italic)
  wires.forEach((w) => {
    const y = yOf(w);
    svg += `<text x="${L - 12}" y="${y + 5.5}" font-size="16" font-style="italic" fill="${INK}" text-anchor="end">${w}</text>`;
    svg += `<line x1="${L - 4}" y1="${y}" x2="${width - 6}" y2="${y}" stroke="${INK}" stroke-width="1.6"/>`;
  });
  if (nMeas) {
    svg += `<text x="${L - 12}" y="${yC + 5.5}" font-size="15" fill="${INK}" text-anchor="end">m</text>`;
    svg += `<line x1="${L - 4}" y1="${yC - 2}" x2="${width - 6}" y2="${yC - 2}" stroke="#778899" stroke-width="1.4"/>`;
    svg += `<line x1="${L - 4}" y1="${yC + 2}" x2="${width - 6}" y2="${yC + 2}" stroke="#778899" stroke-width="1.4"/>`;
    svg += `<line x1="${L + 2}" y1="${yC + 7}" x2="${L + 10}" y2="${yC - 7}" stroke="#778899" stroke-width="1.4"/>`;
    svg += `<text x="${L + 6}" y="${yC - 9}" font-size="10" fill="#778899" text-anchor="middle">${nMeas}</text>`;
  }

  let x = L + GAP;
  for (const c of cols) {
    const cx = x + c.w / 2;
    if (c.kind === "start") {
      for (const it of c.items) {
        const y = yOf(it.wire), isX = it.kind === "x";
        const label = plain ? (isX ? "Piece" : "Before") : (isX ? "X" : "ψ");
        svg += `<rect x="${cx - c.w / 2 + 2}" y="${y - 18}" width="${c.w - 4}" height="36" fill="${isX ? BLUE : MAG}"/>`;
        svg += `<text x="${cx}" y="${y + 5}" font-size="${plain ? 12 : 14}" fill="#fff" text-anchor="middle">${label}</text>`;
      }
    } else if (c.kind === "measure") {
      const y = yOf(c.t.sq);
      svg += `<line x1="${cx - 2}" y1="${y + 18}" x2="${cx - 2}" y2="${yC - 8}" stroke="#778899" stroke-width="1.4"/>`;
      svg += `<line x1="${cx + 2}" y1="${y + 18}" x2="${cx + 2}" y2="${yC - 8}" stroke="#778899" stroke-width="1.4"/>`;
      svg += `<path d="M${cx - 6} ${yC - 10} L${cx} ${yC - 1} L${cx + 6} ${yC - 10} Z" fill="#778899"/>`;
      svg += `<text x="${cx + 9}" y="${yC + 16}" font-size="10" fill="${INK}">${c.idx}</text>`;
      svg += `<rect x="${cx - 18}" y="${y - 18}" width="36" height="36" fill="#a8a8a8"/>`;
      svg += `<path d="M${cx - 11} ${y + 6} A 11 11 0 0 1 ${cx + 11} ${y + 6}" stroke="${INK}" fill="none" stroke-width="1.6"/>`;
      svg += `<line x1="${cx}" y1="${y + 6}" x2="${cx + 8}" y2="${y - 8}" stroke="${INK}" stroke-width="1.6"/>`;
      if (plain) svg += `<text x="${cx}" y="${y + 32}" font-size="11" fill="${INK}" text-anchor="middle">${c.t.result ? "found" : "empty"}</text>`;
    } else {
      const t = c.t, tg = t.squares.map(yOf);
      const top = Math.min(...tg) - 22, bot = Math.max(...tg) + 22;
      for (const ctl of t.controls) {
        const y = yOf(ctl);
        svg += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y < top ? top : bot}" stroke="${MAG}" stroke-width="2"/>`;
        svg += `<circle cx="${cx}" cy="${y}" r="7" fill="#fff" stroke="${MAG}" stroke-width="2"/>`;
      }
      svg += `<rect x="${x + 2}" y="${top}" width="${c.w - 4}" height="${bot - top}" fill="${MAG}"/>`;
      if (!plain) t.squares.forEach((s, i) => { svg += `<text x="${x + 8}" y="${yOf(s) + 4.5}" font-size="12" fill="#fff">${i}</text>`; });
      const mid = (top + bot) / 2;
      svg += plain
        ? `<text x="${cx}" y="${mid + 4.5}" font-size="12.5" fill="#fff" text-anchor="middle">${PLAIN[t.gate]}</text>`
        : gateSVG(t.gate, cx + 6, mid);
    }
    x += c.w + GAP;
  }
  return svg + "</svg>";
}

// ================================================================== charts (blog)
function barChart(rows, { max = null, unit = "", color = "#5fd4e8" } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value)) * 1.15;
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row"><div class="bar-label">${r.label}</div>
      <div class="bar-track"><div class="bar" style="width:${(100 * r.value) / top}%;background:${r.color || color}"></div></div>
      <div class="bar-value">${r.text ?? r.value + unit}</div></div>`).join("")}</div>`;
}

function lineChart(points, { xLabel = "", yLabel = "", color = "#5fd4e8" } = {}) {
  const W = 560, H = 240, L = 48, B = 36, T = 12, R = 16;
  const xs = points.map((p) => p[0]), xmax = Math.max(...xs);
  const px = (x) => L + (x / xmax) * (W - L - R), py = (y) => T + (1 - y) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${yLabel} vs ${xLabel}">`;
  for (const y of [0, 0.25, 0.5, 0.75, 1]) {
    s += `<line x1="${L}" x2="${W - R}" y1="${py(y)}" y2="${py(y)}" class="grid"/>`;
    s += `<text x="${L - 8}" y="${py(y) + 4}" text-anchor="end" class="tick">${y.toFixed(2)}</text>`;
  }
  for (const x of xs) s += `<text x="${px(x)}" y="${H - B + 18}" text-anchor="middle" class="tick">${x * 100}%</text>`;
  s += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")}"/>`;
  for (const p of points) s += `<circle cx="${px(p[0])}" cy="${py(p[1])}" r="4.5" fill="${color}"><title>${p[0] * 100}% error: ${p[1].toFixed(3)}</title></circle>`;
  s += `<text x="${(W + L) / 2}" y="${H - 4}" text-anchor="middle" class="axis">${xLabel}</text>`;
  return s + "</svg>";
}

// ================================================================== routing
// The board and panel are one set of elements, shown in Play or in Bots; each section keeps its own game.
function switchMode(mode) {
  const host = mode === "bots" ? $("botsArena") : $("view-play");
  // only the game's own board and panel move (Puzzles has its own, which must stay put)
  if (!host.contains($("gameBoardCol"))) {
    host.appendChild($("gameBoardCol"));
    host.appendChild($("gamePanel"));
  }
  if (S.mode === mode && S.state) return;
  S.mode = mode;
  S.engine = S.engines[mode];
  S.state = S.states[mode];
  clearSelection();
  BOT.thinking = false;
  S.busy = false;
  applySettings();
  if (!S.state) { if (S.engine) newMatch(); return; }
  render();
  showCircuit();
  maybeBotMove();
}

/** Size the game board so it (and the panel beside it) fill the window height, in Play and in Bots alike. */
function fitGameBoard() {
  const play = $("view-play"), arena = $("botsArena"), panel = $("gamePanel");
  play.style.removeProperty("--sq"); arena.style.removeProperty("--sq"); panel.style.height = "";
  if (innerWidth <= 1100) return;
  const avail = innerHeight - 60 - 48 - 4;            // below the top bar and the page padding
  const bars = 52 + 8 + 8 + 52;                       // two player bars and their gaps
  const byHeight = (avail - bars) / 5;
  const sideCol = S.mode === "bots" ? 250 + 28 : 0;   // the bots column, when there is one
  const byWidth = (innerWidth - sideCol - 360 - 28 - 48) / 5;
  const sq = Math.max(64, Math.min(112, byHeight, byWidth));
  (S.mode === "bots" ? arena : play).style.setProperty("--sq", sq + "px");
  panel.style.height = 5 * sq + bars + "px";          // the panel never grows past the board
}
const fitBotsBoard = fitGameBoard;

function route() {
  // "#blog/<slug>" opens one article; every other route is a single word
  const [r, sub] = (location.hash || "#play").slice(1).split("/");
  const views = ["play", "manual", "puzzles", "bots", "blog"];
  const view = views.includes(r) ? r : "play";
  for (const v of views) $("view-" + v).classList.toggle("hidden", v !== view);
  if (view === "play" || view === "bots") switchMode(view);
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === view));
  if (view === "manual" && !$("manualBody").dataset.built) { buildManual($("manualBody")); $("manualBody").dataset.built = 1; }
  if (view === "blog") renderBlog($("blogBody"), sub);
  if (view === "puzzles" && !$("view-puzzles").dataset.built) { buildPuzzles($("view-puzzles")); $("view-puzzles").dataset.built = 1; }
  if (view === "puzzles") fitPuzzleBoard();
  if (view === "play" || view === "bots") fitGameBoard();
  window.scrollTo(0, 0);
}

// ================================================================== wiring
function wire() {
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("newQuantum").addEventListener("click", () => newGame(true));
  $("newClassical").addEventListener("click", () => newGame(false));
  $("panelNew").addEventListener("click", newMatch);
  $("flipBoard").addEventListener("click", () => { settings.flip = !settings.flip; saveSettings(); applySettings(); });
  $("overlayNew").addEventListener("click", () => (S.mode === "bots" ? newMatch() : newGame(S.state ? S.state.quantum : true)));
  $("takeBack").addEventListener("click", takeBack);
  $("botCards").innerHTML = QBOT.LEVELS.map((l, i) => `
    <button class="bot-card" data-opp="${l.id}" title="${l.blurb}">
      <span class="bot-badge"><svg class="ic"><use href="#i-robot"/></svg></span>
      <span class="bot-text"><b>${l.name}</b><small>Level ${i + 1} · ${l.tag}</small></span>
      <span class="bot-go"><svg class="ic"><use href="#i-play"/></svg></span>
    </button>`).join("");
  document.querySelectorAll(".bot-card").forEach((b) => b.addEventListener("click", () => {
    settings.opponent = b.dataset.opp; saveSettings(); applySettings(); newMatch();
  }));
  window.addEventListener("resize", () => { if (!$("view-play").classList.contains("hidden") || !$("view-bots").classList.contains("hidden")) fitGameBoard(); });
  document.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => { settings.side = b.dataset.side; saveSettings(); applySettings(); newMatch(); }));
  document.querySelectorAll("[data-rules]").forEach((b) => b.addEventListener("click", () => { settings.rules = b.dataset.rules; saveSettings(); applySettings(); newMatch(); }));
  // close the result card to look at the final position; the panel still shows the result
  $("overlayReview").addEventListener("click", () => { S.reviewing = true; render(); });
  $("settingsBtn").addEventListener("click", () => $("settings").showModal());
  document.querySelectorAll("[data-cview]").forEach((b) => b.addEventListener("click", () => {
    settings.cview = b.dataset.cview;
    saveSettings();
    $("circuitKey").innerHTML = "";
    if (S.state && S.state.log.length) showCircuit();
    else document.querySelectorAll("[data-cview]").forEach((x) => x.classList.toggle("active", x.dataset.cview === settings.cview));
  }));

  $("themes").innerHTML = THEMES.map((t) => `
    <button class="theme-card" data-theme="${t.id}" aria-label="${t.label} board theme">
      <span class="theme-preview"><i style="background:${t.light}"></i><i style="background:${t.dark}"></i><i style="background:${t.dark}"></i><i style="background:${t.light}"></i></span>
      <span><span class="tname">${t.label}</span><br><span class="tsub">${t.sub}</span></span>
      <svg class="ic"><use href="#i-check"/></svg></button>`).join("");
  document.querySelectorAll("[data-ui-mode]").forEach((b) => b.addEventListener("click", () => {
    settings.ui = b.dataset.uiMode; saveSettings(); applySettings();
  }));
  document.querySelectorAll(".theme-card").forEach((b) => b.addEventListener("click", () => {
    settings.theme = b.dataset.theme; saveSettings(); applySettings();
  }));
  document.querySelectorAll("[data-setting]").forEach((el) => el.addEventListener("change", () => {
    settings[el.dataset.setting] = el.checked; saveSettings(); applySettings();
  }));
  document.querySelectorAll("input[name=engine]").forEach((el) => el.addEventListener("change", async () => {
    settings.engine = el.value; saveSettings();
    await chooseEngine();
    newMatch();
    toast(`Engine: ${S.engine.label}. A new match was started.`);
  }));
  $("resetSettings").addEventListener("click", () => { settings = { ...DEFAULTS }; saveSettings(); applySettings(); });

  document.addEventListener("keydown", (e) => {
    if ($("settings").open || (location.hash && location.hash !== "#play")) return;
    if (e.key === "Escape") { clearSelection(); render(); }
    if (e.key === "1") setMode("move");
    if (e.key === "2") setMode("split");
    if (e.key === "3") setMode("merge");
  });
  window.addEventListener("hashchange", route);
}

(async function main() {
  loadSettings();
  wire();
  applySettings();
  route();
  await chooseEngine();
  newMatch();
})();
