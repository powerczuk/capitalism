// Goals of the base game. `check(game, company)` is evaluated for the human
// player and returns { progress: 0..1, done?: boolean, failed?: boolean }.

import { clamp } from '../engine/util.js';
import { DAYS_PER_YEAR } from '../engine/calendar.js';
import { earnedWorthOf } from '../sim/accounting.js';
import { retailShare } from '../sim/stats.js';

function worthGoal(id, target, years, name, desc) {
  return {
    id,
    target,
    years,
    name,
    desc,
    measure: 'worth', // the interface explains what does not count
    check(game, co) {
      const worth = earnedWorthOf(game, co); // money from share issues does not count
      const done = worth >= target;
      const failed = !done && years != null && game.state.day > years * DAYS_PER_YEAR;
      return { progress: clamp(worth / target, 0, 1), done, failed };
    },
  };
}

export const GOALS = [
  {
    id: 'sandbox',
    name: { pl: 'Swobodna gra', en: 'Free play' },
    desc: { pl: 'Bez celu i bez limitu czasu. Buduj, jak chcesz.', en: 'No goal and no deadline. Build as you like.' },
    check: () => ({ progress: 0 }),
  },
  worthGoal(
    'worth50',
    50_000_000,
    null,
    { pl: 'Pierwsze 50 milionów', en: 'First 50 million' },
    { pl: 'Doprowadź wartość netto spółki do 50 mln $. Bez limitu czasu.', en: 'Grow the company’s net worth to $50M. No deadline.' },
  ),
  worthGoal(
    'worth250',
    250_000_000,
    12,
    { pl: 'Ćwierć miliarda', en: 'Quarter of a billion' },
    { pl: 'Osiągnij 250 mln $ wartości netto w ciągu 12 lat.', en: 'Reach a net worth of $250M within 12 years.' },
  ),
  worthGoal(
    'worth1000',
    1_000_000_000,
    20,
    { pl: 'Miliarder', en: 'Billionaire' },
    { pl: 'Zbuduj spółkę wartą miliard dolarów w ciągu 20 lat.', en: 'Build a company worth a billion dollars within 20 years.' },
  ),
  {
    id: 'leader10',
    years: 10,
    measure: 'worth',
    name: { pl: 'Lider po dekadzie', en: 'Leader after a decade' },
    desc: { pl: 'Po 10 latach miej najwyższą wartość netto ze wszystkich spółek.', en: 'After 10 years, have the highest net worth of all companies.' },
    check(game, co) {
      const end = 10 * DAYS_PER_YEAR;
      const { day } = game.state;
      if (day < end) return { progress: day / end };
      const mine = earnedWorthOf(game, co);
      const best = game.companies().every((other) => other === co || earnedWorthOf(game, other) < mine);
      return { progress: 1, done: best, failed: !best };
    },
  },
  {
    id: 'retailKing',
    target: 0.3,
    name: { pl: 'Król handlu', en: 'King of retail' },
    desc: { pl: 'Zdobądź 30% krajowego rynku detalicznego.', en: 'Capture 30% of the national retail market.' },
    check(game, co) {
      const share = retailShare(game, co.id);
      return { progress: clamp(share / 0.3, 0, 1), done: share >= 0.3 };
    },
  },
  {
    id: 'lastStanding',
    name: { pl: 'Ostatni na placu boju', en: 'Last one standing' },
    desc: { pl: 'Przejmij lub przetrwaj wszystkich rywali.', en: 'Take over or outlast every rival.' },
    check(game) {
      const rivals = game.state.companyOrder.map((id) => game.state.companies[id]).filter((c) => !c.human);
      if (!rivals.length) return { progress: 0 };
      const gone = rivals.filter((c) => !c.alive).length;
      return { progress: gone / rivals.length, done: gone === rivals.length };
    },
  },
];
