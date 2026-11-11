/**
 * Bell tab: the sample school day as a vertical tape, with a "now" line on the A day.
 * Only the A day ("today") has a live clock; the B day is shown from the first bell.
 *
 * Layout is absolute: every card, time label, walk gap and the now line gets its top from
 * yAt(minutes), so walk gaps can be taller than their minutes and the line still lands right.
 * The live parts (fill, now line, "N min left", clock pill) are patched once a second by
 * refreshLive via data-live / data-live-style, so the nodes (and their pulse) are kept.
 */
import { escapeHtml, clockTime } from '../format.js';
import { state } from '../state.js';
import { periodsFor, sampleMinutesNow } from '../schedule.js';
import { segmented } from './components.js';

const PX_PER_MINUTE = 1.7;
const WALK_GAP_PX = 30; // a walk gap is at least this tall, so its label never touches a card
const SEAM_PX = 4; // back to back periods (Chemistry, then Lunch) still get a thin seam
const TOP_PAD = 8;
const BOTTOM_PAD = 12;

const clamp01 = n => Math.max(0, Math.min(1, n));

export function bellView() {
  return `<div class="sec" style="margin-bottom:14px">`
    + segmented('pickBellDay', state.bellDay, [['A', 'A day, today'], ['B', 'B day, next']])
    + `</div><div class="sec">${tape()}</div>`;
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

function tape() {
  const periods = periodsFor(state.bellDay);
  const boxes = layout(periods);
  const today = isToday();
  const minutes = today ? sampleMinutesNow() : null;
  const inDay = today && minutes >= periods[0].start && minutes < periods[periods.length - 1].end;
  const currentIndex = today ? boxes.findIndex(b => minutes >= b.start && minutes < b.end) : -1;
  const nextIndex = today ? boxes.findIndex(b => b.start > minutes) : -1;

  let html = '';
  boxes.forEach((box, i) => {
    if (box.gap && box.gap.minutes > 0) {
      html += `<div class="tg" style="top:${box.gap.top}px;height:${box.gap.height}px"><span>${box.gap.minutes} min walk</span></div>`;
    }
    const past = today && minutes >= box.end;
    const kind = i === currentIndex ? ' cur' : i === nextIndex ? ' next' : past ? ' past' : '';
    html += `<div class="tick${past ? ' past' : ''}" style="top:${box.top}px">${clockTime(box.start)}</div>`
      + `<div class="tb${kind}" style="top:${box.top}px;height:${box.height}px;--i:${i}">`
      + (i === currentIndex
        ? `<div class="fill" data-live-style style="height:${(clamp01((minutes - box.start) / (box.end - box.start)) * 100).toFixed(3)}%"></div>`
        : '')
      + `<div class="t">${escapeHtml(box.name)}</div><div class="s">${escapeHtml(box.room)}, to ${clockTime(box.end)}</div>`
      + (i === currentIndex ? `<div class="s left" data-live>${Math.ceil(box.end - minutes)} min left</div>` : '')
      + `</div>`;
  });
  if (inDay) {
    html += `<div class="nowl${currentIndex >= 0 ? ' in-card' : ''}" data-live-style style="top:${yAt(boxes, minutes).toFixed(2)}px">`
      + `<span data-live>${clockTime(Math.floor(minutes))}</span><i></i></div>`;
  }
  const last = boxes[boxes.length - 1];
  // data-live-key: when the current or next period changes, refreshLive redraws the whole tab.
  return `<div class="tapew"><div id="tape" tabindex="0" aria-label="Bell schedule" data-live-key="${state.bellDay}${currentIndex}${nextIndex}${inDay}">`
    + `<div class="tape-in" style="height:${last.top + last.height + BOTTOM_PAD}px">${html}</div></div></div>`;
}
