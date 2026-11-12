/**
 * Rendering. The app redraws the whole screen from state on every action (render), and
 * patches only the [data-live] parts once a second or while typing (refreshLive), so inputs
 * keep focus and the clock and estimates stay current.
 */
import { qs, qsa } from './format.js';
import { state, ui, sheetScrollKey, sheetAnimKey, routeKey } from './state.js';
import { view } from './views/shell.js';
import { afterRender as introMotion } from './views/intro-motion.js';
import { afterGpaRender, afterNeedRender } from './views/gpa.js';
import { afterDoneRender } from './views/done-motion.js';
import { afterMotionRender } from './views/app-motion.js';
import { afterGoalsRender } from './views/goals-motion.js';

/** Redraw everything, keeping each screen's scroll position. */
export function render() {
  const main = qs('#main');
  if (main && ui.lastRouteKey) state.scrollPositions[ui.lastRouteKey] = main.scrollTop;
  const sheetBody = qs('.sheet .body');
  const sheetScroll = sheetBody ? sheetBody.scrollTop : 0;
  const sameSheet = sheetScrollKey() === ui.lastSheetKey;

  qs('#app').innerHTML = view();

  ui.lastSheetKey = sheetScrollKey();
  ui.lastAnimKey = sheetAnimKey();
  const newSheetBody = qs('.sheet .body');
  if (newSheetBody && sameSheet) newSheetBody.scrollTop = sheetScroll;
  ui.lastRouteKey = routeKey();
  const newMain = qs('#main');
  if (newMain) newMain.scrollTop = state.scrollPositions[ui.lastRouteKey] || 0;
  slideIntroTrack();
  introMotion(); // slide pager + art motion, see js/views/intro-motion.js
  collapseHeader();
  placeTape();
  afterGpaRender(); // GPA hero count up, see js/views/gpa.js
  afterNeedRender(); // Target page: picked class chip in view, see js/views/gpa.js
  afterDoneRender(); // to-do ticked: ring pop, bars, count and heading roll, see js/views/done-motion.js
  afterMotionRender(); // taps, sliding pills, page entrances, number rolls, see js/views/app-motion.js
  afterGoalsRender(); // Goals: word rise, wipe, progress draw, tile pop, plan cover plate, see js/views/goals-motion.js
}

/**
 * Bell tape. Opening it (from the tab bar, the Home now line, or a new A/B day) plays the
 * entrance and scrolls so the now line sits about a third of the way down. Any other redraw
 * keeps where the student scrolled.
 */
function placeTape() {
  const tape = qs('#tape');
  const day = tape ? state.bellDay : null;
  const opening = tape && day !== ui.lastTapeDay;
  ui.lastTapeDay = day;
  if (!tape) return;
  if (opening) state.tapeScrollTop = null;
  if (state.tapeScrollTop != null) {
    tape.scrollTop = state.tapeScrollTop;
    return;
  }
  const now = tape.querySelector('.nowl');
  tape.scrollTop = now ? now.offsetTop - tape.clientHeight / 3 : 0;
  if (opening && !reducedMotion.matches) tape.classList.add('enter');
}

/** Scroll distance over which Home's big title collapses into the slim bar. */
const COLLAPSE_PX = 64;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Home's collapsing header: --c on .scr goes from 0 (top) to 1 (collapsed) with the scroll
 * position. Reduced motion: just two states, and CSS fades between them.
 */
export function collapseHeader() {
  const bar = qs('.cbar');
  const main = qs('#main');
  if (!bar || !main) return;
  const y = Math.max(0, main.scrollTop);
  const c = reducedMotion.matches ? (y > COLLAPSE_PX / 2 ? 1 : 0) : Math.min(1, y / COLLAPSE_PX);
  bar.parentElement.style.setProperty('--c', c.toFixed(3));
}

/**
 * The intro track is redrawn at the new slide, so start it at the old one and let the CSS
 * transition slide it over. Coming in fresh (first open, or from Settings) it just appears.
 */
function slideIntroTrack() {
  const track = qs('.intro-track');
  const from = ui.lastIntroSlide;
  ui.lastIntroSlide = track ? state.introSlide : null;
  if (!track || from == null || from === state.introSlide) return;
  const target = track.style.transform;
  track.style.transition = 'none';
  track.style.transform = `translateX(${-from * 100}%)`;
  void track.offsetWidth; // apply the start position before the transition
  track.style.transition = '';
  track.style.transform = target;
}

/**
 * Re-render off screen and copy over only the [data-live] regions that changed.
 * Falls back to a full render if the page structure changed.
 */
export function refreshLive() {
  const nodes = qsa('[data-live]');
  if (!nodes.length) return;
  const scratch = document.createElement('div');
  scratch.innerHTML = view();
  const fresh = scratch.querySelectorAll('[data-live]');
  const keys = qsa('[data-live-key]').map(node => node.dataset.liveKey).join();
  const freshKeys = [...scratch.querySelectorAll('[data-live-key]')].map(node => node.dataset.liveKey).join();
  const styled = qsa('[data-live-style]');
  const freshStyled = scratch.querySelectorAll('[data-live-style]');
  const valued = qsa('input[data-live-value]');
  const freshValued = scratch.querySelectorAll('input[data-live-value]');
  if (fresh.length !== nodes.length || keys !== freshKeys || styled.length !== freshStyled.length
    || valued.length !== freshValued.length) {
    render();
    return;
  }
  nodes.forEach((node, i) => {
    if (node.querySelector('.odo-w')) return; // a number is rolling; it lands on the real value itself
    if (node.innerHTML !== fresh[i].innerHTML) node.innerHTML = fresh[i].innerHTML;
  });
  // Moving parts (the bell tape's fill and now line): copy only the style, keep the node.
  styled.forEach((node, i) => {
    const style = freshStyled[i].getAttribute('style');
    if (node.getAttribute('style') !== style) node.setAttribute('style', style);
  });
  // Fields that follow other fields (the GPA goal semesters): new value, same node, and never
  // the one being typed in.
  valued.forEach((node, i) => {
    const value = freshValued[i].getAttribute('value') || '';
    if (node !== document.activeElement && node.value !== value) node.value = value;
  });
}
