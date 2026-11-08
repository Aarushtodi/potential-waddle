/**
 * Everything a tap or a keystroke can do.
 *
 * actions: called by the click listener in app.js with (x, y, element, event) from the
 *   tapped element's data-action, data-x and data-y. They change state; app.js then calls
 *   render(). Returning false skips that render (the action rendered already, or did nothing).
 * inputHandlers: called on every keystroke with (value, x, y) from data-input, data-x, data-y.
 *   They change state; app.js then refreshes only the live regions so the input keeps focus.
 */
import { offsetFromIso, isoDate } from './format.js';
import { classAverage, isScored } from './grade-math.js';
import { QUEUED_SCORES, PACED_PROJECT_ROW_ID } from './sample-data.js';
import {
  state, ui, TYPED_CLASS_LIMIT, findClass, findRow, effectiveDue,
  whatIfFor, whatIfAverage, blankRowsLeft, gradeChangeEntry,
} from './state.js';
import { render } from './render.js';
import { alertText } from './views/changes.js';
import { INTRO_SLIDE_COUNT } from './views/intro.js';

// ---- Refresh from the gradebook (simulated) ----------------------------------------------

const REFRESH_MS = 1300;
const UPDATE_COOLDOWN_MS = 6e4;
const BANNER_MS = 6000;

/**
 * Show the loading state, then "finish" loading. With applyScores, one queued sample score
 * arrives (the real app would read HAC here) and the Update button cools down for a minute.
 */
export function startRefresh(applyScores) {
  if (state.loading) return;
  state.loading = true;
  render();
  setTimeout(() => {
    state.loading = false;
    state.lastUpdated = Date.now();
    if (applyScores) {
      state.nextUpdateAllowedAt = Date.now() + UPDATE_COOLDOWN_MS;
      applyNextQueuedScore();
    }
    render();
  }, REFRESH_MS);
}

function applyNextQueuedScore() {
  const queued = QUEUED_SCORES[state.queuedScoreIndex];
  if (!queued) return;
  state.queuedScoreIndex++;
  const course = findClass(queued.classId);
  const row = course.rows.find(candidate => candidate.title === queued.title);
  const before = classAverage(course.rows);
  row.score = queued.score;
  delete row.pending;
  const after = classAverage(course.rows);
  const change = gradeChangeEntry(course, row, before, after, 'Just now');
  state.gradeChanges.unshift(change);
  if (!state.mutedClasses[course.id]) showBanner(course.name, alertText(change));
}

let bannerTimer;
function showBanner(title, body) {
  state.banner = { title, body, fresh: true };
  // Slide in only on the first render; later renders show it in place.
  setTimeout(() => {
    if (state.banner) state.banner.fresh = false;
  }, 400);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    state.banner = null;
    render();
  }, BANNER_MS);
}

const currentStack = () => state.pageStacks[state.tab];

// ---- Actions ------------------------------------------------------------------------------

