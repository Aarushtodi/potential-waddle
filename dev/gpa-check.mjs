// Frisco ISD GPA check: node dev/gpa-check.mjs
// 1) A made up transcript with known tiers must give back its own weighted + unweighted GPA.
// 2) If ~/code/grade-app-shots/gpa-1113/transcript-parsed.json exists (a real HAC pull, kept off
//    the repo), transcriptTotals must reproduce HAC's two numbers exactly.
import fs from 'node:fs';
import os from 'node:os';
import { fisdTier, fisdWeightedTenths, fisdUnweightedPoints, transcriptTotals, fisdGpaWith } from '../js/grade-math.js';

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fail = 1; };

check('table: 100 on level 5.0, 90 Adv 4.5, 70 AP 3.0, 69 AP 0',
  fisdWeightedTenths(100, 1) === 50 && fisdWeightedTenths(90, 2) === 45 && fisdWeightedTenths(70, 3) === 30 && fisdWeightedTenths(69, 3) === 0);
check('unweighted 90/89/70/69 = 4/3/2/0', [90, 89, 70, 69].map(fisdUnweightedPoints).join() === '4,3,2,0');
check('tiers', fisdTier('AP Pre Calculus S1') === 3 && fisdTier('English 2 Adv S1') === 2 && fisdTier('Pre-AP English') === 2
  && fisdTier('Tennis EQ3 S1') === 1 && fisdTier('IB Biology') === 3);

const made = [[97, 1], [88, 2], [91, 3], [79, 3], [100, 1], [65, 2], [84, 2], [93, 3]];
const tenths = made.reduce((s, [g, t]) => s + fisdWeightedTenths(g, t), 0);
const w = Math.round(tenths / 10 / made.length * 1000) / 1000;
const u = Math.round(made.reduce((s, [g]) => s + fisdUnweightedPoints(g), 0) / made.length * 1000) / 1000;
const t = transcriptTotals({ weighted: w, unweighted: u, grades: made.map(([g]) => g) });
check(`made up transcript ${w}/${u} comes back`, t.ok && t.weightedTenths === tenths);
check('a wrong HAC number is refused', !transcriptTotals({ weighted: w + 0.01, unweighted: u, grades: made.map(([g]) => g) }).ok);
const after = fisdGpaWith(t, [{ grade: 95, tier: 3 }]);
check('what if adds one AP 95', Math.abs(after.weighted - (tenths + 55) / 10 / 9) < 1e-9);

const real = `${os.homedir()}/code/grade-app-shots/gpa-1113/transcript-parsed.json`;
if (fs.existsSync(real)) {
  const d = JSON.parse(fs.readFileSync(real));
  const r = transcriptTotals(d);
  check(`real HAC transcript: Tally ${r.weighted.toFixed(3)}/${r.unweighted.toFixed(3)} vs HAC ${d.weighted}/${d.unweighted}`, r.ok);
} else console.log('skip real transcript (not on this Mac)');
process.exit(fail);
