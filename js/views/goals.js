/**
 * Goals: after sign in, the intro and Pick a look, before Home (a screen time app style setup).
 *
 *   1 What do you want?          multi pick: Raise my GPA, Never miss assignments, Ace finals,
 *                                Get an A in a class. Each tile carries one real number.
 *   2 Which classes need an A?   multi pick of every graded class (high to low), only with Get an A
 *   3 Tell me when a class drops under   single pick 90 / 85 / 80, moves on by itself
 *   Your plan                    built from the picks with real grades, under a cover plate that
 *                                lifts once (js/views/goals-motion.js). Start opens Home, which
 *                                then leads with the picked goals (js/views/home.js).
 *
 * No subtitles: every line under a heading is real data. Picked tiles get a fill, never a dim.
 * Two looks share this markup; css/goals.css styles .look-a (lead) and .look-b.
 */
import { escapeHtml, oneDecimal, shortDate } from '../format.js';
import { real } from '../real-data.js';
import { state, SEMESTER_SPLIT, goalSteps, visibleClasses, periodAverage, findClass } from '../state.js';
import { actionAttrs } from './components.js';
import { currentGpa, closestToNextLetter } from './gpa.js';
import { zeroItems, zeroCountText, finalsTests } from './home.js';
import { planPlateDue } from './goals-motion.js';

export const GOALS = [
  { key: 'gpa', label: 'Raise my GPA' },
  { key: 'missing', label: 'Never miss assignments' },
  { key: 'finals', label: 'Ace finals' },
  { key: 'keepA', label: 'Get an\u00a0A in a class' },
];

const A_LINE = 90;

const SHORT_NAMES = { 'AP World History': 'AP World', 'Computer Science': 'Comp Sci', 'Health and PE': 'PE' };
const shortName = course => SHORT_NAMES[course.name] || course.name.replace(/ Honors$/, '');

const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" '
  + 'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Real numbers ---------------------------------------------------------------------------

/** Every graded class, highest average first. */
const gradedClasses = () => visibleClasses().filter(course => periodAverage(course) != null)
  .sort((a, b) => periodAverage(b) - periodAverage(a));
const aClasses = () => gradedClasses().filter(course => periodAverage(course) >= A_LINE);
/** The GPA, or '' when there is none to show: nothing graded, or real HAC data (the app hides it there). */
function gpaText() {
  if (real.on || !gradedClasses().length) return '';
  const gpa = currentGpa();
  return Number.isFinite(gpa) ? gpa.toFixed(2) : '';
}
const finalsText = () => (SEMESTER_SPLIT ? SEMESTER_SPLIT.examPercent + '%' : '');

/** The one real number on each goal tile. */
function goalNumber(key) {
  if (key === 'gpa') return gpaText();
  if (key === 'missing') return zeroItems().filter(item => !item.kind).length + ' missing';
  if (key === 'finals') return finalsText();
  const n = aClasses().length;
  if (n) return n === 1 ? '1 A' : n + ' As';
  const best = gradedClasses()[0];
  return best ? 'best ' + oneDecimal(periodAverage(best)) : '';
}

// ---- Pieces ---------------------------------------------------------------------------------

/** A question title, last words italic. No per word clips: the whole screen moves as one. */
function riseTitle(lead, accent) {
  return `<h1 class="g-q">${escapeHtml(lead)}<i>${escapeHtml(accent)}</i></h1>`;
}

function tile(on, action, x, number, label, single) {
  return `<button class="g-tile${on ? ' on' : ''}" ${single ? `role="radio" aria-checked="${on}"` : `aria-pressed="${on}"`} `
    + `data-pick="${escapeHtml(x)}" ${actionAttrs(action, x)}>`
    + (number ? `<span class="g-num">${escapeHtml(number)}</span>` : '')
    + (label ? `<span class="g-lab">${escapeHtml(label)}</span>` : '')
    + `<span class="g-check" aria-hidden="true">${CHECK}</span></button>`;
}

function progressBar(index, total) {
  return `<div class="g-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${index + 1}">`
    + `<i style="transform:scaleX(${((index + 1) / total).toFixed(4)})"></i></div>`;
}

/**
 * Fixed slots, so the bar only ever grows: 1 what, 2 which, 3 plan. When "Which classes" is not
 * asked, the bar jumps from slot 1 to slot 3.
 */
const BAR_SLOTS = ['what', 'which', 'plan'];

function topBar(step, canGoBack) {
  const index = BAR_SLOTS.indexOf(step);
  const total = BAR_SLOTS.length;
  return `<div class="g-top">`
    + `<button class="pill round g-back${canGoBack ? '' : ' hide'}" aria-label="Back" ${actionAttrs('goalsBack')}>‹</button>`
    + progressBar(index, total) + `</div>`;
}

// ---- Questions ------------------------------------------------------------------------------

