/**
 * Boot and event wiring. Data flow, one direction:
 *
 *   tap / keystroke  ->  actions.js changes `state`  ->  render.js redraws from `state`
 *
 * One delegated listener per event type reads the data-* attributes the views put on elements,
 * so views never attach listeners themselves.
 */
import { qs } from './format.js';
import { state, whatIfFor, whatIfAverage } from './state.js';
import { CLASSES } from './sample-data.js';
import { render, refreshLive, collapseHeader } from './render.js';
import { actions, inputHandlers, startRefresh, changeDueDate, settleSemester, replayQueuedScores } from './actions.js';
import { INTRO_SLIDE_COUNT } from './views/intro.js';
import { applyTheme } from './theme.js';
import { noteTap } from './views/app-motion.js';
import { real, loadRealData, applyImported } from './real-data.js';
import { readPaste, saveImport, loadImport, clearClipboard, ImportError } from './hac-import.js';
import { startFreshCheck, restoreHandoff } from './fresh.js';
import { startBellBridge } from './bell-store.js';
import { startHacAddsBridge } from './hac-adds-store.js';

// Motion runs only when reduced motion is off (council motion.css rule).
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('motion');

const LONG_PRESS_MS = 520;
const PULL_TO_REFRESH_PX = 80;

// Set by a long press so the click that follows it does not also open the class.
let longPressFired = false;
let longPressTimer;

document.addEventListener('click', event => {
  if (longPressFired) {
    longPressFired = false;
    return;
  }
  const element = event.target.closest('[data-action]');
  if (!element) return;
  noteTap(element); // before the handler: motion needs the old DOM, see js/views/app-motion.js
  const { action, x, y } = element.dataset;
  const handler = actions[action];
  const result = handler ? handler(x, y, element, event) : undefined;
  if (result !== false) render();
});

// Rows marked role=button work from the keyboard too.
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role=button]')) {
    event.preventDefault();
    event.target.click();
  }
});

// Done on the keyboard (enterkeyhint) closes it. Fields save as you type, so nothing else to do.
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('input[data-input]')) event.target.blur();
});

// Typing updates state, then only the live regions, so the field keeps focus.
document.addEventListener('input', event => {
  const { input, x, y } = event.target.dataset;
  if (input && inputHandlers[input]) {
    inputHandlers[input](event.target.value, x, y);
    refreshLive();
  }
});

document.addEventListener('change', event => {
  const { change, x } = event.target.dataset;
  // A semester number on the GPA goal page, on Done: empty goes back to even, past the max
  // comes back to it. No full redraw, so a tap into the next field keeps its focus.
  if (event.target.dataset.input === 'gpaSemester') {
    settleSemester(event.target.dataset.x);
    refreshLive();
    return;
  }
  if (change === 'dueDate' && event.target.value) {
    changeDueDate(x, event.target.value);
    render();
  }
});

// Home's header collapses with the scroll position, at most once a frame.
let collapseFrame = 0;
document.addEventListener('scroll', event => {
  if (event.target && event.target.id === 'tape') state.tapeScrollTop = event.target.scrollTop;
  if (event.target && event.target.id === 'main' && !collapseFrame) {
    collapseFrame = requestAnimationFrame(() => {
      collapseFrame = 0;
      collapseHeader();
    });
  }
}, { capture: true, passive: true });

// ---- Long press a class to edit the list ---------------------------------------------------

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('[data-long-press]')) return;
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    state.editingClasses = true;
    render();
    setTimeout(() => (longPressFired = false), 700);
  }, LONG_PRESS_MS);
});
for (const type of ['pointerup', 'pointercancel', 'pointermove']) {
  document.addEventListener(type, event => {
    if (type !== 'pointermove' || Math.abs(event.movementY) > 3) clearTimeout(longPressTimer);
  });
}
document.addEventListener('contextmenu', event => {
  if (event.target.closest('[data-long-press]')) event.preventDefault();
});

// ---- Swipe between intro slides (touch or mouse drag) -----------------------------------------

const SWIPE_PX = 40;
let swipeStartX = null;
document.addEventListener('pointerdown', event => {
  swipeStartX = event.target.closest('[data-swipe]') ? event.clientX : null;
});
document.addEventListener('pointerup', event => {
  if (swipeStartX == null) return;
  const distance = event.clientX - swipeStartX;
  swipeStartX = null;
  if (Math.abs(distance) < SWIPE_PX) return;
  if (distance < 0) {
    // Swiping left past the last slide does nothing; only Get started leaves.
    if (state.introSlide < INTRO_SLIDE_COUNT - 1) actions.nextIntroSlide();
  } else {
    actions.previousIntroSlide();
  }
  render();
});

