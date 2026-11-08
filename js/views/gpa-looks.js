/**
 * DESIGN VARIANTS (looks-gpa branch only): the three GPA looks from the council, ?gpa=1|2|3.
 * See js/variants.js for what each one is. Styles: css/gpa-looks.css.
 *
 * Shared rules (the council brief):
 *   - The hero is "3.57 this semester". Unweighted is only a small gray line.
 *   - Classes are ranked by how close their AVERAGE is to a letter line, not by letter:
 *     down = average minus its letter's floor, up = next cutoff minus average (A has no up,
 *     F has no down), distance = the smaller one.
 *   - Never red, never "fine", never a cause ("pulling it down"). Only distances, which are facts.
 *   - What if: A to F per class, the number tweens and a gray "+0.14 what if" shows.
 *   - What do I need: a bottom sheet for one class, aimed at the line its distance points at.
 *   - Goal: one line ("4.3 is reachable") plus a drag scrubber, no semester rows.
 *
 * Motion (afterGpaRender, called by render.js after every full redraw): the number counts up
 * from 0 once when the page opens, rows drop in 40 ms apart, a changed letter crossfades while
 * the number tweens, and look 3's pager uses the intro pager's physics. Only transform and
 * opacity animate. prefers-reduced-motion: everything lands at its end state.
 */
import { escapeHtml } from '../format.js';
import { classAverage, letterGrade, computeGpa, gpaGoalPlan } from '../grade-math.js';
import { SAMPLE_GPA_HISTORY } from '../sample-data.js';
import { state, findClass, orderedClasses, routeKey } from '../state.js';
import { actionAttrs, segmented } from './components.js';
import { needResult } from './gpa.js';
import { GPA_LOOK, SLOW, gpaLook } from '../variants.js';
import { render } from '../render.js';

const LETTERS = ['A', 'B', 'C', 'D', 'F'];
const FLOOR = { A: 90, B: 80, C: 70, D: 60, F: null };
const NEXT_UP = { A: null, B: 90, C: 80, D: 70, F: 60 };
const LETTER_BELOW = { A: 'B', B: 'C', C: 'D', D: 'F' };
const LETTER_ABOVE = { B: 'A', C: 'B', D: 'C', F: 'D' };
const NEAR = 2.0; // points: "close to a line"
const FOOTNOTE = 'Estimate. Your school sets the real GPA. Advisory doesn\'t count.';
const CHEVRON = '<span class="chev">›</span>';

/** Short names for sentences and the edge line. The real app would use HAC's short names. */
const SHORT_NAMES = { 'AP World History': 'AP World', 'Computer Science': 'Comp Sci', 'Health and PE': 'PE' };
const shortName = course => SHORT_NAMES[course.name] || course.name.replace(/ Honors$/, '');
/** Look 3's letter chips. */
const CHIP_NAMES = { alg: 'Alg', chem: 'Chem', eng: 'Eng', span: 'Span', hist: 'World', cs: 'CS', pe: 'PE' };
const chipName = course => CHIP_NAMES[course.id] || shortName(course).split(' ')[0];

const article = letter => (letter === 'A' || letter === 'F' ? 'an ' : 'a ') + letter;
const tenth = n => (Math.round(n * 10) / 10).toFixed(1);
const isHonors = course => course.level === 'H' || course.level === 'AP' || course.level === 'DC';
/** Name without "Honors", then a small H tag. */
const nameHtml = (course, short) => escapeHtml(short ? shortName(course) : course.name.replace(/ Honors$/, ''))
  + (isHonors(course) ? ' <span class="gl-h" aria-label="honors">H</span>' : '');

// ---- Data ------------------------------------------------------------------------------------

const averageOf = course => (course.typed ? course.grade : classAverage(course.rows));
const realLetter = course => letterGrade(averageOf(course));
const letterFor = course => gpaLook.whatIf[course.id] || realLetter(course);

/** Classes in the GPA: no Advisory, nothing ungraded. */
const gpaClasses = () => orderedClasses().filter(course => course.level !== 'A' && averageOf(course) != null);

