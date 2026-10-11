// Animated tutorials ("video lessons"): every frame is computed by the engine's
// QuantumState, so the probabilities, the state |ψ⟩ and the circuit are real.
"use strict";

// ------------------------------------------------------------------ lesson builder
class LessonBuilder {
  constructor(pieces) {
    this.pieces = new Map(Object.entries(pieces).map(([sq, sym]) => [QC.parse(sq), sym]));
    this.q = new QC.QuantumState(1);
    this.frames = [];
  }
  activate(sq, occupied) { this.q.activate(QC.parse(sq), occupied); return this; }
  gate(name, a, b, controls = []) { this.q.apply(name, controls.map(QC.parse), QC.parse(a), QC.parse(b)); return this; }
  place(sq, sym) { this.pieces.set(QC.parse(sq), sym); return this; }
  remove(sq) { this.pieces.delete(QC.parse(sq)); return this; }
  measure(sq, outcome) {
    this.q.forceOutcome = () => outcome;
    this.q.measure(QC.parse(sq));
    this.q.forceOutcome = null;
    return this;
  }
  // after a measurement a square is classical again: take it out of the register
  settle(sq) {
    const k = this.q.active.indexOf(QC.parse(sq));
    if (k >= 0) this.q.drop(k, this.q.p1(k) > 0.5 ? 1 : 0);
    return this;
  }
  save() {
    return { pieces: new Map(this.pieces), active: [...this.q.active], re: this.q.re && this.q.re.slice(),
      im: this.q.im && this.q.im.slice(), trace: this.q.trace.slice() };
  }
  restore(s) {
    this.pieces = new Map(s.pieces); this.q.active = [...s.active];
    this.q.re = s.re && s.re.slice(); this.q.im = s.im && s.im.slice(); this.q.trace = s.trace.slice();
    return this;
  }
  prob(sq) { return this.q.isActive(sq) ? this.q.prob(sq) : 1; }

  ket() {
    if (!this.q.re) return "";
    const terms = [];
    for (let i = 0; i < this.q.re.length; i++) {
      const re = this.q.re[i], im = this.q.im[i];
      if (re * re + im * im < 1e-9) continue;
      const occ = this.q.active.filter((s, k) => (i >> k) & 1 && this.pieces.has(s)).map(QC.name);
      terms.push({ amp: fmtAmp(re, im), basis: occ.length ? occ.join(" ") : "∅" });
    }
    if (terms.length === 1 && /^−?i?1?$/.test(terms[0].amp.replace("1", ""))) return `|${terms[0].basis}⟩`;  // a global phase is invisible
    return terms.map((t, n) => {
      const neg = t.amp.startsWith("−");
      const a = neg ? t.amp.slice(1) : t.amp;
      return `${n === 0 ? (neg ? "−" : "") : neg ? " − " : " + "}${a === "1" ? "" : a}|${t.basis}⟩`;
    }).join("");
  }

  frame(title, caption, { marks = {}, arrows = [] } = {}) {
    const cells = {};
    for (const [sq, sym] of this.pieces) {
      const p = this.prob(sq);
      if (p > 1e-6) cells[QC.name(sq)] = { color: sym[0], kind: sym[1], prob: p };
    }
    const trace = this.q.trace.map((t) => ({ ...t, sq: t.sq === undefined ? undefined : QC.name(t.sq),
      squares: t.squares && t.squares.map(QC.name), controls: t.controls && t.controls.map(QC.name) }));
    this.frames.push({ title, caption, cells, marks, arrows, ket: this.ket(), trace });
    return this;
  }
}

function fmtAmp(re, im) {
  // magnitudes that appear in these lessons, written the way a physicist would
  const mag = (x) => {
    const v = Math.abs(x);
    if (Math.abs(v - 1) < 1e-6) return "1";
    if (Math.abs(v - Math.SQRT1_2) < 1e-3) return "1/√2";
    if (Math.abs(v - 0.5) < 1e-3) return "1/2";
    return String(Math.round(v * 100) / 100);
  };
  const near = (x) => Math.abs(x) < 1e-6;
  const sign = (x) => (x < 0 ? "−" : "");
  if (near(im)) return sign(re) + mag(re);
  if (near(re)) {
    const m = mag(im);
    return sign(im) + (m === "1" ? "i" : m.startsWith("1/") ? "i" + m.slice(1) : m + "i");
  }
  return `(${sign(re)}${mag(re)} ${im < 0 ? "−" : "+"} ${mag(im)}i)`;
}

