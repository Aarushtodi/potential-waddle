/**
 * Pick a look: shown once after the intro, before sign in (not when the intro is replayed
 * from Settings). Three big cards, each with a small picture of Home in that look.
 * Tapping a card applies it right away; Continue goes on to sign in.
 * The same three options live in Settings > Appearance.
 */
import { state } from '../state.js';
import { actionAttrs, heading } from './components.js';

const LOOKS = [
  { theme: 'light', name: 'Light' },
  { theme: 'dark', name: 'Dark' },
  { theme: 'system', name: 'Match my phone', sub: 'Switches with your iPhone' },
];

const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7" '
  + 'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** A tiny drawing of Home (title, missing card, class chips, to-dos, tab bar) in one palette. */
function miniHome(palette) {
  const row = width => `<div class="mh-row"><b></b><span style="width:${width}%"></span></div>`;
  return `<div class="mh pal-${palette}">`
    + `<div class="mh-nav"><span class="mh-ttl">Home</span><i></i></div>`
    + `<div class="mh-card"><div class="mh-line u"></div>${row(70)}${row(55)}</div>`
    + `<div class="mh-chips"><span></span><span></span></div>`
    + `<div class="mh-card">${row(62)}${row(48)}</div>`
    + `<div class="mh-tabs"><span class="on"></span><span></span><span></span><span></span></div>`
    + `</div>`;
}

function preview(theme) {
  if (theme === 'system') {
    return `<div class="mh-frame split">${miniHome('light')}${miniHome('dark')}</div>`;
  }
  return `<div class="mh-frame">${miniHome(theme)}</div>`;
}

export function themePickView() {
  const cards = LOOKS.map(look => {
    const on = state.theme === look.theme;
    return `<button class="look${on ? ' on' : ''}" role="radio" aria-checked="${on}" ${actionAttrs('pickTheme', look.theme)}>`
      + `<span aria-hidden="true">${preview(look.theme)}</span>`
      + `<span class="grow"><span class="t">${look.name}</span>`
      + (look.sub ? `<span class="s">${look.sub}</span>` : '')
      + `</span><span class="look-radio" aria-hidden="true">${on ? CHECK : ''}</span></button>`;
  }).join('');

  return `<div class="scr looks">`
    + `<div class="looks-head">${heading('Appearance', 'Pick a ', 'look', { big: 1 })}</div>`
    + `<div class="looks-list" role="radiogroup" aria-label="Pick a look">${cards}</div>`
    + `<div class="intro-foot"><button class="btn" ${actionAttrs('finishThemePick')}>Continue</button></div>`
    + `</div>`;
}
