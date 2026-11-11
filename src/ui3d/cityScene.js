// One city as a 3D scene: the plan (streets, water, the town) drawn once, and
// on top of it the things that change with the game — buildings on their
// plots, construction sites, free plots — kept in step by `sync()`.
//
//   const scene = new CityScene({ content, game, city, materials: stage.materials });
//   stage.show(scene.group, { pickables: scene.pickables, bounds: scene.bounds, view: scene.view });
//   scene.sync(game);            // after every change of the game; returns true when something was redrawn
//   scene.update(dt, pace);      // every frame: traffic and smoke
//
// What can be clicked carries `userData.pick`:
//   { kind: 'building', id }   or   { kind: 'lot', district, lot }

import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from './three.js';
import { GRID, builtShare, cityPlan } from '../geo/cityPlan.js';
import { plotsOf } from '../sim/world.js';
import { Builder, rng } from './kit.js';
import { disposeTree, groupOf } from './stage.js';
import { buildModel } from './models/all.js';
import { PARCELS, parcel } from './models/town.js';
import { CAR_COLORS, car } from './models/props.js';
import * as infra from './infra.js';
import { C, companyColor } from './palette.js';

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const PROXY = new MeshBasicMaterial({ visible: false });
const Y_AXIS = new Vector3(0, 1, 0);

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Draw one parcel of town or countryside; kinds nobody can draw become grass. */
function drawParcel(b, kind, w, d) {
  if (kind === 'hill') infra.hill(b, w, d);
  else if (PARCELS.includes(kind)) parcel(b, kind, w, d);
  else b.box(0, 0, 0, w - 0.2, 0.03, d - 0.2, kind === 'field' ? C.crop : C.meadow, { ao: 1 });
}

export class CityScene {
  /**
   * @param {{content: object, game: object, city: object, materials: object}} opts
   */
  constructor({ content, game, city, materials }) {
    this.content = content;
    this.city = city;
    this.materials = materials;
    this.seed = `${game.state.settings.seed}|${city.id}`;
    this.plan = cityPlan(content, city, { seed: game.state.settings.seed, cities: game.cities() });
    this.group = new Group();
    this.pickables = [];
    this.buildings = new Map(); // building id → { key, node, proxy, lot, height }
    this.lotProxies = new Map(); // "district:lot" → proxy mesh of a free plot
    this.smoke = []; // chimney tops in world space
    const edge = this.plan.size - 10;
    this.bounds = { minX: -edge, maxX: edge, minZ: -edge, maxZ: edge, minZoom: 12, maxZoom: Math.min(260, this.plan.size * 2.4) };
    this.view = { x: 0, z: 0, zoom: Math.min(78, this.plan.half * 1.5), rot: 0 };
    this.labelZoom = 130; // from further away the names over buildings would only be clutter

    this._base();
    this.town = null;
    this.pads = null;
    this.share = -1;
    this.padsKey = '';
    this.highlight = null;
    this.showLots = false;
    this._traffic(game);
    this._smoke();
    this.sync(game);
  }

  // --- what never changes ---------------------------------------------------------

  _base() {
    const b = new Builder(hash(`${this.seed}|base`));
    infra.ground(b, this.plan);
    infra.water(b, this.plan);
    infra.roads(b, this.plan);
    infra.furniture(b, this.plan);
    infra.port(b, this.plan);
    this.base = groupOf(b.build(), this.materials);
    this.group.add(this.base);
  }

  // --- the town grows with the population ----------------------------------------------

  _town(share) {
    if (this.town) {
      this.group.remove(this.town);
      disposeTree(this.town);
    }
    const b = new Builder(hash(`${this.seed}|town`));
    for (const p of this.plan.parcels) {
      const kind = p.t <= share || p.zone === 'edge' ? p.kind : 'meadow';
      b.at(p.x, 0, p.z, p.ry, () => drawParcel(b, kind, p.w, p.d));
    }
    for (const p of this.plan.scenery) b.at(p.x, 0, p.z, p.ry, () => drawParcel(b, p.kind, p.w, p.d));
    this.town = groupOf(b.build(), this.materials);
    this.group.add(this.town);
  }

  // --- plots ---------------------------------------------------------------------------------

