// Content = everything the game is made of, held in registries.
//
// The engine itself knows nothing about bread, factories or stock markets.
// Plugins (the base game and any mods) fill these registries; `finalize()`
// then derives missing numbers and validates cross references, so a typo in
// a mod fails loudly at start-up instead of corrupting a running game.

import { Registry } from './registry.js';
import { roundSig } from './util.js';

export class Content {
  constructor() {
    /** Tunable numbers of the simulation; plugins merge into it via `tune()`. */
    this.balance = {};

    // --- game data -------------------------------------------------------
    this.categories = new Registry('category'); // product categories
    this.products = new Registry('product');
    this.recipes = new Registry('recipe');
    this.buildingTypes = new Registry('building type');
    this.districts = new Registry('district');
    this.cityArchetypes = new Registry('city archetype');
    this.worldEvents = new Registry('world event');
    this.goals = new Registry('goal');
    this.companyTemplates = new Registry('company template');

    // --- rules -----------------------------------------------------------
    this.systems = new Registry('system');
    this.commands = new Registry('command');

    // --- artificial players ---------------------------------------------
    this.difficulties = new Registry('AI difficulty');
    this.personalities = new Registry('AI personality');
    this.aiModules = new Registry('AI module');

    // --- presentation (only used by the browser UI) ----------------------
    this.views = new Registry('view');
    this.locales = {}; // { pl: { key: text }, en: {...} } extra UI strings from plugins

    this.plugins = [];
    this.finalized = false;
  }

  /**
   * Install a plugin: `{ id, install(content) }`.
   * Installing the same plugin id twice is a no-op.
   */
  use(plugin) {
    if (!plugin || typeof plugin.install !== 'function' || !plugin.id) {
      throw new Error('A plugin must look like { id, install(content) {...} }');
    }
    if (this.plugins.includes(plugin.id)) return this;
    plugin.install(this);
    this.plugins.push(plugin.id);
    this.finalized = false;
    return this;
  }

