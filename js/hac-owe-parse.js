/**
 * The parts of HAC's Classwork page (/HomeAccess/Content/Student/Assignments.aspx) that the grade
 * parser (js/hac-parse.js, shared with the bookmark) does not keep: the teacher's comment on a
 * score and HAC's "Can Be Dropped" flag. Pure (string based, no DOM: ~/code/grade-app-shots/hacadds-1113/tools/hacadds-check.mjs, kept off this public repo).
 *
 * Only rows of each class's assignment table (dgCourseAssignments) count; the category table
 * above it uses the same row class and is skipped.
 *
 *   -> { dropY: 40, dropN: 2, rows: [{ code: 'SCI10000A - 1', title: 'Unit 3 Quiz', due: '10/02/2026',
 *        score: 'ABS', drop: true, comment: '' }] }
 * Returns null when the page has no class blocks.
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

export function parseAssignmentExtras(html) {
  const page = String(html || '');
  const blocks = page.split(/<div\b[^>]*class="AssignmentClass"/).slice(1);
  if (!blocks.length) return null;
  const rows = [];
  let dropY = 0;
  let dropN = 0;
  for (const block of blocks) {
    const head = /<a\b[^>]*class="sg-header-heading"[^>]*>([\s\S]*?)<\/a>/.exec(block)
      || /class="sg-header-heading"[^>]*>([\s\S]*?)<\//.exec(block);
    const name = head ? cellText(head[1]) : '';
    const code = (/^([A-Z0-9]+\s*-\s*\d+)\s/.exec(name) || [])[1];
    const start = block.search(/<table\b[^>]*id="[^"]*dgCourseAssignments/);
    if (!code || start < 0) continue;
    const end = block.indexOf('</table>', start);
    const table = block.slice(start, end < 0 ? undefined : end);
    for (const row of table.match(/<tr class="sg-asp-table-data-row"[^>]*>[\s\S]*?<\/tr>/g) || []) {
      const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || [];
      if (cells.length < 6) continue;
      const tip = /<a\b[^>]*title="([^"]*)"/.exec(cells[2]);
      const titleMatch = /aria-label="([^"]*)"/.exec(cells[2]);
      const title = titleMatch ? decode(titleMatch[1]).replace(/\s+/g, ' ').trim() : cellText(cells[2]).replace(/\*$/, '').trim();
      if (!title) continue;
      const dropMatch = tip ? /Can Be Dropped:\s*([YN])/.exec(decode(tip[1])) : null;
      const drop = dropMatch ? dropMatch[1] === 'Y' : null;
      if (drop === true) dropY++;
      if (drop === false) dropN++;
      const note = /class="comment-tooltip"[^>]*title="([^"]*)"|title="([^"]*)"[^>]*class="comment-tooltip"/.exec(cells[4]);
      rows.push({
        code: code.replace(/\s+/g, ' '),
        title,
        due: cellText(cells[0]),
        score: cellText(cells[4]).split(' ')[0],
        drop,
        comment: note ? decode(note[1] || note[2]).replace(/\s+/g, ' ').trim() : '',
      });
    }
  }
  return { dropY, dropN, rows };
}
