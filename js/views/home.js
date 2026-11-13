/**
 * Home tab (look H4, picked by the council 11/8) and the Missing work page.
 *
 * Top to bottom (11/9 hierarchy pass: one thing leads, grades get weight, red only for urgent):
 *   top bar     Home and one quiet line: "Updated N min ago" (tap or pull to refresh), or right
 *               after sign in "First update from your gradebook, 7 classes in". Alerts with a
 *               count, and +.
 *   lead        missing work card: a big "2 missing, 1 absent" title (missing red, absent gray),
 *               then every item inline, so Home never depends on the Missing page. Nothing
 *               missing: the all clear state leads instead.
 *   grades      one filled tile per class with a big grade (tap opens the class), every class
 *               visible without scrolling sideways, then the Latest grade line (opens What changed)
 *   to-dos      Today, Tomorrow, Later at 3 rows each ("N more"), Any time folded to one row.
 *               Smaller and quieter than the lead; gray rings unless overdue.
 *
 * Home only shows what the gradebook says: points and counts, never a predicted grade or a
 * "costs you" number. Hide scores (Settings) swaps every number for a word.
 */
import { escapeHtml, shortDate, oneDecimal, signed, countWord, WEEKDAYS, dateAt } from '../format.js';
import { real, realProblem, realUpdatedText, realPastedText } from '../real-data.js';
import { countsAsZero } from '../grade-math.js';
import { state, todoItems, sortByDue, missingWork, visibleClasses, periodAverage, findClass } from '../state.js';
import { actionAttrs, heading, todoRow, CHEVRON } from './components.js';
import { alertBadge } from './alerts.js';
import { goalSummary, goalLabel } from './plan.js';

/** Rows shown per to-do group before "N more". */
const GROUP_LIMIT = 3;

/** Short class names for tiles and one line text. The real app would use HAC's short names. */
const SHORT_NAMES = { 'AP World History': 'AP World', 'Computer Science': 'Comp Sci', 'Health and PE': 'PE' };
const shortClassName = name => SHORT_NAMES[name] || name.replace(/ Honors$/, '');
const shortName = course => shortClassName(course.name);

const ALERTS_ICON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 21h4"/></svg>';

const isDone = item => !!state.doneIds[item.id];
const weekday = offset => WEEKDAYS[dateAt(offset).getDay()].slice(0, 3);

// ---- Missing and absent work ---------------------------------------------------------------

/** Missing work as to-do items. */
export function missingItems() {
  return missingWork().map(({ course, row }) => ({
    id: row.id, title: row.title, due: row.due, source: 'missing', points: row.total, course,
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
        id: row.id, title: row.title, detail: `${course.name}, ${kind}, counts as 0`, due: null, course,
        dueSort: row.due, source: 'missing', kind, right: '', points: row.total,
      });
    }
  }
  return result;
}

/** Open missing and absent items: most points first, then the oldest. */
export function zeroItems() {
  return missingItems().concat(absentItems()).filter(item => !isDone(item))
    .sort((a, b) => b.points - a.points || (a.dueSort ?? a.due) - (b.dueSort ?? b.due));
}

/** A missing or absent row. Absent rows get class "abs" so the ring is gray like the text. */
export function zeroRow(item) {
  const html = todoRow(item, false);
  return item.kind ? html.replace('<div class="row', '<div class="row abs') : html;
}

/** "2 missing, 1 absent": missing in red, the rest gray. */
export function zeroCountText(items) {
  const missing = items.filter(item => !item.kind).length;
  const parts = missing ? [`<span class="u">${missing} missing</span>`] : [];
  for (const kind of ['absent', 'incomplete']) {
    const n = items.filter(item => item.kind === kind).length;
    if (n) parts.push(`<span class="g">${n} ${kind}</span>`);
  }
  return parts.join('<span class="g">, </span>');
}

/**
 * The lead card: a big "2 missing, 1 absent" title (opens the Missing page), then every item.
 * Hide scores: a calm "Missing work" title, folded, no red.
 */
function zeroCard(items) {
  if (state.hideScores) {
    const open = state.homeExpanded.zero;
    return `<div class="sec lead-sec"><div class="card lead hide">`
      + `<div class="row zero" role="button" tabindex="0" ${actionAttrs('toggleHomeGroup', 'zero')}>`
      + `<div class="grow t">Missing work</div>${open ? '<span class="chev">⌃</span>' : CHEVRON}</div>`
      + (open ? items.map(item => homeRow(item, false)).join('') : '') + `</div></div>`;
  }
  const missing = items.some(item => !item.kind);
  return `<div class="sec lead-sec"><div class="card lead${missing ? ' urgent' : ''}">`
    + `<div class="row zero" role="button" tabindex="0" ${actionAttrs('openPage', 'missingEffect')}>`
    + `<div class="grow t">${zeroCountText(items)}</div>${CHEVRON}</div>`
    + items.map(item => homeRow(item, false)).join('') + `</div></div>`;
}

