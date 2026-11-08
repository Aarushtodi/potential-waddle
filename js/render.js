/**
 * Rendering. The app redraws the whole screen from state on every action (render), and
 * patches only the [data-live] parts once a second or while typing (refreshLive), so inputs
 * keep focus and the clock and estimates stay current.
 */
import { qs, qsa } from './format.js';
import { state, ui, sheetScrollKey, sheetAnimKey, routeKey } from './state.js';
import { view } from './views/shell.js';

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
  // Bell tape: keep where the student scrolled, otherwise start at the current period.
  const tape = qs('#tape');
  if (tape) {
    const current = tape.querySelector('.cur');
    tape.scrollTop = state.tapeScrollTop ?? (current ? current.offsetTop - 8 : 0);
  }
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
  if (fresh.length !== nodes.length) {
    render();
    return;
  }
  nodes.forEach((node, i) => {
    if (node.innerHTML !== fresh[i].innerHTML) node.innerHTML = fresh[i].innerHTML;
  });
}
