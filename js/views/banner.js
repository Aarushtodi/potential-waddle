/**
 * The grade change banner: the score big on the left, then the class as a small label, the
 * test and the average change (drop in red, rise in green), plus a Retest chip under the line.
 */
import { escapeHtml, oneDecimal } from '../format.js';
import { findClass } from '../state.js';
import { actionAttrs } from './components.js';

/** Plain data for one banner. Comes from a grade change entry. */
export function bannerData(change) {
  const course = findClass(change.classId);
  return {
    className: course.name, test: change.title, score: change.scoreText.replace(/\s*\/\s*/, '/'),
    before: change.before, after: change.after,
    up: change.after >= change.before, retest: !!change.underRetestLine,
  };
}

const tone = d => (d.up ? 'up' : 'dn');
const avgChange = d => `${oneDecimal(d.before)} <i class="ar">→</i> <b class="${tone(d)}">${oneDecimal(d.after)}</b>`;
const chip = d => (d.retest ? '<span class="bn-chip">Retest</span>' : '');

/** Big score left, class + test and the average change right. */
function bannerBody(d) {
  return `<div class="bn l1"><div class="bn-big">${d.score}</div>`
    + `<div class="bn-col"><div class="bn-lab">${escapeHtml(d.className)}</div>`
    + `<div class="bn-line">${escapeHtml(d.test)}</div>`
    + `<div class="bn-line sm">${avgChange(d)}</div></div>${chip(d)}</div>`;
}

/** The live banner, positioned over the screen. */
export function liveBanner(b) {
  return `<div class="banner bnw${b.fresh ? ' anim' : ''}" role="status" ${actionAttrs('tapBanner')}>`
    + `${bannerBody(b.data)}</div>`;
}