// ---- Pull to refresh on a tab's root page --------------------------------------------------

let pullStartY = null;
let pullDistance = 0;
document.addEventListener('touchstart', event => {
  const main = qs('#main');
  const canPull = main && main.contains(event.target) && main.scrollTop <= 0
    && !state.pageStacks[state.tab].length && state.tab !== 'bell' && !event.target.closest('#tape');
  pullStartY = canPull ? event.touches[0].clientY : null;
  pullDistance = 0;
}, { passive: true });
document.addEventListener('touchmove', event => {
  if (pullStartY == null) return;
  pullDistance = event.touches[0].clientY - pullStartY;
}, { passive: true });
document.addEventListener('touchend', () => {
  if (pullStartY != null && pullDistance > PULL_TO_REFRESH_PX && Date.now() >= state.nextUpdateAllowedAt) {
    startRefresh(true);
  }
  pullStartY = null;
}, { passive: true });

// ---- Once a second: clock, "Updated N min ago", Update cooldown ---------------------------

setInterval(() => {
  if (state.screen !== 'app' || state.locked || state.loading) return;
  if (state.nextUpdateAllowedAt && Date.now() >= state.nextUpdateAllowedAt && qs('.strip .pill[disabled]')) {
    state.nextUpdateAllowedAt = 0;
  }
  refreshLive();
}, 1000);

applyTheme(state.theme);
// Real HAC data (local/real_server.py on the student's Mac only). Signed in already, so the
// intro and sign in are skipped, and sample to-dos and alerts are cleared so nothing fake
// sits next to real grades.
function showRealGrades() {
  Object.assign(state, {
    screen: 'app', tab: 'home', firstOpen: false, sheet: null,
    classOrder: CLASSES.map(course => course.id),
    hiddenClasses: {}, doneIds: {}, dueOverrides: {},
    todos: [], testDatePicks: {}, gradeChanges: [], projectPace: [],
    lastUpdated: real.pulledAt ? real.pulledAt * 1000 : null,
    nextUpdateAllowedAt: 0,
  });
  Object.keys(state.pageStacks).forEach(tab => (state.pageStacks[tab] = []));
  if (CLASSES[0]) state.needCalc.classId = CLASSES[0].id;
}

if (await loadRealData()) {
  showRealGrades();
} else {
  // Grades pasted earlier on this phone (Tally bookmark or the HAC page), saved by hac-import.js.
  const saved = loadImport();
  if (saved) {
    applyImported(saved);
    showRealGrades();
  }
}

// Just reloaded to a new build (js/fresh.js): put back where the student was and what they typed.
if (restoreHandoff()) replayQueuedScores();

// ---- Paste your grades ---------------------------------------------------------------------

async function importGrades(text) {
  if (state.importBusy) return;
  state.importBusy = true;
  state.importError = '';
  render();
  try {
    const data = await readPaste(text);
    applyImported(data);
    saveImport(data);
    showRealGrades();
  } catch (error) {
    state.importError = error instanceof ImportError ? error.message
      : "Couldn't read that paste. On HAC, tap Copy grades again, then paste here.";
  }
  state.importBusy = false;
  render();
}

/** Grades or the HAC page, not some other text the student had copied. */
const looksLikeGrades = text => /^\s*TALLY\d/.test(text) || /Student Grades|Date Due/i.test(text);

document.addEventListener('paste', event => {
  if (!event.target.matches || !event.target.matches('[data-paste]')) return;
  const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
  if (!text) return; // let the box fill, the input listener below picks it up
  event.preventDefault();
  // Clear it while the paste still counts as a tap, so the grades don't linger on the clipboard.
  if (looksLikeGrades(text)) clearClipboard();
  importGrades(text);
});

// Keyboards that paste without a paste event (some Android ones) still fire input.
document.addEventListener('input', event => {
  if (event.target.matches && event.target.matches('[data-paste]') && event.target.value.trim().length > 40) {
    importGrades(event.target.value);
  }
});

render();

// Inside the iPhone app: HAC's schedule pages for the Bell tab and Email teacher (js/bell-store.js).
startBellBridge(CLASSES, render);
startHacAddsBridge(render);

// Reload to a new build on its own after a deploy. The running build is the ?v= this file was loaded with.
startFreshCheck(new URL(import.meta.url).searchParams.get('v'));

// Handle for the Playwright checks in dev/shots.js. The app itself never reads it.
window.gradeApp = { state, actions, render, CLASSES, whatIfFor, whatIfAverage };
