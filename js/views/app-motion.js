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
reduce.addEventListener('change', () => {
  root.classList.toggle('motion', !reduce.matches);
  if (reduce.matches) finishOdometers(); // a roll in flight lands on the number at once
});
const STAGGER_CAP = 5;
const CELL = 115; // one strip cell plus its 0.15 line gap, in percent of the window (.odo-s b top in anim.css)
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

function stagger(container, tab = false) {
  if (!container || !on()) return;
  [...container.children].forEach((child, i) => child.style.setProperty('--i', Math.min(i, STAGGER_CAP)));
  container.classList.add('pg-in');
  container.classList.toggle('pg-tab', tab); // Unslop 27: a tab opens in 120ms (anim.css)
  setTimeout(() => container.classList.remove('pg-in', 'pg-tab'), CLEANUP_MS);
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
    stagger(document.getElementById('main'), !top);
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

/** The --ease cubic-bezier as a function of time (0 to 1) -> progress, so the sampled counter follows it. */
function easeFn() {
  const m = /cubic-bezier\(([^)]+)\)/.exec(getComputedStyle(root).getPropertyValue('--ease'));
  const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : [0.22, 1, 0.36, 1];
  const at = (a, b, t) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid; else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

const SAMPLES = 90;
const FIRST_FRAME_MS = 20; // a tap roll starts this far in, so frame one is already moving

/**
 * Where column k (0 = ones) of the number sits while the counter reads v: the digit there, plus a
 * slide to the next digit only while every column below it is on its last unit (a real odometer
 * carry). The ones column slides continuously with v. Returned unwrapped; the caller wraps mod 10.
 */
function columnPosition(v, k) {
  if (k === 0) return v;
  const unit = 10 ** k;
  const below = v - Math.floor(v / unit) * unit;
  return Math.floor(v / unit) + Math.min(1, Math.max(0, below - (unit - 1)));
}

/**
 * Roll the leading number of `el` from `from` to its current text.
 * One counter runs from the old value to the new one on the --ease curve and every column shows
 * its digit of that counter, so every whole frame reads a real value between old and new (a
 * column never lands ahead of the ones below it). Nothing is measured. The real number stays
 * visible and sets the layout. The overlay is a column per digit: a placeholder gives the width and
 * line height and a strip of cells (a 0 to 9 loop, or blank + 1 to 9 for a column the old number
 * didn't have) slides by percent. Web Animations with fill both holds the old digit through the
 * hold; wraps from 9 to 0 are keyframe pairs at one offset. The overlay replaces the real number only
 * after every animation reports ready and one frame painted, in a single class flip. No old value,
 * or an old number with more digits: no roll, the real number just shows.
 */
function roll(el, from, holdMs) {
  const node = el.firstChild;
  if (!node || node.nodeType !== 3 || !el.animate) return;
  const full = node.textContent;
  const to = full.trim();
  if (!/^[\d.]+$/.test(to) || from === to) return;
  if (!from || !/^[\d.]+$/.test(from)) return;
  const toInt = to.split('.')[0].length;
  if (from.split('.')[0].length > toInt) return;
  const pad = toInt - from.split('.')[0].length; // leading columns the old number didn't have
  const old = alignTo(from, to);
  const A = parseInt(old.replace('.', ''), 10);
  const B = parseInt(to.replace('.', ''), 10);
  if (!Number.isFinite(A) || A === B) return;
  const ease = easeFn();
  const digitsOnly = [...to].filter(ch => ch !== '.');
  const n = digitsOnly.length;
  const trailing = full.slice(full.indexOf(to) + to.length);

  // Keyframes per column; a column that never moves gets none.
  const columns = digitsOnly.map((ch, idx) => {
    const k = n - 1 - idx;
    const blank = idx < pad; // blank, then 1 to 9
    const frames = [];
    let prev = null;
    // A big jump would spin a low column dozens of times in under a second. Past 20 cells of
    // travel it makes 10 to 19 instead, still starting and ending on the right digits.
    const u0 = columnPosition(A, k);
    const travel = Math.abs(columnPosition(B, k) - u0);
    const squeeze = !blank && travel > 20 ? (10 + (travel % 10)) / travel : 1;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const v = A + (B - A) * ease(t);
      const raw = columnPosition(i === SAMPLES ? B : v, k);
      const u = u0 + (raw - u0) * squeeze;
      if (blank) {
        frames.push({ offset: t, p: u });
      } else {
        if (prev) {
          const dir = Math.sign(u - prev.u);
          if (dir) {
            // Each 10 crossed is a wrap: p runs 1 to 11 then jumps back to 1 (same picture).
            let m = dir > 0 ? Math.floor(prev.u / 10) + 1 : Math.ceil(prev.u / 10) - 1;
            while (dir > 0 ? m * 10 <= u : m * 10 >= u) {
              const tc = prev.t + (t - prev.t) * ((m * 10 - prev.u) / (u - prev.u));
              frames.push({ offset: tc, p: dir > 0 ? 11 : 1 }, { offset: tc, p: dir > 0 ? 1 : 11 });
              m += dir;
            }
          }
        }
        frames.push({ offset: t, p: ((u % 10) + 10) % 10 + 1 });
        prev = { u, t };
      }
    }
    const moves = frames.some(f => Math.abs(f.p - frames[0].p) > 1e-6);
    return { ch, blank, frames, moves };
  });
  if (!columns.some(c => c.moves)) return; // nothing moves: leave the page alone

  const real = document.createElement('span');
  real.className = 'odo-real';
  real.textContent = to;
  const overlay = document.createElement('span');
  overlay.className = 'odo';
  overlay.setAttribute('aria-hidden', 'true');
  const strips = [];
  let c = 0;
  [...to].forEach(ch => {
    if (ch === '.') {
      overlay.append('.');
      return;
    }
    const column = columns[c];
    c += 1;
    const col = document.createElement('span');
    col.className = 'odo-col';
    const ph = document.createElement('span');
    ph.className = 'odo-ph';
    ph.textContent = ch;
    const win = document.createElement('span');
    win.className = 'odo-win';
    const strip = document.createElement('span');
    strip.className = 'odo-s';
    const count = column.blank ? 10 : 12;
    for (let i = 0; i < count; i += 1) {
      const cell = document.createElement('b');
      cell.style.setProperty('--n', String(i));
      cell.textContent = column.blank ? (i === 0 ? '' : String(i)) : String((i + 9) % 10);
      strip.append(cell);
    }
    strip.style.transform = `translateY(${-column.frames[0].p * CELL}%)`;
    win.append(strip);
    col.append(ph, win);
    overlay.append(col);
    strips.push({ strip, column });
  });
  const spot = document.createElement('span');
  spot.className = 'odo-w';
  spot.append(real, overlay);
  el.replaceChild(spot, node);
  if (trailing) spot.after(trailing);

  const stage = tokenMs('--t-stage', 780);
  const hold = holdMs === undefined ? tokenMs('--t-hold', 140) : holdMs; // a tap rolls at once, the label changed this frame
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
  strips.forEach(({ strip, column }) => {
    if (!column.moves) return;
    anims.push(strip.animate(
      column.frames.map(f => ({ offset: f.offset, transform: `translateY(${-f.p * CELL}%)`, easing: 'linear' })),
      { duration: stage, delay: hold, easing: 'linear', fill: 'both' },
    ));
  });
  anims[0].finished.then(finish, () => {});
  if (hold === 0) {
    // A tap: the label is new already, so the first painted frame must be the roll under way,
    // never the old digits and never the final number sitting there first.
    anims.forEach(a => { a.currentTime = FIRST_FRAME_MS; });
    spot.classList.add('on');
    return;
  }
  Promise.all(anims.map(a => a.ready)).then(() => requestAnimationFrame(() => {
    if (!done) spot.classList.add('on'); // one flip: overlay shows, real digits go clear
  }), finish);
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
    if (before && before !== text) roll(el, before, 0); // a tap: label is new already, roll at once
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
