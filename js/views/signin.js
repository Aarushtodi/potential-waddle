/**
 * Sign in: pick a district, then sign in. The preview takes no login; the real app signs in
 * to the district's HAC with the student's own account.
 */
import { escapeHtml } from '../format.js';
import { state } from '../state.js';
import { actionAttrs, heading, CHEVRON } from './components.js';
import { sheetView } from './sheets.js';

export function signInView() {
  const districtChosen = state.district || state.districtNotListed;
  let districtLabel = 'Search districts';
  if (state.districtNotListed) districtLabel = "My district isn't listed";
  else if (state.district) districtLabel = escapeHtml(state.district);

  let html = `<div class="scr"><div class="scroll nt" style="padding-top:calc(env(safe-area-inset-top) + 44px)">`
    + `<div class="sec">`
    + heading('School gradebook', districtChosen ? 'Sign ' : 'Choose your ', districtChosen ? 'in' : 'district', { big: 1 })
    + `<div class="card"><div class="row" role="button" tabindex="0" ${actionAttrs('openDistrictPicker')}>`
    + `<div class="grow t">${districtLabel}</div>${CHEVRON}</div>`
    + (state.districtNotListed
      ? `<div class="row"><div class="t" style="color:var(--sec)">gradebook.yourdistrict.example</div></div>`
      : '')
    + `</div></div>`;
  if (districtChosen) {
    html += `<div class="sec"><div class="card"><div class="row"><div class="t">Sample Student</div></div>`
      + `<div class="row"><div class="t" style="letter-spacing:2px">••••••••</div></div></div>`
      + `</div>`
      + `<button class="btn" ${actionAttrs('signIn')}>Sign in</button>`;
  }
  html += `<div class="foot" style="margin-top:22px;padding-left:0;padding-right:0">Preview with made up sample data<br>`
    + `Independent app. Not made by your school or district.</div>`
    + `</div>${sheetView()}</div>`;
  return html;
}
