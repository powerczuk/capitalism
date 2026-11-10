// Random world events of the base game. See sim/worldEvents.js for the shape.
// Events change the world through `addModifier` (a temporary multiplier) or
// by editing the state directly, and announce themselves with `game.news`.
//
// Modifier kinds understood by the simulation:
//   demand:<productId>        consumer demand for a product
//   importPrice:<productId|*> price of imported goods
//   yield:<cityId>            output of farms, mines and forests in a city
//   wage:<cityId|*>           wages (building upkeep and processing cost)
//   procCost:*                processing cost of all production lines

import { addModifier } from '../sim/world.js';
import { DAYS_PER_MONTH } from '../engine/calendar.js';

const months = (n) => n * DAYS_PER_MONTH;
const pct = (factor) => Math.round(Math.abs(factor - 1) * 100);

export const WORLD_EVENTS = [
  {
    id: 'fashion',
    weight: 3,
    fire(game) {
      const product = game.rng.pick(game.content.consumerProducts);
      const factor = game.rng.range(1.25, 1.4);
      const duration = game.rng.int(6, 12);
      addModifier(game, { kind: 'demand', key: product.id, factor, days: months(duration), source: 'fashion' });
      game.news('news.event.fashion', { product: product.id, pct: pct(factor), months: duration }, { tone: 'good' });
    },
  },
  {
    id: 'slump',
    weight: 2,
    fire(game) {
      const product = game.rng.pick(game.content.consumerProducts);
      const factor = game.rng.range(0.7, 0.82);
      const duration = game.rng.int(4, 8);
      addModifier(game, { kind: 'demand', key: product.id, factor, days: months(duration), source: 'slump' });
      game.news('news.event.slump', { product: product.id, pct: pct(factor), months: duration }, { tone: 'bad' });
    },
  },
  {
    id: 'portStrike',
    weight: 1.5,
    cooldown: 720,
    fire(game) {
      const factor = game.rng.range(1.2, 1.35);
      const duration = game.rng.int(2, 4);
      addModifier(game, { kind: 'importPrice', key: '*', factor, days: months(duration), source: 'portStrike' });
      game.news('news.event.portStrike', { pct: pct(factor), months: duration }, { tone: 'bad' });
    },
  },
  {
    id: 'tariff',
    weight: 2,
    fire(game) {
      const product = game.rng.pick(game.content.products.filter((p) => p.importable));
      const factor = game.rng.range(1.3, 1.5);
      addModifier(game, { kind: 'importPrice', key: product.id, factor, days: months(12), source: 'tariff' });
      game.news('news.event.tariff', { product: product.id, pct: pct(factor), months: 12 }, { tone: 'bad' });
    },
  },
  {
    id: 'cheapImports',
    weight: 1.5,
    fire(game) {
      const product = game.rng.pick(game.content.products.filter((p) => p.importable));
      const factor = game.rng.range(0.72, 0.85);
      const duration = game.rng.int(6, 10);
      addModifier(game, { kind: 'importPrice', key: product.id, factor, days: months(duration), source: 'cheapImports' });
      game.news('news.event.cheapImports', { product: product.id, pct: pct(factor), months: duration });
    },
  },
  {
    id: 'badHarvest',
    weight: 1.5,
    fire(game) {
      const city = game.rng.pick(game.cities());
      const duration = game.rng.int(3, 5);
      addModifier(game, { kind: 'yield', key: city.id, factor: 0.6, days: months(duration), source: 'badHarvest' });
      game.news('news.event.badHarvest', { city: city.id, months: duration }, { tone: 'bad' });
    },
  },
  {
    id: 'cityBoom',
    weight: 2,
    fire(game) {
      const city = game.rng.pick(game.cities());
      const growth = game.rng.range(1.03, 1.06);
      city.pop = Math.round(city.pop * growth);
      city.wealth *= 1.02;
      game.news('news.event.cityBoom', { city: city.id, pct: pct(growth) }, { tone: 'good' });
    },
  },
  {
    id: 'wages',
    weight: 1.5,
    fire(game) {
      const city = game.rng.pick(game.cities());
      const factor = game.rng.range(1.08, 1.15);
      addModifier(game, { kind: 'wage', key: city.id, factor, days: months(12), source: 'wages' });
      game.news('news.event.wages', { city: city.id, pct: pct(factor), months: 12 }, { tone: 'bad' });
    },
  },
  {
    id: 'breakthrough',
    weight: 1,
    cooldown: 720,
    fire(game) {
      const e = game.state.economy;
      e.tech = Math.min(game.content.balance.economy.maxTech, e.tech + game.rng.range(2, 3));
      game.news('news.event.breakthrough', {});
    },
  },
  {
    id: 'energy',
    weight: 1,
    cooldown: 1080,
    fire(game) {
      const factor = game.rng.range(1.2, 1.35);
      const duration = game.rng.int(4, 8);
      addModifier(game, { kind: 'procCost', key: '*', factor, days: months(duration), source: 'energy' });
      game.news('news.event.energy', { pct: pct(factor), months: duration }, { tone: 'bad' });
    },
  },
];
