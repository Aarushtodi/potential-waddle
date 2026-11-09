/**
 * Goals motion (council moves, tokens from css/motion.css). render.js calls afterGoalsRender()
 * after every redraw. Every move plays only when a screen opens or on a tap, then stops on the
 * plain layout: full size, full opacity. Nothing runs without the root .motion class (reduced
 * motion off), so with reduced motion every screen simply appears.
 *
 *   question opens   the whole screen body slides in 24px and fades up as one (no mask through text)
 *   progress bar     rule draw from the last step's width to this one's
 *   tile tapped      pop: scale from --press-scale back to 1
 *   Your plan        cover plate (once a session): fades in over --t-press (the plan under it is
 *                    hidden until the plate leaves), the picks tick off, then it fades out over the
 *                    plan, which is already drawn at its real numbers, then it is removed.
 *                    Any tap skips, and that tap's click is swallowed so it never lands on Start.
 *                    The whole moment stays under PLATE_CAP_MS.
 */
import { qs, qsa } from '../format.js';

const PLATE_CAP_MS = 1200;
const TICK_SPREAD_MS = 240; // all picks tick within this, so hold + ticks + lift fit under the cap

const motionOn = () => document.documentElement.classList.contains('motion');
const token = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

let lastScreen = '';
let lastBar = null;
let pickedKey = null;
let plateShown = false;
let plateTimers = [];

/** actions.js calls this on a tile tap, so the next draw pops that tile. */
export function goalPicked(key) {
  pickedKey = String(key);
}

/** goals.js asks before drawing the plan: the cover plate shows once a session, motion only. */
export const planPlateDue = () => !plateShown && typeof document !== 'undefined' && motionOn();

export function afterGoalsRender() {
  const screen = qs('.scr.goals');
  if (!screen) {
    lastScreen = '';
    lastBar = null;
    pickedKey = null;
    return;
  }
  const key = screen.dataset.goalScreen;
  const opening = key !== lastScreen;
  lastScreen = key;
  const bar = qs('.g-bar i');
  const fraction = bar ? parseFloat(bar.style.transform.slice(7)) : 0;
  if (motionOn()) {
    if (bar && fraction !== lastBar) drawBar(bar, lastBar ?? 0, fraction);
    if (opening && key !== 'plan') openQuestion(screen);
    if (pickedKey) pop(pickedKey);
    if (key === 'plan' && qs('.gplate') && !plateShown) runPlate();
  }
  lastBar = fraction;
  pickedKey = null;
}

// ---- Question screens ---------------------------------------------------------------------

function drawBar(bar, from, to) {
  bar.style.transition = 'none';
  bar.style.transform = `scaleX(${from})`;
  void bar.offsetWidth; // paint the start width before the transition
  bar.style.transition = '';
  bar.style.transform = `scaleX(${to})`;
}

/** The screen slide in is a CSS animation on .enter. */
function openQuestion(screen) {
  screen.classList.add('enter');
}

function pop(key) {
  const tile = qsa('.g-tile').find(node => node.dataset.pick === key);
  if (tile) tile.classList.add('pop');
}

// ---- Your plan: cover plate ------------------------------------------------------------------

function runPlate() {
  plateShown = true;
  const plate = qs('.gplate');
  const rows = qsa('.gplate-row');

  const hold = token('--t-hold');
  const tick = token('--t-press');
  const enter = tick; // the plate's own fade in (CSS .gplate animation), ticks start after it
  const gap = rows.length > 1 ? TICK_SPREAD_MS / (rows.length - 1) : 0;
  rows.forEach((row, i) => plateTimers.push(setTimeout(() => row.classList.add('on'), enter + i * gap)));
  const liftAt = enter + Math.max(hold, (rows.length - 1) * gap + tick);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    plateTimers.forEach(clearTimeout);
    plateTimers = [];
    document.removeEventListener('pointerdown', skip, true);
    document.removeEventListener('keydown', finish, true);
    plate.remove();
  };
  // A skip tap ends the plate; the click that follows the same tap must not press Start under it.
  const skip = () => {
    const swallow = event => {
      event.stopPropagation();
      event.preventDefault();
    };
    // WebKit fires no click when the tapped plate is gone by pointerup, so the swallow also ends
    // at the next tap or after 600ms; it must never eat a later, real tap.
    const drop = () => document.removeEventListener('click', swallow, true);
    document.addEventListener('click', swallow, { capture: true, once: true });
    document.addEventListener('pointerdown', drop, { capture: true, once: true });
    setTimeout(drop, 600);
    finish();
  };
  plateTimers.push(setTimeout(() => plate.classList.add('lift'), liftAt));
  plate.addEventListener('transitionend', event => {
    if (event.target === plate) finish();
  });
  plateTimers.push(setTimeout(finish, PLATE_CAP_MS)); // never longer than the cap, even if transitionend is lost
  document.addEventListener('pointerdown', skip, true);
  document.addEventListener('keydown', finish, true);
}
