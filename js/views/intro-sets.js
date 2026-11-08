/**
 * DESIGN VARIANTS: intro slide text sets for the council (?slides=0..3, see js/variants.js).
 * 0 is today's set (1.0, defined in intro.js). Each art is built from the app's real pieces,
 * the same way intro.js does it, so the pictures always match the app.
 * Spec: Grade App Keep Scope.md, "Intro and Home options, round 1", section 1.
 */
import { escapeHtml, oneDecimal, longDate } from '../format.js';
import { classAverage, applyWhatIf } from '../grade-math.js';
import { state, findClass } from '../state.js';
import { navRow, todoRow } from './components.js';
import { classCardArt, alertArt } from './intro.js';
import { WHAT_IF_TOOLS } from './what-if.js';
import { missingItems, absentItems, lookATopArt, zeroTodoRow } from './home-looks.js';

const SAMPLE_CLASS_ID = 'alg';
/** The retest score typed on 1.2 slide 2: Unit 3 Test 72 to 88. */
const SAMPLE_RETEST_SCORE = 88;
/** The score typed into the predictor (same as intro.js slide 2). */
const SAMPLE_EXPECTED_SCORE = 95;

const LOCK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
  + '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** 1.1 slide 1: the class row plus a small lock line. */
function classWithLockArt() {
  return classCardArt()
    + `<div class="lockline">${LOCK_ICON}Saved only on this phone</div>`;
}

/** The biggest missing row, the way Home lists it (Problem Set 7, missing, 20 pts). */
function missingRowArt() {
  const top = missingItems().sort((a, b) => b.points - a.points)[0];
  return `<div class="card">${todoRow(top, false)}</div>`;
}

/** The 2A missing card: every missing row, biggest first. */
function missingCardArt() {
  const items = missingItems().sort((a, b) => b.points - a.points);
  const points = items.reduce((sum, item) => sum + item.points, 0);
  return `<div class="lab">Costing you the most, counts as 0</div>`
    + `<div class="hd big" style="margin-bottom:10px">${items.length} missing, <i class="u">${points} pts</i></div>`
    + `<div class="card">${items.map(item => todoRow(item, false)).join('')}</div>`;
}

/** 1.2 slide 2: What if Retest with the 72 typed up to 88. */
function retestArt() {
  const course = findClass(SAMPLE_CLASS_ID);
  const test = course.rows.find(row => row.category === 'Test' && row.score != null && row.score / row.total * 100 < state.retestLine);
  const scenario = { scores: {}, corrections: { [test.id]: SAMPLE_RETEST_SCORE }, fakeAssignments: [] };
  const now = classAverage(course.rows);
  const estimate = classAverage(applyWhatIf(course.rows, scenario));
  return `<div class="lab">Now ${oneDecimal(now)} → ${oneDecimal(estimate)} if the retest is ${SAMPLE_RETEST_SCORE}</div>`
    + `<div class="hd big" style="margin-bottom:10px">${oneDecimal(estimate)} <i>what if</i></div>`
    + `<div class="card"><div class="row"><div class="grow">`
    + `<div class="t" style="font-size:15px">Retest ${escapeHtml(test.title)}</div>`
    + `<div class="s">Was ${test.score} of ${test.total}, under your ${state.retestLine}</div></div>`
    + `<input class="f" type="number" tabindex="-1" readonly aria-hidden="true" value="${SAMPLE_RETEST_SCORE}">`
    + `</div></div>`;
}

/** 1.2 slide 3: the 72 alert as a notification on the lock screen. */
function lockAlertArt() {
  const change = state.gradeChanges.find(entry => entry.underRetestLine) || state.gradeChanges[0];
  const course = findClass(change.classId);
  return `<div class="lock"><div class="d">${longDate(0)}</div><div class="clock">9:37</div>`
    + `<div class="note"><div class="app"><span class="grow">GRADES</span><span>now</span></div>`
    + `<b>${escapeHtml(course.name)}</b>${escapeHtml(change.title)}: ${change.scoreText}. `
    + `Average ${oneDecimal(change.before)} to ${oneDecimal(change.after)}.</div></div>`;
}

