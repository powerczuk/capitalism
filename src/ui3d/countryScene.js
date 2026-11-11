// The map of the country as a 3D scene: the coast in the north, mountains in
// the south, fields and forests between, the cities as little clusters of
// roofs joined by roads, and over each city the flags of the companies that
// trade there.
//
// It follows the same contract as CityScene (group, pickables, bounds, view,
// sync, update, labels, dispose). Clicking a city picks { kind: 'city', id }.

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from './three.js';
import { Builder, rng, shade } from './kit.js';
import { disposeTree, groupOf } from './stage.js';
import { C, companyColor } from './palette.js';
import { pine, tree, truck } from './models/props.js';

const K = 0.16; // world units per map unit (the game's map is 1000 × 640)
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const PROXY = new MeshBasicMaterial({ visible: false });
const WATER_LEVEL = -0.5;
const FAR = 520;

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class CountryScene {
  constructor({ content, game, materials }) {
    this.content = content;
    this.materials = materials;
    const W = content.balance.world;
    this.w = W.width * K;
    this.h = W.height * K;
    this.at = (city) => ({ x: (city.x - W.width / 2) * K, z: (city.y - W.height / 2) * K });
    this.seed = `${game.state.settings.seed}|country`;
    this.group = new Group();
    this.pickables = [];
    this.bounds = { minX: -this.w / 2, maxX: this.w / 2, minZ: -this.h / 2, maxZ: this.h / 2, minZoom: 26, maxZoom: 150 };
    this.view = { x: 0, z: 2, zoom: 104, rot: 0 };
    this.cities = game.cities();
    this.radius = (city) => 2.6 + Math.sqrt(city.pop / 1e6) * 3.6;
    this.coastZ = -this.h / 2 + 70 * K;

    this._land();
    this.townsKey = '';
    this.flagsKey = '';
    this.towns = null;
    this.flags = null;
    for (const city of this.cities) {
      const p = this.at(city);
      const r = this.radius(city) + 1.2;
      const proxy = new Mesh(UNIT_BOX, PROXY);
      proxy.position.set(p.x, 2, p.z);
      proxy.scale.set(r * 2, 4, r * 2);
      proxy.userData.pick = { kind: 'city', id: city.id };
      proxy.updateMatrixWorld();
      this.group.add(proxy);
      this.pickables.push(proxy);
    }
    this._lorries();
    this.sync(game);
  }

  /** Which cities a road joins: every city with its two nearest neighbours. */
  _links() {
    const seen = new Set();
    const links = [];
    for (const a of this.cities) {
      const near = this.cities
        .filter((b) => b !== a)
        .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))
        .slice(0, 2);
      for (const b of near) {
        const key = [a.id, b.id].sort().join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        links.push([this.at(a), this.at(b)]);
      }
    }
    return links;
  }

  _land() {
    const b = new Builder(hash(this.seed));
    const rand = b.rand;
    this.links = this._links();
    const halfW = this.w / 2;
    const halfH = this.h / 2;
    const coast = this.coastZ;

    // The coast is a broken line: every step along x it wanders a little.
    const step = 6;
    const line = [];
    for (let x = -FAR; x <= FAR; x += step) line.push({ x, z: coast + (rand() - 0.5) * 5.5 });
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i];
      const q = line[i + 1];
      b.quad([p.x, 0, FAR], [q.x, 0, FAR], [q.x, 0, q.z], [p.x, 0, p.z], C.grass); // land
      b.quad([p.x, 0.01, p.z + 1.6], [q.x, 0.01, q.z + 1.6], [q.x, 0.01, q.z], [p.x, 0.01, p.z], C.sand); // beach
      b.quad([p.x, 0.01, p.z], [q.x, 0.01, q.z], [q.x, WATER_LEVEL, q.z - 0.5], [p.x, WATER_LEVEL, p.z - 0.5], shade(C.sand, 0.86));
    }
    b.layer('water');
    b.plane(0, WATER_LEVEL, coast - FAR / 2 + 6, 2 * FAR, FAR + 12, C.water);
    b.plane(0, WATER_LEVEL + 0.005, coast - 16 - FAR / 2, 2 * FAR, FAR, C.waterDeep);
    for (let i = 0; i < 40; i++) b.plane((rand() * 2 - 1) * (halfW + 30), WATER_LEVEL + 0.01, coast - 5 - rand() * 40, 2 + rand() * 6, 0.14, C.foam);
    b.layer('solid');

    // A patchwork of meadows and fields south of the coast.
    const busy = (x, z, r) => this.cities.some((city) => Math.hypot(this.at(city).x - x, this.at(city).z - z) < this.radius(city) + r);
    const cell = 7;
    const tones = [shade(C.grass, 0.955), shade(C.grass, 1.045), C.grassLight, C.meadow, C.crop, C.cropGreen, shade(C.crop, 0.92), C.soil];
    for (let x = -halfW - 60; x < halfW + 60; x += cell) {
      for (let z = coast + 6; z < halfH + 40; z += cell) {
        if (rand() < 0.4) continue;
        const farm = z < halfH - 26 && rand() < 0.3; // fields in the lowlands, plain grass elsewhere
        const w = cell * (0.55 + rand() * 0.42);
        const d = cell * (0.55 + rand() * 0.42);
        const cx = x + cell / 2;
        const cz = z + cell / 2;
        const tone = tones[Math.floor(rand() * (farm ? tones.length : 4))];
        b.plane(cx, 0.008, cz, w, d, tone);
        if (farm && tone !== C.soil) for (let s = -d / 2 + 0.5; s < d / 2; s += 0.9) b.plane(cx, 0.012, cz + s, w - 0.3, 0.1, shade(tone, 0.86)); // furrows
      }
    }

    // Roads between the cities.
    for (const [p, q] of this.links) {
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      b.at((p.x + q.x) / 2, 0, (p.z + q.z) / 2, Math.atan2(q.x - p.x, q.z - p.z), () => {
        b.box(0, 0, 0, 1.0, 0.03, len, C.asphalt, { ao: 1 });
        b.box(0, 0, 0, 1.3, 0.02, len, C.gravel, { ao: 1 });
        for (let s = -len / 2 + 1; s < len / 2 - 0.5; s += 2.2) b.plane(0, 0.033, s, 0.07, 0.9, C.marking);
      });
    }
    const onRoad = (x, z) =>
      this.links.some(([p, q]) => {
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(p.x + dx * t - x, p.z + dz * t - z) < 1.6;
      });

    // Mountains along the south, lower hills before them.
    const south = halfH - 90 * K;
    for (let i = 0; i < 150; i++) {
      const x = (rand() * 2 - 1) * (halfW + 70);
      const z = south + 4 + rand() * rand() * 70;
      const big = (z - south) / 30;
      const r = 3 + rand() * 4 + big * 3;
      const h = r * (0.9 + rand() * 0.7);
      if (busy(x, z, r + 1) || onRoad(x, z)) continue;
      b.cyl(x, 0, z, r, h * 0.62, rand() < 0.5 ? C.rock : C.rockDark, { seg: 6, r2: r * 0.42, smooth: false, ao: 0.78, cap: false });
      b.cone(x, h * 0.62, z, r * 0.42, h * 0.38, h > 6.5 ? C.snow : C.rock, { seg: 6 });
    }
    // Forests: thick in the south, groves elsewhere.
    for (let i = 0; i < 520; i++) {
      const x = (rand() * 2 - 1) * (halfW + 40);
      const z = coast + 4 + rand() * (halfH - coast + 26);
      const dense = z > south - 22;
      if (!dense && rand() < 0.62) continue;
      if (busy(x, z, 1.2) || onRoad(x, z)) continue;
      if (dense || rand() < 0.5) pine(b, x, z, 0.9 + rand() * 0.8);
      else tree(b, x, z, 0.9 + rand() * 0.7);
    }
    this.base = groupOf(b.build(), this.materials);
    this.group.add(this.base);
  }

  /** The cities themselves: roofs in a cluster that grows with the population. */
  _towns() {
    if (this.towns) {
      this.group.remove(this.towns);
      disposeTree(this.towns);
    }
    const b = new Builder(hash(`${this.seed}|towns`));
    const walls = [C.plaster, C.plasterWarm, C.plasterRose, C.plasterCool, C.stone, C.brick];
    const roofs = [C.roofRed, C.roofBrown, C.roofGrey, C.roofDark];
    for (const city of this.cities) {
      const p = this.at(city);
      const r = this.radius(city);
      const rand = rng(hash(`${this.seed}|${city.id}`));
      b.cyl(p.x, 0, p.z, r + 0.7, 0.03, C.pavement, { seg: 14, ao: 1 });
      const count = Math.round(14 + city.pop / 42_000);
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * r;
        const x = p.x + Math.cos(a) * dist;
        const z = p.z + Math.sin(a) * dist;
        const core = dist < r * 0.36;
        const ry = Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.3;
        if (core && rand() < 0.75) {
          const h = 0.8 + rand() * (1.2 + r * 0.42);
          b.block(x, 0.03, z, 0.5 + rand() * 0.3, h, 0.5 + rand() * 0.3, rand() < 0.5 ? C.panel : C.plasterCool, { ry, top: C.roofFlat, win: { rows: Math.max(2, Math.round(h / 0.4)), cols: 2, lit: 0.5, margin: 0.06, base: 0.06 } });
        } else {
          const w = 0.5 + rand() * 0.35;
          b.gable(x, 0.03, z, w, w * 0.8, 0.26 + rand() * 0.2, 0.2, walls[Math.floor(rand() * walls.length)], roofs[Math.floor(rand() * roofs.length)], { ry, over: 0.03 });
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = rand() * Math.PI * 2;
        tree(b, p.x + Math.cos(a) * (r + 0.3), p.z + Math.sin(a) * (r + 0.3), 0.6 + rand() * 0.3);
      }
      if (city.port) {
        // a pier into the sea, a crane and a ship
        const z0 = this.coastZ - 1.5;
        b.box(p.x + r * 0.5, WATER_LEVEL, (p.z + z0) / 2 - r * 0.3, 0.9, -WATER_LEVEL + 0.06, Math.abs(p.z - z0) + 2, C.concrete, { ao: 0.85 });
        b.box(p.x + r * 0.5, 0.06, z0 - 0.4, 0.2, 1.4, 0.2, C.orange, { ao: 1 });
        b.box(p.x + r * 0.5, 1.4, z0 - 1.0, 0.16, 0.14, 1.6, C.orange, { ao: 1 });
        b.box(p.x + r * 0.5 + 1.3, WATER_LEVEL, z0 - 1.6, 0.9, 0.6, 2.6, C.dark, { ao: 0.9, top: C.red });
        b.box(p.x + r * 0.5 + 1.3, WATER_LEVEL + 0.6, z0 - 2.4, 0.7, 0.5, 0.6, C.white, { ao: 1 });
      }
    }
    this.towns = groupOf(b.build(), this.materials);
    this.group.add(this.towns);
  }

  /** A flag per company trading in a city — taller the more buildings it has there. */
  _flags(game) {
    if (this.flags) {
      this.group.remove(this.flags);
      disposeTree(this.flags);
    }
    const b = new Builder(1);
    for (const city of this.cities) {
      const p = this.at(city);
      const r = this.radius(city);
      const counts = new Map();
      for (const building of game.buildingsIn(city.id)) counts.set(building.co, (counts.get(building.co) || 0) + 1);
      const owners = [...counts.keys()].map((id) => game.state.companies[id]).filter((co) => co?.alive);
      owners.forEach((co, i) => {
        const x = p.x + r + 1.1 + i * 0.75;
        const z = p.z + r * 0.4;
        const h = 1.5 + Math.min(2.6, counts.get(co.id) * 0.16);
        b.box(x, 0, z, 0.07, h, 0.07, C.white, { ao: 1 });
        b.lamp(x + 0.3, h - 0.55, z, 0.56, 0.5, 0.05, companyColor(co.color));
      });
    }
    this.flags = groupOf(b.build(), this.materials);
    this.group.add(this.flags);
  }

  sync(game) {
    let changed = false;
    const townsKey = this.cities.map((city) => Math.round(city.pop / 50_000)).join(',');
    if (townsKey !== this.townsKey) {
      this.townsKey = townsKey;
      this._towns();
      changed = true;
    }
    const flagsKey = this.cities
      .map((city) => {
        const counts = {};
        for (const b of game.buildingsIn(city.id)) counts[b.co] = (counts[b.co] || 0) + 1;
        return Object.keys(counts)
          .filter((id) => game.state.companies[id]?.alive)
          .map((id) => `${id}:${counts[id]}:${game.state.companies[id].color}`)
          .join(' ');
      })
      .join('|');
    if (flagsKey !== this.flagsKey) {
      this.flagsKey = flagsKey;
      this._flags(game);
      changed = true;
    }
    return changed;
  }

  /** Names over the cities. */
  labels(app) {
    return this.cities.map((city) => {
      const p = this.at(city);
      const mine = app.me ? app.game.buildingsIn(city.id).filter((b) => b.co === app.me.id).length : 0;
      return { id: city.id, x: p.x, y: 3.2 + this.radius(city) * 0.5, z: p.z, text: city.name, cls: `world-label-city${mine ? ' mine' : ''}`, pick: { kind: 'city', id: city.id } };
    });
  }

  locate(pick) {
    const city = this.cities.find((c) => c.id === pick.id);
    return city ? this.at(city) : null;
  }

  // --- lorries on the roads ---------------------------------------------------------

  _lorries() {
    const body = new Builder(3);
    truck(body, 0, 0, 0, C.white);
    this.lorryGroup = new Group();
    const geometry = body.build();
    const rand = rng(hash(`${this.seed}|lorries`));
    this.fleet = [];
    for (const [p, q] of this.links) {
      for (let i = 0; i < 2; i++) {
        const node = groupOf(geometry, this.materials, { shadows: false });
        node.scale.setScalar(0.9);
        this.lorryGroup.add(node);
        this.fleet.push({ node, p, q, len: Math.hypot(q.x - p.x, q.z - p.z), s: rand(), dir: i ? 1 : -1, v: 3 + rand() * 2 });
      }
    }
    this.group.add(this.lorryGroup);
    this._drive(0);
  }

  _drive(dt) {
    for (const c of this.fleet) {
      c.s += (c.dir * c.v * dt) / c.len;
      if (c.s > 1 || c.s < 0) {
        c.dir = -c.dir;
        c.s = Math.max(0, Math.min(1, c.s));
      }
      const dx = (c.q.x - c.p.x) / c.len;
      const dz = (c.q.z - c.p.z) / c.len;
      c.node.position.set(c.p.x + (c.q.x - c.p.x) * c.s - dz * c.dir * 0.26, 0.03, c.p.z + (c.q.z - c.p.z) * c.s + dx * c.dir * 0.26);
      c.node.rotation.y = Math.atan2(dx * c.dir, dz * c.dir);
    }
  }

  update(dt, pace = 1) {
    if (pace > 0) this._drive(dt * pace);
  }

  dispose() {
    disposeTree(this.group);
  }
}
