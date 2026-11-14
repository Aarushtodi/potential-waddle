/**
 * HAC attendance, pure (string based, no DOM: runs the same in the page, the app and Node,
 * ~/code/grade-app-shots/hacadds-1113/tools/hacadds-check.mjs, kept off this public repo).
 *
 * parseAttendanceMonth: Attendance > Month View (/HomeAccess/Content/Attendance/MonthlyView.aspx),
 * one month as a calendar grid. Each day cell with a code carries a title, newline separated:
 * period, code, sometimes a time ("1\nTardy\n8:58:00 AM"), then the next period. Whole day codes
 * ("School Closed") have no period. The month comes from the page's own header ("September 2026").
 *   -> { month: '2026-10', days: [{ date: '2026-10-14', closed: false,
 *        marks: [{ period: '1', code: 'Unresolved Absence', kind: 'unresolved', time: '' }] }] }
 * Days with nothing on them are left out. Returns null when the page has no attendance grid.
 *
 * parseReportCardAttendance: Grades > Report Card (/HomeAccess/Content/Student/ReportCards.aspx),
 * absences and tardies per class: ABS and TDY for the last published run, YTDA and YTDY for the year.
 *   -> { runs: ['Q1'], classes: [{ code: 'MTH10000A - 1', course: 'Algebra 1 S1', period: '2',
 *        abs: 2, tdy: 1, ytdAbs: 2, ytdTdy: 1 }] }
 * Grades and comments on that page are not kept. Returns null when the table isn't there.
 */

const decode = text => String(text)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const cellText = html => decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december'];

const pad = n => String(n).padStart(2, '0');

/**
 * What a code means, from HAC's own color legend on the same page (red = unexcused or unresolved,
 * yellow = excused absence, gray = absent, blue = tardy, green = counted present, brown = left early).
 * The words win over the color for the two that matter most.
 */
export function attendanceKind(code, color = '') {
  const word = String(code || '').toLowerCase();
  const hex = String(color || '').toLowerCase();
  if (word === 'unresolved absence') return 'unresolved';
  if (word === 'tardy') return 'tardy';
  if (word === 'school closed') return 'closed';
  if (word === 'leaving early' || hex === '#996600') return 'early';
  if (/absen/.test(word) || ['#ff0000', '#ffcc00', '#666666'].includes(hex)) return 'absent';
  if (hex === '#00cc00') return 'present';
  return 'other';
}

/** HAC's color legend on the Month View: { 'Tardy': '#0000cc', ... }. */
function legendColors(page) {
  const colors = {};
  const re = /background-color:\s*(#[0-9a-fA-F]{6});?"\s*aria-hidden="true">(?:&nbsp;|\s)*<\/span>\s*<span>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(page))) colors[decode(m[2]).trim()] = m[1].toLowerCase();
  return colors;
}

const TIME = /^\d{1,2}:\d{2}(:\d{2})?\s*[AP]M$/i;

/** "1\nTardy\n8:58:00 AM\n2\nTardy" -> [{period:'1', code:'Tardy', time:'8:58:00 AM'}, {period:'2', ...}] */
function marksFromTitle(title) {
  const tokens = decode(title).split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  const marks = [];
  let current = null;
  for (const token of tokens) {
    if (/^\d{1,2}$/.test(token)) {
      current = { period: token, code: '', time: '' };
      marks.push(current);
    } else if (TIME.test(token) && current) {
      current.time = token;
    } else if (current && !current.code) {
      current.code = token;
    } else {
      // A whole day code, or a second code with no period in front of it.
      current = { period: '', code: token, time: '' };
      marks.push(current);
    }
  }
  return marks.filter(mark => mark.code);
}

/** "1, Tardy, 8:58:00 AM" after the day number: the same marks from the aria-label, for cells without a title. */
function marksFromLabel(label) {
  return marksFromTitle(String(label).split(',').map(t => t.trim()).join('\n'));
}

export function parseAttendanceMonth(html) {
  const page = String(html || '');
  const start = page.indexOf('id="plnMain_cldAttendance"');
  if (start < 0) return null;
  const head = /<td align="center" style="width:70%;">\s*([A-Za-z]+)\s+(\d{4})\s*<\/td>/.exec(page.slice(start));
  if (!head) return null;
  const monthIndex = MONTHS.indexOf(head[1].toLowerCase());
  if (monthIndex < 0) return null;
  const year = +head[2];
  const month = `${year}-${pad(monthIndex + 1)}`;
  const colors = legendColors(page);

  // The grid ends where the legend begins; only cells inside the calendar table count.
  const end = page.indexOf('Color Legend', start);
  const grid = page.slice(start, end < 0 ? undefined : end);
  const days = [];
  const cellRe = /<td\b([^>]*)>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRe.exec(grid))) {
    const attrs = m[1];
    const inner = m[2];
    // Days from the months before and after are gray and empty; nested header cells hold no day.
    const dayMatch = /<span role='img' aria-label='(\d{1,2})(?:,\s*([^']*))?'>\s*\d{1,2}\s*<\/span>/.exec(inner);
    if (!dayMatch) continue;
    const day = +dayMatch[1];
    const title = /\btitle="([^"]*)"/.exec(attrs);
    let marks = title ? marksFromTitle(title[1]) : marksFromLabel(dayMatch[2] || '');
    marks = marks.map(mark => ({ ...mark, kind: attendanceKind(mark.code, colors[mark.code]) }));
    if (!marks.length) continue;
    const closed = marks.every(mark => mark.kind === 'closed');
    days.push({ date: `${month}-${pad(day)}`, closed, marks: closed ? [] : marks.filter(mark => mark.kind !== 'closed') });
  }
  return { month, days };
}

const num = text => {
  const n = parseFloat(String(text).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function parseReportCardAttendance(html) {
  const page = String(html || '');
  const start = page.indexOf('id="plnMain_dgReportCard"');
  if (start < 0) return null;
  const end = page.indexOf('</table>', start);
  const table = page.slice(start, end < 0 ? undefined : end);
  const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  let header = null;
  const classes = [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(cellText);
    if (!cells.length) continue;
    if (!header) {
      if (cells.includes('Course') && cells.includes('ABS')) header = cells;
      continue;
    }
    const at = name => cells[header.indexOf(name)] ?? '';
    const code = at('Course').replace(/\s+/g, ' ');
    if (!/^[A-Z0-9]+ - \d+$/.test(code)) continue;
    classes.push({
      code, course: at('Description'), period: at('Period'),
      abs: num(at('ABS')), tdy: num(at('TDY')), ytdAbs: num(at('YTDA')), ytdTdy: num(at('YTDY')),
    });
  }
  if (!header) return null;
  // The grade columns name the runs published so far (Q1, then Q2 ...); CM columns are comments.
  const runs = header.filter(name => /^(Q\d|S\d|EX\d?|SEM\d?)$/.test(name));
  return { runs, classes };
}