/** Distance from a class average to the nearest letter line, and which line. */
function distance(course) {
  const average = averageOf(course);
  const letter = letterGrade(average);
  const down = FLOOR[letter] == null ? Infinity : average - FLOOR[letter];
  const up = NEXT_UP[letter] == null ? Infinity : NEXT_UP[letter] - average;
  if (down <= up) {
    return { course, average, letter, points: down, line: FLOOR[letter],
      text: `${tenth(down)} above ${article(LETTER_BELOW[letter])}`,
      sentence: `${tenth(down)} above ${article(LETTER_BELOW[letter])}` };
  }
  return { course, average, letter, points: up, line: NEXT_UP[letter],
    text: `${tenth(up)} to ${article(LETTER_ABOVE[letter])}`,
    sentence: `${tenth(up)} from ${article(LETTER_ABOVE[letter])}` };
}

/** All GPA classes, closest to a line first. */
const byDistance = () => gpaClasses().map(distance).sort((a, b) => a.points - b.points);

function gpaNumbers() {
  const classes = gpaClasses();
  const base = computeGpa(classes, realLetter);
  const now = computeGpa(classes, letterFor);
  return { base, now, change: now.weighted - base.weighted, active: Object.keys(gpaLook.whatIf).length > 0 };
}

const num = (key, value, decimals = 2) =>
  `<span class="gl-n" data-num="${key}" data-to="${value.toFixed(decimals)}" data-dec="${decimals}">${value.toFixed(decimals)}</span>`;

/** A letter that crossfades when it changes. key must be unique on the screen. */
const flipLetter = (key, letter) => `<span class="gl-fb"><span data-flip="${key}">${letter}</span></span>`;

// ---- Shared pieces -------------------------------------------------------------------------

function hero(key = 'hero') {
  const { now } = gpaNumbers();
  return `<div class="gl-hero gl-par"><div class="gl-num">${num(key, now.weighted)} <i>this semester</i></div>`
    + whatIfLine() + `</div>`;
}

/** Gray "+0.14 what if" and Reset. Holds its height when empty, so nothing below jumps. */
function whatIfLine() {
  const { change, active } = gpaNumbers();
  if (!active) return `<div class="gl-wi" aria-hidden="true"></div>`;
  const text = Math.abs(change) < 0.005 ? 'No change, what if'
    : `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(2)} what if`;
  return `<div class="gl-wi on" role="status"><span>${text}</span>`
    + `<button class="gl-reset" ${actionAttrs('gpaReset')}>Reset</button></div>`;
}

function edgeLine() {
  const closest = byDistance()[0];
  const text = closest && closest.points <= NEAR
    ? `Closest to a letter line: ${escapeHtml(shortName(closest.course))}, ${tenth(closest.average)}`
    : 'Nothing near a letter line';
  return `<div class="gl-edge">${text}</div>`;
}

const unweightedLine = () => `<div class="foot gl-unw">${gpaNumbers().now.unweighted.toFixed(2)} unweighted</div>`;
const footnote = () => `<div class="foot">${FOOTNOTE}</div>`;

const graduationRow = () => {
  const h = SAMPLE_GPA_HISTORY;
  return `<div class="row gl-quiet" role="button" tabindex="0" ${actionAttrs('openPage', 'gpaGoal')}>`
    + `<div class="grow"><div class="t">By graduation</div>`
    + `<div class="s">${h.weightedSoFar.toFixed(2)} past ${h.semestersDone} semesters</div></div>${CHEVRON}</div>`;
};

/** Inline A to F control for one class. */
function picker(course) {
  return `<div class="gl-pick" role="group" aria-label="What if ${escapeHtml(course.name)} ends as">`
    + segmented('gpaSetLetter', letterFor(course), LETTERS.map(l => [l, l]), course.id) + `</div>`;
}

/** Full row: name + H, distance, big letter you can tap for a what if. */
function classRow(d, i, flipPrefix) {
  const { course } = d;
  const changed = gpaLook.whatIf[course.id] ? ' wi' : '';
  const open = gpaLook.picker === course.id ? ' open' : '';
  return `<div class="row gl-r" style="--i:${i}" role="button" tabindex="0" ${actionAttrs('gpaNeed', course.id)}>`
    + `<div class="grow"><div class="t">${nameHtml(course)}</div><div class="s">${d.text}</div></div>`
    + `<button class="gl-let${changed}${open}" aria-label="What if for ${escapeHtml(course.name)}, now ${letterFor(course)}" `
    + `aria-expanded="${!!open}" ${actionAttrs('gpaPick', course.id)}>${flipLetter(flipPrefix + course.id, letterFor(course))}</button></div>`
    + (open ? picker(course) : '');
}

// ---- Look 1: Edge ----------------------------------------------------------------------------

