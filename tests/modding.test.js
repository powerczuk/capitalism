// Runs the examples from docs/MODDING.md, so the guide cannot drift from the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { fail } from '../src/engine/game.js';
import { dateOf } from '../src/engine/calendar.js';
import { addModifier, modifier } from '../src/sim/world.js';
import { goalStatus } from '../src/sim/goals.js';
import { html } from '../src/ui/dom.js';
import { ACTIONS, registerActions } from '../src/ui/views/index.js';

const docsMod = {
  id: 'docs-examples',
  install(content) {
    content.products.register({
      id: 'pasta',
      type: 'consumer',
      category: 'food',
      icon: '🍝',
      name: { pl: 'Makaron', en: 'Pasta' },
      spend: 20,
      weights: { price: 0.5, quality: 0.35, brand: 0.15 },
      necessity: 0.9,
      techShare: 0.3,
      weight: 0.5,
    });
    content.recipes.register({ id: 'pasta', building: 'factory', output: 'pasta', inputs: { flour: 0.5 }, cost: 0.3 });

    content.buildingTypes.register({
      id: 'drugstore',
      kind: 'retail',
      icon: '💊',
      name: { pl: 'Drogeria', en: 'Drugstore' },
      desc: { pl: 'Sprzedaje chemię i kosmetyki.', en: 'Sells household goods.' },
      cost: 3_500_000,
      upkeep: 70_000,
      buildDays: 30,
      slots: 3,
      capacity: 12_000,
      categories: ['household'],
      districts: ['center', 'residential'],
    });

    content.worldEvents.register({
      id: 'heatwave',
      weight: 2,
      cooldown: 720,
      when: (game) => game.state.economy.phase !== 'recession',
      fire(game) {
        addModifier(game, { kind: 'demand', key: 'juice', factor: 1.5, days: 90, source: 'heatwave' });
        game.news('news.event.heatwave', {}, { tone: 'good' });
      },
    });
    content.translate('pl', { 'news.event.heatwave': 'Fala upałów: soki schodzą na pniu.' });
    content.translate('en', { 'news.event.heatwave': 'Heatwave: juice flies off the shelves.' });

    content.goals.register({
      id: 'tenStores',
      name: { pl: 'Dziesięć sklepów', en: 'Ten stores' },
      desc: { pl: 'Otwórz dziesięć sklepów.', en: 'Open ten stores.' },
      check(game, company) {
        const n = game.buildingsOf(company.id).filter((b) => b.kind === 'retail').length;
        return { progress: Math.min(1, n / 10), done: n >= 10 };
      },
    });

    content.tune({ tax: { rate: 0.12 } });

    content.systems.register({
      id: 'seasons',
      order: 12,
      daily(game) {
        const d = dateOf(game.state.day);
        if (d.month === 11 && d.dom === 1) {
          addModifier(game, { kind: 'demand', key: 'toys', factor: 1.6, days: 30, source: 'seasons' });
        }
      },
    });

    content.commands.register({
      id: 'donate',
      check(game, company, { amount }) {
        if (!(amount > 0)) return fail('err.badValue');
        if (company.cash < amount) return fail('err.noCash', { need: amount });
        return null;
      },
      run(game, company, { amount }) {
        company.cash -= amount;
        company.m.other -= amount;
        return {};
      },
    });

    const tycoon = content.difficulties.get('tycoon');
    content.difficulties.register({
      ...tycoon,
      id: 'legend',
      rank: 5,
      name: { pl: 'Legenda', en: 'Legend' },
      desc: { pl: 'Magnat bez żadnych błędów.', en: 'A tycoon who never errs.' },
      noise: 0,
      maxProjects: 4,
      cadence: { ...tycoon.cadence, pricing: 3 },
    });

    content.aiModules.register({
      id: 'generous',
      order: 115,
      run(ctx) {
        if (ctx.freeCash() > ctx.reserve() * 5) ctx.act('setDividend', { ratio: 0.3 });
      },
    });
    const shark = content.difficulties.get('shark');
    content.difficulties.extend('shark', { cadence: { ...shark.cadence, generous: 90 } });

    content.views.register({
      id: 'charity',
      order: 85,
      icon: 'info',
      label: 'nav.charity',
      render() {
        return html`<div class="view"><button class="btn btn-primary" data-act="donate100">100</button></div>`;
      },
    });
    registerActions({
      donate100(app) {
        app.cmd('donate', { amount: 100_000 });
      },
    });
    content.translate('pl', { 'nav.charity': 'Dobroczynność' });
    content.translate('en', { 'nav.charity': 'Charity' });
  },
};

const content = createContent({ mods: [docsMod] });

test('docs: product and recipe example', () => {
  const pasta = content.products.get('pasta');
  assert.ok(pasta.cost > 0 && pasta.price > pasta.cost && pasta.demand > 0);
  assert.ok(content.recipes.get('pasta').rate > 0);
});

test('docs: building, goal, command, system and event examples work in a game', () => {
  const game = Game.create(content, { seed: 'docs', cityCount: 3, goal: 'tenStores', player: { name: 'Ja' }, rivals: [{ level: 'legend' }, { level: 'shark' }] });
  const me = game.human;
  const city = game.cities()[0];

  const store = game.exec(me.id, 'build', { type: 'drugstore', city: city.id, district: 'residential' });
  assert.ok(store.ok);
  assert.equal(game.exec(me.id, 'setSlot', { building: store.building, slot: 0, product: 'bread' }).error, 'err.wrongCategory');
  assert.ok(game.exec(me.id, 'setSlot', { building: store.building, slot: 0, product: 'shampoo' }).ok);
  assert.equal(goalStatus(game).progress, 0.1);

  const cash = me.cash;
  assert.equal(game.exec(me.id, 'donate', { amount: -5 }).error, 'err.badValue');
  assert.equal(game.exec(me.id, 'donate', { amount: 1e12 }).error, 'err.noCash');
  assert.ok(game.exec(me.id, 'donate', { amount: 1000 }).ok);
  assert.equal(me.cash, cash - 1000);

  content.worldEvents.get('heatwave').fire(game);
  assert.equal(modifier(game.state, 'demand', 'juice'), 1.5);

  game.run(335); // into December of the first year
  assert.equal(modifier(game.state, 'demand', 'toys'), 1.6);
  game.run(400);
  const legend = game.state.companyOrder.map((id) => game.state.companies[id]).find((c) => c.ai?.level === 'legend');
  assert.ok(game.buildingsOf(legend.id).length > 0, 'the new difficulty level plays');
  assert.equal(content.balance.tax.rate, 0.12);
});

test('docs: registering in one content does not leak into another', () => {
  const plain = createContent({ mods: [] });
  assert.equal(plain.difficulties.has('legend'), false);
  assert.equal(plain.difficulties.get('shark').cadence.generous, undefined);
  assert.equal(plain.balance.tax.rate, 0.19);
  assert.equal(plain.products.has('pasta'), false);
});

test('docs: view and action example', () => {
  assert.ok(content.views.has('charity'));
  assert.equal(typeof ACTIONS.donate100, 'function');
  assert.match(String(content.views.get('charity').render()), /data-act="donate100"/);
  assert.equal(content.locales.pl['nav.charity'], 'Dobroczynność');
});
