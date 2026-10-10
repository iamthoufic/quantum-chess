// Quantum Chess 5x5 frontend: renders the board and talks to the FastAPI engine.
const FILES = "abcde";
const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };

const S = {
  gid: null,
  state: null,
  mode: "move",      // move | split | merge
  sel: null,         // selected square name
  opts: null,        // options for the selected square
  picks: [],         // split: chosen targets
  partner: null,     // merge: the other half
  busy: false,
};

const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ------------------------------------------------------------------ game flow
async function newGame(quantum) {
  S.state = await api("/api/new", { quantum });
  S.gid = S.state.id;
  clearSelection();
  setMode("move");
  render();
}

function clearSelection() {
  S.sel = null; S.opts = null; S.picks = []; S.partner = null;
}

function setMode(mode) {
  if (mode !== "move" && S.state && !S.state.quantum) {
    toast("Classical baseline: split and merge are switched off.");
    return;
  }
  S.mode = mode;
  clearSelection();
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  render();
}

function squareInfo(sq) {
  return S.state.squares.find((s) => s.sq === sq);
}

async function select(sq) {
  const info = squareInfo(sq);
  if (!info.piece || info.piece.color !== S.state.turn) { clearSelection(); render(); return; }
  S.sel = sq; S.picks = []; S.partner = null;
  S.opts = await api(`/api/${S.gid}/options/${sq}`);
  if (S.mode === "split" && S.opts.split.length < 2) toast("This piece has no two empty squares to split onto.");
  if (S.mode === "merge" && Object.keys(S.opts.merge).length === 0) toast("Merge needs a piece that is split across two squares.");
  render();
}

