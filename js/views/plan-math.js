/**
 * The numbers behind the Plan: the GPA goal (asked in Goals, edited on the Plan page), which
 * letters it takes to get there, and what each class needs on its next test or final. Made only
 * from the gradebook. Target (js/views/gpa.js needView) does the same math one class at a time.
 */
import { oneDecimal } from '../format.js';
import { computeGpa, finalExamNeeded, semesterGrade, classAverage } from '../grade-math.js';
import { state, SEMESTER_SPLIT, nowAverage, nextTestRow, neededOnNext } from '../state.js';
import { gpaClasses, gradebookLetter, gpaAverage, currentGpa } from './gpa.js';

export const A_LINE = 90;
const LINE_UP = { B: 90, C: 80, D: 70, F: 60 };
const ONE_UP = { B: 'A', C: 'B', D: 'C', F: 'D' };
const article = letter => (letter === 'A' || letter === 'F' ? 'an ' : 'a ') + letter;
const tenthUp = n => Math.ceil(n * 10 - 1e-9) / 10;
const tenthDown = n => Math.floor(n * 10 + 1e-9) / 10;

/** Lowest and highest GPA goal: a tenth above now, up to all As. null when all As already. */
export function gpaGoalRange() {
  const classes = gpaClasses();
  if (!classes.length) return null;
  const now = currentGpa();
  const low = tenthDown(now) + 0.1;
  const high = tenthDown(computeGpa(classes, () => 'A').weighted);
  return low <= high + 1e-9 ? { now, low, high } : null;
}

/** The GPA goal: what they set, or a tenth past now (3.57 makes 3.7). null when there is no room. */
export function gpaGoal() {
  const range = gpaGoalRange();
  if (!range) return null;
  const wanted = state.planGpa == null ? tenthUp(range.now + 0.1) : state.planGpa;
  return Math.min(range.high, Math.max(range.low, wanted));
}

export const gpaGoalText = goal => goal.toFixed(2);

/**
 * The fewest letters up that reach the goal, closest class to its next line first.
 * @returns {{ steps: {course, letter, line}[], gpa: number, reached: boolean }}
 *   steps: one per class, with the letter it ends on and the line it has to cross.
 */
export function lettersToGoal(goal) {
  const classes = gpaClasses();
  const letters = new Map(classes.map(course => [course.id, gradebookLetter(course)]));
  const gpaNow = () => computeGpa(classes, course => letters.get(course.id)).weighted;
  for (let guard = 0; guard < classes.length * 4 && gpaNow() < goal - 1e-9; guard++) {
    const next = classes.filter(course => ONE_UP[letters.get(course.id)])
      .sort((a, b) => (LINE_UP[letters.get(a.id)] - gpaAverage(a)) - (LINE_UP[letters.get(b.id)] - gpaAverage(b)))[0];
    if (!next) break;
    letters.set(next.id, ONE_UP[letters.get(next.id)]);
  }
  const steps = classes.filter(course => letters.get(course.id) !== gradebookLetter(course))
    .map(course => {
      const letter = letters.get(course.id);
      return { course, letter, line: { A: 90, B: 80, C: 70, D: 60 }[letter] };
    })
    .sort((a, b) => (a.line - gpaAverage(a.course)) - (b.line - gpaAverage(b.course)));
  const gpa = gpaNow();
  return { steps, gpa, reached: gpa >= goal - 1e-9 };
}

/** "1 letter up", "2 letters up". */
export const lettersUpText = steps => {
  const n = steps.reduce((sum, step) => sum + letterDistance(gradebookLetter(step.course), step.letter), 0);
  return n === 1 ? '1 letter up' : `${n} letters up`;
};
const letterDistance = (from, to) => 'FDCBA'.indexOf(to) - 'FDCBA'.indexOf(from);

/** "Spanish II to an A". */
export const stepText = (step, name) => `${name} to ${article(step.letter)}`;

/** The next blank test in the gradebook, the one Target uses (a null due date still counts). */
export const nextTest = nextTestRow;

/**
 * The grade they want in a class: what they set on the Plan; else an A for an A goal class, else
 * the next letter up from where it is (an A class keeps its A).
 */
export function classTarget(course) {
  if (state.planTargets[course.id] != null) return state.planTargets[course.id];
  if (state.goalAClasses.includes(course.id)) return A_LINE;
  return LINE_UP[gradebookLetter(course)] || A_LINE;
}
export const TARGET_MIN = 90;
export const TARGET_MAX = 100;

/**
 * What a class needs to reach a grade, from the same math as Target, as { kind, text }:
 *   above  "5.9 above"                     already there
 *   test   "92 on Unit 5 Test"             the next test can do it (Target, Next test)
 *   final  "85 on the final"               one test can't, the final can (Target, Final)
 *   none   "Out of reach this semester"    not even 100 on the final
 * kind is the Target tab a tap opens.
 */
export function need(course, target) {
  const average = nowAverage(course);
  if (average == null) return { kind: 'none', text: '' };
  if (average >= target) return { kind: 'above', text: `${oneDecimal(average - target)} above` };
  const test = nextTest(course);
  const title = test ? test.title : 'the next test';
  const total = test ? test.total : 100;
  const result = neededOnNext(course, target, total);
  if (result.reach) {
    if (result.need <= 0) return { kind: 'test', text: `Any score on ${title}` };
    return { kind: 'test', text: `${result.need}${total === 100 ? '' : ' of ' + total} on ${title}` };
  }
  const exam = finalNeed(course, target);
  if (exam != null && exam <= 100) return { kind: 'final', text: finalLine(exam) };
  return { kind: 'none', text: 'Out of reach this semester' };
}

export const needLine = (course, target) => need(course, target).text;

/** Final exam score for a semester grade, Target's Final math. null without a Q1 grade. */
export function finalNeed(course, target) {
  const average = classAverage(course.rows);
  if (!SEMESTER_SPLIT || course.q1 == null || average == null) return null;
  return finalExamNeeded(SEMESTER_SPLIT, course.q1, average, target);
}

/** "87 on the final", "Any score on the final", "Over 100 on the final". */
export function finalLine(need) {
  if (need == null) return '';
  if (need <= 0) return 'Any score on the final';
  if (need > 100) return 'Over 100 on the final';
  return `${Math.ceil(need)} on the final`;
}

/** "an A" for 90, "a B" for 80, "a 91" for any other grade goal. */
export const targetName = target => ({ 90: 'an A', 80: 'a B', 70: 'a C', 60: 'a D' }[target] || `a ${target}`);

/**
 * The Finals line for one class, never an impossible number:
 *   "34 keeps an A"    already there, the final just can't sink it
 *   "85 for an A"      the final can get it there
 *   "Any score keeps an A"
 *   "Best 88.9"        not even 100 gets there: the best semester grade it can reach
 * reach: false only for "Best".
 */
export function finalPlan(course, target) {
  const exam = finalNeed(course, target);
  if (exam == null) return null;
  const average = classAverage(course.rows);
  const verb = average >= target ? 'keeps' : 'for';
  if (exam <= 0) return { reach: true, exam, text: `Any score ${verb === 'keeps' ? 'keeps' : 'gets'} ${targetName(target)}` };
  if (exam <= 100) return { reach: true, exam, text: `${Math.ceil(exam)} ${verb} ${targetName(target)}` };
  // Rounded down: 89.96 is not a 90 yet, so it never reads as the goal it misses.
  return { reach: false, exam, text: `Best ${tenthDown(semesterGrade(SEMESTER_SPLIT, course.q1, average, 100)).toFixed(1)}` };
}
