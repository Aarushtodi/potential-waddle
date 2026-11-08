/**
 * DESIGN VARIANTS: Home looks 2A, 2B and 2C (council preview, picked with ?home=a|b|c).
 * See js/variants.js for the switch and the spec it follows. Nothing is removed from the app,
 * only moved: test dates and the progress bars go to Calendar, Update becomes pull to refresh.
 *
 * Shared changes in every look:
 *   2s1 no Update button: pull to refresh, "Updated N min ago" small and gray under the title
 *   2s2 Test dates button and the "unofficial" footnote live on the Calendar top bar / day view
 *   2s3 + stays top right
 *   2s4 red rings only on overdue and due today rows (todoRow already does this), the rest gray
 *   2s5 progress bars become "N left" in the to-do header (the bars move to the Calendar day view)
 *   2s6 Hide scores on: the spotlight shows counts, not points or grades
 */
import { escapeHtml, shortDate, oneDecimal, countWord, WEEKDAYS, dateAt } from '../format.js';
import { isScored, countsAsZero } from '../grade-math.js';
import { BELL_SCHEDULE } from '../sample-data.js';
import { state, todoItems, sortByDue, missingWork, visibleClasses, periodAverage, findClass } from '../state.js';
import { currentPeriod } from '../schedule.js';
import { actionAttrs, heading, todoRow, CHEVRON } from './components.js';
import { HOME_LOOK, DEMO, lookState, shortName, SAMPLE_LAST_OPEN, SAMPLE_LAST_AVERAGE } from '../variants.js';

/** Rows shown per to-do group before "N more". */
const GROUP_LIMIT = 3;

const isDone = item => !!state.doneIds[item.id];
const weekday = offset => WEEKDAYS[dateAt(offset).getDay()].slice(0, 3);

// ---- Data the looks share -------------------------------------------------------------------

/** Missing work as to-do items, the same way today's Home builds them. */
export function missingItems() {
  return missingWork().map(({ course, row }) => ({
    id: row.id, title: row.title, detail: course.name + ', missing, was due ' + shortDate(row.due).replace(/ /g, '\u00a0'),
    due: row.due, source: 'missing', right: lookState.hideScores ? '' : row.total + ' pts', points: row.total,
    classId: course.id,
  }));
}

/** ABS and INC rows (counted as 0 by HAC, not marked missing). Shown as facts, no cost number. */
export function absentItems() {
  const result = [];
  for (const course of visibleClasses()) {
    for (const row of course.rows || []) {
      if (!countsAsZero(row) || row.missing) continue;
      const word = row.mark === 'INC' ? 'incomplete' : 'absent';
      result.push({
        // due is left empty so the ring stays gray: absent work is a gray "counts as 0", never red.
        id: row.id, title: row.title, detail: `${course.name}, ${word}, counts as 0`, due: null, dueSort: row.due,
        source: 'missing', kind: word, right: '', points: row.total, classId: course.id,
      });
    }
  }
  return result;
}

/** A missing or absent row. Absent ones get class "abs" so their ring is gray, like their text. */
export const zeroTodoRow = item => {
  const html = todoRow(item, false);
  return item.kind ? html.replace('<div class="row', '<div class="row abs') : html;
};

/** Every to-do for Home, with the History Project line carrying its next checkpoint (as today). */
function homeTodos() {
  const items = todoItems().filter(item => item.source !== 'checkpoint');
  const next = state.projectPace.map((checkpoint, index) => ({ checkpoint, index }))
    .find(({ index }) => !state.doneIds['cp' + index]);
  items.filter(item => item.big).forEach(item => {
    if (next) item.detail += `, next ${next.checkpoint.title} ${shortDate(next.checkpoint.due)}`;
  });
  return items;
}

/**
 * 2A spotlight, picked by rule: missing graded work by points, then a test today or tomorrow,
 * then due today, then all clear.
 * @returns {{kind: string, items: object[]}}
 */