async function play(kind, src, dst, extra = null) {
  S.busy = true;
  const before = S.state;
  try {
    S.state = await api(`/api/${S.gid}/play`, { kind, src, dst, extra });
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
  if (before.ply !== S.state.ply) loadCircuit();
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
  // merge
  if (S.sel && o && !S.partner && o.merge[sq]) { S.partner = sq; return render(); }
  if (S.sel && S.partner && o.merge[S.partner].includes(sq)) return play("merge", S.sel, sq, S.partner);
  return select(sq);
}

// ------------------------------------------------------------------ rendering
function render() {
  if (!S.state) return;
  renderBoard();
  renderPanel();
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  const last = S.state.log[S.state.log.length - 1];
  const lastSquares = last ? [last.from, last.to, last.extra].filter(Boolean) : [];
  const hints = hintMap();

  for (let r = 4; r >= 0; r--) {
    for (let f = 0; f < 5; f++) {
      const sq = FILES[f] + (r + 1);
      const info = squareInfo(sq);
      const el = document.createElement("div");
      el.className = "sq " + ((f + r) % 2 === 0 ? "dark" : "light");
      el.dataset.sq = sq;
      if (lastSquares.includes(sq)) el.classList.add("last");
      if (S.sel === sq) el.classList.add("sel");
      if (f === 0) el.insertAdjacentHTML("beforeend", `<span class="coord rank">${r + 1}</span>`);
      if (r === 0) el.insertAdjacentHTML("beforeend", `<span class="coord file">${FILES[f]}</span>`);

      if (info.piece) {
        const p = document.createElement("div");
        p.className = "piece";
        p.style.backgroundImage = `url(/static/pieces/${info.piece.color}${info.piece.kind}.svg)`;
        if (info.prob < 0.9999) {
          p.classList.add("maybe");
          p.style.opacity = (0.3 + 0.7 * info.prob).toFixed(2);
          el.insertAdjacentHTML("beforeend", `<span class="badge">${Math.round(info.prob * 100)}%</span>`);
        }
        el.appendChild(p);
      }
      const h = hints[sq];
      if (h) el.insertAdjacentHTML("beforeend", `<span class="${h}"></span>`);
      el.addEventListener("click", () => onSquare(sq));
      board.appendChild(el);
    }
  }
}

function hintMap() {
  const m = {};
  const o = S.opts;
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
  const side = st.turn === "w" ? "White" : "Black";
  $("status").textContent = st.winner
    ? (st.winner === "draw" ? "Draw" : `${st.winner === "w" ? "White" : "Black"} wins`)
    : `${side} to move`;
  $("qubits").textContent = `${st.qubits} qubit${st.qubits === 1 ? "" : "s"}`;
  $("dotBottom").classList.toggle("on", !st.winner && st.turn === "w");
  $("dotTop").classList.toggle("on", !st.winner && st.turn === "b");
  document.querySelector(".brand .tag").textContent = st.quantum ? "5×5 · quantum" : "5×5 · classical";

  $("hint").textContent = hintText();
  renderMoves();
  renderCaptured();

  const ov = $("overlay");
  if (st.winner) {
    $("overlayTitle").textContent = st.winner === "draw" ? "Draw" : `${st.winner === "w" ? "White" : "Black"} wins`;
    $("overlaySub").textContent = st.winner === "draw" ? "No legal moves left." : "The king was captured.";
    ov.classList.remove("hidden");
  } else {
    ov.classList.add("hidden");
  }
}

function hintText() {
  if (S.state.winner) return "Game over.";
  if (S.mode === "move") return S.sel ? "Click a dot to move, a ring to capture (captures measure the board)." : "Select a piece to see where it can go.";
  if (S.mode === "split") {
    if (!S.sel) return "Select a non-pawn piece to split it across two squares.";
    return `Pick two empty squares (${S.picks.length}/2). The piece ends up on both, 50% each.`;
  }
  if (!S.sel) return "Select one half of a split piece.";
  if (!S.partner) return "Now click its other half (outlined).";
  return "Pick the square where both halves should interfere.";
}

function renderMoves() {
  const ol = $("moves");
  ol.innerHTML = "";
  for (const e of S.state.log) {
    const li = document.createElement("li");
    const g = GLYPH[e.piece];
    let text;
    if (e.kind === "split") text = `${g} ${e.from} → ${e.to} + ${e.extra} <i>split</i>`;
    else if (e.kind === "merge") text = `${g} ${e.from} + ${e.extra} → ${e.to} <i>merge</i>`;
    else text = `${g} ${e.from} ${e.kind === "capture" ? "×" : "→"} ${e.to}`;
    li.innerHTML = `<span class="${e.ok ? "" : "fail"}">${e.color === "w" ? "White" : "Black"}: ${text}</span>`
      + e.events.map((ev) => `<span class="ev">${ev}</span>`).join("");
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;
}

function renderCaptured() {
  // pieces whose pid no longer appears anywhere were captured
  const alive = new Set(S.state.squares.filter((s) => s.piece).map((s) => s.piece.pid));
  const all = startingPids();
  const lost = { w: [], b: [] };
  for (const [pid, sym] of Object.entries(all)) if (!alive.has(pid)) lost[sym[0]].push(sym);
  // white's captures are black pieces lost, shown on white's bar
  $("capBottom").innerHTML = lost.b.map((s) => `<span style="background-image:url(/static/pieces/${s}.svg)"></span>`).join("");
  $("capTop").innerHTML = lost.w.map((s) => `<span style="background-image:url(/static/pieces/${s}.svg)"></span>`).join("");
}

function startingPids() {
  const out = {};
  const back = ["R", "N", "B", "Q", "K"];
  back.forEach((k, f) => {
    out[`w${k}${FILES[f]}`] = `w${k}`; out[`b${k}${FILES[f]}`] = `b${k}`;
    out[`wP${FILES[f]}`] = "wP"; out[`bP${FILES[f]}`] = "bP";
  });
  return out;
}

function flashMeasured(entry) {
  if (!entry) return;
  for (const ev of entry.events) {
    const m = ev.match(/measured ([a-e][1-5])/);
    if (!m) continue;
    const el = document.querySelector(`.sq[data-sq="${m[1]}"]`);
    if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }
}

async function loadCircuit() {
  const box = $("circuit");
  if (!S.state.has_circuit) {
    box.innerHTML = `<span class="muted">Classical move: no qubits were needed.</span>`;
    return;
  }
  box.innerHTML = `<span class="muted">Drawing circuit…</span>`;
  const img = new Image();
  img.alt = "Qiskit circuit of the last move";
  img.onload = () => { box.innerHTML = ""; box.appendChild(img); };
  img.onerror = () => { box.innerHTML = `<pre>${S.state.circuit_text}</pre>`; };
  img.src = `/api/${S.gid}/circuit.svg?ply=${S.state.ply}`;
}

// ------------------------------------------------------------------ wiring
document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("newQuantum").addEventListener("click", () => newGame(true));
$("newClassical").addEventListener("click", () => newGame(false));
$("overlayNew").addEventListener("click", () => newGame(S.state ? S.state.quantum : true));
$("rulesBtn").addEventListener("click", () => $("rules").showModal());
document.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => {
  document.body.dataset.theme = b.dataset.themeBtn;
  try { localStorage.setItem("qc-theme", b.dataset.themeBtn); } catch (e) { /* storage unavailable */ }
}));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { clearSelection(); render(); }
  if (e.key === "1") setMode("move");
  if (e.key === "2") setMode("split");
  if (e.key === "3") setMode("merge");
});

try {
  const saved = localStorage.getItem("qc-theme");
  if (saved) document.body.dataset.theme = saved;
} catch (e) { /* storage unavailable */ }

newGame(true).catch((e) => toast("Could not reach the engine: " + e.message));
