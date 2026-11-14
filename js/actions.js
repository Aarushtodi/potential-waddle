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
import { classAverage, isScored, lockedValue, gpaSplitPlan } from './grade-math.js';
import { CLASSES, QUEUED_SCORES, PACED_PROJECT_ROW_ID, SAMPLE_GPA_HISTORY } from './sample-data.js';
import {
  state, ui, TYPED_CLASS_LIMIT, findClass, findRow, effectiveDue,
  whatIfFor, whatIfAverage, blankRowsLeft, gradeChangeEntry, goalSteps, fakeCategory,
} from './state.js';
import { render } from './render.js';
import { alertText } from './views/changes.js';
import { bannerData } from './views/banner.js';
import { INTRO_SLIDE_COUNT } from './views/intro.js';
import { beforeToggle } from './views/done-motion.js';
import { THEMES, saveTheme, applyTheme, crossfade } from './theme.js';
import { leaveIntro } from './views/intro-motion.js';
import { goalPicked } from './views/goals-motion.js';
import { gpaGoal, gpaGoalRange, classTarget, TARGET_MIN, TARGET_MAX } from './views/plan-math.js';
import { real, reloadRealData } from './real-data.js';
import { forgetImport } from './hac-import.js';
import { forgetHacSchedule } from './bell-store.js';
import { forgetHacAdds } from './hac-adds-store.js';

// ---- Refresh from the gradebook (simulated) ----------------------------------------------

const REFRESH_MS = 1300;
const UPDATE_COOLDOWN_MS = 6e4;
const BANNER_MS = 6000;
/** The last Goals question is a single pick: it moves on this long after the pop. */

/**
 * Show the loading state, then "finish" loading. With applyScores, one queued sample score
 * arrives (the real app would read HAC here) and the Update button cools down for a minute.
 */
