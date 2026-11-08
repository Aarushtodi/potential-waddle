/**
 * Formatting helpers: DOM lookup, HTML escaping, the sample calendar, number and date text.
 * Nothing in here reads or changes app state.
 */

import { isScored } from './grade-math.js';

export const qs = selector => document.querySelector(selector);
export const qsa = selector => [...document.querySelectorAll(selector)];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Every view is an HTML string, so anything typed by the user or read from data goes through this. */
export const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

// ---- Sample calendar --------------------------------------------------------------------
// Every date in the preview is a day offset from SAMPLE_TODAY (0 = today, -1 = yesterday).
// SAMPLE_TODAY is today if it is a Tuesday, otherwise the next Tuesday, so the preview always
// reads as a normal A day with classes. The real app uses the real date and the district's
// own A/B calendar.

export const SAMPLE_TODAY = new Date();
SAMPLE_TODAY.setHours(0, 0, 0, 0);
SAMPLE_TODAY.setDate(SAMPLE_TODAY.getDate() + ((2 - SAMPLE_TODAY.getDay() + 7) % 7));

const MS_PER_DAY = 864e5;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Date for a day offset from SAMPLE_TODAY. */
export function dateAt(offset) {
  const date = new Date(SAMPLE_TODAY);
  date.setDate(date.getDate() + offset);
  return date;
}

/** Day offset from SAMPLE_TODAY for a Date (time of day ignored). */
export function offsetOf(date) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((midnight - SAMPLE_TODAY) / MS_PER_DAY);
}

/** "Tue Nov 10" */
export function shortDate(offset) {
  const d = dateAt(offset);
  return WEEKDAYS[d.getDay()].slice(0, 3) + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
}

/** "Today", "Yesterday", "3 days ago" up to 6 days, then the date ("Thu Oct 29"). */
export function relativeDay(offset) {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  if (offset < 0 && offset > -7) return -offset + ' days ago';
  return shortDate(offset);
}

/** "Tuesday, Nov 10" */
export function longDate(offset) {
  const d = dateAt(offset);
  return WEEKDAYS[d.getDay()] + ', ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
}

/** "2026-11-10", the value format of <input type="date">. */
export function isoDate(offset) {
  const d = dateAt(offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

export function offsetFromIso(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return offsetOf(new Date(year, month - 1, day));
}

// ---- Numbers ----------------------------------------------------------------------------

const NUMBER_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six',
  'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
];

/** Headings read "Six left today", so small counts are spelled out. */
export const countWord = n => (n >= 1 && n <= 12 ? NUMBER_WORDS[n - 1] : String(n));

export const oneDecimal = n => n.toFixed(1);

/** "+2.4" or "−2.4" (a real minus sign, U+2212, so the digits line up). */
export const signed = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);

export const inDays = n => (n === 0 ? 'today' : n === 1 ? 'in 1 day' : 'in ' + n + ' days');

/** Minutes after midnight to a 12 hour clock without AM/PM: 577 -> "9:37". */
export function clockTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return (hours > 12 ? hours - 12 : hours) + ':' + String(mins).padStart(2, '0');
}

/** Score column text: "88 / 100", "ABS, 0", "Missing, 0" or "No score". */
export function scoreText(row) {
  if (isScored(row)) return row.score + ' / ' + row.total;
  if (row.mark) return row.mark + ', 0';
  return row.missing ? 'Missing, 0' : 'No score';
}
