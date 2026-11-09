/**
 * What changed page and the alert text. Reads the grade change log (state.gradeChanges). The Alerts page is views/alerts.js.
 * In the real app the phone checks HAC in the background and adds to this log.
 */
import { escapeHtml, oneDecimal, signed } from '../format.js';
import { state, findClass } from '../state.js';
import { heading } from './components.js';

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
