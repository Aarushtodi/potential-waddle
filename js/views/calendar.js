/**
 * Calendar tab: a month grid with a dot on days that have open to-dos, and the selected day's list
 * with its progress bars. The Test dates button sits in this tab's top bar.
 */
import { SAMPLE_TODAY, MONTHS_LONG, offsetOf, longDate, countWord } from '../format.js';
import { state, todoItems, sortByDue } from '../state.js';
import { actionAttrs, heading, statusStrip, todoRow, progressBars } from './components.js';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function calendarView() {
  const monthStart = new Date(SAMPLE_TODAY.getFullYear(), SAMPLE_TODAY.getMonth() + (state.calendarMonth ?? 0), 1);
  const firstOffset = offsetOf(monthStart);
  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

  const hasOpen = {};
  todoItems().filter(item => item.due != null && !state.doneIds[item.id]).forEach(item => (hasOpen[item.due] = 1));

  let grid = WEEKDAY_LETTERS.map(letter => `<div class="w">${letter}</div>`).join('');
  grid += '<div></div>'.repeat(leadingBlanks);
  for (let i = 0; i < daysInMonth; i++) {
    const offset = firstOffset + i;
    // Red dot for today or overdue, gray for later.
    const dot = hasOpen[offset] ? `<u class="${offset <= 0 ? 'u' : ''}"></u>` : '';
    grid += `<button class="dy${offset === 0 ? ' tod' : ''}${offset === state.calendarSelected ? ' sel' : ''}" `
      + `${actionAttrs('selectDay', offset)}><span>${i + 1}</span>${dot}</button>`;
  }

  const selected = state.calendarSelected;
  const dayItems = sortByDue(todoItems().filter(item => item.due === selected));
  const openCount = dayItems.filter(item => !state.doneIds[item.id]).length;
  let head;
  if (!dayItems.length) head = heading(longDate(selected), 'Nothing ', 'due');
  else if (!openCount) head = heading(longDate(selected), 'All ', 'done');
  else {
    head = heading(longDate(selected), selected === 0 ? countWord(openCount) + ' left ' : countWord(openCount) + ' ',
      selected === 0 ? 'today' : 'due', { urgent: selected <= 0 });
  }

  return statusStrip()
    + `<div class="sec"><div class="card"><div class="cal"><div class="calh">`
    + `<span class="grow">${MONTHS_LONG[monthStart.getMonth()]} ${monthStart.getFullYear()}</span>`
    + `<button aria-label="Last month" ${actionAttrs('changeMonth', -1)}>‹</button>`
    + `<button aria-label="Next month" ${actionAttrs('changeMonth', 1)}>›</button></div>`
    + `<div class="calg">${grid}</div></div></div></div>`
    + `<div class="sec">${head}`
    + (dayItems.length
      ? `<div class="card">${progressBars(dayItems)}${dayItems.map(item => todoRow(item, false)).join('')}</div>`
      : '')
    + (Object.values(state.testDatePicks).some(Boolean)
      ? `<div class="foot">Test dates are unofficial, confirm with your teacher.</div>`
      : '')
    + `</div>`;
}
