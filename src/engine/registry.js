// A Registry is a named collection of definitions keyed by `id`.
// Everything that can be extended in the game (products, recipes, building
// types, simulation systems, commands, AI modules, difficulty levels, ...)
// lives in a registry, so a mod only ever needs `registry.register({...})`.

export class Registry {
  /** @param {string} kind human-readable name used in error messages */
  constructor(kind) {
    this.kind = kind;
    this.map = new Map();
    this._list = null;
  }

  /**
   * Add a definition. Throws on duplicate ids unless `override` is set —
   * silent replacement is the classic way two mods break each other.
   */
  register(def, { override = false } = {}) {
    if (!def || typeof def.id !== 'string' || !def.id) {
      throw new Error(`${this.kind}: definition needs a string "id"`);
    }
    if (this.map.has(def.id) && !override) {
      throw new Error(`${this.kind} "${def.id}" is already registered (pass { override: true } to replace it)`);
    }
    this.map.set(def.id, def);
    this._list = null;
    return def;
  }

  registerAll(defs, options) {
    for (const def of defs) this.register(def, options);
    return this;
  }

  /** Patch an existing definition in place (e.g. a mod rebalancing a product). */
  extend(id, patch) {
    return Object.assign(this.get(id), patch);
  }

  remove(id) {
    this._list = null;
    return this.map.delete(id);
  }

  /** Strict lookup: throws when the id is unknown. */
  get(id) {
    const def = this.map.get(id);
    if (!def) throw new Error(`Unknown ${this.kind}: "${id}"`);
    return def;
  }

  /** Lenient lookup: returns undefined when the id is unknown. */
  find(id) {
    return this.map.get(id);
  }

  has(id) {
    return this.map.has(id);
  }

  /** All definitions in registration order (cached array — do not mutate). */
  all() {
    return (this._list ??= [...this.map.values()]);
  }

  ids() {
    return [...this.map.keys()];
  }

  filter(fn) {
    return this.all().filter(fn);
  }

  get size() {
    return this.map.size;
  }
}
