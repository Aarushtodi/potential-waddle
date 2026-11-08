/**
 * Bell tab: minutes left in the current period on the sample school day.
 * Three looks are offered so the student can pick one (Big number, Dial, Tape).
 * Only the A day ("today") has a live clock; the B day is shown from the first bell.
 */
import { escapeHtml, clockTime } from '../format.js';
import { state } from '../state.js';
import { periodsFor, sampleMinutesNow, currentPeriod } from '../schedule.js';
import { actionAttrs, segmented } from './components.js';

const DAY_START = 510; // 8:30
const DAY_END = 920; // 3:20

const clamp01 = n => Math.max(0, Math.min(1, n));

export function bellView() {
  const look = state.bellLook;
  const body = look === 'dial' ? dialLook() : look === 'tape' ? tapeLook() : bigNumberLook();
  return `<div class="sec" style="margin-bottom:14px">`
    + `<div class="lab" style="margin-bottom:6px">Sample school day. Pick a look.</div>`
    + segmented('pickBellLook', look, [['big', '1 Big number'], ['dial', '2 Dial'], ['tape', '3 Tape']])
    + `<div style="height:8px"></div>`
    + segmented('pickBellDay', state.bellDay, [['A', 'A day, today'], ['B', 'B day, next']])
    + `</div><div class="sec">${body}</div>`;
}

const isToday = () => state.bellDay === 'A';
const minutesNow = () => (isToday() ? sampleMinutesNow() : 0);

/** Period to show: the one the student tapped, else the current one, else the first. */
function shownPeriodIndex(periods) {
  if (state.bellSelected != null && periods[state.bellSelected]) return state.bellSelected;
  if (isToday()) {
    const now = currentPeriod();
    return now ? now.index : 0;
  }
  return 0;
}

/** Share of a period already done, 0 to 1 (always 0 on the B day). */
const periodProgress = (period, minutes) =>
  (isToday() ? clamp01((minutes - period.start) / (period.end - period.start)) : 0);

// ---- 1 Big number -------------------------------------------------------------------------

function bigNumberLook() {
  const periods = periodsFor(state.bellDay);
  const minutes = minutesNow();
  const index = shownPeriodIndex(periods);
  const period = periods[index];
  const inProgress = isToday() && minutes >= period.start && minutes < period.end;
  const next = periods[index + 1];
  const smallerNumber = inProgress ? '' : ' style="font-size:84px;letter-spacing:-3px;padding:14px 0 8px"';
  const blocks = periods.map((p, i) =>
    `<button aria-label="${escapeHtml(p.name)}" class="${i === index ? 'sel' : ''}" style="flex:${p.end - p.start}" `
    + `${actionAttrs('selectPeriod', i)}><i style="width:${periodProgress(p, minutes) * 100}%"></i></button>`).join('');
  return `<div class="card" style="position:relative"><div class="pad" data-live>`
    + `<div class="letter">${state.bellDay}</div>`
    + `<div class="bign"${smallerNumber}>${inProgress ? Math.ceil(period.end - minutes) : clockTime(period.start)}</div>`
    + `<div class="bigm">${inProgress ? 'min left' : 'to ' + clockTime(period.end)}</div>`
    + `<div class="t" style="margin-top:12px;font-size:19px">${escapeHtml(period.name)}, ${escapeHtml(period.room)}</div>`
    + `<div class="s" style="font-size:14.5px">`
    + (next ? 'Then ' + escapeHtml(next.name) + ', ' + escapeHtml(next.room) : 'Last class of the day')
    + `</div>`
    + `<div class="dayb">${blocks}</div>`
    + `<div class="s" style="display:flex;justify-content:space-between;font-size:11.5px">`
    + `<span>${clockTime(periods[0].start)}</span><span>Tap a block</span>`
    + `<span>${clockTime(periods[periods.length - 1].end)}</span></div>`
    + `</div></div>`;
}

// ---- 2 Dial -------------------------------------------------------------------------------

