/**
 * Intro slides, shown on first open before the district pick (and again from Settings).
 *
 * Three slides, each with a small live render of a real screen piece as its art, so the
 * pictures always match the app. The art is inert: it looks like the app but taps do nothing.
 * Swipe or Next moves between slides (app.js reads data-swipe), Skip or the last Next leaves.
 */
import { escapeHtml, oneDecimal, signed } from '../format.js';
import { classAverage, applyWhatIf } from '../grade-math.js';
import { CLASSES } from '../sample-data.js';
import { state, findClass } from '../state.js';
import { actionAttrs } from './components.js';
import { classRow } from './grades.js';
import { alertText } from './changes.js';

/** The class every slide's art uses, so the three pictures tell one story. */
const SAMPLE_CLASS_ID = 'alg';
/** The score typed into the predictor on slide 2. */
const SAMPLE_EXPECTED_SCORE = 95;

const SLIDES = [
  {
    lead: 'Your grades, ',
    accent: 'straight from HAC.',
    sub: 'Only your real grade. Nothing guessed.',
    art: classCardArt,
  },
  {
    lead: 'See what a test ',
    accent: 'would do.',
    sub: 'Type a score you expect and watch your grade move.',
    art: predictorArt,
  },
  {
    lead: 'Know when ',
    accent: 'grades post.',
    sub: 'Alerts, retest reminders and your bell, in one place.',
    art: alertArt,
  },
];

export const INTRO_SLIDE_COUNT = SLIDES.length;

export function introView() {
  const current = state.introSlide;
  const isLast = current === SLIDES.length - 1;

  const slides = SLIDES.map((slide, i) =>
    `<section class="intro-slide" aria-hidden="${i !== current}">`
    + `<div class="intro-art" inert><div class="intro-art-inner">${slide.art()}</div></div>`
    + `<div class="intro-text"><div class="hd big">${slide.lead}<i>${slide.accent}</i></div>`
    + `<div class="intro-sub">${slide.sub}</div></div>`
    + `</section>`).join('');

  const dots = SLIDES.map((_, i) => `<span class="${i === current ? 'on' : ''}"></span>`).join('');

  return `<div class="scr intro">`
    + `<div class="intro-top"><button class="pill" ${actionAttrs('skipIntro')}>Skip</button></div>`
    + `<div class="intro-view" data-swipe="intro">`
    + `<div class="intro-track" style="transform:translateX(${-current * 100}%)">${slides}</div></div>`
    + `<div class="intro-dots" aria-label="Slide ${current + 1} of ${SLIDES.length}">${dots}</div>`
    + `<div class="intro-foot"><button class="btn" ${actionAttrs('nextIntroSlide')}>${isLast ? 'Get started' : 'Next'}</button></div>`
    + `</div>`;
}

// ---- Slide art: the real pieces, rendered from sample data -------------------------------

/** Slide 1: the class row from the Grades tab, with its average. */
function classCardArt() {
  return `<div class="card">${classRow(findClass(SAMPLE_CLASS_ID))}</div>`;
}

/** Slide 2: the What if estimate with one expected score typed into the next test. */
function predictorArt() {
  const course = findClass(SAMPLE_CLASS_ID);
  const nextTest = course.rows.find(row => row.category === 'Test' && row.score == null && row.due >= 0);
  const scenario = { scores: { [nextTest.id]: SAMPLE_EXPECTED_SCORE }, corrections: {}, fakeAssignments: [] };
  const now = classAverage(course.rows);
  const estimate = classAverage(applyWhatIf(course.rows, scenario));
  return `<div class="lab">Now ${oneDecimal(now)}, change ${signed(estimate - now)}, estimate</div>`
    + `<div class="hd big" style="margin-bottom:10px">${oneDecimal(estimate)} <i>what if</i></div>`
    + `<div class="card"><div class="row"><div class="grow">`
    + `<div class="t" style="font-size:15px">${escapeHtml(nextTest.title)}</div>`
    + `<div class="s">${nextTest.category}, out of ${nextTest.total}</div></div>`
    + `<input class="f" type="number" tabindex="-1" readonly aria-hidden="true" value="${SAMPLE_EXPECTED_SCORE}">`
    + `</div></div>`;
}

/** Slide 3: one row from the Alerts page, a test under the retest line. */
function alertArt() {
  const change = state.gradeChanges.find(entry => entry.underRetestLine) || state.gradeChanges[0];
  const course = findClass(change.classId) || CLASSES[0];
  return `<div class="card"><div class="row"><div class="grow">`
    + `<div class="t" style="font-size:15px">${escapeHtml(course.name)}</div>`
    + `<div class="s">${alertText(change)}</div><div class="s">${change.when}</div></div></div></div>`;
}
