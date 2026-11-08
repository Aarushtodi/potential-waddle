/**
 * SAMPLE DATA ONLY.
 *
 * Every district, class, teacher, score and date below is made up for the preview.
 * The real app pulls all of this from HAC (Home Access Center), the district gradebook,
 * exactly as the teacher entered it. Nothing here is ever sent anywhere.
 *
 * Dates are day offsets from the sample "today" (see SAMPLE_TODAY in format.js):
 * -12 means twelve days ago, 5 means five days from now, null means no due date.
 */

/**
 * One gradebook row, the way HAC shows it.
 * Extra flags, all optional:
 *   missing: 1   teacher marked it missing (counts as 0)
 *   mark: 'ABS'  absent / 'INC' incomplete, entered instead of a score (counts as 0)
 *   pending: 1   turned in, no score yet
 *   big: 1       a long project, gets a suggested pace of checkpoints
 *   old: 1       last quarter's row, read only
 */
function assignment(title, category, due, score, total, extra) {
  return Object.assign({ title, category, due, score, total }, extra || {});
}

/** level: 'H' honors (adds 1 to weighted GPA), 'R' regular, 'A' advisory (left out of GPA). */
export const CLASSES = [
  {
    id: 'alg', name: 'Algebra II Honors', teacher: 'Mr. Sample', room: 'Room 214',
    level: 'H', absences: 1, tardies: 0, q1: 93,
    rows: [
      assignment('Unit 1 Test', 'Test', -50, 88, 100),
      assignment('Graphing Lab', 'Lab', -20, 18, 20),
      assignment('Unit 2 Test', 'Test', -30, 92, 100),
      assignment('Unit 3 Test', 'Test', -12, 72, 100),
      assignment('Problem Set 6', 'HW', -9, 8, 10),
      assignment('Problem Set 7', 'HW', -2, null, 20, { missing: 1 }),
      assignment('Problem Set 8', 'HW', 1, null, 10),
      assignment('Unit 4 Test', 'Test', 5, null, 100),
    ],
  },
  {
    id: 'chem', name: 'Chemistry Honors', teacher: 'Dr. Placeholder', room: 'Room 118',
    level: 'H', absences: 0, tardies: 1, q1: 89,
    rows: [
      assignment('Atoms Test', 'Test', -40, 91, 100),
      assignment('Flame Lab', 'Lab', -25, 46, 50),
      assignment('Bonding Test', 'Test', -18, 84, 100),
      assignment('Worksheet 9', 'HW', -6, null, 10, { mark: 'ABS' }),
      assignment('Reactions Test', 'Test', -1, null, 100, { pending: 1 }),
      assignment('Titration Lab', 'Lab', 0, null, 50),
    ],
  },
  {
    id: 'eng', name: 'English 10 Honors', teacher: 'Ms. Example', room: 'Room 305',
    level: 'H', absences: 0, tardies: 0, q1: 95,
    rows: [
      assignment('Essay 1', 'Test', -35, 89, 100),
      assignment('Grammar Check', 'HW', -26, 9, 10),
      assignment('Short Story Notes', 'HW', -19, 18, 20),
      assignment('Essay 2', 'Test', -14, 94, 100),
      assignment('Reading Notes', 'HW', -5, 17, 20),
      assignment('Vocabulary Packet', 'HW', -3, null, 14, { missing: 1 }),
      assignment('Chapter 6 Reading', 'HW', 1, null, 10),
    ],
  },
  {
    id: 'span', name: 'Spanish II', teacher: 'Sra. Muestra', room: 'Room 122',
    level: 'R', absences: 2, tardies: 0, q1: 88,
    rows: [
      assignment('Unidad 3 Test', 'Test', -22, 86, 100),
      assignment('Speaking Check', 'Test', -8, 90, 100),
      assignment('Workbook 4', 'HW', -4, 18, 20),
      assignment('Workbook 5', 'HW', -1, null, 20, { pending: 1 }),
      assignment('Vocabulario 7', 'HW', 0, null, 10),
    ],
  },
  {
    id: 'hist', name: 'AP World History', teacher: 'Coach Demo', room: 'Room 210',
    level: 'H', absences: 0, tardies: 2, q1: 84,
    rows: [
      assignment('Period 1 Test', 'Test', -28, 81, 100),
      assignment('Period 2 Test', 'Test', -10, 76, 100),
      assignment('Reading Quiz', 'HW', -4, 9, 10),
      assignment('History Project', 'Test', 10, null, 100, { big: 1 }),
    ],
  },
  {
    id: 'cs', name: 'Computer Science', teacher: 'Mx. Madeup', room: 'Lab 3',
    level: 'R', absences: 0, tardies: 0, q1: 97,
    rows: [
      assignment('Loops Project', 'Lab', -16, 98, 100),
      assignment('Arrays Test', 'Test', -7, 95, 100),
    ],
  },
  {
    id: 'pe', name: 'Health and PE', teacher: 'Coach Testcase', room: 'Gym',
    level: 'R', absences: 1, tardies: 0, q1: 100,
    rows: [
      assignment('Fitness Check', 'HW', -11, 50, 50),
      assignment('Locker Form', 'HW', null, null, 5),
    ],
  },
  {
    id: 'adv', name: 'Advisory', teacher: 'Ms. Example', room: 'Room 305',
    level: 'A', absences: 0, tardies: 0, q1: null,
    rows: [],
  },
];

