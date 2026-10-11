"""The computer opponents: every move legal, levels ordered by strength, undo exact."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
NODE = shutil.which("node")

ARENA = r"""
global.QC = require(process.argv[2]); const QBOT = require(process.argv[3]); const QC = global.QC;
function play(white, black, seed) {
  const g = new QC.Game({ seed }); let plies = 0;
  while (!g.winner && plies < 100) {
    const lv = g.turn === "w" ? white : black, a = QBOT.choose(g, lv, Math.random);
    if (!a) break;
    if (a[0] === "move") g.move(a[1], a[2]); else if (a[0] === "split") g.split(a[1], a[2], a[3]); else g.merge(a[1], a[2], a[3]);
    plies++;
  }
  return g.winner;
}
const r = { strongVsKitten: 0, games: 0 };
for (let i = 0; i < 4; i++) {
  r.games += 2;
  if (play("dirac", "kitten", 500 + i) === "w") r.strongVsKitten++;
  if (play("kitten", "heisenberg", 600 + i) === "b") r.strongVsKitten++;
}
console.log(JSON.stringify(r));
"""


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_bots_play_legal_moves_and_rank(tmp_path):
    script = tmp_path / "arena.js"
    script.write_text(ARENA)
    run = subprocess.run([NODE, str(script), str(ROOT / "web" / "engine.js"), str(ROOT / "web" / "bot.js")],
                         capture_output=True, text=True, check=True)   # an illegal move would throw
    r = json.loads(run.stdout)
    assert r["games"] == 8
    assert r["strongVsKitten"] >= 6, r


def test_undo_restores_the_exact_position():
    from qchess import Game, parse as p
    g = Game(seed=4)
    g.split(p("b1"), p("a3"), p("c3"))
    g.move(p("b4"), p("a3"))            # measured capture
    g.move(p("e2"), p("e3"))
    snapshot = [(s, round(g.prob(s), 9)) for s in range(25) if s in g.pieces]
    g.move(p("d4"), p("d3"))
    back = g.undo(1)
    assert [(s, round(back.prob(s), 9)) for s in range(25) if s in back.pieces] == snapshot
    assert back.turn == "b" and len(back.log) == 3
    assert back.log[1]["outs"] == g.log[1]["outs"]
