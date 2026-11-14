// Bell check: node dev/bell-check.mjs
// Everything on the Bell tab comes from HAC. Checks, on scrubbed copies of real HAC pages
// (dev/fixtures/hac-*.html) and on the real saved pages when this Mac has them (kept off the repo,
// ~/code/grade-app-shots/bell-1113/hac/):
// 1) Daily Schedule: date from the page's own header, times (incl. 12:15 PM = 735), periods sorted,
//    no classes days, not that page -> null.
// 2) The A/B letter from each class's Days on Classes > Schedule, only when all agree.
// 3) Classes > Schedule parser (teacher, email, room) and teacher names.
// 4) The clock: on now, between classes, before school, after school.
import fs from 'node:fs';
import os from 'node:os';
import { clockIn, dateKey, fromKey } from '../js/bell-times.js';
import { parseHacSchedule, parseDailySchedule, dayLetter, hacTime, studentId, teacherName, courseKey } from '../js/hac-schedule-parse.js';

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fail = 1; };
const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// 1) Daily Schedule
check('HAC times: 09:00 AM 540, 12:15 PM 735, 12:05 AM 5, 04:25 PM 985',
  hacTime('09:00 AM') === 540 && hacTime('12:15 PM') === 735 && hacTime('12:05 AM') === 5 && hacTime('04:25 PM') === 985 && hacTime('') === null);
const wed = parseDailySchedule(fixture('hac-daily-wed.html'));
check('Wed 11/18: date from the header, 4 periods, P1 9:00-10:33, P4 2:57-4:25 (as HAC gives them)',
  wed && wed.date === '2026-11-18' && !wed.none && wed.periods.length === 4
  && wed.periods[0].start === 540 && wed.periods[0].end === 633 && wed.periods[3].start === 897 && wed.periods[3].end === 985);
check('period row: label 1, code, course, teacher, room',
  wed.periods[0].label === '1' && wed.periods[0].code === 'MTH34300A - 3' && wed.periods[0].course === 'AP Pre Calculus S1'
  && wed.periods[0].teacher === 'Dana Rivera' && wed.periods[0].room === 'A101');
const special = parseDailySchedule(fixture('hac-daily-special.html'));
check('special day (PSAT 10/1): P1 9:00-12:10, P2 12:15-12:45, P3 12:50-2:50, P4 2:55-4:25',
  special && special.date === '2026-10-01' && special.periods.map(p => `${p.start}-${p.end}`).join() === '540-730,735-765,770-890,895-985');
const none = parseDailySchedule(fixture('hac-daily-none.html'));
check('Sat 11/14: no classes, and the student name is not kept', none && none.date === '2026-11-14' && none.none
  && !JSON.stringify(none).includes('Student'));
check('not a Daily Schedule page -> null', parseDailySchedule(fixture('hac-schedule.html')) === null && parseDailySchedule('<html></html>') === null);

// 2) A/B letter
const year = parseHacSchedule(fixture('hac-schedule.html'));
check('Wed 11/18 classes are all A on the Classes page -> A', dayLetter(wed.periods, year) === 'A');
check('special 10/1 -> B', dayLetter(special.periods, year) === 'B');
check('no Classes page -> no letter', dayLetter(wed.periods, null) === null && dayLetter(wed.periods, []) === null);
check('a mix of A and B classes -> no letter', dayLetter([wed.periods[0], special.periods[0]], year) === null);

// 3) Classes > Schedule
check('teacher names: MCALLISTER, JO -> Jo McAllister; O\'NEIL, SAM; LEE-PARK, MORGAN',
  teacherName('MCALLISTER, JO') === 'Jo McAllister' && teacherName("O'NEIL, SAM") === "Sam O'Neil"
  && teacherName('LEE-PARK, MORGAN') === 'Morgan Lee-Park' && teacherName('  ') === '');
check('Classes page: 16 schedule rows, course requests skipped', year && year.length === 16);
const lang = year.find(e => e.code === 'ELA13300A - 2');
check('Classes row: code, course, period 3, teacher, email, room, B, Q1 Q2',
  lang && lang.course === 'AP English Language S1' && lang.period === 3 && lang.teacher === 'Avery Brooks'
  && lang.email === 'brooksa@example.org' && lang.room === 'C302' && lang.days.join() === 'B' && lang.quarters.join() === 'Q1,Q2');
check('mixed case email lowered, padded mailto trimmed', year.find(e => e.code === 'MTH45310A - 1').email === 'leeparkm@example.org');
check('student ID read from the Classes page', studentId(fixture('hac-schedule.html')) === '000000');
check('courseKey drops semester and case', courseKey('AP US HIstory S2') === 'ap us history');
check('not a schedule page -> null', parseHacSchedule('<html><form><input type="password"></form></html>') === null);

// 4) Clock, on Wed 11/18's periods
const rows = wed.periods;
const at905 = clockIn(rows, 545);
check('9:05: P1 on, 88 min left, next P2', at905.current === rows[0] && at905.minutesLeft === 88 && at905.next === rows[1]);
const at1220 = clockIn(rows, 740);
check('12:20: between classes (HAC has no lunch row), next P3 in 58 min', at1220.passing && !at1220.current && at1220.next === rows[2] && at1220.minutesToNext === 58);
check('4:31: after school', clockIn(rows, 991).after && !clockIn(rows, 991).current);
check('8:30: before school, first P1 in 30 min', clockIn(rows, 510).before && clockIn(rows, 510).minutesToNext === 30);
check('date keys are local', dateKey(fromKey('2026-11-13')) === '2026-11-13' && dateKey(new Date(2026, 10, 13, 21, 30)) === '2026-11-13');

// Real pages, this Mac only
const dir = `${os.homedir()}/code/grade-app-shots/bell-1113/hac`;
if (fs.existsSync(`${dir}/classes.html`) && fs.existsSync(`${dir}/daily2-1118-wed.html`)) {
  const realYear = parseHacSchedule(fs.readFileSync(`${dir}/classes.html`, 'utf8'));
  const letters = [['daily-1113.html', 'B'], ['daily2-1111-wed.html', 'B'], ['daily2-1117-tue.html', 'B'], ['daily2-1118-wed.html', 'A'], ['daily2-1001-psat.html', 'B'], ['daily2-0106-q3.html', 'B']]
    .map(([f, want]) => {
      const d = parseDailySchedule(fs.readFileSync(`${dir}/${f}`, 'utf8'));
      return d && d.periods.length === 4 && dayLetter(d.periods, realYear) === want;
    });
  check(`real HAC pages: 6 days parse with 4 periods each, letters B B B A B B (match his School calendar for 11/11 to 11/18)`, letters.every(Boolean));
  const realNone = parseDailySchedule(fs.readFileSync(`${dir}/daily2-1125-thanksgiving.html`, 'utf8'));
  check('real Thanksgiving 11/25: no classes', realNone && realNone.none && realNone.date === '2026-11-25');
} else console.log('skip real HAC pages (not on this Mac)');
process.exit(fail);