// Row ids are the class id plus the row index ("alg3"). Quarter 1 is shown as two summary
// rows at the Q1 grade, just enough for the Marking period picker to have something to show.
for (const course of CLASSES) {
  course.rows.forEach((row, i) => (row.id = course.id + i));
  course.q1rows = course.q1 == null ? [] : [
    assignment('Quarter 1 Test', 'Test', -70, course.q1, 100, { id: course.id + 'q0', old: 1 }),
    assignment('Quarter 1 Homework', 'HW', -75, course.q1, 100, { id: course.id + 'q1', old: 1 }),
  ];
}

/**
 * Last year's report card (sample). The district does not publish how a semester grade is
 * built from Q1, Q2 and the exam, so the app works the split out from a real past report
 * card instead of guessing (see solveSemesterSplit in grade-math.js).
 */
export const PAST_REPORT_CARD = [
  { course: 'Algebra I', q1: 94, q2: 86, exam: 62, semester: 86 },
  { course: 'Biology', q1: 88, q2: 92, exam: 80, semester: 89 },
  { course: 'English 9', q1: 91, q2: 95, exam: 98, semester: 94 },
  { course: 'World Geography', q1: 85, q2: 79, exam: 99, semester: 85 },
];

/**
 * Test dates the student opted into from Test Date Radar (a separate project).
 * The date depends on whether the class meets on an A day or a B day.
 */
export const TEST_DATE_CATALOG = [
  { key: 'chemt', name: 'Chemistry', teacher: 'Dr. Placeholder', title: 'Chemistry Test', due: { A: 7, B: 8 } },
  { key: 'histt', name: 'AP World', teacher: 'Coach Demo', title: 'AP World Test', due: { A: 13, B: 14 } },
  { key: 'algt', name: 'Algebra II', teacher: 'Mr. Sample', title: 'Algebra II Quiz', due: { A: 3, B: 4 } },
];

/** Bell schedule, minutes after midnight. Sample "today" is an A day. */
export const BELL_SCHEDULE = {
  A: [
    { classId: 'alg', start: 510, end: 600 },
    { classId: 'chem', start: 606, end: 696 },
    { classId: 'lunch', start: 696, end: 726 },
    { classId: 'eng', start: 732, end: 822 },
    { classId: 'span', start: 828, end: 920 },
  ],
  B: [
    { classId: 'hist', start: 510, end: 600 },
    { classId: 'cs', start: 606, end: 696 },
    { classId: 'lunch', start: 696, end: 726 },
    { classId: 'pe', start: 732, end: 822 },
    { classId: 'adv', start: 828, end: 920 },
  ],
};

/** The sample clock starts at 9:37 AM when the page opens and then runs in real time. */
export const SAMPLE_START_MINUTES = 577;

/** Each class average at this same point last quarter (what the phone saved last quarter). */
export const LAST_QUARTER_SAME_POINT = {
  alg: 90.4, chem: 87.9, eng: 93.2, span: 89.5, hist: 82.1, cs: 96, pe: 100,
};

/**
 * Grade changes already seen before the preview opens: [class id, row title].
 * Each one is dated the day of its row (its due offset), so "when" always matches the row.
 */
export const SEEN_CHANGES = [
  ['eng', 'Reading Notes'],
  ['cs', 'Arrays Test'],
  ['span', 'Speaking Check'],
  ['alg', 'Unit 3 Test'],
];

/** Scores that "arrive" one per Update tap, to show the refresh and the alert banner. */
export const QUEUED_SCORES = [
  { classId: 'chem', title: 'Reactions Test', score: 78 },
  { classId: 'span', title: 'Workbook 5', score: 16 },
];

export const SAMPLE_DISTRICTS = ['Maple Ridge ISD', 'Cedar Hollow ISD', 'Riverbend ISD', 'Sample Valley ISD'];

export const SAMPLE_TODOS = [
  { id: 't1', title: 'Get form signed', due: 0 },
  { id: 't2', title: 'Return library book', due: -1 },
  { id: 't3', title: 'Look at study guide', due: null },
];

/** Suggested checkpoints for the History Project (the row with big: 1). */
export const SAMPLE_PACE = [
  { title: 'Pick topic', due: 2 },
  { title: 'Research', due: 5 },
  { title: 'First draft', due: 8 },
  { title: 'Final', due: 10 },
];

/** Long term GPA goal page. */
export const SAMPLE_GPA_HISTORY = {
  weightedSoFar: 4.1,
  semestersDone: 3,
  semestersLeft: 5,
  classesPerSemester: 7,
  honorsPerSemester: 4,
};

/** Row id of the History Project, the one long project that gets a pace (row 3 of 'hist'). */
export const PACED_PROJECT_ROW_ID = 'hist3';
