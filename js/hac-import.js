/**
 * PASTE IMPORT. Grades come in by paste only: Tally makes no network request for them.
 *
 * Two kinds of paste:
 *   1. The Tally bookmark's packed text, "TALLY1.<length>.<base64 deflated JSON>" (TALLY0 = not
 *      deflated). Built by dev/bookmarklet-src.js on the student's own HAC page.
 *   2. Rescue: the whole HAC Classwork page, selected and copied as plain text. Table cells arrive
 *      tab separated, one row per line (Safari and Chrome both copy tables that way).
 *
 * Both end as the shape real-data.js maps onto the app: {period, pulledAt, classes: [{name,
 * average, categoryWeights, rows: [{due, title, category, score, total, weight}]}]}.
 * The last good import is saved on the phone (localStorage) and loads before the first render.
 */

const STORE_KEY = 'tally-hac-grades-v1';

/** Thrown with a line the import screen shows as is. */
export class ImportError extends Error {}

const CUT = 'That paste got cut off. On HAC, tap Copy grades again, then paste here.';
const UNKNOWN = "That doesn't look like HAC grades. Use the Tally bookmark on HAC, or copy the whole Classwork page.";
const EMPTY = 'No classes found in that paste. On HAC, open Classwork, select all, copy, then paste here.';

/** Any pasted text -> import data, or throws ImportError. */
export async function readPaste(text) {
  const clean = String(text || '').trim();
  if (/^TALLY\d/.test(clean)) return fromPacked(clean);
  return fromPageText(clean);
}

// ---- 1. The bookmark's packed text ------------------------------------------------------

async function fromPacked(text) {
  const match = text.replace(/\s+/g, '').match(/^TALLY([01])\.(\d+)\.([A-Za-z0-9+/=_-]*)$/);
  if (!match) throw new ImportError(CUT);
  const [, kind, length, body] = match;
  if (body.length !== +length) throw new ImportError(CUT);
  let json;
  try {
    const bytes = Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
    if (kind === '1') {
      if (!window.DecompressionStream) throw new ImportError('This phone is too old to open the packed grades. Paste the whole Classwork page instead.');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      json = await new Response(stream).text();
    } else {
      json = new TextDecoder().decode(bytes);
    }
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(CUT);
  }
  let packed;
  try {
    packed = JSON.parse(json);
  } catch {
    throw new ImportError(CUT);
  }
  if (!packed || packed.v !== 1 || !Array.isArray(packed.c)) throw new ImportError(UNKNOWN);
  const classes = packed.c.map(([name, average, cats, rows]) => {
    const names = (cats || []).map(cat => cat[0]);
    return {
      name: String(name || ''),
      average: typeof average === 'number' ? average : null,
      categoryWeights: Object.fromEntries((cats || []).map(([cat, weight]) => [cat, weight])),
      rows: (rows || []).map(([due, title, category, score, total, weight]) => ({
        due, title, category: typeof category === 'number' ? names[category] : category,
        score, total, weight,
      })),
    };
  }).filter(course => course.name);
  if (!classes.length) throw new ImportError(EMPTY);
  return { period: packed.q || '', pulledAt: packed.t ? packed.t / 1000 : Date.now() / 1000, classes };
}

// ---- 2. Rescue: the whole HAC page as text ----------------------------------------------

const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
/** "ELA13300A - 2    AP English Language S1": a course code, a section, then the name. */
const COURSE = /^[A-Z0-9]{4,}[A-Z0-9 ]*\s+-\s+\d+\s+\S/;

function fromPageText(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/ /g, ' '));
  const cells = line => line.split('\t').map(cell => cell.replace(/\s+/g, ' ').trim());
  const classes = [];
  let course = null;
  let inCategories = false;
  let period = '';

  for (const line of lines) {
    const flat = line.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    const row = cells(line);

    if (COURSE.test(flat) && !DATE.test(row[0])) {
      // The class name line can carry its average after a tab: "...S1\tStudent Grades 95.23%".
      const nameCell = row.find(cell => COURSE.test(cell)) || flat;
      course = { name: nameCell.replace(/Student Grades.*$/i, '').trim(), average: null, categoryWeights: {}, rows: [] };
      classes.push(course);
      inCategories = false;
    }
    const average = flat.match(/Student Grades\s*(\d+(?:\.\d+)?)\s*%?/i);
    if (average && course) course.average = +average[1];
    if (!period) {
      const run = flat.match(/Report Card Run:?\s*(\d+|\(?All Runs\)?)/i);
      if (run) period = /^\d+$/.test(run[1]) ? 'Q' + run[1] : 'All year';
    }
    if (!course) continue;

    if (/^Category\b/.test(row[0]) && row.some(cell => /Weight/i.test(cell))) {
      inCategories = true;
      continue;
    }
    if (/^Date Due\b/i.test(row[0])) {
      inCategories = false;
      continue;
    }
    if (DATE.test(row[0]) && row.length >= 6) {
      // Date Due, Date Assigned, Assignment, Category, Score, Total Points, Weight, ...
      if (row[2]) course.rows.push({ due: row[0], title: row[2], category: row[3], score: row[4], total: row[5], weight: row[6] || '' });
      continue;
    }
    if (inCategories && row.length >= 5 && row[0] && !/^Total/i.test(row[0]) && !Number.isNaN(parseFloat(row[4]))) {
      course.categoryWeights[row[0]] = parseFloat(row[4]);
    }
  }

  const found = classes.filter(entry => entry.name);
  if (!found.length) throw new ImportError(/Student Grades|Date Due|Assignment/i.test(text) ? EMPTY : UNKNOWN);
  return { period, pulledAt: Date.now() / 1000, classes: found };
}

// ---- Saved on the phone -----------------------------------------------------------------

export function saveImport(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or storage full: the grades still show until Tally closes.
  }
  // Home Screen apps get kept storage; free to ask, ignored where not supported.
  try {
    navigator.storage?.persist?.();
  } catch {
    // ignore
  }
}

export function loadImport() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return data && Array.isArray(data.classes) && data.classes.length ? data : null;
  } catch {
    return null;
  }
}

export function forgetImport() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}

/** Best effort: the packed grades should not sit on the clipboard (or Universal Clipboard). */
export function clearClipboard() {
  try {
    navigator.clipboard?.writeText?.('').catch(() => {});
  } catch {
    // ignore
  }
}
