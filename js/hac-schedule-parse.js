/**
 * HAC's two schedule pages, pure (string based, no DOM: runs the same in the page, the app and
 * Node, dev/bell-check.mjs).
 *
 * parseDailySchedule: the Daily Schedule popup for one date
 * (/HomeAccess/Content/Student/DailySchedule.aspx?student_id=..&ScheduleDate=MM/DD/YYYY): each
 * period's start and end that day, course, teacher, room. This is where the Bell's times come from.
 *
 * parseHacSchedule: Classes > Schedule (/HomeAccess/Content/Student/Classes.aspx), the whole year.
 * Gives each class's A/B day and the teacher's email (for Email teacher).
 *
 * Input: the page's HTML as text. Output: one entry per row of the schedule table
 * (#plnMain_dgSchedule), as HAC lists it:
 *   { code: 'ELA13300A - 2', course: 'AP English Language S1', period: 3, teacher: 'Avery Brooks',
 *     teacherRaw: 'BROOKS, AVERY', email: 'brooksa@example.org', room: 'Room 100', days: ['B'],
 *     quarters: ['Q1', 'Q2'], building: 'Sample High School', active: true }
 * The course requests table under it (next year's picks) is skipped. String based, no DOM, so it
 * runs the same in the page, the app and Node (dev/bell-check.mjs).
 *
 * Returns null when the page has no schedule table (signed out, or HAC changed the page).
 */

const decode = text => String(text)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const cellText = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "MCALLISTER, JO" -> "Jo McAllister". Keeps Mc, O' and hyphen capitals; no Mr or Ms guessed. */
export function teacherName(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const word = w => w.toLowerCase()
    .replace(/(^|[-' ])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
    .replace(/^Mc([a-z])/, (_, c) => 'Mc' + c.toUpperCase());
  const [last, first] = text.split(',').map(part => part.trim());
  const name = first ? `${first} ${last}` : last;
  return name.split(' ').map(word).join(' ');
}

const list = text => cellText(text).split(/[,\s]+/).filter(Boolean);

export function parseHacSchedule(html) {
  const page = String(html || '');
  const start = page.indexOf('id="plnMain_dgSchedule"');
  if (start < 0) return null;
  const end = page.indexOf('</table>', start);
  const table = page.slice(start, end < 0 ? undefined : end);

  const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  let header = null;
  const out = [];
  for (const row of rows) {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []).map(td => td.replace(/^<td\b[^>]*>|<\/td>$/g, ''));
    if (!cells.length) continue;
    if (!header) {
      // Columns by their header text, so a reordered table still reads right.
      header = cells.map(cell => cellText(cell).toLowerCase());
      continue;
    }
    const at = name => {
      const i = header.indexOf(name);
      return i >= 0 && i < cells.length ? cells[i] : '';
    };
    const course = cellText(at('description'));
    if (!course) continue;
    const mail = /mailto:([^"'\s>]+)/i.exec(at('teacher'));
    const teacherRaw = cellText(at('teacher'));
    const period = parseInt(cellText(at('periods')), 10);
    out.push({
      code: cellText(at('course')),
      course,
      period: Number.isFinite(period) ? period : null,
      teacher: teacherName(teacherRaw),
      teacherRaw,
      email: mail ? mail[1].trim().toLowerCase() : '',
      room: cellText(at('room')),
      days: list(at('days')).map(d => d.toUpperCase()),
      quarters: list(at('marking periods')).map(q => q.toUpperCase()),
      building: cellText(at('building')),
      active: !/drop|inactive/i.test(cellText(at('status'))),
    });
  }
  return header ? out : null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = n => String(n).padStart(2, '0');

/** "09:00 AM" -> 540, "12:15 PM" -> 735, "12:05 AM" -> 5, or null. */
export function hacTime(text) {
  const m = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(String(text || ''));
  if (!m) return null;
  const h = +m[1] % 12 + (m[3].toUpperCase() === 'P' ? 12 : 0);
  return h * 60 + +m[2];
}

/**
 * One date's Daily Schedule page.
 * @returns {{ date: 'YYYY-MM-DD', none: boolean, periods: Array<{ label, start, end, code, course,
 *   teacher, teacherRaw, room }> } | null} null when it isn't that page. none: HAC says no classes
 *   that day (weekend, holiday). The date is the one in the page's own header, never the one asked
 *   for: HAC answers a date it can't read with today's page.
 * The no classes line carries the student's full name; it is only tested, never kept.
 */
export function parseDailySchedule(html) {
  const page = String(html || '');
  const head = /id="plnMain_lblDailyScheduleHdr"[^>]*>([^<]*)</.exec(page);
  if (!head) return null;
  const when = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(decode(head[1]).trim());
  const month = when ? MONTHS.indexOf(when[1].toLowerCase()) : -1;
  if (month < 0) return null;
  const date = `${when[3]}-${pad(month + 1)}-${pad(+when[2])}`;
  if (/id="plnMain_lblNoSchedule"/.test(page) && !/id="plnMain_dgSchedule"/.test(page)) return { date, none: true, periods: [] };

  const start = page.indexOf('id="plnMain_dgSchedule"');
  if (start < 0) return null;
  const end = page.indexOf('</table>', start);
  const table = page.slice(start, end < 0 ? undefined : end);
  let header = null;
  const periods = [];
  for (const row of table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []).map(td => td.replace(/^<td\b[^>]*>|<\/td>$/g, ''));
    if (!cells.length) continue;
    if (!header) {
      header = cells.map(cell => cellText(cell).toLowerCase());
      continue;
    }
    const at = name => {
      const i = header.indexOf(name);
      return i >= 0 && i < cells.length ? cellText(cells[i]) : '';
    };
    // "1     (09:00 AM - 10:33 AM)": the period's name, then its times that day.
    const periodCell = at('period');
    const times = /\(([^)]*)-([^)]*)\)/.exec(periodCell);
    const from = times ? hacTime(times[1]) : null;
    const to = times ? hacTime(times[2]) : null;
    if (from == null || to == null || to <= from) continue; // no times, nothing to put on a clock
    const teacherRaw = at('teacher');
    periods.push({
      label: periodCell.replace(/\(.*$/, '').trim(),
      start: from,
      end: to,
      code: at('course'),
      course: at('description'),
      teacher: teacherName(teacherRaw),
      teacherRaw,
      room: at('room'),
    });
  }
  if (!header) return null;
  periods.sort((a, b) => a.start - b.start);
  return { date, none: !periods.length, periods };
}

/**
 * The day's letter, from its classes: each course code's Days on Classes > Schedule. Only when
 * every class agrees on one letter; anything else (no Classes page, a class on both days, a mix)
 * gives null and Tally shows no letter.
 */
export function dayLetter(periods, entries) {
  if (!periods || !periods.length || !entries || !entries.length) return null;
  const norm = code => String(code || '').replace(/\s+/g, ' ').trim();
  const letters = new Set();
  for (const period of periods) {
    const entry = entries.find(e => norm(e.code) === norm(period.code));
    if (!entry || entry.days.length !== 1) return null;
    letters.add(entry.days[0]);
  }
  return letters.size === 1 ? [...letters][0] : null;
}

/** Classes > Schedule's student ID (the app needs it to ask for a Daily Schedule), or ''. */
export function studentId(html) {
  const m = /id="plnMain_lblStudentIDValue"[^>]*>\s*([^<\s]+)\s*</.exec(String(html || ''));
  return m ? m[1] : '';
}

/** "AP US HIstory S2" -> "ap us history": the name without its semester, for matching. */
export const courseKey = name => String(name || '').replace(/\s+S[12]$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
