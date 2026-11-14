/**
 * The student's bell, saved on the phone (localStorage), set once and editable later:
 *   school: 'wakeland' (the preset) | 'custom' (times they typed) | null (not set yet)
 *   rows:   typed rows when custom: [{ kind: 'period' | 'break', label?, start, end }]
 *   fix:    their own "today is B": { date: 'YYYY-MM-DD', day }, wins over the district rule and
 *           carries forward (js/bell-times.js abDay)
 *   hac:    HAC's Schedule page, parsed (js/hac-schedule-parse.js): course, teacher, room, A/B day
 *           and quarters per period. Only the parsed rows are kept, never the page (it carries the
 *           student ID).
 *
 * Where HAC's schedule comes from: inside the Tally iPhone app, the app reads
 * /HomeAccess/Content/Student/Classes.aspx right after the Assignments page (same signed in
 * session) and serves it at native/schedule.html; ingestHacSchedule() takes it from there. On the
 * web there is no schedule, so rooms and teachers stay blank and only the times show.
 */
import { parseHacSchedule, courseKey } from './hac-schedule-parse.js';

const KEY = 'tally-bell-v1';

export const bell = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return { school: saved.school || null, rows: saved.rows || [], fix: saved.fix || null, hac: saved.hac || null };
    }
  } catch {
    // Private mode or a broken value: start unset.
  }
  return { school: null, rows: [], fix: null, hac: null };
}

export function saveBell() {
  try {
    localStorage.setItem(KEY, JSON.stringify(bell));
  } catch {
    // Storage full or blocked: the bell still works until Tally closes.
  }
}

/** Sign out: HAC's schedule is the student's own, so it goes. The bell times stay (they're the school's). */
export function forgetHacSchedule() {
  bell.hac = null;
  bell.fix = null;
  saveBell();
}

/**
 * HAC's Schedule page in, saved. Returns the number of rows read, or 0 when the page wasn't a
 * schedule (signed out, or HAC changed it); the last good schedule is kept then.
 * readAtMs: when the app read the page from HAC.
 */
export function ingestHacSchedule(html, readAtMs = Date.now(), classes = null) {
  const entries = parseHacSchedule(html);
  if (!entries || !entries.length) return 0;
  bell.hac = { entries, readAt: readAtMs };
  saveBell();
  if (classes) applyScheduleToClasses(classes);
  return entries.length;
}

/** "ELA13300A - 2    AP English Language S1" -> "ELA13300A - 2", or ''. */
export const courseCode = raw => {
  const m = /^\s*([A-Z0-9]+\s*-\s*\d+)\s/.exec(String(raw || ''));
  return m ? m[1].replace(/\s+/g, ' ') : '';
};

/**
 * Real HAC classes get their teacher, email and room from the saved schedule: by course code and
 * section first ("ELA13300A - 2", the same on both HAC pages), then by name. No match stays blank.
 */
export function applyScheduleToClasses(classes) {
  const entries = bell.hac ? bell.hac.entries : [];
  for (const course of classes) {
    if (!course.real) continue;
    const code = course.code ? course.code.replace(/\s+/g, ' ') : '';
    const entry = (code && entries.find(e => e.code.replace(/\s+/g, ' ') === code))
      || entries.find(e => courseKey(e.course) === courseKey(course.name));
    course.teacher = entry ? entry.teacher : '';
    course.teacherEmail = entry ? entry.email : '';
    course.room = entry ? entry.room : '';
  }
}

/**
 * Inside the iPhone app only: pick up native/schedule.html if the app saved one. In a browser
 * there is no app (window.webkit.messageHandlers.tally), so nothing is asked for.
 */
export async function loadNativeSchedule(classes) {
  const inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tally);
  if (!inApp) return 0;
  try {
    const response = await fetch('native/schedule.html', { cache: 'no-store' });
    if (!response.ok) return 0;
    const readAt = +(response.headers.get('X-Tally-Read-At') || 0) || Date.now();
    return ingestHacSchedule(await response.text(), readAt, classes);
  } catch {
    return 0;
  }
}

/**
 * The app's call when it has read a fresh schedule: window.tallyBell.scheduleReady(readAtMs).
 * Same pattern as window.tallyNative.pulled(ms) for grades. onChange redraws.
 */
export function startBellBridge(classes, onChange) {
  window.tallyBell = {
    async scheduleReady(readAtMs) {
      try {
        const response = await fetch('native/schedule.html', { cache: 'no-store' });
        if (response.ok && ingestHacSchedule(await response.text(), readAtMs || Date.now(), classes)) onChange();
      } catch {
        // Keep the last good schedule.
      }
    },
  };
  loadNativeSchedule(classes).then(count => count && onChange());
}
