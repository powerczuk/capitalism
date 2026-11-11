// The plan of a city (src/geo): the same for the same city, with room for
// every plot the rules can hand out, nothing on top of anything else, and
// plots that stay put while the city grows.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { MODS } from '../src/mods/index.js';
import { builtShare, cityPlan, plotCaps } from '../src/geo/cityPlan.js';
import { planSvg } from '../src/geo/planSvg.js';
import { plotsOf } from '../src/sim/world.js';

const content = createContent();

/** Cities of a few generated countries: every archetype, with and without a port. */
const worlds = ['plan-a', 'plan-b', 'plan-c'].map((seed) => {
  const game = Game.create(content, { seed, cityCount: 6, player: { name: 'Plan', color: 1 }, rivals: [], events: false });
  return { seed, game, cities: game.cities() };
});
const all = worlds.flatMap(({ seed, cities }) => cities.map((city) => ({ seed, cities, city, plan: cityPlan(content, city, { seed, cities }) })));

/** The ground a plot or parcel covers (turned ones swap width and depth). */
function box(r) {
  const turned = Math.abs(Math.sin(r.ry ?? 0)) > 0.5;
  const w = turned ? r.d : r.w;
  const d = turned ? r.w : r.d;
  return { x0: r.x - w / 2, x1: r.x + w / 2, z0: r.z - d / 2, z1: r.z + d / 2 };
}
const EPS = 1e-6;
const overlap = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
const lotsOf = (plan) => Object.entries(plan.lots).flatMap(([district, lots]) => lots.map((lot, k) => ({ ...lot, name: `${district}:${k}` })));

/** Distance from a point to a stretch of road. */
function distance(px, pz, r) {
  const dx = r.x2 - r.x1;
  const dz = r.z2 - r.z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - r.x1) * dx + (pz - r.z1) * dz) / len2)) : 0;
  return Math.hypot(px - (r.x1 + t * dx), pz - (r.z1 + t * dz));
}

test('city plan: every archetype is covered by the sample', () => {
  const seen = new Set(all.map(({ city }) => city.arch));
  for (const arch of content.cityArchetypes.all()) assert.ok(seen.has(arch.id), `${arch.id} occurs in the sample`);
  assert.ok(all.some(({ plan }) => plan.coast), 'a city on the coast');
  assert.ok(all.some(({ plan }) => plan.river), 'a city on a river');
  assert.ok(all.some(({ plan }) => plan.port), 'a harbour');
});

test('city plan: the same city always gets the same plan, another seed another one', () => {
  for (const { seed, cities, city, plan } of all) {
    assert.deepEqual(cityPlan(content, city, { seed, cities }), plan, `${city.name} is planned the same twice`);
  }
  const { cities, city, plan } = all[0];
  assert.notDeepEqual(cityPlan(content, city, { seed: 'something else', cities }).parcels, plan.parcels);
});

test('city plan: room for every plot the rules can hand out', () => {
  for (const { city, plan } of all) {
    const caps = plotCaps(content, city);
    const top = content.cityArchetypes.get(city.arch).pop[1];
    for (const d of content.districts.all()) {
      assert.ok(plan.lots[d.id].length >= caps[d.id], `${city.name}/${d.id}: ${plan.lots[d.id].length} plots planned, ${caps[d.id]} needed`);
      assert.ok(caps[d.id] >= plotsOf(content, city, d.id), `${city.name}/${d.id}: enough for today`);
      assert.ok(caps[d.id] >= plotsOf(content, { ...city, pop: top * 1.6 }, d.id), `${city.name}/${d.id}: enough for a city grown far past its class`);
    }
  }
});

