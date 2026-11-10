/**
 * Plan, look B: a summary list. One row per goal with a toggle (on = it leads on Home) and a one
 * line summary from the real grades; tapping a row opens that goal's own page, where it is edited.
 * The goal pages are plan.js planSection(key), the same sections look A shows on one page.
 *
 * It is the last setup screen (Goals, then Plan, then Start lands on Home) and the page Home's Plan
 * card opens:
 *   setup   goals.js draws planListView() / planDetailView() inside the goals screen
 *           (state.planDetail picks the goal page; Back closes it)
 *   app     shell.js PAGES.plan and PAGES.planGoal(key) on the Home stack
 */
import { escapeHtml } from '../format.js';
import { real } from '../real-data.js';
import { state, SEMESTER_SPLIT, findClass, periodAverage } from '../state.js';
import { actionAttrs, toggle, CHEVRON } from './components.js';
import { GOALS, gpaText, shortName, gradedClasses } from './goals.js';
import { zeroItems } from './home.js';
import { closestToNextLetter } from './gpa.js';
import { gpaGoal, gpaGoalText, lettersToGoal, lettersUpText } from './plan-math.js';
import { planSection } from './plan.js';

const label = key => GOALS.find(goal => goal.key === key).label;

/** One line per goal, from the gradebook: what the goal is and where it stands. */
export function goalSummary(key) {
  if (key === 'gpa') {
    const goal = real.on ? null : gpaGoal();
    if (goal != null) {
      const plan = lettersToGoal(goal);
      return `Goal ${gpaGoalText(goal)}, ${plan.reached ? lettersUpText(plan.steps) : 'out of reach'}`;
    }
    if (!real.on && gpaText()) return `All As, GPA ${gpaText()}`;
    const close = gradedClasses().length ? closestToNextLetter() : null;
    return close ? `${shortName(close.course)} ${close.text}` : 'No grades yet';
  }
  if (key === 'keepA') {
    const names = state.goalAClasses.map(findClass).filter(course => course && periodAverage(course) != null).map(shortName);
    if (!names.length) return 'Pick a class';
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')}, ${names.length - 2} more`;
  }
  if (key === 'missing') {
    const items = zeroItems();
    const missing = items.filter(item => !item.kind).length;
    if (!items.length) return 'Nothing missing';
    return missing ? `${missing} missing now` : `${items.length} count as 0`;
  }
  return SEMESTER_SPLIT ? `Worth ${SEMESTER_SPLIT.examPercent}% of the semester` : 'No finals yet';
}

/** Red only when something is missing right now. */
const urgent = key => key === 'missing' && zeroItems().some(item => !item.kind);

function goalRow(key) {
  const on = state.goals.includes(key);
  return `<div class="row plan-row${on ? ' on' : ''}" role="button" tabindex="0" ${actionAttrs('openPlanGoal', key)}>`
    + `<div class="grow"><div class="t">${escapeHtml(label(key))}${CHEVRON}</div>`
    + `<div class="s${urgent(key) && on ? ' u' : ''}">${escapeHtml(goalSummary(key))}</div></div>`
    + toggle(on, 'toggleGoal', key)
    + `</div>`;
}

/** The list: every goal, picked ones on. Fixed order, so a toggle never moves a row. */
export const planList = () => `<div class="card plan-b-list">${GOALS.map(goal => goalRow(goal.key)).join('')}</div>`
  + `<div class="plan-b-hint">On goals show on Home. Tap one to change it.</div>`;

/**
 * A goal's page. During setup the app pages (Target, Missing work) are not open yet, so the rows
 * that would open them are plain text there.
 */
export function planGoalBody(key) {
  const html = planSection(key) || `<div class="plan-b-empty">Nothing to set yet</div>`;
  if (state.screen !== 'goals') return html;
  return html.replace(/ role="button" tabindex="0" data-action="(openPlanTarget|openPage)"( data-[xy]="[^"]*")*/g, '');
}

/** Home's one Plan card: the on goals and their lines. Opens the Plan page. */
export function homePlanCard() {
  const rows = state.goals.map(key => `<div class="plan-b-hrow"><span class="grow">${escapeHtml(label(key))}</span>`
    + (state.hideScores ? '' : `<span class="plan-b-hs${urgent(key) ? ' u' : ''}">${escapeHtml(goalSummary(key))}</span>`)
    + `</div>`).join('');
  return `<div class="sec"><div class="card plan-b-home" role="button" tabindex="0" ${actionAttrs('openPage', 'plan')}>`
    + `<div class="plan-b-hk">Your plan${CHEVRON}</div>${rows}</div></div>`;
}

export { label as planGoalLabel };
