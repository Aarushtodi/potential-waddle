/**
 * HAC's Schedule page (Classes > Schedule, /HomeAccess/Content/Student/Classes.aspx), pure.
 *
 * Input: the page's HTML as text. Output: one entry per row of the schedule table
 * (#plnMain_dgSchedule), as HAC lists it:
 *   { code: 'ELA13300A - 2', course: 'AP English Language S1', period: 3, teacher: 'Ashley Gray',
 *     teacherRaw: 'GRAY, ASHLEY', email: 'grayas@friscoisd.org', room: 'C111', days: ['B'],
 *     quarters: ['Q1', 'Q2'], building: 'Wakeland High School', active: true }
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

/** "MCKEE, MADIRA" -> "Madira McKee". Keeps Mc, O' and hyphen capitals; no Mr or Ms guessed. */
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

/** "AP US HIstory S2" -> "ap us history": the name without its semester, for matching. */
export const courseKey = name => String(name || '').replace(/\s+S[12]$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The class in each period for one day: { 1: entry, 2: entry, ... }. Takes the rows for this
 * quarter on this A or B day. Rows with no day letter count for both days.
 */
export function classesFor(entries, quarter, day) {
  const byPeriod = {};
  for (const entry of entries || []) {
    if (!entry.active || entry.period == null) continue;
    if (quarter && entry.quarters.length && !entry.quarters.includes(quarter)) continue;
    if (day && entry.days.length && !entry.days.includes(day)) continue;
    if (!byPeriod[entry.period]) byPeriod[entry.period] = entry;
  }
  return byPeriod;
}
