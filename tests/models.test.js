// The 3D models are code, so they can be checked like code: every building
// type has one, every level draws, nothing leaves its plot, nothing is too
// heavy, and the same building always looks the same.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { cityPlan } from '../src/geo/cityPlan.js';
import { Builder } from '../src/ui3d/kit.js';
import { buildModel, hasModel, modelFor, PLOT, plotOf } from '../src/ui3d/models/all.js';
import { PARCELS, parcel } from '../src/ui3d/models/town.js';

const content = createContent();
const BASE = ['supermarket', 'department', 'electronics', 'factory', 'lab', 'farm', 'mine', 'forestry'];

/** Largest overhang beyond the plot, lowest and highest point, and bad numbers of a set of geometries. */
function measure(geometries, lot) {
  let over = -Infinity;
  let low = Infinity;
  let high = -Infinity;
  let bad = 0;
  let vertices = 0;
  for (const [layer, geometry] of Object.entries(geometries)) {
    const p = geometry.attributes.position.array;
    vertices += p.length / 3;
    for (let i = 0; i < p.length; i += 3) {
      if (!Number.isFinite(p[i]) || !Number.isFinite(p[i + 1]) || !Number.isFinite(p[i + 2])) bad++;
      // lamp light may spill over the kerb; everything else has to stay on the plot
      if (layer !== 'pool') over = Math.max(over, Math.abs(p[i]) - lot.w / 2, Math.abs(p[i + 2]) - lot.d / 2);
      low = Math.min(low, p[i + 1]);
      high = Math.max(high, p[i + 1]);
    }
    assert.ok(geometry.index.count % 3 === 0, 'whole triangles');
    for (const k of geometry.index.array) assert.ok(k < p.length / 3, 'indices point at vertices');
  }
  return { over, low, high, bad, vertices };
}

const fingerprint = (geometries) =>
  Object.entries(geometries)
    .map(([layer, g]) => `${layer}:${g.attributes.position.count}:${g.index.count}:${Array.from(g.attributes.position.array.slice(0, 60)).join(',')}`)
    .join('|');

test('models: every building type of the game has a model', () => {
  for (const id of BASE) assert.ok(hasModel(id), `${id} has a model of its own`);
  for (const type of content.buildingTypes.all()) assert.equal(typeof modelFor(type), 'function', `${type.id} can be drawn`);
  for (const kind of ['retail', 'producer', 'research', 'something-new']) {
    const model = buildModel({ id: 'no-such-building', kind }, { lot: PLOT.retail });
    assert.ok(model.triangles > 20, `a building of kind "${kind}" without a model of its own still gets one`);
  }
  assert.equal(modelFor({ id: 'drugstore', kind: 'retail', model: 'supermarket' }), modelFor({ id: 'supermarket' }), 'a type can borrow a model by name');
});

test('models: three levels each, inside the plot, within the triangle budget', () => {
  for (const id of BASE) {
    const lot = plotOf(id);
    const seen = new Set();
    let last = null;
    for (const level of [1, 2, 3]) {
      const model = buildModel(id, { level, lot, seed: 'models-test' });
      const m = measure(model.geometries, lot);
      const name = `${id} level ${level}`;
      assert.ok(model.geometries.solid, `${name} has a body`);
      assert.equal(m.bad, 0, `${name}: every coordinate is a number`);
      assert.ok(m.over <= 0.15, `${name} stays on its plot (reaches ${m.over.toFixed(2)} beyond)`);
      assert.ok(m.low >= -0.2 && m.high > 0.8 && m.high < 12, `${name} stands on the ground and has a sane height (${m.low.toFixed(2)}…${m.high.toFixed(2)})`);
      assert.ok(model.triangles >= 200 && model.triangles <= 4500, `${name}: ${model.triangles} triangles`);
      assert.equal(model.geometries.solid.boundingBox.max.y, m.high >= model.geometries.solid.boundingBox.max.y ? model.geometries.solid.boundingBox.max.y : NaN, `${name}: bounding box is set`);
      seen.add(fingerprint(model.geometries));
      if (last) assert.ok(model.triangles !== last.triangles || m.high !== last.high, `${name} differs from the level below`);
      last = { triangles: model.triangles, high: m.high };
    }
    assert.equal(seen.size, 3, `${id}: three different levels`);
  }
});