function questionBody(step) {
  if (step === 'what') {
    return riseTitle('What do you ', 'want?')
      + `<div class="g-tiles n4" role="group" aria-label="Goals">`
      + GOALS.map(goal => tile(state.goals.includes(goal.key), 'toggleGoal', goal.key, goalNumber(goal.key), goal.label)).join('')
      + `</div>`;
  }
  const classes = gradedClasses();
  return riseTitle('Which classes need an\u00a0', 'A?')
    + `<div class="g-tiles n${classes.length > 4 ? 'many' : classes.length}" role="group" aria-label="Classes">`
    + classes.map(course => tile(state.goalAClasses.includes(course.id), 'toggleGoalClass', course.id,
      oneDecimal(periodAverage(course)), shortName(course))).join('')
    + `</div>`;
}

function questionView() {
  const steps = goalSteps();
  const index = Math.min(state.goalStep, steps.length - 1);
  const step = steps[index];
  const picked = step === 'what' ? state.goals.length : state.goalAClasses.length;
  const foot = `<div class="intro-foot"><button class="btn g-next${picked ? '' : ' ghost'}" aria-disabled="${!picked}" `
    + `${actionAttrs('goalsNext')}>Continue</button></div>`;
  return `<div class="scr goals look-${state.goalsLook}" data-goal-screen="${step}">`
    + topBar(step, index > 0)
    + `<div class="g-body">${questionBody(step)}</div>`
    + foot
    + `</div>`;
}

// ---- Your plan ------------------------------------------------------------------------------


function planBlock(key) {
  if (key === 'gpa') {
    let close = gradedClasses().length ? closestToNextLetter() : null;
    // The A goals card already says how far that class is from an A: don't say it twice.
    if (close && state.goals.includes('keepA') && state.goalAClasses.includes(close.course.id)) close = null;
    const gpa = gpaText();
    if (!gpa && !close) return '';
    return `<div class="card g-plan"><div class="g-plan-k">GPA</div>${gpa ? `<div class="g-plan-n">${gpa}</div>` : ''}`
      + (close ? `<div class="g-plan-l">${escapeHtml(shortName(close.course))} ${escapeHtml(close.text)}</div>` : '')
      + `</div>`;
  }
  if (key === 'missing') {
    // Same source as Home's missing card: missing first, then absent and incomplete (count as 0).
    const items = zeroItems();
    const missing = items.some(item => !item.kind);
    return `<div class="card g-plan"><div class="g-plan-k">Missing</div>`
      + `<div class="g-plan-c${missing ? ' u' : ''}">${items.length ? zeroCountText(items) : 'Nothing missing'}</div>`
      + items.map(item => `<div class="g-plan-row"><span class="grow">${escapeHtml(item.title)}</span>`
        + `<span class="g-plan-s">${escapeHtml(shortName(item.course))}, `
        + `${item.kind ? 'counts as 0' : escapeHtml(shortDate(item.due))}</span></div>`).join('')
      + `</div>`;
  }
  if (key === 'finals') {
    if (!SEMESTER_SPLIT) return '';
    return `<div class="card g-plan"><div class="g-plan-k">Finals worth</div><div class="g-plan-n">${finalsText()}</div>`
      + finalsTests().map(item => `<div class="g-plan-row"><span class="grow">${escapeHtml(item.title)}</span>`
        + `<span class="g-plan-s">${escapeHtml(item.course)}, ${escapeHtml(shortDate(item.due))}</span></div>`).join('')
      + `</div>`;
  }
  const classes = state.goalAClasses.map(findClass).filter(course => course && periodAverage(course) != null);
  if (!classes.length) return '';
  return `<div class="card g-plan"><div class="g-plan-k">A goals</div>`
    + classes.map(course => {
      const average = periodAverage(course);
      const gap = average - A_LINE;
      const note = gap >= 0 ? `${oneDecimal(gap)} above` : `${oneDecimal(-gap)} to go`;
      return `<div class="g-plan-row"><span class="grow">${escapeHtml(shortName(course))}</span>`
        + `<span class="g-plan-g">${oneDecimal(average)}</span>`
        + `<span class="g-plan-s${average < state.alertUnder ? ' u' : ''}">${note}</span></div>`;
    }).join('')
    + `</div>`;
}

/** The cover plate: the picks tick off one by one, then it lifts off the finished plan. */
function planPlate() {
  const lines = state.goals.map(key => GOALS.find(goal => goal.key === key).label);
  return `<div class="cover-plate gplate" aria-hidden="true"><div class="gplate-in">`
    + lines.map((line, i) => `<div class="gplate-row" style="--i:${i}"><span class="gplate-tick">${CHECK}</span>`
      + `${escapeHtml(line)}</div>`).join('')
    + `</div></div>`;
}

function planView() {
  return `<div class="scr goals plan look-${state.goalsLook}" data-goal-screen="plan">`
    + topBar('plan', true)
    + `<div class="g-body g-planbody">`
    + riseTitle('Your ', 'plan')
    + state.goals.map(planBlock).join('')
    + `</div>`
    + `<div class="intro-foot"><button class="btn" ${actionAttrs('goalsStart')}>Start</button></div>`
    + (planPlateDue() ? planPlate() : '')
    + `</div>`;
}

export function goalsView() {
  return state.goalStage === 'plan' ? planView() : questionView();
}
