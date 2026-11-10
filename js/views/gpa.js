/**
 * GPA page and its tools: GPA what if, Long term goal (Missing work is in home.js). Also the
 * Target page (the score you need for a grade), opened from a class page with that class set.
 * All of these are estimates; the school computes the real GPA.
 *
 * The GPA page: the weighted number as the hero, then the counted classes sorted by how close
 * each average sits to a letter line. The 2 closest (within NEAR points) get their distance in
 * the pop color; that is the only emphasis, no header and no judgment words.
 */
import { escapeHtml, oneDecimal } from '../format.js';
import {
  isScored, classAverage, scoreNeededOnNext, finalExamNeeded,
  letterGrade, computeGpa, gpaGoalPlan,
} from '../grade-math.js';
import { CLASSES, SAMPLE_GPA_HISTORY } from '../sample-data.js';
import { state, SEMESTER_SPLIT, findClass, orderedClasses, routeKey } from '../state.js';
import { actionAttrs, heading, navRow, segmented } from './components.js';

const BIG_TITLE = 'style="font-size:15px"';

/** Advisory and classes with nothing graded yet are left out. */
export const gpaClasses = () => orderedClasses().filter(
  course => course.level !== 'A' && (course.typed || classAverage(course.rows) != null),
);
const gpaAverage = course => (course.typed ? course.grade : classAverage(course.rows));
const gradebookLetter = course => letterGrade(gpaAverage(course));

// ---- GPA page -----------------------------------------------------------------------------

/** Letter lines: the floor of each letter, and the cutoff of the letter above it. */
const FLOOR = { A: 90, B: 80, C: 70, D: 60 };
const NEXT_UP = { B: 90, C: 80, D: 70, F: 60 };
const LETTER_BELOW = { A: 'B', B: 'C', C: 'D', D: 'F' };
const LETTER_ABOVE = { B: 'A', C: 'B', D: 'C', F: 'D' };
/** How many classes can stand out, and how close (points) counts as close to a line. */
const CLOSE_COUNT = 2;
const NEAR = 2.0;

const article = letter => (letter === 'A' || letter === 'F' ? 'an ' : 'a ') + letter;
const tenth = n => (Math.round(n * 10) / 10).toFixed(1);
const isHonors = course => course.level === 'H' || course.level === 'AP' || course.level === 'DC';

/**
 * Distance from a class average to the nearest letter line: down to its own letter's floor
 * (F has none) or up to the next cutoff (A has none), whichever is smaller.
 */
export function lineDistance(course) {
  const average = gpaAverage(course);
  const letter = letterGrade(average);
  const down = FLOOR[letter] == null ? Infinity : average - FLOOR[letter];
  const up = NEXT_UP[letter] == null ? Infinity : NEXT_UP[letter] - average;
  return down <= up
    ? { course, letter, points: down, text: `${tenth(down)} above ${article(LETTER_BELOW[letter])}` }
    : { course, letter, points: up, text: `${tenth(up)} points from ${article(LETTER_ABOVE[letter])}` };
}

/** Weighted GPA from the gradebook letters, the number the GPA page leads with. */
export const currentGpa = () => computeGpa(gpaClasses(), gradebookLetter).weighted;

/**
 * The class closest to the next letter up ("Spanish 1.6 points from an A"), for Goals and Home.
 * All As: the class closest to dropping a letter instead.
 */
export function closestToNextLetter() {
  const lines = gpaClasses().map(lineDistance);
  const up = lines.filter(line => / from /.test(line.text)).sort((a, b) => a.points - b.points);
  return up[0] || lines.sort((a, b) => a.points - b.points)[0] || null;
}

function classRow(item, close) {
  const { course } = item;
  const name = escapeHtml(course.name.replace(/ Honors$/, ''))
    + (isHonors(course) ? ' <span class="gpa-h" aria-label="honors">H</span>' : '');
  return `<div class="row gpa-row"><div class="grow t">${name}</div>`
    + `<div class="s${close ? ' gpa-close' : ''}">${item.text}</div>`
    + `<div class="avg gpa-let">${item.letter}</div></div>`;
}