/** 1.3 slide 3: the top of the What if sheet, estimate and the first tools. */
function whatIfSheetArt() {
  const course = findClass(SAMPLE_CLASS_ID);
  const now = classAverage(course.rows);
  return `<div class="lab">Now ${oneDecimal(now)}, type a score to see it move</div>`
    + `<div class="hd big" style="margin-bottom:10px">${oneDecimal(now)} <i>what if</i></div>`
    + `<div class="card">${WHAT_IF_TOOLS.slice(0, 3).map(([, title, subtitle]) => navRow(title, subtitle, 'noop')).join('')}</div>`;
}

/** Round 2: the What if with a plain header, "Now 76.9 → 78.5 if you get 95". */
function predictorPlainArt() {
  const course = findClass(SAMPLE_CLASS_ID);
  const nextTest = course.rows.find(row => row.category === 'Test' && row.score == null && row.due >= 0);
  const scenario = { scores: { [nextTest.id]: SAMPLE_EXPECTED_SCORE }, corrections: {}, fakeAssignments: [] };
  const now = classAverage(course.rows);
  const estimate = classAverage(applyWhatIf(course.rows, scenario));
  return `<div class="lab">Now ${oneDecimal(now)} → ${oneDecimal(estimate)} if you get ${SAMPLE_EXPECTED_SCORE}</div>`
    + `<div class="hd big" style="margin-bottom:10px">${oneDecimal(estimate)} <i>what if</i></div>`
    + `<div class="card"><div class="row"><div class="grow">`
    + `<div class="t" style="font-size:15px">${escapeHtml(nextTest.title)}</div>`
    + `<div class="s">${nextTest.category}, out of ${nextTest.total}</div></div>`
    + `<input class="f" type="number" tabindex="-1" readonly aria-hidden="true" value="${SAMPLE_EXPECTED_SCORE}">`
    + `</div></div>`;
}

/** Round 2 (rule 13): the biggest missing row (with its points) plus the ABS row (counts as 0). */
function missingAndAbsentArt() {
  const top = missingItems().sort((a, b) => b.points - a.points)[0];
  return `<div class="card">${[top].concat(absentItems()).map(zeroTodoRow).join('')}</div>`;
}

/** Final S3 slide 1: the class row with "1 absent" instead of "1 ABS". */
function classWithLockAbsentArt() {
  return classWithLockArt().replace(/(\d+) ABS</g, '$1 absent<');
}

// ---- ?slides=8: S3 with motion. Same art as set 7, marked up so js/views/motion.js can play it.
// With no motion (reduced motion, or a re-render on the same slide) these draw the end state.

/** Slide 2 art with hooks: the typed score (data-typed) and the two counting numbers (data-count-*). */
function predictorMotionArt() {
  const course = findClass(SAMPLE_CLASS_ID);
  const nextTest = course.rows.find(row => row.category === 'Test' && row.score == null && row.due >= 0);
  const scenario = { scores: { [nextTest.id]: SAMPLE_EXPECTED_SCORE }, corrections: {}, fakeAssignments: [] };
  const now = oneDecimal(classAverage(course.rows));
  const estimate = oneDecimal(classAverage(applyWhatIf(course.rows, scenario)));
  // Each changing number sits over a hidden copy of its final text, so its width never changes
  // and the words around it never move while it counts or types.
  const hold = (inner, end) => `<span class="hold${end ? ' end' : ''}"><span class="ghost" aria-hidden="true">${inner.replace(/<[^>]+>/g, '')}</span>${inner}</span>`;
  const count = hold(`<span data-count-from="${now}" data-count-to="${estimate}">${estimate}</span>`, true);
  return `<div class="lab">Now ${now} → ${count} if you get ${hold(`<span data-typed>${SAMPLE_EXPECTED_SCORE}</span>`)}</div>`
    + `<div class="hd big" style="margin-bottom:10px">${count} <i>what if</i></div>`
    + `<div class="card"><div class="row"><div class="grow">`
    + `<div class="t" style="font-size:15px">${escapeHtml(nextTest.title)}</div>`
    + `<div class="s">${nextTest.category}, out of ${nextTest.total}</div></div>`
    + `<input class="f" type="number" tabindex="-1" readonly aria-hidden="true" data-type-to="${SAMPLE_EXPECTED_SCORE}" value="${SAMPLE_EXPECTED_SCORE}">`
    + `</div></div>`;
}

