/**
 * What if predictor, a bottom sheet opened from a class.
 *
 * This is the only place the app predicts. Every number in here is labeled an estimate, works
 * on a copy of the rows (applyWhatIf), and never changes the real grade shown elsewhere.
 * The real grade only changes when a new score shows up in HAC.
 */
import { escapeHtml, oneDecimal, signed } from '../format.js';
import {
  isScored, countsAsZero, classAverage, letterGrade,
  semesterGrade, finalExamNeeded,
} from '../grade-math.js';
import { CLASSES, LAST_QUARTER_SAME_POINT } from '../sample-data.js';
import {
  state, SEMESTER_SPLIT, whatIfFor, whatIfAverage, blankRowsLeft, isUnderRetestLine,
  nowAverage, nextTestRow, neededOnNext, isTestRow, weightedCategories, fakeCategory, plainCategory, testWord,
} from '../state.js';
import { actionAttrs, navRow, segmented, toggle, sectionLabel, CHEVRON } from './components.js';
import { needView } from './gpa.js';

/** [key, title] for each tool on the What if menu. The title also heads the tool's sheet. */
export const WHAT_IF_TOOLS = [
  ['need', 'Target'],
  ['stack', 'Stack scores'],
  ['retest', 'Retest'],
  ['cushion', 'Cushion'],
  ['semester', 'Semester'],
  ['drop', 'Drop or curve'],
  ['scenarios', 'Saved scenarios'],
  ['lastQuarter', 'Last quarter'],
];

const TOOL_VIEWS = {
  need: needView,
  stack: stackScores,
  retest: retestTool,
  cushion: cushionTool,
  semester: semesterTool,
  drop: dropOrCurve,
  scenarios: savedScenarios,
  lastQuarter: lastQuarter,
};

const GAP_12 = '<div style="height:12px"></div>';
const GAP_14 = '<div style="height:14px"></div>';
const BIG_TITLE = 'style="font-size:15px"';
const STRONG = 'font-weight:700;color:var(--ink)';

// The menu shows tool names only, no subtitles and no footer line (his call 11/9).
const toolRow = key => navRow(WHAT_IF_TOOLS.find(tool => tool[0] === key)[1], '', 'openWhatIfTool', key);

/** Sheet body: the tool menu, or one tool. Tools that change the estimate show it on top. */
export function whatIfSheetBody(course, tool) {
  const showsEstimate = !tool || ['stack', 'drop', 'scenarios'].includes(tool);
  const top = showsEstimate ? `<div class="sec" data-live style="margin-bottom:14px">${estimateHeading(course)}</div>` : '';
  if (tool) return top + TOOL_VIEWS[tool](course);
  return top + whatIfMenu();
}

// Two short groups up top, the less used tools folded under More. Target is also a pill on the
// class page; it stays here next to Cushion since the two answer the same kind of question.
function whatIfMenu() {
  const open = state.whatIfMore;
  const more = ['drop', 'semester', 'scenarios', 'lastQuarter'];
  return sectionLabel('Try scores') + `<div class="card">${toolRow('stack')}${toolRow('retest')}</div>` + GAP_14
    + sectionLabel('Hit a grade') + `<div class="card">${toolRow('need')}${toolRow('cushion')}</div>` + GAP_14
    + `<div class="card">`
    + `<div class="row more wi-more${open ? ' open' : ''}" role="button" tabindex="0" aria-expanded="${open}" ${actionAttrs('toggleWhatIfMore')}>`
    + `<div class="grow"><div class="t">More</div></div>${CHEVRON}</div>`
    + (open ? more.map(toolRow).join('') + navRow('Long term GPA goal', '', 'openGpaGoal') : '')
    + `</div>`;
}

function estimateHeading(course) {
  const estimate = whatIfAverage(course);
  const now = nowAverage(course);
  return `<div class="lab">Now ${oneDecimal(now)}, change ${signed(estimate - now)}, estimate</div>`
    + `<div class="hd big">${oneDecimal(estimate)} <i>what if</i></div>`;
}

