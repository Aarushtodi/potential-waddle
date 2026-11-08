/**
 * The whole screen: top bar, the current page, tab bar, and any sheet, banner or Face ID cover
 * on top. view() is the single entry point render() calls.
 */
import { escapeHtml } from '../format.js';
import { state, findClass, findRow } from '../state.js';
import { actionAttrs } from './components.js';
import { introView } from './intro.js';
import { signInView } from './signin.js';
import { homeNav, homeView, missingPageView } from './home.js';
import { gradesView, classView, assignmentView } from './grades.js';
import { gpaView, needView, gpaWhatIfView, gpaGoalView } from './gpa.js';
import { changesView, alertsView } from './changes.js';
import { settingsView, widgetsView } from './settings.js';
import { paceView } from './pace.js';
import { calendarView } from './calendar.js';
import { bellView } from './bell.js';
import { sheetView } from './sheets.js';
import { bannerLook, isBannerCompare, compareView, liveBanner } from './banner.js';

const TABS = ['home', 'grades', 'calendar', 'bell'];
const TAB_LABELS = { home: 'Home', grades: 'Grades', calendar: 'Calendar', bell: 'Bell' };
const TAB_ICONS = {
  home: '<path d="M3.5 11.5 12 4l8.5 7.5V20h-6v-5h-5v5h-6z" fill="currentColor"/>',
  grades: '<path d="M5 5h14M5 12h14M5 19h9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/>'
    + '<path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  bell: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/>'
    + '<path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
};
const SETTINGS_ICON = '<svg width="19" height="19" viewBox="0 0 24 24">'
  + '<path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  + '<circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/>'
  + '<circle cx="8" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const FACE_ID_ICON = '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">'
  + '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>'
  + '<path d="M8.5 9v1.5M15.5 9v1.5M12 9v4l-1 .6M8.8 16c2 1.6 4.4 1.6 6.4 0"/></svg>';

/** Pages that can be pushed onto a tab: name -> (id) => { title, body }. */
const PAGES = {
  class: id => {
    const course = findClass(id);
    return { title: course.name, body: classView(course) };
  },
  assignment: id => ({ title: findRow(id).row.title, body: assignmentView(id) }),
  gpaGoal: () => ({ title: 'GPA goal', body: gpaGoalView() }),
  gpa: () => ({ title: 'GPA', body: gpaView() }),
  need: () => ({ title: 'What do I need', body: needView() }),
  gpaWhatIf: () => ({ title: 'GPA what if', body: gpaWhatIfView() }),
  missingEffect: () => ({ title: 'Missing work', body: missingPageView() }),
  changes: () => ({ title: 'What changed', body: changesView() }),
  alerts: () => ({ title: 'Alerts', body: alertsView() }),
  settings: () => ({ title: 'Settings', body: settingsView() }),
  widgets: () => ({ title: 'Widgets', body: widgetsView() }),
  pace: () => ({ title: 'Pacing', body: paceView() }),
};

/** Top bar and body for a tab's root page. */
function tabRoot(tab) {
  if (tab === 'home') return { nav: homeNav(), body: homeView() };
  if (tab === 'grades') {
    const buttons = state.editingClasses
      ? `<button class="pill" ${actionAttrs('toggleEditClasses')}>Done</button>`
      : `<button class="pill" ${actionAttrs('toggleEditClasses')}>Edit</button>`
        + `<button class="pill round" aria-label="Settings" ${actionAttrs('openPage', 'settings')}>${SETTINGS_ICON}</button>`;
    return { nav: `<div class="nav"><div class="ttl">Grades</div>${buttons}</div>`, body: gradesView() };
  }
  if (tab === 'calendar') {
    return {
      nav: `<div class="nav"><div class="ttl">Calendar</div>`
        + `<button class="pill" ${actionAttrs('openSheet', 'testDates')}>Test dates</button></div>`,
      body: calendarView(),
    };
  }
  return { nav: `<div class="nav"><div class="ttl">Bell</div></div>`, body: bellView() };
}

export function view() {
  if (isBannerCompare) return compareView();
  if (state.screen === 'intro') return introView();
  if (state.screen === 'signin') return signInView();

  const stack = state.pageStacks[state.tab];
  const top = stack[stack.length - 1];
  let nav;
  let body;
  if (top) {
    const [name, id] = top;
    const page = PAGES[name](id);
    nav = `<div class="nav sub"><button class="pill round" aria-label="Back" ${actionAttrs('back')}>‹</button>`
      + `<div class="ttl">${escapeHtml(page.title)}</div></div>`;
    body = page.body;
  } else {
    ({ nav, body } = tabRoot(state.tab));
  }

  const tabBar = `<nav class="tabs">`
    + TABS.map(tab =>
      `<button class="tab${state.tab === tab ? ' on' : ''}" ${actionAttrs('switchTab', tab)}>`
      + `<svg width="24" height="24" viewBox="0 0 24 24">${TAB_ICONS[tab]}</svg>${TAB_LABELS[tab]}</button>`).join('')
    + `</nav>`;
  const banner = state.banner && bannerLook && state.banner.data
    ? liveBanner(state.banner)
    : state.banner
    ? `<div class="banner${state.banner.fresh ? ' anim' : ''}" role="status" ${actionAttrs('tapBanner')}>`
      + `<div class="t">${escapeHtml(state.banner.title)}</div><div class="s">${state.banner.body}</div></div>`
    : '';
  const faceIdCover = state.locked
    ? `<div class="lk" ${actionAttrs('unlock')}>${FACE_ID_ICON}<div class="t">Face ID</div></div>`
    : '';

  return `<div class="scr">${nav}<div class="scroll" id="main">${body}</div></div>${tabBar}${sheetView()}${banner}${faceIdCover}`;
}