export function pickSpotlight() {
  const missing = missingItems().filter(item => !isDone(item)).sort((a, b) => b.points - a.points);
  if (missing.length) return { kind: 'missing', items: missing };
  const open = homeTodos().filter(item => !isDone(item));
  const tests = sortByDue(open.filter(item => item.category === 'Test' && (item.due === 0 || item.due === 1)));
  if (tests.length) return { kind: 'test', items: tests };
  const today = sortByDue(open.filter(item => item.due != null && item.due <= 0));
  if (today.length) return { kind: 'today', items: today };
  return { kind: 'clear', items: [] };
}

// ---- Shared pieces --------------------------------------------------------------------------

/** 2s1: "Updated N min ago" under the Home title. Tapping it also refreshes (for a mouse). */
export function updatedLine() {
  let text;
  if (state.loading) text = `<span class="spin"></span>${state.lastUpdated ? 'Loading' : 'Last grades, loading'}`;
  else {
    const minutes = state.lastUpdated == null ? 0 : Math.floor((Date.now() - state.lastUpdated) / 6e4);
    text = minutes < 1 ? 'Updated just now' : minutes === 1 ? 'Updated 1 min ago' : `Updated ${minutes} min ago`;
  }
  return `<div class="upd" data-live role="button" tabindex="0" ${actionAttrs('pullRefresh')}>${text}</div>`;
}

/** Home's top bar for the looks: title, updated line, + (Test dates moved to Calendar). */
export function homeLookNav() {
  const latest = HOME_LOOK === 'h1' ? latestLine() : HOME_LOOK === 'h4' ? latestMovedLine() : '';
  return `<div class="nav"><div class="ttlw"><div class="ttl">Home</div>${updatedLine()}${latest}</div>`
    + `<button class="pill round" aria-label="Add" ${actionAttrs('openSheet', 'addTodo')}>+</button></div>`;
}

/** Spotlight heading + card, shared by 2A (always) and 2C (only when something is missing). */
function spotlightSection(spot) {
  const hide = lookState.hideScores;
  if (spot.kind === 'missing') {
    const points = spot.items.reduce((sum, item) => sum + item.points, 0);
    const n = String(spot.items.length);
    const head = hide
      ? heading('Costing you the most, counts as 0', n + ' ', 'missing', { urgent: 1, big: 1 })
      : heading('Costing you the most, counts as 0', `${n} missing, `, `${points} pts`, { urgent: 1, big: 1 });
    return `<div class="sec">` + head
      + `<div class="card">${spot.items.map(zeroTodoRow).join('')}</div></div>`;
  }
  if (spot.kind === 'test') {
    const first = spot.items[0];
    return `<div class="sec">${heading(escapeHtml(first.detail), escapeHtml(first.title) + ' ',
      first.due === 0 ? 'today' : 'tomorrow', { urgent: 1, big: 1 })}`
      + `<div class="card">${spot.items.map(zeroTodoRow).join('')}</div></div>`;
  }
  if (spot.kind === 'today') {
    return `<div class="sec">${heading('Nothing missing', countWord(spot.items.length) + ' due ', 'today', { urgent: 1, big: 1 })}`
      + `<div class="card">${spot.items.map(zeroTodoRow).join('')}</div></div>`;
  }
  const nextTest = sortByDue(homeTodos().filter(item => !isDone(item) && item.category === 'Test' && item.due > 0))[0];
  const next = nextTest ? `Next: ${escapeHtml(nextTest.title)} ${weekday(nextTest.due)}` : 'Nothing due';
  return `<div class="sec">${heading('All clear', 'Nothing ', 'missing.', { big: 1 })}`
    + `<div class="upd" style="font-size:15px;margin-top:-2px">${next}</div></div>`;
}