export function startRefresh(applyScores) {
  if (state.loading) return;
  if (real.on && real.source === 'paste') {
    // Pasted grades: the Tally bookmark on HAC is the refresh, so open the paste box.
    openImport();
    render();
    return;
  }
  state.loading = true;
  render();
  if (real.on) {
    // One real HAC read through local/real_server.py. The server holds the 1 minute limit and
    // the stop after a rejected login; a failed read keeps every grade on screen.
    reloadRealData().then(status => {
      state.loading = false;
      if (real.pulledAt) state.lastUpdated = real.pulledAt * 1000;
      state.nextUpdateAllowedAt = Date.now() + UPDATE_COOLDOWN_MS;
      if (status.kind === 'ok' && !status.refused) state.classOrder = keepOrder(state.classOrder);
      render();
    });
    return;
  }
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

/** Paste your grades, remembering where Back goes. */
function openImport() {
  state.importFrom = state.screen === 'app' ? 'app' : 'signin';
  state.screen = 'import';
  state.importError = '';
  state.sheet = null;
}

/** After a real reload: keep the student's order, add any new class at the end. */
function keepOrder(order) {
  const ids = CLASSES.map(course => course.id);
  return order.filter(id => ids.includes(id)).concat(ids.filter(id => !order.includes(id)));
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
  if (!state.mutedClasses[course.id]) showBanner(course.name, alertText(change), change);
}

/** After a reload to a new build (js/fresh.js): the sample scores that already came in, no banner. */
export function replayQueuedScores() {
  QUEUED_SCORES.slice(0, state.queuedScoreIndex).forEach(queued => {
    const row = findClass(queued.classId)?.rows.find(candidate => candidate.title === queued.title);
    if (!row) return;
    row.score = queued.score;
    delete row.pending;
  });
}

let bannerTimer;
function showBanner(title, body, change) {
  state.banner = { title, body, fresh: true, data: bannerData(change) };
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
    else return actions.skipIntro();
  },
  previousIntroSlide() {
    if (state.introSlide > 0) state.introSlide--;
  },
  skipIntro() {
    // The next screen pushes in from the right, one more page after the slides.
    leaveIntro(() => {
      state.screen = state.introReturnTo;
      render();
    });
    return false;
  },
  /** Settings > Show intro again. Leaving it goes back to Settings, skipping Pick a look and Goals. */
  showIntro() {
    // The slides are drawn from a sample class; real grades replaced it, so the row is hidden there.
    if (real.on) return false;
    state.introSlide = 0;
    state.introReturnTo = 'app';
    state.screen = 'intro';
  },

  // Appearance (Pick a look screen and Settings): applies right away with a crossfade.
  pickTheme(theme, _y, element) {
    if (!THEMES.includes(theme) || theme === state.theme) return false;
    const root = document.documentElement;
    if (root.classList.contains('motion') && element && element.closest('.seg')) {
      // Settings picker: the pill slides first (js/views/app-motion.js), then only the colors
      // crossfade, so the old and new pickers line up and no label shows twice.
      state.theme = theme;
      saveTheme(theme);
      render();
      const wait = parseFloat(getComputedStyle(root).getPropertyValue('--t-enter')) || 0;
      setTimeout(() => crossfade(() => {
        applyTheme(state.theme);
        render();
      }), wait);
      return false;
    }
    crossfade(() => {
      state.theme = theme;
      saveTheme(theme);
      applyTheme(theme);
      render();
    });
    return false;
  },
  finishThemePick() {
    // Goals come next, so the plan is built from the real grades sign in just read.
    // It pushes in from the right, like the step before it.
    leaveIntro(() => {
      state.screen = 'goals';
      state.goalStage = 'ask';
      state.goalStep = 0;
      render();
    });
    return false;
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
    // A sign in opens like a fresh app: every screen at the top, so on a 2nd sign in Home shows the
    // goal cards first, not where it was scrolled before sign out (cleared before goalsStart renders).
    state.scrollPositions = {};
    // Picks kept from an earlier sign in: straight to Home, no second intro, look or Goals setup.
    if (state.goals.length) return actions.goalsStart();
    // First sign in: the intro slides push in from the right, then Pick a look, then Goals.
    leaveIntro(() => {
      state.screen = 'intro';
      state.introSlide = 0;
      state.introReturnTo = 'theme';
      render();
    });
    return false;
  },

  // Goals (js/views/goals.js)
  toggleGoal(key) {
    const list = state.goals;
    state.goals = list.includes(key) ? list.filter(k => k !== key) : list.concat(key);
    goalPicked(key);
  },
  toggleGoalClass(id) {
    const list = state.goalAClasses;
    state.goalAClasses = list.includes(id) ? list.filter(k => k !== id) : list.concat(id);
    goalPicked(id);
  },
  goalsNext() {
    const step = goalSteps()[state.goalStep];
    // Keep the goal they saw, so it holds still if the grades move later.
    if (step === 'gpaGoal' && state.planGpa == null) state.planGpa = gpaGoal();
    if (step === 'what' && !state.goals.length) return false;
    if (step === 'which' && !state.goalAClasses.length) return false;
    if (state.goalStep < goalSteps().length - 1) state.goalStep++;
    else state.goalStage = 'plan';
  },
  /** GPA goal − and + (Goals and the Plan), a tenth at a time, between a tenth past now and all As. */
  planGpaStep(direction) {
    const goal = gpaGoal();
    if (goal == null) return false;
    const range = gpaGoalRange();
    const next = Math.round((goal + 0.1 * Math.sign(+direction)) * 10) / 10;
    if (next < range.low - 1e-9 || next > range.high + 1e-9) return false;
    state.planGpa = next;
  },
  /** A goal class grade − and + on the Plan, one point at a time, 90 to 100. */
  planTargetStep(classId, direction) {
    const course = findClass(classId);
    const next = classTarget(course) + Math.sign(+direction);
    if (next < TARGET_MIN || next > TARGET_MAX) return false;
    state.planTargets[classId] = next;
  },
  /** A Plan row opens Target on that class, its grade and the test or the final already set. */
  openPlanTarget(classId, spec) {
    // During setup Target has no stack to show on (Home would open on it later).
    if (state.screen === 'goals') return false;
    const [target, kind] = String(spec).split(':');
    state.needCalc = { classId, target: +target, kind: kind === 'final' ? 'final' : 'test' };
    currentStack().push(['need']);
  },
  goalsBack() {
    if (state.goalStage === 'plan') state.goalStage = 'ask';
    else if (state.goalStep > 0) state.goalStep--;
    else return false;
  },
  openImport() {
    openImport();
  },
  closeImport() {
    state.screen = state.importFrom === 'app' ? 'app' : 'signin';
    state.importError = '';
  },
  goalsStart() {
    // What sign in did before Goals: Home, with the first gradebook update.
    state.screen = 'app';
    state.tab = 'home';
    state.firstOpen = true;
    startRefresh(false);
    return false;
  },
  signOut() {
    forgetHacSchedule(); // the student's own schedule (Bell, Email teacher) goes with them
    // In the iPhone app the native confirm does all wiping (Cancel must keep everything); there the app
    // deletes the native/ pages and clears WKWebsiteDataStore, which takes tally-hacadds-v1 with it.
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tally)) forgetHacAdds(); // attendance, HAC calendar, comments, credits
    if (real.on && real.source === 'paste') {
      // Back to the sample preview: drop the saved grades and start fresh.
      forgetImport();
      location.reload();
      return false;
    }
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
    if (tab !== 'home') state.firstOpen = false;
    state.tab = tab;
    state.editingClasses = false;
  },
  openPage(name, id) {
    state.editingClasses = false;
    state.firstOpen = false;
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
  /** Tap on Home's "Updated N min ago": the same as pull to refresh, for a mouse. */
  refreshFromHome() {
    if (Date.now() < state.nextUpdateAllowedAt) return false;
    startRefresh(true);
    return false;
  },
  /** Home: "N more", "N any time" and the folded Missing work row open and close in place. */
  toggleHomeGroup(key) {
    state.homeExpanded[key] = !state.homeExpanded[key];
  },
  toggleHideScores() {
    state.hideScores = !state.hideScores;
  },

  // To-dos
  openTask(id) {
    state.sheet = { kind: 'task', id };
  },
  /** Ticks or unticks. The done moment (ring pop, bars, count, heading roll) is in done-motion.js. */
  toggleDone(id, _y, element) {
    const nowDone = !state.doneIds[id];
    const held = beforeToggle(id, element, nowDone);
    if (nowDone) state.doneIds[id] = 1;
    else delete state.doneIds[id];
    if (held) return false;
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
  openGraph(classId) {
    state.sheet = { kind: 'graph', id: classId };
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
  toggleWhatIfMore() {
    state.whatIfMore = !state.whatIfMore;
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
    const course = findClass(classId);
    const category = fakeCategory(course, draft);
    scenario.fakeAssignments.push(Object.assign({
      id: 'f' + state.nextId++, name: draft.name.trim(), category,
      points: draft.points, score: draft.score,
    }, course.real ? { catWeight: course.categoryWeights[category] ?? 0 } : {}));
    // Keep category and points for the next one; most fake assignments look alike.
    scenario.draft = { name: '', category, points: draft.points, score: '' };
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
  /** Target page from a class page: the score you need, with that class already picked. */
  openTarget(classId) {
    state.needCalc.classId = classId;
    actions.openPage('need');
  },
  needPickClass(classId) {
    state.needCalc.classId = classId;
  },
  needPickKind(kind) {
    state.needCalc.kind = kind;
  },
  setGpaWhatIfLetter(letter, classId) {
    state.gpaWhatIf[classId] = letter;
  },
  /** Undo on a semester he set: back to the even split. */
  gpaSemesterEven(semester) {
    delete state.gpaSplit[semester];
  },
  resetGpaWhatIf() {
    state.gpaWhatIf = {};
    state.gpaScores = {};
  },

  // Alerts
  showSampleAlert() {
    const latest = state.gradeChanges[0];
    const course = latest && findClass(latest.classId);
    if (!course) return false; // real grades start with no changes to replay
    showBanner(course.name, alertText(latest), latest);
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
  /** Home's "Due tomorrow" line: the Calendar tab on that day. */
  openCalendarDay(offset) {
    state.tab = 'calendar';
    state.pageStacks.calendar = [];
    state.calendarMonth = 0;
    state.calendarSelected = +offset;
  },
  changeMonth(direction) {
    state.calendarMonth = (state.calendarMonth ?? 0) + +direction;
  },

  // Bell
  pickBellDay(day) {
    state.bellDay = day;
    state.tapeScrollTop = null;
  },

  // Settings
  toggleAlertRule(rule) {
    state.alertRules[rule] = !state.alertRules[rule];
  },
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
  gpaScore(value, classId) {
    state.gpaScores[classId] = value;
  },
  // A semester number on the GPA goal page: typing sets it, the other semesters split the rest.
  // A key that changes nothing (WebKit fires input for one it ignores) does not set the row.
  gpaSemester(value, semester) {
    if (!(semester in state.gpaSplit)) {
      const row = gpaSplitPlan(+state.gpaGoal, SAMPLE_GPA_HISTORY, state.gpaSplit).rows
        .find(item => item.semester === +semester);
      if (row && value === row.need.toFixed(2)) return;
    }
    state.gpaSplit[semester] = value;
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
/** Done on a semester number: an empty field goes back to even, the rest reads like 4.40, in range. */
export function settleSemester(semester) {
  const typed = state.gpaSplit[semester];
  const value = lockedValue(typed);
  if (value == null) delete state.gpaSplit[semester];
  else state.gpaSplit[semester] = value.toFixed(2);
}

export function changeDueDate(itemId, isoValue) {
  const due = offsetFromIso(isoValue);
  const todo = state.todos.find(candidate => candidate.id === itemId);
  if (todo) todo.due = due;
  else if (/^cp/.test(itemId)) state.projectPace[+itemId.slice(2)].due = due;
  else if (findRow(itemId)) state.dueOverrides[itemId] = due;
}
