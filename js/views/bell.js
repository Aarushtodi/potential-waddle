/**
 * Bell tab: the school day as a vertical tape, with a "now" line.
 *
 * Sample mode: the sample A and B days, with the sample clock on the A day.
 * Real grades: only what HAC gives (js/bell-store.js): that date's periods and times from HAC's
 * Daily Schedule, the A/B letter from each class's day on Classes > Schedule, and the phone's own
 * clock. No saved page for today = the "isn't in HAC" card. No preset, no typed times, no guessed
 * A/B day, ever.
 *
 * Layout is absolute: every card, time label, gap and the now line gets its top from
 * yAt(minutes), so gaps can be taller than their minutes and the line still lands right.
 * The live parts (fill, now line, "N min left", clock pill, Now line) are patched once a second by
 * refreshLive via data-live / data-live-style, so the nodes (and their pulse) are kept.
 */
import { escapeHtml, clockTime, WEEKDAYS, MONTHS_SHORT } from '../format.js';
import { state } from '../state.js';
import { periodsFor, sampleMinutesNow } from '../schedule.js';
import { segmented, heading } from './components.js';
import { real } from '../real-data.js';
import { bell, savedDay } from '../bell-store.js';
import { dateKey, minutesOf, clockIn } from '../bell-times.js';
import { dayLetter } from '../hac-schedule-parse.js';

const PX_PER_MINUTE = 1.7;
const WALK_GAP_PX = 30; // a gap is at least this tall, so its label never touches a card
const SEAM_PX = 4; // back to back periods (Chemistry, then Lunch) still get a thin seam
const TOP_PAD = 8;
const BOTTOM_PAD = 12;

const clamp01 = n => Math.max(0, Math.min(1, n));

export function bellView() {
  if (real.on) return realBell();
  return `<div class="sec" style="margin-bottom:14px">`
    + segmented('pickBellDay', state.bellDay, [['A', 'A day, today'], ['B', 'B day, next']])
    + `</div><div class="sec">${sampleTape()}</div>`;
}

const notInHac = () => `<div class="sec"><div class="card"><div class="pad"><div class="t">Your bell schedule isn't in HAC</div>`
  + `<div class="s" style="margin-top:4px">Tally only shows what HAC gives it, so there are no class times here yet.</div></div></div></div>`;

/** "AP Pre Calculus S1" -> "AP Pre Calculus". */
const plainName = course => String(course || '').replace(/\s+S[12]$/i, '').trim();