/** 2A: one sideways scroll of chips, short class name + grade. Tap opens the class. */
function classStrip() {
  const chips = visibleClasses().filter(course => periodAverage(course) != null).map(course =>
    `<button class="chip cls" ${actionAttrs('openPage', 'class', course.id)}>${escapeHtml(shortName(course))}`
    + (lookState.hideScores ? '' : ` <b>${oneDecimal(periodAverage(course))}</b>`) + `</button>`).join('');
  return `<div class="chips strip-cls">${chips}</div>`;
}

/** The now line as one gray line. Tapping it opens the Bell tab. */
function nowGray() {
  const now = currentPeriod();
  if (!now) return `<div class="nowg">School is out. Sample school day, A day</div>`;
  const course = findClass(now.period.id);
  const name = course ? shortName(course) : now.period.name;
  const next = now.next ? `. Next: ${escapeHtml(now.next.room)}` : '. Last class';
  return `<div class="nowg" role="button" tabindex="0" ${actionAttrs('openBell')}>`
    + `<span class="grow" data-live>${escapeHtml(name)}, ${now.minutesLeft} min left${next}</span>${CHEVRON}</div>`;
}

/** Group label row: "Today" on the left, "4 left" on the right (2s5). */
const groupLabel = (left, right = '') =>
  `<div class="clab"><span class="grow">${left}</span><span>${right}</span></div>`;

/** Up to GROUP_LIMIT rows, then a "N more" row that expands the group in place. */
function limitedRows(key, items, showDate) {
  // Open rows first, finished ones fold into "N more".
  items = items.filter(item => !isDone(item)).concat(items.filter(isDone));
  const open = lookState.expanded[key];
  const openCount = items.filter(item => !isDone(item)).length;
  if (!openCount && !open) {
    // Nothing left in this group: one quiet row instead of a list of crossed out items.
    return `<div class="row more" role="button" tabindex="0" ${actionAttrs('expandGroup', key)}>`
      + `<div class="grow s">${items.length} done</div>${CHEVRON}</div>`;
  }
  const shown = open ? items : items.slice(0, GROUP_LIMIT);
  let html = shown.map(item => todoRow(item, showDate ?? showDateFor(item))).join('');
  if (items.length > GROUP_LIMIT) {
    html += `<div class="row more" role="button" tabindex="0" ${actionAttrs('expandGroup', key)}>`
      + `<div class="grow s">${open ? 'Show less' : (items.length - GROUP_LIMIT) + ' more'}</div></div>`;
  }
  return html;
}

/** Dates only where they add something: overdue rows and later rows (missing rows say it already). */
const showDateFor = item => item.source !== 'missing' && item.due != null && (item.due < 0 || item.due > 1);

const leftText = items => {
  const left = items.filter(item => !isDone(item)).length;
  return left ? `${left} left` : 'All done';
};

