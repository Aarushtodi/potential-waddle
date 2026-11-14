// Bell check: node dev/bell-check.mjs
// 1) The FISD A/B rule against days read off a real School calendar (11/11 B, 11/12 A, 11/13 B, 11/16 A).
// 2) The student's "today is B" fix: wins on its day, carries forward, stops at the next quarter.
// 3) Wakeland times, the clock (now, walk, lunch, after school), typed rows.
// 4) HAC Schedule page parser on dev/fixtures/hac-schedule.html (scrubbed real page), and on the
//    real page if ~/code/grade-app-shots/bell-1113/hac/classes.html exists (kept off the repo).
import fs from 'node:fs';
import os from 'node:os';
import {
  abDay, isSchoolDay, nextSchoolDay, quarterFor, fromKey, dateKey, bellRowsFor, clockIn, checkRows,
  parseTime, timeValue, numberPeriods,
} from '../js/bell-times.js';
import { parseHacSchedule, classesFor, teacherName, courseKey } from '../js/hac-schedule-parse.js';

let fail = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fail = 1; };
const day = (key, fix) => (abDay(fromKey(key), fix) || {}).day || '-';

// 1) Rule
check('Q2 starts B on Wed 10/14, 10/15 A', day('2026-10-14') === 'B' && day('2026-10-15') === 'A');
check('real calendar: 11/11 B, 11/12 A, 11/13 B, 11/16 A',
  ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'].map(k => day(k)).join('') === 'BABA');
check('Q1 starts A on 8/12, 8/13 B', day('2026-08-12') === 'A' && day('2026-08-13') === 'B');
check('Labor Day 9/7-8 skipped: Fri 9/4 then Wed 9/9 flip once',
  day('2026-09-07') === '-' && day('2026-09-09') !== day('2026-09-04'));
check('Thanksgiving week: no school 11/23-27, Fri 11/20 then Mon 11/30 flip once',
  day('2026-11-25') === '-' && day('2026-11-30') !== day('2026-11-20'));
check('Q3 starts A on 1/5, Q4 starts B on 3/8', day('2027-01-05') === 'A' && day('2027-03-08') === 'B');
check('weekend, winter break and summer: no guess', day('2026-11-14') === '-' && day('2026-12-28') === '-' && day('2027-06-01') === '-');
check('rule days say from: rule', abDay(fromKey('2026-11-13')).from === 'rule');

// 2) Fix
const psat = { date: '2026-10-01', day: 'B' };
check('fix 10/1 = B: 10/1 B, 10/2 A, 10/5 B, 10/8 A',
  ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-08'].map(k => day(k, psat)).join('') === 'BABA');
check('fix does not change days before it', day('2026-09-30', psat) === day('2026-09-30'));
const q2fix = { date: '2026-11-13', day: 'A' };
check('Q2 fix carries: 11/13 A, 11/16 B', day('2026-11-13', q2fix) === 'A' && day('2026-11-16', q2fix) === 'B');
check('Q2 fix does not leak into Q3 (1/5 still A by rule)', day('2027-01-05', q2fix) === 'A' && abDay(fromKey('2027-01-05'), q2fix).from === 'rule');
check('fix says from: fix', abDay(fromKey('2026-11-16'), q2fix).from === 'fix');
check('next school day after Fri 11/20 is Mon 11/30', dateKey(nextSchoolDay(fromKey('2026-11-20'))) === '2026-11-30');
check('quarterFor winter break = Q3', quarterFor(fromKey('2026-12-28')).name === 'Q3');
check('DST end (11/1) inside Q2 changes nothing: 11/2 = 11/3 flipped', day('2026-11-02') !== day('2026-11-03'));

// 3) Times and the clock
const wak = { school: 'wakeland' };
const fri = bellRowsFor(wak, fromKey('2026-11-13'));
const wed = bellRowsFor(wak, fromKey('2026-11-11'));
check('Wakeland standard: P1 9:00-10:33, lunch 12:13-1:13, P4 ends 4:30',
  fri[0].start === 540 && fri[0].end === 633 && fri[2].label === 'Power Lunch' && fri[2].start === 733 && fri[2].end === 793 && fri[4].end === 990);
check('Wednesday: Activity 12:03-12:28, lunch 12:28-1:28, P3 1:33',
  wed.length === 6 && wed[2].label === 'Activity' && wed[2].start === 723 && wed[3].start === 748 && wed[4].start === 813);
const at905 = clockIn(fri, 545);
check('9:05: Period 1, 88 min left, next Period 2', at905.current.n === 1 && at905.minutesLeft === 88 && at905.next.n === 2);
const at1220 = clockIn(fri, 740);
check('12:20: Power Lunch, 53 min left', at1220.current.label === 'Power Lunch' && at1220.minutesLeft === 53);
const walk = clockIn(fri, 635);
check('10:35: walk, next Period 2', walk.passing && !walk.current && walk.next.n === 2);
check('4:31: after school', clockIn(fri, 991).after && !clockIn(fri, 991).current);
check('8:30: before school, next Period 1', clockIn(fri, 510).before && clockIn(fri, 510).next.n === 1);
check('parse 09:05 -> 545, back to 09:05', parseTime('09:05') === 545 && timeValue(545) === '09:05' && parseTime('25:00') === null);
const typed = [{ kind: 'period', start: 600, end: 650 }, { kind: 'break', label: 'Lunch', start: 655, end: 700 }, { kind: 'period', start: 500, end: 550 }];
const numbered = numberPeriods(typed);
check('typed rows sort and number', numbered[0].n === 1 && numbered[0].start === 500 && numbered[1].n === 2 && numbered[2].label === 'Lunch');
check('typed rows: overlap, missing time, end before start caught',
  checkRows([{ start: 500, end: 600 }, { start: 590, end: 650 }]) !== ''
  && checkRows([{ start: 500, end: null }]) !== '' && checkRows([{ start: 600, end: 500 }]) !== '' && checkRows(typed) === '');

// 4) HAC Schedule parser
check('teacher names: MCKEE, MADIRA -> Madira McKee; O\'NEIL, SAM; LEE-PARK, MORGAN',
  teacherName('MCKEE, MADIRA') === 'Madira McKee' && teacherName("O'NEIL, SAM") === "Sam O'Neil"
  && teacherName('LEE-PARK, MORGAN') === 'Morgan Lee-Park' && teacherName('  ') === '');
const fixture = parseHacSchedule(fs.readFileSync(new URL('./fixtures/hac-schedule.html', import.meta.url), 'utf8'));
check('fixture: 16 schedule rows, course requests skipped', fixture && fixture.length === 16);
const lang = fixture.find(e => e.code === 'ELA13300A - 2');
check('fixture row: code, course, period 3, teacher, email, room, B, Q1 Q2',
  lang && lang.course === 'AP English Language S1' && lang.period === 3 && lang.teacher === 'Avery Brooks'
  && lang.email === 'brooksa@example.org' && lang.room === 'C302' && lang.days.join() === 'B' && lang.quarters.join() === 'Q1,Q2');
const fixB = classesFor(fixture, 'Q2', 'B');
const fixA3 = classesFor(fixture, 'Q3', 'A');
check('Q2 B day: P1 APUSH, P4 Tennis NC in room FH', fixB[1].course === 'AP US History S1' && fixB[4].course === 'Tennis NC S1' && fixB[4].room === 'FH');
check('Q3 A day: P2 is the S2 course', /S2$/.test(fixA3[2].course));
check('mixed case email lowered, padded mailto trimmed', fixture.find(e => e.period === 3 && e.days[0] === 'A').email === 'leeparkm@example.org');
check('courseKey drops semester and case', courseKey('AP US HIstory S2') === 'ap us history');
check('not a schedule page -> null', parseHacSchedule('<html><form><input type="password"></form></html>') === null);

const realPage = `${os.homedir()}/code/grade-app-shots/bell-1113/hac/classes.html`;
if (fs.existsSync(realPage)) {
  const real = parseHacSchedule(fs.readFileSync(realPage, 'utf8'));
  const today = classesFor(real, 'Q2', 'B');
  check(`real HAC page: ${real.length} rows, 4 periods on a Q2 B day, every one with a teacher and room`,
    real.length === 16 && [1, 2, 3, 4].every(p => today[p] && today[p].teacher && today[p].room));
} else console.log('skip real HAC page (not on this Mac)');
process.exit(fail);
