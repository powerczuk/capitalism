// Infrastructure of a city: the land and the water, streets with pavements
// and crossings, bridges, the harbour, hills, and the markers of free plots.
// Everything is drawn into a Builder from the plan made by src/geo/cityPlan.js.

import { GRID } from '../geo/cityPlan.js';
import { shade } from './kit.js';
import { C } from './palette.js';
import { container, lamp, lorry, pine, tree } from './models/props.js';

const WATER_LEVEL = -0.55;
const FAR = 420; // how far the land and the sea are drawn beyond the plan

// ---------------------------------------------------------------------------
// Land and water
// ---------------------------------------------------------------------------

/** The bands of water of a plan as rectangles [x0, z0, x1, z1]. */
function waters(plan) {
  const out = [];
  if (plan.coast) out.push([-FAR, -FAR, FAR, plan.coast.z]);
  if (plan.river) {
    const lo = plan.river.at - plan.river.width / 2;
    const hi = plan.river.at + plan.river.width / 2;
    out.push(plan.river.axis === 'x' ? [lo, -FAR, hi, FAR] : [-FAR, lo, FAR, hi]);
  }
  return out;
}

/** Land: big rectangles around the water, then patches of slightly different green on top. */
export function ground(b, plan) {
  let land = [[-FAR, -FAR, FAR, FAR]];
  for (const [wx0, wz0, wx1, wz1] of waters(plan)) {
    const next = [];
    for (const [x0, z0, x1, z1] of land) {
      if (wx0 >= x1 || wx1 <= x0 || wz0 >= z1 || wz1 <= z0) {
        next.push([x0, z0, x1, z1]);
        continue;
      }
      if (wz0 > z0) next.push([x0, z0, x1, wz0]);
      if (wz1 < z1) next.push([x0, wz1, x1, z1]);
      if (wx0 > x0) next.push([x0, Math.max(z0, wz0), wx0, Math.min(z1, wz1)]);
      if (wx1 < x1) next.push([wx1, Math.max(z0, wz0), x1, Math.min(z1, wz1)]);
    }
    land = next;
  }
  for (const [x0, z0, x1, z1] of land) b.plane((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, z1 - z0, C.grass);

  // The countryside is not one flat colour: a loose patchwork of slightly
  // different greens. The patches never overlap (they sit in the cells of a
  // grid), so they cannot flicker against each other.
  const wet = waters(plan);
  const reach = plan.size + 60;
  const cell = 9;
  const tones = [shade(C.grass, 0.955), shade(C.grass, 1.045), C.grassLight, shade(C.grassDark, 1.06), shade(C.meadow, 0.98)];
  for (let x = -reach; x < reach; x += cell) {
    for (let z = -reach; z < reach; z += cell) {
      if (b.rand() < 0.42) continue;
      const w = cell * (0.55 + b.rand() * 0.45);
      const d = cell * (0.55 + b.rand() * 0.45);
      const cx = x + cell / 2 + (b.rand() - 0.5) * (cell - w);
      const cz = z + cell / 2 + (b.rand() - 0.5) * (cell - d);
      if (wet.some(([x0, z0, x1, z1]) => cx + w / 2 > x0 - 0.5 && cx - w / 2 < x1 + 0.5 && cz + d / 2 > z0 - 0.5 && cz - d / 2 < z1 + 0.5)) continue;
      b.plane(cx, 0.006, cz, w, d, tones[Math.floor(b.rand() * tones.length)]);
    }
  }
}

/** Water of the sea and the river, their banks and the beach. */
export function water(b, plan) {
  b.layer('water');
  for (const [x0, z0, x1, z1] of waters(plan)) {
    b.plane((x0 + x1) / 2, WATER_LEVEL, (z0 + z1) / 2, x1 - x0, z1 - z0, C.water);
  }
  // deeper water away from the shore, and a few lighter streaks
  if (plan.coast) {
    b.plane(0, WATER_LEVEL + 0.004, plan.coast.z - 14 - FAR / 2, 2 * FAR, FAR, C.waterDeep);
    for (let i = 0; i < 26; i++) b.plane((b.rand() * 2 - 1) * plan.size, WATER_LEVEL + 0.008, plan.coast.z - 2 - b.rand() * 34, 2 + b.rand() * 5, 0.12, C.foam);
  }
  if (plan.river) {
    const along = plan.river.axis === 'x';
    for (let i = 0; i < 30; i++) {
      const s = (b.rand() * 2 - 1) * (plan.size + 20);
      const o = plan.river.at + (b.rand() - 0.5) * (plan.river.width - 3);
      b.plane(along ? o : s, WATER_LEVEL + 0.008, along ? s : o, along ? 0.1 : 1.5 + b.rand() * 3, along ? 1.5 + b.rand() * 3 : 0.1, C.foam);
    }
  }
  b.layer('solid');

  const depth = -WATER_LEVEL;
  if (plan.river) {
    // stone embankments on both sides
    const { at, width, axis } = plan.river;
    for (const sign of [-1, 1]) {
      const edge = at + (sign * width) / 2;
      if (axis === 'x') {
        b.box(edge + sign * 0.14, WATER_LEVEL, 0, 0.28, depth + 0.1, 2 * FAR, C.stone, { ao: 0.8, top: C.pavement });
      } else {
        b.box(0, WATER_LEVEL, edge + sign * 0.14, 2 * FAR, depth + 0.1, 0.28, C.stone, { ao: 0.8, top: C.pavement });
      }
    }
  }
  if (plan.coast) {
    const z = plan.coast.z;
    b.box(0, WATER_LEVEL, z + 0.9, 2 * FAR, depth + 0.012, 1.8, C.sand, { ao: 0.86 }); // the beach
    b.box(0, WATER_LEVEL, z - 0.5, 2 * FAR, 0.2, 1.0, shade(C.sand, 0.9), { ao: 1 }); // shallows
  }
}

// ---------------------------------------------------------------------------
// Streets
// ---------------------------------------------------------------------------

const CARRIAGEWAY = { highway: 2.1, avenue: 1.3, street: 1.3, lane: 1.3, bridge: 1.3, track: 0.8 };

/** One stretch of road, drawn along its own z axis. */
function stretch(b, r, cutStart, cutEnd) {
  const dx = r.x2 - r.x1;
  const dz = r.z2 - r.z1;
  const full = Math.hypot(dx, dz);
  const len = full - cutStart - cutEnd;
  if (len <= 0.05) return;
  const ux = dx / full;
  const uz = dz / full;
  const mid = cutStart + len / 2;
  const ry = Math.atan2(dx, dz);
  const w = CARRIAGEWAY[r.kind];
  b.at(r.x1 + ux * mid, 0, r.z1 + uz * mid, ry, () => {
    if (r.kind === 'track') {
      b.box(0, 0, 0, w, 0.022, len, C.soil, { ao: 1 });
      for (const sx of [-0.2, 0.2]) b.plane(sx, 0.024, 0, 0.12, len, C.soilDark);
      return;
    }
    if (r.kind === 'bridge') {
      b.box(0, -0.22, 0, GRID.road, 0.26, len + 0.3, C.concrete, { ao: 0.9, bottom: true });
      b.plane(0, 0.043, 0, w, len + 0.3, C.asphalt);
      for (const sx of [-0.92, 0.92]) b.box(sx, 0.04, 0, 0.1, 0.22, len + 0.3, C.stone, { ao: 1 });
      for (const sz of [-len / 4, len / 4]) b.box(0, WATER_LEVEL, sz, 1.7, -WATER_LEVEL - 0.22, 0.5, C.concreteDark, { ao: 0.8 });
      for (let s = -len / 2 + 0.6; s < len / 2; s += 1.25) b.plane(0, 0.046, s, 0.06, 0.55, C.marking);
      lamp(b, 0.86, -len / 4, -Math.PI / 2, 0); // no pool of light: it would hang over the water
      lamp(b, -0.86, len / 4, Math.PI / 2, 0);
      return;
    }
    b.box(0, 0, 0, w, 0.035, len, r.kind === 'highway' ? C.asphaltDark : C.asphalt, { ao: 1 });
    if (r.kind === 'highway') {
      for (const sx of [-w / 2 - 0.12, w / 2 + 0.12]) b.box(sx, 0, 0, 0.24, 0.03, len, C.gravel, { ao: 1 });
      for (const sx of [-0.92, 0.92]) b.plane(sx, 0.037, 0, 0.05, len, C.marking);
      b.plane(-0.05, 0.037, 0, 0.035, len, C.yellow);
      b.plane(0.05, 0.037, 0, 0.035, len, C.yellow);
      return;
    }
    if (r.outside) {
      // a country lane: asphalt between grass verges, a broken centre line
      for (let s = -len / 2 + 0.7; s < len / 2 - 0.3; s += 1.6) b.plane(0, 0.037, s, 0.05, 0.6, C.marking);
      return;
    }
    // town streets: pavements with kerbs, and a centre line
    const side = (GRID.road - w) / 2;
    for (const sign of [-1, 1]) b.box(sign * (w / 2 + side / 2), 0, 0, side, 0.07, len, C.pavement, { ao: 1 });
    if (r.kind === 'avenue') {
      b.plane(-0.045, 0.037, 0, 0.03, len, C.marking);
      b.plane(0.045, 0.037, 0, 0.03, len, C.marking);
    } else if (r.kind === 'street') {
      for (let s = -len / 2 + 0.55; s < len / 2 - 0.2; s += 1.25) b.plane(0, 0.037, s, 0.05, 0.55, C.marking);
    }
  });
}

/** All streets of a plan: stretches between crossings, then the crossings themselves. */
export function roads(b, plan) {
  const R = GRID.road / 2;
  // which ways the streets leave every crossing of the grid
  const arms = new Map();
  const arm = (at, dir) => {
    if (!at) return;
    const k = `${at[0]},${at[1]}`;
    arms.set(k, (arms.get(k) ?? '') + dir);
  };
  for (const r of plan.roads) {
    const vertical = Math.abs(r.x2 - r.x1) < 0.01;
    if (r.a1 && r.a2) {
      arm(r.a1, vertical ? 'S' : 'E');
      arm(r.a2, vertical ? 'N' : 'W');
    } else if (r.a1) {
      arm(r.a1, vertical ? (r.z2 > r.z1 ? 'S' : 'N') : r.x2 > r.x1 ? 'E' : 'W');
    }
    stretch(b, r, r.a1 ? R : 0, r.a2 ? R : 0);
  }
  for (const node of plan.nodes) {
    const dirs = arms.get(`${node.a},${node.b}`) ?? '';
    b.box(node.x, 0, node.z, GRID.road, 0.035, GRID.road, C.asphalt, { ao: 1 });
    // pavement fills every corner, and closes the sides no street leaves from
    const p = 0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(node.x + sx * (R - p / 2), 0, node.z + sz * (R - p / 2), p, 0.07, p, C.pavement, { ao: 1 });
    if (!dirs.includes('N')) b.box(node.x, 0, node.z - R + p / 2, GRID.road - 2 * p, 0.07, p, C.pavement, { ao: 1 });
    if (!dirs.includes('S')) b.box(node.x, 0, node.z + R - p / 2, GRID.road - 2 * p, 0.07, p, C.pavement, { ao: 1 });
    if (!dirs.includes('W')) b.box(node.x - R + p / 2, 0, node.z, p, 0.07, GRID.road - 2 * p, C.pavement, { ao: 1 });
    if (!dirs.includes('E')) b.box(node.x + R - p / 2, 0, node.z, p, 0.07, GRID.road - 2 * p, C.pavement, { ao: 1 });
    // zebra crossings in the busier parts of town
    if (dirs.length >= 3 && (node.zone === 'core' || node.zone === 'inner')) {
      for (const dir of dirs) {
        const vertical = dir === 'N' || dir === 'S';
        const sign = dir === 'N' || dir === 'W' ? -1 : 1;
        for (let i = -2; i <= 2; i++) {
          if (vertical) b.plane(node.x + i * 0.24, 0.038, node.z + sign * (R - 0.2), 0.12, 0.34, C.marking);
          else b.plane(node.x + sign * (R - 0.2), 0.038, node.z + i * 0.24, 0.34, 0.12, C.marking);
        }
      }
    }
  }
}

/** Lamps at the crossings and trees along the avenues. */
export function furniture(b, plan) {
  for (const l of plan.lamps) lamp(b, l.x, l.z, l.ry);
  for (const t of plan.trees) tree(b, t.x, t.z, t.s);
}

// ---------------------------------------------------------------------------
// The harbour
// ---------------------------------------------------------------------------

const BOX_COLORS = [C.blue, C.red, C.orange, C.green, C.steel, C.yellow, 0x7a4a8a, C.white];

function gantry(b, x, z) {
  // a ship-to-shore crane: two legs, a high beam reaching over the water (−z)
  b.at(x, 0, z, 0, () => {
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.6, 0.6]) b.box(sx, 0.08, sz, 0.14, 2.6, 0.14, C.orange, { ao: 0.9 });
    b.box(0, 2.6, 0, 1.7, 0.2, 1.5, C.orange, { ao: 1 });
    b.box(0, 2.8, -1.4, 0.26, 0.2, 5.2, C.orange, { ao: 1 });
    b.box(0, 3.0, 0.3, 0.5, 0.5, 0.7, C.white, { ao: 1 });
    b.box(0, 2.4, -2.2, 0.36, 0.3, 0.5, C.dark, { ao: 1 });
    b.box(0, 1.2, -2.2, 0.04, 1.2, 0.04, C.dark, { ao: 1 });
  });
}

