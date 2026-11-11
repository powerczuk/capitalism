// Buildings: building, upgrading, demolishing and what they cost to run.

import { fail } from '../engine/game.js';
import { EPS, own } from '../engine/util.js';
import { freePlots, landIndex, plotsOf, resourceQuality, wageIndex } from './world.js';

export const slotCount = (type, level) => (type.slots ?? 0) + (level - 1) * (type.slotsPerLevel ?? 1);
export const lineCount = (type, level) => (type.lines ?? 0) + (level - 1) * (type.linesPerLevel ?? 1);
export const labCount = (type, level) => (type.labs ?? 0) + (level - 1) * (type.labsPerLevel ?? 1);

/** Price of a new building of `type` in a district of a city. */
export function buildCost(game, type, city, districtId) {
  const district = game.content.districts.get(districtId);
  return Math.round((type.cost * landIndex(city) * district.cost) / 1000) * 1000;
}

export function upgradeCost(game, b) {
  const { content, state } = game;
  const type = content.buildingTypes.get(b.type);
  return Math.round((buildCost(game, type, state.cities[b.city], b.district) * content.balance.building.upgradeCost) / 1000) * 1000;
}

/** Monthly running cost (staff, rent, maintenance) of a finished building. */
export function upkeepOf(game, b) {
  const { content, state } = game;
  const type = content.buildingTypes.get(b.type);
  const district = content.districts.get(b.district);
  const levels = 1 + (b.level - 1) * content.balance.building.upkeepPerLevel;
  return type.upkeep * wageIndex(game, state.cities[b.city]) * district.upkeep * levels;
}

/** True when a raw-material building has something to extract/grow in the city. */
export function cityHasResourceFor(game, type, city) {
  const recipes = game.content.recipes.filter((r) => r.building === type.id);
  if (!recipes.length) return false;
  if (recipes.some((r) => !r.raw)) return true;
  return recipes.some((r) => resourceQuality(city, r.output) != null);
}

/** Sell off stock at a loss (used when a shelf/line is repurposed or a building closes). */
export function writeOffStock(game, co, qty, unitCost) {
  if (qty <= EPS) return;
  const value = qty * unitCost;
  const recovered = value * game.content.balance.building.liquidation;
  co.cash += recovered;
  co.m.other -= value - recovered;
}

export function writeOffLine(game, co, line) {
  writeOffStock(game, co, line.qty, line.uc);
  for (const id in line.inputs) writeOffStock(game, co, line.inputs[id].qty, line.inputs[id].uc);
}

function resize(list, n) {
  while (list.length < n) list.push(null);
}

// ---------------------------------------------------------------------------
// Plots
//
// Every district of a city has numbered building plots: 0 is the best
// location, higher numbers lie further out. A building remembers its number
// (`b.lot`); where that plot is on the ground is the business of whoever
// draws the city (see src/geo/cityPlan.js), not of the rules.
// ---------------------------------------------------------------------------

/** Plot numbers taken in a district of a city. */
export function takenLots(game, cityId, districtId) {
  const taken = new Set();
  for (const b of game.buildingsIn(cityId)) if (b.district === districtId && Number.isInteger(b.lot)) taken.add(b.lot);
  return taken;
}

/** The lowest free plot number of a district. */
export function firstFreeLot(game, cityId, districtId) {
  const taken = takenLots(game, cityId, districtId);
  let lot = 0;
  while (taken.has(lot)) lot += 1;
  return lot;
}

/** Number the plots of buildings that have none (games saved before plots were numbered). */
export function ensureLots(game) {
  const missing = Object.values(game.state.buildings).filter((b) => !Number.isInteger(b.lot));
  if (!missing.length) return;
  const order = (b) => Number(String(b.id).replace(/\D+/g, '')) || 0;
  missing.sort((a, b) => a.built - b.built || order(a) - order(b));
  const byDistrict = new Map();
  for (const b of missing) {
    const key = `${b.city}|${b.district}`;
    let taken = byDistrict.get(key);
    if (!taken) byDistrict.set(key, (taken = takenLots(game, b.city, b.district)));
    let lot = 0;
    while (taken.has(lot)) lot += 1;
    b.lot = lot;
    taken.add(lot);
  }
}

function ownBuilding(game, co, id) {
  const b = own(game.state.buildings, id);
  return b && b.co === co.id ? b : null;
}

