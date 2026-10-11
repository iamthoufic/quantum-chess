// Quantum Chess 5x5: single-page app (Play, How to play, Classical vs Quantum, Settings).
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
const DEFAULTS = { theme: "blue", coords: true, badges: true, hints: true, anim: true, flip: false, engine: "auto" };
let settings = { ...DEFAULTS };

function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("qc-settings") || "{}") }; } catch (e) { /* storage unavailable */ }
}
function saveSettings() {
  try { localStorage.setItem("qc-settings", JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}
function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.classList.toggle("no-anim", !settings.anim);
  document.querySelectorAll("[data-setting]").forEach((el) => (el.checked = !!settings[el.dataset.setting]));
  document.querySelectorAll("input[name=engine]").forEach((el) => (el.checked = el.value === settings.engine));
  document.querySelectorAll(".theme-card").forEach((el) => el.classList.toggle("active", el.dataset.theme === settings.theme));
  $("nameTop").textContent = settings.flip ? "White" : "Black";
  $("nameBottom").textContent = settings.flip ? "Black" : "White";
  document.querySelector("#barTop .avatar").className = "avatar " + (settings.flip ? "white" : "black");
  document.querySelector("#barBottom .avatar").className = "avatar " + (settings.flip ? "black" : "white");
  if (S.state) render();
}

// ================================================================== engines
class LocalEngine {
  constructor() { this.kind = "local"; this.label = "In-browser engine"; }
  async newGame(quantum) { this.g = new QC.Game({ quantum }); return this.g.snapshot(); }
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
  circuit(state) { return state.trace && state.trace.length ? circuitSVG(state.trace) : null; }
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
  circuit(state) {
    if (!state.has_circuit) return null;
    const img = new Image();
    img.alt = "Qiskit circuit of the last move";
    img.src = `api/${this.gid}/circuit.svg?ply=${state.ply}`;
    return img;
  }
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
  if (wantQiskit && qiskitVersion) S.engine = new ServerEngine(qiskitVersion);
  else {
    S.engine = new LocalEngine();
    if (settings.engine === "qiskit") toast("Qiskit server not found, so the in-browser engine is used. Start it with: uvicorn src.api:app");
  }
  const pill = $("enginePill");
  pill.innerHTML = `<span class="edot"></span><span>${S.engine.kind === "qiskit" ? S.engine.label : "In-browser engine"}</span>`;
  pill.classList.toggle("qiskit", S.engine.kind === "qiskit");
  const chip = $("qiskitChip");
  chip.textContent = qiskitVersion ? `Connected · Qiskit ${qiskitVersion}` : "Server not running";
  chip.className = "chip " + (qiskitVersion ? "ok" : "off");
  $("circuitTitle").textContent = S.engine.kind === "qiskit" ? "Qiskit circuit of the last move" : "Circuit of the last move";
  $("engineNote").textContent = qiskitVersion
    ? `Qiskit server detected (Qiskit ${qiskitVersion}). Now using: ${S.engine.label}.`
    : "No Qiskit server detected: the in-browser engine is used. It is a line-for-line port of the Qiskit engine, checked against it by tests/test_js_engine.py.";
}

// ================================================================== game state
const S = { engine: null, state: null, mode: "move", sel: null, opts: null, picks: [], partner: null, busy: false };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 3400);
}

async function newGame(quantum) {
  try {
    S.state = await S.engine.newGame(quantum);
  } catch (e) {
    toast("Engine error: " + e.message);
    return;
  }
  clearSelection();
  setMode("move");
  circuitToken++;
  $("circuit").innerHTML = `<span class="empty">Quantum moves draw their circuit here.</span>`;
  render();
}

function clearSelection() { S.sel = null; S.opts = null; S.picks = []; S.partner = null; }

function setMode(mode) {
  if (mode !== "move" && S.state && !S.state.quantum) { toast("Classical baseline: split and merge are switched off."); return; }
  S.mode = mode;
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
  if (S.mode === "split" && S.opts.split.length < 2) toast("This piece has no two empty squares to split onto.");
  if (S.mode === "merge" && Object.keys(S.opts.merge).length === 0) toast("Merge needs a piece that is split across two squares.");
  render();
}

async function play(kind, src, dst, extra = null) {
  S.busy = true;
  try {
    S.state = await S.engine.play(kind, src, dst, extra);
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
}

async function onSquare(sq) {
  if (S.busy || !S.state || S.state.winner) return;
  const o = S.opts;
  if (S.mode === "move") {
    if (S.sel && o && (o.move.includes(sq) || o.capture.includes(sq))) return play("move", S.sel, sq);
    return select(sq);
  }
  if (S.mode === "split") {
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
    marks: settings.hints ? hintMap() : {}, sel: S.sel, coords: settings.coords, flip: settings.flip,
    badges: settings.badges, last: last ? [last.from, last.to, last.extra].filter(Boolean) : [], onClick: onSquare,
  });
  board.id = "board";
  $("board").replaceWith(board);
  renderPanel();
}

