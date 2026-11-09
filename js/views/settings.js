/** Settings page (alert rules, retest line, Face ID, appearance) and the Widgets preview page. */
import { escapeHtml, shortDate, longDate, signed } from '../format.js';
import { isScored } from '../grade-math.js';
import { CLASSES } from '../sample-data.js';
import { state, todoItems, sortByDue, findRow, effectiveDue } from '../state.js';
import { actionAttrs, heading, navRow, segmented, toggle } from './components.js';

const RETEST_LINE_CHOICES = [80, 90];
const THEME_CHOICES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my phone']];

export function settingsView() {
  const muteRows = CLASSES.map(course =>
    `<div class="row"><div class="grow t" style="font-size:15px">Mute ${escapeHtml(course.name)}</div>`
    + `${toggle(state.mutedClasses[course.id], 'toggleMute', course.id)}</div>`).join('');

  // The retest line is picked once at setup; any test under it triggers a retest reminder.
  const usesPreset = RETEST_LINE_CHOICES.includes(state.retestLine) && !state.retestLineCustom;
  const showTypedLine = state.retestLineCustom || !RETEST_LINE_CHOICES.includes(state.retestLine);
  const retestLine = `<div class="pad"><div class="t">Retest line</div>`
    + `<div style="height:8px"></div>`
    + segmented('pickRetestLine', usesPreset ? String(state.retestLine) : 'own',
      [['80', '80'], ['90', '90'], ['own', 'Type your own']])
    + (showTypedLine
      ? `<div style="height:8px"></div><input class="f w" type="number" inputmode="decimal" aria-label="Retest line" `
        + `value="${state.retestLine}" data-input="retestLine">`
      : '')
    + `</div>`;

  const faceId = `<div class="row"><div class="grow"><div class="t">Face ID to open</div>`
    + (state.faceIdOn
      ? `<div class="s" role="button" tabindex="0" ${actionAttrs('lock')} style="text-decoration:underline">Try it now</div>`
      : '')
    + `</div>${toggle(state.faceIdOn, 'toggleFaceId')}</div>`;

  const ruleToggle = (key, title) => `<div class="row"><div class="grow"><div class="t">${title}</div>`
    + `</div>${toggle(state.alertRules[key], 'toggleAlertRule', key)}</div>`;
  return `<div class="sec"><div class="lab" style="margin-bottom:6px">Alert rules</div><div class="card">`
    + ruleToggle('newGrade', 'New grades')
    + ruleToggle('zero', 'Zero or missing')
    + ruleToggle('changed', 'Score changed')
    + `<div class="row"><div class="grow"><div class="t">Average under my number</div>`
    + `</div>`
    + `<input class="f" type="number" inputmode="decimal" aria-label="Alert under" value="${state.alertUnder}" data-input="alertUnder">`
    + toggle(state.alertRules.under, 'toggleAlertRule', 'under') + `</div>`
    + `<div class="row"><div class="grow"><div class="t">Can't read your gradebook</div>`
    + `</div></div>`
    + `<div class="row" role="button" tabindex="0" ${actionAttrs('showSampleAlert')}><div class="grow"><div class="t">Send a test alert</div></div></div>`
    + muteRows + `</div></div>`
    + `<div class="sec"><div class="card">`
    + navRow('Widgets', '', 'openPage', 'widgets')
    + retestLine + faceId
    + `<div class="row"><div class="grow"><div class="t">Hide scores</div>`
    + `</div>`
    + `${toggle(state.hideScores, 'toggleHideScores')}</div>`
    + `<div class="pad"><div class="t" style="margin-bottom:8px">Appearance</div>`
    + `<div class="seg-fit">${segmented('pickTheme', state.theme, THEME_CHOICES)}</div></div>`
    + `</div></div>`
    + `<div class="sec"><div class="card">${navRow('Show intro again', '', 'showIntro')}</div></div>`
    + `<div class="sec"><div class="card"><div class="row" role="button" tabindex="0" ${actionAttrs('signOut')}>`
    + `<div class="t">Sign out</div></div></div></div>`
    + `<div class="foot" style="padding-top:0">Preview with made up sample data. Independent app. Not made by your school or district.</div>`;
}