function ship(b, x, z, len, color) {
  b.at(x, WATER_LEVEL, z, Math.PI / 2, () => {
    b.box(0, 0, 0, 1.9, 0.8, len, C.dark, { ao: 0.9 });
    b.box(0, 0.8, 0, 1.94, 0.12, len + 0.04, color, { ao: 1 });
    b.wedge(0, 0, len / 2 + 0.6, 1.9, 0.92, 1.2, C.dark, { top: color });
    b.box(0, 0.92, -len / 2 + 1.0, 1.6, 1.1, 1.3, C.white, { ao: 0.9, top: C.roofLight });
    b.windows(0, 1.3, -len / 2 + 1.655, 0, 1.4, 0.6, 5, 2, { color: C.glassDark, lit: 0.7 });
    b.cyl(0, 2.0, -len / 2 + 0.8, 0.22, 0.6, color, { seg: 8 });
    for (let s = -len / 2 + 2.4; s < len / 2 - 0.4; s += 1.4) {
      for (const sx of [-0.52, 0.52]) {
        const high = 1 + Math.floor(b.rand() * 2.4);
        for (let k = 0; k < high; k++) container(b, sx, 0.92 + k * 0.5, s, 0, BOX_COLORS[Math.floor(b.rand() * BOX_COLORS.length)]);
      }
    }
  });
}

