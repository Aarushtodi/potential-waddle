/**
 * Intro slide motion. The slides are pages you can half swipe: the art plays each time a page
 * comes in, and follows the finger while one peeks in. Markup: the slide art in intro.js.
 *
 * render.js calls afterRender() after every full redraw. With prefers-reduced-motion the art
 * shows its end state and the slides switch without sliding.
 */
import { state } from '../state.js';
import { render } from '../render.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

export function afterRender() {
  introMotion();
}

// ---- Intro slides ---------------------------------------------------------------------------
//
// The slides work like an iOS page view. JS owns the track position (pos, in slides): the page
// stays under the finger 1:1, and on release it goes to the next page only past half the width
// or on a fast flick, otherwise it springs back. The settle time scales with the distance left.
//
// Each slide's art has an entrance timeline (ENTRANCES). A page peeking in under the finger shows
// its entrance at the drag progress (scrub), so a half swiped page already looks like a page.
// Once a page is committed (release past the line, or Next) its entrance plays on in real time
// from wherever it is: no replay, no snap. The extras (typing, count up) start on commit.
// The art lags the page a little (parallax, inside the page's padding). Only transform and opacity change (plus the
// ring's stroke), as inline styles applied every frame, so a full redraw mid motion is harmless.

const easeOutCubic = t => 1 - Math.pow(1 - t, 3); // = cubic-bezier(.33,1,.68,1), no overshoot
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const RING = 68.49; // circumference of the drawn ring (r 10.9)

/** Entrance timelines, ms. y is a translateY in px (art space). scrubEnd: how far a drag shows. */
const ENTRANCES = [
  { scrubEnd: 1500, parts: [
    { sel: '.intro-art .card', delay: 250, dur: 1000, y: 14 },
    { sel: '.intro-text i', delay: 1300, dur: 600, pop: true },
  ] },
  { scrubEnd: 400, parts: [
    { sel: '.intro-art-inner', delay: 0, dur: 400 },
    { sel: '.intro-text i', delay: 1500, dur: 600, pop: true },
  ] },
  { scrubEnd: 1250, parts: [
    { sel: '.intro-art .card', delay: 100, dur: 400 },
    { sel: '.intro-art .row:nth-child(1)', delay: 250, dur: 700, y: -10 },
    { sel: '.intro-art .row:nth-child(2)', delay: 550, dur: 700, y: -10 },
    { sel: '.mark b.draw circle', delay: 1250, dur: 1000, ring: true },
    { sel: '.intro-text i', delay: 1650, dur: 600, pop: true },
  ] },
];
const entranceEnd = e => Math.max(...e.parts.map(p => p.delay + p.dur));

const NEXT_MS = 600; // Next / Back tap
const SETTLE_MIN = 250;
const SETTLE_MAX = 600;
const FLICK_PX_PER_MS = 0.5;
const FLICK_WINDOW_MS = 80;
const EDGE_GIVE = 0.35;
const GUTTER = 24; // px of paper between pages, so two pages' cards never meet
// The art lags the page by at most this many px, inside the page's own 16px padding, so the
// page's clip never cuts a card (no square seam, corners kept).
const PARALLAX_PX = 14;

/** Track position in slides, the tween moving it, the finger, and each slide's entrance. */
const pager = {
  pos: null, // null until the intro first draws
  shown: null, // state.introSlide the pager last acted on
  tween: null, // { from, to, start, dur }
  drag: null, // { x0, base, samples: [[t, x]] }
  // per slide: { phase: 'idle' | 'scrub' | 'play' | 'done', t, playFrom, playAt }
  ent: [],
  raf: 0,
};

/** One page step in px: the page plus the gutter. */
const slideWidth = () => ((document.querySelector('.intro-view') || {}).clientWidth || 390) + GUTTER;

function introMotion() {
  const track = document.querySelector('.intro-track');
  if (!track) {
    pager.pos = null;
    pager.shown = null;
    return;
  }
  const count = track.children.length;
  if (pager.pos == null) {
    // First draw (first open, or Show intro again): the current slide plays from the start.
    pager.pos = state.introSlide;
    pager.shown = state.introSlide;
    pager.ent = Array.from({ length: count }, () => ({ phase: 'done', t: 0 }));
    if (!reducedMotion()) commit(state.introSlide, 0);
  } else if (state.introSlide !== pager.shown) {
    // Next, Back or Skip moved the slide: glide there and play its art from the start.
    pager.shown = state.introSlide;
    if (!pager.ent[state.introSlide] || pager.ent[state.introSlide].phase !== 'play') commit(state.introSlide, 0);
    tweenTo(state.introSlide, NEXT_MS);
  }
  frame(performance.now()); // re-apply inline styles to the fresh DOM before it paints
}

/** Start a slide's entrance in real time from t (ms), and its extras. */
function commit(index, t) {
  const ent = pager.ent[index];
  if (reducedMotion()) {
    ent.phase = 'done';
    return;
  }
  ent.phase = 'play';
  ent.playFrom = t;
  ent.playAt = performance.now();
  const slide = document.querySelector('.intro-track').children[index];
  if (slide && slide.querySelector('[data-type-to]')) playPredictor(slide);
  loop();
}

