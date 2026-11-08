/**
 * GPA page and its tools: What do I need, GPA what if, Long term goal (Missing work is in home.js).
 * All of these are estimates; the school computes the real GPA.
 */
import { escapeHtml, oneDecimal } from '../format.js';
import {
  isScored, classAverage, scoreNeededOnNext, finalExamNeeded,
  letterGrade, weightBonus, computeGpa, gpaGoalPlan,
} from '../grade-math.js';
import { CLASSES, SAMPLE_GPA_HISTORY } from '../sample-data.js';
import { state, SEMESTER_SPLIT, findClass, orderedClasses } from '../state.js';
import { actionAttrs, heading, navRow, segmented, splitExplanation } from './components.js';

const BIG_TITLE = 'style="font-size:15px"';

/** Advisory and classes with nothing graded yet are left out. */
const gpaClasses = () => orderedClasses().filter(
  course => course.level !== 'A' && (course.typed || classAverage(course.rows) != null),
);
const gpaAverage = course => (course.typed ? course.grade : classAverage(course.rows));
const gradebookLetter = course => letterGrade(gpaAverage(course));

export function gpaView() {
  const gpa = computeGpa(gpaClasses(), gradebookLetter);
  const classRows = orderedClasses().map(course => {
    const average = course.typed ? course.grade : classAverage(course.rows);
    const weight = course.level === 'A' ? 'Left out of GPA'
      : weightBonus(course.level) ? 'Honors weight, adds 1' : 'Regular weight';
    return `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${escapeHtml(course.name)}</div>`
      + `<div class="s">${weight}</div></div><div class="avg">${average == null ? '' : letterGrade(average)}</div></div>`;
  }).join('');
  return `<div class="sec">`
    + heading('Estimate, your school decides the real one', gpa.weighted.toFixed(2) + ' ', 'weighted', { big: 1 })
    + `<div class="s" style="padding:0 0 10px;font-size:15px">${gpa.unweighted.toFixed(2)} unweighted</div>`
    + `<div class="card">${classRows}</div></div>`
    + `<div class="sec"><div class="card">`
    + navRow('What do I need', 'Target grade to the score you need', 'openPage', 'need')
    + navRow('GPA what if', 'Change a class, see what a B does', 'openPage', 'gpaWhatIf')
    + navRow('Missing work', 'Missing and absent, each counts as 0', 'openPage', 'missingEffect')
    + navRow('Long term GPA goal', 'Pick a GPA by graduation, see grades needed', 'openPage', 'gpaGoal')
    + `</div></div>`;
}

// ---- What do I need -----------------------------------------------------------------------

export function needView() {
  const calc = state.needCalc;
  const course = findClass(calc.classId);
  const choices = CLASSES.filter(other => classAverage(other.rows) != null);
  return `<div class="sec"><div class="chips">`
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

/** Exported for the GPA looks' What do I need sheet (js/views/gpa-looks.js). */
export function needResult(course) {
  const calc = state.needCalc;
  const target = +calc.target;
  const average = classAverage(course.rows);
  if (calc.kind === 'final') {
    if (course.q1 == null) return '<div class="s">Needs a Quarter 1 grade.</div>';
    const need = finalExamNeeded(SEMESTER_SPLIT, course.q1, average, target);
    return resultBlock(need, 'on the final',
      `For a ${target} semester, from Q1 ${course.q1} and Q2 ${oneDecimal(average)}. ${splitExplanation()}`, target);
  }
  // Next blank test in the gradebook. (A null due date compares as 0 here, so it still counts.)
  const nextTest = course.rows.find(row =>
    row.category === 'Test' && !isScored(row) && row.due >= 0 && !row.pending);
  const title = nextTest ? nextTest.title : 'a 100 point test';
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
    + `<div class="card">${semesterRows}</div>`
    + `<div class="foot">Sample assumes ${n} graded classes a semester, ${history.honorsPerSemester} of them with honors weight, `
    + `and the same pace every semester.</div></div>`;
}