export function port(b, plan) {
  const p = plan.port;
  if (!p) return;
  const x0 = p.x - p.w / 2;
  const z0 = p.z - p.d / 2; // the water's edge
  b.box(p.x, WATER_LEVEL, p.z + 0.5, p.w, -WATER_LEVEL + 0.08, p.d + 1, C.concrete, { ao: 0.8, top: C.concrete });
  b.plane(p.x, 0.085, z0 + 0.3, p.w, 0.12, C.yellow);
  for (let x = x0 + 1; x < x0 + p.w; x += 3) b.box(x, 0.08, z0 + 0.12, 0.14, 0.14, 0.14, C.dark, { ao: 1 }); // bollards
  const cranes = Math.max(2, Math.round(p.w / 12));
  for (let i = 0; i < cranes; i++) gantry(b, x0 + ((i + 0.5) * p.w) / cranes, z0 + 1.0);
  // stacks of containers and two sheds behind the cranes
  for (let x = x0 + 1.2; x < x0 + p.w - 9; x += 1.5) {
    if (b.rand() < 0.2) continue;
    const high = 1 + Math.floor(b.rand() * 3);
    for (let k = 0; k < high; k++) container(b, x, 0.08 + k * 0.5, p.z + 1.3 + (b.rand() - 0.5) * 0.2, Math.PI / 2, BOX_COLORS[Math.floor(b.rand() * BOX_COLORS.length)]);
    if (b.rand() < 0.5) container(b, x, 0.08, p.z + 0.4, Math.PI / 2, BOX_COLORS[Math.floor(b.rand() * BOX_COLORS.length)]);
  }
  for (const sx of [5.4, 2.0]) {
    b.gable(x0 + p.w - sx, 0.08, p.z + 1.2, 2.6, 2.2, 0.9, 0.5, C.panel, C.roofGrey, { axis: 'z' });
    b.box(x0 + p.w - sx, 0.08, p.z + 0.09, 1.0, 0.7, 0.03, C.steelDark, { ao: 1 });
  }
  lorry(b, x0 + p.w * 0.3, p.z + 2.55, Math.PI / 2, C.blue);
  ship(b, p.x - p.w * 0.18, z0 - 1.5, Math.min(13, p.w * 0.36), C.red);
  if (p.w > 30) ship(b, p.x + p.w * 0.28, z0 - 1.5, 9, C.blue);
  // a lighthouse on the mole at the western end
  b.box(x0 - 3, WATER_LEVEL, z0 - 2, 1.4, -WATER_LEVEL + 0.1, 9, C.rock, { ao: 0.85 });
  b.cyl(x0 - 3, 0.1, z0 - 5.6, 0.42, 2.2, C.white, { seg: 10, r2: 0.3 });
  b.cyl(x0 - 3, 0.9, z0 - 5.6, 0.39, 0.5, C.red, { seg: 10, r2: 0.35, cap: false });
  b.cyl(x0 - 3, 2.3, z0 - 5.6, 0.36, 0.08, C.dark, { seg: 10 });
  b.layer('glow').cyl(x0 - 3, 2.38, z0 - 5.6, 0.22, 0.3, C.lampWarm, { seg: 8 }).layer('solid');
  b.cyl(x0 - 3, 2.38, z0 - 5.6, 0.2, 0.3, C.glassLight, { seg: 8 });
  b.cone(x0 - 3, 2.68, z0 - 5.6, 0.34, 0.3, C.red, { seg: 10 });
}