// ------------------------------------------------------------------ the four lessons
function lessonSplit() {
  const L = new LessonBuilder({ b1: "wN", e1: "wK", e5: "bK" });
  L.activate("b1", true)
    .frame("Every square is a qubit", "The knight's square b1 is in state |1⟩ (occupied). Every empty square is |0⟩.")
    .activate("a3", false).activate("c3", false).place("a3", "wN").place("c3", "wN")
    .frame("Choose two targets", "In Split mode, click the knight, then two empty squares it can reach: a3 and c3.",
      { marks: { a3: "qdot", c3: "qdot" }, arrows: [["b1", "a3"], ["b1", "c3"]] })
    .gate("√iSWAP", "b1", "a3")
    .frame("√iSWAP: half the amplitude moves", "A square-root-of-iSWAP gate on (b1, a3) sends half of the knight's amplitude to a3. It is now 50% on b1 and 50% on a3.",
      { arrows: [["b1", "a3"]] })
    .gate("iSWAP", "b1", "c3")
    .frame("iSWAP: the rest moves", "A full iSWAP on (b1, c3) moves everything left on b1 over to c3. b1 is now certainly empty.",
      { arrows: [["b1", "c3"]] })
    .frame("One knight, two squares", "The knight is on a3 and c3 at once, 50% each. The halves always add up to one knight, until a measurement decides.",
      { marks: { a3: "partner", c3: "partner" } });
  return { id: "split", title: "Split", kicker: "Superposition", frames: L.frames };
}

function lessonMerge() {
  const L = new LessonBuilder({ b1: "wN", e1: "wK", e5: "bK" });
  L.activate("b1", true).activate("a3", false).activate("c3", false)
    .gate("√iSWAP", "b1", "a3").gate("iSWAP", "b1", "c3").place("a3", "wN").place("c3", "wN");
  L.q.trace = [];
  L.frame("A split knight", "After a split, the knight has amplitude i/√2 on a3 and on c3. Their phases match, and that matters.",
    { marks: { a3: "partner", c3: "partner" } })
    .frame("Pick a target", "In Merge mode, click one half, then the other, then a square both can reach: b1.",
      { marks: { a3: "partner", c3: "partner", b1: "qdot" }, arrows: [["a3", "b1"], ["c3", "b1"]] })
    .gate("iSWAP†", "b1", "c3")
    .frame("iSWAP†: pull one half back", "The inverse iSWAP on (b1, c3) moves the c3 half back onto b1.", { arrows: [["c3", "b1"]] })
    .gate("√iSWAP†", "b1", "a3")
    .frame("√iSWAP†: interference", "The inverse √iSWAP mixes b1 with a3. The two amplitudes add up on b1 and cancel on a3: the knight is back with 100% certainty.",
      { arrows: [["a3", "b1"]] });
  // the classical comparison: a coin decided a3 or c3, then the same gates
  const C = new LessonBuilder({ a3: "wN", e1: "wK", e5: "bK" });
  C.activate("b1", false).activate("a3", true).activate("c3", false).place("b1", "wN")
    .gate("iSWAP†", "b1", "c3").gate("√iSWAP†", "b1", "a3")
    .frame("Why this is quantum", "Compare a coin flip: if the knight were simply on a3 (or c3) and we just didn't know which, the very same gates bring it back only 50% of the time. Merges work because of phase.");
  return { id: "merge", title: "Merge", kicker: "Interference", frames: L.frames.concat(C.frames) };
}

function lessonEntangle() {
  const L = new LessonBuilder({ a1: "wR", e1: "wK", c3: "bN", e5: "bK" });
  L.activate("c3", true).activate("a2", false).activate("b5", false)
    .gate("√iSWAP", "c3", "a2").gate("iSWAP", "c3", "b5").place("a2", "bN").place("b5", "bN").remove("c3");
  L.q.trace = [];
  L.frame("A knight in two places", "Black's knight is 50% on a2 and 50% on b5. White's rook on a1 wants to slide up to a4.",
    { arrows: [["a1", "a4"]], marks: { a4: "dot" } })
    .activate("a1", true).activate("a4", false)
    .gate("iSWAP", "a1", "a4", ["a2"]).place("a4", "wR")
    .frame("A controlled slide", "The rook's iSWAP is controlled on a2 being empty (the open dot in the circuit). It slides only in the branch where the knight is on b5.");
  const both = L.save();
  L.frame("Entangled", "Rook and knight now share one state: rook on a4 exactly when the knight is on b5. Neither piece has a position of its own.",
    { marks: { a1: "partner", a4: "partner", a2: "partner", b5: "partner" } })
    .measure("a2", 1)
    .frame("Measure one piece…", "Suppose something measures a2 and finds the knight there. Instantly the rook is certainly back on a1.", { marks: { a2: "partner" } });
  L.restore(both).measure("a2", 0)
    .frame("…and the other follows", "If a2 is found empty instead, the knight is certainly on b5 and the rook certainly reached a4. One measurement settled both pieces.", { marks: { a2: "partner" } });
  return { id: "entangle", title: "Entanglement", kicker: "Sliding past a ghost", frames: L.frames };
}

