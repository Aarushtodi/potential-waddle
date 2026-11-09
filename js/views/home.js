/**
 * Home tab (look H4, picked by the council 11/8) and the Missing work page.
 *
 * Top to bottom:
 *   top bar     Home, "Updated N min ago" (tap or pull to refresh), the Latest grade line
 *               (opens What changed), Alerts with a count, and +
 *   first open  "First update from your gradebook" right after sign in
 *   zero card   one row "2 missing, 1 absent" (missing red, absent gray), then every item inline,
 *               so Home never depends on the Missing page. Nothing missing: the all clear state.
 *   strip       class chips with the grade, then the current period as one gray line
 *   to-dos      Today, Tomorrow, Later at 3 rows each ("N more"), Any time folded to one row
 *
 * Home only shows what the gradebook says: points and counts, never a predicted grade or a
 * "costs you" number. Hide scores (Settings) swaps every number for a word.
 */
import { escapeHtml, shortDate, oneDecimal, countWord, WEEKDAYS, dateAt } from '../format.js';
import { countsAsZero } from '../grade-math.js';
import { state, todoItems, sortByDue, missingWork, visibleClasses, periodAverage, findClass } from '../state.js';
import { actionAttrs, heading, todoRow, CHEVRON } from './components.js';

/** Rows shown per to-do group before "N more". */
const GROUP_LIMIT = 3;

/** Short class names for chips and one line text. The real app would use HAC's short names. */
const SHORT_NAMES = { 'AP World History': 'AP World', 'Computer Science': 'Comp Sci', 'Health and PE': 'PE' };
const shortName = course => SHORT_NAMES[course.name] || course.name.replace(/ Honors$/, '');

const ALERTS_ICON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 21h4"/></svg>';

const isDone = item => !!state.doneIds[item.id];
const weekday = offset => WEEKDAYS[dateAt(offset).getDay()].slice(0, 3);

// ---- Missing and absent work ---------------------------------------------------------------

/** Missing work as to-do items. */
export function missingItems() {
  return missingWork().map(({ course, row }) => ({
    id: row.id, title: row.title, due: row.due, source: 'missing', points: row.total,
    detail: course.name + ', missing, was due ' + shortDate(row.due).replace(/ /g, ' '),
    right: state.hideScores ? '' : row.total + ' pts',
  }));
}

/**
 * ABS and INC rows: HAC counts them as 0 but they are not marked missing. Shown as a gray fact.
 * due stays empty so the tick ring is gray, never red.
 */
export function absentItems() {
  const result = [];
  for (const course of visibleClasses()) {
    for (const row of course.rows || []) {
      if (!countsAsZero(row) || row.missing) continue;
      const kind = row.mark === 'INC' ? 'incomplete' : 'absent';
      result.push({
        id: row.id, title: row.title, detail: `${course.name}, ${kind}, counts as 0`, due: null,
        dueSort: row.due, source: 'missing', kind, right: '', points: row.total,
      });
    }
  }
  return result;
}

/** Open missing and absent items: most points first, then the oldest. */
function zeroItems() {
  return missingItems().concat(absentItems()).filter(item => !isDone(item))
    .sort((a, b) => b.points - a.points || (a.dueSort ?? a.due) - (b.dueSort ?? b.due));
}

/** A missing or absent row. Absent rows get class "abs" so the ring is gray like the text. */
export function zeroRow(item) {
  const html = todoRow(item, false);
  return item.kind ? html.replace('<div class="row', '<div class="row abs') : html;
}

/** "2 missing, 1 absent": missing in red, the rest gray. */
function zeroCountText(items) {
  const missing = items.filter(item => !item.kind).length;
  const parts = missing ? [`<span class="u">${missing} missing</span>`] : [];
  for (const kind of ['absent', 'incomplete']) {
    const n = items.filter(item => item.kind === kind).length;
    if (n) parts.push(`<span class="g">${n} ${kind}</span>`);
  }
  return parts.join('<span class="g">, </span>');
}

/** One body size row with the counts, then every item. Hide scores: "Missing work", folded. */
function zeroCard(items) {
  if (state.hideScores) {
    const open = state.homeExpanded.zero;
    return `<div class="sec" style="margin-bottom:12px"><div class="card hide">`
      + `<div class="row zero" role="button" tabindex="0" ${actionAttrs('toggleHomeGroup', 'zero')}>`
      + `<div class="grow t"><span class="g">Missing work</span></div>${open ? '<span class="chev">⌃</span>' : CHEVRON}</div>`
      + (open ? items.map(zeroRow).join('') : '') + `</div></div>`;
  }
  return `<div class="sec" style="margin-bottom:12px"><div class="card">`
    + `<div class="row zero" role="button" tabindex="0" ${actionAttrs('openPage', 'missingEffect')}>`
    + `<div class="grow t">${zeroCountText(items)}</div>${CHEVRON}</div>`
    + items.map(zeroRow).join('') + `</div></div>`;
}

