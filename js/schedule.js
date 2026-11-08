/**
 * The sample school day: which period is on now and how long is left.
 * The real app reads the bell schedule and the A/B calendar from the district.
 */
import { BELL_SCHEDULE, SAMPLE_START_MINUTES } from './sample-data.js';
import { state, findClass } from './state.js';

/** Periods for an A or B day, with class names and rooms filled in. */
export function periodsFor(day) {
  return BELL_SCHEDULE[day].map(({ classId, start, end }) => {
    const course = findClass(classId);
    return {
      id: classId,
      name: course ? course.name : 'Lunch',
      room: course ? course.room : 'Cafeteria',
      start,
      end,
    };
  });
}

/** Sample clock in minutes after midnight: 9:37 AM at page open, then real time. */
export const sampleMinutesNow = () => SAMPLE_START_MINUTES + (Date.now() - state.openedAt) / 6e4;

/**
 * The A day period on now (or the next one, during passing time).
 * @returns {{period, index, minutesLeft, next, minutes, passing} | null} null after school
 */
export function currentPeriod() {
  const periods = periodsFor('A');
  const minutes = sampleMinutesNow();
  const index = periods.findIndex(p => minutes < p.end);
  if (index < 0) return null;
  const period = periods[index];
  return {
    period,
    index,
    minutesLeft: Math.max(1, Math.ceil(period.end - minutes)),
    next: periods[index + 1],
    minutes,
    passing: minutes < period.start,
  };
}
