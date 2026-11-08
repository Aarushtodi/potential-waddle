/**
 * Appearance: 'system' (Match my phone), 'light' or 'dark'. The pick is saved on the phone
 * (localStorage), so it survives a reload even though the rest of the preview resets.
 *
 * 'light' and 'dark' set data-theme on <html>, which css/app.css uses to force a palette.
 * 'system' removes it, and the prefers-color-scheme media query decides.
 */

export const THEMES = ['system', 'light', 'dark'];

const STORAGE_KEY = 'gradeApp.theme';
/** Top bar colors (--bar in css/app.css), for the browser's theme-color. */
const BAR_COLOR = { light: '#D8D2C6', dark: '#000000' };

/** The saved pick, or 'system' if there is none (or storage is blocked). */
export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or storage off: the pick still applies until reload.
  }
}

/** Point <html> and the color-scheme / theme-color meta tags at a theme. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.content = theme === 'system' ? 'light dark' : theme;
  // One theme-color tag per phone setting; a forced theme sets both to its own bar color.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const phoneIsDark = (meta.media || '').includes('dark');
    meta.content = BAR_COLOR[theme === 'system' ? (phoneIsDark ? 'dark' : 'light') : theme];
  }
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Run `update` (which changes the theme and redraws) as a crossfade from the old screen to
 * the new one (300ms, set in css/app.css). Without View Transitions, or under reduced motion,
 * it just switches.
 */
export function crossfade(update) {
  if (!document.startViewTransition || reducedMotion.matches) {
    update();
    return;
  }
  document.startViewTransition(update);
}
