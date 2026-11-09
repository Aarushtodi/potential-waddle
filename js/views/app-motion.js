/**
 * App wide motion outside the intro and goals views (anim-1109, car-motion.md rows 1, 3, 5, 8).
 * Motion plays only when a screen opens or when the student taps. Once it ends nothing moves,
 * and the last frame is the plain layout. Everything is gated on the root .motion class, which
 * app.js adds only when reduced motion is off, so reduced motion shows the screen at once.
 *
 *   noteTap(element)   from the click listener, before the handler runs (needs the old DOM)
 *   afterMotionRender  from render(), after the new DOM is in
 */
import { state } from '../state.js';

const root = document.documentElement;
const on = () => root.classList.contains('motion');
// app.js sets .motion once at boot; follow the setting if it changes while the app is open.
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
reduce.addEventListener('change', () => root.classList.toggle('motion', !reduce.matches));
const STAGGER_CAP = 5;
const ODO_TIMEOUT_MS = 1200; // hold 140 + stage 780 + two frames, with room for a slow frame
const CLEANUP_MS = 900;

/** The tap being handled: what was tapped, where the picked pill sat, and the numbers before. */
let tap = null;
let last = { tab: '', depth: 0, sheet: '' };
let lastCur = null;

/** localStorage: what he has seen stays known across launches. */
function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* private mode: no rolls, nothing to compare with */ }
  return null;
}

function session(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch { /* private mode: play every time */ }
  return null;
}

// ---- Tap memory ---------------------------------------------------------------------------

export function noteTap(element) {
  tap = null;
  if (!on()) return;
  const { action, x, y } = element.dataset;
  let from = null;
  const group = element.closest('.seg, .tabs');
  const old = group && group.querySelector('.on');
  if (old && old !== element) {
    const box = group.getBoundingClientRect();
    const rect = old.getBoundingClientRect();
    from = { left: rect.left - box.left, width: rect.width };
  }
  tap = { action, x, y, from, numbers: readNumbers() };
}

function tappedElement() {
  if (!tap) return null;
  let selector = `[data-action="${CSS.escape(tap.action)}"]`;
  if (tap.x != null) selector += `[data-x="${CSS.escape(tap.x)}"]`;
  if (tap.y != null) selector += `[data-y="${CSS.escape(tap.y)}"]`;
  return document.querySelector(selector);
}

/**
 * Car row 8: the picked pill slides from the old spot to the tapped one. It is 3 parts (left cap,
 * middle, right cap) so the round ends never stretch: the caps only move, the middle scales.
 */
function slideIndicator(element) {
  const group = element.closest('.seg, .tabs');
  if (!group || !tap.from || !element.classList.contains('on')) return;
  const box = group.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const width = rect.width;
  const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, rect.height / 2, width / 2);
  const shift = tap.from.left - (rect.left - box.left);
  const middle = Math.max(width - 2 * radius, 1);
  const ind = document.createElement('span');
  ind.className = 'ind';
  ind.setAttribute('aria-hidden', 'true');
  // Absolute boxes start inside the border, so take the group's border off.
  Object.assign(ind.style, {
    left: rect.left - box.left - group.clientLeft + 'px', top: rect.top - box.top - group.clientTop + 'px',
    width: width + 'px', height: rect.height + 'px', transform: `translateX(${shift}px)`,
  });
  const part = (name, style, transform) => {
    const el = document.createElement('i');
    el.className = name;
    Object.assign(el.style, style, { transform });
    ind.append(el);
    return el;
  };
  // The middle overlaps each cap by half a pixel so no seam shows while it scales.
  const parts = [
    part('ind-l', { left: 0, width: radius + 'px', borderRadius: `${radius}px 0 0 ${radius}px` }, ''),
    part('ind-m', { left: radius - 0.5 + 'px', width: middle + 1 + 'px' },
      `scaleX(${Math.max(tap.from.width - 2 * radius, 1) / middle})`),
    part('ind-r', { left: width - radius + 'px', width: radius + 'px', borderRadius: `0 ${radius}px ${radius}px 0` },
      `translateX(${tap.from.width - width}px)`),
  ];
  group.classList.add('sliding');
  group.prepend(ind);
  const done = () => {
    ind.remove();
    group.classList.remove('sliding');
  };
  ind.addEventListener('transitionend', event => { if (event.target === ind) done(); });
  setTimeout(done, CLEANUP_MS);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ind.classList.add('in');
    ind.style.transform = '';
    parts.forEach(el => { el.style.transform = ''; });
  }));
}

// ---- Entrances (car row 3, up version) ---------------------------------------------------

