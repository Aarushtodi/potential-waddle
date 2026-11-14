/**
 * Bell times and the A/B day, pure (no DOM, no storage), so dev/bell-check.mjs runs it in Node.
 *
 * Times are minutes after midnight on the phone's own clock. Dates are local calendar days, keyed
 * 'YYYY-MM-DD' from the Date's own year, month and day (never toISOString: at 9 PM in Frisco that
 * is already tomorrow in UTC). School days are counted by stepping one calendar day at a time, so
 * the end of daylight saving time in the middle of a quarter changes nothing.
 */

/** Wakeland HS 2026-27, from the official bell sheet (9/17). Every Wednesday is the Activity schedule. */
export const WAKELAND = {
  name: 'Wakeland HS',
  standard: [
    { kind: 'period', n: 1, start: 540, end: 633 },
    { kind: 'period', n: 2, start: 639, end: 733 },
    { kind: 'break', label: 'Power Lunch', start: 733, end: 793 },
    { kind: 'period', n: 3, start: 798, end: 891 },
    { kind: 'period', n: 4, start: 897, end: 990 },
  ],
  wednesday: [
    { kind: 'period', n: 1, start: 540, end: 626 },
    { kind: 'period', n: 2, start: 631, end: 723 },
    { kind: 'break', label: 'Activity', start: 723, end: 748 },
    { kind: 'break', label: 'Power Lunch', start: 748, end: 808 },
    { kind: 'period', n: 3, start: 813, end: 899 },
    { kind: 'period', n: 4, start: 904, end: 990 },
  ],
};

/**
 * Frisco ISD 2026-27. The A/B day starts over each quarter (Q1 and Q3 start on A, Q2 and Q4 on B)
 * and flips every school day; days with no school don't use a turn.
 */
export const FISD = {
  quarters: [
    { name: 'Q1', start: '2026-08-12', end: '2026-10-08', first: 'A' },
    { name: 'Q2', start: '2026-10-14', end: '2026-12-18', first: 'B' },
    { name: 'Q3', start: '2027-01-05', end: '2027-03-05', first: 'A' },
    { name: 'Q4', start: '2027-03-08', end: '2027-05-14', first: 'B' },
  ],
  // Bad weather days (Mar 26, Apr 16) count as no school unless the district uses them.
  noSchool: new Set([
    '2026-09-07', '2026-09-08', '2026-10-09', '2026-10-12', '2026-10-13',
    '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    '2027-01-18', '2027-02-12', '2027-02-15',
    '2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19',
    '2027-03-26', '2027-04-16', '2027-04-30',
  ]),
};

const pad = n => String(n).padStart(2, '0');

/** Local calendar day of a Date, 'YYYY-MM-DD'. */
export const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local midnight of a 'YYYY-MM-DD' key. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The next calendar day, local (setDate handles month ends and the clock change). */
export function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export const minutesOf = date => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

/** The quarter a day falls in (start to end, inclusive), or null (breaks between quarters, summer). */
export function quarterOf(date, cal = FISD) {
  const key = dateKey(date);
  return cal.quarters.find(q => key >= q.start && key <= q.end) || null;
}

/** The quarter this day belongs to for class lists: the one it's in, else the next one to start. */
export function quarterFor(date, cal = FISD) {
  const key = dateKey(date);
  return quarterOf(date, cal) || cal.quarters.find(q => key < q.start) || null;
}

/** A weekday inside a quarter that isn't a no school day. */
export function isSchoolDay(date, cal = FISD) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !!quarterOf(date, cal) && !cal.noSchool.has(dateKey(date));
}

/** School days from `from` to `to` (both inside one quarter), not counting `from`. */
function schoolDaysBetween(from, to, cal) {
  let count = 0;
  const endKey = dateKey(to);
  for (let d = addDays(from, 1); dateKey(d) <= endKey; d = addDays(d, 1)) {
    if (isSchoolDay(d, cal)) count++;
  }
  return count;
}

const flip = (day, times) => (times % 2 ? (day === 'A' ? 'B' : 'A') : day);

/**
 * A or B for a school day. fix = { date: 'YYYY-MM-DD', day: 'A' | 'B' } is the student's own
 * "today is B": it wins over the district rule on its day and carries forward from there until the
 * quarter ends (the next quarter starts over from the rule).
 * @returns {{ day: 'A'|'B', from: 'rule'|'fix' } | null} null: no school, or a day outside the
 *   known calendar, where Tally asks instead of guessing
 */