  /** Where a plot lies: from the plan, or — beyond what the plan foresaw — in a row at the edge. */
  lotAt(district, lot) {
    const known = this.plan.lots[district]?.[lot];
    if (known) return known;
    const row = Object.keys(this.plan.lots).indexOf(district);
    return { x: -this.plan.size + 16 + (lot % 12) * 13, z: this.plan.size - 16 - Math.max(0, row) * 13, w: 12, d: 12, ry: Math.PI };
  }

  _proxy(lot, height, pick) {
    const mesh = new Mesh(UNIT_BOX, PROXY);
    mesh.position.set(lot.x, height / 2, lot.z);
    mesh.rotation.y = lot.ry;
    mesh.scale.set(lot.w, height, lot.d);
    mesh.userData.pick = pick;
    mesh.updateMatrixWorld();
    this.group.add(mesh);
    this.pickables.push(mesh);
    return mesh;
  }

  _dropProxy(mesh) {
    this.group.remove(mesh);
    const i = this.pickables.indexOf(mesh);
    if (i >= 0) this.pickables.splice(i, 1);
  }

  /** Everything on plots without a building: free plots, and land not yet released for building. */
  _pads(game) {
    if (this.pads) {
      this.group.remove(this.pads);
      disposeTree(this.pads);
    }
    for (const mesh of this.lotProxies.values()) this._dropProxy(mesh);
    this.lotProxies.clear();
    const taken = new Set();
    for (const b of game.buildingsIn(this.city.id)) taken.add(`${b.district}:${b.lot}`);
    const b = new Builder(hash(`${this.seed}|pads`));
    const glowing = new Builder(1);
    for (const district of Object.keys(this.plan.lots)) {
      const open = this.content.districts.has(district) ? plotsOf(this.content, this.city, district) : 0;
      this.plan.lots[district].forEach((lot, k) => {
        if (taken.has(`${district}:${k}`)) return;
        if (k < open) {
          infra.freePlot(b, lot);
          glowing.at(lot.x, 0, lot.z, lot.ry, () => glowing.plane(0, 0.05, 0, lot.w - 0.3, lot.d - 0.3, 0xffffff));
          this.lotProxies.set(`${district}:${k}`, this._proxy(lot, 0.5, { kind: 'lot', district, lot: k }));
        } else {
          b.at(lot.x, 0, lot.z, lot.ry, () => drawParcel(b, 'meadow', lot.w, lot.d));
        }
      });
    }
    this.pads = groupOf(b.build(), this.materials);
    // the wash of colour that shows where one can build
    const wash = glowing.build().solid;
    if (wash) {
      this.highlightMaterial ??= new MeshBasicMaterial({ color: 0xffc43d, transparent: true, opacity: 0.42, depthWrite: false });
      this.highlight = new Mesh(wash, this.highlightMaterial);
      this.highlight.visible = this.showLots;
      this.highlight.renderOrder = 2;
      this.pads.add(this.highlight);
    } else this.highlight = null;
    this.group.add(this.pads);
  }

  /** Light up the plots that can be built on. */
  setShowLots(on) {
    this.showLots = !!on;
    if (this.highlight) this.highlight.visible = this.showLots;
  }

  // --- buildings ---------------------------------------------------------------------------------

  _removeBuilding(id) {
    const cur = this.buildings.get(id);
    if (!cur) return;
    this.group.remove(cur.node);
    disposeTree(cur.node);
    this._dropProxy(cur.proxy);
    this.buildings.delete(id);
  }

  _addBuilding(b, key, stage, owner) {
    const lot = this.lotAt(b.district, b.lot);
    const type = this.content.buildingTypes.find(b.type) ?? { id: b.type, kind: b.kind };
    const color = companyColor(owner?.color ?? 0);
    const site = stage.startsWith('site');
    const model = site
      ? buildModel('site', { color, lot, seed: `${this.seed}|${b.id}`, level: 1 + Number(stage.slice(4)) })
      : buildModel(type, { level: b.level, color, lot, seed: `${this.seed}|${b.id}` });
    const node = groupOf(model.geometries, this.materials);
    let height = model.geometries.solid?.boundingBox.max.y ?? 1;
    if (stage === 'up') {
      const works = new Builder(1);
      infra.upgradeWorks(works, lot, height);
      const extra = groupOf(works.build(), this.materials);
      node.add(...extra.children);
      height += 1.8;
    }
    node.position.set(lot.x, 0, lot.z);
    node.rotation.y = lot.ry;
    node.updateMatrixWorld(true);
    this.group.add(node);
    const proxy = this._proxy(lot, Math.max(0.8, height), { kind: 'building', id: b.id });
    const smoke = (site ? [] : model.extras.smoke ?? []).map(([x, y, z]) => new Vector3(x, y, z).applyMatrix4(node.matrixWorld));
    this.buildings.set(b.id, { key, node, proxy, lot, height, smoke });
  }

