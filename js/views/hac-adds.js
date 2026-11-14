/**
 * What more of HAC adds (js/hac-adds-store.js), only on real grades and only when the phone has
 * HAC's page for it. Nothing here is ever sample or guessed; with no page, nothing shows.
 *
 *   Attendance page   days HAC shows as Unresolved Absence first (a note from home clears them),
 *                     then every day with a code (period + HAC's word), then absences and tardies
 *                     per class from the report card. Periods are never turned into class names:
 *                     on A/B days one period number is two classes.
 *   Grades tab        an Attendance row, and one small Graduation credits card.
 *   Calendar tab      assignments teachers posted in HAC, due today or later (calendarItems).
 *   Home              one quiet line when something posted in HAC is due tomorrow.
 */
import { escapeHtml, offsetOf, SAMPLE_TODAY } from '../format.js';
import { real } from '../real-data.js';
import { CLASSES } from '../sample-data.js';
import { state, todoItems } from '../state.js';
import {
  adds, attendanceDays, unresolvedDays, hasAttendance, creditsCard, rowExtras, dropFlagMeans,
} from '../hac-adds-store.js';
import { makeUpText } from '../makeup.js';
import { dateAt } from '../format.js';
import { actionAttrs, heading, CHEVRON } from './components.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fromIso = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** "2026-10-14" -> "Wed, Oct 14" */
const dayText = iso => {
  const date = fromIso(iso);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tardyWord = n => (n === 1 ? '1 tardy' : `${n} tardies`);
const absenceWord = n => (n === 1 ? '1 absence' : `${n} absences`);

/** "1\nTardy\n8:58:00 AM" style marks -> "P1 Tardy 8:58 AM, P2 P3 Excused Absence Parent Note". */
function marksText(marks) {
  const groups = [];
  for (const mark of marks) {
    const time = mark.time ? ' ' + mark.time.replace(/:00(\s*[AP]M)$/i, '$1') : '';
    const label = mark.code + time;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.periods.push(mark.period);
    else groups.push({ label, periods: [mark.period] });
  }
  return groups.map(group => {
    const periods = group.periods.filter(Boolean).map(p => 'P' + p).join(' ');
    return (periods ? periods + ' ' : '') + group.label;
  }).join(', ');
}

const periodsText = marks => {
  const periods = marks.filter(mark => mark.kind === 'unresolved' && mark.period).map(mark => mark.period);
  if (!periods.length) return 'All day';
  return (periods.length === 1 ? 'Period ' : 'Periods ') + periods.join(', ');
};

const KIND_COLOR = { unresolved: 'var(--urgent)', absent: 'var(--ink)', tardy: 'var(--ink)', early: 'var(--ink)' };

// ---- Attendance ---------------------------------------------------------------------------

export const showAttendance = () => real.on && hasAttendance();

/** Grades tab row: "4 days need a note" in red when HAC shows any, else a quiet count. */
export function attendanceEntry() {
  if (!showAttendance()) return '';
  const open = unresolvedDays().length;
  let sub;
  if (open) sub = `<span style="color:var(--urgent);font-weight:700">${open === 1 ? '1 day needs' : open + ' days need'} a note</span>`;
  else {
    const days = attendanceDays();
    const tardies = days.reduce((n, day) => n + day.marks.filter(mark => mark.kind === 'tardy').length, 0);
    const absent = days.filter(day => day.marks.some(mark => mark.kind === 'absent')).length;
    sub = [absent ? plural(absent, 'day') + ' absent' : '', tardies ? tardyWord(tardies) : ''].filter(Boolean).join(', ')
      || 'Nothing marked this year';
  }
  return `<div class="sec" style="margin-top:16px"><div class="card">`
    + `<div class="row more" role="button" tabindex="0" ${actionAttrs('openPage', 'attendance')}>`
    + `<div class="grow"><div class="t" style="font-size:15.5px">Attendance</div><div class="s">${sub}</div></div>${CHEVRON}</div>`
    + `</div></div>`;
}

export function attendanceView() {
  if (!hasAttendance()) {
    return `<div class="sec">${heading('From HAC', 'No attendance ', 'yet', { big: 1 })}`
      + `<div class="foot">HAC hasn't sent attendance to this phone yet.</div></div>`;
  }
  let html = '';
  const open = unresolvedDays();
  if (open.length) {
    html += `<div class="sec">${heading('HAC shows these as Unresolved Absence', open.length === 1 ? '1 day needs a ' : open.length + ' days need a ', 'note', { urgent: 1 })}`
      + `<div class="card">${open.slice().reverse().map(day => `<div class="row">`
        + `<div class="grow"><div class="t">${dayText(day.date)}</div><div class="s">${escapeHtml(periodsText(day.marks))}</div></div>`
        + `<div class="s" style="font-weight:700;color:var(--urgent);white-space:nowrap">Unresolved</div></div>`).join('')}</div>`
      + `<div class="foot">Turn in a note from home before it counts unexcused.</div></div>`;
  }

  const days = attendanceDays();
  const months = Object.keys(adds.att.months).sort();
  const span = months.length
    ? `${MONTHS[+months[0].slice(5) - 1]} to ${MONTHS[+months[months.length - 1].slice(5) - 1]}`
    : '';
  if (days.length) {
    html += `<div class="sec">${heading(span ? 'HAC, ' + span : 'From HAC', 'Every ', 'day')}`
      + `<div class="card">${days.map(day => {
        const worst = ['unresolved', 'absent', 'early', 'tardy'].find(kind => day.marks.some(mark => mark.kind === kind));
        return `<div class="row"><div class="grow"><div class="t">${dayText(day.date)}</div>`
          + `<div class="s" style="${worst ? `color:${KIND_COLOR[worst]}` : ''}">${escapeHtml(marksText(day.marks))}</div></div></div>`;
      }).join('')}</div></div>`;
  } else if (months.length) {
    html += `<div class="sec">${heading(span ? 'HAC, ' + span : 'From HAC', 'Nothing ', 'marked')}</div>`;
  }

  const rc = adds.att.rc;
  if (rc && rc.classes.length) {
    const run = rc.runs.length ? rc.runs[rc.runs.length - 1] : '';
    html += `<div class="sec">${heading(run ? `${run} report card, year so far` : 'Report card, year so far', 'By ', 'class')}`
      + `<div class="card">${rc.classes.map(course => {
        const parts = [course.ytdAbs ? absenceWord(course.ytdAbs) : '', course.ytdTdy ? tardyWord(course.ytdTdy) : ''].filter(Boolean);
        return `<div class="row"><div class="grow"><div class="t">${escapeHtml(className(course.course))}</div>`
          + `<div class="s">Period ${escapeHtml(course.period)}</div></div>`
          + `<div class="s" style="font-weight:700;color:var(--ink);white-space:nowrap">${parts.join(', ') || 'None'}</div></div>`;
      }).join('')}</div>`
      + `<div class="foot">Counts as of the last report card. Days after it are in the list above.</div></div>`;
  }
  return html;
}

/** "Algebra 1 S1" -> "Algebra 1" */
const className = name => String(name || '').replace(/\s+S[12]$/, '').trim();

// ---- What you still owe ------------------------------------------------------------------

/** Row offset -> HAC's due text "10/27/2026", for joining Classwork extras. */
const hacDue = offset => {
  if (offset == null) return '';
  const d = dateAt(offset);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

/** HAC's comment and drop flag for a real row, or null. */
export function extrasFor(course, row) {
  if (!course || !course.real || !course.code) return null;
  return rowExtras(course.code, String(row.title).replace(/\s*\*\s*$/, ''), hacDue(row.due))
    || rowExtras(course.code, row.title, hacDue(row.due));
}

/**
 * Lines under an owed row on real grades: "Make it up: ...", the teacher's comment, and "Can't be
 * dropped" / "Can be dropped" only when HAC's page has both answers (Frisco marks every row Y,
 * which tells nothing). '' when there is nothing to add.
 */
export function oweExtras(course, rowId, className) {
  if (!real.on || !course || !course.real || state.hideScores) return '';
  const row = course.rows.find(entry => entry.id === rowId);
  if (!row) return '';
  const lines = [];
  const make = makeUpText(course, row, className || course.name);
  if (make) lines.push(`<div class="s mk">${escapeHtml(make)}</div>`);
  const extra = extrasFor(course, row);
  if (extra && extra.comment) lines.push(`<div class="s">Teacher: ${escapeHtml(extra.comment)}</div>`);
  if (extra && dropFlagMeans() && extra.drop != null) lines.push(`<div class="s">${extra.drop ? 'Can be dropped' : "Can't be dropped"}</div>`);
  return lines.join('');
}

// ---- Graduation credits -------------------------------------------------------------------

const creditText = n => (Math.round(n * 10) / 10).toString();

/** One small card on Grades: earned of needed per subject, from HAC's plan, checked against the transcript. */
export function creditsSection() {
  if (!real.on) return '';
  const card = creditsCard();
  if (!card) return '';
  const subjects = card.plan.subjects.filter(subject => subject.needed > 0);
  const open = subjects.filter(subject => subject.earned < subject.needed);
  const done = subjects.filter(subject => subject.earned >= subject.needed);
  const rows = open.map(subject => {
    const pct = Math.min(100, subject.earned / subject.needed * 100);
    return `<div class="row" style="display:block"><div style="display:flex;gap:8px;align-items:baseline">`
      + `<div class="grow t" style="font-size:14.5px">${escapeHtml(shortSubject(subject.name))}</div>`
      + `<div class="s" style="font-weight:700;color:var(--ink);white-space:nowrap">${creditText(subject.earned)} of ${creditText(subject.needed)}</div></div>`
      + `<div class="cr-bar"><span style="width:${pct}%"></span></div></div>`;
  }).join('');
  const doneRow = done.length
    ? `<div class="row"><div class="grow s">Done: ${escapeHtml(done.map(subject => shortSubject(subject.name)).join(', '))}</div></div>`
    : '';
  return `<div class="sec" style="margin-top:16px"><div class="card">`
    + `<div class="row"><div class="grow t" style="font-size:15.5px">Graduation credits</div>`
    + `<div class="s" style="font-weight:700;color:var(--ink);white-space:nowrap">${creditText(card.earned)} earned</div></div>`
    + rows + doneRow + `</div>`
    + `<div class="foot">${escapeHtml(card.plan.plan)}, from HAC. Classes you're in now count once they're done.</div></div>`;
}

const SUBJECT_SHORT = { 'Physical Education/Equivalent/Athletics': 'PE or athletics', 'Technology Applications': 'Tech apps' };
const shortSubject = name => SUBJECT_SHORT[name] || name;

// ---- Due from HAC's calendar --------------------------------------------------------------

const normCode = code => String(code || '').replace(/\s+/g, ' ').trim();
const normTitle = title => String(title || '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase(); // Classwork titles can end in HAC's hidden "*"

/** "ELA13300A - 2" -> the class on Grades, or null. */
const classFor = code => CLASSES.find(course => course.real && normCode(course.code) === normCode(code)) || null;

/**
 * Assignments teachers already posted in HAC's Calendar, due today or later, as to-do items. Rows
 * already on the Classwork page (same class, title and due day) are left out, so nothing shows twice.
 */
export function hacCalendarItems() {
  if (!real.on || !adds.cal) return [];
  const out = [];
  for (const entry of adds.cal.items) {
    const due = offsetOf(fromIso(entry.due));
    if (due < 0) continue;
    const course = classFor(entry.code);
    if (course && course.rows.some(row => row.due === due && normTitle(row.title) === normTitle(entry.title))) continue;
    const name = course ? course.name : '';
    const bits = [name, entry.category, entry.points != null ? entry.points + ' pts' : ''].filter(Boolean);
    out.push({
      id: entry.id + '@' + entry.due, title: entry.title, detail: bits.join(', '), due,
      source: 'hacCal', category: entry.category, cls: name,
    });
  }
  return out;
}

/** True when the phone has HAC's calendar page at all (so an empty week can say what HAC said). */
export const hasHacCalendar = () => real.on && !!adds.cal;

/** Calendar tab list: every to-do plus HAC's posted assignments, one list. */
export const calendarItems = () => todoItems().concat(hacCalendarItems());

/** Home: one quiet line when something posted in HAC is due tomorrow. Opens the Calendar tab. */
export function tomorrowLine() {
  if (state.hideScores) return '';
  const tomorrow = hacCalendarItems().filter(item => item.due === 1 && !state.doneIds[item.id]);
  if (!tomorrow.length) return '';
  const first = tomorrow[0];
  const more = tomorrow.length - 1;
  const text = `Due tomorrow: ${first.title}${first.cls ? ' in ' + shortClass(first.cls) : ''}${more ? `, ${more} more` : ''}`;
  return `<div class="upd latest" role="button" tabindex="0" ${actionAttrs('openCalendarDay', 1)}>${escapeHtml(text)}${CHEVRON}</div>`;
}

const shortClass = name => name.replace(/ Honors$/, '');

// SAMPLE_TODAY is moved to the real today when real grades load (real-data.js).
export const todayIso = () => {
  const d = SAMPLE_TODAY;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
