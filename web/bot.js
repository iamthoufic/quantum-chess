// Computer opponents. A bot searches every legal action; each action's value is the
// average over all of its measurement outcomes, weighted by the exact Born-rule
// probability (no sampling), so "preprogrammed for every move" in effect.
// Thinking always happens on an in-browser QC.Game: with the Qiskit server, the
// game is mirrored from its move log (same measurement results) before each think.
"use strict";

const QBOT = (() => {
  const EPS = 1e-9, WIN = 10000;
  const VAL = { K: 0, Q: 9, R: 5, B: 3.2, N: 3, P: 1 };
  const CENTRE = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 2, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0];

  const LEVELS = [
    { id: "kitten", name: "Kitten", tag: "Easy", depth: 0,
      blurb: "Schrödinger's kitten: playful and easy to beat. Grabs free pieces, otherwise wanders." },
    { id: "heisenberg", name: "Heisenberg", tag: "Intermediate", depth: 1,
      blurb: "Looks one move ahead, weighing every measurement outcome, and watches what you can capture back." },
    { id: "dirac", name: "Deep Dirac", tag: "Advanced", depth: 2,
      blurb: "Searches two moves deep across every outcome and uses splits to hedge. Named for Paul Dirac, with a nod to Deep Blue." },
  ];

  function doAction(g, a) {
    if (a[0] === "move") return g.move(a[1], a[2]);
    if (a[0] === "split") return g.split(a[1], a[2], a[3]);
    return g.merge(a[1], a[2], a[3]);
  }

  // every legal action for the side to move; split pairs are capped per piece
  function actions(g, maxSplitTargets = 5) {
    const out = [];
    for (const [sq, p] of g.pieces) {
      if (p.color !== g.turn) continue;
      const o = g.options(sq);
      for (const t of o.capture) out.push(["move", sq, t, null, "capture"]);
      for (const t of o.move) out.push(["move", sq, t, null, "move"]);
      const sp = o.split.slice(0, maxSplitTargets);
      for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) out.push(["split", sq, sp[i], sp[j], "split"]);
      for (const [s2, ts] of o.merge) if (sq < s2) for (const t of ts) out.push(["merge", sq, s2, t, "merge"]);
    }
    return out;
  }

  // every measurement branch of `act` from position g: [{ w, game }]
  function outcomes(g, act) {
    const leaves = [];
    (function run(prefix) {
      const c = g.clone(), ps = [];
      let k = 0;
      c.q.forceOutcome = (p) => { if (k < prefix.length) { ps.push(p); return prefix[k++]; } throw { branch: p }; };
      try { doAction(c, act); } catch (e) {
        if (e && e.branch !== undefined) {
          if (e.branch > EPS) run(prefix.concat(1));
          if (e.branch < 1 - EPS) run(prefix.concat(0));
          return;
        }
        throw e;
      }
      c.q.forceOutcome = null;
      let w = 1;
      prefix.forEach((v, i) => (w *= v ? ps[i] : 1 - ps[i]));
      leaves.push({ w, game: c });
    })([]);
    return leaves;
  }

  // material and a little position, from `me`'s point of view
  function evaluate(g, me) {
    if (g.winner) return g.winner === me ? WIN : g.winner === "draw" ? 0 : -WIN;
    let s = 0;
    for (const [sq, p] of g.pieces) {
      const pr = g.prob(sq);
      if (pr < EPS) continue;
      let v = VAL[p.kind];
      const rank = Math.floor(sq / 5);
      if (p.kind === "P") v += 0.12 * (p.color === "w" ? rank : 4 - rank);
      if (p.kind === "N" || p.kind === "B") v += 0.08 * CENTRE[sq];
      s += (p.color === me ? 1 : -1) * v * pr;
    }
    return s;
  }

  const expect = (leaves, f) => leaves.reduce((s, l) => s + l.w * f(l.game), 0);

  // the side to move in g picks its best action for itself; returns the value for `me`.
  // capturesOnly: a quiescence pass (captures or stand pat). leaf: how to value positions after it.
  function bestFor(g, me, capturesOnly, leaf) {
    if (g.winner) return evaluate(g, me);
    const mover = g.turn, sign = mover === me ? 1 : -1;
    const stand = evaluate(g, me);
    let best = -Infinity;                        // from the mover's point of view
    for (const a of actions(g, 3)) {
      if (capturesOnly && a[4] !== "capture") continue;
      const v = sign * expect(outcomes(g, a), (h) => leaf(h));
      if (v > best) best = v;
    }
    if (best === -Infinity) return stand;         // nothing to consider: stand pat
    if (capturesOnly) best = Math.max(best, sign * stand);
    return sign * best;
  }

  // expected value of `act` for `me`:
  //   depth 0: static.   depth 1: opponent's best capture back.
  //   depth 2: opponent's best move of any kind, then my best capture back.
  function value(g, act, me, depth) {
    return expect(outcomes(g, act), (h) => {
      if (h.winner || depth === 0) return evaluate(h, me);
      if (depth === 1) return bestFor(h, me, true, (l) => evaluate(l, me));
      return bestFor(h, me, false, (l) => bestFor(l, me, true, (m) => evaluate(m, me)));
    });
  }

  /** Choose an action for the side to move in `g`. Returns [kind, src, dst, extra]. */
  function choose(g, levelId, rng = Math.random) {
    const level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    const me = g.turn, all = actions(g);
    if (!all.length) return null;
    const strip = (a) => a.slice(0, 4);

    // nobody passes up the king
    let kingShot = null, kingP = 0;
    for (const a of all) {
      if (a[4] !== "capture") continue;
      const p = expect(outcomes(g, a), (h) => (h.winner === me ? 1 : 0));
      if (p > kingP) { kingP = p; kingShot = a; }
    }
    if (kingShot && kingP > 0.5) return strip(kingShot);

    if (level.depth === 0) {
      // Kitten: weighted random, favouring captures, never hanging its own king outright
      const safe = all.filter((a) => expect(outcomes(g, a), (h) => bestFor(h, me, true, (l) => evaluate(l, me))) > -WIN / 2);
      const pool = (safe.length ? safe : all).flatMap((a) => {
        const victim = a[4] === "capture" ? g.pieces.get(a[2]) : null;
        const w = victim ? 2 + VAL[victim.kind] : a[4] === "split" ? 1.5 : 1;
        return Array(Math.round(w)).fill(a);
      });
      return strip(pool[Math.floor(rng() * pool.length)]);
    }

    // Heisenberg / Deep Dirac: order by a quick look, then search the best candidates deeper
    const quick = all.map((a) => ({ a, v: value(g, a, me, 0) + rng() * 0.01 })).sort((x, y) => y.v - x.v);
    const cands = quick.slice(0, level.depth === 1 ? 18 : 12);
    let best = null, bestV = -Infinity;
    for (const c of cands) {
      const v = value(g, c.a, me, level.depth) + rng() * 0.02;
      if (v > bestV) { bestV = v; best = c.a; }
    }
    return strip(best);
  }

  /** The same game as the server reports it (same moves, same measurement results). */
  const mirror = (state) => QC.Game.fromLog(state.log, { quantum: state.quantum });

  return { LEVELS, choose, mirror, actions, outcomes, evaluate, value };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QBOT;
