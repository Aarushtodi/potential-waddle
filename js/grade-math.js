/**
 * Grade math. Pure functions only: no DOM, no app state, no sample data.
 *
 * The rules come from how HAC (the district gradebook) shows grades, not from what a student
 * hopes they will be:
 *   - A score counts exactly as the teacher entered it.
 *   - Missing, INC (incomplete) and ABS (absent) count as 0, because that is what the
 *     gradebook does until the teacher changes it.
 *   - A blank row (nothing entered yet) has no weight at all. It is not a 0 and not a 100.
 *   - Category weights come from the class. The sample uses one set for every class.
 *
 * A "row" is { category: 'Test' | 'Lab' | 'HW', score: number | null, total: number,
 *              missing?, mark? } as defined in sample-data.js.
 */

/** Sample weights, the same for every class in the preview. The real app reads them per class. */
export const CATEGORY_WEIGHTS = { Test: 0.6, Lab: 0.25, HW: 0.15 };

/**
 * Category weights for one class. Real HAC rows carry their class's weight (catWeight);
 * sample rows use CATEGORY_WEIGHTS.
 * @param {object[]} rows
 * @returns {Object<string, number>}
 */
export function categoryWeights(rows) {
  const own = {};
  for (const row of rows) if (row.catWeight != null) own[row.category] = row.catWeight;
  return Object.keys(own).length ? own : CATEGORY_WEIGHTS;
}

/** @param {object} row @returns {boolean} true when the teacher entered a number. */
export const isScored = row => typeof row.score === 'number';

/**
 * True for rows HAC counts as 0 even though there is no number: missing, INC or ABS.
 * @param {object} row
 * @returns {boolean}
 */
export const countsAsZero = row =>
  !isScored(row) && Boolean(row.missing || row.mark === 'ABS' || row.mark === 'INC');

/**
 * Weighted class average, the number HAC shows.
 * Each category is points earned over points possible. Categories with no scored rows drop
 * out and the remaining weights are scaled back up to 100 percent.
 * @param {object[]} rows
 * @returns {number|null} average from 0 to 100+, or null when nothing is scored yet
 */
export function classAverage(rows) {
  const counted = rows.map(row => (countsAsZero(row) ? Object.assign({}, row, { score: 0 }) : row));
  const weights = categoryWeights(rows);
  let weightedSum = 0;
  let weightUsed = 0;
  for (const category in weights) {
    const scored = counted.filter(row => row.category === category && isScored(row));
    if (!scored.length) continue;
    // HAC rows can carry their own weight (a test counted twice); sample rows count once.
    const earned = scored.reduce((sum, row) => sum + row.score * (row.weight ?? 1), 0);
    const possible = scored.reduce((sum, row) => sum + row.total * (row.weight ?? 1), 0);
    if (!possible) continue;
    weightedSum += weights[category] * (earned / possible * 100);
    weightUsed += weights[category];
  }
  return weightUsed ? weightedSum / weightUsed : null;
}

/**
 * How much one row moves the average: average with it minus average without it.
 * @param {object[]} rows
 * @param {object} row one of rows
 * @returns {number|null} null when either average does not exist
 */
export function averageEffect(rows, row) {
  const withRow = classAverage(rows);
  const withoutRow = classAverage(rows.filter(other => other !== row));
  return withRow == null || withoutRow == null ? null : withRow - withoutRow;
}

/**
 * Lowest score on one more assignment that keeps the average at or above a target.
 * Binary search, because the category weighting makes a closed form messy.
 * @param {object[]} rows current gradebook rows
 * @param {number} target average wanted, like 90
 * @param {number} [total=100] points possible on the next assignment
 * @param {object} [slot={category: 'Test'}] the next assignment's category, and on real HAC
 *   classes its catWeight (and row weight), so it counts even in a category with no rows yet
 * @returns {{reach: false, best: number} | {reach: true, need: number}}
 *   need is a whole number of points; best is the average even a perfect score gives
 */
export function scoreNeededOnNext(rows, target, total = 100, slot = { category: 'Test' }) {
  const averageWith = score => classAverage(rows.concat([Object.assign({}, slot, { score, total })]));
  if (averageWith(total) < target) return { reach: false, best: averageWith(total) };
  if (averageWith(0) >= target) return { reach: true, need: 0 };
  let low = 0;
  let high = total;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (averageWith(mid) >= target) high = mid;
    else low = mid;
  }
  return { reach: true, need: Math.ceil(high) };
}

/**
 * Find the semester split (each quarter q percent, exam 100 - 2q percent) from a past report
 * card. Tries every half percent and keeps the splits whose rounded semester grade matches
 * every row. Only a single match is trusted; zero or several matches means "ask the student".
 * @param {{q1: number, q2: number, exam: number, semester: number}[]} pastRows
 * @returns {{quarterPercent: number, examPercent: number} | null}
 */