function tweenTo(target, dur) {
  if (reducedMotion()) dur = 0;
  pager.tween = { from: pager.pos, to: target, start: performance.now(), dur };
  loop();
}

function loop() {
  if (!pager.raf) pager.raf = requestAnimationFrame(tick);
}

function tick(now) {
  pager.raf = 0;
  if (frame(now)) loop();
}

/** Apply one frame: track position, parallax, entrances. Returns true while anything moves. */
function frame(now) {
  const track = document.querySelector('.intro-track');
  if (!track || pager.pos == null) return false;
  let moving = false;
  if (pager.tween) {
    const { from, to, start, dur } = pager.tween;
    const k = dur ? Math.min(1, (now - start) / dur) : 1;
    pager.pos = from + (to - from) * easeOutCubic(k);
    if (k < 1) moving = true;
    else {
      pager.pos = to;
      pager.tween = null;
    }
  }
  if (pager.drag) moving = true;
  track.style.transition = 'none';
  track.style.transform = `translate3d(calc(${-pager.pos} * (100% + ${GUTTER}px)),0,0)`;

  const still = reducedMotion();
  [...track.children].forEach((slide, i) => {
    const offset = i - pager.pos; // 0 = centered, 1 = one page to the right
    const art = slide.querySelector('.intro-art');
    if (art) art.style.transform = still || Math.abs(offset) >= 1 ? '' : `translate3d(${-offset * PARALLAX_PX}px,0,0)`;
    if (still) return;
    const ent = pager.ent[i];
    if (!ent) return;
    if (ent.phase === 'play') {
      ent.t = ent.playFrom + (now - ent.playAt);
      if (ent.t >= entranceEnd(ENTRANCES[i])) ent.phase = 'done';
      else moving = true;
    } else if (Math.abs(offset) < 1 && i !== pager.shown && ent.phase !== 'done') {
      // Peeking in under the finger (or springing back): the art follows the drag progress.
      ent.phase = 'scrub';
      ent.t = (1 - Math.abs(offset)) * ENTRANCES[i].scrubEnd;
    } else if (Math.abs(offset) >= 1 && i !== pager.shown) {
      // Fully off screen and not the page we are on: ready to come in fresh next time.
      ent.phase = 'idle';
      ent.t = 0;
    }
    applyEntrance(slide, i, ent);
  });
  return moving;
}

/** Inline styles for a slide's art at its entrance time. 'done' clears them (the CSS end state). */
function applyEntrance(slide, index, ent) {
  const parts = ENTRANCES[index].parts;
  for (const part of parts) {
    const node = slide.querySelector(part.sel);
    if (!node) continue;
    if (ent.phase === 'done') {
      node.style.opacity = node.style.transform = node.style.strokeDashoffset = node.style.color = '';
      continue;
    }
    const raw = Math.max(0, Math.min(1, (ent.t - part.delay) / part.dur));
    if (part.pop) {
      // The headline's accent word fills in with the pop color once the art has landed.
      node.style.color = `color-mix(in srgb, var(--urgent) ${Math.round(easeInOut(raw) * 100)}%, var(--ink))`;
      continue;
    }
    if (part.ring) {
      node.style.strokeDashoffset = String(RING * (1 - easeInOut(raw)));
      continue;
    }
    const k = easeOutCubic(raw);
    node.style.opacity = String(k);
    node.style.transform = part.y ? `translate3d(0,${part.y * (1 - k)}px,0)` : '';
  }
  // Slide 2's extras sit at their start (empty box, the old average) until the page commits.
  if (ent.phase === 'scrub' || ent.phase === 'idle') resetPredictor(slide);
}

// ---- The finger ----

document.addEventListener('pointerdown', event => {
  pager.drag = null;
  if (pager.pos == null || !event.target.closest('[data-swipe]')) return;
  pager.tween = null; // catch a page mid glide
  pager.drag = { x0: event.clientX, base: pager.pos, samples: [[event.timeStamp, event.clientX]] };
  loop();
});

document.addEventListener('pointermove', event => {
  const drag = pager.drag;
  if (!drag) return;
  const count = document.querySelector('.intro-track').children.length;
  let pos = drag.base - (event.clientX - drag.x0) / slideWidth();
  // Past the first or last page it gives a little (rubber band).
  if (pos < 0) pos *= EDGE_GIVE;
  if (pos > count - 1) pos = count - 1 + (pos - (count - 1)) * EDGE_GIVE;
  pager.pos = pos;
  drag.samples.push([event.timeStamp, event.clientX]);
  while (drag.samples.length > 2 && event.timeStamp - drag.samples[0][0] > 4 * FLICK_WINDOW_MS) drag.samples.shift();
  loop();
});