// ---------------------------------------------------------------------------
// Open country
// ---------------------------------------------------------------------------

/** A rocky hill with a few pines, filling a w × d patch. */
export function hill(b, w, d) {
  const n = 3 + Math.floor(b.rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = (Math.min(w, d) / 2) * (0.45 + b.rand() * 0.5);
    const x = (b.rand() - 0.5) * (w - 2 * r);
    const z = (b.rand() - 0.5) * (d - 2 * r);
    const h = r * (0.7 + b.rand() * 0.7);
    b.cyl(x, 0, z, r, h * 0.55, i % 2 ? C.rock : C.rockDark, { seg: 7, r2: r * 0.6, smooth: false, ao: 0.82, top: C.grassDark });
    b.cyl(x + r * 0.08, h * 0.55, z - r * 0.05, r * 0.6, h * 0.45, C.rock, { seg: 6, r2: r * 0.2, smooth: false, ao: 0.9, top: h > 3.4 ? C.snow : C.rockDark });
  }
  for (let i = 0; i < 6; i++) pine(b, (b.rand() - 0.5) * (w - 1), (b.rand() - 0.5) * (d - 1), 0.7 + b.rand() * 0.5);
}

// ---------------------------------------------------------------------------
// Plots
// ---------------------------------------------------------------------------

