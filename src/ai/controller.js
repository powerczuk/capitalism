// The AI controller: gives every computer-run company a turn each day and
// lets its behaviour modules run when their cadence says so.
//
// A module is `{ id, order, run?(ctx), propose?(ctx), projectKind? }`:
//   run      routine work (re-pricing, restocking decisions, book-keeping)
//   propose  returns investment projects; the `invest` module compares the
//            proposals of all modules and funds the best ones
//
// Modules never touch the state directly — they call `ctx.act(command, params)`,
// which is `game.exec` for their company.

import { marketSnapshot } from '../sim/market.js';
import { creditLimit } from '../sim/accounting.js';
import { externalNeeds, fixedCosts, usableSources } from './analysis.js';

const MIN_RESERVE = 600_000;

export class AiContext {
  constructor(game, co) {
    this.game = game;
    this.co = co;
    this.profile = game.content.difficulties.get(co.ai.level);
    this.persona = game.content.personalities.get(co.ai.persona);
    this.rng = game.rng;
    this.mem = co.ai.mem;
    if (this.mem.markup == null) {
      this.mem.markup = this.rng.range(this.profile.markup[0], this.profile.markup[1]);
    }
    this.markup = this.mem.markup;
    this.reset();
  }

  /** Forget memoised analysis (call after the world was changed). */
  reset() {
    this._snaps = new Map();
    this._sources = new Map();
    this._lineFree = new Map();
    this._fixed = null;
    this._needs = null;
  }

  snapshot(cityId, productId) {
    const key = `${cityId}|${productId}`;
    let snap = this._snaps.get(key);
    if (!snap) this._snaps.set(key, (snap = marketSnapshot(this.game, cityId, productId)));
    return snap;
  }

  sources(cityId, productId) {
    const key = `${cityId}|${productId}`;
    let list = this._sources.get(key);
    if (!list) this._sources.set(key, (list = usableSources(this.game, this.co, cityId, productId)));
    return list;
  }

  /** Drop the cached snapshot of one market (after changing a shelf there). */
  touchMarket(cityId, productId) {
    this._snaps.delete(`${cityId}|${productId}`);
  }

  /** What the company buys from outside, per product (memoised). */
  needs() {
    return (this._needs ??= externalNeeds(this));
  }

  /** Units per day a source can still deliver (tracks reservations made this turn). */
  lineFree(source) {
    if (source.kind === 'import') return Infinity;
    const known = this._lineFree.get(source.src);
    return known ?? source.free;
  }

  reserveLine(source, units) {
    if (source.kind === 'import') return;
    this._lineFree.set(source.src, Math.max(0, this.lineFree(source) - units));
  }

  /** Multiplicative forecast error of this difficulty level. */
  noise() {
    return this.rng.noise(this.profile.noise);
  }

  catWeight(product) {
    return this.persona.cats[product.category] ?? 1;
  }

  /** Execute a command for this company. */
  act(type, params) {
    const result = this.game.exec(this.co.id, type, params);
    const log = this.game.aiLog;
    if (log) log.push({ day: this.game.state.day, co: this.co.name, type, params, ok: result.ok, error: result.error });
    return result;
  }

  // --- money ---------------------------------------------------------------

  fixedCosts() {
    return (this._fixed ??= fixedCosts(this.game, this.co));
  }

  /** Cash the company keeps for a rainy day. */
  reserve() {
    const months = this.profile.reserveMonths / this.persona.w.risk;
    return Math.max(MIN_RESERVE, months * this.fixedCosts());
  }

  freeCash() {
    return this.co.cash - this.reserve();
  }

  /** How much more this company is willing to borrow. */
  borrowRoom() {
    const leverage = Math.min(0.9, this.profile.maxLeverage * this.persona.w.risk);
    if (leverage <= 0) return 0;
    return Math.max(0, leverage * creditLimit(this.game, this.co) - this.co.loan);
  }

  /** Money available for one investment right now. */
  budget() {
    return Math.max(0, this.freeCash()) * this.profile.investShare + this.borrowRoom();
  }

  /** Make sure `amount` can be paid, borrowing if the level allows it. */
  fund(amount) {
    const spare = this.co.cash - this.reserve();
    if (spare >= amount) return true;
    const need = Math.ceil((amount - Math.max(0, spare)) / 10_000) * 10_000;
    if (need <= this.borrowRoom() && this.co.cash + need >= amount) {
      return this.act('borrow', { amount: need }).ok;
    }
    return this.co.cash - amount >= this.reserve() * 0.5;
  }

  /**
   * Pick from options sorted best-first. Weaker levels sometimes settle for
   * one of the runners-up.
   */
  pick(options) {
    if (!options.length) return null;
    if (options.length > 1 && this.rng.chance(this.profile.blunder)) {
      return options[this.rng.int(0, Math.min(2, options.length - 1))];
    }
    return options[0];
  }
}

/** Give one computer-run company its daily turn. */
export function runCompany(game, co, modules) {
  const ctx = new AiContext(game, co);
  const { mem, profile, rng } = ctx;
  const day = game.state.day;
  mem.next ||= {};
  for (const module of modules) {
    if (!module.run) continue;
    const cadence = profile.cadence[module.id];
    if (!cadence) continue;
    if (mem.next[module.id] == null) {
      mem.next[module.id] = day + (module.eager ? rng.int(1, 4) : rng.int(2, Math.max(3, cadence)));
    }
    if (day < mem.next[module.id]) continue;
    mem.next[module.id] = day + Math.max(1, Math.round(cadence * rng.range(0.85, 1.15)));
    if (!co.alive) return;
    module.run(ctx);
    ctx.reset();
  }
}