// ---- Widgets ------------------------------------------------------------------------------

/**
 * What one home screen widget shows.
 * @returns {{label: string, value: string, sub: string, days?: number}}
 */
function widgetData(kind, classId) {
  const matches = id => classId === 'all' || id === classId;

  if (kind === 'due') {
    const next = sortByDue(todoItems().filter(item =>
      item.due != null && item.due >= 0 && !state.doneIds[item.id]
      && (classId === 'all' || (item.rowId && findRow(item.rowId).course.id === classId))))[0];
    if (!next) return { label: 'Next due', value: 'All clear', sub: '' };
    const when = next.due === 0 ? 'Today' : next.due === 1 ? 'Tomorrow' : shortDate(next.due);
    return { label: 'Next due', value: escapeHtml(next.title), sub: when };
  }

  if (kind === 'test') {
    let soonest = null;
    for (const course of CLASSES) {
      if (!matches(course.id)) continue;
      for (const row of course.rows) {
        if (row.category === 'Test' && !isScored(row) && !row.pending && row.due >= 0) {
          const due = effectiveDue(row);
          if (!soonest || due < soonest.due) soonest = { due, title: row.title };
        }
      }
    }
    if (!soonest) return { label: 'Test countdown', value: 'No tests', sub: '' };
    return { label: 'Test countdown', days: soonest.due, value: 'days', sub: escapeHtml(soonest.title) };
  }

  const change = state.gradeChanges.find(entry => matches(entry.classId));
  if (!change) return { label: 'Last grade change', value: 'Nothing yet', sub: '' };
  return {
    label: 'Last grade change',
    value: escapeHtml(change.scoreText),
    sub: `${escapeHtml(change.title)}, ${signed(change.after - change.before)}`,
  };
}

function widget(kind, size, classId) {
  const data = widgetData(kind, classId);
  const main = data.days != null
    ? `<div class="h">${data.days} <span class="bigm" style="font-size:18px">${data.value}</span></div>`
    : `<div class="v">${data.value}</div>`;
  return `<div class="wg ${size === 'medium' ? 'medium' : 'small'}"><div class="k">${data.label}</div>`
    + `<div>${main}<div class="s">${data.sub}</div></div></div>`;
}

function lockScreen() {
  const due = widgetData('due', 'all');
  const test = widgetData('test', 'all');
  const change = widgetData('change', 'all');
  return `<div class="lock"><div class="d">${longDate(0)}</div><div class="clock">9:37</div><div class="lw">`
    + `<div class="c"><b>${test.days ?? ''}</b><small>days</small></div>`
    + `<div class="c"><b>${change.value.split(' ')[0]}</b><small>last</small></div>`
    + `<div class="r">${due.value}<small>${due.sub}, next due</small></div>`
    + `<div class="r">${change.sub}<small>Last grade change</small></div>`
    + `</div></div>`;
}

export function widgetsView() {
  const kinds = [['due', 'Next due'], ['test', 'Test countdown'], ['change', 'Last grade change']];
  const classesWithRows = CLASSES.filter(course => course.rows.length);
  return `<div class="sec">${heading('Pick a size and a class', 'Your ', 'widgets', { big: 1 })}</div>`
    + kinds.map(([kind, label]) => {
      const options = state.widgets[kind];
      const chip = (id, name) =>
        `<button class="chip${options.classId === id ? ' on' : ''}" ${actionAttrs('pickWidgetClass', kind, id)}>${name}</button>`;
      return `<div class="sec"><div class="lab" style="margin-bottom:6px">${label}</div><div class="card"><div class="pad">`
        + `<div class="wgrid">${widget(kind, options.size, options.classId)}</div>`
        + segmented('pickWidgetSize', options.size, [['small', 'Small'], ['medium', 'Medium']], kind)
        + `<div class="chips" style="margin-top:8px;padding-bottom:0">`
        + chip('all', 'All classes')
        + classesWithRows.map(course => chip(course.id, escapeHtml(course.name))).join('')
        + `</div></div></div></div>`;
    }).join('')
    + `<div class="sec"><div class="lab" style="margin-bottom:6px">Lock screen</div>${lockScreen()}</div>`;
}
