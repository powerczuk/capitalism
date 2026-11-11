import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createContent, Game } from '../src/setup.js';
import { pl } from '../src/i18n/pl.js';
import { en } from '../src/i18n/en.js';
import { coffeeMod } from '../src/mods/coffee.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const content = createContent();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

const sources = walk(join(root, 'src')).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const allStrings = { pl: { ...pl, ...(content.locales.pl || {}) }, en: { ...en, ...(content.locales.en || {}) } };

test('content: every consumer product can be sold, sourced and earns a margin', () => {
  const B = content.balance;
  for (const product of content.consumerProducts) {
    assert.ok(content.buildingTypes.filter((t) => t.kind === 'retail' && t.categories.includes(product.category)).length > 0, `${product.id}: some store sells it`);
    assert.ok(product.importable || content.recipesFor(product.id).length > 0, `${product.id}: can be obtained`);
    assert.ok(product.price > product.cost * B.import.markup * 1.1, `${product.id}: retail price leaves a margin over imports`);
    assert.ok(product.name.pl && product.name.en && product.icon, `${product.id}: has names and an icon`);
  }
});

test('content: every recipe is cheaper than importing its output', () => {
  const B = content.balance;
  for (const recipe of content.recipes.all()) {
    const output = content.products.get(recipe.output);
    let cost = recipe.cost;
    for (const [id, per] of Object.entries(recipe.inputs)) cost += per * content.products.get(id).cost * B.import.markup;
    assert.ok(cost < output.cost * B.import.markup, `${recipe.id}: making (${cost.toFixed(2)}) beats importing (${(output.cost * B.import.markup).toFixed(2)})`);
    assert.ok(recipe.rate > 0);
  }
});

test('content: definitions carry names in both languages', () => {
  const named = [
    ...content.categories.all(),
    ...content.products.all(),
    ...content.buildingTypes.all(),
    ...content.districts.all(),
    ...content.cityArchetypes.all(),
    ...content.goals.all(),
    ...content.difficulties.all(),
    ...content.personalities.all(),
  ];
  for (const def of named) assert.ok(def.name?.pl && def.name?.en, `${def.id} has a name in pl and en`);
});

test('mods: the coffee example plugs in and out cleanly', () => {
  assert.ok(content.products.has('coffee'));
  assert.ok(content.recipes.get('coffee').rate > 0);
  assert.ok(content.products.get('coffee').price > 0, 'price was derived from the recipe');
  const without = createContent({ mods: [] });
  assert.equal(without.products.has('coffee'), false);
  // A game without the mod still runs.
  Game.create(without, { seed: 'no-mods', player: null, rivals: [{ level: 'manager' }] }).run(200);
  // Installing twice is harmless.
  const twice = createContent({ mods: [coffeeMod, coffeeMod] });
  assert.equal(twice.products.filter((p) => p.id === 'coffee').length, 1);
  // The mod's event can fire.
  const game = Game.create(content, { seed: 'coffee', player: null, rivals: [] });
  content.worldEvents.get('coffeeFrost').fire(game);
  assert.ok(game.state.modifiers.some((m) => m.key === 'coffee_beans'));
  assert.equal(game.state.news.at(-1).k, 'news.event.coffeeFrost');
});

test('i18n: both languages have the same keys, placeholders and plural shapes', () => {
  const plKeys = Object.keys(pl);
  const enKeys = Object.keys(en);
  assert.deepEqual(plKeys.filter((k) => !(k in en)), [], 'keys missing in en');
  assert.deepEqual(enKeys.filter((k) => !(k in pl)), [], 'keys missing in pl');
  const holes = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
  for (const key of plKeys) {
    assert.deepEqual(holes(en[key]), holes(pl[key]), `placeholders of "${key}"`);
    if (key.startsWith('n.')) {
      assert.equal(pl[key].split('|').length, 3, `${key}: Polish needs one|few|many`);
      assert.equal(en[key].split('|').length, 2, `${key}: English needs one|other`);
    }
  }
});

test('i18n: every text key used in the code exists', () => {
  const used = new Set();
  // Literal keys: t('…'), tn('…'), label: '…', and keys inside conditional expressions.
  for (const { text } of sources.filter((s) => s.path.includes(`${join('src', 'ui')}`))) {
    for (const m of text.matchAll(/\bt[n]?\(\s*'([\w.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/label: '([\w.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/[?:]\s*'((?:[a-z]+\.)[\w.]+)'/g)) used.add(m[1]);
  }
  // Keys produced by the simulation.
  for (const { text } of sources) {
    for (const m of text.matchAll(/fail\('([\w.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/news\(\s*'([\w.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/code: '(\w+)'/g)) used.add(`diag.${m[1]}`);
  }
  // Key families built at run time.
  for (const phase of ['boom', 'recession', 'recovery', 'slowdown']) used.add(`phase.${phase}`).add(`news.economy.${phase}`);
  for (let i = 0; i < 12; i++) used.add(`month.short.${i}`);
  for (let i = 0; i <= 4; i++) used.add(`speed.${i}`);
  for (const kind of ['retail', 'producer', 'research']) used.add(`kind.${kind}`);
  for (const type of ['raw', 'intermediate', 'consumer']) used.add(`ptype.${type}`);
  for (const key of ['retail', 'b2b', 'cogs', 'gross', 'opex', 'ads', 'rnd', 'depr', 'interest', 'divIn', 'invest', 'other', 'tax', 'profit']) used.add(`ledger.${key}`);
  for (const mode of ['buy', 'sell', 'issue', 'buyback']) {
    used.add(`trade.${mode}.title`).add(`trade.${mode}.note`).add(`trade.${mode}.go`).add(`toast.trade.${mode}`);
  }
  for (const theme of ['system', 'light', 'dark']) used.add(`menu.theme.${theme}`);
  for (const id of ['start', 'stores', 'prices', 'supply', 'factories', 'quality', 'brand', 'money', 'stocks', 'rivals', 'keys']) {
    used.add(`guide.${id}.title`).add(`guide.${id}.text`);
  }
  for (const id of ['rich', 'standard', 'tight']) used.add(`start.capital.${id}`);
  for (const n of [3, 4, 5, 6]) used.add(`start.cities.${n}`);
  for (const reason of ['bankrupt', 'takeover', 'goal']) used.add(`outcome.lost.${reason}`);
  for (const unit of ['k', 'm', 'bn']) used.add(`unit.${unit}`);
  used.add('news.stake').add('save.invalid').delete('save.invalid');

  const missing = [...used].filter((key) => !(key in allStrings.pl)).sort();
  assert.deepEqual(missing, [], 'keys used in code but missing from src/i18n/pl.js');
});