function release(event, cancelled) {
  const drag = pager.drag;
  if (!drag) return;
  pager.drag = null;
  // app.js has its own 40px swipe; the pager decides here instead.
  event.stopImmediatePropagation();
  const count = document.querySelector('.intro-track').children.length;
  const home = Math.round(drag.base);
  // Speed over the last moves (up to FLICK_WINDOW_MS before the last one). A finger that held
  // still before letting go has no recent moves, so its speed is 0.
  const samples = drag.samples;
  const [tLast, xLast] = samples[samples.length - 1];
  let recent = samples.filter(([t]) => tLast - t <= FLICK_WINDOW_MS);
  // Moves can arrive bunched into one event; then measure from the move (or press) before it.
  if (recent.length < 2 && samples.length >= 2 && tLast - samples[samples.length - 2][0] <= 250) {
    recent = samples.slice(-2);
  }
  const [tFirst, xFirst] = recent[0];
  const held = event.timeStamp - tLast > 120;
  const velocity = held || recent.length < 2 ? 0 : (xLast - xFirst) / Math.max(1, tLast - tFirst); // px/ms, + = right
  const moved = pager.pos - home; // + = toward the next page
  let target = home;
  if (!cancelled) {
    if (Math.abs(velocity) >= FLICK_PX_PER_MS) target = home + (velocity < 0 ? 1 : -1);
    else if (Math.abs(moved) > 0.5) target = home + Math.sign(moved);
  }
  target = Math.max(0, Math.min(count - 1, target));
  const dur = SETTLE_MIN + (SETTLE_MAX - SETTLE_MIN) * Math.min(1, Math.abs(target - pager.pos));
  if (target !== home) {
    // Committed: the page's art plays on from where the finger left it.
    const ent = pager.ent[target];
    const from = ent.phase === 'scrub' ? ent.t : 0;
    pager.shown = target;
    state.introSlide = target;
    render(); // dots, Next / Get started; the pager keeps the page where the finger left it
    commit(target, from); // after the redraw, so the typing runs on the new DOM
    tweenTo(target, dur);
  } else {
    tweenTo(target, dur);
  }
}
// Registered before app.js's own pointerup (this module loads first), so it runs first.
document.addEventListener('pointerup', event => release(event, false));
document.addEventListener('pointercancel', event => release(event, true));

function resetPredictor(slide) {
  const input = slide.querySelector('[data-type-to]');
  if (!input || input.dataset.reset) return;
  input.dataset.reset = '1';
  input.value = '';
  slide.querySelectorAll('[data-typed]').forEach(node => (node.textContent = ''));
  slide.querySelectorAll('[data-count-to]').forEach(node => (node.textContent = node.dataset.countFrom));
}

/** Slide 2: type 95 into the box, then count both numbers from now to the estimate. */
function playPredictor(slide) {
  const input = slide.querySelector('[data-type-to]');
  const typed = [...slide.querySelectorAll('[data-typed]')];
  const counts = [...slide.querySelectorAll('[data-count-to]')];
  const score = input.dataset.typeTo;
  delete input.dataset.reset;
  const setTyped = value => {
    input.value = value;
    typed.forEach(node => (node.textContent = value));
  };
  setTyped('');
  counts.forEach(node => (node.textContent = node.dataset.countFrom));

  const START = 260; // the slide is still landing and the art fading in
  const KEY_GAP = 190;
  const COUNT_MS = 1000;
  const later = (ms, fn) => setTimeout(() => slide.isConnected && fn(), ms);
  later(START - 60, () => input.classList.add('typing'));
  for (let i = 1; i <= score.length; i++) later(START + (i - 1) * KEY_GAP, () => setTyped(score.slice(0, i)));
  const countStart = START + (score.length - 1) * KEY_GAP + 90;
  later(countStart, () => {
    const t0 = performance.now();
    const step = now => {
      if (!slide.isConnected) return;
      const t = Math.min(1, (now - t0) / COUNT_MS);
      for (const node of counts) {
        const from = +node.dataset.countFrom;
        const to = +node.dataset.countTo;
        // The last frame writes the final text itself, so it always lands exactly on it.
        node.textContent = t < 1 ? (from + (to - from) * easeOutQuart(t)).toFixed(1) : node.dataset.countTo;
      }
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  later(countStart + 350, () => input.classList.remove('typing'));
}

// ---- Leaving the intro ----------------------------------------------------------------------
//
// Sign in, Get started (or Skip) and Pick a look's Continue each push the next screen in from the
// right, like one more page: the old screen drifts left and fades while the new one slides over
// it (View Transitions, iOS 18+). Without
// the API, the new screen's pieces rise in one after another instead. Reduced motion: instant.

const ENTER_MS = 900; // longest stagger in .scr.enter, then the class comes off

/** Run update (which changes the screen and redraws) with the leave animation around it. */
export function leaveIntro(update) {
  if (reducedMotion()) return update();
  const root = document.documentElement;
  if (document.startViewTransition) {
    root.classList.add('vt-leave-intro');
    const transition = document.startViewTransition(() => {
      update();
      markEnter();
    });
    transition.finished.finally(() => root.classList.remove('vt-leave-intro'));
    return;
  }
  update();
  markEnter();
}

function markEnter() {
  const screen = document.querySelector('#app > .scr, #app .scr');
  if (!screen) return;
  screen.classList.add('enter');
  setTimeout(() => screen.classList.remove('enter'), ENTER_MS);
}