function edgeLook() {
  return `<div class="gl gl1">`
    + hero()
    + edgeLine()
    + `<div class="card gl-list">${byDistance().map((d, i) => classRow(d, i, 'r:')).join('')}</div>`
    + `<div class="card gl-gradcard">${graduationRow()}</div>`
    + footnote() + unweightedLine()
    + `</div>`;
}

// ---- Look 2: Verdict -------------------------------------------------------------------------

const COUNT_WORDS = ['Nothing is', 'One class is', 'Two classes are', 'Three classes are', 'Four classes are',
  'Five classes are', 'Six classes are', 'Seven classes are'];

/** Word by word spans, so the sentence can fade up one word at a time. */
const words = text => text.split(' ').map((word, i) => `<span class="gl-w" style="--w:${i}">${word}</span>`).join(' ');

function verdictLook() {
  const ranked = byDistance();
  const near = ranked.filter(d => d.points <= NEAR);
  const rest = ranked.filter(d => d.points > NEAR);
  const sentence = `${COUNT_WORDS[near.length] || near.length + ' classes are'} close to a line.`;
  const wordCount = sentence.split(' ').length;
  const detail = near.slice(0, 3)
    .map(d => `${escapeHtml(shortName(d.course))} is ${d.sentence}.`).join(' ');
  const { now } = gpaNumbers();
  const chips = near.map((d, i) => {
    const { course } = d;
    return `<button class="gl-bigchip${gpaLook.whatIf[course.id] ? ' wi' : ''}" style="--i:${i}" ${actionAttrs('gpaNeed', course.id)}>`
      + `<span class="gl-bc-top"><span class="t">${nameHtml(course, true)}</span>`
      + `<span class="gl-bc-let">${flipLetter('c:' + course.id, letterFor(course))}</span></span>`
      + `<span class="s">${d.text}</span></button>`;
  }).join('');
  const moreLabel = near.length ? `${rest.length} more ${rest.length === 1 ? 'class' : 'classes'}` : `${rest.length} classes`;
  const restRows = gpaLook.moreOpen
    ? rest.map((d, i) => {
      const { course } = d;
      return `<div class="row gl-r" style="--i:${i}" role="button" tabindex="0" ${actionAttrs('gpaNeed', course.id)}>`
        + `<div class="grow"><div class="t">${nameHtml(course)}</div><div class="s">${d.text}</div></div>`
        + `<div class="avg gl-avg">${flipLetter('m:' + course.id, letterFor(course))}</div></div>`;
    }).join('') + `<div class="gl-unw-in">${now.unweighted.toFixed(2)} unweighted</div>`
    : '';
  return `<div class="gl gl2" style="--words:${wordCount}">`
    + `<div class="gl-verdict"><div class="gl-sent"><i>${words(sentence)}</i></div>`
    + (detail ? `<div class="gl-sent-sub">${detail}</div>` : '') + `</div>`
    + `<div class="gl-small"><div class="gl-num">${num('hero', now.weighted)} <i>this semester</i></div>${whatIfLine()}</div>`
    + (near.length ? `<div class="lab gl-nearlab">Near a line</div><div class="gl-chips2">${chips}</div>` : '')
    + `<div class="card gl-gradcard">`
    + `<div class="row gl-quiet gl-more" role="button" tabindex="0" aria-expanded="${gpaLook.moreOpen}" ${actionAttrs('gpaMore')}>`
    + `<div class="grow"><div class="t">${moreLabel}</div></div><span class="chev gl-chev${gpaLook.moreOpen ? ' down' : ''}">›</span></div>`
    + (restRows ? `<div class="gl-restlist">${restRows}</div>` : '')
    + graduationRow() + `</div>`
    + footnote()
    + `</div>`;
}

// ---- Look 3: Swipe ---------------------------------------------------------------------------

const PAGE_NAMES = ['Now', 'What if', 'Goal'];
/** The number that counts up when each page lands. */
const PAGE_NUM_KEYS = ['hero', 'wi', 'goal'];

