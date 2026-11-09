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
const CLEANUP_MS = 900;
const CELL = 115; // one cell plus the 0.15 line gap, in percent of the window (.odo-s b top in anim.css)

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

/** A token such as --t-stage ('780ms') as a number of milliseconds. */
function tokenMs(name, fallback) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}

/**
 * Roll the leading number of `el` from `from` to its current text.
 * Nothing is measured. The real number stays in the page, visible, and sets the layout. Over it
 * sits an overlay of columns: a digit placeholder gives each column its tabular width and line
 * height, and a 20 cell strip (0 to 9 twice) fills it. The strip is 2000% of the column tall, each
 * cell 5%, so a translate of -(index / 20) * 100% lands any digit with no pixel maths. Web
 * Animations with fill both holds the old digit through the hold. The overlay replaces the real
 * number only after every animation reports ready and one frame painted, in a single class flip.
 * With no old value there is no roll: the real number just shows.
 */
function roll(el, from) {
  const node = el.firstChild;
  if (!node || node.nodeType !== 3 || !el.animate) return;
  const full = node.textContent;
  const to = full.trim();
  if (!/^[\d.]+$/.test(to) || from === to) return;
  if (!from || !/^[\d.]+$/.test(from)) return; // no old value: no roll, the real number stays still
  // The old number in the new one's shape, digit for digit. A new leading digit starts from a
  // blank cell. An old number with more digits than the new one can't be shown truthfully in the
  // new shape, so that rare case doesn't roll either (the real number just shows).
  const toInt = to.split('.')[0].length;
  if (from.split('.')[0].length > toInt) return;
  const old = alignTo(from, to);
  const pad = toInt - from.split('.')[0].length;
  let k = 0;
  const plan = [...to].map((ch, i) => {
    if (ch === '.') return null;
    const end = +ch;
    const blank = k < pad; // leading digit the old number didn't have
    k += 1;
    // 21 cells: 0 is blank, 1 to 10 are 0 to 9, 11 to 20 are 0 to 9 again. Up lands in the first
    // run, down runs on into the second.
    const first = end + 1;
    const start = blank ? 0 : +old[i] + 1;
    const stop = blank ? first : start === first ? start : start < first ? first : first + 10;
    return { ch, start, stop };
  });
  const trailing = full.slice(full.indexOf(to) + to.length);

  const real = document.createElement('span');
  real.className = 'odo-real';
  real.textContent = to;
  const overlay = document.createElement('span');
  overlay.className = 'odo';
  overlay.setAttribute('aria-hidden', 'true');
  const strips = [];
  plan.forEach(d => {
    if (!d) {
      overlay.append('.');
      return;
    }
    const col = document.createElement('span');
    col.className = 'odo-col';
    const ph = document.createElement('span');
    ph.className = 'odo-ph';
    ph.textContent = d.ch;
    const win = document.createElement('span');
    win.className = 'odo-win';
    const strip = document.createElement('span');
    strip.className = 'odo-s';
    for (let n = 0; n < 21; n += 1) {
      const cell = document.createElement('b');
      cell.style.setProperty('--n', String(n));
      cell.textContent = n === 0 ? '' : String((n - 1) % 10);
      strip.append(cell);
    }
    strip.style.transform = `translateY(${-d.start * CELL}%)`;
    win.append(strip);
    col.append(ph, win);
    overlay.append(col);
    strips.push({ strip, ...d });
  });
  const spot = document.createElement('span');
  spot.className = 'odo-w';
  spot.append(real, overlay);
  el.replaceChild(spot, node);
  if (trailing) spot.after(trailing);

  const stage = tokenMs('--t-stage', 780);
  const step = tokenMs('--t-step', 45);
  const hold = tokenMs('--t-hold', 140);
  const ease = getComputedStyle(root).getPropertyValue('--ease').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)';
  const moving = strips.filter(d => d.stop !== d.start);
  const anims = [];
  let timer = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    finishers.delete(finish);
    anims.forEach(a => a.cancel());
    if (spot.isConnected) spot.replaceWith(to);
  };
  finishers.add(finish);
  timer = setTimeout(finish, hold + stage + 600);
  moving.forEach(d => {
    const shorter = moving.length - 1 - moving.indexOf(d); // left columns land first
    const anim = d.strip.animate(
      [{ transform: `translateY(${-d.start * CELL}%)` }, { transform: `translateY(${-d.stop * CELL}%)` }],
      { duration: Math.max(stage - shorter * step, 200), delay: hold, easing: ease, fill: 'both' },
    );
    anims.push(anim);
  });
  // The longest animation ends the roll; the rest land earlier.
  const last = anims.reduce((a, b) => (b.effect.getComputedTiming().endTime > a.effect.getComputedTiming().endTime ? b : a));
  last.finished.then(finish, () => {});
  Promise.all(anims.map(a => a.ready)).then(() => requestAnimationFrame(() => {
    if (!done) spot.classList.add('on'); // one flip: overlay shows, real digits go clear
  }), finish);
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