export function solveSemesterSplit(pastRows) {
  const fits = [];
  for (let q = 0; q <= 50; q += 0.5) {
    const exam = 100 - 2 * q;
    const matchesAll = pastRows.length && pastRows.every(
      p => Math.round((q * (p.q1 + p.q2) + exam * p.exam) / 100) === p.semester,
    );
    if (matchesAll) fits.push(q);
  }
  return fits.length === 1 ? { quarterPercent: fits[0], examPercent: 100 - 2 * fits[0] } : null;
}

/**
 * Semester grade from two quarter grades and a final exam score.
 * @param {{quarterPercent: number, examPercent: number}} split
 * @param {number} q1
 * @param {number} q2
 * @param {number} exam
 * @returns {number}
 */
export function semesterGrade(split, q1, q2, exam) {
  return split.quarterPercent / 100 * (q1 + q2) + split.examPercent / 100 * exam;
}

/**
 * Final exam score needed for a target semester grade. Can be below 0 (any score works) or
 * above 100 (out of reach); the caller decides how to say that.
 * @param {{quarterPercent: number, examPercent: number}} split
 * @param {number} q1
 * @param {number} q2
 * @param {number} target
 * @returns {number}
 */
export function finalExamNeeded(split, q1, q2, target) {
  return (target - split.quarterPercent / 100 * (q1 + q2)) / (split.examPercent / 100);
}

/**
 * Apply a What if scenario to a class's rows. The real rows are never changed; this returns
 * a copy. Order matters and matches what a student means:
 *   1. a typed score replaces the gradebook score,
 *   2. a correction or retest score replaces that (it is the score that will be entered),
 *   3. a curve adds points on top,
 *   4. fake future assignments are added,
 *   5. "drop my lowest test" removes the lowest test by percent (only with 2+ tests).
 * @param {object[]} rows
 * @param {{scores: object, corrections: object, curve: object, fakeAssignments: object[],
 *          dropLowestTest: boolean}} scenario values are strings as typed ('' = not set)
 * @param {string} [testCategory='Test'] which category "test" means (real HAC: the heaviest one)
 * @returns {object[]}
 */
export function applyWhatIf(rows, scenario, testCategory = 'Test') {
  let result = rows.map(row => {
    let score = row.score;
    const typed = scenario.scores[row.id];
    const corrected = scenario.corrections[row.id];
    const curve = scenario.curve && scenario.curve[row.id];
    if (typed !== undefined && typed !== '') score = +typed;
    if (corrected !== undefined && corrected !== '') score = +corrected;
    if (curve && typeof score === 'number') score = score + (+curve);
    return Object.assign({}, row, { score });
  });
  result = result.concat((scenario.fakeAssignments || []).map(fake => ({
    id: fake.id, title: fake.name, category: fake.category, score: +fake.score, total: +fake.points,
    // Real HAC classes: the fake carries its category's weight, like the rows it joins.
    ...(fake.catWeight != null ? { catWeight: fake.catWeight } : {}),
  })));
  if (scenario.dropLowestTest) {
    const tests = result.filter(row => row.category === testCategory && isScored(row));
    if (tests.length > 1) {
      const lowest = tests.reduce((low, row) => (row.score / row.total < low.score / low.total ? row : low));
      result = result.filter(row => row !== lowest);
    }
  }
  return result;
}

// ---- GPA ---------------------------------------------------------------------------------

/**
 * @param {number} average
 * @returns {'A'|'B'|'C'|'D'|'F'}
 */
export const letterGrade = average =>
  average >= 90 ? 'A' : average >= 80 ? 'B' : average >= 70 ? 'C' : average >= 60 ? 'D' : 'F';

export const LETTER_POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };

/**
 * Weighted GPA bonus: honors, AP and dual credit add 1 point (to a passing letter only).
 * @param {string} level 'H' | 'AP' | 'DC' | 'R' | 'A'
 * @returns {0|1}
 */
export const weightBonus = level => (level === 'H' || level === 'AP' || level === 'DC' ? 1 : 0);

/**
 * Unweighted and weighted GPA on a 4 point scale.
 * @param {object[]} classes classes that count toward GPA (each has a level)
 * @param {(course: object) => string} letterFor letter grade for each class
 * @returns {{unweighted: number, weighted: number}}
 */
export function computeGpa(classes, letterFor) {
  let unweighted = 0;
  let weighted = 0;
  for (const course of classes) {
    const points = LETTER_POINTS[letterFor(course)];
    unweighted += points;
    weighted += points + (points > 0 ? weightBonus(course.level) : 0);
  }
  return { unweighted: unweighted / classes.length, weighted: weighted / classes.length };
}

/** The most a semester's weighted GPA can be on the 5 point honors scale. */
export const GPA_MAX = 5;