/** Missing work page: missing and absent rows as gradebook facts. No "costs you" numbers. */
export function missingPageView() {
  const items = missingItems().concat(absentItems());
  if (!items.length) return `<div class="sec">${heading('', 'Nothing ', 'missing', { big: 1 })}</div>`;
  return `<div class="sec">${heading('Missing and absent work counts as 0 in your grade', 'Missing ', 'work')}`
    + `<div class="card">${zeroItems().concat(items.filter(isDone)).map(zeroRow).join('')}</div>`
    + `</div>`;
}

// ---- To-dos --------------------------------------------------------------------------------

/** Every to-do for Home. The History Project line carries its next checkpoint instead of listing them. */
function homeTodos() {
  const items = todoItems().filter(item => item.source !== 'checkpoint');
  const next = state.projectPace.map((checkpoint, index) => ({ checkpoint, index }))
    .find(({ index }) => !state.doneIds['cp' + index]);
  items.filter(item => item.big).forEach(item => {
    if (next) item.next = next.checkpoint;
  });
  return items;
}

/**
 * Home subtitles are short facts, not sentences: the short class name, then only what the
 * title and the group label do not already say.
 */
function homeDetail(item) {
  if (item.next) return `${item.next.title} by ${shortDate(item.next.due)}`;
  if (item.kind) return `${shortName(item.course)}, ${item.kind}, counts as 0`;
  if (item.source === 'missing') return `${shortName(item.course)}, was due ${shortDate(item.due)}`;
  if (item.source === 'gradebook') return shortClassName(item.detail);
  if (item.source === 'testDate') return item.detail.replace(/^Test date, /, '');
  return item.detail;
}

/** A Home row: short subtitle, red ring only when overdue or missing (never just for today). */
function homeRow(item, showDate) {
  const html = todoRow({ ...item, detail: homeDetail(item) }, showDate, { redToday: false });
  return item.kind ? html.replace('<div class="row', '<div class="row abs') : html;
}

/**
 * With nothing missing: a test today or tomorrow, then what is due today, then all clear.
 * Returns the lead html and the items it shows, so the to-dos below do not repeat them.
 * The accent is red only when something in the lead is overdue.
 */
function allClearSection() {
  const open = homeTodos().filter(item => !isDone(item));
  const leadCard = items => `<div class="card lead">${items.map(item => homeRow(item, false)).join('')}</div>`;
  const tests = sortByDue(open.filter(item => item.test && (item.due === 0 || item.due === 1)));
  if (tests.length) {
    const first = tests[0];
    return {
      shown: tests,
      html: `<div class="sec lead-sec">${heading(escapeHtml(first.detail), escapeHtml(first.title) + ' ',
        first.due === 0 ? 'today' : 'tomorrow', { big: 1 })}${leadCard(tests)}</div>`,
    };
  }
  const today = sortByDue(open.filter(item => item.due != null && item.due <= 0));
  if (today.length) {
    const overdue = today.some(item => item.due < 0);
    return {
      shown: today,
      html: `<div class="sec lead-sec">${heading('Nothing missing', countWord(today.length) + ' due ', 'today',
        { urgent: overdue, big: 1 })}${leadCard(today)}</div>`,
    };
  }
  const nextTest = sortByDue(open.filter(item => item.test && item.due > 0))[0];
  const next = nextTest ? `Next: ${escapeHtml(nextTest.title)} ${weekday(nextTest.due)}` : 'Nothing due';
  return {
    shown: [],
    html: `<div class="sec lead-sec">${heading('All clear', 'Nothing ', 'missing.', { big: 1 })}`
      + `<div class="upd" style="font-size:15px;margin-top:-2px">${next}</div></div>`,
  };
}

const groupLabel = (left, right = '') =>
  `<div class="clab"><span class="grow">${left}</span><span>${right}</span></div>`;

const leftText = items => {
  const left = items.filter(item => !isDone(item)).length;
  return left ? `${left} left` : 'All done';
};

/**
 * Dates only where they add something: overdue and later rows (missing rows say it already, and
 * the project line names its next checkpoint date instead).
 */
