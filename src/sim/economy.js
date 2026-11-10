// Macro economy: a business cycle that moves consumer demand and interest
// rates, slow growth of cities and of the world's technology level.

import { clamp } from '../engine/util.js';
import { DAYS_PER_YEAR } from '../engine/calendar.js';

const TAU = Math.PI * 2;

function phaseOf(cycle) {
  const level = Math.sin(cycle);
  if (level > 0.55) return 'boom';
  if (level < -0.55) return 'recession';
  return Math.cos(cycle) > 0 ? 'recovery' : 'slowdown';
}

export const economySystem = {
  id: 'economy',
  order: 10,

  setup(game) {
    const E = game.content.balance.economy;
    const cycle = game.rng.range(-0.4, 0.9); // start somewhere in a recovery
    game.state.economy = {
      cycle,
      shock: 0,
      index: 1 + E.amplitude * Math.sin(cycle), // demand index, 1 = normal
      interest: E.baseInterest,
      tech: E.startTech, // world technology level (quality of imports and local shops follows it)
      phase: phaseOf(cycle),
      hist: [],
    };
  },

  daily(game) {
    const E = game.content.balance.economy;
    const e = game.state.economy;
    e.cycle += TAU / (E.cycleYears * DAYS_PER_YEAR);
    e.shock = e.shock * 0.995 + game.rng.normal(0, E.noise);
    e.index = clamp(1 + E.amplitude * Math.sin(e.cycle) + e.shock, 0.8, 1.2);
    // Rates trail the cycle a little: money is dear late in a boom.
    e.interest = clamp(E.baseInterest + E.interestSwing * Math.sin(e.cycle - 0.6), 0.02, 0.14);
    const phase = phaseOf(e.cycle);
    if (phase !== e.phase) {
      e.phase = phase;
      game.news(`news.economy.${phase}`, {}, { tone: phase === 'recession' ? 'bad' : phase === 'boom' ? 'good' : 'info' });
    }
  },

  monthly(game) {
    const E = game.content.balance.economy;
    const { state } = game;
    const e = state.economy;
    e.tech = Math.min(E.maxTech, e.tech + E.techPerYear / 12);
    for (const id of state.cityOrder) {
      const city = state.cities[id];
      const tempo = 0.4 + 0.6 * e.index;
      city.pop = Math.round(city.pop * (1 + (city.growth / 12) * tempo));
      city.wealth = clamp(city.wealth * (1 + 0.0008 + 0.01 * (e.index - 1)), 0.6, 2);
    }
    e.hist.push({ d: state.day, i: Math.round(e.index * 1000) / 1000, r: Math.round(e.interest * 10000) / 10000 });
    if (e.hist.length > 240) e.hist.shift();
  },
};
