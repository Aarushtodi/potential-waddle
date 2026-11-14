/**
 * "Make it up: an 85 takes Pre Calc 62.0 to 84.5" for a missing, zero or absent row on real grades.
 *
 * The score shown is the lowest whole score on that one row that lifts the class to its next letter
 * up (Frisco has no D: 70, 80, 90), capped at the row's points. If even full points can't, it says
 * what full points do. Already an A: what full points do. Uses grade-math.js classAverage as is
 * (the same weighted category math as the class page) plus HAC's shift (state.js nowAverage), so
 * it starts from the number on the class page. Nothing here is saved or shown on sample data.
 */
import { classAverage, countsAsZero, isScored } from './grade-math.js';
import { nowAverage, hacShift, rowCounts } from './state.js';
import { oneDecimal } from './format.js';

export const LETTER_LINES = [70, 80, 90];

/** Owed = missing (M/Z), a scored 0, or ABS/INC. */
export const isOwed = row => countsAsZero(row) || (isScored(row) && row.score === 0 && row.total > 0);

/**
 * { score, total, from, to, line } or null (sample class, not owed, or a row that doesn't count).
 * line is the letter line reached, or null when full points don't reach the next one.
 */
export function makeUp(course, row) {
  if (!course || !course.real || !isOwed(row) || !rowCounts(row) || !(row.total > 0)) return null;
  const from = nowAverage(course);
  if (from == null) return null;
  // HAC prints its average to 2 decimals, so a gap under 0.006 is that rounding, not a code we
  // don't read; counting it could tip a score that lands exactly on the line (210/300 = 70.0).
  const rawShift = hacShift(course);
  const shift = Math.abs(rawShift) < 0.006 ? 0 : rawShift;
  const averageWith = score => {
    const rows = course.rows.map(other => (other === row
      ? { ...other, score, missing: 0, mark: undefined }
      : other));
    const average = classAverage(rows);
    return average == null ? null : average + shift;
  };
  const best = averageWith(row.total);
  if (best == null || best <= from) return null;
  const next = LETTER_LINES.find(line => line > from);
  if (next == null || best < next - 1e-9) return { score: row.total, total: row.total, from, to: best, line: null };
  // Lowest whole score that reaches the line. A hair of float slack, so 210/300 counts as 70.0.
  const reaches = score => averageWith(score) >= next - 1e-9;
  let low = 0;
  let high = row.total;
  if (reaches(0)) high = 0;
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (reaches(mid)) high = mid;
      else low = mid;
    }
  }
  let score = Math.min(row.total, Math.ceil(high - 1e-6));
  while (score > 0 && reaches(score - 1)) score--;
  while (score < row.total && !reaches(score)) score++;
  return { score, total: row.total, from, to: averageWith(score), line: next };
}

const article = n => (/^8/.test(n) || n === '11' || n === '18' ? 'an' : 'a');

/** "Make it up: an 85 takes AP Statistics 62.0 to 84.5" (points out of 100), or "a 17 of 20 takes ...". */
export function makeUpText(course, row, className = course.name) {
  const m = makeUp(course, row);
  if (!m) return '';
  const n = String(m.score);
  const score = m.total === 100 ? n : `${n} of ${m.total}`;
  return `Make it up: ${article(n)} ${score} takes ${className} ${oneDecimal(m.from)} to ${oneDecimal(m.to)}`;
}