function swipeLook() {
  const page = gpaLook.page;
  const dots = `<div class="gl-dots" role="tablist">`
    + PAGE_NAMES.map((name, i) => `<button role="tab" aria-selected="${i === page}" class="${i === page ? 'on' : ''}" `
      + `${actionAttrs('gpaPage', i)}><span class="dot"></span>${name}</button>`).join('')
    + `</div>`;

  const nowRows = byDistance().map((d, i) => {
    const { course } = d;
    return `<div class="row gl-r gl-crow" style="--i:${i}" role="button" tabindex="0" ${actionAttrs('gpaNeed', course.id)}>`
      + `<div class="grow t">${nameHtml(course)}</div><div class="s">${d.text}</div>`
      + `<div class="avg gl-avg">${flipLetter('n:' + course.id, letterFor(course))}</div></div>`;
  }).join('');
  const nowPage = hero('hero') + edgeLine()
    + `<div class="card gl-list">${nowRows}</div>` + footnote() + unweightedLine();

  const classes = gpaClasses();
  const open = classes.find(course => course.id === gpaLook.picker);
  const chips = classes.map((course, i) =>
    `<button class="gl-lchip${gpaLook.whatIf[course.id] ? ' wi' : ''}${gpaLook.picker === course.id ? ' on' : ''}" style="--i:${i}" `
    + `aria-label="${escapeHtml(course.name)}, ${letterFor(course)}" ${actionAttrs('gpaPick', course.id)}>`
    + `<b>${flipLetter('w:' + course.id, letterFor(course))}</b><span>${chipName(course)}</span></button>`).join('');
  const whatIfPage = hero('wi')
    + `<div class="gl-lchips">${chips}</div>`
    + (open ? `<div class="gl-pickcard"><div class="lab">${nameHtml(open)} <span class="gl-now">now ${realLetter(open)}, ${tenth(averageOf(open))}</span></div>`
      + picker(open) + `</div>` : '')
    + footnote();

  const goalPage = goalBody();

  const pages = [nowPage, whatIfPage, goalPage].map((html, i) =>
    `<section class="gl-page" aria-label="${PAGE_NAMES[i]}" aria-hidden="${i !== page}">${html}</section>`).join('');
  return `<div class="gl gl3">${dots}`
    + `<div class="gl-pager" data-gpa-swipe><div class="gl-track" style="transform:translate3d(${-page * 100}%,0,0)">${pages}</div></div>`
    + `</div>`;
}

// ---- Goal (shared) ---------------------------------------------------------------------------

const GOAL_MIN = 3;
const GOAL_MAX = 4.6;

/** Highest GPA by graduation: all As (4 honors at 5, 3 regular at 4) every semester left. */
function highestReachable() {
  const h = SAMPLE_GPA_HISTORY;
  const best = (4 * h.classesPerSemester + h.honorsPerSemester) / h.classesPerSemester;
  const total = (h.weightedSoFar * h.semestersDone + best * h.semestersLeft) / (h.semestersDone + h.semestersLeft);
  return Math.floor(total * 100 + 1e-9) / 100;
}

