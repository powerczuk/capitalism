// The game calendar: 30-day months, 12 months, 360-day years.
// `state.day` counts simulated days; day 1 is the 1st of January of START_YEAR.

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const START_YEAR = 2026;

/** @returns {{year:number, month:number, dom:number, yearIndex:number}} month is 0-based */
export function dateOf(day) {
  const d = Math.max(0, day - 1);
  const yearIndex = Math.floor(d / DAYS_PER_YEAR);
  return {
    year: START_YEAR + yearIndex,
    yearIndex,
    month: Math.floor((d % DAYS_PER_YEAR) / DAYS_PER_MONTH),
    dom: (d % DAYS_PER_MONTH) + 1,
  };
}

export const isMonthEnd = (day) => day > 0 && day % DAYS_PER_MONTH === 0;
export const isYearEnd = (day) => day > 0 && day % DAYS_PER_YEAR === 0;

/** Whole years elapsed since the start of the game. */
export const yearsElapsed = (day) => day / DAYS_PER_YEAR;