test('city plan: plots keep clear of each other, of the town, of water and of the streets', () => {
  for (const { city, plan } of all) {
    const lots = lotsOf(plan);
    const boxes = lots.map(box);
    for (let i = 0; i < lots.length; i++) {
      const a = boxes[i];
      assert.ok(Math.max(Math.abs(a.x0), Math.abs(a.x1), Math.abs(a.z0), Math.abs(a.z1)) <= plan.size, `${city.name}: ${lots[i].name} lies on the map`);
      for (let j = i + 1; j < lots.length; j++) assert.ok(!overlap(a, boxes[j]), `${city.name}: ${lots[i].name} overlaps ${lots[j].name}`);
      for (const p of [...plan.parcels, ...plan.scenery]) assert.ok(!overlap(a, box(p)), `${city.name}: ${lots[i].name} overlaps a ${p.kind}`);
      if (plan.coast) assert.ok(a.z0 >= plan.coast.z - EPS, `${city.name}: ${lots[i].name} lies in the sea`);
      if (plan.river) {
        const lo = plan.river.at - plan.river.width / 2;
        const hi = plan.river.at + plan.river.width / 2;
        const [from, to] = plan.river.axis === 'x' ? [a.x0, a.x1] : [a.z0, a.z1];
        assert.ok(to <= lo + EPS || from >= hi - EPS, `${city.name}: ${lots[i].name} lies in the river`);
      }
      // the carriageway of a street is 1.3 wide: no plot may reach onto it
      for (const r of plan.roads) {
        if (r.kind === 'track') continue;
        const cx = Math.max(a.x0, Math.min(a.x1, (r.x1 + r.x2) / 2));
        const cz = Math.max(a.z0, Math.min(a.z1, (r.z1 + r.z2) / 2));
        const straight = r.x1 === r.x2 || r.z1 === r.z2;
        if (!straight) continue;
        const roadBox = { x0: Math.min(r.x1, r.x2) - 0.65, x1: Math.max(r.x1, r.x2) + 0.65, z0: Math.min(r.z1, r.z2) - 0.65, z1: Math.max(r.z1, r.z2) + 0.65 };
        if (r.x1 === r.x2) {
          roadBox.z0 += 0.65;
          roadBox.z1 -= 0.65;
        } else {
          roadBox.x0 += 0.65;
          roadBox.x1 -= 0.65;
        }
        assert.ok(!overlap(a, roadBox), `${city.name}: ${lots[i].name} reaches onto a ${r.kind} near (${cx.toFixed(1)}, ${cz.toFixed(1)})`);
      }
    }
  }
});

test('city plan: the parcels of the town do not overlap each other', () => {
  for (const { city, plan } of all) {
    const boxes = plan.parcels.map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(!overlap(boxes[i], boxes[j]), `${city.name}: ${plan.parcels[i].kind} overlaps ${plan.parcels[j].kind}`);
      }
    }
  }
});

test('city plan: every plot fronts a road', () => {
  for (const { city, plan } of all) {
    for (const lot of lotsOf(plan)) {
      // the middle of the front edge, one step out
      const fx = lot.x + Math.sin(lot.ry) * (lot.d / 2 + 1);
      const fz = lot.z + Math.cos(lot.ry) * (lot.d / 2 + 1);
      const nearest = Math.min(...plan.roads.map((r) => distance(fx, fz, r)));
      assert.ok(nearest <= 0.5, `${city.name}: ${lot.name} faces no road (nearest ${nearest.toFixed(2)} away)`);
    }
  }
});

test('city plan: plots stay where they are while the city grows', () => {
  for (const { seed, cities, city, plan } of all.slice(0, 6)) {
    for (const factor of [0.4, 1.7, 3]) {
      const grown = { ...city, pop: Math.round(city.pop * factor) };
      const later = cityPlan(content, grown, { seed, cities });
      assert.deepEqual(later.lots, plan.lots, `${city.name} ×${factor}: plots moved`);
      assert.deepEqual(later.roads, plan.roads, `${city.name} ×${factor}: streets moved`);
    }
    const small = builtShare(content, { ...city, pop: city.pop * 0.5 });
    const big = builtShare(content, { ...city, pop: city.pop * 1.5 });
    assert.ok(small <= big && small >= 0.3 && big <= 1, `${city.name}: a bigger city is more built up (${small} → ${big})`);
  }
});

test('city plan: the parcels of the town are built up in a fixed order', () => {
  for (const { city, plan } of all) {
    for (const p of plan.parcels) assert.ok(p.t >= 0 && p.t <= 1 && typeof p.kind === 'string', `${city.name}: a parcel says when it is built`);
  }
});