function numberInput(label, value, input, x, y, extra = '') {
  return `<input autocomplete="off" enterkeyhint="done" class="f" type="number" inputmode="decimal" aria-label="${label}"${extra} value="${value}" `
    + `data-input="${input}" data-x="${x}"${y != null ? ` data-y="${y}"` : ''}>`;
}

// ---- Stack scores -------------------------------------------------------------------------

function stackScores(course) {
  const scenario = whatIfFor(course.id);
  const draft = scenario.draft;
  const blanks = blankRowsLeft(course);
  let html = '';

  if (blanks.length) {
    const fills = [['usual', 'Your usual'], ['90', '90'], ['80', '80'], ['70', '70']];
    html += sectionLabel('Quick fill what is left')
      + `<div class="seg">${fills.map(([value, label]) =>
        `<button ${actionAttrs('quickFill', course.id, value)}>${label}</button>`).join('')}</div>`
      + `<div class="foot" style="padding:6px 2px 14px">Fills ${blanks.map(row => escapeHtml(row.title)).join(', ')}. `
      + `Change any box below.</div>`;
  }

  // Placeholder shows what HAC has now: the score, 0 for missing/ABS/INC, or a dash for blank.
  const scoreRows = course.rows.map(row => {
    const current = isScored(row) ? row.score : countsAsZero(row) ? 0 : '–';
    return `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${escapeHtml(row.title)}</div>`
      + `<div class="s">${row.category}, out of ${row.total}</div></div>`
      + numberInput(`Score for ${escapeHtml(row.title)}`, scenario.scores[row.id] ?? '', 'whatIfScore', course.id, row.id,
        ` placeholder="${current}"`)
      + `</div>`;
  }).join('');
  const fakeRows = scenario.fakeAssignments.map(fake =>
    `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${escapeHtml(fake.name)}</div>`
    + `<div class="s">Fake ${course.real ? escapeHtml(plainCategory(fake.category)) : fake.category}, ${escapeHtml(fake.score)} of ${escapeHtml(fake.points)}</div></div>`
    + `<button class="pill" ${actionAttrs('removeFakeAssignment', course.id, fake.id)}>Remove</button></div>`).join('');
  html += sectionLabel('Type the grade you expect') + `<div class="card">${scoreRows}${fakeRows}</div>` + GAP_14;

  html += sectionLabel('Add a fake future assignment')
    + `<div class="card">`
    + `<div class="pad"><input autocomplete="off" enterkeyhint="done" class="f w" placeholder="Name it" aria-label="Fake assignment name" `
    + `value="${escapeHtml(draft.name)}" data-input="fakeAssignmentField" data-x="${course.id}" data-y="name"></div>`
    + categoryPicker(course, draft)
    + `<div class="row"><div class="grow t" ${BIG_TITLE}>Points</div>`
    + numberInput('Points', escapeHtml(draft.points), 'fakeAssignmentField', course.id, 'points') + `</div>`
    + `<div class="row"><div class="grow t" ${BIG_TITLE}>Your score</div>`
    + numberInput('Your score', escapeHtml(draft.score), 'fakeAssignmentField', course.id, 'score') + `</div>`
    + `<div class="pad" style="border-top:1px solid var(--rule)">`
    + `<button class="btn ghost" style="background:var(--paper)" ${actionAttrs('addFakeAssignment', course.id)}>Add it</button>`
    + `</div></div>` + GAP_14;

  // A correction is the new score the teacher will type in, so it replaces the old one.
  const tests = gradedTests(course);
  html += sectionLabel('Corrections') + `<div class="card">`
    + (tests.length ? '' : `<div class="pad s">No graded ${testWord(course)}s to correct yet.</div>`)
    + tests.map(row =>
      `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>Corrected ${escapeHtml(row.title)}</div>`
      + `<div class="s">Type your score after corrections, was ${row.score}</div></div>`
      + numberInput('Corrected score', scenario.corrections[row.id] ?? '', 'whatIfCorrection', course.id, row.id,
        ` placeholder="${row.score}"`)
      + `</div>`).join('')
    + `</div>` + GAP_14;

  html += sectionLabel('Finals calculator')
    + `<div class="card"><div class="row"><div class="grow t" ${BIG_TITLE}>Semester grade you want</div>`
    + numberInput('Semester grade you want', escapeHtml(state.finals.target), 'finalsTarget', 'target') + `</div>`
    + `<div class="pad" style="border-top:1px solid var(--rule)" data-live>${finalsResult(course)}</div></div>`
    + GAP_12;
  html += `<button class="btn" ${actionAttrs('saveScenario', course.id)}>Save as a scenario</button>`;
  html += `<div style="height:8px"></div>`
    + `<button class="btn ghost" ${actionAttrs('resetWhatIf', course.id)}>Reset</button>`;
  return html;
}