  /** Deep-merge tunable numbers into `content.balance`. */
  tune(patch, target = this.balance) {
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = this.tune(value, target[key] && typeof target[key] === 'object' ? target[key] : {});
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  /** Add UI strings for a locale (plugins can ship their own translations). */
  translate(locale, strings) {
    this.locales[locale] = { ...(this.locales[locale] || {}), ...strings };
    return this;
  }

  // ---------------------------------------------------------------------
  // Derivation + validation
  // ---------------------------------------------------------------------

  finalize() {
    const B = this.balance;
    const problems = [];

    // Index recipes by output product.
    this.recipesByOutput = new Map();
    for (const recipe of this.recipes.all()) {
      if (!this.products.has(recipe.output)) {
        problems.push(`recipe "${recipe.id}" outputs unknown product "${recipe.output}"`);
        continue;
      }
      for (const input of Object.keys(recipe.inputs || {})) {
        if (!this.products.has(input)) problems.push(`recipe "${recipe.id}" uses unknown product "${input}"`);
      }
      const type = this.buildingTypes.find(recipe.building);
      if (!type) problems.push(`recipe "${recipe.id}" needs unknown building type "${recipe.building}"`);
      else if (type.kind !== 'producer') problems.push(`recipe "${recipe.id}": building "${type.id}" is not a producer`);
      recipe.inputs ||= {};
      const list = this.recipesByOutput.get(recipe.output);
      if (list) list.push(recipe);
      else this.recipesByOutput.set(recipe.output, [recipe]);
    }
    if (problems.length) throw new Error('Invalid content:\n - ' + problems.join('\n - '));

    // Derive wholesale reference cost through the supply chain.
    const visiting = new Set();
    const costOf = (id) => {
      const p = this.products.get(id);
      if (p.cost != null && !p._derivedCost) return p.cost;
      if (p._derivedCost && p._costDone) return p.cost;
      if (visiting.has(id)) throw new Error(`Invalid content: product "${id}" is part of a recipe cycle and has no explicit cost`);
      const recipe = this.recipesByOutput.get(id)?.[0];
      if (!recipe) throw new Error(`Invalid content: product "${id}" has neither a cost nor a recipe`);
      visiting.add(id);
      let inputs = 0;
      for (const [input, per] of Object.entries(recipe.inputs)) inputs += per * costOf(input);
      visiting.delete(id);
      p.cost = roundSig((inputs + (recipe.cost ?? 0)) * (B.chainMargin ?? 1.3), 3);
      p._derivedCost = true;
      p._costDone = true;
      return p.cost;
    };

    for (const p of this.products.all()) {
      if (!['raw', 'intermediate', 'consumer'].includes(p.type)) {
        problems.push(`product "${p.id}" has invalid type "${p.type}"`);
        continue;
      }
      if (p._derivedCost) p._costDone = false;
    }
    for (const p of this.products.all()) costOf(p.id);

    for (const p of this.products.all()) {
      p.weight ??= 1;
      p.importable ??= true;
      p.techShare ??= p.type === 'raw' ? 0 : 0.5;
      if (p.type !== 'consumer') continue;
      const category = this.categories.find(p.category);
      if (!category) problems.push(`consumer product "${p.id}" has unknown category "${p.category}"`);
      if (p.price == null || p._derivedPrice) {
        p.price = roundSig(p.cost * (p.markup ?? category?.markup ?? 2), 3);
        p._derivedPrice = true;
      }
      // `spend` = consumer spending in $ per 1000 inhabitants per day.
      if (p.demand == null || p._derivedDemand) {
        if (p.spend == null) problems.push(`consumer product "${p.id}" needs "spend" or "demand"`);
        p.demand = (p.spend ?? 0) / p.price;
        p._derivedDemand = true;
      }
      const w = p.weights || { price: 0.4, quality: 0.35, brand: 0.25 };
      const total = w.price + w.quality + w.brand;
      p.weights = { price: w.price / total, quality: w.quality / total, brand: w.brand / total };
      p.necessity ??= 0.5;
      const sellers = this.buildingTypes.filter((t) => t.kind === 'retail' && t.categories?.includes(p.category));
      if (!sellers.length) problems.push(`no retail building sells category "${p.category}" (product "${p.id}")`);
    }

    // Recipe defaults: processing cost and daily rate per production line.
    for (const recipe of this.recipes.all()) {
      const out = this.products.get(recipe.output);
      const isRaw = Object.keys(recipe.inputs).length === 0;
      if (recipe.cost == null || recipe._derivedCost) {
        recipe.cost = roundSig(out.cost * (B.production?.rawCostShare ?? 0.55), 3);
        recipe._derivedCost = true;
      }
      if (recipe.rate == null || recipe._derivedRate) {
        const value = B.production?.lineValue?.[out.type] ?? 12000;
        recipe.rate = roundSig(value / out.cost, 2);
        recipe._derivedRate = true;
      }
      recipe.raw = isRaw;
      if (isRaw && out.type !== 'raw') problems.push(`recipe "${recipe.id}" has no inputs but "${out.id}" is not a raw material`);
    }

    for (const type of this.buildingTypes.all()) {
      if (!['retail', 'producer', 'research'].includes(type.kind)) {
        problems.push(`building type "${type.id}" has invalid kind "${type.kind}"`);
      }
      for (const d of type.districts || []) {
        if (!this.districts.has(d)) problems.push(`building type "${type.id}" refers to unknown district "${d}"`);
      }
      type.maxLevel ??= 3;
    }

    if (problems.length) throw new Error('Invalid content:\n - ' + problems.join('\n - '));

    // Handy pre-computed lists.
    this.consumerProducts = this.products.filter((p) => p.type === 'consumer');
    this.systemList = [...this.systems.all()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.finalized = true;
    return this;
  }

  /** Recipes that produce the given product. */
  recipesFor(productId) {
    return this.recipesByOutput?.get(productId) ?? [];
  }
}
