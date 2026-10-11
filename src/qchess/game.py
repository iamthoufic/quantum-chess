"""Game rules for 5x5 quantum chess.

Bookkeeping: `self.pieces` maps square -> Piece for every square that *might*
hold a piece. A square is either
  * definite: not in the statevector; it holds its piece with certainty, or
  * active:   it has a qubit; it holds its piece with probability prob(sq).
A square never holds two different pieces in different branches, because a
non-capturing move may only land on an empty square, and captures are always
resolved by measurement first.

Moves (one per turn):
  move   - classical move, or for an uncertain piece / path an iSWAP that can
           entangle the mover with "maybe" pieces it slides past
  split  - one piece onto two empty squares (sqrt-iSWAP, then iSWAP)
  merge  - two parts of one piece onto one empty square (the split, reversed)
  capture- measured: attacker, then blockers on the path, then target
"""

from .board import (BLACK, KING, KNIGHT, PAWN, QUEEN, WHITE, Piece, file_of,
                    name, on_board, parse, path_between, rank_of, rays, square,
                    starting_pieces)
from .quantum import (ISWAP, ISWAP_DG, MAX_QUBITS, SQRT_ISWAP, SQRT_ISWAP_DG,
                      QuantumState, controlled_iswap, trace_to_circuit, trace_to_json)


class IllegalMove(ValueError):
    pass


def other(color):
    return BLACK if color == WHITE else WHITE