/** Graded tests: 'Test' rows on sample data, the heaviest weighted category on real HAC classes. */
const gradedTests = course => course.rows.filter(row => isTestRow(course, row) && isScored(row));

/**
 * Category for a fake assignment. Sample: Test, Lab, HW. Real HAC: only categories that count
 * (a weight 0 one like Frisco's Progress Check would move nothing), so with one that counts it is
 * a plain line, not a one button control.
 */
function categoryPicker(course, draft) {
  const picked = fakeCategory(course, draft);
  const options = course.real
    ? weightedCategories(course).map(category => [category, escapeHtml(plainCategory(category))])
    : [['Test', 'Test'], ['Lab', 'Lab'], ['HW', 'HW']];
  if (options.length < 2) {
    return `<div class="row"><div class="grow t" ${BIG_TITLE}>Type</div>`
      + `<div class="s" style="${STRONG}">${escapeHtml(plainCategory(picked))}</div></div>`;
  }
  return `<div class="pad" style="border-top:1px solid var(--rule)">`
    + segmented('pickFakeCategory', picked, options, course.id) + `</div>`;
}

function finalsResult(course) {
  const q2 = whatIfAverage(course);
  const q1 = course.q1;
  if (q1 == null) return '<div class="s">Needs a Quarter 1 grade.</div>';
  const target = state.finals.target;
  const need = finalExamNeeded(SEMESTER_SPLIT, q1, q2, +target);
  const note = `<div class="s">Q1 ${q1}, Q2 ${oneDecimal(q2)}</div>`;
  if (need <= 0) return `<div class="t">You hit ${escapeHtml(target)} even with a 0 on the final</div>${note}`;
  if (need > 100) {
    return `<div class="t">You'd need ${oneDecimal(need)} on the final</div>`
      + `<div class="s">More than 100, so ${escapeHtml(target)} is out of reach.</div>${note}`;
  }
  return `<div class="big-res" style="font-size:26px">${Math.ceil(need)} <i>on the final</i></div>${note}`;
}

// ---- Retest -------------------------------------------------------------------------------

function retestTool(course) {
  const scenario = whatIfFor(course.id);
  const tests = gradedTests(course);
  if (!tests.length) return `<div class="card"><div class="pad"><div class="t">No graded ${testWord(course)}s here yet</div></div></div>`;
  // Same field as Corrections: either way it is the score that replaces the old one.
  return `<div class="sec" data-live style="margin-bottom:14px">${estimateHeading(course)}</div>`
    + sectionLabel('Type the retest score you expect')
    + `<div class="card">`
    + tests.map(row =>
      `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>Retest ${escapeHtml(row.title)}</div>`
      + `<div class="s">Was ${row.score} of ${row.total}${isUnderRetestLine(row, course) ? ', under your ' + state.retestLine : ''}</div></div>`
      + numberInput('Expected retest score', scenario.corrections[row.id] ?? '', 'whatIfCorrection', course.id, row.id,
        ` placeholder="${row.score}"`)
      + `</div>`).join('')
    + `</div><div class="foot">Estimate. Your real grade only changes when the new score shows up in your gradebook.</div>`;
}

