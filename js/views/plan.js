/**
 * Plan: the goals from setup, made from the gradebook, that they can change any time. One
 * section per goal; each line says where they are and what it takes (js/views/plan-math.js,
 * the same math as What if and Target). A row with a need opens Target on that class.
 *
 *   GPA        the goal with − and +, then the letters it takes and what each class needs
 *   A goals    every graded class, on or off; an on class gets its own grade goal (90 to 100)
 *   Missing    the same list as Home and Current stats; opens Missing work
 *   Finals     what each class needs on the final for its grade goal
 */
import { escapeHtml, oneDecimal } from '../format.js';
import { real } from '../real-data.js';
import { state, periodAverage, SEMESTER_SPLIT } from '../state.js';
import { classAverage } from '../grade-math.js';
import { actionAttrs, toggle, CHEVRON } from './components.js';
import { GOALS, gpaGoalBlock, gpaText, shortName, gradedClasses, planBlock } from './goals.js';
import { gpaClasses, closestToNextLetter } from './gpa.js';
import { gpaGoal, classTarget, need, finalPlan, TARGET_MIN, TARGET_MAX } from './plan-math.js';

export const goalLabel = key => GOALS.find(goal => goal.key === key).label;

const section = (label, body) => `<div class="sec plan-sec"><div class="lab" style="margin:0 0 6px">${label}</div>${body}</div>`;

/** A need line that opens Target on that class. */
function needCell(course, target) {
  const result = need(course, target);
  if (!result.text) return '';
  // Already there: the goal is met, say so plainly.
  if (result.kind === 'above') return `<span class="g-plan-s plan-done">Done, ${escapeHtml(result.text)}</span>`;
  const tap = result.kind === 'test' || result.kind === 'final';
  return `<span class="g-plan-s${result.kind === 'none' ? ' u' : ''}"${tap
    ? ` role="button" tabindex="0" ${actionAttrs('openPlanTarget', course.id, target + ':' + result.kind)}` : ''}>`
    + `${escapeHtml(result.text)}</span>`;
}

function stepper(action, id, value, low, high, label) {
  return `<span class="plan-step">`
    + `<button class="pill round" aria-label="Lower ${label}"${value <= low ? ' disabled' : ''} ${actionAttrs(action, id, -1)}>−</button>`
    + `<span class="plan-step-n">${value}</span>`
    + `<button class="pill round" aria-label="Raise ${label}"${value >= high ? ' disabled' : ''} ${actionAttrs(action, id, 1)}>+</button></span>`;
}

function gpaSection() {
  const goal = real.on ? null : gpaGoal();
  if (goal != null) return section('GPA goal', `<div class="card g-plan">${gpaGoalBlock(goal, true)}</div>`);
  // Real HAC data has no GPA in the app; all As has no goal above it.
  const close = gradedClasses().length ? closestToNextLetter() : null;
  const line = real.on ? (close ? `${shortName(close.course)} ${close.text}` : '') : `All As, GPA ${gpaText()}`;
  return line ? section('GPA', `<div class="card g-plan"><div class="g-plan-l">${escapeHtml(line)}</div></div>`) : '';
}

function aSection() {
  const rows = gradedClasses().map(course => {
    const on = state.goalAClasses.includes(course.id);
    const target = classTarget(course);
    return `<div class="plan-a${on ? ' on' : ''}"><div class="g-plan-row plan-a-top">`
      + `<span class="grow">${escapeHtml(shortName(course))}</span>`
      + `<span class="g-plan-g">${oneDecimal(periodAverage(course))}</span>`
      + toggle(on, 'toggleGoalClass', course.id) + `</div>`
      + (on ? `<div class="plan-a-goal">${stepper('planTargetStep', course.id, target, TARGET_MIN, TARGET_MAX, 'grade goal')}`
        + needCell(course, target) + `</div>` : '')
      + `</div>`;
  }).join('');
  return rows ? section('A goals', `<div class="card g-plan plan-list">${rows}</div>`) : '';
}

function missingSection() {
  const block = planBlock('missing').replace('<div class="g-plan-k">Missing</div>', '');
  return section('Missing', block.replace('<div class="card g-plan">',
    `<div class="card g-plan plan-open" role="button" tabindex="0" ${actionAttrs('openPage', 'missingEffect')}>`));
}

function finalsSection() {
  if (!SEMESTER_SPLIT) return '';
  const rows = gpaClasses().filter(course => classAverage(course.rows) != null && course.q1 != null).map(course => {
    const target = classTarget(course);
    const plan = finalPlan(course, target);
    const open = plan.reach && plan.exam > 0 ? ` role="button" tabindex="0" ${actionAttrs('openPlanTarget', course.id, target + ':final')}` : '';
    return `<div class="g-plan-row"${open}><span class="grow">${escapeHtml(shortName(course))}</span>`
      + `<span class="g-plan-s">${escapeHtml(plan.text)}</span></div>`;
  }).join('');
  return section(`Finals, ${SEMESTER_SPLIT.examPercent}% of the semester`, `<div class="card g-plan plan-list">${rows}</div>`);
}

const SECTIONS = { gpa: gpaSection, keepA: aSection, missing: missingSection, finals: finalsSection };

/** One goal's section on the Plan. */
export const planSection = key => SECTIONS[key]();

export { CHEVRON };
