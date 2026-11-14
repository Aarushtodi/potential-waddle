/**
 * More of HAC, saved on the phone (localStorage `tally-hacadds-v1`), parsed rows only, never the
 * pages (they carry the student's name, ID and full history):
 *   att.months   { '2026-09': { days, readAt } }  Attendance > Month View, one per month
 *   att.rc       report card absences and tardies per class (js/hac-attendance-parse.js)
 *   cal          assignments teachers posted in HAC's Calendar, this school year (js/hac-calendar-parse.js)
 *   owe          Classwork row extras HAC's grade parser drops: teacher comment, Can Be Dropped
 *                (js/hac-owe-parse.js), joined to grade rows at render by class code, title and due date
 *   credits      graduation credits per subject (js/hac-credits-parse.js), only when they check out
 *                against the transcript
 *
 * Where the pages come from: inside the Tally iPhone app, the app reads them on the signed in HAC
 * session and serves them at native/*.html (~/code/grade-app-shots/hacadds-1113/NATIVE-HOOK-3.md).
 * On the web there are none, and every view that uses this shows nothing extra.
 */
import { parseAttendanceMonth, parseReportCardAttendance } from './hac-attendance-parse.js';
import { parseHacCalendar } from './hac-calendar-parse.js';
import { parseAssignmentExtras } from './hac-owe-parse.js';
import { parseCareerPlan, parseTranscriptCredits, checkCredits } from './hac-credits-parse.js';

const KEY = 'tally-hacadds-v1';

export const adds = load();

function empty() {
  return { att: { months: {}, rc: null }, cal: null, owe: null, plan: null, transcript: null };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...empty(), ...saved, att: { months: {}, rc: null, ...(saved.att || {}) } };
  } catch {
    // Private mode or a broken value: start empty.
  }
  return empty();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(adds));
  } catch {
    // Storage full or blocked: it still shows until Tally closes.
  }
}

/** Sign out: all of it is the student's own record. */
export function forgetHacAdds() {
  Object.assign(adds, empty());
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ---- In -----------------------------------------------------------------------------------

/** One Month View page, filed under the month in its own header. Returns that month, or ''. */
export function ingestAttendanceMonth(html, readAt = Date.now()) {
  const month = parseAttendanceMonth(html);
  if (!month) return '';
  adds.att.months[month.month] = { days: month.days, readAt };
  save();
  return month.month;
}

export function ingestReportCard(html, readAt = Date.now()) {
  const rc = parseReportCardAttendance(html);
  if (!rc || !rc.classes.length) return 0;
  adds.att.rc = { ...rc, readAt };
  save();
  return rc.classes.length;
}

export function ingestCalendar(html, readAt = Date.now()) {
  const items = parseHacCalendar(html, new Date(readAt));
  if (!items) return 0;
  adds.cal = { items, readAt };
  save();
  return items.length || 1;
}

export function ingestAssignments(html, readAt = Date.now()) {
  const extras = parseAssignmentExtras(html);
  if (!extras) return 0;
  adds.owe = { ...extras, readAt };
  save();
  return extras.rows.length || 1;
}

export function ingestCareerPlan(html, readAt = Date.now()) {
  const plan = parseCareerPlan(html);
  if (!plan) return 0;
  adds.plan = { ...plan, readAt };
  save();
  return plan.subjects.length;
}

export function ingestTranscript(html, readAt = Date.now()) {
  const transcript = parseTranscriptCredits(html);
  if (!transcript) return 0;
  adds.transcript = { ...transcript, readAt };
  save();
  return transcript.courses.length || 1;
}

// ---- Out ----------------------------------------------------------------------------------

/** Every saved attendance day, newest first: [{ date, marks }], closed days left out. */
export function attendanceDays() {
  const out = [];
  for (const month of Object.values(adds.att.months)) {
    for (const day of month.days) if (!day.closed && day.marks.length) out.push(day);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Days HAC still shows as Unresolved Absence, oldest first. */
export const unresolvedDays = () => attendanceDays()
  .filter(day => day.marks.some(mark => mark.kind === 'unresolved'))
  .reverse();

/** True when the phone has any attendance from HAC. */
export const hasAttendance = () => Object.keys(adds.att.months).length > 0 || !!adds.att.rc;

/** Credits only when every completed course in the plan matches the transcript (checkCredits). */
export function creditsCard() {
  if (!adds.plan || !adds.transcript) return null;
  const check = checkCredits(adds.plan, adds.transcript);
  return check.ok ? { plan: adds.plan, earned: check.earned } : null;
}

const norm = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const extraKey = (code, title, due) => `${norm(code)}|${norm(title)}|${norm(due)}`;
let extrasIndex = null;
let extrasFrom = null;

/**
 * The comment and drop flag HAC shows on a Classwork row, by class code ("ELA13300A - 2"), title and
 * HAC's due date text ("10/27/2026"). Two rows with the same key = no answer (never the wrong row).
 */
export function rowExtras(code, title, due) {
  if (!adds.owe) return null;
  if (extrasFrom !== adds.owe) {
    extrasIndex = new Map();
    for (const row of adds.owe.rows) {
      const key = extraKey(row.code, row.title, row.due);
      extrasIndex.set(key, extrasIndex.has(key) ? null : row);
    }
    extrasFrom = adds.owe;
  }
  return extrasIndex.get(extraKey(code, title, due)) || null;
}

/** HAC's drop flag only tells something when the page has both answers (Frisco marks every row Y). */
export const dropFlagMeans = () => !!(adds.owe && adds.owe.dropY && adds.owe.dropN);

// ---- Native files -------------------------------------------------------------------------

const MAX_MONTHS = 12;

async function getText(path) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/** Reads every page the app saved. Returns how many were taken. */
export async function readNativeAdds(readAt = Date.now()) {
  let taken = 0;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const html = await getText(`native/attendance-${i}.html`);
    if (html == null) break;
    if (ingestAttendanceMonth(html, readAt)) taken++;
  }
  const pages = [
    ['native/reportcard.html', ingestReportCard],
    ['native/calendar.html', ingestCalendar],
    ['native/assignments.html', ingestAssignments],
    ['native/careerplan.html', ingestCareerPlan],
    ['native/transcript.html', ingestTranscript],
  ];
  for (const [path, ingest] of pages) {
    const html = await getText(path);
    if (html != null && ingest(html, readAt)) taken++;
  }
  return taken;
}

/**
 * Inside the iPhone app only (window.webkit.messageHandlers.tally): reads the saved pages on launch,
 * and again when the app calls window.tallyHacAdds.ready(readAtMs) after a fresh read. onChange()
 * redraws. In a browser it does nothing.
 */
export function startHacAddsBridge(onChange) {
  const inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tally);
  if (!inApp) return;
  const take = async readAt => {
    if (await readNativeAdds(readAt || Date.now())) onChange();
  };
  window.tallyHacAdds = { ready: take };
  take();
}
