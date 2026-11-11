/**
 * Bottom sheets. state.sheet = { kind, ... } picks one; null means no sheet.
 * Each builder returns { title, left, right, body }: the bar's title, left and right buttons,
 * and the scrolling content.
 */
import { escapeHtml, shortDate, isoDate, scoreText } from '../format.js';
import { TEST_DATE_CATALOG, SAMPLE_DISTRICTS } from '../sample-data.js';
import {
  state, ui, TYPED_CLASS_LIMIT, findClass, findRow, todoItems, sheetAnimKey,
} from '../state.js';
import { actionAttrs, segmented, toggle } from './components.js';
import { whatIfSheetBody, WHAT_IF_TOOLS } from './what-if.js';
import { graphSheetBody } from './grades.js';

const doneButton = () => `<button class="pill" ${actionAttrs('closeSheet')}>Done</button>`;
const cancelButton = () => `<button class="pill" ${actionAttrs('closeSheet')}>Cancel</button>`;
const BIG_TITLE = 'style="font-size:15px"';

const SHEETS = {
  graph(sheet) {
    const course = findClass(sheet.id);
    return { title: course.name, right: doneButton(), body: graphSheetBody(course) };
  },
  whatIf(sheet) {
    const course = findClass(sheet.classId);
    return {
      title: sheet.tool ? WHAT_IF_TOOLS.find(tool => tool[0] === sheet.tool)[1] : 'What if',
      left: sheet.tool ? `<button class="pill round" aria-label="Back" ${actionAttrs('openWhatIfTool', '')}>‹</button>` : '',
      right: doneButton(),
      body: whatIfSheetBody(course, sheet.tool),
    };
  },

  district() {
    return {
      title: 'School district',
      left: cancelButton(),
      body: `<div class="card">`
        + SAMPLE_DISTRICTS.map(name =>
          `<div class="row" role="button" tabindex="0" ${actionAttrs('pickDistrict', name)}><div class="t">${name}</div></div>`).join('')
        + `</div><div style="height:12px"></div>`
        + `<button class="pill" style="width:100%;padding:13px" ${actionAttrs('pickDistrict', '')}>My district isn't listed</button>`,
    };
  },

  addTodo() {
    const form = state.form;
    return {
      title: 'Add to-do',
      left: cancelButton(),
      right: `<button class="pill" ${actionAttrs('saveTodo')}>Save</button>`,
      body: `<div class="card"><div class="pad"><input class="f w" placeholder="What do you need to do?" `
        + `value="${escapeHtml(form.title || '')}" data-input="formField" data-x="title" aria-label="To-do"></div>`
        + `<div class="row"><div class="grow t">Due date</div>${toggle(form.hasDate, 'toggleFormDueDate', undefined, 'Due date')}</div>`
        + (form.hasDate
          ? `<div class="row"><div class="grow t">Due</div><input class="f" type="date" aria-label="Due" `
            + `value="${form.due || isoDate(1)}" data-input="formField" data-x="due"></div>`
          : '')
        + `</div>`,
    };
  },

  testDates() {
    return {
      title: 'Test dates',
      right: doneButton(),
      body: `<div class="card">`
        + TEST_DATE_CATALOG.map(test =>
          `<div class="pad" style="border-top:1px solid var(--rule)">`
          + `<div class="t" style="margin-bottom:8px">${test.name}, ${test.teacher}</div>`
          + segmented('pickTestDay', state.testDatePicks[test.key] || 'off', [['off', 'Off'], ['A', 'A day'], ['B', 'B day']], test.key)
          + `</div>`).join('')
        + `</div>`,
    };
  },

  /** A to-do's details: done state, the student's own due date, and its reminders. */
  task(sheet) {
    const item = todoItems().find(candidate => candidate.id === sheet.id);
    if (!item) return null;
    const done = state.doneIds[item.id];
    const row = item.rowId ? findRow(item.rowId).row : null;
    // Moving a due date only changes the student's copy; the teacher's date in HAC stays.
    const overridden = row && row.id in state.dueOverrides;

    let body = `<div class="card"><div class="row">`
      + `<div class="mark" role="button" tabindex="0" aria-label="Toggle done" ${actionAttrs('toggleDone', item.id)}>`
      + `<b class="${done ? 'on' : ''}"></b></div>`
      + `<div class="grow"><div class="t">${done ? 'Done' : 'Not done yet'}</div>`
      + `${item.detail ? `<div class="s">${escapeHtml(item.detail)}</div>` : ''}</div></div>`;
    if (item.due != null) {
      body += `<div class="row"><div class="grow"><div class="t" ${BIG_TITLE}>Your due date</div>`
        + (row ? `<div class="s">Teacher's date ${shortDate(row.due)}</div>` : '')
        + `</div><input class="f" type="date" aria-label="Your due date" value="${isoDate(item.due)}" `
        + `data-change="dueDate" data-x="${escapeHtml(item.id)}"></div>`;
    }
    if (overridden) {
      body += `<div class="row" role="button" tabindex="0" ${actionAttrs('resetDue', row.id)}>`
        + `<div class="s" style="text-decoration:underline">Go back to the teacher's date</div></div>`;
    }
    body += `</div>`;

    if (item.due != null && item.due >= 0) {
      body += `<div style="height:12px"></div><div class="lab" style="margin-bottom:6px">Reminders</div><div class="card">`
        + (item.due > 0
          ? `<div class="row"><div class="grow t" ${BIG_TITLE}>Night before</div><div class="s">${shortDate(item.due - 1)}, 7 PM</div></div>`
          : '')
        + `<div class="row"><div class="grow t" ${BIG_TITLE}>Morning of</div><div class="s">${shortDate(item.due)}, 7 AM</div></div></div>`;
    }
    if (item.big) {
      body += `<div style="height:12px"></div><button class="btn" ${actionAttrs('openPace')}>See the pace for this project</button>`;
    }
    if (row) {
      body += `<div style="height:10px"></div><button class="btn ghost" ${actionAttrs('openAssignment', row.id)}>Assignment details</button>`;
    }
    if (item.source === 'typed') {
      body += `<div style="height:10px"></div><button class="btn ghost" ${actionAttrs('deleteTodo', item.id)}>Delete</button>`;
    }
    return { title: item.title, right: doneButton(), body };
  },

  period() {
    const periods = [['Q1', 'Quarter 1'], ['Q2', 'Quarter 2, current'], ['Q3', 'Quarter 3'], ['Q4', 'Quarter 4']];
    return {
      title: 'Marking period',
      right: doneButton(),
      body: `<div class="card">`
        + periods.map(([key, name]) =>
          `<div class="row" role="button" tabindex="0" ${actionAttrs('setPeriod', key)}><div class="grow t">${name}</div>`
          + `${state.period === key ? '<span class="t">✓</span>' : ''}</div>`).join('')
        + `</div>`,
    };
  },

  /** A draft only. The preview never sends anything. */
  email(sheet) {
    const course = findClass(sheet.classId);
    const row = sheet.rowId ? findRow(sheet.rowId).row : null;
    const subject = row ? `${course.name}: ${row.title}` : `${course.name}: question`;
    const about = escapeHtml(row ? row.title : 'my grade in ' + course.name);
    return {
      title: 'Email teacher',
      right: doneButton(),
      body: `<div class="card">`
        + `<div class="row"><div class="s" style="width:50px">To</div><div class="t" ${BIG_TITLE}>${escapeHtml(course.teacher)}</div></div>`
        + `<div class="row"><div class="s" style="width:50px">Subject</div><div class="t" ${BIG_TITLE}>${escapeHtml(subject)}</div></div>`
        + `<div class="pad" style="border-top:1px solid var(--rule);font-size:15px;line-height:1.4">`
        + `Hi ${escapeHtml(course.teacher)},<br><br>I had a question about ${about}`
        + `${row ? ` (${scoreText(row)}, ${course.name})` : ''}. Could you take a look when you get a chance?`
        + `<br><br>Thank you,<br>Sample Student</div></div>`,
    };
  },

  addClass() {
    const form = state.form;
    const used = state.typedClasses.length;
    if (used >= TYPED_CLASS_LIMIT) {
      return {
        title: 'Add a class',
        left: cancelButton(),
        body: `<div class="card"><div class="pad"><div class="t">You've used all ${TYPED_CLASS_LIMIT}</div>`
          + `<div class="s">Typed in classes stop at ${TYPED_CLASS_LIMIT}.</div></div></div>`,
      };
    }
    return {
      title: 'Add a class',
      left: cancelButton(),
      right: `<button class="pill" ${actionAttrs('saveClass')}>Add</button>`,
      body: `<div class="card"><div class="pad"><input class="f w" placeholder="Class name, like Dual Credit English" `
        + `value="${escapeHtml(form.className || '')}" data-input="formField" data-x="className" aria-label="Class name"></div>`
        + `<div class="row"><div class="grow t">Current grade</div>`
        + `<input class="f" type="number" inputmode="decimal" aria-label="Current grade" placeholder="90" `
        + `value="${escapeHtml(form.classGrade || '')}" data-input="formField" data-x="classGrade"></div>`
        + `<div class="pad" style="border-top:1px solid var(--rule)">`
        + segmented('pickClassLevel', form.classLevel || 'DC', [['DC', 'Dual credit'], ['AP', 'Self study AP'], ['R', 'Regular']])
        + `</div></div>`
        + `<div class="foot">${used} of ${TYPED_CLASS_LIMIT} typed in classes used.</div>`,
    };
  },
};

/** The open sheet with its backdrop, or '' when none is open. */
export function sheetView() {
  const sheet = state.sheet;
  if (!sheet) return '';
  const parts = SHEETS[sheet.kind](sheet);
  if (!parts) {
    // The to-do was deleted or finished elsewhere; close the sheet.
    state.sheet = null;
    return '';
  }
  const { title, left = '', right = '', body } = parts;
  const animate = sheetAnimKey() !== ui.lastAnimKey ? ' anim' : '';
  return `<div class="dim" ${actionAttrs('tapOutsideSheet')}>`
    + `<div class="sheet${animate}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">`
    + `<div class="bar"><div style="min-width:70px">${left}</div><div class="ttl">${escapeHtml(title)}</div>`
    + `<div style="min-width:70px;text-align:right">${right}</div></div>`
    + `<div class="body">${body}</div></div></div>`;
}