  /**
   * Bring the scene in step with the game.
   * @returns {boolean} true when something was redrawn (the stage should render, shadows included)
   */
  sync(game) {
    const { state } = game;
    let changed = false;
    let padsDirty = false;
    const seen = new Set();
    for (const b of game.buildingsIn(this.city.id)) {
      seen.add(b.id);
      const owner = state.companies[b.co];
      const stage = !game.isReady(b)
        ? `site${Math.max(0, Math.min(2, Math.floor((3 * (state.day - b.built)) / Math.max(1, b.ready - b.built))))}`
        : b.up
          ? 'up'
          : 'ok';
      const key = `${b.type}|${b.level}|${owner?.color}|${stage}|${b.district}:${b.lot}`;
      const cur = this.buildings.get(b.id);
      if (cur?.key === key) continue;
      if (cur) this._removeBuilding(b.id);
      else padsDirty = true;
      this._addBuilding(b, key, stage, owner);
      changed = true;
    }
    for (const id of [...this.buildings.keys()]) {
      if (seen.has(id)) continue;
      this._removeBuilding(id);
      padsDirty = true;
      changed = true;
    }
    const padsKey = Object.keys(this.plan.lots)
      .map((d) => (this.content.districts.has(d) ? plotsOf(this.content, this.city, d) : 0))
      .join(',');
    if (padsDirty || padsKey !== this.padsKey) {
      this.padsKey = padsKey;
      this._pads(game);
      changed = true;
    }
    const share = Math.round(builtShare(this.content, this.city) * 40) / 40;
    if (share !== this.share) {
      this.share = share;
      this._town(share);
      changed = true;
    }
    if (changed) {
      this.smoke = [...this.buildings.values()].flatMap((entry) => entry.smoke);
      this._layoutSmoke();
    }
    return changed;
  }

  /** Where to hang a label over a building (world coordinates), or null. */
  anchor(id) {
    const cur = this.buildings.get(id);
    return cur ? { x: cur.lot.x, y: cur.height + 0.4, z: cur.lot.z } : null;
  }

  /** Names over the player's own buildings. */
  labels(app) {
    const me = app.me;
    if (!me) return [];
    const out = [];
    for (const b of app.game.buildingsIn(this.city.id)) {
      if (b.co !== me.id) continue;
      const at = this.anchor(b.id);
      if (at) out.push({ id: b.id, ...at, text: app.buildingName(b), cls: 'world-label-own', color: `var(--series-${(me.color % 8) + 1})` });
    }
    return out;
  }

  /** Centre of a plot or building on the ground — for flying the camera there. */
  locate(pick) {
    const lot = pick.kind === 'building' ? this.buildings.get(pick.id)?.lot : this.lotAt(pick.district, pick.lot);
    return lot ? { x: lot.x, z: lot.z } : null;
  }

  // --- traffic ---------------------------------------------------------------------------------------

