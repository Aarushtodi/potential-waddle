/**
 * Grade drop banner looks (LOOKS branch, never ships unless picked).
 * ?banner=1|2|3 picks a look for the live banner, ?banner=compare shows all three side by side.
 * No param = today's banner. One focus per look, class name as a small label, max two short lines.
 */
import { escapeHtml, oneDecimal } from '../format.js';
import { state, findClass } from '../state.js';
import { actionAttrs } from './components.js';

const param = new URLSearchParams(location.search).get('banner');
export const bannerLook = ['1', '2', '3'].includes(param) ? +param : 0;
export const isBannerCompare = param === 'compare';

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
const delta = d => `${d.up ? '▲' : '▼'} ${oneDecimal(Math.abs(d.after - d.before))}`;

/** Look 1: big score left, class + test and the average change right. */
function look1(d) {
  return `<div class="bn l1"><div class="bn-big">${d.score}</div>`
    + `<div class="bn-col"><div class="bn-lab">${escapeHtml(d.className)}</div>`
    + `<div class="bn-line">${escapeHtml(d.test)}</div>`
    + `<div class="bn-line sm">${avgChange(d)}</div></div>${chip(d)}</div>`;
}

/** Look 2: the new average is the focus, with a small delta; the test line sits under it. */
function look2(d) {
  return `<div class="bn l2"><div class="bn-top"><div class="bn-big">${oneDecimal(d.after)}</div>`
    + `<span class="bn-delta ${tone(d)}">${delta(d)}</span><span class="bn-sp"></span>${chip(d)}</div>`
    + `<div class="bn-line sm">${escapeHtml(d.className)} · ${escapeHtml(d.test)} ${d.score}</div></div>`;
}

/** Look 3: one compact line. */
function look3(d) {
  return `<div class="bn l3"><span class="bn-dot ${tone(d)}"></span>`
    + `<span class="bn-name">${escapeHtml(d.className)}</span><b class="bn-score">${d.score}</b>`
    + `<span class="bn-sp"></span>${chip(d)}</div>`;
}

export const bannerBody = (look, d) => [null, look1, look2, look3][look](d);

/** The live banner for a chosen look (positioned over the screen like today's). */
export function liveBanner(b) {
  return `<div class="banner bnw${b.fresh ? ' anim' : ''}" role="status" ${actionAttrs('tapBanner')}>`
    + `${bannerBody(bannerLook, b.data)}</div>`;
}

// ---- Compare page --------------------------------------------------------------------------

const DROP = { className: 'Chemistry', test: 'Reactions Test', score: '78/100', before: 75.5, after: 73.6, up: false, retest: true };
const UP = { className: 'Spanish', test: 'Workbook 5', score: '16/20', before: 88.2, after: 89.1, up: true, retest: false };
const LOOK_NAMES = ['', 'Score left', 'New average', 'One line pill'];

function pane(theme, look) {
  return `<div class="cmp-pane ${theme}"><div class="cmp-tag">${theme === 'force-light' ? 'Light' : 'Dark'}</div>`
    + `<div class="bn-wrap"><div class="cmp-cap">Dropped, under retest line</div>${bannerBody(look, DROP)}</div>`
    + `<div class="bn-wrap"><div class="cmp-cap">Went up</div>${bannerBody(look, UP)}</div></div>`;
}

export function compareView() {
  const sections = [1, 2, 3].map(look =>
    `<section class="cmp-sec" style="--d:${look * 90}ms"><h2>Look ${look}: ${LOOK_NAMES[look]}</h2>`
    + `<div class="cmp-row">${pane('force-light', look)}${pane('force-dark', look)}</div></section>`).join('');
  return `<div class="cmp"><h1>Grade drop banner</h1>${sections}</div>`;
}
