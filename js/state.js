/**
 * App state and the read-only questions views ask about it ("selectors").
 *
 * There is one mutable object, `state`. Actions change it, then render() redraws the whole
 * screen from it (see render.js). Nothing else holds UI state, except the few render
 * bookkeeping fields in `ui`.
 *
 * Naming: a class object is called `course` in code, because `class` is a keyword.
 */
import {
  CLASSES, PAST_REPORT_CARD, TEST_DATE_CATALOG, SEEN_CHANGES,
  SAMPLE_TODOS, SAMPLE_PACE,
} from './sample-data.js';
import { classAverage, averageEffect, isScored, countsAsZero, applyWhatIf, solveSemesterSplit } from './grade-math.js';
import { scoreText, relativeDay } from './format.js';
import { loadTheme } from './theme.js';

/** Students can type in classes HAC does not have (dual credit, self study AP), up to this many. */
export const TYPED_CLASS_LIMIT = 8;

/** Semester weights, solved once at setup from the past report card. */
export const SEMESTER_SPLIT = solveSemesterSplit(PAST_REPORT_CARD);

export const state = {
  // Intro slides, Pick a look, then sign in
  screen: 'intro', // 'intro' | 'theme' | 'signin' | 'app'
  introSlide: 0,
  introReturnTo: 'theme', // where Skip and Get started go: 'theme' on first open, 'app' from Settings
  theme: loadTheme(), // 'system' (Match my phone) | 'light' | 'dark', saved on the phone
  district: null,
  districtNotListed: false,

  // Navigation. Each tab keeps its own stack of pushed pages: [pageName, id?].
  tab: 'home', // 'home' | 'grades' | 'calendar' | 'bell'
  pageStacks: { home: [], grades: [], calendar: [], bell: [] },
  sheet: null, // open bottom sheet: { kind, ...details } or null
  scrollPositions: {}, // remembered scrollTop per route
  period: 'Q2', // marking period shown on Grades
  editingClasses: false,

  // Refresh from the gradebook (simulated in the preview)
  loading: false,
  lastUpdated: null,
  nextUpdateAllowedAt: 0, // a short cooldown, so the real app is gentle on HAC
  queuedScoreIndex: 0,
  banner: null, // { title, body, fresh }

  // Home
  firstOpen: false, // true on the Home right after sign in, until the student leaves it
  homeExpanded: {}, // to-do group key (or 'zero') -> true when its "N more" was tapped
  hideScores: false, // Settings: Home shows words instead of grades and points

  // To-dos
  doneIds: {}, // id -> 1 for every ticked to-do, checkpoint or assignment
  dueOverrides: {}, // row id -> the student's own due date (the teacher's date stays in HAC)
  todos: SAMPLE_TODOS,
  nextId: 4,
  testDatePicks: { chemt: 'A' }, // catalog key -> 'A' | 'B' day
  projectPace: SAMPLE_PACE,
  form: {}, // fields of the open Add to-do / Add a class sheet

  // Calendar
  calendarSelected: 0, // day offset
  calendarMonth: null, // months from the sample month, null = this month

  // Grades
  gradeChanges: [], // newest first, see seedGradeChanges below
  classOrder: CLASSES.map(course => course.id),
  hiddenClasses: {},
  typedClasses: [],
  graphSelection: {}, // class id -> selected point index on the grade graph

  // What if, GPA and other estimates. None of these ever change a real grade.
  whatIf: {}, // class id -> scenario, see whatIfFor
  savedScenarios: {}, // class id -> [{ name, scenario, average }]
  semesterInputs: {}, // class id -> { q1, q2, final, target }
  needCalc: { classId: 'alg', target: 90, kind: 'test' }, // 'test' | 'final'
  gpaWhatIf: {}, // class id -> letter
  finals: { target: 90 },
  gpaGoal: '4.3',

  // Settings
  alertUnder: 85,
  alertRules: { newGrade: true, under: true, zero: true, changed: true }, // Settings: what sends an alert
  alertsUnread: 3, // rows on the Alerts page still marked new, cleared when the student leaves it
  hacDown: false, // preview only: ?hac=1 shows the 'can't read your gradebook' state
  mutedClasses: {},
  retestLine: 80, // picked at setup
  retestLineCustom: false,
  faceIdOn: true,
  locked: false,
  widgets: {
    due: { size: 'small', classId: 'all' },
    test: { size: 'small', classId: 'all' },
    change: { size: 'medium', classId: 'all' },
  },

  // Bell
  bellDay: 'A',
  tapeScrollTop: null, // where the student scrolled the tape; null = scroll to now on the next draw
  openedAt: Date.now(), // drives the sample clock
};

/** Render bookkeeping: what was on screen last time, to keep scroll and skip replaying animations. */
export const ui = { lastRouteKey: '', lastSheetKey: '', lastAnimKey: '', lastIntroSlide: null, lastTapeDay: null };

// ---- Classes ------------------------------------------------------------------------------

export const findClass = id =>
  CLASSES.find(course => course.id === id) || state.typedClasses.find(course => course.id === id);

export const orderedClasses = () => state.classOrder.map(findClass).filter(Boolean);

export const visibleClasses = () => orderedClasses().filter(course => !state.hiddenClasses[course.id]);

export function rowsForPeriod(course) {
  if (state.period === 'Q2') return course.rows || [];
  if (state.period === 'Q1') return course.q1rows || [];
  return [];
}

