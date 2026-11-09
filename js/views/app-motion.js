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
const ODO_TIMEOUT_MS = 1000;
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
  return changed && sheet && sheet.kind === 'whatIf';
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

/** `from` rewritten to the shape of `to`, lined up on the decimal point ('9.5' for '10.25' is '09.50'). */
function alignTo(from, to) {
  if (!from || !/^[\d.]+$/.test(from)) return null;
  const [toInt, toFrac = ''] = to.split('.');
  const [fromInt, fromFrac = ''] = from.split('.');
  const int = fromInt.padStart(toInt.length, '0').slice(-toInt.length);
  const frac = fromFrac.padEnd(toFrac.length, '0').slice(0, toFrac.length);
  return to.includes('.') ? int + '.' + frac : int;
}

/** Roll the leading number of `el` from `from` (or zeros) to its current text. */
function roll(el, from) {
  const node = el.firstChild;
  if (!node || node.nodeType !== 3) return;
  const full = node.textContent;
  const to = full.trim();
  if (!/^[\d.]+$/.test(to)) return;
  const trailing = full.slice(full.indexOf(to) + to.length);
  if (from === to) return;
  const old = alignTo(from, to); // the old number in the new one's shape, digit for digit
  const digits = [...to].filter(ch => ch !== '.').length;
  const odo = document.createElement('span');
  odo.className = 'odo';
  odo.setAttribute('aria-hidden', 'true');
  const strips = [];
  let column = 0;
  [...to].forEach((ch, i) => {
    if (ch === '.') {
      odo.append('.');
      return;
    }
    const end = +ch;
    const start = old ? +old[i] : 0;
    // Roll forward through the strip: a digit that didn't change stays put, one that goes up
    // lands in the first 0 to 9 run, one that goes down (or opens from 0) runs on into the second.
    const stop = old && start === end ? end : start < end ? end : end + 10;
    const col = document.createElement('span');
    col.className = 'odo-col';
    const ph = document.createElement('span');
    ph.className = 'odo-ph';
    ph.textContent = ch;
    const strip = document.createElement('span');
    strip.className = 'odo-s';
    strip.innerHTML = '0123456789'.repeat(2).split('').map(d => `<b>${d}</b>`).join('');
    const shorter = digits - 1 - column; // left columns land first
    strip.style.transitionDuration = `calc(var(--t-stage) - ${shorter} * var(--t-step))`;
    column += 1;
    const win = document.createElement('span'); // the clip window: one line plus a little bleed
    win.className = 'odo-win';
    win.append(strip);
    col.append(ph, win);
    odo.append(col);
    strips.push([strip, stop, start]);
  });
  const real = document.createElement('span');
  real.className = 'vh';
  real.textContent = to;
  const spot = document.createElement('span');
  spot.className = 'odo-w';
  spot.append(odo, real);
  el.replaceChild(spot, node);
  if (trailing) spot.after(trailing);
  // Space the strip digits by the measured line plus a gap, so a big glyph that spills past its
  // line box never shows in the next column window (the window is the line plus half the gap).
  // Each digit cell is one line tall with the same line height, so its glyph sits exactly where the
  // plain number will. The window reaches a little past the line so tall glyphs aren't cut.
  const lineHeight = odo.querySelector('.odo-col').getBoundingClientRect().height;
  const gap = Math.round(lineHeight); // a full line between digits: the window holds one digit at a time
  const step = lineHeight + gap;
  odo.style.setProperty('--odo-h', lineHeight + 'px');
  odo.style.setProperty('--odo-gap', gap + 'px');
  for (const [strip, , start] of strips) strip.style.transform = `translateY(${-start * step}px)`;
  odo.getBoundingClientRect(); // commit the start offsets, or the roll would start from 0
  let timer = 0;
  const finish = () => {
    clearTimeout(timer);
    finishers.delete(finish);
    if (spot.isConnected) spot.replaceWith(to);
  };
  finishers.add(finish);
  const lastStrip = strips.filter(([, stop, start]) => stop !== start).pop()[0]; // rightmost moving digit ends last
  lastStrip.addEventListener('transitionend', finish, { once: true });
  timer = setTimeout(finish, ODO_TIMEOUT_MS);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const [strip, stop, start] of strips) {
      if (stop === start) continue; // this digit didn't change: it stays put
      strip.classList.add('go');
      strip.style.transform = `translateY(${-stop * step}px)`;
    }
  }));
}

/** Any press or key skips a running roll straight to the number (car row 5). */
export function finishOdometers() {
  [...finishers].forEach(finish => finish());
}
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, finishOdometers, true);

function odometers(sheetOpened, pageOpened) {
  for (const [key, el] of numberSpots()) {
    const text = leadingText(el);
    const before = tap && tap.numbers ? tap.numbers[key] : undefined;
    if (before && before !== text) {
      roll(el, before);
      continue;
    }
    const opened = key === 'need' ? pageOpened : sheetOpened;
    if (opened && !session('odo:' + key)) {
      session('odo:' + key, '1');
      roll(el, null);
    }
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
  const before = last.depth;
  const beforeTab = last.tab;
  pageEntrance();
  const pageOpened = last.tab !== beforeTab || last.depth > before;
  const sheetOpened = sheetEntrance();
  nowPing();
  if (on()) odometers(sheetOpened, pageOpened);
  homeGrades(on()); // the seen map stays current either way
  tap = null;
}
