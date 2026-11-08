/**
 * Small HTML building blocks shared by the screens.
 *
 * Views are plain functions that return HTML strings. Clicks are wired with data attributes
 * instead of listeners: data-action names a function in actions.js, data-x and data-y are its
 * arguments. One click listener in app.js reads them (see actionAttrs).
 */
import { escapeHtml, shortDate } from '../format.js';
import { state, SEMESTER_SPLIT } from '../state.js';
import { PAST_REPORT_CARD } from '../sample-data.js';
import { currentPeriod } from '../schedule.js';

/** data-action plus up to two arguments, all escaped. */
export function actionAttrs(action, x, y) {
  return `data-action="${action}"`
    + (x != null ? ` data-x="${escapeHtml(x)}"` : '')
    + (y != null ? ` data-y="${escapeHtml(y)}"` : '');
}

/** Small label, then a big heading whose last words are in italic serif. */
export function heading(label, lead, accent, options = {}) {
  return `<div class="lab">${label}</div>`
    + `<div class="hd${options.big ? ' big' : ''}">${lead}<i class="${options.urgent ? 'u' : ''}">${accent}</i></div>`;
}

export const CHEVRON = '<span class="chev">›</span>';

/** Tappable list row with a chevron. */
export function navRow(title, subtitle, action, x, right = '') {
  return `<div class="row" role="button" tabindex="0" ${actionAttrs(action, x)}>`
    + `<div class="grow"><div class="t">${title}</div>${subtitle ? `<div class="s">${subtitle}</div>` : ''}</div>`
    + `${right}${CHEVRON}</div>`;
}

/**
 * Segmented control. Each button calls `action(value, target)`.
 * @param {[string, string][]} options [value, label] pairs
 */
export function segmented(action, selected, options, target) {
  const buttons = options.map(([value, label]) =>
    `<button ${actionAttrs(action, value, target)} class="${value === selected ? 'on' : ''}">${label}</button>`);
  return `<div class="seg">${buttons.join('')}</div>`;
}

export function toggle(on, action, x) {
  return `<button class="tog${on ? ' on' : ''}" ${actionAttrs(action, x)} aria-pressed="${!!on}"></button>`;
}

/** Small section label above a card. */
export const sectionLabel = text => `<div class="lab" style="margin:0 0 6px">${text}</div>`;

/** "Updated 3 min ago" line with the Update button (or the cooldown timer). */
export function statusStrip() {
  let label;
  if (state.loading) {
    label = `<span class="spin"></span>${state.lastUpdated ? 'Loading' : 'Last grades, loading'}`;
  } else {
    const minutes = state.lastUpdated == null ? 0 : Math.floor((Date.now() - state.lastUpdated) / 6e4);
    label = minutes < 1 ? 'Updated just now' : minutes === 1 ? 'Updated 1 min ago' : 'Updated ' + minutes + ' min ago';
  }
  const secondsLeft = Math.ceil((state.nextUpdateAllowedAt - Date.now()) / 1e3);
  let button = '';
  if (!state.loading) {
    button = secondsLeft > 0
      ? `<button class="pill" disabled>Wait ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}</button>`
      : `<button class="pill" ${actionAttrs('refresh')}>Update</button>`;
  }
  return `<div class="strip" data-live><span class="grow">${label}</span>${button}</div>`;
}

/** Home's "Algebra II Honors, 23 min left" line. Tapping it opens the Bell tab. */
export function nowLine() {
  const now = currentPeriod();
  if (!now) {
    return `<div class="now"><div class="grow"><div class="t">School is out</div>`
      + `<div class="s">Sample school day, A day</div></div></div>`;
  }
  const next = now.next ? 'Next: ' + escapeHtml(now.next.room) : 'Last class';
  return `<div class="now" role="button" tabindex="0" ${actionAttrs('openBell')}>`
    + `<div class="grow" data-live><div class="t">${escapeHtml(now.period.name)}, ${now.minutesLeft} min left</div>`
    + `<div class="s">${next}. Sample school day, A day</div></div>${CHEVRON}</div>`;
}

/** One to-do row with its tick circle. Missing work opens the assignment, checkpoints open the pace. */
export function todoRow(item, showDate = true) {
  const done = !!state.doneIds[item.id];
  const urgent = item.due != null && item.due <= 0 && !done;
  const subtitle = [item.detail, showDate && item.due != null ? shortDate(item.due) : null]
    .filter(Boolean).join(', ');
  let open;
  if (item.source === 'missing') open = actionAttrs('openPage', 'assignment', item.id);
  else if (item.source === 'checkpoint') open = actionAttrs('openPage', 'pace');
  else open = actionAttrs('openTask', item.id);
  const tickLabel = `${done ? 'Mark not done' : 'Mark done'}: ${escapeHtml(item.title)}`;
  return `<div class="row${done ? ' done' : ''}">`
    + `<div class="mark" role="button" tabindex="0" aria-label="${tickLabel}" ${actionAttrs('toggleDone', item.id)}>`
    + `<b class="${done ? 'on' : urgent ? 'u' : ''}"></b></div>`
    + `<div class="grow" role="button" tabindex="0" ${open}><div class="t">${escapeHtml(item.title)}</div>`
    + `${subtitle ? `<div class="s">${escapeHtml(subtitle)}</div>` : ''}</div>`
    + (item.right ? `<div class="s" style="font-weight:700;color:var(--ink);white-space:nowrap">${item.right}</div>` : '')
    + `</div>`;
}

/** "3 of 6 done" with one bar per item (or a single filled bar past 10 items). */
export function progressBars(items) {
  const done = items.filter(item => state.doneIds[item.id]).length;
  const total = items.length;
  const bars = total <= 10
    ? items.map((_, i) => `<span class="${i < done ? 'f' : ''}"></span>`).join('')
    : `<span style="position:relative"><span class="f" style="position:absolute;left:0;top:0;bottom:0;`
      + `border-radius:3px;display:block;width:${done / total * 100}%"></span></span>`;
  return `<div class="prog"><div class="bars">${bars}</div><em>${done} of ${total} done</em></div>`;
}

/** Says where the semester split came from, everywhere a final exam estimate is shown. */
export function splitExplanation() {
  return `Each quarter ${SEMESTER_SPLIT.quarterPercent} percent, exam ${SEMESTER_SPLIT.examPercent} percent. `
    + `Worked out from your past report card (sample: ${PAST_REPORT_CARD.length} classes from last year, `
    + `Q1, Q2, exam and semester grade).`;
}
