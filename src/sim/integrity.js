// Integrity: refuses saves the rules cannot run — hand-edited or truncated
// files, and saves made with content (a mod) this game does not have.
//
// Checked once, when a save is loaded. A save that passes the structural
// check is then played to the end of its month on a throw-away copy: what
// would break the daily or monthly rules is caught here instead of in the
// player's game.
//
// Errors carry a message the interface knows:
//   'save.invalid'   the file is damaged
//   'save.content'   it needs something that is not installed (error.params.id)

import { isMonthEnd } from '../engine/calendar.js';
import { Game } from '../engine/game.js';
import { clone, own } from '../engine/util.js';
import { LEDGER_KEYS } from './accounting.js';

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNumber = (x) => typeof x === 'number' && Number.isFinite(x);
const isNumberOrNull = (x) => x == null || isNumber(x);
/** Ids are plain words ("c1", "k5", "b12") — never something a page could mistake for markup. */
const isId = (x) => typeof x === 'string' && /^[A-Za-z][\w-]{0,31}$/.test(x);

function damaged(where) {
  const error = new Error('save.invalid');
  error.detail = where;
  return error;
}

function missing(kind, id) {
  const error = new Error('save.content');
  error.detail = `${kind} "${id}"`;
  error.params = { id: String(id) };
  return error;
}

