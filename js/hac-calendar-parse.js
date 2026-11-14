/**
 * HAC's Calendar page (/HomeAccess/Home/Calendar), pure (string based, no DOM: runs the same in the
 * page, the app and Node, ~/code/grade-app-shots/hacadds-1113/tools/hacadds-check.mjs, kept off this public repo).
 *
 * The page carries every assignment since the student's first year in HAC as inline JSON
 * (`var calendarEvents = {...}`, under AssignmentCourses, about 1.8 MB), including ones teachers
 * posted with a due date still ahead. Only this school year is kept (Aug 1 on).
 *
 *   -> [{ code: 'SCI10000A - 1', title: 'Unit 3 Lab', due: '2026-12-01',
 *         category: 'Assessment of Learning', points: 100, extraCredit: false, id: 'hc1234567-14' }]
 * Returns null when the page has no calendar data (signed out, or HAC changed the page).
 */

/** The JSON object that starts at `from`, by matching braces (strings skipped). */
function objectAt(text, from) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(from, i + 1);
  }
  return null;
}

const pad = n => String(n).padStart(2, '0');

/** "11/19/2026 00:00:00" -> "2026-11-19" (HAC's own date text, no time zone math). */
function isoDate(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(text || ''));
  return m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : '';
}

/** Aug 1 of the school year `now` falls in (Aug to Jul). */
export function schoolYearStart(now = new Date()) {
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}

export function parseHacCalendar(html, now = new Date()) {
  const page = String(html || '');
  const at = page.indexOf('var calendarEvents');
  if (at < 0) return null;
  const open = page.indexOf('{', at);
  const json = open < 0 ? null : objectAt(page, open);
  if (!json) return null;
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.AssignmentCourses)) return null;
  const from = schoolYearStart(now);
  const seen = new Set();
  const out = [];
  for (const event of data.AssignmentCourses) {
    const key = event && event.Key ? event.Key : {};
    const due = isoDate(event.start);
    if (!due || due < from) continue;
    const title = String(key.TooltipTitle || event.title || '').replace(/\s+/g, ' ').trim();
    if (!title || !key.Course) continue;
    const id = `hc${key.SectionKey || key.Course}-${key.AssignmentNumber ?? title}`;
    if (seen.has(id + due)) continue;
    seen.add(id + due);
    out.push({
      code: `${String(key.Course).trim()} - ${key.CourseSection}`,
      title,
      due,
      category: String(key.TooltipCategory || '').trim(),
      points: typeof key.TooltipPoints === 'number' ? key.TooltipPoints : null,
      extraCredit: key.TooltipExtraCredit === 'Y',
      id,
    });
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title)));
}