function lessonCapture() {
  const L = new LessonBuilder({ a1: "wR", e1: "wK", c3: "bN", e5: "bK" });
  L.activate("c3", true).activate("a2", false).activate("b5", false)
    .gate("√iSWAP", "c3", "a2").gate("iSWAP", "c3", "b5").place("a2", "bN").place("b5", "bN").remove("c3");
  L.q.trace = [];
  L.frame("Attack a ghost", "White's rook attacks a2, where Black's knight is with 50% probability.", { marks: { a2: "ring" }, arrows: [["a1", "a2"]] });
  const before = L.save();
  L.measure("a2", 1).remove("a2").remove("a1").place("a2", "wR").remove("b5")
    .frame("Outcome 1 · 50%", "The capture measures a2: the knight is there, so it is captured. Its other half on b5 vanishes with it.");
  L.restore(before).measure("a2", 0).settle("a2").remove("a1").place("a2", "wR")
    .frame("Outcome 2 · 50%", "Or a2 is empty: the rook simply moves in, and the knight is now certainly on b5. Every capture of a ghost is a fair coin decided by the Born rule.");
  return { id: "capture", title: "Capture", kicker: "Measurement", frames: L.frames };
}

// ------------------------------------------------------------------ player
const FRAME_MS = 4800;

function buildTutorials() {
  const lessons = [lessonSplit(), lessonMerge(), lessonEntangle(), lessonCapture()];
  const wrap = document.createElement("section");
  wrap.className = "tutorials";
  wrap.innerHTML = `
    <h2 id="m-videos"><span class="secno">00</span>Video tutorials</h2>
    <p>Four short animated lessons. Every frame is computed by the game's engine, so the probabilities, the state <code>|ψ⟩</code> and the circuit are the real ones.</p>
    <div class="tut">
      <div class="tut-stage">
        <div class="tut-boardwrap"><div class="tut-board"></div><svg class="tut-arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <button class="tut-big" aria-label="Play"><svg class="ic"><use href="#i-play"/></svg></button></div>
        <div class="tut-side">
          <div class="tut-kicker"></div>
          <h3 class="tut-title"></h3>
          <p class="tut-caption"></p>
          <div class="tut-ket"><span>State</span><code></code></div>
          <div class="tut-circuit"></div>
        </div>
      </div>
      <div class="tut-controls">
        <button class="tut-btn tut-play" aria-label="Play"><svg class="ic"><use href="#i-play"/></svg></button>
        <button class="tut-btn tut-prev" aria-label="Previous step"><svg class="ic"><use href="#i-prev"/></svg></button>
        <button class="tut-btn tut-next" aria-label="Next step"><svg class="ic"><use href="#i-next"/></svg></button>
        <div class="tut-progress"></div>
        <span class="tut-time"></span>
      </div>
    </div>
    <div class="tut-list"></div>`;

  const $q = (s) => wrap.querySelector(s);
  const boardHost = $q(".tut-board");
  const board = buildBoard({}, { coords: true, badges: true, mini: false });
  board.classList.add("tut-b");
  boardHost.appendChild(board);
  const sqEl = {};
  board.querySelectorAll(".sq").forEach((el) => {
    sqEl[el.dataset.sq] = el;
    const p = document.createElement("div");
    p.className = "piece";
    p.style.opacity = 0;
    el.appendChild(p);
    el.insertAdjacentHTML("beforeend", `<span class="prob-num" hidden></span><span class="prob-bar" hidden><i></i></span><span class="tut-mark"></span>`);
  });

  let L = lessons[0], idx = 0, playing = false, t0 = 0, raf = 0;

  function paint(fr) {
    for (const [sq, el] of Object.entries(sqEl)) {
      const c = fr.cells[sq], piece = el.querySelector(".piece");
      if (c) piece.style.backgroundImage = `url(${pieceUrl(c.color, c.kind)})`;
      piece.style.opacity = c ? (c.prob > 0.9999 ? 1 : 0.3 + 0.7 * c.prob).toFixed(2) : 0;
      piece.classList.toggle("maybe", !!c && c.prob < 0.9999);
      const num = el.querySelector(".prob-num"), bar = el.querySelector(".prob-bar");
      const partial = !!c && c.prob < 0.9999;
      num.hidden = bar.hidden = !partial;
      if (partial) { num.textContent = Math.round(c.prob * 100) + "%"; bar.firstChild.style.width = c.prob * 100 + "%"; }
      el.querySelector(".tut-mark").className = "tut-mark " + (fr.marks[sq] || "");
    }
    const center = (s) => [("abcde".indexOf(s[0]) + 0.5) * 20, (5 - Number(s[1]) + 0.5) * 20];
    $q(".tut-arrows").innerHTML = `<defs><marker id="tah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="rgba(255,170,0,0.95)"/></marker></defs>`
      + fr.arrows.map(([a, b]) => {
        const [x1, y1] = center(a), [x2, y2] = center(b), k = 7 / Math.hypot(x2 - x1, y2 - y1);
        return `<line class="tut-arrow" x1="${x1}" y1="${y1}" x2="${x2 - (x2 - x1) * k}" y2="${y2 - (y2 - y1) * k}" stroke="rgba(255,170,0,0.9)" stroke-width="2.4" stroke-linecap="round" marker-end="url(#tah)"/>`;
      }).join("");
    $q(".tut-kicker").textContent = `${L.kicker} · step ${idx + 1} of ${L.frames.length}`;
    $q(".tut-title").textContent = fr.title;
    $q(".tut-caption").textContent = fr.caption;
    $q(".tut-ket code").textContent = fr.ket || "—";
    $q(".tut-circuit").innerHTML = fr.trace.length ? circuitSVG(fr.trace) : `<span class="empty">No gates yet.</span>`;
    $q(".tut-progress").innerHTML = L.frames.map((_, i) =>
      `<button class="seg" data-i="${i}" aria-label="Step ${i + 1}"><i style="width:${i < idx ? 100 : 0}%"></i></button>`).join("");
    $q(".tut-progress").querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.i), playing)));
    wrap.querySelectorAll(".tut-item").forEach((el) => el.classList.toggle("active", el.dataset.id === L.id));
    tick();
  }

  function setPlaying(p) {
    playing = p;
    wrap.classList.toggle("is-playing", p);  // hides the big play button
    $q(".tut-play").innerHTML = `<svg class="ic"><use href="#i-${p ? "pause" : "play"}"/></svg>`;
    $q(".tut-play").setAttribute("aria-label", p ? "Pause" : "Play");
    cancelAnimationFrame(raf);
    if (p) { t0 = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function tick(frac = 0) {
    const seg = $q(`.tut-progress .seg[data-i="${idx}"] i`);
    if (seg) seg.style.width = frac * 100 + "%";
    const sec = Math.floor((idx * FRAME_MS + frac * FRAME_MS) / 1000), tot = Math.round((L.frames.length * FRAME_MS) / 1000);
    $q(".tut-time").textContent = `0:${String(sec).padStart(2, "0")} / 0:${String(tot).padStart(2, "0")}`;
  }

  function loop(now) {
    const frac = Math.min(1, (now - t0) / FRAME_MS);
    tick(frac);
    if (frac >= 1) {
      if (idx < L.frames.length - 1) { go(idx + 1, true); return; }
      setPlaying(false);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function go(i, keepPlaying = false) {
    idx = Math.max(0, Math.min(L.frames.length - 1, i));
    paint(L.frames[idx]);
    setPlaying(keepPlaying);
  }

  function load(lesson, autoplay) { L = lesson; go(0, autoplay); }

  $q(".tut-list").innerHTML = lessons.map((l, n) => `
    <button class="tut-item" data-id="${l.id}">
      <span class="tut-thumb"><svg class="ic"><use href="#i-${["split", "merge", "atom", "target"][n]}"/></svg></span>
      <span class="tut-meta"><b>${n + 1}. ${l.title}</b><small>${l.kicker} · 0:${String(Math.round((l.frames.length * FRAME_MS) / 1000)).padStart(2, "0")}</small></span>
    </button>`).join("");
  wrap.querySelectorAll(".tut-item").forEach((el) => el.addEventListener("click", () => load(lessons.find((l) => l.id === el.dataset.id), true)));
  $q(".tut-play").addEventListener("click", () => {
    if (!playing && idx === L.frames.length - 1) return go(0, true);
    setPlaying(!playing);
  });
  $q(".tut-big").addEventListener("click", () => go(idx === L.frames.length - 1 ? 0 : idx, true));
  $q(".tut-prev").addEventListener("click", () => go(idx - 1, playing));
  $q(".tut-next").addEventListener("click", () => go(idx + 1, playing));

  load(lessons[0], false);
  return wrap;
}