  _traffic(game) {
    const drivable = this.plan.roads.filter((r) => r.kind !== 'track');
    const at = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
    const ends = new Map();
    this.segments = drivable.map((r, i) => {
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
      const seg = { ...r, len, ux: (r.x2 - r.x1) / len, uz: (r.z2 - r.z1) / len, i };
      for (const k of [at(r.x1, r.z1), at(r.x2, r.z2)]) {
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(seg);
      }
      return seg;
    });
    this.joints = ends;
    this.jointKey = at;
    const count = Math.min(110, Math.round(16 + this.city.pop / 45_000));
    const body = new Builder(1);
    car(body, 0, 0, 0, 0, 0xffffff);
    this.carGeometry = body.build().solid;
    this.carMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
    this.cars = new InstancedMesh(this.carGeometry, this.carMaterial, count);
    this.cars.castShadow = false;
    this.cars.receiveShadow = true;
    this.cars.frustumCulled = false;
    const rand = rng(hash(`${this.seed}|cars`));
    const tint = new Color();
    this.fleet = [];
    for (let i = 0; i < count; i++) {
      const seg = this.segments[Math.floor(rand() * this.segments.length)];
      this.fleet.push({ seg, s: rand() * seg.len, dir: rand() < 0.5 ? 1 : -1, v: 2.4 + rand() * 2.2 });
      this.cars.setColorAt(i, tint.set(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]));
    }
    this.rand = rand;
    this.group.add(this.cars);
    this._placeCars();
    void game;
  }

  _placeCars() {
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const one = new Vector3(1, 1, 1);
    this.fleet.forEach((c, i) => {
      const { seg } = c;
      const dx = seg.ux * c.dir;
      const dz = seg.uz * c.dir;
      const side = seg.kind === 'highway' ? 0.52 : 0.32; // keep to the right
      p.set(seg.x1 + seg.ux * c.s - dz * side, 0.02, seg.z1 + seg.uz * c.s + dx * side);
      q.setFromAxisAngle(Y_AXIS, Math.atan2(dx, dz));
      this.cars.setMatrixAt(i, m.compose(p, q, one));
    });
    this.cars.instanceMatrix.needsUpdate = true;
  }

  _driveCars(dt) {
    for (const c of this.fleet) {
      c.s += c.dir * c.v * dt;
      if (c.s >= 0 && c.s <= c.seg.len) continue;
      // at the end of a stretch: turn into another one that meets it here
      const end = c.s < 0 ? [c.seg.x1, c.seg.z1] : [c.seg.x2, c.seg.z2];
      const options = (this.joints.get(this.jointKey(end[0], end[1])) ?? []).filter((s) => s !== c.seg);
      const next = options.length ? options[Math.floor(this.rand() * options.length)] : null;
      if (!next) {
        // the edge of the map or a dead end: turn round (leaving the map and coming back, as far as anyone can tell)
        c.dir = -c.dir;
        c.s = Math.max(0, Math.min(c.seg.len, c.s));
        continue;
      }
      const fromStart = Math.abs(next.x1 - end[0]) < 0.06 && Math.abs(next.z1 - end[1]) < 0.06;
      c.seg = next;
      c.dir = fromStart ? 1 : -1;
      c.s = fromStart ? 0 : next.len;
    }
    this._placeCars();
  }

  // --- smoke -------------------------------------------------------------------------------------------

  _smoke() {
    const puff = new Builder(1);
    puff.ball(0, 0, 0, 0.5, 0xffffff, { seg: 6, rings: 4 });
    this.puffMaterial = new MeshStandardMaterial({ color: 0xe6e6e2, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
    this.puffGeometry = puff.build().solid;
    this.puffs = null;
    this.clock = 0;
  }

  _layoutSmoke() {
    if (this.puffs) {
      this.group.remove(this.puffs);
      this.puffs.dispose();
      this.puffs = null;
    }
    if (!this.smoke.length) return;
    this.puffs = new InstancedMesh(this.puffGeometry, this.puffMaterial, this.smoke.length * 5);
    this.puffs.frustumCulled = false;
    this.group.add(this.puffs);
    this._puff();
  }

  _puff() {
    if (!this.puffs) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const k = new Vector3();
    let i = 0;
    for (const [n, top] of this.smoke.entries()) {
      for (let j = 0; j < 5; j++) {
        const age = (this.clock * 0.22 + j / 5 + n * 0.37) % 1; // 0 = just out of the chimney
        const size = (0.22 + age * 0.9) * Math.min(1, (1 - age) * 3.2);
        p.set(top.x + age * 1.5 + Math.sin(age * 7 + n) * 0.1, top.y + age * 2.6, top.z - age * 0.7);
        k.set(size, size, size);
        this.puffs.setMatrixAt(i++, m.compose(p, q, k));
      }
    }
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  /** Move what moves. `pace` = 0 when the game is paused. */
  update(dt, pace = 1) {
    if (pace <= 0) return;
    this.clock += dt * pace;
    this._driveCars(dt * pace);
    this._puff();
  }

  dispose() {
    disposeTree(this.group);
    this.carMaterial.dispose();
    this.puffMaterial.dispose();
    this.highlightMaterial?.dispose();
  }
}

export { GRID };