const showDateFor = item => item.source !== 'missing' && !item.next && item.due != null
  && (item.due < 0 || item.due > 1);

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
  let html = shown.map(item => homeRow(item, showDate ?? showDateFor(item))).join('');
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
      + anytime.map(item => homeRow(item, showDateFor(item))).join('');
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
  // Nothing to list: say so, and open the same Add to-do sheet as the + up top.
  if (!html) {
    html = `<div class="row more" role="button" tabindex="0" ${actionAttrs('openSheet', 'addTodo')}>`
      + `<div class="grow s">No to-dos</div><span class="s">Add one</span>${CHEVRON}</div>`;
  }
  return `<div class="sec"><div class="lab" style="margin:0 0 6px">To-dos</div>`
    + `<div class="card quiet${state.hideScores ? ' hide' : ''}">${html}</div></div>`;
}

// ---- Grades ---------------------------------------------------------------------------------

/**
 * The grades block, "Lowest leads" (his pick 11/9): the lowest class is one big card, the rest sit under
 * it in a short list. Red goes on one grade only, the lowest, and only when it is under the retest line.
 * Hide scores: names only, in one list. The Latest line sits under the block.
 */
function classStrip() {
  const classes = visibleClasses().filter(course => periodAverage(course) != null);
  const empty = `<div class="card quiet"><div class="row"><div class="grow s">No grades posted yet</div></div></div>`;
  return `<div class="sec grades-sec">${classes.length ? (state.hideScores ? namesList(classes) : leadAndList(classes)) : empty}${latestLine()}</div>`;
}

/** Change in a class average from its newest grade change, or null. */
function lastDelta(course) {
  const change = state.gradeChanges.find(entry => entry.classId === course.id);
  return change && Math.abs(change.after - change.before) >= 0.05 ? change.after - change.before : null;
}

const openClass = course => actionAttrs('openPage', 'class', course.id);

function namesList(classes) {
  const rows = classes.map(course => `<div class="row glist-row small" role="button" tabindex="0" ${openClass(course)}>`
    + `<div class="grow t">${escapeHtml(shortName(course))}</div>${CHEVRON}</div>`).join('');
  return `<div class="card quiet">${rows}</div>`;
}

function leadAndList(classes) {
  const lead = classes.reduce((low, course) => (periodAverage(course) < periodAverage(low) ? course : low));
  const rest = classes.filter(course => course !== lead);
  const delta = lastDelta(lead);
  const red = periodAverage(lead) < state.retestLine;
  const rows = rest.map(course => `<div class="row glist-row small" role="button" tabindex="0" ${openClass(course)}>`
    + `<div class="grow t">${escapeHtml(shortName(course))}</div>`
    + `<span class="glist-g">${oneDecimal(periodAverage(course))}</span></div>`).join('');
  return `<div class="card glead" role="button" tabindex="0" ${openClass(lead)}>`
    + '<div class="glead-k">Lowest</div>'
    + `<div class="glead-r"><span class="glead-n">${escapeHtml(shortName(lead))}</span>`
    + `<span class="glead-g${red ? ' u' : ''}">${oneDecimal(periodAverage(lead))}</span></div>`
    + (delta != null ? `<div class="glead-d">${signed(delta)} since the last grade</div>` : '')
    + (rows ? `</div><div class="card quiet" style="margin-top:8px">${rows}` : '')
    + `</div>`;
}

/** The Grades tab's GPA row, repeated at the bottom of Home. Opens the GPA page. */
function gpaRow() {
  if (real.on) return '';
  return `<div class="sec"><div class="card"><div class="row more" role="button" tabindex="0" ${actionAttrs('openPage', 'gpa')}>`
    + `<div class="grow t" style="font-size:15.5px">GPA</div>${CHEVRON}</div></div></div>`;
}

// ---- Top bar --------------------------------------------------------------------------------

/**
 * The one quiet line under the title: "Updated N min ago", or right after sign in "First update
 * from your gradebook, 7 classes in". Tapping it refreshes too (pull to refresh needs touch).
 */