/** 4.30 -> "4.3", 4.35 -> "4.35". */
const goalText = goal => {
  const two = goal.toFixed(2);
  return two.endsWith('0') ? goal.toFixed(1) : two;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function letterMix(plan, n) {
  if (plan.as >= n) return `All ${n} As every semester from here.`;
  if (plan.as > 0) return `About ${plural(plan.as, 'A')} and ${plural(n - plan.as, 'B')} every semester from here.`;
  if (plan.bs >= n) return `All ${n} Bs every semester from here.`;
  if (plan.bs > 0) return `About ${plural(plan.bs, 'B')} and ${plural(n - plan.bs, 'C')} every semester from here.`;
  return 'Mostly Cs every semester from here.';
}

const currentGoal = () => {
  const goal = Math.round((+state.gpaGoal || 4.3) * 100) / 100;
  return Math.max(GOAL_MIN, Math.min(GOAL_MAX, goal));
};

/** The lead and the line under it. Redrawn on every scrubber move (no full render). */
function goalLive() {
  const goal = currentGoal();
  const h = SAMPLE_GPA_HISTORY;
  const plan = gpaGoalPlan(goal, h);
  const text = goalText(goal);
  const dec = text.includes('.') ? text.split('.')[1].length : 0;
  const number = `<span class="gl-n" data-num="goal" data-to="${goal.toFixed(dec)}" data-dec="${dec}">${text}</span>`;
  if (!plan.reachable) {
    return `<div class="gl-goal-lead out">${number} is <i>out of reach</i>.</div>`
      + `<div class="gl-goal-sub">Highest with these classes: ${highestReachable().toFixed(2)}</div>`;
  }
  return `<div class="gl-goal-lead">${number} is <i>reachable</i>.</div>`
    + `<div class="gl-goal-sub">${letterMix(plan, h.classesPerSemester)}</div>`;
}

const percentOf = value => ((value - GOAL_MIN) / (GOAL_MAX - GOAL_MIN)) * 100;

function goalBody() {
  const h = SAMPLE_GPA_HISTORY;
  const goal = currentGoal();
  const maxAt = percentOf(highestReachable());
  return `<div class="gl-goal">`
    + `<div class="lab gl-past">Past ${h.semestersDone} semesters: ${h.weightedSoFar.toFixed(2)} weighted</div>`
    + `<div class="gl-par" data-gl-live>${goalLive()}</div>`
    + `<div class="gl-scrub" style="--p:${percentOf(goal)}%">`
    + `<span class="gl-tick" style="--at:${maxAt / 100}" aria-hidden="true"></span>`
    + `<input class="gl-range" type="range" min="${GOAL_MIN}" max="${GOAL_MAX}" step="0.05" value="${goal.toFixed(2)}" `
    + `aria-label="GPA goal by graduation" aria-valuetext="${goalText(goal)}" data-input="gpaGoalScrub">`
    + `<div class="gl-scale"><span>${GOAL_MIN.toFixed(2)}</span>`
    + `<span class="gl-maxlab" style="--at:${maxAt / 100}">${highestReachable().toFixed(2)} max</span>`
    + `<span>${GOAL_MAX.toFixed(2)}</span></div></div>`
    + `<div class="foot">Assumes ${h.classesPerSemester} classes, ${h.honorsPerSemester} honors, same every semester.</div>`
    + `</div>`;
}

// ---- Entry points (VARIANT HOOKs in shell.js and sheets.js) ----------------------------------

export function gpaLookView() {
  if (GPA_LOOK === 2) return verdictLook();
  if (GPA_LOOK === 3) return swipeLook();
  return edgeLook();
}

export const gpaGoalLookView = () => `<div class="gl gl-goalpage">${goalBody()}</div>`;

const doneButton = () => `<button class="pill" ${actionAttrs('closeSheet')}>Done</button>`;

/** What do I need for one class; look 2 adds the A to F what if under it. */
export const GPA_SHEETS = {
  gpaNeed(sheet) {
    const course = findClass(sheet.classId);
    if (!course) return null;
    const calc = state.needCalc;
    const d = distance(course);
    // Look 2's sheet is titled with the class, so its label skips the name.
    const label = GPA_LOOK === 2 ? `<span class="gl-now">Now ${tenth(d.average)}, ${d.text}</span>`
      : `${nameHtml(course)} <span class="gl-now">now ${tenth(d.average)}, ${d.text}</span>`;
    let body = `<div class="lab gl-sheetlab">${label}</div>`
      + `<div class="gl-needlead" data-live>${needResult(course)}</div>`
      + `<div class="card" style="margin-top:14px"><div class="row"><div class="grow t">Grade you want</div>`
      + `<input class="f" type="number" inputmode="decimal" aria-label="Target grade" value="${escapeHtml(calc.target)}" data-input="needTarget"></div></div>`
      + `<div style="height:10px"></div>`
      + segmented('needPickKind', calc.kind, [['test', 'Next test'], ['final', 'Final']]);
    if (GPA_LOOK === 2) {
      const { now } = gpaNumbers();
      body += `<div class="lab" style="margin:22px 0 6px">What if it ends as</div>`
        + segmented('gpaSetLetter', letterFor(course), LETTERS.map(l => [l, l]), course.id)
        + `<div class="gl-sheetgpa"><span class="gl-n" data-num="sheet" data-to="${now.weighted.toFixed(2)}" data-dec="2">`
        + `${now.weighted.toFixed(2)}</span> <i>this semester</i>${whatIfLine()}</div>`;
    }
    return { title: GPA_LOOK === 2 ? shortName(course) : 'What do I need', right: doneButton(), body };
  },
};

// ---- Actions (VARIANT HOOK in app.js) --------------------------------------------------------

export const gpaActions = {
  /** Row or chip tap: What do I need, aimed at the line this class is nearest. */
  gpaNeed(classId) {
    const course = findClass(classId);
    state.needCalc = { classId, target: distance(course).line, kind: 'test' };
    state.form = {};
    state.sheet = { kind: 'gpaNeed', classId, id: classId };
  },
  gpaPick(classId) {
    gpaLook.picker = gpaLook.picker === classId ? null : classId;
  },
  gpaSetLetter(letter, classId) {
    const course = findClass(classId);
    if (letter === realLetter(course)) delete gpaLook.whatIf[classId];
    else gpaLook.whatIf[classId] = letter;
  },
  gpaReset() {
    gpaLook.whatIf = {};
    gpaLook.picker = null;
  },
  gpaMore() {
    gpaLook.moreOpen = !gpaLook.moreOpen;
  },
  gpaPage(index) {
    gpaLook.page = +index;
  },
};

export const gpaInputHandlers = {
  /** Scrubber: the goal number and the lines under it follow the finger, no full redraw. */
  gpaGoalScrub(value) {
    state.gpaGoal = String(Math.round(+value * 100) / 100);
    delete motion.tweens.goal;
    const goal = currentGoal();
    document.querySelectorAll('[data-gl-live]').forEach(node => (node.innerHTML = goalLive()));
    document.querySelectorAll('.gl-scrub').forEach(node => {
      node.style.setProperty('--p', percentOf(goal) + '%');
      const input = node.querySelector('input');
      if (input) input.setAttribute('aria-valuetext', goalText(goal));
    });
    motion.shown.goal = goal;
    syncPagerHeight();
  },
};

// ---- Motion ----------------------------------------------------------------------------------

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const ms = n => n * SLOW;

const COUNT_MS = 900;
const TWEEN_MS = 480;
const WORD_MS = 70; // look 2: one word every 70 ms

/** shown: last value each number settled on. letters: last letter each flip key showed. */
const motion = { sig: null, shown: {}, letters: {}, tweens: {}, raf: 0 };

/** On a GPA look page? Returns the route key, or null. */
function gpaRoute() {
  if (!GPA_LOOK || state.screen !== 'app') return null;
  const stack = state.pageStacks[state.tab];
  const top = stack[stack.length - 1];
  return top && (top[0] === 'gpa' || top[0] === 'gpaGoal') ? routeKey() : null;
}

export function afterGpaRender() {
  if (!GPA_LOOK) return;
  document.documentElement.style.setProperty('--gl-slow', String(SLOW));
  const sig = gpaRoute();
  // Opened = a new GPA page, not a Back from a page pushed on top of it.
  const opened = sig != null && sig !== motion.sig && !(motion.sig && motion.sig.startsWith(sig + '/'));
  motion.sig = sig;
  if (sig == null) {
    motion.shown = {};
    motion.letters = {};
    motion.tweens = {};
    pager.pos = null;
    return;
  }
  const still = reducedMotion();
  const now = performance.now();
  const openDelays = opened && !still ? playOpening() : {};

  document.querySelectorAll('[data-num]').forEach(node => {
    const key = node.dataset.num;
    const to = +node.dataset.to;
    if (still) {
      delete motion.tweens[key];
    } else if (key in openDelays) {
      motion.tweens[key] = { from: 0, to, start: now + ms(openDelays[key]), dur: ms(COUNT_MS), ease: easeOutQuart };
    } else if (motion.shown[key] != null && Math.abs(motion.shown[key] - to) > 1e-9) {
      motion.tweens[key] = { from: currentValue(key), to, start: now, dur: ms(TWEEN_MS), ease: easeOutCubic };
    }
    motion.shown[key] = to;
  });

  document.querySelectorAll('[data-flip]').forEach(node => {
    const key = node.dataset.flip;
    const letter = node.textContent;
    const before = motion.letters[key];
    motion.letters[key] = letter;
    if (!still && !opened && before && before !== letter) flip(node, before);
  });

  if (GPA_LOOK === 3) pagerAfterRender(opened);
  loop();
}

/** Start the opening moves for this look. Returns { numberKey: delay ms } for count ups. */
function playOpening() {
  const goalPage = document.querySelector('.gl-goalpage');
  if (goalPage) return { goal: 0 };
  if (GPA_LOOK === 2) {
    const root = document.querySelector('.gl2');
    root.classList.add('gl-play');
    // The sentence, then the number, then the chips (timings in css/gpa-looks.css).
    const count = +getComputedStyle(root).getPropertyValue('--words') || 7;
    return { hero: count * WORD_MS + 260 };
  }
  document.querySelectorAll('.gl-list').forEach(list => list.classList.add('gl-drop'));
  if (GPA_LOOK === 3) return { [PAGE_NUM_KEYS[gpaLook.page]]: 0 };
  return { hero: 0 };
}

function currentValue(key) {
  const tween = motion.tweens[key];
  if (!tween) return motion.shown[key] ?? 0;
  const k = Math.max(0, Math.min(1, (performance.now() - tween.start) / tween.dur));
  return tween.from + (tween.to - tween.from) * tween.ease(k);
}

/** Old letter fades up and out while the new one rises in. */
function flip(node, oldLetter) {
  const box = node.parentElement;
  const ghost = document.createElement('span');
  ghost.className = 'gl-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = oldLetter;
  box.appendChild(ghost);
  ghost.animate([{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,-55%,0)' }],
    { duration: ms(240), easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => ghost.remove();
  node.animate([{ opacity: 0, transform: 'translate3d(0,55%,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
    { duration: ms(320), delay: ms(70), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
}

function loop() {
  if (!motion.raf) motion.raf = requestAnimationFrame(tick);
}

function tick(now) {
  motion.raf = 0;
  let moving = false;
  for (const [key, tween] of Object.entries(motion.tweens)) {
    const k = Math.max(0, Math.min(1, (now - tween.start) / tween.dur));
    const value = tween.from + (tween.to - tween.from) * tween.ease(k);
    document.querySelectorAll(`[data-num="${key}"]`).forEach(node => {
      // The last frame writes the view's own text, so it always lands exactly on it.
      node.textContent = k < 1 ? value.toFixed(+node.dataset.dec) : node.dataset.to;
    });
    if (k < 1) moving = true;
    else delete motion.tweens[key];
  }
  if (pagerFrame(now)) moving = true;
  if (moving) loop();
}

// ---- Look 3 pager: the intro pager's physics (looks branch js/views/motion.js) --------------
//
// JS owns the track position (pos, in pages). The page stays under the finger 1:1; on release
// it moves on past half the width or on a fast flick, otherwise it springs back. The settle
// time scales with the distance left. The number lags its page a little (parallax).

const NEXT_MS = 600; // tap on a dot label
const SETTLE_MIN = 250;
const SETTLE_MAX = 600;
const FLICK_PX_PER_MS = 0.5;
const FLICK_WINDOW_MS = 80;
const EDGE_GIVE = 0.35;
const PARALLAX_PX = 14;
const DRAG_SLOP = 8; // px before a press becomes a swipe (or a vertical scroll)

const pager = { pos: null, shown: null, landed: null, tween: null, drag: null, dragged: false };

const pagerWidth = () => (document.querySelector('.gl-pager') || {}).clientWidth || 390;

function pagerAfterRender(opened) {
  if (!document.querySelector('.gl-track')) return;
  if (pager.pos == null || opened) {
    pager.pos = gpaLook.page;
    pager.shown = gpaLook.page;
    pager.landed = gpaLook.page;
    pager.tween = null;
  } else if (gpaLook.page !== pager.shown) {
    // A dot label was tapped: glide there.
    pager.shown = gpaLook.page;
    tweenTo(gpaLook.page, NEXT_MS);
  }
  pagerFrame(performance.now()); // re-apply inline styles to the fresh DOM before it paints
}

function tweenTo(target, dur) {
  pager.tween = { from: pager.pos, to: target, start: performance.now(), dur: reducedMotion() ? 0 : ms(dur) };
  loop();
}

/** One frame of the pager. Returns true while it moves. */
function pagerFrame(now) {
  const track = document.querySelector('.gl-track');
  if (!track || pager.pos == null) return false;
  let moving = false;
  if (pager.tween) {
    const { from, to, start, dur } = pager.tween;
    const k = dur ? Math.min(1, (now - start) / dur) : 1;
    pager.pos = from + (to - from) * easeOutCubic(k);
    if (k < 1) moving = true;
    else {
      pager.pos = to;
      pager.tween = null;
      land(to);
    }
  }
  if (pager.drag) moving = true;
  track.style.transform = `translate3d(${-pager.pos * 100}%,0,0)`;
  const still = reducedMotion();
  [...track.children].forEach((page, i) => {
    const offset = i - pager.pos;
    page.querySelectorAll('.gl-par').forEach(node => {
      node.style.transform = still || Math.abs(offset) >= 1 || Math.abs(offset) < 0.001
        ? '' : `translate3d(${-offset * PARALLAX_PX}px,0,0)`;
    });
  });
  // Dot labels brighten with how far their page is in.
  document.querySelectorAll('.gl-dots button').forEach((dot, i) => {
    dot.style.opacity = String(0.5 + 0.5 * Math.max(0, 1 - Math.abs(i - pager.pos)));
  });
  syncPagerHeight();
  return moving;
}

/** The pager is as tall as the page in view (both pages while one slides over the other). */
function syncPagerHeight() {
  const viewport = document.querySelector('.gl-pager');
  if (!viewport || pager.pos == null) return;
  const pages = viewport.querySelectorAll('.gl-page');
  const a = pages[Math.floor(pager.pos)];
  const b = pages[Math.ceil(pager.pos)];
  const height = Math.max(a ? a.offsetHeight : 0, b ? b.offsetHeight : 0);
  if (height) viewport.style.height = height + 'px';
}

/** A page came to rest: its number counts up from 0. */
function land(index) {
  if (index === pager.landed) return;
  pager.landed = index;
  if (reducedMotion()) return;
  const key = PAGE_NUM_KEYS[index];
  const node = document.querySelector(`.gl-page:nth-child(${index + 1}) [data-num="${key}"]`);
  if (!node) return;
  motion.tweens[key] = { from: 0, to: +node.dataset.to, start: performance.now(), dur: ms(COUNT_MS), ease: easeOutQuart };
}

document.addEventListener('pointerdown', event => {
  pager.drag = null;
  if (GPA_LOOK !== 3 || pager.pos == null || !event.target.closest('[data-gpa-swipe]')) return;
  if (event.target.closest('input')) return; // the goal scrubber drags itself
  pager.dragged = false;
  pager.drag = {
    x0: event.clientX, y0: event.clientY, base: pager.pos, axis: null, from: pager.tween ? pager.pos : null,
    samples: [[event.timeStamp, event.clientX]],
  };
});

document.addEventListener('pointermove', event => {
  const drag = pager.drag;
  if (!drag) return;
  const dx = event.clientX - drag.x0;
  const dy = event.clientY - drag.y0;
  if (!drag.axis) {
    if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    if (drag.axis === 'y') {
      pager.drag = null; // a vertical scroll, not a swipe
      return;
    }
    pager.tween = null; // catch a page mid glide
    drag.base = pager.pos;
    drag.x0 = event.clientX;
    pager.dragged = true;
  }
  const count = document.querySelector('.gl-track').children.length;
  let pos = drag.base - (event.clientX - drag.x0) / pagerWidth();
  if (pos < 0) pos *= EDGE_GIVE; // rubber band past the first or last page
  if (pos > count - 1) pos = count - 1 + (pos - (count - 1)) * EDGE_GIVE;
  pager.pos = pos;
  drag.samples.push([event.timeStamp, event.clientX]);
  while (drag.samples.length > 2 && event.timeStamp - drag.samples[0][0] > 4 * FLICK_WINDOW_MS) drag.samples.shift();
  loop();
});

function release(event, cancelled) {
  const drag = pager.drag;
  pager.drag = null;
  if (!drag || !drag.axis) return;
  const count = document.querySelector('.gl-track').children.length;
  const home = Math.round(drag.base);
  const samples = drag.samples;
  const [tLast, xLast] = samples[samples.length - 1];
  let recent = samples.filter(([t]) => tLast - t <= FLICK_WINDOW_MS);
  if (recent.length < 2 && samples.length >= 2 && tLast - samples[samples.length - 2][0] <= 250) recent = samples.slice(-2);
  const [tFirst, xFirst] = recent[0];
  const held = event.timeStamp - tLast > 120;
  const velocity = held || recent.length < 2 ? 0 : (xLast - xFirst) / Math.max(1, tLast - tFirst); // px/ms, + = right
  const moved = pager.pos - home;
  let target = home;
  if (!cancelled) {
    if (Math.abs(velocity) >= FLICK_PX_PER_MS) target = home + (velocity < 0 ? 1 : -1);
    else if (Math.abs(moved) > 0.5) target = home + Math.sign(moved);
  }
  target = Math.max(0, Math.min(count - 1, target));
  const dur = SETTLE_MIN + (SETTLE_MAX - SETTLE_MIN) * Math.min(1, Math.abs(target - pager.pos));
  if (target !== gpaLook.page) {
    gpaLook.page = target;
    pager.shown = target;
    render(); // dot labels; the pager keeps the page where the finger left it
  }
  tweenTo(target, dur);
}
document.addEventListener('pointerup', event => release(event, false));
document.addEventListener('pointercancel', event => release(event, true));

// A swipe that ends on a row is not a tap on it.
document.addEventListener('click', event => {
  if (!pager.dragged) return;
  pager.dragged = false;
  event.stopPropagation();
  event.preventDefault();
}, true);
