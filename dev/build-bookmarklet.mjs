// Builds js/bookmarklet-code.js from dev/bookmarklet-src.js:  node dev/build-bookmarklet.mjs
// One line, comments and indentation dropped, then percent encoded so a bookmark URL keeps every
// character (spaces, quotes, braces, hash and percent signs).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const src = readFileSync(here('./bookmarklet-src.js'), 'utf8');
const code = src.split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('//'))
  .join(' ');
const min = squeeze(code).replace(/^\(function\(\)\{/, 'void(function(){');
/** Drops spaces outside strings unless both sides are word characters. The source has no
 *  spaces inside its regexes, so strings are the only thing to protect. */
function squeeze(text) {
  let out = '';
  let quote = null;
  const word = ch => /[A-Za-z0-9_$]/.test(ch || '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === '\\') out += text[++i];
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === ' ') {
      if (word(out[out.length - 1]) && word(text[i + 1])) out += ' ';
    } else out += ch;
  }
  return out;
}
const KEEP = /%(28|29|3B|2C|3D|27|21|2A|5B|5D|3A|3F|2F|40|26|2B|24)/g;
const url = 'javascript:' + encodeURIComponent(min).replace(KEEP, (m) => decodeURIComponent(m));
writeFileSync(here('../js/bookmarklet-code.js'),
  '// Built by dev/build-bookmarklet.mjs from dev/bookmarklet-src.js. Do not edit by hand.\n'
  + `export const BOOKMARKLET = ${JSON.stringify(url)};\n`);
console.log('bookmarklet', url.length, 'chars');
