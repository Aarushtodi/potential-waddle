/**
 * Grades tab: the class list, one class's page (with its grade graph) and one assignment.
 * Everything here is the real grade as HAC shows it. Predictions live only in What if.
 */
import { escapeHtml, shortDate, oneDecimal, signed, countWord, scoreText } from '../format.js';
import { isScored, countsAsZero, classAverage, averageEffect } from '../grade-math.js';
import {
  state, TYPED_CLASS_LIMIT, orderedClasses, visibleClasses, rowsForPeriod, periodAverage,
  findRow, effectiveDue, isMissing, isUnderRetestLine,
} from '../state.js';
import { actionAttrs, heading, navRow, statusStrip, CHEVRON } from './components.js';

const STRONG = 'font-weight:700;color:var(--ink)';

const assignmentCount = n => (n === 0 ? 'No assignments yet' : n === 1 ? '1 assignment' : n + ' assignments');

export function gradesView() {
  const list = state.editingClasses ? orderedClasses() : visibleClasses();
  const shownCount = visibleClasses().length;
  let html = statusStrip();
  html += `<div class="sec"><div style="display:flex;align-items:flex-end;gap:8px"><div class="grow">`
    + heading('From your gradebook', countWord(shownCount) + ' ', shownCount === 1 ? 'class' : 'classes', { big: 1 })
    + `</div><button class="pill" style="margin-bottom:8px" ${actionAttrs('openPeriodPicker')}>`
    + `${state.period} <span style="opacity:.6">▾</span></button></div>`;

  if (state.editingClasses) {
    html += `<div class="card">${list.map(editRow).join('')}</div></div>`;
    return html;
  }

  html += `<div class="card">${list.map(classRow).join('')}</div>`;
  html += `<div class="foot">Long press a class to rename, reorder or hide.</div></div>`;
  html += `<div class="sec"><div class="card">`
    + navRow('GPA', 'Calculator and what ifs, an estimate', 'openPage', 'gpa')
    + navRow('What changed', 'Since you last looked, with points effect', 'openPage', 'changes')
    + navRow('Alerts', state.gradeChanges.length + ' recent', 'openPage', 'alerts')
    + navRow('Add a class', `Dual credit, self study AP. ${state.typedClasses.length} of ${TYPED_CLASS_LIMIT} used`,
      'openSheet', 'addClass')
    + `</div></div>`;
  html += `<div class="sec"><div class="card"><div class="row" role="button" tabindex="0" ${actionAttrs('signOut')}>`
    + `<div class="t">Sign out</div></div></div></div>`;
  return html;
}

export function classRow(course) {
  const average = periodAverage(course);
  const attendance = [
    course.absences ? course.absences + ' ABS' : '',
    course.tardies ? course.tardies + ' tardy' : '',
  ].filter(Boolean).join(', ');
  const subtitle = course.typed
    ? 'Added by you, ' + escapeHtml(course.levelName)
    : assignmentCount(rowsForPeriod(course).length);
  const grade = average != null
    ? `<div class="avg" style="text-align:right">${oneDecimal(average)}</div>`
    : '<div class="nog">No grade</div>';
  return `<div class="row" role="button" tabindex="0" data-long-press="1" ${actionAttrs('openPage', 'class', course.id)}>`
    + `<div class="grow"><div class="t">${escapeHtml(course.name)}</div><div class="s">${subtitle}</div></div>`
    + `<div>${grade}${attendance ? `<div class="tiny">${attendance}</div>` : ''}</div>${CHEVRON}</div>`;
}