/** Split Home's to-dos into Today (overdue + today), Tomorrow, Later, Any time. */
function todoBuckets(exclude) {
  const skip = new Set(exclude.map(item => item.id));
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

/** "N any time" row that unfolds the undated and finished to-dos. */
function anytimeRows(anytime) {
  if (!anytime.length) return '';
  if (lookState.expanded.anytime) {
    return groupLabel('Any time', `<span role="button" ${actionAttrs('expandGroup', 'anytime')}>Hide</span>`)
      + anytime.map(item => todoRow(item)).join('');
  }
  return `<div class="row more" role="button" tabindex="0" ${actionAttrs('expandGroup', 'anytime')}>`
    + `<div class="grow s">${anytime.length} any time</div>${CHEVRON}</div>`;
}

/** 2A and 2C to-dos: Today, Tomorrow, Later at 3 rows each, Any time folded to one row. */
function quietTodos(exclude) {
  const b = todoBuckets(exclude);
  let html = '';
  if (b.today.length) html += groupLabel('Today', leftText(b.today)) + limitedRows('today', b.today);
  if (b.tomorrow.length) html += groupLabel('Tomorrow, ' + weekday(1), leftText(b.tomorrow)) + limitedRows('tomorrow', b.tomorrow, false);
  if (b.later.length) html += groupLabel('Later', leftText(b.later)) + limitedRows('later', b.later);
  html += anytimeRows(b.anytime);
  return `<div class="sec"><div class="lab" style="margin:0 0 6px">To-dos</div><div class="card quiet${lookState.hideScores ? ' hide' : ''}">${html}</div></div>`;
}

// ---- 2A Spotlight = costliest ---------------------------------------------------------------

function lookA() {
  const spot = pickSpotlight();
  return spotlightSection(spot)
    + `<div class="sec" style="margin-bottom:14px">${classStrip()}${nowGray()}</div>`
    + quietTodos(spot.items);
}

/** The top of 2A, for the intro slide art (1.3 slide 1). */
export function lookATopArt() {
  const spot = pickSpotlight();
  return spotlightSection(spot) + classStrip();
}

// ---- 2B Spotlight = classes -----------------------------------------------------------------

/** Class ids in HAC period order: A day periods, then B day, then anything else. */
function periodOrder() {
  const ids = BELL_SCHEDULE.A.concat(BELL_SCHEDULE.B).map(p => p.classId);
  return course => {
    const i = ids.indexOf(course.id);
    return i < 0 ? 99 : i;
  };
}

function lookB() {
  const order = periodOrder();
  const classes = visibleClasses().slice().sort((a, b) => order(a) - order(b));
  const now = currentPeriod();
  const missingByClass = {};
  missingItems().filter(item => !isDone(item)).forEach(item => (missingByClass[item.classId] = (missingByClass[item.classId] || 0) + 1));

  const rows = classes.map(course => {
    const average = periodAverage(course);
    const missing = missingByClass[course.id];
    const tag = missing ? ` <span class="tag">${missing} missing</span>` : '';
    const isNow = now && now.period.id === course.id;
    const nowText = isNow
      ? `<div class="s nowtag" data-live>Now, ${now.minutesLeft} min left${now.next ? '. Next: ' + escapeHtml(now.next.room) : ''}</div>`
      : '';
    const grade = average == null ? '<div class="nog">No grade</div>'
      : lookState.hideScores ? '' : `<div class="avg">${oneDecimal(average)}</div>`;
    return `<div class="row cls1${isNow ? ' now1' : ''}" role="button" tabindex="0" ${actionAttrs('openPage', 'class', course.id)}>`
      + `<div class="grow"><div class="t">${escapeHtml(shortName(course))}${tag}</div>${nowText}</div>${grade}${CHEVRON}</div>`;
  }).join('');

  const b = todoBuckets([]);
  const week = b.tomorrow.concat(b.later.filter(item => item.due <= 7));
  const beyond = b.later.filter(item => item.due > 7);
  let todos = groupLabel('Today', leftText(b.today)) + b.today.map(item => todoRow(item, showDateFor(item))).join('');
  if (lookState.expanded.coming) {
    todos += groupLabel('Coming up', `<span role="button" ${actionAttrs('expandGroup', 'coming')}>Hide</span>`)
      + week.concat(beyond).map(item => todoRow(item, showDateFor(item) || item.due === 1)).join('');
  } else if (week.length || beyond.length) {
    const openWeek = week.filter(item => !isDone(item)).length;
    todos += `<div class="row more" role="button" tabindex="0" ${actionAttrs('expandGroup', 'coming')}>`
      + `<div class="grow s">${openWeek} this week${beyond.length ? `, ${beyond.length} later` : ''}</div>${CHEVRON}</div>`;
  }
  todos += anytimeRows(b.anytime);

  return `<div class="sec"><div class="lab" style="margin:0 0 6px">Your classes, ${state.period}</div>`
    + `<div class="card">${rows}</div></div>`
    + `<div class="sec"><div class="lab" style="margin:0 0 6px">To-dos</div><div class="card quiet${lookState.hideScores ? ' hide' : ''}">${todos}</div></div>`;
}

// ---- 2C Spotlight = what changed ------------------------------------------------------------

/**
 * Faked "since you last looked" diff: the sample's seen changes (SEEN_CHANGES, already in
 * state.gradeChanges, newest first) plus any score a refresh brought in. The real diff is slice 6.
 */
function sinceLastLooked() {
  const hide = lookState.hideScores;
  if (DEMO === 'firstopen') {
    const graded = visibleClasses().filter(course => periodAverage(course) != null).length;
    const missing = missingItems().filter(item => !isDone(item)).length;
    // One line, so it does not compete with the missing card under it.
    return `<div class="sec" style="margin-bottom:16px"><div class="lab">First update from your gradebook</div>`
      // The missing card right under it already says "2 missing", so only say it here when there is none.
      + `<div class="t" style="font-size:20px;margin-top:2px">${graded} classes in.${missing ? '' : ' Nothing missing.'}</div></div>`;
  }
  const changes = DEMO === 'nothingnew'
    ? state.gradeChanges.filter(change => change.when === 'Just now')
    : state.gradeChanges;
  if (!changes.length) {
    return `<div class="sec" style="margin-bottom:16px"><div class="upd" style="font-size:15px">No new grades since ${SAMPLE_LAST_OPEN}</div></div>`;
  }
  const rows = changes.slice(0, 3).map(change => {
    const course = findClass(change.classId);
    const delta = change.after - change.before;
    const direction = Math.abs(delta) < 0.05 ? 'no change' : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}`;
    const title = hide ? `${escapeHtml(change.title)} posted` : `${escapeHtml(change.title)}, ${change.scoreText}`;
    const sub = hide ? `${escapeHtml(shortName(course))}, ${change.when}`
      : `${escapeHtml(shortName(course))} now ${oneDecimal(change.after)}, ${direction}. ${change.when}`;
    return `<div class="row" role="button" tabindex="0" ${actionAttrs('openPage', 'class', change.classId)}>`
      + `<div class="grow"><div class="t" style="font-size:16px">${title}</div><div class="s">${sub}</div></div>${CHEVRON}</div>`;
  }).join('');
  const all = `<div class="row more" role="button" tabindex="0" ${actionAttrs('openPage', 'changes')}>`
    + `<div class="grow s">All changes${changes.length > 3 ? `, ${changes.length - 3} more` : ''}</div>${CHEVRON}</div>`;
  const count = changes.length;
  return `<div class="sec">${heading('Since you last looked', `${countWord(count)} new `, count === 1 ? 'grade' : 'grades', { big: 1 })}`
    + `<div class="card">${rows}${all}</div></div>`;
}

function lookC() {
  const spot = pickSpotlight();
  const missing = spot.kind === 'missing' ? spotlightSection(spot) : '';
  return sinceLastLooked() + missing
    + `<div class="sec" style="margin-bottom:14px">${nowGray()}</div>`
    + quietTodos(spot.kind === 'missing' ? spot.items : []);
}

// ---- Entry points ---------------------------------------------------------------------------

export function homeLookView() {
  if (HOME_LOOK === 'h4') return lookH4();
  if (HOME_LOOK === 'h1') return lookH1();
  if (HOME_LOOK === 'h2') return lookH2();
  if (HOME_LOOK === 'h3') return lookH2(true);
  if (HOME_LOOK === 'b') return lookB();
  if (HOME_LOOK === 'c') return lookC();
  return lookA();
}

/** ?demo=allclear: tick off missing work and everything due today, so 2A shows its all clear state. */
export function applyDemoState() {
  if (DEMO !== 'allclear') return;
  missingItems().concat(absentItems()).forEach(item => (state.doneIds[item.id] = 1));
  homeTodos().filter(item => item.due != null && item.due <= 0).forEach(item => (state.doneIds[item.id] = 1));
}

// ---- Round 2, rule 13: Home shows only real HAC facts (points and counts, no cost numbers) ----

/** Score as a short fact: "72" on a 100 point row, otherwise "18/20". */
const scoreShort = row => (row.total === 100 ? String(row.score) : `${row.score}/${row.total}`);

/**
 * h1: "Latest: Unit 3 Test 72, Algebra II now 76.9", from the newest scored row by its
 * assignment date. No diff engine: it is simply the most recent date in the gradebook.
 */
function latestLine() {
  let latest = null;
  for (const course of visibleClasses()) {
    for (const row of course.rows || []) {
      if (isScored(row) && row.due != null && (!latest || row.due > latest.row.due)) latest = { course, row };
    }
  }
  if (!latest) return '';
  const { course, row } = latest;
  const text = lookState.hideScores
    ? `Latest: ${escapeHtml(row.title)} posted, ${escapeHtml(shortName(course))}`
    : `Latest: ${escapeHtml(row.title)} ${scoreShort(row)}, ${escapeHtml(shortName(course))} now ${oneDecimal(periodAverage(course))}`;
  return `<div class="upd">${text}</div>`;
}

/** h1 card rows: missing and absent work, most points first, then oldest due date. */
function zeroItems() {
  return missingItems().concat(absentItems()).filter(item => !isDone(item))
    .sort((a, b) => b.points - a.points || (a.dueSort ?? a.due) - (b.dueSort ?? b.due));
}

/** "2 missing, 1 absent" from counts only. */
function countsText(items) {
  return [[items.filter(item => !item.kind).length, 'missing'],
    [items.filter(item => item.kind === 'absent').length, 'absent'],
    [items.filter(item => item.kind === 'incomplete').length, 'incomplete']]
    .filter(([n]) => n).map(([n, word]) => `${n} ${word}`).join(', ');
}

/** "2 missing, 1 absent" style headline from counts only. */
function countsHeading(items, label, hide) {
  const missing = items.filter(item => !item.kind).length;
  const absent = items.filter(item => item.kind === 'absent').length;
  const incomplete = items.filter(item => item.kind === 'incomplete').length;
  const parts = [[missing, 'missing'], [absent, 'absent'], [incomplete, 'incomplete']].filter(([n]) => n)
    .map(([n, word]) => `${n} ${word}`);
  const lead = parts.length > 1 ? parts.slice(0, -1).join(', ') + ', ' : parts[0].split(' ')[0] + ' ';
  const accent = parts.length > 1 ? parts[parts.length - 1] : parts[0].split(' ').slice(1).join(' ');
  return heading(label, lead, accent, { urgent: !hide, big: 1 });
}

function lookH1() {
  const hide = lookState.hideScores;
  const items = zeroItems();
  let top;
  if (items.length) {
    top = `<div class="sec" style="margin-bottom:12px">${countsHeading(items, 'Counts as 0 in your gradebook', hide)}`
      + `<div class="card${hide ? ' hide' : ''}">${items.map(zeroTodoRow).join('')}</div></div>`;
  } else {
    top = spotlightSection(pickSpotlight());
  }
  return top
    + `<div class="sec" style="margin-bottom:14px">${classStrip()}${nowGray()}</div>`
    + quietTodos(items);
}

/** h2 arrow: the average now vs the one shown at the last open (sample values). */
function trendArrow(course, average) {
  const last = SAMPLE_LAST_AVERAGE[course.id];
  if (last == null || average == null || Math.abs(average - last) < 0.05) return '';
  return average > last
    ? '<span class="trend" aria-label="Up since you last looked">▲</span>'
    : '<span class="trend" aria-label="Down since you last looked">▼</span>';
}

/** One tappable folded row that expands a to-do group in place. */
const foldRow = (key, text) => `<div class="row more" role="button" tabindex="0" ${actionAttrs('expandGroup', key)}>`
  + `<div class="grow s">${text}</div>${CHEVRON}</div>`;

/** h2 is the class list; h3 is the same plus one red counts row on top (only when there is any). */
function lookH2(withZeroRow = false) {
  const hide = lookState.hideScores;
  const order = periodOrder();
  const classes = visibleClasses().slice().sort((a, b) => order(a) - order(b));
  const now = currentPeriod();
  const zeros = missingItems().concat(absentItems()).filter(item => !isDone(item));
  const countFor = (id, kind) => zeros.filter(item => item.classId === id && item.kind === kind).length;

  const rows = classes.map(course => {
    const average = periodAverage(course);
    const tags = [[countFor(course.id, undefined), 'missing'], [countFor(course.id, 'absent'), 'absent'],
      [countFor(course.id, 'incomplete'), 'incomplete']]
      .filter(([n]) => n).map(([n, word]) => ` <span class="tag">${n} ${word}</span>`).join('');
    const isNow = now && now.period.id === course.id;
    const nowText = isNow
      ? `<div class="s nowtag" data-live>Now, ${now.minutesLeft} min left${now.next ? '. Next: ' + escapeHtml(now.next.room) : ''}</div>`
      : '';
    let grade = '';
    if (average == null) grade = '<div class="nog">No grade</div>';
    else if (!hide) grade = `${trendArrow(course, average)}<div class="avg">${oneDecimal(average)}</div>`;
    return `<div class="row cls1${isNow ? ' now1' : ''}" role="button" tabindex="0" ${actionAttrs('openPage', 'class', course.id)}>`
      + `<div class="grow"><div class="t">${escapeHtml(shortName(course))}${tags}</div>${nowText}</div>${grade}${CHEVRON}</div>`;
  }).join('');

  // Missing and absent work is on the class tags, so the folded to-dos are everything else.
  const b = todoBuckets(missingItems());
  const week = b.tomorrow.concat(b.later.filter(item => item.due <= 7));
  const beyond = b.later.filter(item => item.due > 7);
  let todos = '';
  if (lookState.expanded.today) {
    todos += groupLabel('Today', `<span role="button" ${actionAttrs('expandGroup', 'today')}>Hide</span>`)
      + b.today.map(item => todoRow(item, showDateFor(item))).join('');
  } else if (b.today.length) {
    todos += foldRow('today', `Today, ${leftText(b.today)}`);
  }
  if (lookState.expanded.coming) {
    todos += groupLabel('Coming up', `<span role="button" ${actionAttrs('expandGroup', 'coming')}>Hide</span>`)
      + week.concat(beyond).map(item => todoRow(item, showDateFor(item) || item.due === 1)).join('');
  } else if (week.length || beyond.length) {
    const openWeek = week.filter(item => !isDone(item)).length;
    todos += foldRow('coming', `${openWeek} this week${beyond.length ? `, ${beyond.length} later` : ''}`);
  }
  todos += anytimeRows(b.anytime);

  let zeroRow = '';
  if (withZeroRow && zeros.length) {
    // Opens the Missing work page (the app has one; it lists missing rows, not ABS).
    zeroRow = `<div class="sec" style="margin-bottom:16px"><div class="card${hide ? ' hide' : ''}">`
      + `<div class="row zero" role="button" tabindex="0" ${actionAttrs('openPage', 'missingEffect')}>`
      + `<div class="grow t">${countsText(zeros)}</div>${CHEVRON}</div></div></div>`;
  }
  return zeroRow + `<div class="sec"><div class="lab" style="margin:0 0 6px">Your classes, ${state.period}</div>`
    + `<div class="card">${rows}</div></div>`
    + `<div class="sec"><div class="lab" style="margin:0 0 6px">To-dos</div><div class="card quiet${lookState.hideScores ? ' hide' : ''}">${todos}</div></div>`;
}

// ---- Final round: h4 (council pick) --------------------------------------------------------

/**
 * h4 Latest line: the newest grade change in the log that moved a class average (the alert log,
 * state.gradeChanges, newest first). Tapping it opens What changed.
 */
function latestMovedLine() {
  const change = state.gradeChanges.find(entry => Math.abs(entry.after - entry.before) >= 0.05);
  if (!change) return '';
  const course = findClass(change.classId);
  const text = lookState.hideScores
    ? 'New grades posted'
    : `Latest: ${escapeHtml(change.title)} ${escapeHtml(change.scoreText.replace(/ \/ 100$/, ''))}, `
      + `${escapeHtml(shortName(course))} now ${oneDecimal(change.after)}`;
  return `<div class="upd" role="button" tabindex="0" ${actionAttrs('openPage', 'changes')}>${text}${CHEVRON}</div>`;
}

/** "2 missing, 1 absent": missing in red, absent in gray. */
function zeroRowText(items) {
  const missing = items.filter(item => !item.kind).length;
  const others = [['absent', items.filter(item => item.kind === 'absent').length],
    ['incomplete', items.filter(item => item.kind === 'incomplete').length]].filter(([, n]) => n);
  const parts = [];
  if (missing) parts.push(`<span class="u">${missing} missing</span>`);
  others.forEach(([word, n]) => parts.push(`<span class="g">${n} ${word}</span>`));
  return parts.join('<span class="g">, </span>');
}

/**
 * h4 missing card: ONE row at body size, then every item inline, so Home does not depend on the
 * Missing page. Hide scores: the row just says "Missing work", gray, folded until tapped.
 */
function zeroCard(items) {
  const hide = lookState.hideScores;
  if (hide) {
    const open = lookState.expanded.zero;
    return `<div class="sec" style="margin-bottom:12px"><div class="card hide">`
      + `<div class="row zero4" role="button" tabindex="0" ${actionAttrs('expandGroup', 'zero')}>`
      + `<div class="grow t"><span class="g">Missing work</span></div>${open ? '<span class="chev">⌃</span>' : CHEVRON}</div>`
      + (open ? items.map(zeroTodoRow).join('') : '') + `</div></div>`;
  }
  return `<div class="sec" style="margin-bottom:12px"><div class="card">`
    + `<div class="row zero4" role="button" tabindex="0" ${actionAttrs('openPage', 'missingEffect')}>`
    + `<div class="grow t">${zeroRowText(items)}</div>${CHEVRON}</div>`
    + items.map(zeroTodoRow).join('') + `</div></div>`;
}

function lookH4() {
  const items = zeroItems();
  let top = '';
  if (DEMO === 'firstopen') {
    const graded = visibleClasses().filter(course => periodAverage(course) != null).length;
    top = `<div class="sec" style="margin-bottom:14px"><div class="lab">First update from your gradebook</div>`
      + `<div class="t" style="font-size:20px;margin-top:2px">${graded} classes in.</div></div>`;
  }
  top += items.length ? zeroCard(items) : (DEMO === 'firstopen' ? '' : spotlightSection(pickSpotlight()));
  return top
    + `<div class="sec" style="margin-bottom:14px">${classStrip()}${nowGray()}</div>`
    + quietTodos(items);
}

/** h4 Missing work page: missing and absent rows as gradebook facts. No "costs you" numbers. */
export function missingPageView() {
  const items = missingItems().concat(absentItems());
  if (!items.length) return `<div class="sec">${heading('', 'Nothing ', 'missing', { big: 1 })}</div>`;
  return `<div class="sec">${heading('Missing and absent work counts as 0 in your grade', 'Missing ', 'work')}`
    + `<div class="card">${zeroItems().concat(items.filter(isDone)).map(zeroTodoRow).join('')}</div>`
    + `<div class="foot">To see a score you expect, type it in What if.</div></div>`;
}