/** Missing work page: missing and absent rows as gradebook facts. No "costs you" numbers. */
export function missingPageView() {
  const items = missingItems().concat(absentItems());
  if (!items.length) return `<div class="sec">${heading('', 'Nothing ', 'missing', { big: 1 })}</div>`;
  return `<div class="sec">${heading('Missing and absent work counts as 0 in your grade', 'Missing ', 'work')}`
    + `<div class="card">${zeroItems().concat(items.filter(isDone)).map(zeroRow).join('')}</div>`
    + `<div class="foot">To see a score you expect, type it in What if.</div></div>`;
}

// ---- To-dos --------------------------------------------------------------------------------

/** Every to-do for Home. The History Project line carries its next checkpoint instead of listing them. */
function homeTodos() {
  const items = todoItems().filter(item => item.source !== 'checkpoint');
  const next = state.projectPace.map((checkpoint, index) => ({ checkpoint, index }))
    .find(({ index }) => !state.doneIds['cp' + index]);
  items.filter(item => item.big).forEach(item => {
    if (next) item.detail += `, next ${next.checkpoint.title} ${shortDate(next.checkpoint.due)}`;
  });
  return items;
}

/** With nothing missing: a test today or tomorrow, then what is due today, then all clear. */
function allClearSection() {
  const open = homeTodos().filter(item => !isDone(item));
  const tests = sortByDue(open.filter(item => item.category === 'Test' && (item.due === 0 || item.due === 1)));
  if (tests.length) {
    const first = tests[0];
    return `<div class="sec">${heading(escapeHtml(first.detail), escapeHtml(first.title) + ' ',
      first.due === 0 ? 'today' : 'tomorrow', { urgent: 1, big: 1 })}`
      + `<div class="card">${tests.map(zeroRow).join('')}</div></div>`;
  }
  const today = sortByDue(open.filter(item => item.due != null && item.due <= 0));
  if (today.length) {
    return `<div class="sec">${heading('Nothing missing', countWord(today.length) + ' due ', 'today', { urgent: 1, big: 1 })}`
      + `<div class="card">${today.map(zeroRow).join('')}</div></div>`;
  }
  const nextTest = sortByDue(open.filter(item => item.category === 'Test' && item.due > 0))[0];
  const next = nextTest ? `Next: ${escapeHtml(nextTest.title)} ${weekday(nextTest.due)}` : 'Nothing due';
  return `<div class="sec">${heading('All clear', 'Nothing ', 'missing.', { big: 1 })}`
    + `<div class="upd" style="font-size:15px;margin-top:-2px">${next}</div></div>`;
}

const groupLabel = (left, right = '') =>
  `<div class="clab"><span class="grow">${left}</span><span>${right}</span></div>`;

const leftText = items => {
  const left = items.filter(item => !isDone(item)).length;
  return left ? `${left} left` : 'All done';
};

/** Dates only where they add something: overdue and later rows (missing rows say it already). */
const showDateFor = item => item.source !== 'missing' && item.due != null && (item.due < 0 || item.due > 1);

/** Up to GROUP_LIMIT rows, then a "N more" row that opens the group in place. */
function limitedRows(key, items, showDate) {
  items = items.filter(item => !isDone(item)).concat(items.filter(isDone)); // open rows first
  const open = state.homeExpanded[key];
  if (!items.some(item => !isDone(item)) && !open) {
    // Nothing left in this group: one quiet row instead of a list of crossed out items.
    return `<div class="row more" role="button" tabindex="0" ${actionAttrs('toggleHomeGroup', key)}>`
      + `<div class="grow s">${items.length} done</div>${CHEVRON}</div>`;
  }
  const shown = open ? items : items.slice(0, GROUP_LIMIT);
  let html = shown.map(item => todoRow(item, showDate ?? showDateFor(item))).join('');
  if (items.length > GROUP_LIMIT) {
    html += `<div class="row more" role="button" tabindex="0" ${actionAttrs('toggleHomeGroup', key)}>`
      + `<div class="grow s">${open ? 'Show less' : (items.length - GROUP_LIMIT) + ' more'}</div></div>`;
  }
  return html;
}

/** Split the to-dos (minus what the zero card shows) into Today, Tomorrow, Later and Any time. */
function todoGroups(shownAbove) {
  const skip = new Set(shownAbove.map(item => item.id));
  const items = homeTodos().filter(item => !skip.has(item.id));
  const missing = missingItems().filter(item => !skip.has(item.id));
  const overdueOpen = items.filter(item => item.due != null && item.due < 0 && !isDone(item));
  const finishedOverdue = items.filter(item => item.due != null && item.due < 0 && isDone(item));
  return {
    today: missing.concat(sortByDue(overdueOpen), sortByDue(items.filter(item => item.due === 0))),
    tomorrow: sortByDue(items.filter(item => item.due === 1)),
    later: sortByDue(items.filter(item => item.due != null && item.due > 1)),
    anytime: items.filter(item => item.due == null).concat(finishedOverdue),
  };
}