export { ownBuilding };

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const constructionCommands = [
  {
    id: 'build',
    /** params: { type, city, district, lot? } — `lot` picks the plot; left out, the best free one is taken */
    check(game, co, { type: typeId, city: cityId, district, lot }) {
      const { content, state } = game;
      const type = content.buildingTypes.find(typeId);
      if (!type) return fail('err.unknownBuilding');
      const city = own(state.cities, cityId);
      if (!city) return fail('err.unknownCity');
      if (!type.districts.includes(district)) return fail('err.wrongDistrict');
      if (freePlots(game, city, district) <= 0) return fail('err.noPlots');
      if (lot != null) {
        if (!Number.isInteger(lot) || lot < 0 || lot >= plotsOf(content, city, district)) return fail('err.badLot');
        if (takenLots(game, city.id, district).has(lot)) return fail('err.lotTaken');
      }
      if (type.kind === 'producer' && !cityHasResourceFor(game, type, city)) return fail('err.noResource');
      const cost = buildCost(game, type, city, district);
      if (co.cash < cost) return fail('err.noCash', { need: cost });
      return null;
    },
    run(game, co, { type: typeId, city: cityId, district, lot }) {
      const { content, state } = game;
      const type = content.buildingTypes.get(typeId);
      const city = state.cities[cityId];
      const cost = buildCost(game, type, city, district);
      co.cash -= cost;
      ensureLots(game);
      const b = {
        id: game.newId('b'),
        type: type.id,
        kind: type.kind,
        co: co.id,
        city: city.id,
        district,
        lot: lot ?? firstFreeLot(game, city.id, district), // plot number within the district
        level: 1,
        name: null, // null = default name "<type> <city> #no"
        no: ++co.seq,
        built: state.day,
        ready: state.day + (type.buildDays ?? 30),
        up: 0, // day an ongoing upgrade completes (0 = none)
        cost,
        book: cost,
        m: { rev: 0, cogs: 0, opex: 0 },
        last: null,
        hist: [],
      };
      if (type.kind === 'retail') b.slots = Array(slotCount(type, 1)).fill(null);
      if (type.kind === 'producer') b.lines = Array(lineCount(type, 1)).fill(null);
      if (type.kind === 'research') b.labs = Array(labCount(type, 1)).fill(null);
      state.buildings[b.id] = b;
      game.invalidate();
      return { building: b.id, cost };
    },
  },

  {
    id: 'upgrade',
    /** params: { building } */
    check(game, co, { building }) {
      const b = ownBuilding(game, co, building);
      if (!b) return fail('err.notYours');
      const type = game.content.buildingTypes.get(b.type);
      if (b.level >= type.maxLevel) return fail('err.maxLevel');
      if (!game.isReady(b)) return fail('err.underConstruction');
      if (b.up) return fail('err.alreadyUpgrading');
      const cost = upgradeCost(game, b);
      if (co.cash < cost) return fail('err.noCash', { need: cost });
      return null;
    },
    run(game, co, { building }) {
      const b = game.state.buildings[building];
      const cost = upgradeCost(game, b);
      co.cash -= cost;
      b.cost += cost;
      b.book += cost;
      b.up = game.state.day + game.content.balance.building.upgradeDays;
      return { cost };
    },
  },

  {
    id: 'demolish',
    /** params: { building } */
    check(game, co, { building }) {
      return ownBuilding(game, co, building) ? null : fail('err.notYours');
    },
    run(game, co, { building }) {
      const { state, content } = game;
      const D = content.balance.building;
      const b = state.buildings[building];
      for (const s of b.slots || []) if (s) writeOffStock(game, co, s.qty, s.uc);
      for (const line of b.lines || []) if (line) writeOffLine(game, co, line);
      const recovered = b.book * (game.isReady(b) ? D.salvage : D.cancelRefund);
      co.cash += recovered;
      co.m.other -= b.book - recovered;
      delete state.buildings[b.id];
      game.invalidate();
      return { recovered };
    },
  },

  {
    id: 'rename',
    /** params: { building, name } */
    check(game, co, { building, name }) {
      if (!ownBuilding(game, co, building)) return fail('err.notYours');
      if (typeof name !== 'string') return fail('err.badValue');
      return null;
    },
    run(game, co, { building, name }) {
      const clean = name.trim().slice(0, 40);
      game.state.buildings[building].name = clean || null;
      return {};
    },
  },
];

// ---------------------------------------------------------------------------
// System: finish construction and upgrades
// ---------------------------------------------------------------------------

export const constructionSystem = {
  id: 'construction',
  order: 30,
  onLoad(game) {
    ensureLots(game);
  },
  daily(game) {
    const { state, content } = game;
    for (const b of Object.values(state.buildings)) {
      if (b.ready === state.day) game.bus.emit('built', b);
      if (b.up && b.up <= state.day) {
        const type = content.buildingTypes.get(b.type);
        b.level += 1;
        b.up = 0;
        if (b.slots) resize(b.slots, slotCount(type, b.level));
        if (b.lines) resize(b.lines, lineCount(type, b.level));
        if (b.labs) resize(b.labs, labCount(type, b.level));
        game.bus.emit('upgraded', b);
      }
    }
  },
};
