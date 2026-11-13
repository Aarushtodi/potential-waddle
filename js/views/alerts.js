/**
 * Alerts page, "Needs you" (picked 11/9 from three looks). Shows only what is open right now: a zero in the
 * gradebook, a test under the retest line, a class under his number. Each row has one next step and clears
 * itself when the student turns the work in, retests, or the average comes back up. Empty is the good state.
 *
 * Everything is read from the gradebook rows and the rules in Settings, never a saved copy of a grade.
 * Home's bell badge asks alertBadge() for its number.
 */
import { escapeHtml, oneDecimal, relativeDay } from '../format.js';
import { countsAsZero } from '../grade-math.js';
import { ALERT_CLEARED, CLASSES } from '../sample-data.js';
import { state, findClass, periodAverage, isUnderRetestLine, isMissing } from '../state.js';
import { real, realProblem, realUpdatedText } from '../real-data.js';
import { actionAttrs, heading, navRow } from './components.js';

// Preview only: ?hac=1 shows the can't read your gradebook state.
if (new URLSearchParams(location.search).get('hac') === '1') state.hacDown = true;

const shortName = course => course.name.replace(/ Honors$/, '');
const numbers = text => (state.hideScores ? '' : text);

// ---- What is open right now ----------------------------------------------------------------


/**
 * Live conditions, most urgent first. A row is here only while it is true, so it clears itself when
 * the student turns the work in, retests, or the average comes back up.
 */
export function needsYou() {
  const items = [];
  const rules = state.alertRules;
  for (const course of CLASSES) {
    if (state.mutedClasses[course.id] || state.hiddenClasses[course.id]) continue;
    for (const row of course.rows) {
      if (rules.zero && countsAsZero(row)) {
        const word = isMissing(row) ? 'missing' : row.mark === 'INC' ? 'incomplete' : 'absent';
        items.push({
          kind: 'zero', classId: course.id, urgent: isMissing(row), title: row.title,
          rest: `${word[0].toUpperCase() + word.slice(1)}, counts as zero.`,
          line: `${shortName(course)}. ${word[0].toUpperCase() + word.slice(1)}, counts as zero.`,
          step: 'Open', action: actionAttrs('openPage', 'assignment', row.id),
        });
      }
      if (rules.newGrade && isUnderRetestLine(row, course)) {
        items.push({
          kind: 'retest', classId: course.id, title: row.title,
          rest: `${numbers(`${row.score}. `)}Your retest line is ${state.retestLine}.`,
          line: `${shortName(course)}. ${numbers(`${row.score}. `)}Your retest line is ${state.retestLine}.`,
          step: 'Retest', action: actionAttrs('openPage', 'assignment', row.id),
        });
      }
    }
    const average = periodAverage(course);
    if (rules.under && average != null && average < state.alertUnder) {
      items.push({
        kind: 'under', classId: course.id, title: `${shortName(course)} is under your ${state.alertUnder}`,
        rest: numbers(`Now ${oneDecimal(average)}.`) || 'Below the number you set.',
        line: numbers(`Now ${oneDecimal(average)}.`) || 'Below the number you set.',
        step: 'See the class', action: actionAttrs('openPage', 'class', course.id),
      });
    }
  }
  const order = { zero: 0, retest: 1, under: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind]);
}

/**
 * The same open items for the Needs you page, folded so it stays short: all zeros in one row (it opens the
 * Missing work page), all classes under his number in one row (it opens Grades). Retests stay one per test.
 */
function needsYouFolded() {
  const all = needsYou();
  const zeros = all.filter(item => item.kind === 'zero');
  const unders = all.filter(item => item.kind === 'under');
  const rest = all.filter(item => item.kind === 'retest');
  const out = [];
  if (zeros.length === 1) out.push(zeros[0]);
  else if (zeros.length) {
    out.push({
      kind: 'zero', urgent: zeros.some(item => item.urgent), title: `${zeros.length} zeros in the gradebook`,
      line: zeros.map(item => item.title).join(', ') + '.', step: 'Open', action: actionAttrs('openPage', 'missingEffect'),
    });
  }
  out.push(...rest);
  if (unders.length === 1) out.push(unders[0]);
  else if (unders.length) {
    out.push({
      kind: 'under', title: `${unders.length} classes under your ${state.alertUnder}`,
      line: unders.map(item => shortName(findClass(item.classId))).join(', ') + '.',
      step: 'Grades', action: actionAttrs('switchTab', 'grades'),
    });
  }
  return out;
}

/** The number on Home's bell: how many rows Needs you shows. */
export const alertBadge = () => needsYouFolded().length;

// ---- The page --------------------------------------------------------------------------------

function checkedText() {
  if (real.on) return realUpdatedText();
  const minutes = Math.floor((Date.now() - (state.lastUpdated ?? state.openedAt)) / 6e4);
  return minutes < 1 ? 'Checked just now' : `Checked ${minutes} min ago`;
}

/** Only shown when the phone could not read the gradebook. Otherwise the page stays quiet about it. */
function hacBanner() {
  const problem = real.on ? realProblem() : state.hacDown ? 'Sign in again to keep alerts coming. Last good check, Tuesday 7:48 AM.' : '';
  if (!problem) return '';
  return `<div class="card al-warn"><div class="row"><div class="grow"><div class="t">Can't read your gradebook</div>`
    + `<div class="s">${escapeHtml(problem)}</div></div>`
    + (real.on ? '' : `<button class="pill" ${actionAttrs('signOut')}>Sign in</button>`) + `</div></div>`;
}

export function alertsView() {
  const items = needsYouFolded();
  const rows = items.map(item => `<div class="row al-need">`
    + `<b class="al-dot${item.urgent ? ' u' : ''}"></b>`
    + `<div class="grow"><div class="t">${escapeHtml(item.title)}</div><div class="s">${escapeHtml(item.line)}</div></div>`
    + `<button class="pill" ${item.action}>${item.step}</button></div>`).join('');
  const body = items.length
    ? `<div class="card">${rows}</div>`
    : `<div class="card al-empty"><div class="t">Nothing needs you.</div></div>`;
  // The cleared list is sample only: the real app would keep what it saw clear on this phone.
  const cleared = real.on ? '' : `<div class="sec"><div class="lab" style="margin:0 0 6px">Cleared this week</div><div class="card quiet">`
    + ALERT_CLEARED.map(entry => `<div class="row"><span class="al-check">✓</span>`
      + `<div class="grow"><div class="t">${escapeHtml(shortName(findClass(entry.classId)))}</div>`
      + `<div class="s">${entry.text}, ${relativeDay(entry.day).toLowerCase()}</div></div></div>`).join('') + `</div></div>`;
  return `<div class="sec">${hacBanner()}`
    + heading(checkedText(), items.length ? 'Needs ' : 'All ', items.length ? 'you' : 'clear', { big: 1 })
    + body + `</div>` + cleared
    + `<div class="card al-foot">${navRow('What changed', '', 'openPage', 'changes')}`
    + navRow('Alert rules', '', 'openPage', 'settings') + `</div>`;
}