/** Average for the marking period on screen. Typed in classes only have the grade they typed. */
export function periodAverage(course) {
  if (course.typed) return state.period === 'Q2' ? course.grade : null;
  // Real data: HAC's printed average, never our own math.
  if (course.real) return state.period === 'Q2' ? course.hacAverage : null;
  return classAverage(rowsForPeriod(course));
}

/** @returns {{course: object, row: object} | null} */
export function findRow(id) {
  for (const course of CLASSES) {
    for (const row of course.rows.concat(course.q1rows)) {
      if (row.id === id) return { course, row };
    }
  }
  return null;
}

// ---- Rows ---------------------------------------------------------------------------------

/** The student's own due date if they moved it, otherwise the teacher's. */
export const effectiveDue = row => (row.id in state.dueOverrides ? state.dueOverrides[row.id] : row.due);

export const isMissing = row => row.missing && !isScored(row);

/** Graded test under the retest line the student picked at setup. */
export const isUnderRetestLine = row =>
  row.category === 'Test' && isScored(row) && row.score / row.total * 100 < state.retestLine;

/** Every missing row in every class. */
export function missingWork() {
  const result = [];
  for (const course of CLASSES) {
    for (const row of course.rows) if (isMissing(row)) result.push({ course, row });
  }
  return result;
}

// ---- To-dos --------------------------------------------------------------------------------

/**
 * Everything that shows up as a to-do, from four sources:
 *   'gradebook'  blank gradebook rows due today or later
 *   'typed'      to-dos the student typed in
 *   'testDate'   test dates picked from Test Date Radar
 *   'checkpoint' History Project pace checkpoints
 * (Home adds a fifth, 'missing', for missing work.)
 */
export function todoItems() {
  const items = [];
  for (const course of CLASSES) {
    for (const row of course.rows) {
      const blank = !isScored(row) && !row.mark && !row.missing && !row.pending;
      if (blank && row.due != null && row.due >= 0) {
        items.push({
          id: row.id, title: row.title, detail: course.name, due: effectiveDue(row),
          source: 'gradebook', rowId: row.id, category: row.category, big: row.big,
        });
      }
    }
  }
  for (const todo of state.todos) {
    items.push({ id: todo.id, title: todo.title, detail: '', due: todo.due, source: 'typed' });
  }
  for (const test of TEST_DATE_CATALOG) {
    const day = state.testDatePicks[test.key];
    if (day) {
      items.push({
        id: test.key, title: test.title, detail: 'Test date, ' + day + ' day',
        due: test.due[day], source: 'testDate', category: 'Test',
      });
    }
  }
  state.projectPace.forEach((checkpoint, i) => items.push({
    id: 'cp' + i, title: checkpoint.title, detail: 'History Project checkpoint',
    due: checkpoint.due, source: 'checkpoint',
  }));
  return items;
}

/** Sort in place by due date (no date last), then by title. */
export const sortByDue = items =>
  items.sort((a, b) => (a.due ?? 9e9) - (b.due ?? 9e9) || a.title.localeCompare(b.title));

// ---- What if ------------------------------------------------------------------------------

/** The What if scenario for a class, created empty on first use. */
export function whatIfFor(classId) {
  if (!state.whatIf[classId]) {
    state.whatIf[classId] = {
      scores: {}, // row id -> typed score
      corrections: {}, // row id -> score after corrections or a retest
      fakeAssignments: [],
      dropLowestTest: false,
      curve: {}, // row id -> points added
      draft: { name: '', category: 'Test', points: '100', score: '' }, // Add a fake assignment form
    };
  }
  return state.whatIf[classId];
}

export const whatIfAverage = (course, scenario = whatIfFor(course.id)) =>
  classAverage(applyWhatIf(course.rows, scenario));

/** Blank rows still to come, the ones Quick fill fills in. */
export const blankRowsLeft = course => course.rows.filter(
  row => !isScored(row) && !countsAsZero(row) && !row.pending && row.due != null && row.due >= 0,
);

// ---- Grade change log -------------------------------------------------------------------

export function gradeChangeEntry(course, row, before, after, when, day = 0) {
  return {
    classId: course.id, title: row.title, category: row.category, scoreText: scoreText(row),
    underRetestLine: isUnderRetestLine(row), before, after, when, day,
  };
}

for (const [classId, title] of sortedSeenChanges()) {
  const course = findClass(classId);
  const row = course.rows.find(candidate => candidate.title === title);
  const when = relativeDay(row.due);
  const effect = averageEffect(course.rows, row);
  const after = classAverage(course.rows);
  state.gradeChanges.push(gradeChangeEntry(course, row, after - effect, after, when, row.due));
}

/** SEEN_CHANGES newest first, by the day of each row. */
function sortedSeenChanges() {
  const day = ([classId, title]) => findClass(classId).rows.find(row => row.title === title).due;
  return [...SEEN_CHANGES].sort((a, b) => day(b) - day(a));
}

// ---- Render keys ---------------------------------------------------------------------------

/** Changes when a different sheet opens, so its slide-up animation plays once, not on every redraw. */
export const sheetAnimKey = () => (state.sheet ? state.sheet.kind + (state.sheet.id || '') : '');

/** Changes when the sheet's content changes (another What if tool), so its scroll position resets. */
export const sheetScrollKey = () =>
  (state.sheet ? state.sheet.kind + (state.sheet.tool || '') + (state.sheet.id || '') : '');

/** One key per screen, to remember each screen's scroll position. */
export const routeKey = () =>
  state.screen + '/' + state.tab + '/' + state.pageStacks[state.tab].map(page => page.join(':')).join('/');