function dialLook() {
  const periods = periodsFor(state.bellDay);
  const minutes = minutesNow();
  const index = shownPeriodIndex(periods);
  // The school day maps onto 340 degrees of a circle, starting 10 degrees past 12 o'clock.
  const angleAt = time => (time - DAY_START) / (DAY_END - DAY_START) * 340 + 10;
  const RADIUS = 112;
  const CENTER = 150;
  const pointAt = angle => {
    const radians = (angle - 90) * Math.PI / 180;
    return [CENTER + RADIUS * Math.cos(radians), CENTER + RADIUS * Math.sin(radians)];
  };
  const arc = (from, to) => {
    const [x1, y1] = pointAt(from);
    const [x2, y2] = pointAt(to);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${RADIUS} ${RADIUS} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  // Each period is a gray arc, filled in ink as it passes. A wide transparent arc on top is the tap target.
  const segments = periods.map((p, i) => {
    const from = angleAt(p.start);
    const to = angleAt(p.end);
    const width = i === index ? 24 : 20;
    const progress = periodProgress(p, minutes);
    return `<g ${actionAttrs('selectPeriod', i)}>`
      + `<path d="${arc(from, to)}" fill="none" stroke="var(--empty)" stroke-width="${width}"/>`
      + (progress > 0 ? `<path d="${arc(from, from + (to - from) * progress)}" fill="none" stroke="var(--ink)" stroke-width="${width}"/>` : '')
      + `<path d="${arc(from, to)}" fill="none" stroke="transparent" stroke-width="44"/></g>`;
  }).join('');

  const period = periods[index];
  const inProgress = isToday() && minutes >= period.start && minutes < period.end;
  const next = periods[index + 1];
  const [handX, handY] = pointAt(angleAt(isToday() ? Math.min(DAY_END, Math.max(DAY_START, minutes)) : DAY_START));
  const hand = isToday()
    ? `<circle cx="${handX}" cy="${handY}" r="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/>`
    : '';
  const name = period.name.length > 20 ? period.name.slice(0, 19) + '.' : period.name;

  return `<div class="card"><div class="pad" data-live><svg class="dial" viewBox="0 0 300 300">${segments}${hand}`
    + `<text x="150" y="${inProgress ? 132 : 136}" text-anchor="middle" font-size="${inProgress ? 62 : 40}" font-weight="800">`
    + `${inProgress ? Math.ceil(period.end - minutes) : clockTime(period.start)}</text>`
    + `<text x="150" y="${inProgress ? 157 : 162}" text-anchor="middle" font-size="19" font-style="italic" font-weight="700" `
    + `style="font-family:var(--serif)">${inProgress ? 'min left' : 'to ' + clockTime(period.end)}</text>`
    + `<text x="150" y="186" text-anchor="middle" font-size="14.5" font-weight="700">${escapeHtml(name)}</text>`
    + `<text x="150" y="205" text-anchor="middle" font-size="12.5" opacity=".75">`
    + `${escapeHtml(period.room)}${next ? ', then ' + escapeHtml(next.room) : ''}</text>`
    + `</svg></div></div>`;
}

// ---- 3 Tape -------------------------------------------------------------------------------

/** The day as a vertical tape, 1.7 px per minute, with a "now" line across the current period. */
function tapeLook() {
  const periods = periodsFor(state.bellDay);
  const minutes = minutesNow();
  const PX_PER_MINUTE = 1.7;
  let html = '';
  periods.forEach((p, i) => {
    const previous = periods[i - 1];
    if (previous && p.start > previous.end) {
      html += `<div class="tg" style="height:${(p.start - previous.end) * PX_PER_MINUTE}px;padding-left:12px">`
        + `${p.start - previous.end} min walk</div>`;
    }
    const progress = periodProgress(p, minutes);
    const current = isToday() && minutes >= p.start && minutes < p.end;
    html += `<div class="tw${current ? ' cur' : ''}"><span class="tick" style="top:0">${clockTime(p.start)}</span>`
      + `<div class="tb" style="height:${(p.end - p.start) * PX_PER_MINUTE}px">`
      + `<div class="fill" style="height:${progress * 100}%"></div>`
      + `<div class="t">${escapeHtml(p.name)}</div><div class="s">${escapeHtml(p.room)}, to ${clockTime(p.end)}</div>`
      + (current ? `<div class="s" style="position:relative;margin-top:6px;font-weight:700;color:var(--ink)">${Math.ceil(p.end - minutes)} min left</div>` : '')
      + `</div>`
      + (current ? `<div class="nowl" style="top:${progress * 100}%"><span>${clockTime(Math.floor(minutes))}</span></div>` : '')
      + `</div>`;
  });
  return `<div class="tapew"><div id="tape"><div data-live>${html}</div></div></div>`;
}