function updatedLine() {
  let text;
  if (real.on && !state.loading) {
    const problem = realProblem();
    return `<div class="upd" data-live role="button" tabindex="0" ${actionAttrs('refreshFromHome')}>`
      + (real.source === 'paste'
        // Pasted from the Tally bookmark: the grading period it came from, short enough to clear
        // the bell and + buttons at 375.
        ? `HAC${real.period ? ' ' + escapeHtml(real.period) : ''}, ${realPastedText()}. Paste new</div>`
        : `Real HAC grades, Q2. ${realUpdatedText()}. Reload</div>`)
      + (problem ? `<div class="upd" style="color:var(--urgent)">${escapeHtml(problem)}</div>` : '');
  }
  if (state.loading) text = `<span class="spin"></span>${state.lastUpdated ? 'Loading' : 'Last grades, loading'}`;
  else if (state.firstOpen) {
    const graded = visibleClasses().filter(course => periodAverage(course) != null).length;
    text = `First update from your gradebook, ${graded} classes in`;
  } else {
    const minutes = state.lastUpdated == null ? 0 : Math.floor((Date.now() - state.lastUpdated) / 6e4);
    text = minutes < 1 ? 'Updated just now' : minutes === 1 ? 'Updated 1 min ago' : `Updated ${minutes} min ago`;
  }
  return `<div class="upd" data-live role="button" tabindex="0" ${actionAttrs('refreshFromHome')}>${text}</div>`;
}

/**
 * The newest grade change that moved a class average (the alert log, newest first), under the
 * grade tiles. Tapping it opens What changed.
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
 *   homeTitleBlock() the big "Home" and its one quiet line, the first thing in the scrolling page, so it
 *                    slides up with the content and fades out.
 * render.js sets --c on .scr from the scroll position (0 at the top, 1 after COLLAPSE_PX) and CSS
 * does the rest with opacity and transform only.
 */
export function homeNav() {
  const alertCount = alertBadge();
  return `<div class="nav cbar"><div class="cbar-title" aria-hidden="true">Home</div><div class="cbar-buttons">`
    + `<button class="pill round badge-wrap" aria-label="Alerts, ${alertCount}" ${actionAttrs('openPage', 'alerts')}>`
    + `${ALERTS_ICON}${alertCount ? `<span class="badge">${alertCount}</span>` : ''}</button>`
    + `<button class="pill round" aria-label="Add" ${actionAttrs('openSheet', 'addTodo')}>+</button>`
    + `</div></div>`;
}

function homeTitleBlock() {
  return `<div class="bigtitle"><div class="ttl">Home</div>${updatedLine()}</div>`;
}

// ---- Home -----------------------------------------------------------------------------------

export function homeView() {
  const items = zeroItems();
  let lead = '';
  let shownAbove = items;
  if (items.length) lead = zeroCard(items);
  else if (!state.firstOpen) {
    const allClear = allClearSection();
    lead = allClear.html;
    shownAbove = allClear.shown;
  }
  if (!state.goals.length) return homeTitleBlock() + lead + classStrip() + todoSection(shownAbove) + gpaRow();

  // Goals picked: one Plan card first (it reopens the Plan page), then Home as usual. The GPA row
  // goes when the GPA is a goal, since the card already carries it.
  return homeTitleBlock() + planCard() + lead + classStrip() + todoSection(shownAbove)
    + (state.goals.includes('gpa') ? '' : gpaRow());
}

// ---- Goals sections (picked on the Goals screens) -----------------------------------------------

/** The Plan card: each picked goal and where it stands. Opens the Plan page (js/views/plan.js). */
function planCard() {
  const rows = state.goals.map(key => {
    const sum = goalSummary(key);
    return `<div class="row glist-row small"><div class="grow t">${escapeHtml(goalLabel(key))}</div>`
      + (sum.text && !state.hideScores ? `<span class="glist-s${sum.urgent ? ' u' : ''}">${escapeHtml(sum.text)}</span>` : '')
      + `</div>`;
  }).join('');
  return `<div class="sec"><div class="card plan-card" role="button" tabindex="0" ${actionAttrs('openPage', 'plan')}>`
    + `<div class="plan-card-k"><span class="grow">Plan</span>${CHEVRON}</div>${rows}</div></div>`;
}

/**
 * The next tests before finals, soonest first: { title, course, due }. Test dates the student
 * opted into (Test Date Radar) count too. Goals' plan shows the same rows.
 */
export function finalsTests(limit = 3) {
  // Tests only: the long project (big) has its own pace line on Home.
  const tests = homeTodos().filter(item => item.test && !item.big && item.due != null && item.due >= 0 && !isDone(item));
  return sortByDue(tests).slice(0, limit).map(item => ({
    title: item.title,
    course: item.source === 'testDate' ? item.title.replace(/ (Test|Quiz)$/, '') : shortClassName(String(item.detail)),
    due: item.due,
  }));
}

/** An A is 90 and up. */
export const A_LINE = 90;

/** How far a class sits from the A line, said the way Goals' Current stats says it. */
export function aGoalNote(average) {
  const gap = average - A_LINE;
  return gap >= 0 ? `${oneDecimal(gap)} above` : `${oneDecimal(-gap)} to go`;
}