export function abDay(date, fix = null, cal = FISD) {
  if (!isSchoolDay(date, cal)) return null;
  const quarter = quarterOf(date, cal);
  const key = dateKey(date);
  if (fix && (fix.day === 'A' || fix.day === 'B') && fix.date <= key) {
    const fixDate = fromKey(fix.date);
    const fixQuarter = quarterOf(fixDate, cal);
    if (fixQuarter && fixQuarter.name === quarter.name && isSchoolDay(fixDate, cal)) {
      return { day: flip(fix.day, schoolDaysBetween(fixDate, date, cal)), from: 'fix' };
    }
  }
  const start = fromKey(quarter.start);
  // The quarter's first day counts as its first turn (it is a school day in every year so far,
  // but step to the first school day in case it isn't).
  let first = start;
  while (!isSchoolDay(first, cal)) first = addDays(first, 1);
  return { day: flip(quarter.first, schoolDaysBetween(first, date, cal)), from: 'rule' };
}

/** The next school day after `date` in the known calendar, or null. */
export function nextSchoolDay(date, cal = FISD) {
  const last = cal.quarters[cal.quarters.length - 1].end;
  for (let d = addDays(date, 1); dateKey(d) <= last; d = addDays(d, 1)) {
    if (isSchoolDay(d, cal)) return d;
  }
  return null;
}

/**
 * The bell rows for a day. bell = { school: 'wakeland' } or { school: 'custom', rows: [...] }.
 * Custom rows are the same every day.
 */
export function bellRowsFor(bell, date) {
  if (!bell || !bell.school) return [];
  if (bell.school === 'wakeland') return date.getDay() === 3 ? WAKELAND.wednesday : WAKELAND.standard;
  return numberPeriods(bell.rows || []);
}

/** Custom rows: periods are numbered in time order (Period 1, 2, ...), breaks keep their label. */
export function numberPeriods(rows) {
  let n = 0;
  return rows
    .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end))
    .slice()
    .sort((a, b) => a.start - b.start)
    .map(row => (row.kind === 'break'
      ? { kind: 'break', label: row.label || 'Lunch', start: row.start, end: row.end }
      : { kind: 'period', n: ++n, start: row.start, end: row.end }));
}

/** '09:05' (an <input type=time> value) -> 545, or null. */
export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text || '').trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 545 -> '09:05', for an <input type=time>. */
export const timeValue = minutes => (Number.isFinite(minutes) ? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` : '');

/**
 * Problems with typed rows, in words, or '' when they're good: every row needs both times, ends
 * after it starts, and doesn't overlap the next one.
 */
export function checkRows(rows) {
  if (!rows.length) return 'Add at least one period.';
  if (rows.some(row => !Number.isFinite(row.start) || !Number.isFinite(row.end))) return 'Every row needs a start and an end time.';
  if (rows.some(row => row.end <= row.start)) return 'Each period has to end after it starts.';
  if (!rows.some(row => row.kind !== 'break')) return 'Add at least one period.';
  const sorted = rows.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return 'Two rows overlap. Check the times.';
  }
  return '';
}

/**
 * Where the clock is in a day of rows.
 * @returns {{ index, current, next, minutesLeft, passing, before, after }}
 *   index: the row on now, or the row coming up during a walk (-1 before the first bell and after
 *   the last); passing: between two rows
 */
export function clockIn(rows, minutes) {
  const empty = { index: -1, current: null, next: rows[0] || null, minutesLeft: 0, passing: false, before: false, after: false };
  if (!rows.length) return empty;
  if (minutes < rows[0].start) return { ...empty, before: true };
  const last = rows[rows.length - 1];
  if (minutes >= last.end) return { ...empty, next: null, after: true };
  const index = rows.findIndex(row => minutes < row.end);
  const row = rows[index];
  const passing = minutes < row.start;
  return {
    index,
    current: passing ? null : row,
    next: passing ? row : rows[index + 1] || null,
    minutesLeft: passing ? 0 : Math.max(1, Math.ceil(row.end - minutes)),
    passing,
    before: false,
    after: false,
  };
}
