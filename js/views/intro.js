/**
 * Intro slides, shown on first open before the district pick (and again from Settings).
 *
 * Three slides, each with a small live render of a real screen piece as its art, so the
 * pictures always match the app. The art is inert: it looks like the app but taps do nothing.
 * Swipe (js/views/intro-motion.js, pages you can half swipe) or Next moves between slides,
 * Skip or the last Next leaves.
 */
import { escapeHtml, oneDecimal } from '../format.js';
import { classAverage, applyWhatIf } from '../grade-math.js';
import { state, findClass } from '../state.js';
import { actionAttrs } from './components.js';
import { classRow } from './grades.js';
import { missingItems, absentItems, zeroRow } from './home.js';

/** The class every slide's art uses, so the three pictures tell one story. */
const SAMPLE_CLASS_ID = 'alg';
/** The score typed into the predictor on slide 2. */
const SAMPLE_EXPECTED_SCORE = 95;

/** The three slides. The art is marked up so js/views/intro-motion.js can play it in. */
const SLIDES = [
  {
    lead: 'Your real grade, ',
    accent: 'one tap.',
    art: classWithLockArt,
  },
  {
    lead: 'Nothing behind ',
    accent: 'a paywall.',
    art: predictorArt,
  },
  {
    lead: 'Missing work, ',
    accent: 'first.',
    art: missingAndAbsentArt,
  },
];

export const INTRO_SLIDE_COUNT = SLIDES.length;

export function introView() {
  const current = state.introSlide;
  const isLast = current === SLIDES.length - 1;

  const slides = SLIDES.map((slide, i) =>
    `<section class="intro-slide" aria-hidden="${i !== current}">`
    + `<div class="intro-art" inert><div class="intro-art-inner">${slide.art()}</div></div>`
    + `<div class="intro-text"><div class="hd big">${slide.lead}<i>${slide.accent}</i></div></div>`
    + `</section>`).join('');

  const dots = SLIDES.map((_, i) => `<span class="${i === current ? 'on' : ''}"></span>`).join('');

  return `<div class="scr intro m8">`
    + `<div class="intro-top"><button class="pill" ${actionAttrs('skipIntro')}>Skip</button></div>`
    + `<div class="intro-view" data-swipe="intro">`
    + `<div class="intro-track" style="transform:translateX(${-current * 100}%)">${slides}</div></div>`
    + `<div class="intro-dots" aria-label="Slide ${current + 1} of ${SLIDES.length}">${dots}</div>`
    + `<div class="intro-foot"><button class="btn" ${actionAttrs('nextIntroSlide')}>${isLast ? 'Get started' : 'Next'}</button></div>`
    + `</div>`;
}

// ---- Slide art: the real pieces, rendered from sample data -------------------------------
// With no motion (reduced motion, or a re-render on the same slide) these draw the end state.

/** The classes slide 1 lists under the sample class, so it reads as the Grades tab, not one lone row. */
const SLIDE1_MORE_CLASS_IDS = ['chem', 'eng', 'hist'];

/** Slide 1: the top of the Grades tab, sample class first ("1 absent", not "1 ABS"). */
function classWithLockArt() {
  const rows = [SAMPLE_CLASS_ID, ...SLIDE1_MORE_CLASS_IDS].map(id => classRow(findClass(id))).join('');
  return `<div class="card">${rows}</div>`.replace(/(\d+) ABS</g, '$1 absent<');
}

/** Slide 2: What if with 95 typed into the next test. Hooks: the typed score and two counting numbers. */
function predictorArt() {
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

/** Slide 3: the biggest missing row (with its points) plus the absent rows, as Home shows them. */
function missingAndAbsentArt() {
  const top = missingItems().sort((a, b) => b.points - a.points)[0];
  return `<div class="card">${[top].concat(absentItems()).map(zeroRow).join('')}</div>`
    .replace('<b class="u"></b>', `<b class="u draw">${DRAW_RING}</b>`);
}
