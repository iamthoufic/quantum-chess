/*
 * In-browser port of the Qiskit engine in src/qchess (board.py, quantum.py, game.py).
 *
 * Used only when the Qiskit server is not running (e.g. the page is opened as a
 * file). Same model, same gates, same rules: tests/test_js_engine.py replays move
 * sequences through both engines and checks the probabilities match Qiskit.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ board
  const SIZE = 5, FILES = "abcde";
  const KING = "K", QUEEN = "Q", ROOK = "R", BISHOP = "B", KNIGHT = "N", PAWN = "P";
  const WHITE = "w", BLACK = "b";
  const BACK_RANK = [ROOK, KNIGHT, BISHOP, QUEEN, KING];
  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  const square = (f, r) => r * SIZE + f;
  const fileOf = (sq) => sq % SIZE;
  const rankOf = (sq) => Math.floor(sq / SIZE);
  const name = (sq) => FILES[fileOf(sq)] + (rankOf(sq) + 1);
  const onBoard = (f, r) => f >= 0 && f < SIZE && r >= 0 && r < SIZE;
  function parse(s) {
    const f = FILES.indexOf(s[0]), r = Number(s[1]) - 1;
    if (s.length !== 2 || f < 0 || !(r >= 0 && r < SIZE)) throw new Error("bad square " + s);
    return square(f, r);
  }

  function startingPieces() {
    const m = new Map();
    BACK_RANK.forEach((kind, f) => {
      m.set(square(f, 0), { pid: `w${kind}${FILES[f]}`, color: WHITE, kind });
      m.set(square(f, 4), { pid: `b${kind}${FILES[f]}`, color: BLACK, kind });
      m.set(square(f, 1), { pid: `wP${FILES[f]}`, color: WHITE, kind: PAWN });
      m.set(square(f, 3), { pid: `bP${FILES[f]}`, color: BLACK, kind: PAWN });
    });
    return m;
  }

  // [target, path] pairs, same order as board.rays in Python
  function rays(kind, sq) {
    const out = [], f0 = fileOf(sq), r0 = rankOf(sq);
    if (kind === KNIGHT || kind === KING) {
      const steps = kind === KNIGHT ? KNIGHT_JUMPS : ROOK_DIRS.concat(BISHOP_DIRS);
      for (const [df, dr] of steps) if (onBoard(f0 + df, r0 + dr)) out.push([square(f0 + df, r0 + dr), []]);
      return out;
    }
    const dirs = kind === ROOK ? ROOK_DIRS : kind === BISHOP ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
    for (const [df, dr] of dirs) {
      const path = [];
      let f = f0 + df, r = r0 + dr;
      while (onBoard(f, r)) {
        out.push([square(f, r), path.slice()]);
        path.push(square(f, r));
        f += df; r += dr;
      }
    }
    return out;
  }

  function pathBetween(kind, src, dst) {
    for (const [t, path] of rays(kind, src)) if (t === dst) return path;
    return null;
  }

  // ------------------------------------------------------------------ gates
  // 4x4 unitaries on (a, b), basis index = bit_a + 2 * bit_b, as [re, im] pairs
  const S = Math.SQRT1_2;
  function twoQubit(a01, a10) {
    // only the |01>,|10> block differs from identity: [[x, y], [y, x]]
    return { x: a01, y: a10 };
  }
  const GATES = {
    "iSWAP": twoQubit([0, 0], [0, 1]),
    "iSWAP†": twoQubit([0, 0], [0, -1]),
    "√iSWAP": twoQubit([S, 0], [0, S]),
    "√iSWAP†": twoQubit([S, 0], [0, -S]),
  };

  const EPS = 1e-9;
  const MAX_QUBITS = 16;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ statevector
  class QuantumState {
    constructor(seed) {
      this.active = [];
      this.re = null; this.im = null;
      this.rng = mulberry32(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
      this.trace = [];
      this.forceOutcome = null;   // test hook: (p1) => 0 | 1
    }
    get numQubits() { return this.active.length; }
    isActive(sq) { return this.active.includes(sq); }

    p1(k) {
      let p = 0;
      for (let i = 0; i < this.re.length; i++) if ((i >> k) & 1) p += this.re[i] ** 2 + this.im[i] ** 2;
      return p;
    }
    prob(sq) { return this.p1(this.active.indexOf(sq)); }

    activate(sq, occupied) {
      if (this.isActive(sq)) return;
      if (this.re === null) {
        this.re = new Float64Array(2); this.im = new Float64Array(2);
        this.re[occupied ? 1 : 0] = 1;
      } else {
        const n = this.re.length, re = new Float64Array(2 * n), im = new Float64Array(2 * n);
        const off = occupied ? n : 0;   // new qubit is the highest bit
        re.set(this.re, off); im.set(this.im, off);
        this.re = re; this.im = im;
      }
      this.active.push(sq);
      this.trace.push({ op: "init", sq, occupied });
    }

    // gate on (a, b), firing only where every control square is |0>
    apply(gateName, controls, a, b) {
      const g = GATES[gateName], ka = this.active.indexOf(a), kb = this.active.indexOf(b);
      const kc = controls.map((c) => this.active.indexOf(c));
      const ma = 1 << ka, mb = 1 << kb;
      for (let i = 0; i < this.re.length; i++) {
        if (i & ma || i & mb) continue;
        if (kc.some((k) => (i >> k) & 1)) continue;
        const i01 = i | ma, i10 = i | mb;           // |a=1,b=0> and |a=0,b=1>
        const [xr, xi] = g.x, [yr, yi] = g.y;
        const r1 = this.re[i01], m1 = this.im[i01], r2 = this.re[i10], m2 = this.im[i10];
        this.re[i01] = xr * r1 - xi * m1 + yr * r2 - yi * m2;
        this.im[i01] = xr * m1 + xi * r1 + yr * m2 + yi * r2;
        this.re[i10] = yr * r1 - yi * m1 + xr * r2 - xi * m2;
        this.im[i10] = yr * m1 + yi * r1 + xr * m2 + xi * r2;
      }
      this.trace.push({ op: "gate", gate: gateName, controls: controls.slice(), squares: [a, b] });
    }

    measure(sq) {
      const k = this.active.indexOf(sq), p = this.p1(k);
      const result = this.forceOutcome ? this.forceOutcome(p) : (this.rng() < p ? 1 : 0);
      let norm = 0;
      for (let i = 0; i < this.re.length; i++) {
        if (((i >> k) & 1) !== result) { this.re[i] = 0; this.im[i] = 0; }
        else norm += this.re[i] ** 2 + this.im[i] ** 2;
      }
      norm = Math.sqrt(norm);
      for (let i = 0; i < this.re.length; i++) { this.re[i] /= norm; this.im[i] /= norm; }
      this.trace.push({ op: "measure", sq, result });
      return result;
    }

    compact() {
      const settled = new Map();
      let changed = true;
      while (changed && this.re !== null) {
        changed = false;
        for (let k = 0; k < this.active.length; k++) {
          const p = this.p1(k);
          if (p < EPS || p > 1 - EPS) {
            const value = p > 0.5 ? 1 : 0;
            settled.set(this.active[k], value);
            this.drop(k, value);
            changed = true;
            break;
          }
        }
      }
      return settled;
    }

    drop(k, value) {
      if (this.active.length === 1) { this.re = this.im = null; this.active = []; return; }
      const n = this.re.length / 2, re = new Float64Array(n), im = new Float64Array(n);
      const low = (1 << k) - 1;
      let norm = 0;
      for (let j = 0; j < n; j++) {
        const i = ((j & ~low) << 1) | (value << k) | (j & low);
        re[j] = this.re[i]; im[j] = this.im[i];
        norm += re[j] ** 2 + im[j] ** 2;
      }
      norm = Math.sqrt(norm);
      for (let j = 0; j < n; j++) { re[j] /= norm; im[j] /= norm; }
      this.re = re; this.im = im;
      this.active.splice(k, 1);
    }

    takeTrace() { const t = this.trace; this.trace = []; return t; }
  }

  // ------------------------------------------------------------------ game
  const other = (c) => (c === WHITE ? BLACK : WHITE);
  class IllegalMove extends Error {}

  class Game {
    constructor({ seed = null, quantum = true, pieces = null, turn = WHITE } = {}) {
      this.pieces = pieces || startingPieces();
      this.q = new QuantumState(seed);
      this.turn = turn;
      this.winner = null;
      this.endReason = null;     // why the game ended, in words
      this.quietPlies = 0;       // plies since the last capture or pawn move (50-move rule)
      this.countBefore = 0;
      this.quantum = quantum;
      this.ply = 0;
      this.log = [];
      this.lastTrace = [];
      this.events = [];
    }

    prob(sq) {
      if (!this.pieces.has(sq)) return 0;
      return this.q.isActive(sq) ? this.q.prob(sq) : 1;
    }
    definite(sq) { return this.pieces.has(sq) && !this.q.isActive(sq); }

    options(sq) {
      const out = { move: [], capture: [], split: [], merge: new Map() };
      const piece = this.pieces.get(sq);
      if (!piece || piece.color !== this.turn || this.winner) return out;
      if (piece.kind === PAWN) {
        this.pawnOptions(sq, piece, out);
        if (!this.quantum) {
          out.move = out.move.filter((t) => !this.exposesKing(sq, t));
          out.capture = out.capture.filter((t) => !this.exposesKing(sq, t));
        }
        return out;
      }
      for (const [t, path] of rays(piece.kind, sq)) {
        if (path.some((p) => this.definite(p))) continue;
        const occ = this.pieces.get(t);
        if (!occ) {
          out.move.push(t);
          if (!path.some((p) => this.pieces.has(p))) out.split.push(t);
        } else if (occ.color !== piece.color) out.capture.push(t);
      }
      if (!this.quantum) {
        // classical rules: you may not leave your own king in check
        out.move = out.move.filter((t) => !this.exposesKing(sq, t));
        out.capture = out.capture.filter((t) => !this.exposesKing(sq, t));
      }
      if (!this.quantum || out.split.length < 2) out.split = [];
      if (this.quantum) {
        for (const [s2, part] of this.pieces) {
          if (s2 !== sq && part.pid === piece.pid) {
            const mine = this.clearTargets(piece.kind, sq), theirs = this.clearTargets(piece.kind, s2);
            const ts = mine.filter((t) => theirs.includes(t));
            if (ts.length) out.merge.set(s2, ts);
          }
        }
      }
      return out;
    }

    clearTargets(kind, sq) {
      return rays(kind, sq)
        .filter(([t, path]) => !this.pieces.has(t) && !path.some((p) => this.pieces.has(p)))
        .map(([t]) => t);
    }

    pawnOptions(sq, piece, out) {
      const step = piece.color === WHITE ? 1 : -1, f = fileOf(sq), r = rankOf(sq) + step;
      if (onBoard(f, r)) {
        const fwd = square(f, r);
        if (!this.pieces.has(fwd) || this.q.isActive(fwd)) out.move.push(fwd);
      }
      for (const df of [-1, 1]) {
        if (onBoard(f + df, r)) {
          const d = square(f + df, r), occ = this.pieces.get(d);
          if (occ && occ.color !== piece.color) out.capture.push(d);
        }
      }
    }

    // ---- classical check rules (every piece is definite, so plain chess logic applies)
    attacked(sq, by) {
      for (const [s, p] of this.pieces) {
        if (p.color !== by) continue;
        if (p.kind === PAWN) {
          const step = by === WHITE ? 1 : -1, f = fileOf(s), r = rankOf(s) + step;
          if (onBoard(f, r) && Math.abs(fileOf(sq) - f) === 1 && rankOf(sq) === r) return true;
          continue;
        }
        for (const [t, path] of rays(p.kind, s)) if (t === sq && !path.some((q) => this.pieces.has(q))) return true;
      }
      return false;
    }
    kingSquare(color) { for (const [s, p] of this.pieces) if (p.color === color && p.kind === KING) return s; return null; }
    inCheck(color) {
      if (this.quantum) return false;
      const k = this.kingSquare(color);
      return k !== null && this.attacked(k, other(color));
    }
    exposesKing(src, dst) {
      const saved = new Map(this.pieces), piece = this.pieces.get(src);
      this.pieces.delete(src); this.pieces.set(dst, piece);
      const k = this.kingSquare(piece.color);
      const bad = k !== null && this.attacked(k, other(piece.color));
      this.pieces = saved;
      return bad;
    }

    hasAnyMove() {
      for (const [sq, p] of this.pieces) {
        if (p.color !== this.turn) continue;
        const o = this.options(sq);
        if (o.move.length || o.capture.length || o.split.length || o.merge.size) return true;
      }
      return false;
    }

    // ---------------- actions
    move(src, dst) {
      const piece = this.mover(src), o = this.options(src);
      if (o.capture.includes(dst)) return this.finish("capture", piece, src, dst, this.capture(piece, src, dst));
      if (!o.move.includes(dst)) throw new IllegalMove(`${piece.kind} on ${name(src)} cannot move to ${name(dst)}`);
      const ok = piece.kind === PAWN ? this.pawnPush(piece, src, dst) : this.slide(piece, src, dst);
      return this.finish("move", piece, src, dst, ok);
    }

    split(src, t1, t2) {
      const piece = this.mover(src), o = this.options(src);
      if (t1 === t2 || !o.split.includes(t1) || !o.split.includes(t2))
        throw new IllegalMove(`cannot split ${name(src)} to ${name(t1)} and ${name(t2)}`);
      this.makeRoom(3);
      if (this.pieces.get(src) !== piece) {
        this.event(`${name(src)} collapsed away before the split`);
        return this.finish("split", piece, src, t1, false);
      }
      this.q.activate(src, true); this.q.activate(t1, false); this.q.activate(t2, false);
      this.q.apply("√iSWAP", [], src, t1);
      this.q.apply("iSWAP", [], src, t2);
      this.pieces.set(t1, piece); this.pieces.set(t2, piece);
      this.settle();
      return this.finish("split", piece, src, t1, true, t2);
    }

    merge(s1, s2, dst) {
      const piece = this.mover(s1), ts = this.options(s1).merge.get(s2) || [];
      if (!ts.includes(dst)) throw new IllegalMove(`cannot merge ${name(s1)} and ${name(s2)} on ${name(dst)}`);
      this.makeRoom(1);
      if (this.pieces.get(s1) !== piece || this.pieces.get(s2) !== piece) {
        this.event("one half collapsed away before the merge");
        return this.finish("merge", piece, s1, dst, false);
      }
      this.q.activate(dst, false);
      this.q.apply("iSWAP†", [], dst, s2);
      this.q.apply("√iSWAP†", [], dst, s1);
      this.pieces.set(dst, piece);
      this.settle();
      return this.finish("merge", piece, s1, dst, true, s2);
    }

    // ---------------- internals
    mover(src) {
      if (this.winner) throw new IllegalMove("the game is over");
      const piece = this.pieces.get(src);
      if (!piece || piece.color !== this.turn) throw new IllegalMove(`no ${this.turn} piece on ${name(src)}`);
      this.countBefore = new Set([...this.pieces.values()].map((p) => p.pid)).size;   // for the 50-move rule
      return piece;
    }
    event(t) { this.events.push(t); }

    measureSq(sq) {
      const result = this.q.measure(sq), piece = this.pieces.get(sq);
      this.event(`measured ${name(sq)}: ${piece.kind} ${result ? "present" : "absent"}`);
      this.settle();
      return result;
    }

    settle() {
      for (const [sq, v] of this.q.compact()) if (v === 0) this.pieces.delete(sq);
    }

    makeRoom(needed) {
      while (this.q.numQubits + needed > MAX_QUBITS && this.q.numQubits) {
        const sq = this.q.active[0];
        this.event(`qubit budget reached: forced measurement of ${name(sq)}`);
        this.measureSq(sq);
      }
    }

    moveClassically(piece, src, dst) {
      this.pieces.delete(src);
      this.pieces.set(dst, piece);
      if (piece.kind === PAWN && (rankOf(dst) === 0 || rankOf(dst) === 4)) {
        this.pieces.set(dst, { pid: piece.pid, color: piece.color, kind: QUEEN });
        this.event(`pawn promoted to queen on ${name(dst)}`);
      }
    }

    slide(piece, src, dst) {
      const path = pathBetween(piece.kind, src, dst) || [];
      let controls = path.filter((p) => this.pieces.has(p));
      if (this.definite(src) && !controls.length) { this.moveClassically(piece, src, dst); return true; }
      this.makeRoom(2);
      if (this.pieces.get(src) !== piece) { this.event(`${name(src)} collapsed away before the move`); return false; }
      controls = path.filter((p) => this.pieces.has(p));
      if (controls.some((p) => this.definite(p))) { this.event("path became blocked"); return false; }
      this.q.activate(src, true); this.q.activate(dst, false);
      this.q.apply("iSWAP", controls, src, dst);
      this.pieces.set(dst, piece);
      if (controls.length) this.event(`${piece.kind} entangled with the piece(s) on ${controls.map(name).join(", ")}`);
      this.settle();
      return true;
    }

    pawnPush(piece, src, dst) {
      if (this.pieces.has(dst) && this.measureSq(dst)) { this.event(`pawn blocked on ${name(dst)}`); return false; }
      this.moveClassically(piece, src, dst);
      return true;
    }

    capture(piece, src, dst) {
      if (this.q.isActive(src) && !this.measureSq(src)) { this.event("the attacker was not really there"); return false; }
      const path = [KNIGHT, KING, PAWN].includes(piece.kind) ? [] : (pathBetween(piece.kind, src, dst) || []);
      for (const p of path) {
        if (this.pieces.has(p) && (this.definite(p) || this.measureSq(p))) {
          this.event(`capture blocked by the piece on ${name(p)}`);
          return false;
        }
      }
      if (this.pieces.has(dst) && this.q.isActive(dst)) this.measureSq(dst);
      const victim = this.pieces.get(dst);
      if (!victim) {
        if (piece.kind === PAWN) { this.event("the target was not there; the pawn stays"); return false; }
        this.event(`${name(dst)} was empty; the ${piece.kind} moves in`);
      } else {
        this.pieces.delete(dst);
        this.event(`captured ${victim.color}${victim.kind} on ${name(dst)}`);
        if (victim.kind === KING) this.winner = piece.color;
      }
      this.moveClassically(piece, src, dst);
      return true;
    }

    finish(kind, piece, src, dst, ok, extra = null) {
      this.lastTrace = this.q.takeTrace();
      const entry = {
        ply: this.ply, color: piece.color, piece: piece.kind, kind,
        from: name(src), to: name(dst), extra: extra === null ? null : name(extra), ok, events: this.events,
        // the measurement results this move produced, in order: enough to replay the game exactly
        outs: this.lastTrace.filter((t) => t.op === "measure").map((t) => t.result),
      };
      this.events = [];
      this.log.push(entry);
      this.ply += 1;
      const count = new Set([...this.pieces.values()].map((p) => p.pid)).size;
      if (count < this.countBefore || piece.kind === PAWN) this.quietPlies = 0;
      else this.quietPlies += 1;
      if (this.winner) this.endReason = "The king was captured.";
      else {
        this.turn = other(this.turn);
        this.checkDraw();
      }
      return entry;
    }

    /** An independent copy of the game (used by the bots to try moves out). */
    clone() {
      const g = new Game({ pieces: new Map(this.pieces), quantum: this.quantum, turn: this.turn, seed: 0 });
      g.winner = this.winner; g.endReason = this.endReason; g.ply = this.ply;
      g.quietPlies = this.quietPlies; g.countBefore = this.countBefore;
      g.q.active = [...this.q.active];
      g.q.re = this.q.re && this.q.re.slice(); g.q.im = this.q.im && this.q.im.slice();
      g.q.rng = this.q.rng;
      return g;
    }

    /** Play one logged move again with the same measurement results. */
    replayEntry(e) {
      const sq = (s) => parse(s);
      let k = 0;
      this.q.forceOutcome = () => e.outs[k++];
      try {
        if (e.kind === "split") this.split(sq(e.from), sq(e.to), sq(e.extra));
        else if (e.kind === "merge") this.merge(sq(e.from), sq(e.extra), sq(e.to));
        else this.move(sq(e.from), sq(e.to));
      } finally { this.q.forceOutcome = null; }
    }

    /** Rebuild a game from a log (as the API or snapshot() reports it). */
    static fromLog(log, { quantum = true, seed = null } = {}) {
      const g = new Game({ quantum, seed });
      for (const e of log) g.replayEntry(e);
      return g;
    }

    // draw rules: bare kings, the 50-move rule, or no legal action for the side to move
    checkDraw() {
      if ([...this.pieces.values()].every((p) => p.kind === KING)) { this.winner = "draw"; this.endReason = "Only the two kings are left."; }
      else if (this.quietPlies >= 100) { this.winner = "draw"; this.endReason = "50 moves each without a capture or a pawn move."; }
      else if (!this.hasAnyMove()) {
        if (!this.quantum && this.inCheck(this.turn)) { this.winner = other(this.turn); this.endReason = "Checkmate."; }
        else if (!this.quantum) { this.winner = "draw"; this.endReason = "Stalemate: no legal move and not in check."; }
        else { this.winner = "draw"; this.endReason = "The side to move has no legal action."; }
      }
    }

    // same JSON shape as the FastAPI /api/{gid} snapshot
    snapshot(id = "local") {
      const squares = [];
      for (let sq = 0; sq < 25; sq++) {
        const p = this.pieces.get(sq);
        squares.push({
          sq: name(sq), piece: p ? { pid: p.pid, color: p.color, kind: p.kind } : null,
          prob: Math.round(this.prob(sq) * 1e4) / 1e4, quantum: this.q.isActive(sq),
        });
      }
      return {
        id, turn: this.turn, winner: this.winner, end_reason: this.endReason, quantum: this.quantum, ply: this.ply,
        check: this.inCheck(this.turn), check_sq: this.inCheck(this.turn) ? name(this.kingSquare(this.turn)) : null,
        qubits: this.q.numQubits, squares, log: this.log, has_circuit: this.lastTrace.length > 0,
        trace: this.lastTrace.map((t) => ({ ...t, sq: t.sq === undefined ? undefined : name(t.sq),
          squares: t.squares && t.squares.map(name), controls: t.controls && t.controls.map(name) })),
      };
    }
  }

  const QC = { Game, IllegalMove, QuantumState, name, parse, rays, square, WHITE, BLACK, MAX_QUBITS };
  if (typeof module !== "undefined" && module.exports) module.exports = QC;
  else root.QC = QC;
})(this);
