/**
 * Alerts page, redone 11/9 as three looks the student picks from (?alerts=needs|inbox|class).
 *
 *   needs  "Needs you"   only what is open right now: a zero, a test under the retest line, a class under his
 *                        number. Each row has one next step and clears itself. Empty is the good state.
 *   inbox  "Inbox"       every alert newest first, grouped by day, new ones marked, a rule tag on each.
 *   class  "By class"    the rules as switches on top, then one card per class with where it stands.
 *
 * All three read the same things: the grade change log, the gradebook rows, and the rules in Settings.
 * Alerts never hold their own copy of a grade. Home's bell badge asks alertBadge() for its number.
 */
import { escapeHtml, oneDecimal, signed, relativeDay, longDate } from '../format.js';
import { countsAsZero } from '../grade-math.js';
import { ALERT_EXTRAS, ALERT_CLEARED, CLASSES } from '../sample-data.js';
import { state, findClass, periodAverage, isUnderRetestLine, isMissing, findRow } from '../state.js';
import { actionAttrs, heading, navRow, toggle, CHEVRON } from './components.js';

const params = new URLSearchParams(location.search);
const LOOK = ['needs', 'inbox', 'class'].includes(params.get('alerts')) ? params.get('alerts') : 'needs';
if (params.get('hac') === '1') state.hacDown = true;

const shortName = course => course.name.replace(/ Honors$/, '');
const numbers = text => (state.hideScores ? '' : text);

