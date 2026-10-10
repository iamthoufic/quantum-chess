"""Classical geometry of the 5x5 Gardner minichess board.

Squares are numbered 0..24: index = rank * 5 + file, with a1 = 0 and e5 = 24.
Nothing in this module is quantum; it only answers "which squares can this
piece type reach from here, and which squares lie on the way".
"""

from dataclasses import dataclass

SIZE = 5
FILES = "abcde"

KING, QUEEN, ROOK, BISHOP, KNIGHT, PAWN = "K", "Q", "R", "B", "N", "P"
WHITE, BLACK = "w", "b"

PIECE_NAMES = {
    KING: "King", QUEEN: "Queen", ROOK: "Rook",
    BISHOP: "Bishop", KNIGHT: "Knight", PAWN: "Pawn",
}

# Gardner (1969): back rank R N B Q K, pawns in front of it.
BACK_RANK = [ROOK, KNIGHT, BISHOP, QUEEN, KING]

ROOK_DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
BISHOP_DIRS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
KNIGHT_JUMPS = [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]


@dataclass(frozen=True)
class Piece:
    """A physical piece. `pid` stays the same while the piece is split across squares."""
    pid: str
    color: str
    kind: str

    @property
    def symbol(self) -> str:
        return self.color + self.kind


def square(file: int, rank: int) -> int:
    return rank * SIZE + file


def file_of(sq: int) -> int:
    return sq % SIZE


def rank_of(sq: int) -> int:
    return sq // SIZE


def name(sq: int) -> str:
    return f"{FILES[file_of(sq)]}{rank_of(sq) + 1}"


def parse(sq_name: str) -> int:
    sq_name = sq_name.strip().lower()
    if len(sq_name) != 2 or sq_name[0] not in FILES or not sq_name[1].isdigit():
        raise ValueError(f"bad square name: {sq_name!r}")
    f, r = FILES.index(sq_name[0]), int(sq_name[1]) - 1
    if not 0 <= r < SIZE:
        raise ValueError(f"bad square name: {sq_name!r}")
    return square(f, r)


def on_board(f: int, r: int) -> bool:
    return 0 <= f < SIZE and 0 <= r < SIZE


def starting_pieces() -> dict:
    """Map square -> Piece for the Gardner starting position."""
    pieces = {}
    for f, kind in enumerate(BACK_RANK):
        pieces[square(f, 0)] = Piece(f"w{kind}{FILES[f]}", WHITE, kind)
        pieces[square(f, 4)] = Piece(f"b{kind}{FILES[f]}", BLACK, kind)
        pieces[square(f, 1)] = Piece(f"wP{FILES[f]}", WHITE, PAWN)
        pieces[square(f, 3)] = Piece(f"bP{FILES[f]}", BLACK, PAWN)
    return pieces


def rays(kind: str, sq: int):
    """Yield the squares a non-pawn piece could reach, as lists of (target, path).

    `path` is the list of squares strictly between `sq` and `target`. For sliders a
    ray is walked outward, so later targets have longer paths; knights and kings
    have empty paths.
    """
    f0, r0 = file_of(sq), rank_of(sq)
    if kind == KNIGHT:
        for df, dr in KNIGHT_JUMPS:
            if on_board(f0 + df, r0 + dr):
                yield square(f0 + df, r0 + dr), []
        return
    if kind == KING:
        for df, dr in ROOK_DIRS + BISHOP_DIRS:
            if on_board(f0 + df, r0 + dr):
                yield square(f0 + df, r0 + dr), []
        return
    dirs = {ROOK: ROOK_DIRS, BISHOP: BISHOP_DIRS, QUEEN: ROOK_DIRS + BISHOP_DIRS}[kind]
    for df, dr in dirs:
        path = []
        f, r = f0 + df, r0 + dr
        while on_board(f, r):
            yield square(f, r), list(path)
            path.append(square(f, r))
            f, r = f + df, r + dr


def path_between(kind: str, src: int, dst: int):
    """Squares strictly between src and dst for this piece type, or None if unreachable."""
    for target, path in rays(kind, src):
        if target == dst:
            return path
    return None
