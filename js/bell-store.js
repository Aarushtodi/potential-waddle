/**
 * HAC's schedule, saved on the phone (localStorage), for the Bell tab and Email teacher:
 *   hac:  Classes > Schedule parsed (js/hac-schedule-parse.js parseHacSchedule): each class's A/B
 *         day, teacher, email, room, for the whole year
 *   days: { 'YYYY-MM-DD': { none, periods, readAt } }, each date's Daily Schedule parsed: the times
 *         HAC gives for that date. Keyed by the date in the page's own header.
 * Only parsed rows are kept, never the pages (they carry the student's ID and name).
 *
 * Where the pages come from: inside the Tally iPhone app, the app reads them on the signed in HAC
 * session and serves them at native/schedule.html, native/day-today.html and native/day-next.html
 * (~/code/grade-app-shots/bell-1113/NATIVE-HOOK.md). On the web there are none: the Bell tab says
 * so and Email teacher stays blank. Nothing here ever guesses a time, a room or an A/B day.
 */
import { parseHacSchedule, parseDailySchedule, courseKey } from './hac-schedule-parse.js';
import { dateKey } from './bell-times.js';

const KEY = 'tally-bell-v2';
const KEEP_DAYS = 14;

export const bell = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return { hac: saved.hac || null, days: saved.days || {} };
  } catch {
    // Private mode or a broken value: start empty.
  }
  return { hac: null, days: {} };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(bell));
  } catch {
    // Storage full or blocked: it still shows until Tally closes.
  }
}

/** Sign out: it's the student's own schedule, so all of it goes. */
export function forgetHacSchedule() {
  bell.hac = null;
  bell.days = {};
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('tally-bell-v1'); // an earlier build's key
  } catch {
    // ignore
  }
}

/** Classes > Schedule in. Returns rows read, or 0 (not that page: the last good copy stays). */
export function ingestHacSchedule(html, readAtMs = Date.now()) {
  const entries = parseHacSchedule(html);
  if (!entries || !entries.length) return 0;
  bell.hac = { entries, readAt: readAtMs };
  save();
  return entries.length;
}

/** One Daily Schedule page in, under the date HAC printed on it. Returns that date, or ''. */
export function ingestDailySchedule(html, readAtMs = Date.now()) {
  const day = parseDailySchedule(html);
  if (!day) return '';
  bell.days[day.date] = { none: day.none, periods: day.periods, readAt: readAtMs };
  // Old days are never shown again; keep two weeks at most.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const oldest = dateKey(cutoff);
  for (const key of Object.keys(bell.days)) if (key < oldest) delete bell.days[key];
  save();
  return day.date;
}

/** The saved Daily Schedule for a date, or null when HAC's page for it isn't on the phone. */
export const savedDay = date => bell.days[dateKey(date)] || null;

/** "ELA13300A - 2    AP English Language S1" -> "ELA13300A - 2", or ''. */
export const courseCode = raw => {
  const m = /^\s*([A-Z0-9]+\s*-\s*\d+)\s/.exec(String(raw || ''));
  return m ? m[1].replace(/\s+/g, ' ') : '';
};

/**
 * Real HAC classes get their teacher, email and room from Classes > Schedule: by course code and
 * section ("ELA13300A - 2", the same on every HAC page), then by name. No match stays blank.
 */
export function applyScheduleToClasses(classes) {
  const entries = bell.hac ? bell.hac.entries : [];
  const norm = code => String(code || '').replace(/\s+/g, ' ').trim();
  for (const course of classes) {
    if (!course.real) continue;
    const entry = (course.code && entries.find(e => norm(e.code) === norm(course.code)))
      || entries.find(e => courseKey(e.course) === courseKey(course.name));
    course.teacher = entry ? entry.teacher : '';
    course.teacherEmail = entry ? entry.email : '';
    course.room = entry ? entry.room : '';
  }
}

const NATIVE_FILES = ['native/schedule.html', 'native/day-today.html', 'native/day-next.html'];

/** Reads whatever schedule pages the app saved. Returns how many were taken. */
async function readNativeFiles(readAtMs) {
  let taken = 0;
  for (const path of NATIVE_FILES) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) continue;
      const html = await response.text();
      const ok = path.endsWith('schedule.html') ? ingestHacSchedule(html, readAtMs) : ingestDailySchedule(html, readAtMs);
      if (ok) taken++;
    } catch {
      // Missing or unreadable: keep the last good copy.
    }
  }
  return taken;
}

/**
 * Inside the iPhone app only (window.webkit.messageHandlers.tally): reads the saved pages on
 * launch, and again when the app calls window.tallyBell.scheduleReady(readAtMs) after a fresh read
 * (same pattern as window.tallyNative.pulled). onChange(classes) redraws. In a browser it does
 * nothing.
 */
export function startBellBridge(classes, onChange) {
  const inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tally);
  if (!inApp) return;
  const take = async readAtMs => {
    if (await readNativeFiles(readAtMs || Date.now())) {
      applyScheduleToClasses(classes);
      onChange();
    }
  };
  window.tallyBell = { scheduleReady: take };
  take();
}