// ---- Cushion ------------------------------------------------------------------------------

const LETTER_CUTOFFS = { A: 90, B: 80, C: 70, D: 60 };

function cushionTool(course) {
  const average = nowAverage(course);
  const letter = letterGrade(average);
  const cutoff = LETTER_CUTOFFS[letter];
  const nextTest = nextTestRow(course);
  const title = nextTest ? nextTest.title : 'a 100 point test';
  const total = nextTest ? nextTest.total : 100;

  let line;
  if (!cutoff) {
    line = 'Keep going, any passing score helps.';
  } else {
    const result = neededOnNext(course, cutoff, total);
    if (!result.reach) line = `A perfect score on ${escapeHtml(title)} gets you to ${oneDecimal(result.best)}, under your ${letter}`;
    else if (result.need === 0) line = `Even a 0 on ${escapeHtml(title)} keeps your ${letter}`;
    else line = `You can get a ${result.need} on ${escapeHtml(title)} and keep your ${letter}`;
  }

  const holdRows = [['A', 90], ['B', 80], ['C', 70]].map(([holdLetter, cut]) => {
    const result = neededOnNext(course, cut, total);
    const article = /[AEFHILMNORSX]/.test(holdLetter) ? 'an' : 'a';
    const needed = result.reach ? (result.need === 0 ? 'Any score' : result.need + ' of ' + total) : 'Out of reach';
    return `<div class="row"><div class="grow t" ${BIG_TITLE}>To hold ${article} ${holdLetter}</div>`
      + `<div class="s" style="${STRONG}">${needed}</div></div>`;
  }).join('');

  return `<div class="card"><div class="pad"><div class="lab">Estimate, you're at ${oneDecimal(average)}</div>`
    + `<div class="hd" style="margin-top:3px">${line}</div></div>${holdRows}</div>`;
}

// ---- Semester -----------------------------------------------------------------------------

function semesterInputsFor(course) {
  if (!state.semesterInputs[course.id]) {
    const average = nowAverage(course);
    state.semesterInputs[course.id] = {
      q1: course.q1 ?? '',
      q2: average != null ? +average.toFixed(1) : '',
      final: '',
      target: 90,
    };
  }
  return state.semesterInputs[course.id];
}

function semesterResult(course) {
  const inputs = semesterInputsFor(course);
  const q1 = +inputs.q1;
  const q2 = +inputs.q2;
  const withFinal = inputs.final !== ''
    ? `<div class="lab">Semester with that final</div>`
      + `<div class="big-res">${oneDecimal(semesterGrade(SEMESTER_SPLIT, q1, q2, +inputs.final))}</div>`
    : '';
  const need = finalExamNeeded(SEMESTER_SPLIT, q1, q2, +inputs.target);
  let needLine;
  if (need <= 0) needLine = `Any final gets you ${escapeHtml(inputs.target)}`;
  else if (need > 100) needLine = `You'd need ${oneDecimal(need)}, more than 100`;
  else needLine = `You need ${Math.ceil(need)} on the final for ${escapeHtml(inputs.target)}`;
  return `${withFinal}<div class="t" style="margin-top:6px">${needLine}</div>`;
}

function semesterTool(course) {
  const inputs = semesterInputsFor(course);
  const fields = [['q1', 'Quarter 1'], ['q2', 'Quarter 2'], ['final', 'Final, if you know it'], ['target', 'Semester grade you want']];
  return `<div class="card">`
    + fields.map(([key, label]) =>
      `<div class="row"><div class="grow t" ${BIG_TITLE}>${label}</div>`
      + numberInput(label, escapeHtml(inputs[key]), 'semesterInput', course.id, key) + `</div>`).join('')
    + `<div class="pad" style="border-top:1px solid var(--rule)" data-live>${semesterResult(course)}</div></div>`;
}

// ---- Drop or curve ------------------------------------------------------------------------