function stagger(container) {
  if (!container || !on()) return;
  [...container.children].forEach((child, i) => child.style.setProperty('--i', Math.min(i, STAGGER_CAP)));
  container.classList.add('pg-in');
  setTimeout(() => container.classList.remove('pg-in'), CLEANUP_MS);
}

function pageEntrance() {
  const stack = state.screen === 'app' ? state.pageStacks[state.tab] : [];
  const now = { tab: state.screen + '/' + state.tab, depth: stack.length, sheet: '' };
  const forward = now.tab !== last.tab || now.depth > last.depth;
  const top = stack[stack.length - 1];
  last = { ...now, sheet: last.sheet };
  if (!forward || state.screen !== 'app') return;
  const page = top ? top[0] : null;
  if (page === 'need') return stagger(document.getElementById('main'));
  // Settings and the Calendar tab rise in once a session; after that they open settled.
  const once = page === 'settings' ? 'pg:settings' : !top && state.tab === 'calendar' ? 'pg:cal' : '';
  if (once && !session(once)) {
    session(once, '1');
    stagger(document.getElementById('main'));
  }
}

/** What if sheet: stagger its body when a class's sheet opens or another tool shows. */
function sheetEntrance() {
  const sheet = state.sheet;
  const key = sheet ? sheet.kind + (sheet.tool || '') + (sheet.id || sheet.classId || '') : '';
  const changed = key !== last.sheet;
  last.sheet = key;
  if (changed && sheet && sheet.kind === 'whatIf') stagger(document.querySelector('.sheet .body'));
}

// ---- Odometer (car row 5) ----------------------------------------------------------------

/** The leading number of each rolling spot, keyed so a tap can compare before and after. */
function readNumbers() {
  const out = {};
  for (const [key, el] of numberSpots()) out[key] = leadingText(el);
  return out;
}

function numberSpots() {
  const spots = [];
  const need = document.querySelector('#main .big-res');
  if (need) spots.push(['need', need]);
  const whatIf = document.querySelector('.sheet .hd.big');
  if (whatIf && state.sheet) spots.push(['whatif:' + (state.sheet.classId || ''), whatIf]);
  return spots;
}

function leadingText(el) {
  const node = el.firstChild;
  return node && node.nodeType === 3 ? node.textContent.trim() : '';
}

const finishers = new Set();

/**
 * Old and new lined up on the decimal point, one pair per spot ('9.5' to '10.25' gives
 * [['','1'],['9','0'],['.','.'],['5','2'],['','5']]). An empty side means that digit isn't there.
 */
function pairUp(from, to) {
  const [fromInt, fromFrac = ''] = from.split('.');
  const [toInt, toFrac = ''] = to.split('.');
  const intLen = Math.max(fromInt.length, toInt.length);
  const fracLen = Math.max(fromFrac.length, toFrac.length);
  const pairs = [];
  for (let i = 0; i < intLen; i += 1) {
    pairs.push([fromInt[i - (intLen - fromInt.length)] || '', toInt[i - (intLen - toInt.length)] || '']);
  }
  if (from.includes('.') || to.includes('.')) pairs.push(['.', '.']);
  for (let i = 0; i < fracLen; i += 1) pairs.push([fromFrac[i] || '', toFrac[i] || '']);
  return pairs;
}

/**
 * Roll the leading number of `el` from `from` to its current text. Each digit that changed is a
 * two cell slot, old over new (new under old when the number went down), so every frame shows
 * the old digit, the new one, or both in passing; never a blank window or a third digit.
 * Digits that didn't change are plain text and never move.
 */
