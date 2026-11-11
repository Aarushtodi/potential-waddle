/**
 * Pacing page for the one long project: suggested checkpoints the student can rename or move,
 * each with a reminder the evening before.
 */
import { escapeHtml, shortDate, inDays } from '../format.js';
import { PACED_PROJECT_ROW_ID } from '../sample-data.js';
import { state, findRow, effectiveDue } from '../state.js';
import { actionAttrs, heading } from './components.js';

export function paceView() {
  const due = effectiveDue(findRow(PACED_PROJECT_ROW_ID).row);
  const rows = state.projectPace.map((checkpoint, i) => {
    const done = state.doneIds['cp' + i];
    const dayBefore = checkpoint.due - 1;
    // Night before at 7 PM, unless that is already past; then the morning of.
    const reminder = dayBefore >= 0
      ? `Reminder ${shortDate(dayBefore)}, 7 PM`
      : `Reminder ${shortDate(checkpoint.due)}, 7 AM`;
    return `<div class="row${done ? ' done' : ''}">`
      + `<div class="mark" role="button" tabindex="0" aria-label="Mark checkpoint" ${actionAttrs('toggleDone', 'cp' + i)}>`
      + `<b class="${done ? 'on' : checkpoint.due <= 0 ? 'u' : ''}"></b></div>`
      + `<div class="grow"><input autocomplete="off" enterkeyhint="done" class="f plain" aria-label="Checkpoint name" value="${escapeHtml(checkpoint.title)}" `
      + `data-input="renameCheckpoint" data-x="${i}">`
      + `<div class="s">${shortDate(checkpoint.due)}</div><div class="s">${reminder}</div></div>`
      + `<button class="pill round" aria-label="One day earlier" ${actionAttrs('moveCheckpoint', i, -1)}>‹</button>`
      + `<button class="pill round" aria-label="One day later" ${actionAttrs('moveCheckpoint', i, 1)}>›</button></div>`;
  }).join('');
  return `<div class="sec">${heading('AP World History, due ' + shortDate(due), 'History ', 'Project', {})}`
    + `<div class="s" style="padding-bottom:10px">Due ${inDays(due)}</div>`
    + `<div class="card">${rows}</div>`
    + `</div>`;
}