function anytimeRows(anytime) {
  if (!anytime.length) return '';
  if (state.homeExpanded.anytime) {
    return groupLabel('Any time', `<span role="button" ${actionAttrs('toggleHomeGroup', 'anytime')}>Hide</span>`)
      + anytime.map(item => todoRow(item)).join('');
  }
  return `<div class="row more" role="button" tabindex="0" ${actionAttrs('toggleHomeGroup', 'anytime')}>`
    + `<div class="grow s">${anytime.length} any time</div>${CHEVRON}</div>`;
}

function todoSection(shownAbove) {
  const groups = todoGroups(shownAbove);
  let html = '';
  if (groups.today.length) html += groupLabel('Today', leftText(groups.today)) + limitedRows('today', groups.today);
  if (groups.tomorrow.length) {
    html += groupLabel('Tomorrow, ' + weekday(1), leftText(groups.tomorrow)) + limitedRows('tomorrow', groups.tomorrow, false);
  }
  if (groups.later.length) html += groupLabel('Later', leftText(groups.later)) + limitedRows('later', groups.later);
  html += anytimeRows(groups.anytime);
  return `<div class="sec"><div class="lab" style="margin:0 0 6px">To-dos</div>`
    + `<div class="card quiet${state.hideScores ? ' hide' : ''}">${html}</div></div>`;
}

// ---- Class strip and the current period ---------------------------------------------------

/** One sideways row of chips, short class name + grade. Tap opens the class. */
function classStrip() {
  const chips = visibleClasses().filter(course => periodAverage(course) != null).map(course =>
    `<button class="chip cls" ${actionAttrs('openPage', 'class', course.id)}>${escapeHtml(shortName(course))}`
    + (state.hideScores ? '' : ` <b>${oneDecimal(periodAverage(course))}</b>`) + `</button>`).join('');
  return `<div class="chips strip-cls">${chips}</div>`;
}

// ---- Top bar --------------------------------------------------------------------------------

/** "Updated N min ago" under the title. Tapping it refreshes too (pull to refresh needs touch). */
function updatedLine() {
  let text;
  if (state.loading) text = `<span class="spin"></span>${state.lastUpdated ? 'Loading' : 'Last grades, loading'}`;
  else {
    const minutes = state.lastUpdated == null ? 0 : Math.floor((Date.now() - state.lastUpdated) / 6e4);
    text = minutes < 1 ? 'Updated just now' : minutes === 1 ? 'Updated 1 min ago' : `Updated ${minutes} min ago`;
  }
  return `<div class="upd" data-live role="button" tabindex="0" ${actionAttrs('refreshFromHome')}>${text}</div>`;
}

/**
 * The newest grade change that moved a class average (the alert log, newest first).
 * Tapping it opens What changed.
 */
function latestLine() {
  const change = state.gradeChanges.find(entry => Math.abs(entry.after - entry.before) >= 0.05);
  if (!change) return '';
  const course = findClass(change.classId);
  const text = state.hideScores
    ? 'New grades posted'
    : `Latest: ${escapeHtml(change.title)} ${escapeHtml(change.scoreText.replace(/ \/ 100$/, ''))}, `
      + `${escapeHtml(shortName(course))} now ${oneDecimal(change.after)}`;
  return `<div class="upd latest" role="button" tabindex="0" ${actionAttrs('openPage', 'changes')}>${text}${CHEVRON}</div>`;
}

/**
 * iOS large title header, in two parts:
 *   homeNav()        a slim bar laid over the top of the page: small centered "Home" (hidden at the
 *                    top), Alerts and +. Its background and hairline only show once collapsed.
 *   homeTitleBlock() the big "Home", Updated and Latest, the first thing in the scrolling page, so it
 *                    slides up with the content and fades out.
 * render.js sets --c on .scr from the scroll position (0 at the top, 1 after COLLAPSE_PX) and CSS
 * does the rest with opacity and transform only.
 */
export function homeNav() {
  const alertCount = state.gradeChanges.length;
  return `<div class="nav cbar"><div class="cbar-title" aria-hidden="true">Home</div><div class="cbar-buttons">`
    + `<button class="pill round badge-wrap" aria-label="Alerts, ${alertCount}" ${actionAttrs('openPage', 'alerts')}>`
    + `${ALERTS_ICON}${alertCount ? `<span class="badge">${alertCount}</span>` : ''}</button>`
    + `<button class="pill round" aria-label="Add" ${actionAttrs('openSheet', 'addTodo')}>+</button>`
    + `</div></div>`;
}

function homeTitleBlock() {
  return `<div class="bigtitle"><div class="ttl">Home</div>${updatedLine()}${latestLine()}</div>`;
}

// ---- Home -----------------------------------------------------------------------------------

export function homeView() {
  const items = zeroItems();
  let html = homeTitleBlock();
  if (state.firstOpen) {
    const graded = visibleClasses().filter(course => periodAverage(course) != null).length;
    html += `<div class="sec" style="margin-bottom:14px"><div class="lab">First update from your gradebook</div>`
      + `<div class="t" style="font-size:20px;margin-top:2px">${graded} classes in.</div></div>`;
  }
  if (items.length) html += zeroCard(items);
  else if (!state.firstOpen) html += allClearSection();
  return html
    + `<div class="sec" style="margin-bottom:14px">${classStrip()}</div>`
    + todoSection(items);
}