export const actions = {
  // Intro slides
  nextIntroSlide() {
    if (state.introSlide < INTRO_SLIDE_COUNT - 1) state.introSlide++;
    else actions.skipIntro();
  },
  previousIntroSlide() {
    if (state.introSlide > 0) state.introSlide--;
  },
  skipIntro() {
    state.screen = state.introReturnTo;
  },
  /** Settings > Show intro again. Leaving it goes back to Settings, not to sign in. */
  showIntro() {
    state.introSlide = 0;
    state.introReturnTo = 'app';
    state.screen = 'intro';
  },

  // Sign in
  openDistrictPicker() {
    state.sheet = { kind: 'district' };
  },
  pickDistrict(name) {
    state.district = name || null;
    state.districtNotListed = !name;
    state.sheet = null;
  },
  signIn() {
    state.screen = 'app';
    state.tab = 'home';
    startRefresh(false);
    return false;
  },
  signOut() {
    state.screen = 'signin';
    state.district = null;
    state.districtNotListed = false;
    state.editingClasses = false;
    state.tab = 'home';
    Object.keys(state.pageStacks).forEach(tab => (state.pageStacks[tab] = []));
    state.lastUpdated = null;
  },

  // Navigation
  switchTab(tab) {
    // Tapping the tab you are on goes back to its root page, like iOS.
    if (state.tab === tab) state.pageStacks[tab] = [];
    state.tab = tab;
    state.editingClasses = false;
  },
  openPage(name, id) {
    state.editingClasses = false;
    currentStack().push(id != null ? [name, id] : [name]);
  },
  back() {
    currentStack().pop();
  },
  openBell() {
    state.tab = 'bell';
    state.pageStacks.bell = [];
  },
  openSheet(kind) {
    state.form = {};
    state.sheet = { kind };
  },
  closeSheet() {
    state.sheet = null;
    state.form = {};
  },
  tapOutsideSheet(x, y, element, event) {
    // Only taps on the dimmed backdrop itself close the sheet, not taps inside it.
    if (event.target !== element) return false;
    state.sheet = null;
    state.form = {};
  },
  refresh() {
    startRefresh(true);
    return false;
  },

  // To-dos
  openTask(id) {
    state.sheet = { kind: 'task', id };
  },
  toggleDone(id) {
    if (state.doneIds[id]) delete state.doneIds[id];
    else state.doneIds[id] = 1;
  },
  resetDue(rowId) {
    delete state.dueOverrides[rowId];
  },
  deleteTodo(id) {
    state.todos = state.todos.filter(todo => todo.id !== id);
    state.sheet = null;
  },
  toggleFormDueDate() {
    state.form.hasDate = !state.form.hasDate;
  },
  saveTodo() {
    const title = (state.form.title || '').trim();
    if (!title) return false;
    const due = state.form.hasDate ? offsetFromIso(state.form.due || isoDate(1)) : null;
    state.todos.push({ id: 't' + state.nextId++, title, due });
    state.sheet = null;
    state.form = {};
  },
  pickTestDay(day, key) {
    if (day === 'off') delete state.testDatePicks[key];
    else state.testDatePicks[key] = day;
  },
  openPace() {
    state.sheet = null;
    currentStack().push(['pace']);
  },
  openAssignment(rowId) {
    state.sheet = null;
    currentStack().push(['assignment', rowId]);
  },
  moveCheckpoint(index, days) {
    const checkpoint = state.projectPace[+index];
    const projectDue = effectiveDue(findRow(PACED_PROJECT_ROW_ID).row);
    const moved = checkpoint.due + +days;
    // Checkpoints stay between today and the project's due date.
    if (moved >= 0 && moved <= projectDue) checkpoint.due = moved;
  },

  // Grades list
  toggleEditClasses() {
    state.editingClasses = !state.editingClasses;
  },
  openPeriodPicker() {
    state.sheet = { kind: 'period' };
  },
  setPeriod(period) {
    state.period = period;
    state.sheet = null;
  },
  moveClass(id, direction) {
    const order = state.classOrder;
    const from = order.indexOf(id);
    const to = from + +direction;
    if (to >= 0 && to < order.length) [order[from], order[to]] = [order[to], order[from]];
  },
  toggleHideClass(id) {
    state.hiddenClasses[id] = !state.hiddenClasses[id];
  },
  removeTypedClass(id) {
    state.typedClasses = state.typedClasses.filter(course => course.id !== id);
    state.classOrder = state.classOrder.filter(other => other !== id);
  },
  pickClassLevel(level) {
    state.form.classLevel = level;
  },
  saveClass() {
    const name = (state.form.className || '').trim();
    const grade = parseFloat(state.form.classGrade);
    if (!name || isNaN(grade) || state.typedClasses.length >= TYPED_CLASS_LIMIT) return false;
    const level = state.form.classLevel || 'DC';
    const id = 'x' + state.nextId++;
    const levelName = { DC: 'dual credit', AP: 'self study AP', R: 'regular' }[level];
    state.typedClasses.push({
      id, typed: true, name, grade, level, levelName, teacher: '', absences: 0, tardies: 0, rows: [],
    });
    state.classOrder.push(id);
    state.sheet = null;
    state.form = {};
  },

  // One class
  openEmailDraft(classId, rowId) {
    state.sheet = { kind: 'email', classId, rowId };
  },
  selectGraphPoint(classId, index) {
    state.graphSelection[classId] = +index;
  },

  // What if
  openWhatIf(classId) {
    state.sheet = { kind: 'whatIf', classId, tool: null };
  },
  openWhatIfTool(tool) {
    state.sheet.tool = tool || null;
    if (tool === 'need') state.needCalc.classId = state.sheet.classId;
  },
  resetWhatIf(classId) {
    delete state.whatIf[classId];
  },
  openGpaGoal() {
    state.sheet = null;
    currentStack().push(['gpaGoal']);
  },
  pickFakeCategory(category, classId) {
    whatIfFor(classId).draft.category = category;
  },
  addFakeAssignment(classId) {
    const scenario = whatIfFor(classId);
    const draft = scenario.draft;
    if (!draft.name.trim() || !(+draft.points > 0) || draft.score === '') return false;
    scenario.fakeAssignments.push({
      id: 'f' + state.nextId++, name: draft.name.trim(), category: draft.category,
      points: draft.points, score: draft.score,
    });
    // Keep category and points for the next one; most fake assignments look alike.
    scenario.draft = { name: '', category: draft.category, points: draft.points, score: '' };
  },
  removeFakeAssignment(classId, fakeId) {
    const scenario = whatIfFor(classId);
    scenario.fakeAssignments = scenario.fakeAssignments.filter(fake => fake.id !== fakeId);
  },
  toggleDropLowest(classId) {
    const scenario = whatIfFor(classId);
    scenario.dropLowestTest = !scenario.dropLowestTest;
  },
  /**
   * Quick fill: type a score into every blank row still to come. "Your usual" is the
   * student's percent so far in that row's category (or the class average if none yet).
   */
  quickFill(classId, value) {
    const course = findClass(classId);
    const scenario = whatIfFor(classId);
    for (const row of blankRowsLeft(course)) {
      let percent = +value;
      if (value === 'usual') {
        const same = course.rows.filter(other => other.category === row.category && isScored(other));
        percent = same.length
          ? same.reduce((sum, other) => sum + other.score, 0) / same.reduce((sum, other) => sum + other.total, 0) * 100
          : classAverage(course.rows);
      }
      scenario.scores[row.id] = String(Math.round(percent / 100 * row.total * 10) / 10);
    }
  },
  saveScenario(classId) {
    const course = findClass(classId);
    const saved = state.savedScenarios[classId] || (state.savedScenarios[classId] = []);
    const scenario = JSON.parse(JSON.stringify(whatIfFor(classId)));
    saved.push({ name: 'Scenario ' + (saved.length + 1), scenario, average: whatIfAverage(course, scenario) });
    state.sheet.tool = 'scenarios';
  },
  deleteScenario(classId, index) {
    state.savedScenarios[classId].splice(+index, 1);
  },

  // GPA tools
  needPickClass(classId) {
    state.needCalc.classId = classId;
  },
  needPickKind(kind) {
    state.needCalc.kind = kind;
  },
  setGpaWhatIfLetter(letter, classId) {
    state.gpaWhatIf[classId] = letter;
  },
  resetGpaWhatIf() {
    state.gpaWhatIf = {};
  },

  // Alerts
  showSampleAlert() {
    const latest = state.gradeChanges[0];
    showBanner(findClass(latest.classId).name, alertText(latest));
  },
  tapBanner() {
    state.banner = null;
    state.tab = 'grades';
    state.pageStacks.grades = [['changes']];
  },

  // Calendar
  selectDay(offset) {
    state.calendarSelected = +offset;
  },
  changeMonth(direction) {
    state.calendarMonth = (state.calendarMonth ?? 0) + +direction;
  },

  // Bell
  pickBellLook(look) {
    state.bellLook = look;
    state.bellSelected = null;
    state.tapeScrollTop = null;
  },
  pickBellDay(day) {
    state.bellDay = day;
    state.bellSelected = null;
    state.tapeScrollTop = null;
  },
  selectPeriod(index) {
    state.bellSelected = +index;
  },

  // Settings
  toggleMute(classId) {
    state.mutedClasses[classId] = !state.mutedClasses[classId];
  },
  pickRetestLine(value) {
    if (value === 'own') {
      state.retestLineCustom = true;
    } else {
      state.retestLineCustom = false;
      state.retestLine = +value;
    }
  },
  toggleFaceId() {
    state.faceIdOn = !state.faceIdOn;
    if (state.faceIdOn) actions.lock();
  },
  /** Fake Face ID: cover the app, "unlock" after 1.3 s. */
  lock() {
    state.locked = true;
    setTimeout(actions.unlock, 1300);
  },
  /** Reopening after Face ID lands on Home and refreshes, like opening the app fresh. */
  unlock() {
    if (!state.locked) return false;
    state.locked = false;
    state.tab = 'home';
    state.pageStacks.home = [];
    state.scrollPositions = {};
    ui.lastRouteKey = '';
    state.lastUpdated = null;
    startRefresh(false);
    return false;
  },
  pickWidgetSize(size, kind) {
    state.widgets[kind].size = size;
  },
  pickWidgetClass(kind, classId) {
    state.widgets[kind].classId = classId;
  },
};

