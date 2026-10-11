"""Every curated puzzle must be solved by its intended answer, and the endless
generator must produce gradable positions. Runs the solver in web/puzzles-core.js
with node (it uses the in-browser engine, which test_js_engine.py ties to Qiskit)."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parent.parent / "web"
NODE = shutil.which("node")

SCRIPT = r"""
const P = require(process.argv[2]), QC = require(process.argv[3]);
const out = { puzzles: [], endless: 0 };
for (const pz of P.PUZZLES) {
  const act = [pz.answer[0], ...pz.answer.slice(1).map(QC.parse)];
  const r = P.grade(pz, act);
  // the strongest wrong move, so a puzzle can't be solved by accident
  const g = P.makePuzzleGame(pz), cache = {};
  const wrong = P.allActions(g).map((a) => P.grade(pz, a, cache)).filter((x) => !x.ok).length;
  out.puzzles.push({ id: pz.id, ok: r.ok, value: r.value, wrong });
}
for (let s = 1; s <= 10; s++) {
  const c = P.generateChallenge(s);
  if (c && c.bestKnown > 0 && c.bestKnown < 1) out.endless++;
}
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_puzzles_have_their_intended_solutions(tmp_path):
    script = tmp_path / "check.js"
    script.write_text(SCRIPT)
    run = subprocess.run([NODE, str(script), str(WEB / "puzzles-core.js"), str(WEB / "engine.js")],
                         capture_output=True, text=True, check=True)
    out = json.loads(run.stdout)
    assert len(out["puzzles"]) >= 10
    for p in out["puzzles"]:
        assert p["ok"], f"puzzle {p['id']}: intended answer scores {p['value']}"
        assert p["wrong"] > 0, f"puzzle {p['id']}: every move solves it"
    assert out["endless"] == 10