/** Weighted GPA over the finished semesters: the real semester GPAs when known. */
export function gpaSoFar(history) {
  const real = history.semesterGpas;
  if (real && real.length >= history.semestersDone && history.semestersDone > 0) {
    const done = real.slice(0, history.semestersDone);
    return done.reduce((sum, gpa) => sum + gpa, 0) / done.length;
  }
  return history.weightedSoFar;
}

/**
 * A letter mix that reaches a semester GPA (A = 4, B = 3, C = 2, plus 1 for each honors class).
 * @returns {{reachable: boolean, as: number, bs: number}}
 *   as > 0: that many As and the rest Bs. as <= 0: bs Bs and the rest Cs (bs <= 0: mostly Cs).
 */
export function semesterMix(perSemester, history) {
  const n = history.classesPerSemester;
  // Grade points needed per semester, before the honors bonus.
  const points = perSemester * n - history.honorsPerSemester;
  // Small epsilon so 7.000000001 As does not round up to 8.
  const as = Math.ceil(points - 3 * n - 1e-9);
  const reachable = !(perSemester > GPA_MAX || as > n);
  const bs = as <= 0 ? Math.ceil(points - 2 * n - 1e-9) : 0;
  return { reachable, as, bs };
}

/**
 * Weighted GPA needed every remaining semester to graduate at a goal, and a letter mix that
 * gets there.
 * @param {number} goal GPA wanted at graduation
 * @param {{weightedSoFar: number, semestersDone: number, semestersLeft: number,
 *          classesPerSemester: number, honorsPerSemester: number, semesterGpas?: number[]}} history
 * @returns {{perSemester: number, reachable: boolean, as: number, bs: number}}
 */
export function gpaGoalPlan(goal, history) {
  const { semestersDone, semestersLeft } = history;
  const perSemester = (goal * (semestersDone + semestersLeft) - gpaSoFar(history) * semestersDone) / semestersLeft;
  return { perSemester, ...semesterMix(perSemester, history) };
}

/** A semester number he typed, as a GPA from 0 to GPA_MAX, or null when it is not a number yet. */
export function lockedValue(text) {
  if (text == null || String(text).trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? Math.min(GPA_MAX, Math.max(0, value)) : null;
}

/**
 * Uneven semesters: the ones he set (locks) keep their number; the rest split what is left so
 * the graduation goal still holds. Locks on finished semesters are ignored.
 * @param {number} goal GPA wanted at graduation
 * @param {object} history as gpaGoalPlan
 * @param {Object<string, string>} locks semester number -> the GPA he typed for it
 * @returns {{rows: {semester: number, need: number, locked: boolean, reachable: boolean,
 *   as: number, bs: number}[], even: number, each: number|null, over: boolean,
 *   graduateAt: number|null, laterHeavier: boolean}}
 *   each: what every open semester needs (null when he set them all; graduateAt is then the
 *   GPA his numbers land on). over: the open semesters would need more than GPA_MAX.
 *   laterHeavier: Semester 7 or 8 needs more than an earlier semester left.
 */
export function gpaSplitPlan(goal, history, locks = {}) {
  const { semestersDone: done, semestersLeft: left } = history;
  const total = done + left;
  const soFar = gpaSoFar(history) * done;
  const semesters = Array.from({ length: left }, (_, i) => done + i + 1);
  const set = {};
  for (const semester of semesters) {
    const value = lockedValue(locks[semester]);
    if (value != null) set[semester] = value;
  }
  const setSum = Object.values(set).reduce((sum, value) => sum + value, 0);
  const open = semesters.filter(semester => !(semester in set));
  const each = open.length ? (goal * total - soFar - setSum) / open.length : null;
  const graduateAt = open.length ? null : (soFar + setSum) / total;
  const rows = semesters.map(semester => {
    const locked = semester in set;
    const need = locked ? set[semester] : Math.max(0, each);
    return { semester, need, locked, ...semesterMix(need, history) };
  });
  const over = each != null && each > GPA_MAX;
  const laterHeavier = !over && rows.some(row => row.semester > total - 2
    && rows.some(earlier => earlier.semester < row.semester && row.need > earlier.need + 0.005));
  return { rows, even: gpaGoalPlan(goal, history).perSemester, each, over, graduateAt, laterHeavier };
}

/**
 * Semester check in: the finished count went up since he last saw the page, so the newest
 * real semester GPA replaces the estimate. Null on the first look or when nothing changed.
 * @param {number|null} seen semesters done the last time he opened the page
 * @returns {{semester: number, gpa: number|null}|null}
 */
export function semesterCheckIn(seen, history) {
  if (seen == null || !(history.semestersDone > seen)) return null;
  const semester = history.semestersDone;
  const real = history.semesterGpas && history.semesterGpas[semester - 1];
  return { semester, gpa: real == null ? null : real };
}
