/**
 * Stay on the newest build. A Home Screen web app can sit in memory for days (or come back from
 * the back/forward cache), so after a deploy it keeps running the old code until it is swiped
 * away. Here the app asks version.json (served no-store) which build is live, and when that is not
 * the build running in this page it reloads itself, silently, at a safe moment.
 *
 * When it checks: coming back to the front (visibilitychange to visible, pageshow from the
 * back/forward cache) and every 10 minutes while open. Offline, an error, a 404 or an odd answer
 * = do nothing.
 *
 * Safe moment: no text field focused, no sheet open, no paste or refresh running, the Face ID
 * cover not up, and no tap or key since the check started. Not safe = wait; the next time the app
 * is hidden or comes back, it tries again.
 *
 * Nothing is lost: only grades, the look and a few seen flags live in localStorage, so just before
 * the reload the whole `state` is handed to the next page in sessionStorage, and restoreHandoff()
 * puts it back before the first render. A normal launch has no handoff and boots exactly as before.
 *
 * The running build is the ?v= on js/app.js (app.js passes it in). dev/bust.sh writes that stamp
 * and version.json together, so they can't drift apart.
 */
import { state } from './state.js';

const VERSION_URL = 'version.json';
const EVERY_MS = 10 * 60 * 1000;
const HANDOFF_KEY = 'tally-handoff-v1';
const TRIED_KEY = 'tally-reloaded-for';
const HANDOFF_MAX_AGE_MS = 2 * 60 * 1000;
const STAMP = /^[0-9]{8}[a-z0-9]{0,4}$/;
// Not carried over: an open sheet, a banner, a refresh or paste in flight, the Face ID cover.
const SKIP = new Set(['sheet', 'banner', 'loading', 'importBusy', 'locked']);

let running = null; // this page's build stamp
let checking = false;
let pending = null; // a newer build seen, waiting for a safe moment
let lastInput = 0;
let leaving = false; // between pagehide (or our reload) and the next pageshow

const store = kind => {
  try {
    return window[kind];
  } catch {
    return null;
  }
};

/** Ask which build is live. Resolves to its stamp, or null on any problem. */
async function liveStamp() {
  try {
    const response = await fetch(VERSION_URL, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data.v === 'string' && STAMP.test(data.v) ? data.v : null;
  } catch {
    return null;
  }
}

function safeNow(since) {
  const field = document.activeElement;
  if (field && field !== document.body && field.matches('input, textarea, select, [contenteditable]')) return false;
  if (state.sheet || state.loading || state.importBusy || state.locked || state.screen === 'import') return false;
  return lastInput <= since;
}

function reloadTo(target) {
  const session = store('sessionStorage');
  try {
    if (session.getItem(TRIED_KEY) === target) return; // already tried for this build: never loop
    session.setItem(TRIED_KEY, target);
    const copy = {};
    for (const key of Object.keys(state)) if (!SKIP.has(key)) copy[key] = state[key];
    session.setItem(HANDOFF_KEY, JSON.stringify({ at: Date.now(), from: running, state: copy }));
  } catch {
    return; // no session storage: a reload would lose the student's work, so stay put
  }
  leaving = true;
  location.reload();
}

/** A newer build is waiting: take it now if it is safe. */
function tryPending(since = Date.now()) {
  if (pending && !leaving && safeNow(since)) reloadTo(pending);
}

async function check() {
  if (checking || leaving || !running) return;
  checking = true;
  const started = Date.now();
  const live = await liveStamp();
  checking = false;
  if (!live || live === running) return;
  pending = live;
  // A beat later, so the finished fetch is fully closed before the page goes (WebKit logs a
  // cancelled load otherwise); safety is checked again at that moment.
  setTimeout(() => tryPending(started), 80);
}

/** Start watching for new builds. `build` is this page's stamp; without one, do nothing. */
export function startFreshCheck(build) {
  if (!build || !STAMP.test(build)) return;
  running = build;
  for (const type of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(type, () => (lastInput = Date.now()), { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
    else tryPending();
  });
  addEventListener('pageshow', event => {
    leaving = false;
    if (event.persisted) check();
  });
  addEventListener('pagehide', event => {
    tryPending();
    // Not persisted = this document is being thrown away; going into the back/forward cache, a
    // pageshow will follow and clear the flag.
    if (!event.persisted) leaving = true;
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, EVERY_MS);
}

/**
 * At boot, after saved grades load and before the first render: put back the state the last
 * page handed over just before it reloaded. Only keys this build still has, with the same kind
 * of value, so a renamed or reshaped field falls back to its default. Returns true if it did.
 */
export function restoreHandoff() {
  const session = store('sessionStorage');
  let handoff = null;
  try {
    handoff = JSON.parse(session.getItem(HANDOFF_KEY) || 'null');
    session.removeItem(HANDOFF_KEY);
  } catch {
    return false;
  }
  if (!handoff || !handoff.state || typeof handoff.at !== 'number') return false;
  if (Date.now() - handoff.at > HANDOFF_MAX_AGE_MS || handoff.at > Date.now() + 5000) return false;
  const kind = value => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
  for (const [key, value] of Object.entries(handoff.state)) {
    if (SKIP.has(key) || !(key in state)) continue;
    const want = kind(state[key]);
    if (want === 'null' || value === null || kind(value) === want) state[key] = value;
  }
  return true;
}