const dayLabel = date => `${WEEKDAYS[date.getDay()].slice(0, 3)}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;

/** Real grades: today's periods exactly as HAC's Daily Schedule gives them. */
function realBell() {
  const now = new Date();
  const day = savedDay(now);
  if (!day) return notInHac();
  if (day.none) {
    return `<div class="sec">${heading(dayLabel(now), 'No classes ', 'today')}`
      + `<div class="card"><div class="pad"><div class="s">HAC has nothing on your schedule today.</div></div></div></div>`;
  }
  const periods = day.periods.map(p => ({
    name: plainName(p.course) || `Period ${p.label}`,
    room: p.room,
    start: p.start,
    end: p.end,
  }));
  const letter = dayLetter(day.periods, bell.hac && bell.hac.entries);
  const minutes = minutesOf(now);
  return `<div class="sec">${letter ? heading(dayLabel(now), '', `${letter} day`) : heading(dayLabel(now), 'Your ', 'classes')}`
    + `<div class="card"><div class="pad" data-live>${nowLine(periods, minutes)}</div></div></div>`
    + `<div class="sec">${tape(periods, minutes, dateKey(now), n => `${n} min`)}</div>`;
}

const at = (row, prefix = '') => (row.room ? `${escapeHtml(row.room)}, ${prefix}` : prefix.charAt(0).toUpperCase() + prefix.slice(1));

/** The line over the tape: what's on now and what's next, in words. */
function nowLine(periods, minutes) {
  const c = clockIn(periods, minutes);
  if (c.after) {
    const last = periods[periods.length - 1];
    return `<div class="t">Done for today</div><div class="s">Last class ended at ${clockTime(last.end)}.</div>`;
  }
  if (c.current) {
    const then = c.next ? `, then ${escapeHtml(c.next.name)} at ${clockTime(c.next.start)}` : ', last class today';
    return `<div class="t">${escapeHtml(c.current.name)}</div>`
      + `<div class="s">${c.current.room ? escapeHtml(c.current.room) + ', ' : ''}${c.minutesLeft} min left${then}</div>`;
  }
  const soon = c.minutesToNext <= 60 ? `, in ${c.minutesToNext} min` : '';
  return `<div class="t">${c.before ? 'First' : 'Next'}: ${escapeHtml(c.next.name)}</div>`
    + `<div class="s">${at(c.next, 'starts ')}${clockTime(c.next.start)}${soon}</div>`;
}

/** Sample mode's tape: the A day ("today") runs on the sample clock, the B day starts at the first bell. */
function sampleTape() {
  const today = isToday();
  return tape(periodsFor(state.bellDay), today ? sampleMinutesNow() : null, state.bellDay, n => `${n} min walk`);
}

const isToday = () => state.bellDay === 'A';

/** Each period with its pixel box; gaps between periods are stretched to at least WALK_GAP_PX. */
function layout(periods) {
  let y = TOP_PAD;
  return periods.map((p, i) => {
    const previous = periods[i - 1];
    let gap = null;
    if (previous) {
      const minutes = p.start - previous.end;
      const height = minutes > 0 ? Math.max(WALK_GAP_PX, minutes * PX_PER_MINUTE) : SEAM_PX;
      gap = { minutes, top: y, height };
      y += height;
    }
    const box = { ...p, gap, top: y, height: (p.end - p.start) * PX_PER_MINUTE };
    y += box.height;
    return box;
  });
}

/** Pixel position of a time on the tape (inside a gap it moves evenly across the gap). */
function yAt(boxes, minutes) {
  for (const box of boxes) {
    if (box.gap && minutes < box.start) {
      const previousEnd = box.start - box.gap.minutes;
      const share = box.gap.minutes > 0 ? clamp01((minutes - previousEnd) / box.gap.minutes) : 0;
      return box.gap.top + share * box.gap.height;
    }
    if (minutes < box.end) return box.top + clamp01((minutes - box.start) / (box.end - box.start)) * box.height;
  }
  const last = boxes[boxes.length - 1];
  return last.top + last.height;
}

/**
 * The tape. minutes: the clock now, or null for a day that isn't today (no now line).
 * key: redraws the whole tab when it changes (see data-live-key). gapText(minutes): a gap's label.
 */
function tape(periods, minutes, key, gapText) {
  const boxes = layout(periods);
  const today = minutes != null;
  const inDay = today && minutes >= periods[0].start && minutes < periods[periods.length - 1].end;
  const currentIndex = today ? boxes.findIndex(b => minutes >= b.start && minutes < b.end) : -1;
  const nextIndex = today ? boxes.findIndex(b => b.start > minutes) : -1;

  let html = '';
  boxes.forEach((box, i) => {
    if (box.gap && box.gap.minutes > 0) {
      html += `<div class="tg" style="top:${box.gap.top}px;height:${box.gap.height}px"><span>${gapText(box.gap.minutes)}</span></div>`;
    }
    const past = today && minutes >= box.end;
    const kind = i === currentIndex ? ' cur' : i === nextIndex ? ' next' : past ? ' past' : '';
    html += `<div class="tick${past ? ' past' : ''}" style="top:${box.top}px">${clockTime(box.start)}</div>`
      + `<div class="tb${kind}" style="top:${box.top}px;height:${box.height}px;--i:${i}">`
      + (i === currentIndex
        ? `<div class="fill" data-live-style style="height:${(clamp01((minutes - box.start) / (box.end - box.start)) * 100).toFixed(3)}%"></div>`
          + `<div class="nowc" data-live-style style="top:${(clamp01((minutes - box.start) / (box.end - box.start)) * 100).toFixed(3)}%"></div>`
        : '')
      + `<div class="t">${escapeHtml(box.name)}</div><div class="s">${box.room ? escapeHtml(box.room) + ', to ' : 'To '}${clockTime(box.end)}</div>`
      + (i === currentIndex ? `<div class="s left" data-live>${Math.ceil(box.end - minutes)} min left</div>` : '')
      + `</div>`;
  });
  if (inDay) {
    html += `<div class="nowl${currentIndex >= 0 ? ' in-card' : ''}" data-live-style style="top:${yAt(boxes, minutes).toFixed(2)}px">`
      + `<span data-live>${clockTime(Math.floor(minutes))}</span><i></i></div>`;
  }
  const last = boxes[boxes.length - 1];
  // data-live-key: when the day, the current or the next period changes, refreshLive redraws the whole tab.
  return `<div class="tapew"><div id="tape" tabindex="0" aria-label="Bell schedule" data-live-key="${key}${currentIndex}${nextIndex}${inDay}">`
    + `<div class="tape-in" style="height:${last.top + last.height + BOTTOM_PAD}px">${html}</div></div></div>`;
}