// ---- Inputs -------------------------------------------------------------------------------

export const inputHandlers = {
  renameClass(value, classId) {
    findClass(classId).name = value;
  },
  whatIfScore(value, classId, rowId) {
    whatIfFor(classId).scores[rowId] = value;
  },
  whatIfCorrection(value, classId, rowId) {
    whatIfFor(classId).corrections[rowId] = value;
  },
  whatIfCurve(value, classId, rowId) {
    whatIfFor(classId).curve[rowId] = value;
  },
  fakeAssignmentField(value, classId, field) {
    whatIfFor(classId).draft[field] = value;
  },
  finalsTarget(value) {
    state.finals.target = value;
  },
  needTarget(value) {
    state.needCalc.target = value;
  },
  semesterInput(value, classId, field) {
    state.semesterInputs[classId][field] = value;
  },
  renameScenario(value, classId, index) {
    state.savedScenarios[classId][+index].name = value;
  },
  gpaGoal(value) {
    state.gpaGoal = value;
  },
  alertUnder(value) {
    state.alertUnder = +value || 0;
  },
  retestLine(value) {
    state.retestLine = +value || 0;
  },
  renameCheckpoint(value, index) {
    state.projectPace[+index].title = value;
  },
  formField(value, field) {
    state.form[field] = value;
  },
};

/** The date picker on a to-do: moves a typed to-do, a checkpoint, or the student's copy of a gradebook due date. */
export function changeDueDate(itemId, isoValue) {
  const due = offsetFromIso(isoValue);
  const todo = state.todos.find(candidate => candidate.id === itemId);
  if (todo) todo.due = due;
  else if (/^cp/.test(itemId)) state.projectPace[+itemId.slice(2)].due = due;
  else if (findRow(itemId)) state.dueOverrides[itemId] = due;
}