/** Edit mode: rename, reorder, hide (or remove a typed in class). */
function editRow(course) {
  const hidden = state.hiddenClasses[course.id];
  const lastButton = course.typed
    ? `<button class="pill" ${actionAttrs('removeTypedClass', course.id)}>Remove</button>`
    : `<button class="pill" ${actionAttrs('toggleHideClass', course.id)}>${hidden ? 'Show' : 'Hide'}</button>`;
  return `<div class="row" style="${hidden ? 'opacity:.5' : ''}"><div class="grow">`
    + `<input class="f plain" aria-label="Class name" value="${escapeHtml(course.name)}" data-input="renameClass" data-x="${course.id}">`
    + `${hidden ? '<div class="s">Hidden</div>' : ''}</div>`
    + `<button class="pill round" aria-label="Move up" ${actionAttrs('moveClass', course.id, -1)}>↑</button>`
    + `<button class="pill round" aria-label="Move down" ${actionAttrs('moveClass', course.id, 1)}>↓</button>`
    + `${lastButton}</div>`;
}

// ---- One class ----------------------------------------------------------------------------

export function classView(course) {
  const average = periodAverage(course);
  const rows = rowsForPeriod(course);
  if (course.typed) {
    return `<div class="sec">`
      + heading('Added by you, ' + escapeHtml(course.levelName), oneDecimal(course.grade) + ' ', 'average', { big: 1 })
      + `<div class="card"><div class="row"><div class="s">You typed this class in, so there is no gradebook behind it.</div></div></div></div>`;
  }
  const label = assignmentCount(rows.length);
  let html = `<div class="sec">`
    + (average != null
      ? heading(label, oneDecimal(average) + ' ', 'average', { big: 1 })
      : heading(label, 'No ', 'grade yet', { big: 1 }));
  // Tools only make sense for the current quarter, where the rows can still change.
  if (state.period === 'Q2' && average != null) {
    html += `<div class="toolrow"><button class="pill" ${actionAttrs('openWhatIf', course.id)}>What if</button>`
      + `<button class="pill" ${actionAttrs('openEmailDraft', course.id)}>Email teacher</button></div>`;
    html += gradeGraph(course);
  }
  html += `</div>`;
  if (!rows.length) {
    return html + `<div class="sec"><div class="card"><div class="row">`
      + `<div class="s" style="font-size:15px">Nothing in the gradebook for this class yet.</div></div></div></div>`;
  }
  const upcoming = rows.filter(row => row.due != null && effectiveDue(row) >= 0)
    .sort((a, b) => effectiveDue(a) - effectiveDue(b));
  const past = rows.filter(row => row.due != null && effectiveDue(row) < 0)
    .sort((a, b) => effectiveDue(b) - effectiveDue(a));
  const undated = rows.filter(row => row.due == null);
  for (const [title, group] of [['Coming up', upcoming], ['Already due', past], ['No due date', undated]]) {
    if (!group.length) continue;
    html += `<div class="sec"><div class="lab" style="margin-bottom:6px">${title}</div>`
      + `<div class="card">${group.map(assignmentRow).join('')}</div></div>`;
  }
  return html;
}

/**
 * Running average after each graded row, as a line. The point that moved the average most is
 * ringed and selected first, because that is usually the question ("what dropped me?").
 */
