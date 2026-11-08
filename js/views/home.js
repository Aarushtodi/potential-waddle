/**
 * Home tab: what is due today (missing work first), what is coming up, and undated to-dos.
 * Home only shows what the gradebook says. It never shows a predicted grade.
 */
import { escapeHtml, shortDate, longDate, countWord, inDays } from '../format.js';
import { state, todoItems, sortByDue, missingWork } from '../state.js';
import { heading, statusStrip, nowLine, todoRow, progressBars } from './components.js';

const groupLabel = (left, right = '') =>
  `<div class="clab"><span class="grow">${left}</span><span>${right}</span></div>`;

export function homeView() {
  // Checkpoints are not listed on Home; the next one is added to the project's own line instead.
  const items = todoItems().filter(item => item.source !== 'checkpoint');
  const nextCheckpoint = state.projectPace
    .map((checkpoint, index) => ({ checkpoint, index }))
    .find(({ index }) => !state.doneIds['cp' + index]);
  items.filter(item => item.big).forEach(item => {
    if (nextCheckpoint) {
      const { checkpoint } = nextCheckpoint;
      item.detail += `, next ${checkpoint.title} ${shortDate(checkpoint.due)}`;
    }
  });

  // Missing work leads the day: it already counts as 0, so it is the most points at stake.
  const missing = missingWork().map(({ course, row }) => ({
    id: row.id, title: row.title, detail: course.name + ', missing, was due ' + shortDate(row.due),
    due: row.due, source: 'missing', right: row.total + ' pts', points: row.total,
  }));
  const isDone = item => state.doneIds[item.id];
  const overdue = sortByDue(items.filter(item => item.due != null && item.due < 0 && !isDone(item)));
  const finishedOverdue = items.filter(item => item.due != null && item.due < 0 && isDone(item));
  const today = sortByDue(items.filter(item => item.due === 0));
  const tomorrow = sortByDue(items.filter(item => item.due === 1));
  const later = sortByDue(items.filter(item => item.due != null && item.due > 1));
  const undated = items.filter(item => item.due == null);

  const todayList = missing.concat(overdue, today);
  const openToday = todayList.filter(item => !isDone(item)).length;
  const pointsAtStake = missing.filter(item => !isDone(item)).reduce((sum, item) => sum + item.points, 0);

  // "Coming up" heading: the next test if there is one, otherwise the next thing due.
  const openLater = tomorrow.concat(later).filter(item => !isDone(item));
  const nextTest = openLater.find(item => item.category === 'Test');
  let countdown = 'All done';
  if (nextTest) countdown = `${escapeHtml(nextTest.title)} ${inDays(nextTest.due)}`;
  else if (openLater.length) countdown = `${escapeHtml(openLater[0].title)} ${inDays(openLater[0].due)}`;

  let html = statusStrip();

  const todayLabel = longDate(0) + (pointsAtStake ? `, ${pointsAtStake} points at stake` : '');
  const todayHead = heading(todayLabel, openToday ? countWord(openToday) + ' left ' : 'All done ', 'today',
    { urgent: openToday > 0, big: 1 });
  html += `<div class="sec">${todayHead}<div class="card">`
    + nowLine()
    + (todayList.length ? progressBars(todayList) : '')
    + todayList.map(item => todoRow(item, item.source !== 'missing' && item.due < 0)).join('')
    + `</div></div>`;

  let comingUp = '';
  if (tomorrow.length) {
    const doneTomorrow = tomorrow.filter(isDone).length;
    comingUp += groupLabel(longDate(1).replace(',', '') + ', tomorrow', `${doneTomorrow} of ${tomorrow.length} done`)
      + tomorrow.map(item => todoRow(item, false)).join('');
  }
  if (later.length) comingUp += groupLabel('Later') + later.map(item => todoRow(item)).join('');
  html += `<div class="sec">${heading(countdown, 'Coming ', 'up')}<div class="card">${comingUp}</div></div>`;

  if (undated.length || finishedOverdue.length) {
    html += `<div class="sec">${heading('No due date, and finished', 'Any ', 'time')}<div class="card">`
      + undated.concat(finishedOverdue).map(item => todoRow(item)).join('')
      + `</div></div>`;
  }
  if (Object.values(state.testDatePicks).some(Boolean)) {
    html += `<div class="foot" style="padding:0 16px 10px">Test dates are unofficial, confirm with your teacher.</div>`;
  }
  return html;
}