/** Throws when `state` is not something the simulation can continue from. */
export function checkState(content, state) {
  const need = (ok, where) => {
    if (!ok) throw damaged(where);
  };
  const known = (registry, kind, id) => {
    if (typeof id !== 'string' || !registry.has(id)) throw missing(kind, id);
  };

  need(Number.isInteger(state.day) && state.day >= 0, 'day');
  need(isNumber(state.rng) && Number.isInteger(state.nextId), 'counters');
  need(isObject(state.settings), 'settings');
  need(isObject(state.cities) && Array.isArray(state.cityOrder) && state.cityOrder.length > 0, 'cities');
  need(isObject(state.companies) && Array.isArray(state.companyOrder), 'companies');
  need(isObject(state.buildings) && Array.isArray(state.modifiers) && Array.isArray(state.news), 'collections');
  const e = state.economy;
  need(isObject(e) && isNumber(e.cycle) && isNumber(e.shock) && isNumber(e.index) && isNumber(e.interest) && isNumber(e.tech), 'economy');
  need(typeof e.phase === 'string' && Array.isArray(e.hist), 'economy');
  need(state.humanId == null || own(state.companies, state.humanId) !== undefined, 'player');

  need(new Set(state.cityOrder).size === state.cityOrder.length && Object.keys(state.cities).length === state.cityOrder.length, 'city list');
  for (const id of state.cityOrder) {
    const city = own(state.cities, id);
    need(isId(id) && isObject(city) && city.id === id && typeof city.name === 'string', 'city');
    need(isNumber(city.x) && isNumber(city.y) && isNumber(city.pop) && city.pop > 0 && isNumber(city.wealth) && isNumber(city.growth), `city ${id}`);
    need(isObject(city.res) && isObject(city.mk), `city ${id}`);
    for (const pid in city.res) known(content.products, 'product', pid);
  }

  need(new Set(state.companyOrder).size === state.companyOrder.length && Object.keys(state.companies).length === state.companyOrder.length, 'company list');
  for (const id of state.companyOrder) {
    const co = own(state.companies, id);
    need(isId(id), 'company');
    const where = `company ${id}`;
    need(isObject(co) && co.id === id && typeof co.name === 'string' && typeof co.alive === 'boolean', where);
    need(isNumber(co.cash) && isNumber(co.loan) && isNumber(co.price) && isNumber(co.div) && Number.isInteger(co.color), where);
    need(isNumber(co.negDays) && isNumber(co.seq) && isNumber(co.lastIssue), where);
    need(isNumberOrNull(co.raised) && isNumberOrNull(co.paid), where);
    need(isObject(co.shares) && isNumber(co.shares.total) && co.shares.total > 0 && isNumber(co.shares.founder) && isObject(co.shares.held), where);
    need(isObject(co.m) && LEDGER_KEYS.every((key) => isNumber(co.m[key])), where);
    need(Array.isArray(co.reports) && Array.isArray(co.pd) && isObject(co.basis), where);
    for (const key of ['tech', 'brand', 'ads', 'buy', 'sold']) {
      need(isObject(co[key]), where);
      for (const pid in co[key]) {
        known(content.products, 'product', pid);
        need(isNumber(co[key][pid]), where);
      }
    }
    for (const holder in co.shares.held) need(own(state.companies, holder) !== undefined && isNumber(co.shares.held[holder]), where);
    for (const target in co.basis) need(own(state.companies, target) !== undefined && isNumber(co.basis[target]), where);
    if (co.ai != null) {
      need(isObject(co.ai) && isObject(co.ai.mem), where);
      known(content.difficulties, 'difficulty', co.ai.level);
      known(content.personalities, 'personality', co.ai.persona);
    }
  }

  for (const id of Object.keys(state.buildings)) {
    const b = state.buildings[id];
    need(isId(id), 'building');
    const where = `building ${id}`;
    need(isObject(b) && b.id === id, where);
    known(content.buildingTypes, 'building', b.type);
    known(content.districts, 'district', b.district);
    const type = content.buildingTypes.get(b.type);
    need(b.kind === type.kind && own(state.companies, b.co) !== undefined && own(state.cities, b.city) !== undefined, where);
    need(Number.isInteger(b.level) && b.level >= 1 && isNumber(b.ready) && isNumber(b.up) && isNumber(b.cost) && isNumber(b.book), where);
    need(isObject(b.m) && isNumber(b.m.rev) && isNumber(b.m.cogs) && isNumber(b.m.opex) && Array.isArray(b.hist), where);
    need(b.name == null || typeof b.name === 'string', where);
    need(b.lot == null || (Number.isInteger(b.lot) && b.lot >= 0), where);
    need(Array.isArray(b.slots) === (b.kind === 'retail') && Array.isArray(b.lines) === (b.kind === 'producer') && Array.isArray(b.labs) === (b.kind === 'research'), where);
    for (const slot of b.slots || []) {
      if (slot == null) continue;
      need(isObject(slot), where);
      known(content.products, 'product', slot.product);
      need(isNumber(slot.price) && slot.price > 0 && isNumber(slot.qty) && isNumber(slot.q) && isNumber(slot.uc), where);
      need(isNumberOrNull(slot.d) && isNumberOrNull(slot.s) && isNumber(slot.so) && isNumber(slot.cl), where);
      need(isNumber(slot.rev) && isNumber(slot.cogs) && isNumber(slot.units) && (slot.src == null || typeof slot.src === 'string'), where);
      need(isNumberOrNull(slot.cap), where);
      // notes of the pricing assistant (shelves on "auto" only)
      need((slot.aim == null || isNumber(slot.aim)) && (slot.from == null || isNumber(slot.from)) && (slot.moved == null || isNumber(slot.moved)), where);
      need(slot.why == null || typeof slot.why === 'string', where);
    }
    for (const line of b.lines || []) {
      if (line == null) continue;
      need(isObject(line) && isObject(line.inputs), where);
      known(content.recipes, 'recipe', line.recipe);
      need(isNumber(line.qty) && isNumber(line.q) && isNumber(line.uc) && isNumber(line.price) && isNumber(line.rev), where);
      need(isNumberOrNull(line.made) && isNumberOrNull(line.out) && isNumberOrNull(line.ext), where);
      const recipe = content.recipes.get(line.recipe);
      for (const pid in recipe.inputs || {}) {
        const input = own(line.inputs, pid);
        need(isObject(input) && isNumber(input.qty) && isNumber(input.q) && isNumber(input.uc), where);
        need((input.src == null || typeof input.src === 'string') && isNumberOrNull(input.cap), where);
      }
    }
    for (const lab of b.labs || []) {
      if (lab == null) continue;
      need(isObject(lab) && isNumber(lab.budget), where);
      known(content.products, 'product', lab.product);
    }
  }

  for (const m of state.modifiers) need(isObject(m) && typeof m.kind === 'string' && isNumber(m.f) && isNumber(m.until), 'modifiers');
  for (const item of state.news) need(isObject(item) && typeof item.k === 'string' && isNumber(item.d), 'news');
}

export const integritySystem = {
  id: 'integrity',
  order: 1,
  onLoad(game, { trial = true } = {}) {
    checkState(game.content, game.state);
    if (!trial || game.state.outcome) return; // a finished game is only looked at
    try {
      const probe = new Game(game.content, clone(game.state));
      do probe.tick();
      while (!isMonthEnd(probe.state.day) && !probe.state.outcome);
    } catch (error) {
      throw damaged(`trial month: ${error?.message ?? error}`);
    }
  },
};