function gradeGraph(course) {
  const points = course.rows
    .filter(row => (isScored(row) || countsAsZero(row)) && row.due != null)
    .sort((a, b) => a.due - b.due);
  if (points.length < 2) return '';
  const series = [];
  const soFar = [];
  points.forEach(row => {
    soFar.push(row);
    series.push({ row, average: classAverage(soFar) });
  });

  const averages = series.map(point => point.average);
  const min = Math.min(...averages) - 1;
  const max = Math.max(...averages) + 1;
  const WIDTH = 338;
  const HEIGHT = 118;
  const xAt = i => 22 + i * (WIDTH - 40) / (series.length - 1);
  const yAt = v => 10 + (max - v) / (max - min) * (HEIGHT - 22);

  let biggestMove = 1;
  let biggestSize = 0;
  series.forEach((point, i) => {
    if (!i) return;
    const size = Math.abs(point.average - series[i - 1].average);
    if (size > biggestSize) {
      biggestSize = size;
      biggestMove = i;
    }
  });
  const selected = state.graphSelection[course.id] ?? biggestMove;
  const shown = series[selected];
  const moved = selected ? shown.average - series[selected - 1].average : null;

  const line = series.map((point, i) => xAt(i) + ',' + yAt(point.average)).join(' ');
  const dots = series.map((point, i) => {
    const cx = xAt(i);
    const cy = yAt(point.average);
    return `<g ${actionAttrs('selectGraphPoint', course.id, i)}>`
      + `<circle cx="${cx}" cy="${cy}" r="16" fill="transparent"/>`
      + `<circle cx="${cx}" cy="${cy}" r="${i === selected ? 6 : 3.2}" fill="currentColor"/>`
      + (i === biggestMove ? `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>` : '')
      + `</g>`;
  }).join('');

  return `<div class="card"><div class="pad"><div class="lab">Grade over time</div>`
    + `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" aria-label="Average over time">`
    + `<text x="0" y="16" font-size="10" fill="currentColor" opacity=".6">${max.toFixed(0)}</text>`
    + `<text x="0" y="${HEIGHT - 8}" font-size="10" fill="currentColor" opacity=".6">${min.toFixed(0)}</text>`
    + `<polyline fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>`
    + `${dots}</svg>`
    + `<div class="t" style="font-size:14.5px">${escapeHtml(shown.row.title)}, ${scoreText(shown.row)}</div>`
    + `<div class="s">${shortDate(shown.row.due)}, average ${oneDecimal(shown.average)}`
    + (moved != null ? `, moved it ${signed(moved)}` : '')
    + (selected === biggestMove ? '. Ringed: the one that moved it most.' : '')
    + `</div></div></div>`;
}

function assignmentRow(row) {
  const underLine = !row.old && isUnderRetestLine(row);
  const due = row.due == null ? 'No date' : 'Due ' + shortDate(effectiveDue(row));
  // Last quarter's rows are read only.
  const open = row.old ? '' : actionAttrs('openPage', 'assignment', row.id);
  return `<div class="row" role="button" tabindex="0" ${open}><div class="grow">`
    + `<div class="t">${escapeHtml(row.title)}</div>`
    + `<div class="s">${due}, ${row.category}${underLine ? ', under your ' + state.retestLine : ''}`
    + `${isMissing(row) ? ', missing' : ''}</div></div>`
    + `<div class="score ${isScored(row) ? 'g' : 'n'}">${scoreText(row)}</div></div>`;
}

// ---- One assignment -----------------------------------------------------------------------

export function assignmentView(rowId) {
  const { course, row } = findRow(rowId);
  const effect = isScored(row) ? averageEffect(course.rows, row) : null;
  const detail = (label, value, extraStyle = '') =>
    `<div class="row"><div class="grow s">${label}</div><div class="s" style="${STRONG}${extraStyle}">${value}</div></div>`;

  let html = `<div class="sec">${heading(escapeHtml(course.name), escapeHtml(row.title) + ' ', '', {})}<div class="card">`
    + `<div class="row"><div class="grow s">Score</div><div class="score ${isScored(row) ? 'g' : 'n'}">${scoreText(row)}</div></div>`
    + detail('Type', row.category)
    + detail('Due', row.due == null ? 'No date' : shortDate(effectiveDue(row)))
    + detail('Points effect', effect != null ? signed(effect) + ' on your average' : 'None yet, no number', ';text-align:right')
    + (isMissing(row) ? detail('At stake', `${row.total} points, missing`) : '')
    + (isUnderRetestLine(row) ? detail(`Under your ${state.retestLine}`, 'You can retest or waterfall this.') : '')
    + `</div></div>`;
  html += `<div class="toolrow"><button class="pill" ${actionAttrs('openWhatIf', course.id)}>What if</button>`
    + `<button class="pill" ${actionAttrs('openEmailDraft', course.id, row.id)}>Email teacher</button></div>`;
  if (row.due != null && row.due >= 0) {
    html += `<button class="btn ghost" ${actionAttrs('openTask', row.id)}>Due date and reminders</button>`;
  }
  return html;
}