test("city plan: a mod's district finds its place by its ring", () => {
  const harbourMod = {
    id: 'plan-test-district',
    install(c) {
      c.districts.register({
        id: 'harbourside', icon: '⚓', traffic: 0.9, cost: 1.1, upkeep: 1, ring: 'inner', plots: { base: 3, per: 500_000 },
        name: { pl: 'Nabrzeże', en: 'Harbourside' },
        desc: { pl: 'Dzielnica przy porcie.', en: 'The district by the harbour.' },
      });
    },
  };
  const modded = createContent({ mods: [...MODS, harbourMod] });
  const game = Game.create(modded, { seed: 'plan-mod', cityCount: 4, player: { name: 'Plan', color: 1 }, rivals: [], events: false });
  for (const city of game.cities()) {
    const plan = cityPlan(modded, city, { seed: 'plan-mod', cities: game.cities() });
    const caps = plotCaps(modded, city);
    for (const d of modded.districts.all()) {
      assert.ok(plan.lots[d.id]?.length >= caps[d.id], `${city.name}/${d.id}: ${plan.lots[d.id]?.length} plots planned, ${caps[d.id]} needed`);
    }
    const boxes = lotsOf(plan).map(box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${city.name}: plots overlap with the extra district`);
  }
});

test('city plan: content the plan does not know still gets a stable plan', () => {
  const { seed, cities, city, plan } = all[0];
  assert.deepEqual(plan.short, {}, 'the base game fits its plan');

  // a district that names a ring the plan has never heard of joins the outer ring
  const oddMod = {
    id: 'plan-test-odd-ring',
    install(c) {
      c.districts.register({
        id: 'oddville', icon: '❓', traffic: 1, cost: 1, upkeep: 1, ring: 'somewhere', plots: { base: 3, per: 500_000 },
        name: { pl: 'Dziwnowo', en: 'Oddville' },
        desc: { pl: 'Dzielnica o nieznanym położeniu.', en: 'A district that lies who knows where.' },
      });
    },
  };
  const odd = createContent({ mods: [...MODS, oddMod] });
  const oddPlan = cityPlan(odd, city, { seed, cities });
  assert.equal(oddPlan.rings.oddville, 'outer');
  assert.ok(oddPlan.lots.oddville.length >= plotCaps(odd, city).oddville, 'and gets its plots');

  // a city whose archetype has left the game keeps one plan however it grows
  const orphan = { ...city, arch: 'no-such-archetype' };
  const small = cityPlan(content, { ...orphan, pop: 900_000 }, { seed, cities });
  const huge = cityPlan(content, { ...orphan, pop: 9_000_000 }, { seed, cities });
  assert.deepEqual(huge.lots, small.lots, 'plots do not move when the population passes any threshold');
  assert.deepEqual(huge.roads, small.roads);

  // content that asks for more than any plan holds says how much is missing instead of failing
  const greedyMod = {
    id: 'plan-test-greedy',
    install(c) {
      c.districts.register({
        id: 'estates', icon: '🌾', traffic: 0.3, cost: 0.5, upkeep: 0.8, ring: 'country', plots: { base: 40, per: 100_000 },
        name: { pl: 'Folwarki', en: 'Estates' },
        desc: { pl: 'Bardzo dużo wielkich działek.', en: 'A great many big plots.' },
      });
    },
  };
  const greedy = createContent({ mods: [...MODS, greedyMod] });
  const greedyPlan = cityPlan(greedy, city, { seed, cities });
  const caps = plotCaps(greedy, city);
  assert.equal(greedyPlan.lots.estates.length + (greedyPlan.short.estates ?? 0), caps.estates, 'what is planned and what is missing add up');
  assert.ok(greedyPlan.short.estates > 0, 'two rings round a town cannot hold that many');
});

test('plan drawing: the picture ends just beyond the town, so plots are as large as they can be', () => {
  for (const { plan } of all.slice(0, 6)) {
    const svg = planSvg(plan, {});
    const [, x, , w] = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/).map(Number);
    assert.ok(w < 2 * plan.size, 'the far country is left out');
    for (const lot of Object.values(plan.lots).flat()) {
      assert.ok(Math.abs(lot.x) + Math.max(lot.w, lot.d) / 2 <= -x + 1e-6 && Math.abs(lot.z) + Math.max(lot.w, lot.d) / 2 <= -x + 1e-6, 'every plot is in the picture');
    }
  }
});

test('plan drawing: free plots can be picked, taken ones show their owner, the rest is hidden', () => {
  const { city, plan } = all[0];
  const free = {};
  for (const d of content.districts.all()) free[d.id] = plotsOf(content, city, d.id);
  const svg = planSvg(plan, {
    free,
    plots: [{ district: 'center', lot: 0, color: '#123456', own: true, id: 'b1', label: 'Sklep <1>' }],
    interactive: true,
    title: city.name,
    lotLabel: (district, lot) => `plot ${lot + 1} of ${district}`,
  });
  const open = Object.values(free).reduce((sum, n) => sum + n, 0);
  assert.equal(svg.match(/data-act="openLot"/g).length, open - 1, 'one clickable rectangle per free plot');
  assert.equal(svg.match(/data-act="openLotBuilding"/g).length, 1);
  assert.ok(svg.includes('fill="#123456"') && svg.includes('Sklep &lt;1&gt;'), 'the building is drawn in its colour, its name escaped');
  assert.ok(svg.includes('<title>plot 2 of center</title>'), 'free plots are named for screen readers');
  const still = planSvg(plan, { free, interactive: false });
  assert.ok(!still.includes('data-act'), 'a plan that is only looked at has nothing to click');
});
