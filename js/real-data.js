/**
 * REAL HAC DATA, local only.
 *
 * When the preview runs from local/real_server.py on the student's own Mac, /real-data.json holds
 * their last HAC pull (Q2 only). This module swaps it in for the sample classes before the first
 * render. Anywhere else (the Vercel preview, a plain http.server) the file is missing and the
 * preview stays on sample data.
 *
 * What HAC's Assignments page gives: class names, HAC's own average, category weights, and every
 * row as the teacher entered it. What it does not give (teachers, rooms, bell times, test dates)
 * is left blank or hidden on real data, never filled from the sample. GPA shows on real data only
 * when the pull carries the HAC transcript (local/hac_transcript.py) and its grades give back HAC's
 * own two GPA numbers (grade-math.js transcriptTotals); otherwise it stays hidden, since a wrong
 * GPA is worse than none.
 */
import {
  CLASSES, SEEN_CHANGES, QUEUED_SCORES, LAST_QUARTER_SAME_POINT, BELL_SCHEDULE,
} from './sample-data.js';
import { SAMPLE_TODAY, offsetOf } from './format.js';
import { fisdTier, transcriptTotals } from './grade-math.js';

/**
 * on: real data is showing. status: last Reload result from the server.
 * source: 'local' (real_server.py on his Mac) or 'paste' (the Tally bookmark, see hac-import.js).
 * period: the grading period the grades came from, as HAC names it ("Q2").
 */
export const real = { on: false, pulledAt: null, status: null, source: null, period: '', gpa: null };

/** Transcript GPA totals (grade-math.js transcriptTotals) when they check out against HAC, else null. */
export const realGpa = () => (real.on && real.gpa && real.gpa.ok ? real.gpa : null);

const STATUS_TEXT = {
  login: "HAC didn't accept the saved login. Nothing was deleted. Update ~/.hac/password, then Reload.",
  page_changed: 'HAC looks different, showing last copy.',
  wrong_quarter: 'HAC is not on Q2, showing last copy.',
  network: "Couldn't reach HAC, showing last copy.",
};

/** One line for the Home header when the last Reload did not bring new grades, else ''. */
export function realProblem() {
  const kind = real.status && real.status.kind;
  if (!kind || kind === 'ok') return '';
  if (real.status.waitSeconds) return `HAC can be read again in ${real.status.waitSeconds} s.`;
  return STATUS_TEXT[kind] || STATUS_TEXT.page_changed;
}

