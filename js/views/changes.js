/**
 * What changed and Alerts pages. Both read the same grade change log (state.gradeChanges).
 * In the real app the phone checks HAC in the background and adds to this log.
 */
import { escapeHtml, oneDecimal, signed } from '../format.js';
import { state, findClass } from '../state.js';
import { actionAttrs, heading } from './components.js';

const BIG_TITLE = 'style="font-size:15px"';

/** Alert text for one change. Used on the Alerts page and in the banner. */
export function alertText(change) {
  const underAlert = change.after < state.alertUnder ? `, under your ${state.alertUnder}` : '';
  const retest = change.underRetestLine
    ? ` Under your ${state.retestLine} retest line. You can retest or waterfall this.`
    : '';
  return `${escapeHtml(change.title)}: ${change.scoreText}. `
    + `Average ${oneDecimal(change.before)} to ${oneDecimal(change.after)}${underAlert}.${retest}`;
}

export function changesView() {
  const rows = state.gradeChanges.map(change => {
    const course = findClass(change.classId);
    return `<div class="row"><div class="grow">`
      + `<div class="t" ${BIG_TITLE}>${escapeHtml(change.title)}, ${change.scoreText}</div>`
      + `<div class="s">${escapeHtml(course.name)}, ${change.when}. `
      + `Average ${oneDecimal(change.before)} to ${oneDecimal(change.after)}</div></div>`
      + `<div class="avg" ${BIG_TITLE}>${signed(change.after - change.before)}</div></div>`;
  }).join('');
  return `<div class="sec">${heading('Since you last looked', 'What ', 'changed', { big: 1 })}`
    + `<div class="card">${rows}</div></div>`;
}

export function alertsView() {
  const rows = state.gradeChanges.map(change => {
    const course = findClass(change.classId);
    const muted = state.mutedClasses[change.classId] ? ' (muted)' : '';
    return `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>${escapeHtml(course.name)}${muted}</div>`
      + `<div class="s">${alertText(change)}</div><div class="s">${change.when}</div></div></div>`;
  }).join('');
  return `<div class="sec">${heading('Grade changes', 'Recent ', 'alerts', { big: 1 })}`
    + `<div class="card">${rows}</div>`
    + `<div class="foot">Your phone does the checking, so an alert can arrive late. Change the rules in Settings.</div></div>`
    + `<button class="btn ghost" ${actionAttrs('showSampleAlert')}>Show me one</button>`;
}