function hintMap() {
  const m = {}, o = S.opts;
  if (!S.sel || !o) return m;
  if (S.mode === "move") {
    o.move.forEach((s) => (m[s] = "dot"));
    o.capture.forEach((s) => (m[s] = "ring"));
  } else if (S.mode === "split") {
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
  const winnerName = st.winner === "w" ? "White" : "Black";
  $("status").textContent = st.winner ? (st.winner === "draw" ? "Draw" : `${winnerName} wins`) : `${st.turn === "w" ? "White" : "Black"} to move`;
  const cap = QC.MAX_QUBITS;
  $("qubits").querySelector(".qm-val").textContent = `${st.qubits} / ${cap}`;
  $("qubits").querySelector(".qm-bar i").style.width = `${(100 * st.qubits) / cap}%`;
  const whiteBottom = !settings.flip;
  $("barBottom").classList.toggle("turn", !st.winner && st.turn === (whiteBottom ? "w" : "b"));
  $("barTop").classList.toggle("turn", !st.winner && st.turn === (whiteBottom ? "b" : "w"));
  $("modeTag").textContent = `${st.quantum ? "Quantum game" : "Classical baseline"} · move ${Math.floor(st.ply / 2) + 1}`;
  $("hint").textContent = hintText();
  renderMoves();
  renderCaptured(whiteBottom);
  const ov = $("overlay");
  if (st.winner) {
    $("overlayTitle").textContent = st.winner === "draw" ? "Draw" : `${winnerName} wins`;
    $("overlaySub").textContent = st.winner === "draw" ? "No legal moves left." : "The king was captured.";
    ov.classList.remove("hidden");
  } else ov.classList.add("hidden");
}

function hintText() {
  if (S.state.winner) return "Game over.";
  if (S.mode === "move") return S.sel ? "Click a dot to move, a ring to capture (captures measure the board)." : "Select a piece to see where it can go.";
  if (S.mode === "split") return S.sel ? `Pick two empty squares (${S.picks.length}/2). The piece ends up on both, 50% each.` : "Select a non-pawn piece to split it across two squares.";
  if (!S.sel) return "Select one half of a split piece.";
  return S.partner ? "Pick the square where both halves should interfere." : "Now click its other half (outlined).";
}

function moveText(e) {
  const p = e.piece === "P" ? "" : e.piece;
  if (e.kind === "split") return `${p}${e.from}<span class="q">→</span>${e.to}<span class="q">|</span>${e.extra}`;
  if (e.kind === "merge") return `${p}${e.from}<span class="q">|</span>${e.extra}<span class="q">→</span>${e.to}`;
  return `${p}${e.from}${e.kind === "capture" ? "×" : "–"}${e.to}`;
}

function renderMoves() {
  const box = $("moves");
  const log = S.state.log;
  if (!log.length) { box.innerHTML = `<p class="empty">No moves yet. ${S.state.turn === "w" ? "White" : "Black"} starts.</p>`; return; }
  const cell = (e) => !e ? `<div class="mv"></div>` :
    `<div class="mv${e.ok ? "" : " fail"}"><span class="mt">${moveText(e)}</span>${e.events.map((ev) => `<span class="ev">${ev}</span>`).join("")}</div>`;
  let html = "";
  for (let i = 0; i < log.length; i += 2) {
    html += `<div class="mrow"><span class="mno">${i / 2 + 1}.</span>${cell(log[i])}${cell(log[i + 1])}</div>`;
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
function circuitSVG(trace) {
  const wires = [];
  const touch = (s) => { if (!wires.includes(s)) wires.push(s); };
  trace.forEach((t) => (t.op === "gate" ? [...t.controls, ...t.squares] : [t.sq]).forEach(touch));
  const inited = new Set(trace.filter((t) => t.op === "init").map((t) => t.sq));
  const cols = [];
  wires.filter((w) => !inited.has(w)).forEach((w) => cols.push({ kind: "psi", wire: w }));
  trace.forEach((t) => {
    if (t.op === "init") { if (t.occupied) cols.push({ kind: "x", wire: t.sq }); }
    else cols.push(t);
  });
  // pack single-qubit boxes on different wires into the same column
  const layout = [];
  for (const c of cols) {
    const rows = c.op === "gate" ? [...c.controls, ...c.squares].map((s) => wires.indexOf(s)) : [wires.indexOf(c.wire ?? c.sq)];
    const lo = Math.min(...rows), hi = Math.max(...rows);
    const prev = layout[layout.length - 1];
    const single = c.kind === "psi" || c.kind === "x";
    if (prev && single && prev.single && !prev.rows.has(lo)) { prev.items.push({ c, lo, hi }); prev.rows.add(lo); }
    else layout.push({ single, rows: new Set([lo]), items: [{ c, lo, hi }] });
  }
  const W = 46, X0 = 56, ROW = 44, Y0 = 26, colW = 76;
  const width = X0 + layout.length * colW + 20, height = Y0 + wires.length * ROW;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Segoe UI, Arial, sans-serif">`;
  wires.forEach((w, i) => {
    const y = Y0 + i * ROW;
    svg += `<text x="8" y="${y + 5}" font-size="15" font-style="italic" fill="#161616">${w}</text>`;
    svg += `<line x1="${X0 - 10}" y1="${y}" x2="${width - 8}" y2="${y}" stroke="#161616" stroke-width="1.2"/>`;
  });
  layout.forEach((col, ci) => {
    const cx = X0 + ci * colW + colW / 2;
    for (const { c, lo, hi } of col.items) {
      const ylo = Y0 + lo * ROW, yhi = Y0 + hi * ROW;
      if (c.kind === "psi" || c.kind === "x") {
        const fill = c.kind === "x" ? "#002d9c" : "#8d8d8d";
        svg += `<rect x="${cx - 16}" y="${ylo - 16}" width="32" height="32" fill="${fill}"/>`;
        svg += `<text x="${cx}" y="${ylo + 5}" font-size="14" fill="#fff" text-anchor="middle">${c.kind === "x" ? "X" : "ψ"}</text>`;
      } else if (c.op === "measure") {
        svg += `<rect x="${cx - 18}" y="${ylo - 16}" width="36" height="32" fill="#8d8d8d"/>`;
        svg += `<path d="M ${cx - 11} ${ylo + 7} A 11 11 0 0 1 ${cx + 11} ${ylo + 7}" stroke="#fff" fill="none" stroke-width="1.6"/>`;
        svg += `<line x1="${cx}" y1="${ylo + 7}" x2="${cx + 8}" y2="${ylo - 8}" stroke="#fff" stroke-width="1.6"/>`;
        svg += `<text x="${cx}" y="${ylo + 30}" font-size="12" fill="#6f6f6f" text-anchor="middle">= ${c.result}</text>`;
      } else {
        const tg = c.squares.map((s) => Y0 + wires.indexOf(s) * ROW);
        const top = Math.min(...tg), bot = Math.max(...tg);
        svg += `<line x1="${cx}" y1="${ylo}" x2="${cx}" y2="${yhi}" stroke="#9f1853" stroke-width="2"/>`;
        c.controls.forEach((s) => {
          const y = Y0 + wires.indexOf(s) * ROW;
          svg += `<circle cx="${cx}" cy="${y}" r="7" fill="#fff" stroke="#9f1853" stroke-width="2"/>`;
        });
        svg += `<rect x="${cx - W / 2 - 8}" y="${top - 17}" width="${W + 16}" height="${bot - top + 34}" fill="#9f1853"/>`;
        svg += `<text x="${cx}" y="${(top + bot) / 2 + 5}" font-size="13" fill="#fff" text-anchor="middle">${c.gate}</text>`;
      }
    }
  });
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
function route() {
  const r = (location.hash || "#play").slice(1);
  const views = ["play", "manual", "puzzles", "blog"];
  const view = views.includes(r) ? r : "play";
  for (const v of views) $("view-" + v).classList.toggle("hidden", v !== view);
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === view));
  if (view === "manual" && !$("manualBody").dataset.built) { buildManual($("manualBody")); $("manualBody").dataset.built = 1; }
  if (view === "blog" && !$("blogBody").dataset.built) { buildBlog($("blogBody")); $("blogBody").dataset.built = 1; }
  if (view === "puzzles" && !$("view-puzzles").dataset.built) { buildPuzzles($("view-puzzles")); $("view-puzzles").dataset.built = 1; }
  window.scrollTo(0, 0);
}

// ================================================================== wiring
function wire() {
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("newQuantum").addEventListener("click", () => newGame(true));
  $("newClassical").addEventListener("click", () => newGame(false));
  $("overlayNew").addEventListener("click", () => newGame(S.state ? S.state.quantum : true));
  $("settingsBtn").addEventListener("click", () => $("settings").showModal());

  $("themes").innerHTML = THEMES.map((t) => `
    <button class="theme-card" data-theme="${t.id}" aria-label="${t.label} board theme">
      <span class="theme-preview"><i style="background:${t.light}"></i><i style="background:${t.dark}"></i><i style="background:${t.dark}"></i><i style="background:${t.light}"></i></span>
      <span><span class="tname">${t.label}</span><br><span class="tsub">${t.sub}</span></span>
      <svg class="ic"><use href="#i-check"/></svg></button>`).join("");
  document.querySelectorAll(".theme-card").forEach((b) => b.addEventListener("click", () => {
    settings.theme = b.dataset.theme; saveSettings(); applySettings();
  }));
  document.querySelectorAll("[data-setting]").forEach((el) => el.addEventListener("change", () => {
    settings[el.dataset.setting] = el.checked; saveSettings(); applySettings();
  }));
  document.querySelectorAll("input[name=engine]").forEach((el) => el.addEventListener("change", async () => {
    settings.engine = el.value; saveSettings();
    await chooseEngine();
    await newGame(true);
    toast(`Engine: ${S.engine.label}. A new game was started.`);
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
  await newGame(true);
})();