/** "Updated 4:12 PM" or "Updated Nov 8, 4:12 PM". */
export function realUpdatedText() {
  if (!real.pulledAt) return 'Not read from HAC yet';
  const when = new Date(real.pulledAt * 1000);
  const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = when.toDateString() === new Date().toDateString();
  return 'Updated ' + (sameDay ? '' : when.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ') + time;
}

/** Pasted grades, short for Home's line: "updated 4:12 PM" today, else "updated Nov 8". */
export function realPastedText() {
  if (!real.pulledAt) return 'not updated yet';
  const when = new Date(real.pulledAt * 1000);
  return when.toDateString() === new Date().toDateString()
    ? 'updated ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'updated ' + when.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---- Loading ------------------------------------------------------------------------------

async function getJson(path) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Before the first render. Leaves everything as sample when there is no real pull. */
export async function loadRealData() {
  // Only local/real_server.py marks the page. Anywhere else, don't even ask (the CSP would refuse).
  if (!document.querySelector('meta[name="real-hac"]')) return false;
  const data = await getJson('real-data.json');
  if (!data || !Array.isArray(data.classes) || data.quarter !== 'Q2') return false;
  real.status = await getJson('real-status.json');
  applyRealData(data);
  real.source = 'local';
  return true;
}

/** Pasted grades (js/hac-import.js): same mapping, no server, nothing to reload. */
export function applyImported(data) {
  real.status = null;
  applyRealData(data);
  real.source = 'paste';
}

/** Reload button. Asks the local server for one fresh pull; it enforces the limits. */
export async function reloadRealData() {
  let status;
  try {
    const response = await fetch('api/refresh', { method: 'POST', cache: 'no-store' });
    status = response.ok ? await response.json() : { kind: 'network' };
  } catch {
    status = { kind: 'network' };
  }
  real.status = status;
  if (status.kind === 'ok' && !status.refused) {
    const data = await getJson('real-data.json');
    if (data && data.quarter === 'Q2') applyRealData(data);
  }
  return status;
}

// ---- Mapping HAC rows onto the preview's model --------------------------------------------

const MARKS = { ABS: 'ABS', INC: 'INC', L: 'L', CNS: 'CNS', CWS: 'CWS', EXC: 'EXC', X: 'EXC' };

/** "ELA13300A - 2    AP English Language S1" -> "AP English Language". */
function className(raw) {
  return raw.replace(/^[A-Z0-9]+\s*-\s*\d+\s+/, '').replace(/\s+S[12]$/, '').trim();
}

/** HAC writes MM/dd/yyyy. Returns a day offset from today, or null. */
function dayOffset(text) {
  const parts = String(text || '').split('/').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return offsetOf(new Date(parts[2], parts[0] - 1, parts[1]));
}

const toNumber = text => (text === '' || text == null || Number.isNaN(+text) ? null : +text);

function mapRow(raw, course, index) {
  const score = toNumber(raw.score);
  const row = {
    id: course.id + index,
    title: raw.title,
    category: raw.category,
    due: dayOffset(raw.due),
    score,
    total: toNumber(raw.total) ?? 0,
    weight: toNumber(raw.weight) ?? 1,
    catWeight: course.categoryWeights[raw.category] ?? 0,
  };
  if (score == null && raw.score) {
    // "ABS - Missing Work Due to Absence" -> ABS. M and Z are missing (HAC counts both as 0).
    const code = raw.score.split(' ')[0].toUpperCase();
    if (code === 'M' || code === 'Z') row.missing = 1;
    else row.mark = MARKS[code] || code;
  }
  return row;
}

function slug(name, taken) {
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'class';
  while (taken.has(id)) id += 'x';
  taken.add(id);
  return id;
}

function applyRealData(data) {
  real.on = true;
  real.pulledAt = data.pulledAt || null;
  real.period = data.period != null ? data.period : data.quarter || '';
  real.gpa = data.transcript ? transcriptTotals(data.transcript) : null;

  // Dates count from the real today, not the sample Tuesday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  SAMPLE_TODAY.setTime(today.getTime());

  const taken = new Set();
  const courses = data.classes.map(raw => {
    const name = className(raw.name);
    const course = {
      id: slug(name, taken), name, real: true,
      teacher: '', room: '',
      level: /\b(AP|Honors|Pre-AP)\b/.test(name) ? 'H' : 'R',
      tier: fisdTier(name),
      absences: 0, tardies: 0, q1: null, q1rows: [],
      hacAverage: raw.average,
      categoryWeights: raw.categoryWeights || {},
    };
    course.rows = raw.rows.map((row, i) => mapRow(row, course, i));
    return course;
  });
  CLASSES.splice(0, CLASSES.length, ...courses);

  // Sample-only story data would point at classes that no longer exist.
  SEEN_CHANGES.length = 0;
  QUEUED_SCORES.length = 0;
  for (const key of Object.keys(LAST_QUARTER_SAME_POINT)) delete LAST_QUARTER_SAME_POINT[key];

  // Bell times are not in HAC, so the Bell tab and Classes today are hidden on real data. The sample
  // schedule still points at real classes in HAC's order so nothing that reads it breaks.
  const ids = courses.map(course => course.id);
  let next = 0;
  for (const day of Object.keys(BELL_SCHEDULE)) {
    for (const period of BELL_SCHEDULE[day]) {
      if (period.classId !== 'lunch') period.classId = ids[next++ % Math.max(ids.length, 1)];
    }
  }
}
