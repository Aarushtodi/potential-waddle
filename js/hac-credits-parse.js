/**
 * Graduation credits from HAC, pure (string based, no DOM: ~/code/grade-app-shots/hacadds-1113/tools/hacadds-check.mjs, kept off this public repo).
 *
 * parseCareerPlan: Classes > Career Plan (/HomeAccess/Content/Student/CareerPlan.aspx). Only the
 * first table (the Graduation Plan); the Supplemental Plan tables after it repeat the subjects.
 * Per subject: Credit Needed, and every course in the 4 year grid with its credit. HAC prints
 * courses that are not complete in italics (<I>), so a course counts as earned only when it is
 * not in italics. HAC's own "Est. Credit" column adds in classes still going and next year's
 * requests, so it is not used.
 *   -> { plan: 'Foundation Plan with Endorsements', subjects: [{ name: 'Language Arts', needed: 4,
 *        earned: 1, courses: [{ name: 'English 1 S1', code: 'ELA10000A - 1', credit: 0.5, done: true }] }],
 *        doneCourses: [{ name, code, credit }] }   (each completed course once, for the check)
 *
 * parseTranscriptCredits: Grades > Transcript (/HomeAccess/Content/Student/Transcript.aspx): each
 * year's courses and HAC's "Total Credit" for the year.
 *   -> { total: 12, years: [{ year: '2025-2026', total: 6 }], courses: [{ code, name, credit }] }
 *
 * checkCredits: the plan's completed courses must add up to exactly the credit the transcript
 * says was earned. They use different course codes (local vs state), so the check is on the
 * total. No match = the card stays hidden: a wrong credit count is worse than none.
 */

const decode = text => String(text)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const cellText = html => decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = text => {
  const n = parseFloat(String(text).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** Credits in halves, so 0.1 + 0.2 style float drift never fails a check. */
const halves = n => Math.round(n * 2);

export function parseCareerPlan(html) {
  const page = String(html || '');
  const planMatch = /Graduation Plan\s*:\s*([^<]+?)\s*</.exec(page);
  const start = page.indexOf('id="TblMain"');
  if (!planMatch || start < 0) return null;
  const supplemental = page.indexOf('Supplemental Plan', start);
  const table = page.slice(start, supplemental < 0 ? undefined : supplemental);

  const subjects = [];
  const done = new Map();
  let current = null;
  for (const row of table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const head = /<td rowspan="\d+">\s*([^<]+?)\s*<\/td>\s*<td rowspan="\d+">\s*([\d.]+)\s*<\/td>/.exec(row);
    if (head) {
      current = { name: decode(head[1]).replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim(), needed: +head[2], earned: 0, courses: [] };
      subjects.push(current);
    }
    if (!current) continue;
    const pair = /<td name="TDCourse">([\s\S]*?)<\/td>\s*<td name="TDCredit"[^>]*>([\s\S]*?)<\/td>/g;
    let m;
    while ((m = pair.exec(row))) {
      const text = cellText(m[1]);
      if (!text) continue;
      const credit = num(cellText(m[2]));
      const isDone = !/<i>/i.test(m[1]);
      const parts = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text);
      const course = { name: parts ? parts[1] : text, code: parts ? parts[2].replace(/\s+/g, ' ') : '', credit: credit ?? 0, done: isDone };
      current.courses.push(course);
      if (isDone && credit) {
        current.earned += credit;
        done.set(course.code || course.name, { name: course.name, code: course.code, credit });
      }
    }
  }
  if (!subjects.length) return null;
  return { plan: planMatch[1].replace(/\s+/g, ' ').trim(), subjects, doneCourses: [...done.values()] };
}

export function parseTranscriptCredits(html) {
  const page = String(html || '');
  if (!/rpTranscriptGroup/.test(page)) return null;
  const years = [];
  const courses = [];
  let year = '';
  for (const row of page.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(cellText);
    if (!cells.length) continue;
    const yearAt = cells.indexOf('Year:');
    if (yearAt >= 0 && /^\d{4}-\d{4}$/.test(cells[yearAt + 1] || '')) {
      year = cells[yearAt + 1];
      continue;
    }
    const totalAt = cells.indexOf('Total Credit:');
    if (totalAt >= 0 && year) {
      const total = num(cells[totalAt + 1]);
      if (total != null) years.push({ year, total });
      continue;
    }
    if (year && cells.length >= 6 && /\s-\s\d+$/.test(cells[0]) && num(cells[5]) != null) {
      courses.push({ code: cells[0], name: cells[1], credit: num(cells[5]), year });
    }
  }
  if (!years.length) return null;
  return { total: years.reduce((sum, y) => sum + y.total, 0), years, courses };
}

/** { ok, earned, planEarned } : ok when the plan's completed credits equal the transcript's. */
export function checkCredits(plan, transcript) {
  if (!plan || !transcript) return { ok: false, earned: 0, planEarned: 0 };
  const planEarned = plan.doneCourses.reduce((sum, course) => sum + course.credit, 0);
  const ok = halves(planEarned) === halves(transcript.total) && transcript.total > 0;
  return { ok, earned: transcript.total, planEarned };
}