// ---- What is open right now ---------------------------------------------------------------

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
      if (rules.newGrade && isUnderRetestLine(row)) {
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

// ---- Everything that happened --------------------------------------------------------------

const TAGS = { newGrade: 'New grade', under: 'Under your line', zero: 'Zero', changed: 'Score changed' };

/** Alert history newest first. Muted classes and switched off rules are left out. */
function events() {
  const list = [];
  for (const change of state.gradeChanges) {
    const course = findClass(change.classId);
    const crossed = change.before >= state.alertUnder && change.after < state.alertUnder;
    list.push({
      kind: crossed ? 'under' : 'newGrade', classId: course.id, day: change.day, when: change.when,
      title: change.title, line: `${shortName(course)}. ${numbers(change.scoreText.replace(/ \/ 100$/, ''))}`
        + (crossed ? ` Average now under your ${state.alertUnder}.` : ''),
      delta: change.after - change.before, down: change.after < change.before,
    });
  }
  for (const course of CLASSES) {
    for (const row of course.rows) {
      if (!countsAsZero(row)) continue;
      list.push({
        kind: 'zero', classId: course.id, rowId: row.id, day: row.due, when: relativeDay(row.due), title: row.title,
        line: `${shortName(course)}. ${isMissing(row) ? 'Marked missing' : row.mark === 'INC' ? 'Marked incomplete' : 'Marked absent'}, counts as zero.`,
        delta: null, down: true,
      });
    }
  }
  for (const extra of ALERT_EXTRAS) {
    const course = findClass(extra.classId);
    list.push({
      kind: extra.kind, classId: course.id, day: extra.day, when: relativeDay(extra.day), title: extra.title,
      line: `${shortName(course)}. ${numbers(`Teacher changed ${extra.from} to ${extra.to} out of ${extra.total}.`) || 'Teacher changed the score.'}`,
      delta: null, down: extra.to < extra.from,
    });
  }
  const rank = { under: 0, newGrade: 1, zero: 2, changed: 3 };
  return list
    .filter(item => state.alertRules[item.kind] && !state.mutedClasses[item.classId])
    .sort((a, b) => b.day - a.day || rank[a.kind] - rank[b.kind]);
}

/** The number on Home's bell. Inbox counts what is new; the other two count what is open. */
export function alertBadge() {
  return LOOK === 'inbox' ? Math.min(state.alertsUnread, events().length) : LOOK === 'class' ? needsYou().length : needsYouFolded().length;
}

// ---- Pieces --------------------------------------------------------------------------------

function checkedText() {
  const minutes = Math.floor((Date.now() - (state.lastUpdated ?? state.openedAt)) / 6e4);
  return minutes < 1 ? 'Checked just now' : `Checked ${minutes} min ago`;
}

/** Only shown when the phone could not read the gradebook. Otherwise the page stays quiet about it. */
function hacBanner() {
  if (!state.hacDown) return '';
  return `<div class="card al-warn"><div class="row"><div class="grow"><div class="t">Can't read your gradebook</div>`
    + `<div class="s">Sign in again to keep alerts coming. Last good check, Tuesday 7:48 AM.</div></div>`
    + `<button class="pill" ${actionAttrs('signOut')}>Sign in</button></div></div>`;
}

const rulesLink = () => `<div class="card al-foot">${navRow('Alert rules', 'What sends an alert, your number, muted classes', 'openPage', 'settings')}</div>`;

// ---- Look 1: Needs you -----------------------------------------------------------------------

function needsView() {
  const items = needsYouFolded();
  const rows = items.map(item => `<div class="row al-need${item.urgent ? ' u' : ''}">`
    + `<b class="al-dot${item.urgent ? ' u' : ''}"></b>`
    + `<div class="grow"><div class="t">${escapeHtml(item.title)}</div><div class="s">${escapeHtml(item.line)}</div></div>`
    + `<button class="pill" ${item.action}>${item.step}</button></div>`).join('');
  const body = items.length
    ? `<div class="card">${rows}</div>`
    : `<div class="card al-empty"><div class="t">Nothing needs you.</div>`
      + `<div class="s">New grades still show up under What changed.</div></div>`;
  const cleared = ALERT_CLEARED.map(entry => `<div class="row"><span class="al-check">✓</span>`
    + `<div class="grow"><div class="t">${escapeHtml(shortName(findClass(entry.classId)))}</div>`
    + `<div class="s">${entry.text}, ${relativeDay(entry.day).toLowerCase()}</div></div></div>`).join('');
  return `<div class="sec">${hacBanner()}`
    + heading(checkedText(), items.length ? 'Needs ' : 'All ', items.length ? 'you' : 'clear', { big: 1 })
    + body + `</div>`
    + `<div class="sec"><div class="lab" style="margin:0 0 6px">Cleared this week</div><div class="card quiet">${cleared}</div></div>`
    + `<div class="card al-foot">${navRow('What changed', 'Every new grade, newest first', 'openPage', 'changes')}`
    + navRow('Alert rules', 'What sends an alert, your number, muted classes', 'openPage', 'settings') + `</div>`;
}

// ---- Look 2: Inbox ---------------------------------------------------------------------------

function inboxView() {
  const list = events();
  let html = '';
  let lastDay;
  list.forEach((item, index) => {
    if (item.day !== lastDay) {
      html += `${lastDay === undefined ? '' : '</div>'}<div class="lab al-day">${item.day === 0 ? 'Today' : item.day === -1 ? 'Yesterday' : longDate(item.day)}</div><div class="card">`;
      lastDay = item.day;
    }
    const fresh = index < state.alertsUnread;
    const delta = item.delta != null && !state.hideScores
      ? `<div class="al-delta${item.down ? ' u' : ''}">${signed(item.delta)}</div>` : '';
    const hot = item.kind === 'under' || item.kind === 'zero';
    html += `<div class="row al-in${fresh ? ' new' : ''}" role="button" tabindex="0" ${item.rowId ? actionAttrs('openPage', 'assignment', item.rowId) : actionAttrs('openPage', 'class', item.classId)}>`
      + `<b class="al-new${fresh ? ' on' : ''}${hot ? ' u' : ''}"></b>`
      + `<div class="grow"><div class="al-tag${item.kind === 'under' || item.kind === 'zero' ? ' u' : ''}">${TAGS[item.kind]}</div>`
      + `<div class="t">${escapeHtml(item.title)}</div><div class="s">${escapeHtml(item.line)}</div></div>${delta}</div>`;
  });
  if (lastDay !== undefined) html += '</div>';
  return `<div class="sec">${hacBanner()}`
    + heading(checkedText(), 'Your ', 'alerts', { big: 1 }) + (html || `<div class="card al-empty"><div class="t">No alerts yet.</div>`
      + `<div class="s">When a grade changes, it shows up here.</div></div>`) + `</div>`
    + `<div class="foot" style="padding-top:0">That is everything so far.</div>` + rulesLink();
}

// ---- Look 3: By class --------------------------------------------------------------------------

function classView() {
  const open = needsYou().filter(item => item.kind !== 'under');
  const history = events();
  const rules = [['newGrade', 'New grades'], ['under', 'Under my number'], ['zero', 'Zero or missing'], ['changed', 'Score changed']];
  const ruleRows = rules.map(([key, label]) => `<div class="row"><div class="grow t" style="font-size:15.5px">${label}</div>`
    + (key === 'under' ? `<input class="f" type="number" inputmode="decimal" aria-label="Alert under" value="${state.alertUnder}" data-input="alertUnder">` : '')
    + `${toggle(state.alertRules[key], 'toggleAlertRule', key)}</div>`).join('');
  const cards = [];
  const quiet = [];
  for (const course of CLASSES) {
    if (!course.rows.length || state.hiddenClasses[course.id]) continue;
    const mine = open.filter(item => item.classId === course.id);
    const recent = history.filter(item => item.classId === course.id && item.kind !== 'zero').slice(0, 2);
    const average = periodAverage(course);
    if (!mine.length && !recent.length && !(average != null && average < state.alertUnder)) { quiet.push(shortName(course)); continue; }
    const isUnder = average != null && state.alertRules.under && average < state.alertUnder;
    const status = isUnder ? `Under your ${state.alertUnder}` : mine.length ? `${mine.length} open` : 'All good';
    cards.push(`<div class="card al-cls"><div class="row" role="button" tabindex="0" ${actionAttrs('openPage', 'class', course.id)}>`
      + `<div class="grow"><div class="t">${escapeHtml(shortName(course))}</div>`
      + `<div class="s${isUnder || mine.length ? ' al-red' : ''}">${status}${state.mutedClasses[course.id] ? ', muted' : ''}</div></div>`
      + `${average != null && !state.hideScores ? `<div class="al-avg">${oneDecimal(average)}</div>` : ''}${CHEVRON}</div>`
      + mine.map(item => `<div class="row al-sub"><div class="grow"><div class="t">${escapeHtml(item.title)}</div>`
        + `<div class="s">${escapeHtml(item.rest)}</div></div><button class="pill" ${item.action}>${item.step}</button></div>`).join('')
      + recent.map(item => `<div class="row al-sub quiet"><div class="grow"><div class="s">${TAGS[item.kind]}: ${escapeHtml(item.title)}</div></div></div>`).join('')
      + `</div>`);
  }
  return `<div class="sec">${hacBanner()}${heading(checkedText(), 'By ', 'class', { big: 1 })}`
    + cards.join('')
    + (quiet.length ? `<div class="foot al-quiet">Quiet: ${quiet.join(', ')}.</div>` : '') + `</div>`
    + `<div class="sec"><div class="lab" style="margin:0 0 6px">Alert me when</div><div class="card">${ruleRows}</div></div>`
    + `<div class="card al-foot">${navRow('Muted classes', 'Turn a class off in Settings', 'openPage', 'settings')}</div>`;
}

export function alertsView() {
  return LOOK === 'inbox' ? inboxView() : LOOK === 'class' ? classView() : needsView();
}
