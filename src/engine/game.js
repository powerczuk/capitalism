// Game = one running world: a plain serialisable `state` object plus the
// machinery that advances it (systems) and changes it on request (commands).
//
//   const game = Game.create(content, { seed: 'abc', rivals: [...] });
//   game.exec(companyId, 'build', { type: 'supermarket', city: 'c1', district: 'center' });
//   game.tick();                       // one simulated day
//   const save = game.save();          // JSON-safe snapshot
//   const again = Game.load(content, save);
//
// Human players and AI players change the world through exactly the same
// `exec()` door, so the AI cannot cheat and every rule lives in one place.

import { EventBus } from './events.js';
import { Rng } from './rng.js';
import { clone, hashString, own } from './util.js';
import { isMonthEnd, isYearEnd } from './calendar.js';

export const SAVE_VERSION = 1;
const MAX_NEWS = 160;

export class Game {
  constructor(content, state) {
    if (!content.finalized) content.finalize();
    this.content = content;
    this.state = state;
    this.bus = new EventBus();
    this.rng = new Rng(state, 'rng');
    this.systems = content.systemList;
    this._index = null;
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /** Start a new world. `options` are normalised by the systems' `setup` hooks. */
  static create(content, options = {}) {
    if (!content.finalized) content.finalize();
    const seedText = options.seed != null && options.seed !== '' ? String(options.seed) : String(Math.floor(Math.random() * 1e9));
    const state = {
      v: SAVE_VERSION,
      day: 0,
      rng: hashString(seedText) || 1,
      nextId: 1,
      settings: { ...options, seed: seedText },
      cities: {},
      cityOrder: [],
      companies: {},
      companyOrder: [],
      buildings: {},
      modifiers: [],
      news: [],
      outcome: null,
    };
    const game = new Game(content, state);
    for (const system of game.systems) system.setup?.(game);
    game.bus.emit('created', game);
    return game;
  }

  /**
   * Restore a world from `save()` output. Systems may inspect the save in
   * their `onLoad(game, options)` hook and throw to refuse it.
   * `options.trial: false` skips the slow part of the built-in check (a month
   * played on a copy) — for tools that load their own save many times over.
   */
  static load(content, data, options = {}) {
    const state = data?.state ?? data;
    if (!state || typeof state !== 'object' || !state.companies || !state.cities) {
      throw new Error('save.invalid');
    }
    if (state.v !== SAVE_VERSION) throw new Error('save.version');
    const game = new Game(content, clone(state));
    for (const system of game.systems) system.onLoad?.(game, options);
    return game;
  }

  /** JSON-safe snapshot of the whole world. */
  save() {
    return { v: SAVE_VERSION, day: this.state.day, state: clone(this.state) };
  }

  /** Advance the world by one day. */
  tick() {
    const { state } = this;
    state.day += 1;
    for (const system of this.systems) system.daily?.(this);
    if (isMonthEnd(state.day)) {
      for (const system of this.systems) system.monthly?.(this);
      this.bus.emit('month', state.day);
    }
    if (isYearEnd(state.day)) {
      for (const system of this.systems) system.yearly?.(this);
      this.bus.emit('year', state.day);
    }
    this.bus.emit('tick', state.day);
  }

  /** Run `days` ticks (headless helper for tests and balance scripts). */
  run(days) {
    for (let i = 0; i < days; i++) this.tick();
    return this;
  }

  // ---------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------

  /**
   * Execute a command on behalf of a company.
   * @returns {{ok: true, [k: string]: any} | {ok: false, error: string, params?: object}}
   */
  exec(companyId, type, params = {}) {
    const checked = this.can(companyId, type, params);
    if (!checked.ok) return checked;
    const command = this.content.commands.get(type);
    const company = this.state.companies[companyId];
    const result = command.run(this, company, params) || {};
    this.bus.emit('command', { companyId, type, params, result });
    return { ok: true, ...result };
  }

  /** Validate a command without executing it. */
  can(companyId, type, params = {}) {
    const command = this.content.commands.find(type);
    if (!command) return fail('err.unknownCommand', { type });
    const company = own(this.state.companies, companyId);
    if (!company || !company.alive) return fail('err.noCompany');
    if (params === null || typeof params !== 'object') return fail('err.badValue');
    const problem = command.check?.(this, company, params);
    return problem && problem.ok === false ? problem : { ok: true };
  }

  // ---------------------------------------------------------------------
  // State helpers
  // ---------------------------------------------------------------------

  newId(prefix) {
    return `${prefix}${this.state.nextId++}`;
  }

  /**
   * Record a news item. Text is resolved at display time from `key` +
   * `params`, so switching language also translates old news.
   * @param {string} key i18n key, e.g. 'news.bankrupt'
   * @param {object} params values for the message (ids are resolved by the UI)
   * @param {{tone?: 'info'|'good'|'bad', co?: string|null}} [opts] `co` = company the item concerns
   */
  news(key, params = {}, { tone = 'info', co = null } = {}) {
    const item = { d: this.state.day, k: key, p: params, t: tone, co };
    const list = this.state.news;
    list.push(item);
    if (list.length > MAX_NEWS) list.splice(0, list.length - MAX_NEWS);
    this.bus.emit('news', item);
    return item;
  }

  company(id) {
    return this.state.companies[id];
  }

  /** Living companies in creation order. */
  companies() {
    const { companies, companyOrder } = this.state;
    const out = [];
    for (const id of companyOrder) if (companies[id].alive) out.push(companies[id]);
    return out;
  }

  cities() {
    const { cities, cityOrder } = this.state;
    return cityOrder.map((id) => cities[id]);
  }

  /** The human player's company (or null in an all-AI game). */
  get human() {
    const id = this.state.humanId;
    return id ? this.state.companies[id] : null;
  }

  // Building indexes -----------------------------------------------------

  get index() {
    if (this._index) return this._index;
    const byCompany = new Map();
    const byCity = new Map();
    const producers = [];
    for (const b of Object.values(this.state.buildings)) {
      if (b.kind === 'producer') producers.push(b);
      let list = byCompany.get(b.co);
      if (!list) byCompany.set(b.co, (list = []));
      list.push(b);
      list = byCity.get(b.city);
      if (!list) byCity.set(b.city, (list = []));
      list.push(b);
    }
    return (this._index = { byCompany, byCity, producers });
  }

  /** Must be called whenever a building is added, removed or changes owner. */
  invalidate() {
    this._index = null;
  }

  buildingsOf(companyId) {
    return this.index.byCompany.get(companyId) ?? EMPTY;
  }

  buildingsIn(cityId) {
    return this.index.byCity.get(cityId) ?? EMPTY;
  }

  /** All farms, mines and factories of every company. */
  producers() {
    return this.index.producers;
  }

  /** True once the building has finished construction. */
  isReady(building) {
    return building.ready <= this.state.day;
  }
}

const EMPTY = Object.freeze([]);

/** Build a failed command result. */
export function fail(error, params) {
  return { ok: false, error, params };
}