/** The red ring as an SVG circle, so it can draw itself (stroke-dashoffset). Same size as .mark b. */
const DRAW_RING = '<svg class="ring" viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="10.9" transform="rotate(-90 12 12)"/></svg>';

/** Slide 3 art: the missing and absent rows, the red ring swapped for one that draws. */
function missingAndAbsentMotionArt() {
  return missingAndAbsentArt().replace('<b class="u"></b>', `<b class="u draw">${DRAW_RING}</b>`);
}

const S1_SLIDE_1 = { lead: 'Your real grade, ', accent: 'one tap.', sub: 'Read only from your school\'s gradebook. Your password stays on your phone.', art: classWithLockArt };
const FIXED_MISSING_SLIDE = { lead: 'Missing work, ', accent: 'first.', sub: 'Every missing and absent item, straight from your school\'s gradebook.', art: missingAndAbsentArt };

export const SLIDE_SETS = {
  0: null, // today's set, CURRENT_SLIDES in intro.js
  1: [ // 1.1 TRUST + COST
    { lead: 'Your real grade, ', accent: 'one tap.', sub: 'Read only from your school\'s gradebook. Your password stays on your phone.', art: classWithLockArt },
    { lead: 'See what the test ', accent: 'would do.', sub: 'Type the score you expect. Watch your grade move.', art: predictorPlainArt },
    { lead: 'Missing work, ', accent: 'first.', sub: 'Sorted by what it costs your grade.', art: missingRowArt },
  ],
  2: [ // 1.2 BAD GRADE MOMENT
    { lead: 'Got a bad ', accent: 'grade?', sub: 'See what it did, and what gets it back.', art: alertArt },
    { lead: 'Plan the ', accent: 'comeback.', sub: 'Type a retest score. Watch your average move.', art: retestArt },
    { lead: 'Know the minute ', accent: 'it posts.', sub: 'One alert when a grade changes. No nagging.', art: lockAlertArt },
  ],
  4: [ // S1, fixed 1.1
    S1_SLIDE_1,
    { lead: 'See what the test ', accent: 'would do.', sub: 'Type the score you expect. Watch your grade move.', art: predictorPlainArt },
    FIXED_MISSING_SLIDE,
  ],
  5: [ // S2, bad grade lead
    { lead: 'Got a bad ', accent: 'grade?', sub: 'See what it did, and what gets it back.', art: alertArt },
    S1_SLIDE_1,
    FIXED_MISSING_SLIDE,
  ],
  6: [ // S3, free is the switch
    S1_SLIDE_1,
    { lead: 'Nothing behind ', accent: 'a paywall.', sub: 'What if, graphs, alerts and widgets. All free.', art: predictorPlainArt },
    FIXED_MISSING_SLIDE,
  ],
  7: [ // Final: fixed S3 (only features live at ship)
    Object.assign({}, S1_SLIDE_1, { art: classWithLockAbsentArt }),
    { lead: 'Nothing behind ', accent: 'a paywall.', sub: 'What if and grade alerts. All free.', art: predictorPlainArt },
    FIXED_MISSING_SLIDE,
  ],
  8: [ // S3 with motion: set 7's copy exactly, art marked up for js/views/motion.js
    Object.assign({}, S1_SLIDE_1, { art: classWithLockAbsentArt }),
    { lead: 'Nothing behind ', accent: 'a paywall.', sub: 'What if and grade alerts. All free.', art: predictorMotionArt },
    Object.assign({}, FIXED_MISSING_SLIDE, { art: missingAndAbsentMotionArt }),
  ],
  3: [ // 1.3 ONE CALM APP
    { lead: 'Grades, due work ', accent: 'and your bell.', sub: 'One app for the school day.', art: lookATopArt, small: true },
    { lead: 'Missing work, ', accent: 'first.', sub: 'Sorted by what it costs your grade.', art: missingCardArt, small: true },
    { lead: 'What if, ', accent: 'only when you ask.', sub: 'Main screens show only your real grade.', art: whatIfSheetArt },
  ],
};
