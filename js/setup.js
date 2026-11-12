/**
 * Tally setup page (setup.html): one tap copies the bookmark code. The code is only ever copied
 * from this page, never sent by text.
 */
import { BOOKMARKLET } from './bookmarklet-code.js';
import { applyTheme, loadTheme } from './theme.js';

applyTheme(loadTheme());

const button = document.getElementById('copy-code');
const note = document.getElementById('copy-note');
const box = document.getElementById('code-box');
box.value = BOOKMARKLET;

function legacyCopy(text) {
  box.focus();
  box.select();
  box.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  box.blur();
  return ok;
}

let reset;
function done(ok) {
  button.textContent = ok ? 'Copied' : 'Copy the bookmark code';
  note.textContent = ok ? 'Copied. Now follow the steps for your phone.' : 'Could not copy. Open Copy did not work below.';
  note.classList.toggle('setup-bad', !ok);
  clearTimeout(reset);
  if (ok) reset = setTimeout(() => (button.textContent = 'Copy the bookmark code'), 2500);
}

button.addEventListener('click', () => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(BOOKMARKLET).then(() => done(true), () => done(legacyCopy(BOOKMARKLET)));
  } else {
    done(legacyCopy(BOOKMARKLET));
  }
});
