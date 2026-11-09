/**
 * The "done" moment when a to-do is ticked (his ask 11/9: "Cool animation here when something
 * gets done", about Calendar's "Three left today" card).
 *
 * Calendar (and any list whose rows stay put): the tap changes state, the screen redraws, then
 * afterDoneRender() plays on the new screen:
 *   ring        fills with a check and pops, a red ring bursts out once
 *   row         settles as done (ink fades to gray, the strike fades in)
 *   bars        the next segment fills left to right
 *   count       "0 of 3 done" rolls to "1 of 3 done"
 *   heading     the count word rolls ("Three left today" to "Two left today")
 *   last one    the segments flash red once, the heading rolls to "All done today"
 * Untick (undo) plays it backwards: the segment empties, the count and heading roll down.
 *
 * Home moves a ticked row (open rows first, missing rows leave the lead card), so there the
 * ring pops in place first and the redraw waits until it is done (holdOnHome).
 *
 * All of it is under 600 ms. Reduced motion: nothing plays, the screen just changes.
 */
import { ui } from '../state.js';
import { render } from '../render.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How long Home keeps a ticked row in place while its ring pops. */
const HOME_HOLD_MS = 360;
/** Classes and roll spans are removed after this, so later redraws start clean. */
const CLEANUP_MS = 620;

const markFor = id => document.querySelector(`.mark[data-action="toggleDone"][data-x="${CSS.escape(id)}"]`);

/** Text of a heading before the redraw: the lead words and the italic accent. */
function readHeading(section) {
  const hd = section && section.querySelector('.hd');
  if (!hd) return null;
  const accent = hd.querySelector('i');
  return { lead: hd.firstChild && hd.firstChild.nodeType === 3 ? hd.firstChild.nodeValue : '', accent: accent ? accent.textContent : '' };
}

/**
 * Called by actions.toggleDone before the state changes. Remembers what the card said, so the
 * redraw can roll from the old words to the new ones. Returns true when the action should not
 * redraw now (Home: the redraw comes after the pop).
 */
export function beforeToggle(id, element, nowDone) {
  ui.doneFx = null;
  if (reducedMotion() || !element) return false;

  if (nowDone && element.closest('.card.quiet, .card.lead')) {
    holdOnHome(element);
    return true;
  }
  const section = element.closest('.sec');
  const count = section && section.querySelector('.prog em');
  ui.doneFx = { id, nowDone, heading: readHeading(section), count: count ? count.textContent : null };
  return false;
}

/** Home: tick the ring and settle the row where it is, then redraw. */
function holdOnHome(element) {
  const ring = element.querySelector('b');
  const row = element.closest('.row');
  if (ring) ring.className = 'on pop';
  if (row) row.classList.add('done', 'settle');
  clearTimeout(ui.doneHoldTimer);
  ui.doneHoldTimer = setTimeout(render, HOME_HOLD_MS);
}

/** render.js calls this after every full redraw. */
export function afterDoneRender() {
  const fx = ui.doneFx;
  ui.doneFx = null;
  if (!fx || reducedMotion()) return;
  const mark = markFor(fx.id);
  if (!mark) return;
  const touched = [];
  const add = (node, ...names) => {
    if (!node) return;
    node.classList.add(...names);
    touched.push([node, names]);
  };

  const ring = mark.querySelector('b');
  const row = mark.closest('.row');
  if (fx.nowDone) {
    add(ring, 'pop');
    add(row, 'settle');
  } else {
    add(ring, 'unpop');
  }

  const section = mark.closest('.sec');
  const rolls = [];
  const em = section && section.querySelector('.prog em');
  if (em && fx.count != null) rolls.push(rollText(em, fx.count, fx.nowDone));

  const bars = section ? [...section.querySelectorAll('.bars > span')] : [];
  const doneCount = bars.filter(bar => bar.classList.contains('f')).length;
  // One bar per item (up to 10): the segment that changed fills or empties.
  if (bars.length > 1) {
    if (fx.nowDone) {
      add(bars[doneCount - 1], 'grow');
      if (doneCount === bars.length) bars.forEach((bar, i) => add(bar, 'flash', 'flash' + Math.min(i, 9)));
    } else {
      add(bars[doneCount], 'shrink');
    }
  }

  const hd = section && section.querySelector('.hd');
  if (hd && fx.heading) {
    const lead = hd.firstChild && hd.firstChild.nodeType === 3 ? hd.firstChild : null;
    if (lead && lead.nodeValue !== fx.heading.lead) rolls.push(rollText(hd, fx.heading.lead, fx.nowDone, lead));
    const accent = hd.querySelector('i');
    if (accent && accent.textContent !== fx.heading.accent) rolls.push(rollText(accent, fx.heading.accent, fx.nowDone));
  }

  setTimeout(() => {
    touched.forEach(([node, names]) => node.classList.remove(...names));
    rolls.forEach(undoRoll => undoRoll && undoRoll());
  }, CLEANUP_MS);
}

/**
 * Rolls the changed front of a text node from oldText to its current text, like an odometer:
 * up when a to-do is done, down on undo. The shared end ("left today", " of 3 done") stays still.
 * Returns a function that puts the plain text back.
 */
function rollText(element, oldText, up, textNode = element.firstChild) {
  if (!textNode || textNode.nodeType !== 3) return null;
  const newText = textNode.nodeValue;
  if (newText === oldText) return null;
  let shared = 0;
  while (shared < oldText.length && shared < newText.length
    && oldText[oldText.length - 1 - shared] === newText[newText.length - 1 - shared]) shared++;
  // Keep a space at the start of the still part so the rolling word ends on a word edge.
  const from = oldText.slice(0, oldText.length - shared);
  const to = newText.slice(0, newText.length - shared);
  const rest = newText.slice(newText.length - shared);

  const roll = document.createElement('span');
  roll.className = 'roll ' + (up ? 'up' : 'down');
  const track = document.createElement('span');
  track.className = 'roll-t';
  const oldSpan = document.createElement('span');
  const newSpan = document.createElement('span');
  oldSpan.textContent = from;
  newSpan.textContent = to;
  // Up: old on top, new below it, the track slides up. Down: the other way round.
  if (up) track.append(oldSpan, newSpan);
  else track.append(newSpan, oldSpan);
  roll.append(track);

  const still = document.createTextNode(rest);
  element.replaceChild(still, textNode);
  element.insertBefore(roll, still);

  // The box eases from the old word's width to the new one, so the rest of the line glides.
  const oldWidth = measure(element, from);
  const newWidth = measure(element, to);
  roll.style.width = oldWidth + 'px';
  void roll.offsetWidth;
  roll.style.width = newWidth + 'px';

  return () => {
    if (!roll.isConnected) return;
    roll.remove();
    still.nodeValue = newText;
  };
}

/** Width of text in the element's font, measured off screen. */
function measure(element, text) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  probe.textContent = text;
  element.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}
