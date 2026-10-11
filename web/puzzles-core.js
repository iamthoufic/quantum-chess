/*
 * Puzzles: positions, an exact solver, and an endless position generator.
 *
 * The solver never samples. It explores every measurement outcome a move can
 * trigger (with its Born-rule probability) by replaying the move with the
 * engine's forceOutcome hook, so "this capture wins 25% of the time" is exact.
 * Works in the browser (window.QCPuzzles) and in node (module.exports).
 */
(function (root) {
  "use strict";
  const QC = root.QC || (typeof require !== "undefined" ? require("./engine.js") : null);
  const EPS = 1e-9;

  // ------------------------------------------------------------------ positions
  // pieces: square -> symbol (pid = symbol + starting square, e.g. "wNa3")
  // setup:  quantum moves played first to create the position (no measurements)
  // goal:   win   — capture the king with probability >= min
  //         best  — capture the king with the best possible probability
  //         survive — after your move, the opponent's best chance to capture your king <= max
  //         certain — piece `pid` ends 100% on one of `squares`
  const PUZZLES = [
    {
      id: "b1", level: "Beginner", title: "King hunt",
      side: "w", pieces: { e1: "wK", d1: "wR", b3: "wN", d4: "bK", d3: "bP", a5: "bR" },
      answer: ["move", "b3", "d4"],
      goal: { type: "win", min: 1 },
      task: "Capture the black king this move.",
      hint: "The rook's path is blocked. Which piece can jump?",
      lesson: "Knights jump over pieces, so blockers never stop them. Classical chess still works here.",
    },
    {
      id: "b2", level: "Beginner", title: "Half a king",
      side: "w", pieces: { e1: "wK", c1: "wR", a2: "wP", d4: "bK", a5: "bR" },
      setup: [["split", "d4", "c5", "e5"]],
      answer: ["move", "c1", "c5"],
      goal: { type: "win", min: 0.5 },
      task: "The black king is 50% on c5 and 50% on e5. Give yourself a 50% chance to win.",
      hint: "Attack one of the two king squares. The capture measures it.",
      lesson: "A capture measures the target square. Half a king means a coin-fair 50%: if the king isn't there, your rook simply moves onto the empty square.",
    },
    {
      id: "b3", level: "Beginner", title: "Reunite the knight",
      side: "w", pieces: { e1: "wK", b1: "wN", d4: "bK", e5: "bR" },
      setup: [["split", "b1", "a3", "c3"]],
      answer: ["merge", "a3", "c3", "b5"],
      goal: { type: "certain", pid: "wNb1", squares: ["b5"] },
      task: "Your knight is split across a3 and c3. Merge it, with 100% certainty, onto the one square where it attacks the black king.",
      hint: "Merge mode: click one half, then the other, then a square both halves can reach.",
      lesson: "Both halves can reach b1 and b5. Merging onto b5 brings the knight back with certainty, and from there it attacks d4.",
    },
    {
      id: "b4", level: "Beginner", title: "Ghost on the line",
      side: "w", pieces: { a1: "wK", e1: "wR", a5: "wR", e5: "bK", d5: "bN" },
      setup: [["split", "d5", "e3", "c3"]],
      answer: ["move", "a5", "e5"],
      goal: { type: "win", min: 1 },
      task: "Win with certainty. Careful: a black knight is 50% on e3 and 50% on c3.",
      hint: "A 'maybe' piece on a path is measured during the capture. Find a path with no ghost on it.",
      lesson: "Rook e1 → e5 passes the 50% knight on e3, so it only works half the time. The rook on a5 slides along the 5th rank: the knight left d5 when it split, so that path is completely empty. 100%.",
    },
    {
      id: "i1", level: "Intermediate", title: "Trust the jumper",
      side: "w", pieces: { d1: "wK", e1: "wQ", c1: "wR", b3: "wN", a5: "bK", d5: "bN" },
      setup: [["split", "c1", "a1", "b1"], ["split", "d5", "c3", "e3"]],
      answer: ["move", "b3", "a5"],
      goal: { type: "win", min: 1 },
      task: "Capture the king with certainty. Your rook is split across a1 and b1, and a black knight is split across c3 and e3.",
      hint: "An attacker in superposition is measured too. Use a piece that is certainly there, with a path that has no ghosts.",
      lesson: "Rook a1 → a5 only works if the rook is really on a1 (50%). Queen e1 → a5 runs through c3, where the black knight might be (50%). The knight on b3 jumps straight to a5: a certain attacker with no path, 100%.",
    },
    {
      id: "i2", level: "Intermediate", title: "Hedge the king",
      side: "w", pieces: { b1: "wK", e3: "wP", b5: "bR", a5: "bQ", e2: "bR", d3: "bN", e5: "bK" },
      answer: ["split", "b1", "a1", "c1"],
      goal: { type: "survive", max: 0.5 },
      task: "Your king is attacked and every escape square is covered. Cut Black's winning chance to 50%.",
      hint: "If the king can't be safe anywhere, make it be in two places.",
      lesson: "Split the king onto two attacked squares. Black can only capture one of them per move, and that capture is measured: 50%.",
    },
    {
      id: "i3", level: "Intermediate", title: "Unequal odds",
      side: "w", pieces: { e1: "wK", a4: "wR", e4: "wN", c4: "bK", a5: "bR" },
      setup: [["split", "c4", "c5", "c3"], ["split", "c3", "b4", "d4"]],
      answer: ["move", "e4", "c5"],
      goal: { type: "best" },
      task: "The black king is spread over three squares. Find the capture with the highest chance to win.",
      hint: "Read the percentages. Then check whether a capture's path runs through another king square.",
      lesson: "The king is 50% on c5, 25% on b4 and 25% on d4. The knight takes c5 directly: 50%. Rook takes b4: 25%. Rook to d4 must pass b4, which could hold the king: still 25%.",
    },
    {
      id: "i4", level: "Intermediate", title: "Build a wall",
      side: "w", pieces: { e1: "wK", a3: "wN", e5: "bR", d5: "bQ", b5: "bK" },
      setup: [["split", "a3", "c2", "c4"]],
      answer: ["merge", "c2", "c4", "e3"],
      goal: { type: "survive", max: 0 },
      task: "The rook on e5 attacks your king and the queen covers d1 and d2. Make your king completely safe.",
      hint: "Half a blocker only blocks half the time. Can you make a whole one?",
      lesson: "Merge the knight from c2 and c4 onto e3. It is now 100% there and blocks the e-file completely. Moving one half to e3 would leave a 50% hole.",
    },
    {
      id: "a1", level: "Advanced", title: "Hide behind a ghost",
      side: "w", pieces: { b1: "wK", b5: "wN", a5: "bQ", c5: "bR", d3: "bB", d1: "bN", e5: "bK" },
      setup: [["split", "b5", "a3", "c3"]],
      answer: ["split", "b1", "a1", "c1"],
      goal: { type: "survive", max: 0.25 },
      task: "The bishop on d3 attacks your king, and every escape square is covered. Your knight is 50% on a3 and 50% on c3. Bring Black's winning chance down to 25%.",
      hint: "The a-file and the c-file are each blocked by one half of your knight, and exactly one half is real.",
      lesson: "a1, a2 and c1 are only attacked through a square where your knight might be. Moving the king to one of them already halves the risk to 50%. Splitting it across two of them halves it again: every capture now needs the king on that square (50%) and the knight on the other file (50%), so 25%.",
    },
    {
      id: "a2", level: "Advanced", title: "Ghost maze",
      side: "w", pieces: { e1: "wQ", c1: "wR", a3: "wB", a1: "wK", d4: "bK", d5: "bN" },
      setup: [["split", "d4", "c5", "e5"], ["split", "d5", "c3", "e3"]],
      answer: ["move", "a3", "c5"],
      goal: { type: "best" },
      task: "King 50/50 on c5 and e5; a black knight 50/50 on c3 and e3, guarding both files. Find the best capture.",
      hint: "Count the probabilities that must all line up for each capture.",
      lesson: "Rook c1 → c5 and queen e1 → e5 each need the king there (50%) and the knight not on their file (50%): 25%. The bishop on a3 reaches c5 through b4, which nothing can occupy: 50%, the most any single capture can get when the king is split in two.",
    },
  ];

  // ------------------------------------------------------------------ game helpers
  function doAction(g, a) {
    if (a[0] === "move") return g.move(a[1], a[2]);
    if (a[0] === "split") return g.split(a[1], a[2], a[3]);
    return g.merge(a[1], a[2], a[3]);
  }

  function makePuzzleGame(pz, seed = null) {
    const pieces = new Map();
    for (const [sq, sym] of Object.entries(pz.pieces)) {
      pieces.set(QC.parse(sq), { pid: sym + sq, color: sym[0], kind: sym[1] });
    }
    const g = new QC.Game({ pieces, seed, quantum: true });
    for (const [kind, ...sqs] of pz.setup || []) {
      const s = sqs.map(QC.parse);
      g.turn = g.pieces.get(s[0]).color;
      doAction(g, [kind, ...s]);
    }
    g.turn = pz.side; g.winner = null; g.log = []; g.ply = 0; g.lastTrace = []; g.q.trace = [];
    return g;
  }

  function allActions(g) {
    const acts = [];
    for (const [sq, p] of g.pieces) {
      if (p.color !== g.turn) continue;
      const o = g.options(sq);
      for (const t of o.move.concat(o.capture)) acts.push(["move", sq, t]);
      for (let a = 0; a < o.split.length; a++) for (let b = a + 1; b < o.split.length; b++) acts.push(["split", sq, o.split[a], o.split[b]]);
      for (const [s2, ts] of o.merge) for (const t of ts) if (sq < s2) acts.push(["merge", sq, s2, t]);
    }
    return acts;
  }

  // every measurement branch of `act`: [{ w, prefix, game }]
  function outcomes(factory, act) {
    const leaves = [];
    (function run(prefix) {
      const g = factory(), ps = [];
      let k = 0;
      g.q.forceOutcome = (p) => {
        if (k < prefix.length) { ps.push(p); return prefix[k++]; }
        throw { branch: p };
      };
      try {
        doAction(g, act);
      } catch (e) {
        if (e && e.branch !== undefined) {
          if (e.branch > EPS) run(prefix.concat(1));
          if (e.branch < 1 - EPS) run(prefix.concat(0));
          return;
        }
        throw e;
      }
      g.q.forceOutcome = null;
      let w = 1;
      prefix.forEach((v, i) => (w *= v ? ps[i] : 1 - ps[i]));
      leaves.push({ w, prefix, game: g });
    })([]);
    return leaves;
  }

  function replay(factory, act, prefix) {
    return () => {
      const g = factory();
      let k = 0;
      g.q.forceOutcome = () => prefix[k++];
      doAction(g, act);
      g.q.forceOutcome = null;
      return g;
    };
  }

  function winChance(factory, act, color) {
    return outcomes(factory, act).reduce((s, l) => s + (l.game.winner === color ? l.w : 0), 0);
  }

  function bestWin(factory) {
    const g = factory(), me = g.turn;
    let best = 0;
    for (const a of allActions(g)) best = Math.max(best, winChance(factory, a, me));
    return best;
  }

  // opponent's best chance to win immediately after `act`, averaged over its outcomes
  function riskAfter(factory, act) {
    const me = factory().turn;
    let risk = 0;
    for (const leaf of outcomes(factory, act)) {
      if (leaf.game.winner === me) continue;
      risk += leaf.w * bestWin(replay(factory, act, leaf.prefix));
    }
    return risk;
  }

  function certainOn(factory, act, pid, squares) {
    let ok = 0;
    for (const leaf of outcomes(factory, act)) {
      const hit = squares.some((s) => {
        const sq = QC.parse(s), p = leaf.game.pieces.get(sq);
        return p && p.pid === pid && leaf.game.prob(sq) > 1 - 1e-7;
      });
      if (hit) ok += leaf.w;
    }
    return ok;
  }

  /** Grade one move. Returns { ok, value, best, label }. */
  function grade(pz, act, cache = {}) {
    const factory = pz.factory || (() => makePuzzleGame(pz));
    const g = pz.goal;
    if (g.type === "win" || g.type === "best") {
      const value = winChance(factory, act, pz.side);
      const best = g.type === "best" ? (cache.best ??= bestWin(factory)) : g.min;
      return { ok: value >= best - 1e-9 && value > 0, value, best, label: "chance to win" };
    }
    if (g.type === "survive") {
      const value = riskAfter(factory, act);
      return { ok: value <= g.max + 1e-9, value, best: g.max, label: "opponent's chance to win next move" };
    }
    const value = certainOn(factory, act, g.pid, g.squares);
    return { ok: value > 1 - 1e-9, value, best: 1, label: "chance the piece ends on the target" };
  }

  // ------------------------------------------------------------------ endless mode
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A random quantum position reached by play from the start, where the side to
   * move has a real but uncertain shot at the king. Moves are recorded so the
   * position can be rebuilt exactly (measurements replayed with fixed outcomes).
   */
  function generateChallenge(seed, maxTries = 400) {
    for (let t = 0; t < maxTries; t++) {
      const rnd = mulberry(seed * 7919 + t);
      const g = new QC.Game({ seed: seed + t });
      const history = [];
      const plies = 6 + Math.floor(rnd() * 12);
      let dead = false;
      for (let i = 0; i < plies && !g.winner; i++) {
        const acts = allActions(g);
        const quantum = acts.filter((a) => a[0] !== "move");
        const pool = quantum.length && rnd() < 0.55 ? quantum : acts;
        const a = pool[Math.floor(rnd() * pool.length)];
        const outs = [];
        g.q.forceOutcome = (p) => { const v = rnd() < p ? 1 : 0; outs.push(v); return v; };
        doAction(g, a);
        g.q.forceOutcome = null;
        history.push({ a, outs });
        if (g.winner) dead = true;
      }
      if (dead || g.q.numQubits === 0) continue;
      const factory = () => {
        const h = new QC.Game({ seed: 1 });
        for (const { a, outs } of history) {
          let k = 0;
          h.q.forceOutcome = () => outs[k++];
          doAction(h, a);
          h.q.forceOutcome = null;
        }
        h.log = []; h.ply = 0; h.lastTrace = []; h.q.trace = [];
        return h;
      };
      const fg = factory();
      const scores = allActions(fg).map((a) => winChance(factory, a, fg.turn)).filter((v) => v > 0);
      const best = Math.max(0, ...scores);
      // a real decision: a decent best move and at least one worse capture to avoid
      if (best < 0.2 || best > 0.99 || !scores.some((v) => v < best - 1e-6)) continue;
      return {
        id: `x${seed}`, level: "Endless", title: `Challenge #${seed}`, side: fg.turn, factory,
        goal: { type: "best" },
        task: `A position from a real quantum game. ${fg.turn === "w" ? "White" : "Black"} to move: find the capture with the best chance to take the king.`,
        hint: "Multiply the chances: attacker really there × path really clear × king really on the target.",
        lesson: `The best available chance here is ${Math.round(best * 100)}%.`,
        bestKnown: best,
      };
    }
    return null;
  }

  const API = { PUZZLES, makePuzzleGame, allActions, outcomes, winChance, bestWin, riskAfter, grade, doAction, generateChallenge };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.QCPuzzles = API;
})(this);
