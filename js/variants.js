/**
 * DESIGN VARIANTS (council preview only, not the shipped app).
 *
 * Read once from the URL so several looks can sit side by side:
 *   ?home=a | b | c     Round 1: Home look 2A (spotlight = costliest), 2B (spotlight = classes),
 *                       2C (spotlight = what changed). No param = today's Home.
 *   ?home=h1 | h2       Round 2 (after the council): h1 = raw 2A + Latest line, h2 = 2D class list
 *                       with arrows, h3 = h2 plus one red "2 missing, 1 absent" row. All follow his rule 13: Home shows only real HAC facts,
 *                       points and counts, never a computed "costs your grade" number.
 *   ?slides=0 | 1 | 2 | 3   Intro slide text set 1.0 (current), 1.1, 1.2, 1.3. No param = 1.0.
 *   ?slides=4 | 5 | 6   Round 2: S1 (fixed 1.1), S2 (bad grade lead), S3 (free is the switch).
 *   ?home=h4, ?slides=7 Final round, the council's pick: h4 (h1 with one missing row) and fixed S3.
 *   ?slides=8           S3 with motion: the art plays each time a slide comes in (js/views/motion.js).
 *   ?tour=1             First Home after sign in: guided tour over a dimmed Home (js/views/motion.js).
 *   ?hide=1             Hide scores on (2s6): spotlights show counts, not points or grades.
 *   ?demo=allclear      Sample state: everything missing and due today ticked off (2A all clear).
 *   ?demo=nothingnew    2C: no new grades since the last open.
 *   ?demo=firstopen     2C: first open after sign in, nothing to diff against yet.
 *
 * Specs: Obsidian Projects/App Research/Grade App Keep Scope.md, "Intro and Home options, round 1".
 * The look code lives in js/views/home-looks.js and js/views/intro-sets.js, so the winner can be
 * lifted into home.js / intro.js later. The hooks into the real app are marked "VARIANT HOOK".
 */
const params = new URLSearchParams(location.search);

const homeParam = (params.get('home') || '').toLowerCase();
/** 'a' | 'b' | 'c' | null */
export const HOME_LOOK = ['a', 'b', 'c', 'h1', 'h2', 'h3', 'h4'].includes(homeParam) ? homeParam : null;

const slidesParam = params.get('slides');
/** 0 to 8, or null */
export const SLIDE_SET = ['0', '1', '2', '3', '4', '5', '6', '7', '8'].includes(slidesParam) ? +slidesParam : null;

/** ?tour=1: show the first Home tour once after sign in. */
export const TOUR = params.get('tour') === '1';

/** 'allclear' | 'nothingnew' | 'firstopen' | null */
export const DEMO = params.get('demo') || null;

/** Mutable state that only the variant looks use. Actions below change it, render() redraws. */
export const lookState = {
  hideScores: params.get('hide') === '1',
  expanded: {}, // to-do group key -> true when "N more" was tapped
};

/** Time the sample student last opened the app, for 2C's "since you last looked". */
export const SAMPLE_LAST_OPEN = '7:40 AM';

/**
 * SAMPLE: each class's average the last time the student looked, for h2's up / down arrows.
 * The real app stores the average it showed at the last open.
 */
export const SAMPLE_LAST_AVERAGE = { alg: 78.1, chem: 75.5, eng: 85.5, span: 86.8, hist: 80.8, cs: 98.0, pe: 100 };

/** Short class names for chips and one line rows. The real app would use HAC's short names. */
const SHORT_NAMES = { 'AP World History': 'AP World', 'Computer Science': 'Comp Sci', 'Health and PE': 'PE' };
export const shortName = course => SHORT_NAMES[course.name] || course.name.replace(/ Honors$/, '');

/** Actions the looks add. app.js calls actions[name](x, y), then render(). */
export const variantActions = {
  expandGroup(key) {
    lookState.expanded[key] = !lookState.expanded[key];
  },
};
