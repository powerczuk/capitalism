// The occluder decides whether the town hides what a click would otherwise
// reach. Pure geometry, so it is checked without a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Builder } from '../src/ui3d/kit.js';
import { Occluder } from '../src/ui3d/occluder.js';

const unit = (x, y, z) => {
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
};

/** A ray that comes down at the angle of the game's camera and reaches the ground at (x, 0, z). */
function rayTo(x, z, from = 0) {
  const turn = Math.PI / 4 + (from * Math.PI) / 2;
  const d = unit(-Math.sin(turn) * Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6), -Math.cos(turn) * Math.cos(Math.PI / 6));
  const back = 80;
  return { o: { x: x - d.x * back, y: -d.y * back, z: z - d.z * back }, d, ground: back };
}

/** A tower 2 × 6 × 2 standing on (4, 0, 4), and a low hedge on (−4, 0, −4). */
function town() {
  const b = new Builder(1);
  b.box(4, 0, 4, 2, 6, 2, 0xffffff);
  b.box(-4, 0, -4, 3, 0.3, 0.4, 0x00ff00);
  return b.build().solid;
}

test('occluder: a tower hides the ground behind it and nothing else', () => {
  const cover = new Occluder(20).build([town()]);
  // seen from the south-east (the default camera), the ground north-west of the tower is behind it
  const behind = rayTo(1, 1);
  const hit = cover.block(behind.o, behind.d, behind.ground);
  assert.ok(hit < behind.ground - 1, `the ground behind the tower is hidden (hit at ${hit}, ground at ${behind.ground})`);
  // the ground in front of it, and well to the side, is in plain view
  for (const [x, z] of [[8, 8], [4, 10], [-6, 6], [10, -4], [0, -8]]) {
    const ray = rayTo(x, z);
    assert.equal(cover.block(ray.o, ray.d, ray.ground), Infinity, `(${x}, ${z}) is in plain view`);
  }
  // right next to its wall the ground shows: an exact test, not a coarse one
  const beside = rayTo(5.4, 2.0);
  assert.equal(cover.block(beside.o, beside.d, beside.ground), Infinity, 'the ground beside the wall is in view');
});

test('occluder: it depends on where one looks from', () => {
  const cover = new Occluder(20).build([town()]);
  const point = [1, 1]; // north-west of the tower
  const hidden = [0, 1, 2, 3].map((from) => {
    const ray = rayTo(point[0], point[1], from);
    return cover.block(ray.o, ray.d, ray.ground) < ray.ground;
  });
  assert.deepEqual(hidden, [true, false, false, false], 'only from the south-east does the tower stand in the way');
});

test('occluder: what is nearer than the thing looked at counts, what is further does not', () => {
  const cover = new Occluder(20).build([town()]);
  const ray = rayTo(1, 1);
  const hit = cover.block(ray.o, ray.d, ray.ground);
  assert.equal(cover.block(ray.o, ray.d, hit - 0.5), Infinity, 'something nearer than the tower is not hidden by it');
  assert.ok(cover.block(ray.o, ray.d, hit + 0.5) < hit + 0.5);
});

test('occluder: low things hide nothing, and an empty one never blocks', () => {
  const cover = new Occluder(20).build([town()]);
  // just behind the hedge, seen from the south-east
  const ray = rayTo(-4.3, -4.5);
  assert.equal(cover.block(ray.o, ray.d, ray.ground), Infinity, 'a hedge is not in the way');
  const none = new Occluder(20).build([undefined, null]);
  assert.equal(none.block(ray.o, ray.d, ray.ground), Infinity);
  assert.equal(new Occluder(20).block(ray.o, ray.d, ray.ground), Infinity);
});

test('occluder: rays along the grid lines and from outside the grid are handled', () => {
  const cover = new Occluder(20).build([town()]);
  // straight down
  assert.ok(cover.block({ x: 4, y: 50, z: 4 }, { x: 0, y: -1, z: 0 }, 50) < 50, 'straight down onto the roof');
  assert.equal(cover.block({ x: 9, y: 50, z: 9 }, { x: 0, y: -1, z: 0 }, 50), Infinity, 'straight down beside it');
  // level, along x, at half the height of the tower
  assert.ok(cover.block({ x: -30, y: 3, z: 4 }, { x: 1, y: 0, z: 0 }, 100) < 100, 'a level ray meets the wall');
  assert.equal(cover.block({ x: -30, y: 3, z: 9 }, { x: 1, y: 0, z: 0 }, 100), Infinity, 'a level ray past it');
  assert.equal(cover.block({ x: -30, y: 8, z: 4 }, { x: 1, y: 0, z: 0 }, 100), Infinity, 'a level ray over it');
  // never reaching the grid
  assert.equal(cover.block({ x: 100, y: 5, z: 100 }, { x: 1, y: 0, z: 0 }, 100), Infinity);
});

test('occluder: rebuilding forgets what stood there before', () => {
  const cover = new Occluder(20).build([town()]);
  const ray = rayTo(1, 1);
  assert.ok(cover.block(ray.o, ray.d, ray.ground) < ray.ground);
  cover.build([]);
  assert.equal(cover.block(ray.o, ray.d, ray.ground), Infinity);
});