export function gpaView() {
  const gpa = computeGpa(gpaClasses(), gradebookLetter);
  const ranked = gpaClasses().map(lineDistance).sort((a, b) => a.points - b.points);
  const rows = ranked.map((item, i) => classRow(item, i < CLOSE_COUNT && item.points <= NEAR)).join('');
  return `<div class="sec">`
    + `<div class="gpa-hero"><span class="gpa-n" data-gpa-count="${gpa.weighted.toFixed(2)}">${gpa.weighted.toFixed(2)}</span>`
    + ` <i>this semester</i></div>`
    + (rows ? `<div class="card">${rows}</div>` : '')
    + `<div class="foot gpa-unw">${gpa.unweighted.toFixed(2)} unweighted</div></div>`
    + `<div class="sec"><div class="card gpa-links">`
    + navRow('GPA what if', '', 'openPage', 'gpaWhatIf')
    + navRow('By graduation', '', 'openPage', 'gpaGoal')
    + `</div></div>`;
}

/**
 * Count up: the hero number runs from 0 to its value once when the GPA page opens (not on a
 * Back from a page above it, not on later redraws). Reduced motion: it just shows the value.
 * Called by render.js after every full redraw.
 */
const COUNT_MS = 900;
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const counter = { route: null, raf: 0 };

