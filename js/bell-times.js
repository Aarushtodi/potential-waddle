/**
 * Bell clock helpers, pure (no DOM, no storage), so dev/bell-check.mjs runs them in Node.
 *
 * Every time comes from HAC (js/hac-schedule-parse.js parseDailySchedule): Tally has no preset,
 * no typed times and no A/B rule. Times are minutes after midnight on the phone's own clock.
 * Dates are local calendar days keyed 'YYYY-MM-DD' from the Date's own year, month and day (never
 * toISOString: at 9 PM in Frisco that is already tomorrow in UTC).
 */

const pad = n => String(n).padStart(2, '0');

/** Local calendar day of a Date, 'YYYY-MM-DD'. */
export const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local midnight of a 'YYYY-MM-DD' key. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const minutesOf = date => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

/**
 * Where the clock is in a day of rows ({ start, end }, sorted).
 * @returns {{ index, current, next, minutesLeft, minutesToNext, passing, before, after }}
 *   index: the row on now, or the row coming up between classes (-1 before the first and after
 *   the last); passing: between two rows
 */
export function clockIn(rows, minutes) {
  const empty = { index: -1, current: null, next: rows[0] || null, minutesLeft: 0, minutesToNext: 0, passing: false, before: false, after: false };
  if (!rows.length) return { ...empty, after: true };
  if (minutes < rows[0].start) return { ...empty, before: true, minutesToNext: Math.ceil(rows[0].start - minutes) };
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
    minutesToNext: passing ? Math.max(1, Math.ceil(row.start - minutes)) : 0,
    passing,
    before: false,
    after: false,
  };
}