function dropOrCurve(course) {
  const scenario = whatIfFor(course.id);
  const tests = gradedTests(course);
  const drop = `Drop my lowest ${testWord(course)}`;
  return `<div class="card"><div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${drop}</div>`
    + `<div class="s">If your teacher does it</div></div>${toggle(scenario.dropLowestTest, 'toggleDropLowest', course.id, drop)}</div>`
    + tests.map(row =>
      `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>Curve ${escapeHtml(row.title)}</div>`
      + `<div class="s">Points added, was ${row.score}</div></div>`
      + numberInput('Curve points', scenario.curve[row.id] ?? '', 'whatIfCurve', course.id, row.id, ' placeholder="0"')
      + `</div>`).join('')
    + `</div><div class="foot">Estimate. These stack with your fake scores.</div>`
    + GAP_12 + `<button class="btn" ${actionAttrs('saveScenario', course.id)}>Save as a scenario</button>`;
}

// ---- Saved scenarios ----------------------------------------------------------------------

function savedScenarios(course) {
  const saved = state.savedScenarios[course.id] || [];
  const saveButton = `<button class="btn" ${actionAttrs('saveScenario', course.id)}>Save what I have now</button>`;
  if (!saved.length) {
    return `<div class="card"><div class="pad"><div class="t">Nothing saved yet</div>`
      + `<div class="s">Stack some scores, then save it here to compare.</div></div></div>` + GAP_12 + saveButton;
  }
  const now = nowAverage(course);
  const columns = [{ name: 'Now', average: now, scenario: null }].concat(saved);
  const tableRow = (label, cell) =>
    `<div class="s" style="font-weight:600;padding:9px 0 3px">${label}</div>`
    + `<div style="display:grid;grid-template-columns:repeat(${columns.length},minmax(92px,1fr));gap:8px">`
    + columns.map(cell).join('') + `</div>`;
  const fakeCount = scenario =>
    Object.values(scenario.scores).filter(v => v !== '').length + scenario.fakeAssignments.length;

  return `<div class="card"><div class="pad" style="overflow-x:auto">`
    + tableRow('Name', col => `<div class="t" style="font-size:14.5px">${escapeHtml(col.name)}</div>`)
    + tableRow('Average, estimate', col => `<div class="avg">${oneDecimal(col.average)}</div>`)
    + tableRow('Change', col => `<div class="s">${col.scenario ? signed(col.average - now) : '–'}</div>`)
    + tableRow('Fake scores', col => `<div class="s">${col.scenario ? fakeCount(col.scenario) : '–'}</div>`)
    + tableRow('Letter', col => `<div class="s">${letterGrade(col.average)}</div>`)
    + `</div></div>` + GAP_12
    + `<div class="card">`
    + saved.map((entry, i) =>
      `<div class="row"><div class="grow"><input autocomplete="off" enterkeyhint="done" class="f plain" aria-label="Scenario name" value="${escapeHtml(entry.name)}" `
      + `data-input="renameScenario" data-x="${course.id}" data-y="${i}"></div>`
      + `<button class="pill" ${actionAttrs('deleteScenario', course.id, i)}>Remove</button></div>`).join('')
    + `</div>` + GAP_12 + saveButton;
}

// ---- Last quarter -------------------------------------------------------------------------

function lastQuarter() {
  const rows = CLASSES.filter(course => LAST_QUARTER_SAME_POINT[course.id] != null).map(course => {
    const then = LAST_QUARTER_SAME_POINT[course.id];
    const now = classAverage(course.rows);
    return `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${escapeHtml(course.name)}</div>`
      + `<div class="s">${oneDecimal(then)} at this point last quarter</div></div>`
      + `<div class="avg">${oneDecimal(now)}</div>`
      + `<div class="s" style="font-weight:700;min-width:38px;text-align:right">${signed(now - then)}</div></div>`;
  }).join('');
  return `<div class="card">${rows}</div><div class="foot">Works from what your phone saved last quarter.</div>`;
}
