/**
 * Paste your grades: the box the Tally bookmark's Copy lands in (long press, Paste). Also takes
 * the whole HAC Classwork page copied as text (the rescue). See js/hac-import.js.
 */
import { escapeHtml } from '../format.js';
import { state } from '../state.js';
import { actionAttrs, heading, CHEVRON } from './components.js';

export function importView() {
  const status = state.importBusy
    ? `<div class="foot" style="padding-left:0;padding-right:0" role="status"><span class="spin"></span>Reading your grades</div>`
    : state.importError
      ? `<div class="foot" style="padding-left:0;padding-right:0;color:var(--urgent)" role="alert">${escapeHtml(state.importError)}</div>`
      : '';
  return `<div class="scr"><div class="scroll nt" style="padding-top:calc(env(safe-area-inset-top) + 44px)">`
    + `<div class="sec form">`
    + heading('From HAC', 'Paste your ', 'grades', { big: 1 })
    + `<div class="card pad"><textarea class="f w paste" data-paste rows="4" aria-label="Paste your grades" `
    + `placeholder="Long press here, then tap Paste" autocomplete="off" autocorrect="off" autocapitalize="off" `
    + `spellcheck="false"${state.importBusy ? ' disabled' : ''}></textarea></div>`
    + status
    + `<div class="foot" style="padding-left:0;padding-right:0">Your grades stay on your phone. Tally never asks for your password.</div>`
    + `</div>`
    + `<div class="sec"><div class="card">`
    + `<a class="row" href="setup.html" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">`
    + `<div class="grow"><div class="t">Set up the Tally bookmark</div><div class="s">First time? Steps for iPhone and Android</div></div>${CHEVRON}</a>`
    + `</div>`
    + `<div class="foot">No bookmark? On HAC, open Classwork, select all, copy, and paste it here.</div></div>`
    + `<div class="sec"><button class="btn ghost" ${actionAttrs('closeImport')}>Back</button></div>`
    + `</div></div>`;
}