/** A free building plot: mown grass, corner posts and a board by the street. */
export function freePlot(b, lot) {
  b.at(lot.x, 0, lot.z, lot.ry, () => {
    const w = lot.w - 0.3;
    const d = lot.d - 0.3;
    b.box(0, 0, 0, w, 0.03, d, C.grassLight, { ao: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box((sx * w) / 2, 0, (sz * d) / 2, 0.1, 0.3, 0.1, C.white, { ao: 1 });
    // a dashed border
    for (let s = -w / 2 + 0.5; s < w / 2 - 0.2; s += 1.0) {
      b.plane(s, 0.034, d / 2, 0.5, 0.07, C.white);
      b.plane(s, 0.034, -d / 2, 0.5, 0.07, C.white);
    }
    for (let s = -d / 2 + 0.5; s < d / 2 - 0.2; s += 1.0) {
      b.plane(w / 2, 0.034, s, 0.07, 0.5, C.white);
      b.plane(-w / 2, 0.034, s, 0.07, 0.5, C.white);
    }
    // the board: "for sale"
    b.box(w / 2 - 0.7, 0, d / 2 - 0.25, 0.05, 0.55, 0.05, C.woodDark, { ao: 1 });
    b.box(w / 2 - 0.25, 0, d / 2 - 0.25, 0.05, 0.55, 0.05, C.woodDark, { ao: 1 });
    b.box(w / 2 - 0.475, 0.5, d / 2 - 0.25, 0.62, 0.34, 0.04, C.white, { ao: 1 });
    b.box(w / 2 - 0.475, 0.7, d / 2 - 0.228, 0.5, 0.08, 0.01, C.red, { ao: 1 });
  });
}

/** Scaffolding and a crane beside a building that is being enlarged. */
export function upgradeWorks(b, lot, height = 1.5) {
  const x = -lot.w / 2 + 0.45;
  const z = -lot.d / 2 + 0.45;
  const top = height + 1.6;
  b.box(x, 0, z, 0.5, 0.12, 0.5, C.concreteDark, { ao: 1 });
  b.box(x, 0.12, z, 0.16, top, 0.16, C.yellow, { ao: 0.95 });
  b.box(x + 0.9, top, z, 2.6, 0.14, 0.14, C.yellow, { ao: 1 });
  b.box(x - 0.5, top - 0.1, z, 0.5, 0.34, 0.3, C.concreteDark, { ao: 1 });
  b.box(x + 1.7, top - 0.9, z, 0.03, 0.9, 0.03, C.dark, { ao: 1 });
  b.box(x + 1.7, top - 1.1, z, 0.3, 0.2, 0.3, C.wood, { ao: 1 });
  b.box(x + 0.05, top + 0.12, z, 0.3, 0.3, 0.3, C.white, { ao: 1 });
}