function roll(el, from) {
  const node = el.firstChild;
  if (!node || node.nodeType !== 3) return;
  const full = node.textContent;
  const to = full.trim();
  const NUM = /^\d+(\.\d+)?$/;
  if (!from || from === to || !NUM.test(to) || !NUM.test(from)) return;
  const pairs = pairUp(from, to);
  const moving = pairs.filter(([a, b]) => a !== b).length;
  if (!moving) return; // same digits ('100' to '100.0' only gains a place): nothing to roll
  const up = parseFloat(to) >= parseFloat(from);
  const trailing = full.slice(full.indexOf(to) + to.length);
  const odo = document.createElement('span');
  odo.className = 'odo';
  odo.setAttribute('aria-hidden', 'true');
  const slots = [];
  let column = 0;
  for (const [was, now] of pairs) {
    if (was === now) {
      odo.append(now); // the decimal point and unchanged digits: plain text, still
      continue;
    }
    const col = document.createElement('span');
    col.className = 'odo-col';
    const ph = document.createElement('span');
    ph.className = 'odo-ph';
    ph.textContent = now || was; // holds the width while rolling
    const strip = document.createElement('span');
    strip.className = 'odo-s';
    // Going up the new digit comes from below; going down it comes from above.
    const cells = up ? [was, now] : [now, was];
    strip.innerHTML = cells.map(d => `<b>${d}</b>`).join('');
    const shorter = moving - 1 - column; // left columns land first
    strip.style.transitionDuration = `calc(var(--t-stage) - ${shorter} * var(--t-step))`;
    column += 1;
    const win = document.createElement('span'); // the clip window: exactly one line
    win.className = 'odo-win';
    win.append(strip);
    col.append(ph, win);
    odo.append(col);
    slots.push(strip);
  }
  const real = document.createElement('span');
  real.className = 'vh';
  real.textContent = to;
  const spot = document.createElement('span');
  spot.className = 'odo-w';
  spot.append(odo, real);
  el.replaceChild(spot, node);
  if (trailing) spot.after(trailing);
  // Each cell is one line tall with the same line height, so its glyph sits exactly where the
  // plain number will. A small gap between the two cells: in passing the window always shows
  // part of a digit (a full line gap left it empty at the half way point).
  const lineHeight = odo.querySelector('.odo-col').getBoundingClientRect().height;
  const gap = Math.round(lineHeight * 0.15);
  const step = lineHeight + gap;
  odo.style.setProperty('--odo-h', lineHeight + 'px');
  odo.style.setProperty('--odo-gap', gap + 'px');
  const startY = up ? 0 : -step;
  const endY = up ? -step : 0;
  for (const strip of slots) strip.style.transform = `translateY(${startY}px)`;
  odo.getBoundingClientRect(); // commit the start offsets before the transition is turned on
  let timer = 0;
  const finish = () => {
    clearTimeout(timer);
    finishers.delete(finish);
    if (spot.isConnected) spot.replaceWith(to);
  };
  finishers.add(finish);
  slots[slots.length - 1].addEventListener('transitionend', finish, { once: true }); // rightmost ends last
  timer = setTimeout(finish, ODO_TIMEOUT_MS);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const strip of slots) {
      strip.classList.add('go');
      strip.style.transform = `translateY(${endY}px)`;
    }
  }));
}

/** Any press or key skips a running roll straight to the number (car row 5). */
export function finishOdometers() {
  [...finishers].forEach(finish => finish());
}
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, finishOdometers, true);

function odometers() {
  for (const [key, el] of numberSpots()) {
    const text = leadingText(el);
    const before = tap && tap.numbers ? tap.numbers[key] : undefined;
    // Opening a screen shows the real number at once; only a tap that changed it rolls.
    if (before && before !== text) roll(el, before);
  }
}

/** Home: a class grade rolls from the number he last saw, only when it changed since. */
function homeGrades(animate) {
  if (state.screen !== 'app' || state.tab !== 'home' || state.pageStacks.home.length) return;
  const nodes = document.querySelectorAll('#main .glead-g, #main .glist-g');
  if (!nodes.length) return;
  let seen = {};
  try { seen = JSON.parse(stored('odo:seen') || '{}'); } catch { seen = {}; }
  nodes.forEach(el => {
    const owner = el.closest('[data-action=openPage]');
    const id = owner && owner.dataset.y;
    if (!id) return;
    const text = leadingText(el);
    if (animate && seen[id] && seen[id] !== text) roll(el, seen[id]);
    seen[id] = text;
  });
  stored('odo:seen', JSON.stringify(seen));
}

// ---- Bell now dot: one pulse when the current period changes -----------------------------

function nowPing() {
  const tape = document.getElementById('tape');
  if (!tape) {
    lastCur = null;
    return;
  }
  const cur = tape.querySelector('.tb.cur');
  const key = state.bellDay + ':' + (cur ? cur.style.getPropertyValue('--i') : '');
  if (lastCur != null && key !== lastCur && key.split(':')[0] === lastCur.split(':')[0]) {
    const now = tape.querySelector('.nowl');
    if (now) now.classList.add('ping');
  }
  lastCur = key;
}

// ---- After every render -----------------------------------------------------------------

export function afterMotionRender() {
  const tapped = on() ? tappedElement() : null;
  if (tapped) {
    tapped.classList.add('tapped');
    slideIndicator(tapped);
    if (tap.action === 'changeMonth') {
      const grid = document.querySelector('.calg');
      if (grid) grid.classList.add(+tap.x > 0 ? 'mo-next' : 'mo-prev');
    }
  }
  pageEntrance();
  sheetEntrance();
  nowPing();
  if (on()) odometers();
  homeGrades(on()); // the seen map stays current either way
  tap = null;
}