export function afterGpaRender() {
  const node = document.querySelector('[data-gpa-count]');
  const route = routeKey();
  const before = counter.route || '';
  counter.route = route;
  const opened = node && route !== before && !before.startsWith(route + '/');
  if (!opened || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cancelAnimationFrame(counter.raf);
  const to = +node.dataset.gpaCount;
  const start = performance.now();
  node.textContent = (0).toFixed(2);
  const frame = now => {
    const k = Math.min(1, (now - start) / COUNT_MS);
    // Look the node up each frame: a full redraw mid count replaces it.
    const current = document.querySelector('[data-gpa-count]');
    if (!current) return;
    current.textContent = k < 1 ? (to * easeOutQuart(k)).toFixed(2) : current.dataset.gpaCount;
    if (k < 1) counter.raf = requestAnimationFrame(frame);
  };
  counter.raf = requestAnimationFrame(frame);
}

// ---- Target ------------------------------------------------------------------------------

export function needView() {
  const calc = state.needCalc;
  const course = findClass(calc.classId);
  const choices = CLASSES.filter(other => classAverage(other.rows) != null);
  return `<div class="sec"><div class="chips need-chips">`
    + choices.map(other =>
      `<button class="chip${other.id === calc.classId ? ' on' : ''}" ${actionAttrs('needPickClass', other.id)}>`
      + `${escapeHtml(other.name)}</button>`).join('')
    + `</div>`
    + segmented('needPickKind', calc.kind, [['test', 'Next test'], ['final', 'Final']])
    + `<div style="height:10px"></div>`
    + `<div class="card"><div class="row"><div class="grow t">Grade you want</div>`
    + `<input class="f" type="number" inputmode="decimal" aria-label="Target grade" value="${calc.target}" data-input="needTarget"></div>`
    + `<div class="pad" style="border-top:1px solid var(--rule)" data-live>${needResult(course)}</div></div></div>`;
}

/**
 * A redraw puts the class chips back at the start, so a picked class far down the list (say
 * Health and PE, opened from its class page) would sit off screen. Bring it to the middle.
 * Called by render.js after every full redraw.
 */
export function afterNeedRender() {
  for (const row of document.querySelectorAll('.need-chips')) {
    const on = row.querySelector('.chip.on');
    if (!on) continue;
    const box = row.getBoundingClientRect();
    const chip = on.getBoundingClientRect();
    if (chip.left >= box.left && chip.right <= box.right) continue;
    row.scrollLeft += chip.left + chip.width / 2 - (box.left + box.width / 2);
  }
}

function needResult(course) {
  const calc = state.needCalc;
  const target = +calc.target;
  const average = classAverage(course.rows);
  if (calc.kind === 'final') {
    if (course.q1 == null) return '<div class="s">Needs a Quarter 1 grade.</div>';
    const need = finalExamNeeded(SEMESTER_SPLIT, course.q1, average, target);
    return resultBlock(need, 'on the final',
      `For a ${target} semester, from Q1 ${course.q1} and Q2 ${oneDecimal(average)}. Each quarter ${SEMESTER_SPLIT.quarterPercent} percent, exam ${SEMESTER_SPLIT.examPercent} percent.`, target);
  }
  // Next blank test in the gradebook. (A null due date compares as 0 here, so it still counts.)
  const nextTest = course.rows.find(row =>
    row.category === 'Test' && !isScored(row) && row.due >= 0 && !row.pending);
  const title = nextTest ? nextTest.title : 'the next test';
  const total = nextTest ? nextTest.total : 100;
  const result = scoreNeededOnNext(course.rows, target, total);
  if (!result.reach) {
    return `<div class="t">Out of reach on this one</div>`
      + `<div class="s">A perfect score on ${escapeHtml(title)} gets you to ${oneDecimal(result.best)}.</div>`;
  }
  return resultBlock(result.need, `on ${escapeHtml(title)}`, `Out of ${total}. You're at ${oneDecimal(average)} now.`, target);
}

function resultBlock(need, onWhat, note, target) {
  if (need <= 0) return `<div class="t">You hit ${target} even with a 0</div><div class="s">${note}</div>`;
  if (need > 100) return `<div class="t">You'd need ${oneDecimal(need)}</div><div class="s">More than 100. ${note}</div>`;
  return `<div class="big-res">${Math.ceil(need)} <i>${onWhat}</i></div><div class="s" style="margin-top:4px">${note}</div>`;
}

// ---- GPA what if --------------------------------------------------------------------------

export function gpaWhatIfView() {
  const base = computeGpa(gpaClasses(), gradebookLetter);
  const letterFor = course => state.gpaWhatIf[course.id] || gradebookLetter(course);
  const gpa = computeGpa(gpaClasses(), letterFor);
  const change = gpa.weighted - base.weighted;
  const changeText = (change >= 0 ? '+' : '−') + Math.abs(change).toFixed(2);
  return `<div class="sec">`
    + heading(`Now ${base.weighted.toFixed(2)} weighted, change ${changeText}`, gpa.weighted.toFixed(2) + ' ', 'what if', { big: 1 })
    + `<div class="s" style="padding-bottom:10px;font-size:15px">${gpa.unweighted.toFixed(2)} unweighted, estimate</div>`
    + `<div class="card">`
    + gpaClasses().map(course =>
      `<div class="pad" style="border-top:1px solid var(--rule)">`
      + `<div class="t" style="font-size:15px;margin-bottom:6px">${escapeHtml(course.name)}</div>`
      + segmented('setGpaWhatIfLetter', letterFor(course), ['A', 'B', 'C', 'D', 'F'].map(l => [l, l]), course.id)
      + `</div>`).join('')
    + `</div></div><button class="btn ghost" ${actionAttrs('resetGpaWhatIf')}>Reset</button>`;
}

// ---- Long term GPA goal -------------------------------------------------------------------

function letterMix(plan, n) {
  if (!plan.reachable) return 'Out of reach, even all As with these classes';
  if (plan.as <= 0) {
    if (plan.bs <= 0) return 'Mostly Cs would do it';
    return plan.bs >= n ? `All ${n} Bs` : `${plan.bs} Bs and ${n - plan.bs} Cs`;
  }
  if (plan.as >= n) return `All ${n} As`;
  return `${plan.as} A${plan.as > 1 ? 's' : ''} and ${n - plan.as} B${n - plan.as > 1 ? 's' : ''}`;
}

export function gpaGoalView() {
  const history = SAMPLE_GPA_HISTORY;
  const n = history.classesPerSemester;
  const plan = gpaGoalPlan(+state.gpaGoal, history);
  const mix = letterMix(plan, n);
  const semesterRows = Array.from({ length: history.semestersLeft }, (_, i) =>
    `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>Semester ${history.semestersDone + i + 1}</div>`
    + `<div class="s">${mix}</div></div>`
    + `<div class="avg">${plan.perSemester > 5 ? '–' : plan.perSemester.toFixed(2)}</div></div>`).join('');
  return `<div class="sec">`
    + heading(`Estimate, ${history.weightedSoFar.toFixed(2)} weighted so far over ${history.semestersDone} semesters`,
      'By ', 'graduation', { big: 1 })
    + `<div class="card"><div class="row"><div class="grow t">GPA I want</div>`
    + `<input class="f" type="number" step="0.01" inputmode="decimal" aria-label="GPA goal" value="${escapeHtml(state.gpaGoal)}" data-input="gpaGoal">`
    + `</div></div></div>`
    + `<div class="sec" data-live><div class="lab" style="margin-bottom:6px">Grades needed each semester</div>`
    + `<div class="card">${semesterRows}</div></div>`;
}