class Game:
    def __init__(self, seed=None, quantum=True):
        self.pieces: dict[int, Piece] = starting_pieces()
        self.q = QuantumState(seed)
        self.turn = WHITE
        self.winner = None          # WHITE, BLACK, "draw" or None
        self.end_reason = None      # why the game ended, in words
        self.quiet_plies = 0        # plies since the last capture or pawn move (50-move rule)
        self._count_before = 0
        self.quantum = quantum      # False = classical baseline (no split/merge)
        self.ply = 0
        self.log: list[dict] = []   # one entry per turn
        self.last_circuit = None
        self.last_trace = []
        self._events: list[str] = []

    # ------------------------------------------------------------------ queries
    def prob(self, sq: int) -> float:
        if sq not in self.pieces:
            return 0.0
        return self.q.prob(sq) if self.q.is_active(sq) else 1.0

    def definite(self, sq: int) -> bool:
        return sq in self.pieces and not self.q.is_active(sq)

    def options(self, sq: int) -> dict:
        """Everything the side to move may do with the piece on `sq`."""
        out = {"move": [], "capture": [], "split": [], "merge": {}}
        piece = self.pieces.get(sq)
        if piece is None or piece.color != self.turn or self.winner:
            return out
        if piece.kind == PAWN:
            self._pawn_options(sq, piece, out)
            if not self.quantum:
                out["move"] = [t for t in out["move"] if not self._exposes_king(sq, t)]
                out["capture"] = [t for t in out["capture"] if not self._exposes_king(sq, t)]
            return out
        for target, path in rays(piece.kind, sq):
            if any(self.definite(p) for p in path):
                continue                       # a certain blocker: ray is closed
            occupant = self.pieces.get(target)
            if occupant is None:
                out["move"].append(target)
                if not any(p in self.pieces for p in path):
                    out["split"].append(target)
            elif occupant.color != piece.color:
                out["capture"].append(target)
        if not self.quantum:
            # classical rules: you may not leave your own king in check
            out["move"] = [t for t in out["move"] if not self._exposes_king(sq, t)]
            out["capture"] = [t for t in out["capture"] if not self._exposes_king(sq, t)]
        if not self.quantum or len(out["split"]) < 2:
            out["split"] = []
        if self.quantum:
            for s2, other_part in self.pieces.items():
                if s2 != sq and other_part.pid == piece.pid:
                    targets = [t for t in self._clear_targets(piece.kind, sq)
                               if t in self._clear_targets(piece.kind, s2)]
                    if targets:
                        out["merge"][s2] = targets
        return out

    def _clear_targets(self, kind, sq):
        """Empty squares reachable with a completely empty path."""
        return [t for t, path in rays(kind, sq)
                if t not in self.pieces and not any(p in self.pieces for p in path)]

    def _pawn_options(self, sq, piece, out):
        step = 1 if piece.color == WHITE else -1
        f, r = file_of(sq), rank_of(sq) + step
        if on_board(f, r):
            fwd = square(f, r)
            if fwd not in self.pieces or self.q.is_active(fwd):
                out["move"].append(fwd)        # into a "maybe" square: measured push
        for df in (-1, 1):
            if on_board(f + df, r):
                diag = square(f + df, r)
                occupant = self.pieces.get(diag)
                if occupant is not None and occupant.color != piece.color:
                    out["capture"].append(diag)

    # ---- classical check rules (every piece is definite, so plain chess logic applies)
    def attacked(self, sq: int, by: str) -> bool:
        """Is `sq` attacked by a piece of colour `by`? Classical positions only."""
        for s, p in self.pieces.items():
            if p.color != by:
                continue
            if p.kind == PAWN:
                step = 1 if by == WHITE else -1
                f, r = file_of(s), rank_of(s) + step
                if on_board(f, r) and abs(file_of(sq) - f) == 1 and rank_of(sq) == r:
                    return True
                continue
            for t, path in rays(p.kind, s):
                if t == sq and not any(q in self.pieces for q in path):
                    return True
        return False

    def king_square(self, color: str):
        return next((s for s, p in self.pieces.items() if p.color == color and p.kind == KING), None)

    def in_check(self, color: str) -> bool:
        """Classical rules only: is `color`'s king attacked?"""
        if self.quantum:
            return False
        k = self.king_square(color)
        return k is not None and self.attacked(k, other(color))

    def _exposes_king(self, src: int, dst: int) -> bool:
        """Would moving src -> dst leave the mover's own king in check?"""
        saved = dict(self.pieces)
        piece = self.pieces[src]
        del self.pieces[src]
        self.pieces[dst] = piece
        try:
            k = self.king_square(piece.color)
            return k is not None and self.attacked(k, other(piece.color))
        finally:
            self.pieces = saved

    def has_any_move(self) -> bool:
        for sq, piece in list(self.pieces.items()):
            if piece.color == self.turn:
                o = self.options(sq)
                if o["move"] or o["capture"] or o["split"] or o["merge"]:
                    return True
        return False

    # ------------------------------------------------------------------ actions
    def move(self, src: int, dst: int) -> dict:
        piece = self._mover(src)
        opts = self.options(src)
        if dst in opts["capture"]:
            return self._finish("capture", piece, src, dst, self._capture(piece, src, dst))
        if dst not in opts["move"]:
            raise IllegalMove(f"{piece.kind} on {name(src)} cannot move to {name(dst)}")
        if piece.kind == PAWN:
            ok = self._pawn_push(piece, src, dst)
        else:
            ok = self._slide(piece, src, dst)
        return self._finish("move", piece, src, dst, ok)

    def split(self, src: int, t1: int, t2: int) -> dict:
        piece = self._mover(src)
        opts = self.options(src)
        if t1 == t2 or t1 not in opts["split"] or t2 not in opts["split"]:
            raise IllegalMove(f"cannot split {name(src)} to {name(t1)} and {name(t2)}")
        self._make_room(3)
        if self.pieces.get(src) != piece:
            self._event(f"{name(src)} collapsed away before the split")
            return self._finish("split", piece, src, t1, False)
        self.q.activate(src, True)
        self.q.activate(t1, False)
        self.q.activate(t2, False)
        self.q.apply(SQRT_ISWAP, [src, t1])   # half the amplitude to t1
        self.q.apply(ISWAP, [src, t2])        # the rest to t2
        self.pieces[t1] = self.pieces[t2] = piece
        self._settle()
        return self._finish("split", piece, src, t1, True, extra=t2)

    def merge(self, s1: int, s2: int, dst: int) -> dict:
        piece = self._mover(s1)
        if dst not in self.options(s1)["merge"].get(s2, []):
            raise IllegalMove(f"cannot merge {name(s1)} and {name(s2)} on {name(dst)}")
        self._make_room(1)
        if self.pieces.get(s1) != piece or self.pieces.get(s2) != piece:
            self._event("one half collapsed away before the merge")
            return self._finish("merge", piece, s1, dst, False)
        self.q.activate(dst, False)
        # exact inverse of split(dst -> s1, s2): amplitudes interfere onto dst
        self.q.apply(ISWAP_DG, [dst, s2])
        self.q.apply(SQRT_ISWAP_DG, [dst, s1])
        self.pieces[dst] = piece
        self._settle()
        return self._finish("merge", piece, s1, dst, True, extra=s2)

    # ------------------------------------------------------------------ internals
    def _mover(self, src):
        if self.winner:
            raise IllegalMove("the game is over")
        piece = self.pieces.get(src)
        if piece is None or piece.color != self.turn:
            raise IllegalMove(f"no {self.turn} piece on {name(src)}")
        self._count_before = len({p.pid for p in self.pieces.values()})   # for the 50-move rule
        return piece

    def _event(self, text):
        self._events.append(text)

    def _measure(self, sq) -> int:
        """Measure an active square, then tidy up. Returns 1 if a piece was found."""
        result = self.q.measure(sq)
        piece = self.pieces[sq]
        self._event(f"measured {name(sq)}: {piece.kind} {'present' if result else 'absent'}")
        self._settle()
        return result

    def _settle(self):
        """Drop qubits that became certain; forget pieces that are certainly not there."""
        for sq, value in self.q.compact().items():
            if value == 0:
                self.pieces.pop(sq, None)

    def _make_room(self, needed):
        """Keep the statevector under MAX_QUBITS by measuring the oldest uncertain squares."""
        while self.q.num_qubits + needed > MAX_QUBITS and self.q.num_qubits:
            sq = self.q.active[0]
            self._event(f"qubit budget reached: forced measurement of {name(sq)}")
            self._measure(sq)

    def _move_classically(self, piece, src, dst):
        del self.pieces[src]
        self.pieces[dst] = piece
        if piece.kind == PAWN and rank_of(dst) in (0, 4):
            self.pieces[dst] = Piece(piece.pid, piece.color, QUEEN)
            self._event(f"pawn promoted to queen on {name(dst)}")

    def _slide(self, piece, src, dst) -> bool:
        path = path_between(piece.kind, src, dst) or []
        controls = [p for p in path if p in self.pieces]   # all of these are "maybe"
        if self.definite(src) and not controls:
            self._move_classically(piece, src, dst)
            return True
        self._make_room(2)
        if self.pieces.get(src) != piece:
            self._event(f"{name(src)} collapsed away before the move")
            return False
        controls = [p for p in path if p in self.pieces]
        if any(self.definite(p) for p in controls):
            self._event("path became blocked")
            return False
        self.q.activate(src, True)
        self.q.activate(dst, False)
        # move only in the branches where every square on the path is empty
        self.q.apply(controlled_iswap(len(controls)), controls + [src, dst])
        self.pieces[dst] = piece
        if controls:
            self._event(f"{piece.kind} entangled with the piece(s) on "
                        + ", ".join(name(c) for c in controls))
        self._settle()
        return True

    def _pawn_push(self, piece, src, dst) -> bool:
        if dst in self.pieces:                 # a "maybe" piece stands in front
            if self._measure(dst):
                self._event(f"pawn blocked on {name(dst)}")
                return False
        self._move_classically(piece, src, dst)
        return True

    def _capture(self, piece, src, dst) -> bool:
        if self.q.is_active(src) and not self._measure(src):
            self._event("the attacker was not really there")
            return False
        path = [] if piece.kind in (KNIGHT, KING, PAWN) else (path_between(piece.kind, src, dst) or [])
        for p in path:
            if p in self.pieces and (self.definite(p) or self._measure(p)):
                self._event(f"capture blocked by the piece on {name(p)}")
                return False
        if dst in self.pieces and self.q.is_active(dst):
            self._measure(dst)
        victim = self.pieces.get(dst)
        if victim is None:
            if piece.kind == PAWN:             # pawns cannot move diagonally into nothing
                self._event("the target was not there; the pawn stays")
                return False
            self._event(f"{name(dst)} was empty; the {piece.kind} moves in")
        else:
            del self.pieces[dst]
            self._event(f"captured {victim.color}{victim.kind} on {name(dst)}")
            if victim.kind == KING:
                self.winner = piece.color
        self._move_classically(piece, src, dst)
        return True

    def _finish(self, kind, piece, src, dst, ok, extra=None) -> dict:
        trace = self.q.take_trace()
        self.last_circuit = trace_to_circuit(trace)
        self.last_trace = trace_to_json(trace)
        entry = {
            "ply": self.ply, "color": piece.color, "piece": piece.kind, "kind": kind,
            "from": name(src), "to": name(dst), "extra": name(extra) if extra is not None else None,
            "ok": ok, "events": self._events,
            # measurement results in order: enough to replay the game exactly (take-back, bots)
            "outs": [op[2] for op in trace if op[0] == "measure"],
        }
        self._events = []
        self.log.append(entry)
        self.ply += 1
        count = len({p.pid for p in self.pieces.values()})
        if count < self._count_before or piece.kind == PAWN:
            self.quiet_plies = 0
        else:
            self.quiet_plies += 1
        if self.winner:
            self.end_reason = "The king was captured."
        else:
            self.turn = other(self.turn)
            self._check_draw()
        return entry

    def _check_draw(self):
        """Draw rules: bare kings, the 50-move rule, or no legal action for the side to move."""
        if all(p.kind == KING for p in self.pieces.values()):
            self.winner, self.end_reason = "draw", "Only the two kings are left."
        elif self.quiet_plies >= 100:
            self.winner, self.end_reason = "draw", "50 moves each without a capture or a pawn move."
        elif not self.has_any_move():
            if not self.quantum and self.in_check(self.turn):
                self.winner, self.end_reason = other(self.turn), "Checkmate."
            elif not self.quantum:
                self.winner, self.end_reason = "draw", "Stalemate: no legal move and not in check."
            else:
                self.winner, self.end_reason = "draw", "The side to move has no legal action."

    # ------------------------------------------------------------------ replay
    def replay_entry(self, e: dict):
        """Play one logged move again with the same measurement results."""
        self.q.force_outcomes = list(e.get("outs", []))
        try:
            if e["kind"] == "split":
                self.split(parse(e["from"]), parse(e["to"]), parse(e["extra"]))
            elif e["kind"] == "merge":
                self.merge(parse(e["from"]), parse(e["extra"]), parse(e["to"]))
            else:
                self.move(parse(e["from"]), parse(e["to"]))
        finally:
            self.q.force_outcomes = None

    @classmethod
    def from_log(cls, log: list[dict], seed=None, quantum=True) -> "Game":
        g = cls(seed=seed, quantum=quantum)
        for e in log:
            g.replay_entry(e)
        return g

    def undo(self, plies: int = 1) -> "Game":
        """A new game equal to this one with the last `plies` moves taken back."""
        return Game.from_log(self.log[:max(0, len(self.log) - plies)], seed=None, quantum=self.quantum)

    # ------------------------------------------------------------------ display
    def ascii(self) -> str:
        rows = []
        for r in range(4, -1, -1):
            cells = []
            for f in range(5):
                sq = square(f, r)
                p = self.pieces.get(sq)
                if p is None:
                    cells.append("  .  ")
                else:
                    sym = p.kind if p.color == WHITE else p.kind.lower()
                    pr = self.prob(sq)
                    cells.append(f" {sym}   " if pr > 1 - 1e-9 else f"{sym}{pr:4.0%}")
            rows.append(f"{r + 1} " + "|".join(cells))
        rows.append("   " + "     ".join("abcde"))
        return "\n".join(rows)