test('models: the same building always looks the same, another one may differ', () => {
  for (const id of BASE) {
    const lot = plotOf(id);
    const a = buildModel(id, { level: 2, lot, seed: 'one' });
    const b = buildModel(id, { level: 2, lot, seed: 'one' });
    assert.equal(fingerprint(a.geometries), fingerprint(b.geometries), `${id} is drawn the same twice`);
  }
});

test('models: the company colour shows on the building', () => {
  for (const id of BASE) {
    const lot = plotOf(id);
    const red = buildModel(id, { level: 1, lot, seed: 's', color: 0xff0000 }).geometries.solid.attributes.color.array;
    const blue = buildModel(id, { level: 1, lot, seed: 's', color: 0x0000ff }).geometries.solid.attributes.color.array;
    let differing = 0;
    for (let i = 0; i < red.length; i++) if (red[i] !== blue[i]) differing++;
    assert.ok(differing > 30, `${id}: the owner's colour is used (${differing} colour values differ)`);
  }
});

test('models: a construction site in three stages, on every size of plot', () => {
  assert.ok(hasModel('site'));
  for (const lot of Object.values(PLOT)) {
    let last = 0;
    for (const level of [1, 2, 3]) {
      const model = buildModel('site', { level, lot, seed: 'site' });
      const m = measure(model.geometries, lot);
      assert.equal(m.bad, 0);
      assert.ok(m.over <= 0.15, `site ${lot.w}×${lot.d} stage ${level} stays on its plot (${m.over.toFixed(2)})`);
      assert.ok(model.triangles >= 100 && model.triangles <= 4500, `site ${lot.w}×${lot.d} stage ${level}: ${model.triangles} triangles`);
      assert.ok(m.high >= last - 1e-6, `site ${lot.w}×${lot.d}: the work rises (${last.toFixed(2)} → ${m.high.toFixed(2)})`);
      last = m.high;
    }
  }
});

test('models: everything a city plan asks for can be drawn', () => {
  const kinds = new Map(); // kind → sizes it occurs in
  for (const seed of ['models-a', 'models-b', 'models-c']) {
    const game = Game.create(content, { seed, cityCount: 6, player: { name: 'Plan', color: 1 }, rivals: [], events: false });
    for (const city of game.cities()) {
      const plan = cityPlan(content, city, { seed, cities: game.cities() });
      for (const p of [...plan.parcels, ...plan.scenery]) {
        if (!kinds.has(p.kind)) kinds.set(p.kind, new Map());
        kinds.get(p.kind).set(`${p.w}x${p.d}`, { w: p.w, d: p.d });
      }
    }
  }
  assert.ok(kinds.size >= 15, `the sample plans use many kinds of parcel (${[...kinds.keys()].join(', ')})`);
  for (const [kind, sizes] of kinds) {
    if (kind === 'hill') continue; // terrain, drawn with the land
    assert.ok(PARCELS.includes(kind), `the town can draw a "${kind}"`);
    for (const lot of sizes.values()) {
      const b = new Builder(11);
      parcel(b, kind, lot.w, lot.d);
      const geometries = b.build();
      const m = measure(geometries, lot);
      const name = `${kind} ${lot.w}×${lot.d}`;
      assert.equal(m.bad, 0, `${name}: every coordinate is a number`);
      assert.ok(m.over <= 0.15, `${name} stays on its parcel (reaches ${m.over.toFixed(2)} beyond)`);
      assert.ok(m.low >= -0.2 && m.high < 16, `${name}: sane height (${m.low.toFixed(2)}…${m.high.toFixed(2)})`);
      assert.ok(b.triangles > 0 && b.triangles <= 3200, `${name}: ${b.triangles} triangles`);
    }
  }
});

test('models: a parcel of town looks the same every time and varies from place to place', () => {
  for (const kind of PARCELS) {
    const draw = (seed) => {
      const b = new Builder(seed);
      parcel(b, kind, 10, 10);
      return fingerprint(b.build());
    };
    assert.equal(draw(5), draw(5), `${kind} is drawn the same for the same place`);
  }
  const houses = new Set([1, 2, 3, 4, 5, 6].map((seed) => {
    const b = new Builder(seed);
    parcel(b, 'house', 10, 10);
    return fingerprint(b.build());
  }));
  assert.ok(houses.size >= 3, 'houses differ from parcel to parcel');
});
