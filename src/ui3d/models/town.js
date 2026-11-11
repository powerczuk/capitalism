// The town around the player's buildings: houses, blocks of flats, offices,
// shops, warehouses, parks. They are drawn by the hundred, so they are simple.
//
// `parcel(b, kind, w, d)` draws one parcel into the Builder it is given — the
// scene stamps a whole town into one Builder, so nothing here keeps state:
// every choice (colours, heights, what stands in the garden) comes from
// `b.rand()`, and every kind watches a triangle budget (see `allowance`).

import { C } from '../palette.js';
import { mix, shade } from '../kit.js';
import { registerModel } from './index.js';
import { flag, hedge } from './props.js';

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;
const G = 0.04; // top of the slab every parcel lays as its ground
const LIFT = 0.012; // how far a decal lies above the surface it is painted on

// --- chance ------------------------------------------------------------------

const pick = (b, list) => list[Math.floor(b.rand() * list.length)];
const between = (b, lo, hi) => lo + b.rand() * (hi - lo);
const whole = (b, lo, hi) => lo + Math.floor(b.rand() * (hi - lo + 1));
const maybe = (b, p = 0.5) => b.rand() < p;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * The triangle allowance of a parcel: `room(n)` tells whether n more still
 * fit. Limits are quoted for a 5 × 5 parcel; a bigger one gets more in
 * proportion, a smaller one somewhat less (a small house is still a house).
 */
function allowance(b, limit, w, d) {
  const start = b.triangles;
  const share = (w * d) / 25;
  const max = limit * (share > 1 ? share : Math.max(0.5, Math.sqrt(share)));
  return (n) => b.triangles - start + n <= max;
}

/**
 * Scattered places on a w × d area centred on the origin: one in every cell
 * of a grid about `step` wide, nudged about, in random order. They keep
 * `margin` away from the edge.
 */
function spots(b, w, d, step, margin = 0.5, loose = 0.6) {
  const nx = Math.max(1, Math.round(w / step));
  const nz = Math.max(1, Math.round(d / step));
  const iw = Math.max(0, w - margin * 2);
  const id = Math.max(0, d - margin * 2);
  const out = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      out.push([(-0.5 + (i + 0.5 + (b.rand() - 0.5) * loose) / nx) * iw, (-0.5 + (j + 0.5 + (b.rand() - 0.5) * loose) / nz) * id]);
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(b.rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Big parcels are cut into cells about `size` across, each drawn on its own (10 × 5 holds two blocks). */
function cells(b, w, d, size, fn) {
  const nx = Math.max(1, Math.round(w / size));
  const nz = Math.max(1, Math.round(d / size));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) b.at(-w / 2 + ((i + 0.5) * w) / nx, 0, -d / 2 + ((j + 0.5) * d) / nz, 0, () => fn(w / nx, d / nz));
  }
}

// --- colours -------------------------------------------------------------------

const PLASTERS = [C.plaster, C.plasterWarm, C.plasterRose, C.plasterCool, C.plasterMint, C.white];
const BRICKS = [C.brick, C.brickDark, mix(C.brick, C.plasterWarm, 0.3)];
const STONES = [C.stone, mix(C.stone, C.plasterWarm, 0.4), shade(C.stone, 0.9)];
const SHEDS = [C.panel, C.panelDark, C.plasterCool, C.plaster, mix(C.panel, C.blue, 0.2), mix(C.panel, C.green, 0.18), mix(C.plasterWarm, C.panel, 0.5)];
const TILES = [C.roofRed, C.roofRed, C.roofBrown, C.roofGrey, C.roofDark, shade(C.roofRed, 1.12)];
const FLATS = [C.roofFlat, C.roofLight, C.roofGrey, C.gravel];
const LAWNS = [C.grass, C.grass, C.grassLight, mix(C.grass, C.grassDark, 0.5)];
const YARDS = [C.asphalt, C.concrete, C.concreteDark, C.gravel];
const BRIGHTS = [C.red, C.green, C.blue, C.orange, C.yellow, C.roofGreen, shade(C.red, 0.75), C.white];
const DOORS = [C.woodDark, C.wood, C.dark, C.white, shade(C.red, 0.8), shade(C.blue, 0.75), shade(C.green, 0.7)];
const LEAVES = [C.leaf, C.leafDark, C.leafLight, 0x5f9a4c]; // the greens of props.js `tree`
const PAINTS = [0xd9d6cf, 0x3c4650, 0xb7392f, 0x2f5e9e, 0x8a8f95, 0xe2e4e6, 0x25292e, 0x4d7a57, 0xc9a23a, 0x7a4a36]; // the paints of props.js `car`
const FREIGHT = [C.blue, C.red, C.green, C.orange, C.steel, C.brickDark];
const GLAZING = [C.glassLight, mix(C.glassLight, C.white, 0.3), mix(C.glassLight, C.green, 0.2), mix(C.glassLight, C.blue, 0.2), mix(C.glass, C.glassLight, 0.75)]; // curtain walls
const FRAMES = [mix(C.glass, C.steelDark, 0.5), C.steel, C.panel, C.glassDark]; // and what holds their panes
const SOLAR = 0x27405c; // the panels of retail.js `solar`
const SHOP_GLASS = mix(C.glass, C.glassLight, 0.45);
const OFFICE_LIGHT = mix(C.lampWarm, C.lampCool, 0.6);
const HOME = { gapY: 0.42, lit: 0.5 }; // windows of a dwelling

// --- small shapes ----------------------------------------------------------------

/** The ground of a parcel. */
function slab(b, w, d, color) {
  b.box(0, 0, 0, w, G, d, color, { ao: 1 });
}

/** A flat rectangle on a wall facing `ry`: doors, signs, shutters. (x, y, z) is the middle of its lower edge. */
function decal(b, x, y, z, ry, w, h, color, out = 0.014) {
  b.at(x, y, z, ry, () => b.quad([-w / 2, 0, out], [w / 2, 0, out], [w / 2, h, out], [-w / 2, h, out], color));
}

/**
 * Windows of a set width. The kit's `windows` sizes them as a share of the
 * wall, which makes the one window of a long wall very wide.
 */
function panes(b, x, y, z, ry, width, height, cols, rows, opts, pane = 0.27) {
  b.windows(x, y, z, ry, width, height, cols, rows, { ...opts, gapX: clamp(1 - (pane * cols) / width, 0.06, 0.94) });
}

/** A flat disc (an ellipse, or a slice of one from angle a0 to a1) lying on height y. */
function disc(b, x, y, z, rx, rz, color, seg = 8, a0 = 0, a1 = TAU) {
  for (let i = 0; i < seg; i++) {
    const p = a0 + ((a1 - a0) * i) / seg;
    const q = a0 + ((a1 - a0) * (i + 1)) / seg;
    b.tri([x, y, z], [x + Math.cos(q) * rx, y, z + Math.sin(q) * rz], [x + Math.cos(p) * rx, y, z + Math.sin(p) * rz], color);
  }
}

/** A round face on a wall facing `ry` (a clock, a rose window); `glow` lights it at night. */
function dial(b, x, y, z, ry, r, color, seg = 6, glow = 0) {
  const fan = (out, tone) => {
    for (let i = 0; i < seg; i++) {
      const p = (i / seg) * TAU;
      const q = ((i + 1) / seg) * TAU;
      b.tri([0, 0, out], [Math.cos(p) * r, Math.sin(p) * r, out], [Math.cos(q) * r, Math.sin(q) * r, out], tone);
    }
  };
  b.at(x, y, z, ry, () => {
    fan(0.014, color);
    if (glow && b.night) {
      b.layer('glow');
      fan(0.022, glow);
      b.layer('solid');
    }
  });
}

/** A cone in `seg` triangles (the kit's `cone` spends two on every side). */
function spike(b, x, y, z, r, h, color, seg = 5) {
  for (let i = 0; i < seg; i++) {
    const p = (i / seg) * TAU;
    const q = ((i + 1) / seg) * TAU;
    b.tri([x + Math.cos(q) * r, y, z + Math.sin(q) * r], [x + Math.cos(p) * r, y, z + Math.sin(p) * r], [x, y + h, z], color);
  }
}

/** A lump of foliage: an icosahedron, darker underneath. Twenty triangles look rounder this way than as a `ball`. */
function lump(b, x, y, z, r, color, sy = 1) {
  const up = [];
  const low = [];
  for (let i = 0; i < 5; i++) {
    const p = (i / 5) * TAU;
    const q = p + TAU / 10;
    up.push([x + Math.cos(p) * r * 0.894, y + r * 0.447 * sy, z + Math.sin(p) * r * 0.894]);
    low.push([x + Math.cos(q) * r * 0.894, y - r * 0.447 * sy, z + Math.sin(q) * r * 0.894]);
  }
  const top = [x, y + r * sy, z];
  const bottom = [x, y - r * sy, z];
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    b.tri(top, up[j], up[i], color);
    b.tri(up[i], up[j], low[i], shade(color, 0.95));
    b.tri(low[i], up[j], low[j], shade(color, 0.89));
    b.tri(bottom, low[i], low[j], shade(color, 0.82));
  }
}

// --- cheap props -------------------------------------------------------------------
// props.js spends 80 triangles on a car and 86 on a tree: right for the one
// building a player is looking at, too much for a town of hundreds. These are
// the same things, the same size and colours, for a third of the price.

/** A leafy tree, about 1.45 high at s = 1. */
function leafy(b, x, z, s = 1, trunk = true) {
  const green = pick(b, LEAVES);
  const tall = between(b, 0.95, 1.25);
  b.at(x, G, z, b.rand() * TAU, () => {
    if (trunk) b.cyl(0, 0, 0, 0.055, 0.5, C.trunk, { seg: 3, r2: 0.04, cap: false });
    lump(b, 0, 0.4 + 0.47 * tall, 0, 0.47, green, tall);
  }, s);
}

/** A conifer, 1.65 high at s = 1. */
function conifer(b, x, z, s = 1, trunk = true) {
  const green = maybe(b) ? C.pine : C.pineDark;
  b.at(x, G, z, b.rand() * TAU, () => {
    if (trunk) b.cyl(0, 0, 0, 0.05, 0.3, C.trunk, { seg: 3, cap: false });
    spike(b, 0, 0.24, 0, 0.45, 0.75, green, 6);
    spike(b, 0, 0.68, 0, 0.35, 0.62, shade(green, 1.07), 6);
    spike(b, 0, 1.08, 0, 0.23, 0.55, shade(green, 1.14), 6);
  }, s);
}

/** A bush: a low dome. */
function shrub(b, x, z, r = 0.2) {
  b.ball(x, G, z, r, maybe(b) ? C.leaf : C.leafDark, { seg: 5, rings: 2, half: true, sy: 0.85 });
}

/** A tree in a planter, for paved places. */
function planter(b, x, z, s = 0.85, tub = C.concreteDark) {
  b.box(x, G, z, 0.44, 0.13, 0.44, tub, { top: C.soilDark, ao: 0.9 });
  b.at(x, 0.1, z, 0, () => leafy(b, 0, 0, s));
}

/** A parked car, 0.9 long, facing `ry`. */
function parked(b, x, z, ry = 0) {
  const paint = pick(b, PAINTS);
  b.at(x, G, z, ry, () => {
    b.box(0, 0, 0, 0.4, 0.1, 0.72, C.black, { ao: 1 }); // wheels, and the shade under the car
    b.box(0, 0.06, 0, 0.42, 0.15, 0.9, paint, { ao: 0.8 });
    b.box(0, 0.21, -0.04, 0.37, 0.12, 0.46, C.glassDark, { ao: 1, top: shade(paint, 0.92) });
  });
}

/** A delivery van, 1.05 long; `stripe` paints a band along its sides (an ambulance). */
function van(b, x, z, ry = 0, body = C.white, stripe = 0) {
  b.at(x, G, z, ry, () => {
    b.box(0, 0, 0, 0.42, 0.1, 0.84, C.black, { ao: 1 });
    b.box(0, 0.06, 0, 0.46, 0.36, 1.05, body, { ao: 0.82 });
    b.box(0, 0.25, 0.4, 0.47, 0.12, 0.26, C.glassDark, { ao: 1 });
    if (stripe) {
      decal(b, 0.23, 0.14, -0.1, HALF, 0.8, 0.08, stripe, LIFT);
      decal(b, -0.23, 0.14, -0.1, -HALF, 0.8, 0.08, stripe, LIFT);
    }
  });
}

/** A box truck, 1.5 long. */
function truck(b, x, z, ry = 0, body = C.white) {
  b.at(x, G, z, ry, () => {
    b.box(0, 0, 0, 0.46, 0.12, 1.3, C.black, { ao: 1 });
    b.box(0, 0.07, 0.54, 0.46, 0.36, 0.4, C.plasterCool, { ao: 0.85 });
    b.box(0, 0.27, 0.62, 0.47, 0.12, 0.25, C.glassDark, { ao: 1 });
    b.box(0, 0.07, -0.2, 0.52, 0.58, 1.04, body, { ao: 0.85, top: shade(body, 0.85) });
  });
}

/** A bus, 1.5 long. */
function bus(b, x, z, ry = 0, body = C.yellow) {
  b.at(x, G, z, ry, () => {
    b.box(0, 0, 0, 0.46, 0.12, 1.3, C.black, { ao: 1 });
    b.box(0, 0.07, 0, 0.5, 0.42, 1.5, body, { ao: 0.85 });
    b.box(0, 0.27, 0, 0.51, 0.13, 1.51, C.glassDark, { ao: 1 });
  });
}

/** A lamp on a post, glowing at night. */
function lantern(b, x, z, h = 0.85) {
  b.cyl(x, G, z, 0.025, h, C.steelDark, { seg: 3, cap: false });
  b.lamp(x, G + h, z, 0.11, 0.09, 0.11, C.lampWarm);
}

/** A bench; `ry` turns it. */
function bench(b, x, z, ry = 0) {
  b.box(x, G, z, 0.38, 0.1, 0.13, C.wood, { ry, ao: 0.7 });
}

/** A fountain: a round basin, water, a jet in the middle. */
function fountain(b, x, z, r) {
  b.cyl(x, G, z, r, 0.11, C.stone, { seg: 8 });
  b.layer('water');
  disc(b, x, G + 0.11 + LIFT, z, r * 0.84, r * 0.84, C.water, 8);
  b.layer('solid');
  b.cyl(x, G, z, r * 0.14, 0.34, C.stone, { seg: 4 });
  spike(b, x, G + 0.34, z, r * 0.3, 0.2, C.foam, 4);
}

const EDGE_TONE = { picket: C.white, wood: C.wood, wall: C.stone, kerb: C.curb };

/** A boundary from (x1, z1) to (x2, z2): a clipped hedge, a fence or a low wall, one box each. */
function boundary(b, x1, z1, x2, z2, type) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (type === 'none' || len < 0.2) return;
  if (type === 'hedge') hedge(b, x1, z1, x2, z2, 0.21);
  else b.box((x1 + x2) / 2, G, (z1 + z2) / 2, 0.05, type === 'kerb' ? 0.07 : 0.16, len, EDGE_TONE[type], { ry: Math.atan2(x2 - x1, z2 - z1), ao: 1 });
}

/** Marked parking bays in a row along x, centred on (x, z); a share `fill` of them is taken. */
function bays(b, x, z, n, fill, room, y = G + LIFT) {
  const pitch = 0.56;
  const x0 = x - (n * pitch) / 2;
  if (room(2 * n + 2)) for (let i = 0; i <= n; i++) b.plane(x0 + i * pitch, y, z, 0.035, 0.95, C.marking);
  for (let i = 0; i < n; i++) {
    if (maybe(b, fill) && room(30)) parked(b, x0 + (i + 0.5) * pitch, z + between(b, -0.05, 0.05), maybe(b) ? 0 : Math.PI);
  }
}

/** A flat roof: the wall's own top shows as the parapet round an inset field; plant stands on it. */
function flatRoof(b, x, y, z, w, d, room, plant = 2) {
  b.plane(x, y + LIFT, z, w - 0.14, d - 0.14, pick(b, FLATS));
  let boxes = 0;
  for (const [px, pz] of spots(b, w, d, 0.72, 0.36, 0.3)) {
    if (boxes < plant && room(10)) {
      if (boxes++ === 0 && w > 1.2 && d > 1.2) b.box(x + px, y, z + pz, 0.5, 0.26, 0.4, C.panelDark, { top: C.steelDark, ao: 0.9 }); // stair head
      else b.box(x + px, y, z + pz, 0.26, 0.14, 0.26, C.panel, { top: C.steelDark, ao: 0.9 }); // air conditioning
    } else if (maybe(b, 0.3) && room(2)) {
      // solar panels or a skylight: flat, so next to free
      if (maybe(b)) b.plane(x + px, y + LIFT * 2, z + pz, 0.44, 0.3, SOLAR);
      else b.plane(x + px, y + LIFT * 2, z + pz, 0.22, 0.42, C.glassLight);
    }
  }
}

/** A lit lobby front and the canopy over it, on a wall facing +z. */
function lobby(b, x, z, w, reach, tone) {
  b.windows(x, G + 0.03, z + 0.022, 0, w, 0.5, 3, 1, { color: C.glassLight, lit: 1, gapX: 0.08, gapY: 0, glow: C.lampWarm });
  if (reach > 0.15) b.box(x, G + 0.57, z + reach / 2 - 0.01, w + 0.3, 0.06, reach, tone, { ao: 1 });
}

// ---------------------------------------------------------------------------
// Homes
// ---------------------------------------------------------------------------

const EDGES = ['hedge', 'hedge', 'picket', 'wood', 'wall', 'none'];
const FORMS = ['x', 'x', 'z', 'hip'];

/**
 * One house on its plot (pw × pd, the street at +z): the house to one side,
 * the drive down the other (`side`), a garden behind.
 * o: side, roof, edge, paving, lane (the drive runs on to a plot behind), rear (reached by that lane)
 */
function homestead(b, pw, pd, o) {
  const start = b.triangles;
  const room = (n) => b.triangles - start + n <= 146;
  const { side } = o;
  const drive = pw >= 2;
  const hw = clamp(between(b, 1.15, 1.6), 0.7, pw - (drive ? 0.9 : 0.45));
  const hd = clamp(between(b, 1.0, 1.4), 0.7, pd - 0.85);
  const setback = clamp(pd > 3.5 ? between(b, 0.6, 1.1) : between(b, 0.42, 0.62), 0.25, Math.max(0.25, pd - hd - 0.35));
  const hx = drive ? -side * (pw / 2 - 0.28 - hw / 2) : 0;
  const hz = pd / 2 - setback - hd / 2;
  const front = hz + hd / 2;
  const back = hz - hd / 2;
  const street = pd / 2;
  const storeys = maybe(b, 0.42) ? 2 : 1;
  const wallH = 0.1 + storeys * 0.56;
  const wall = maybe(b, 0.22) ? pick(b, BRICKS) : pick(b, PLASTERS);
  const form = pick(b, FORMS);

  // walls and roof, the chimney on the ridge
  let roofH;
  if (form === 'hip') {
    roofH = Math.min(hw, hd) * between(b, 0.4, 0.52);
    b.box(hx, G, hz, hw, wallH, hd, wall);
    b.hip(hx, G + wallH, hz, hw + 0.16, hd + 0.16, roofH, o.roof, Math.max(0, hw - hd) + 0.12);
  } else {
    roofH = (form === 'x' ? hd : hw) * between(b, 0.36, 0.48);
    b.gable(hx, G, hz, hw, hd, wallH, roofH, wall, o.roof, { axis: form });
  }
  const cx = hx + (form === 'z' ? 0 : pick(b, [-1, 1]) * (form === 'hip' ? Math.max(0, hw - hd) * 0.4 : hw * 0.26));
  const cz = hz + (form === 'z' ? pick(b, [-1, 1]) * hd * 0.24 : 0);
  b.box(cx, G + wallH + roofH * 0.45, cz, 0.13, roofH * 0.55 + 0.14, 0.13, maybe(b, 0.6) ? C.brickDark : shade(wall, 0.9), { ao: 1 });

  // windows all round; the door between the two at the front
  const wy = G + 0.14;
  const wh = wallH - 0.2;
  const wide = hw >= 1.05;
  if (wide) panes(b, hx, wy, front, 0, hw - 0.2, wh, 2, storeys, HOME);
  else panes(b, hx + hw / 4, wy, front, 0, hw / 2 - 0.1, wh, 1, storeys, HOME, 0.2);
  const doorX = wide ? hx : hx - hw / 4;
  decal(b, doorX, G, front, 0, 0.19, 0.4, pick(b, DOORS));
  panes(b, hx, wy, back, Math.PI, hw - 0.2, wh, wide ? 2 : 1, storeys, HOME);
  const deep = storeys === 1 && hd > 1.15 ? 2 : 1;
  panes(b, hx + hw / 2, wy, hz, HALF, hd - 0.3, wh, deep, storeys, HOME);
  panes(b, hx - hw / 2, wy, hz, -HALF, hd - 0.3, wh, deep, storeys, HOME);

  // the drive, and the path from the door: to the street, or across to the lane
  const dx = side * (pw / 2 - 0.3);
  const y = G + LIFT;
  let driveEnd = street;
  if (drive) {
    const len = o.lane ? pd : Math.min(pd - 0.1, setback + hd * 0.85);
    driveEnd = street - len;
    b.plane(dx, y, street - len / 2, 0.44, len, o.paving);
  }
  if (o.rear && drive) b.plane((doorX + dx - side * 0.22) / 2, y, front + 0.2, Math.abs(dx - side * 0.22 - doorX) + 0.2, 0.2, C.pavement);
  else b.plane(doorX, y, (front + street) / 2, 0.2, street - front, C.pavement);

  // the boundary along the street, open at the path and the drive
  const inner = drive ? dx - side * 0.27 : (side * pw) / 2;
  if (o.rear && drive) boundary(b, (-side * pw) / 2, street - 0.1, inner, street - 0.1, o.edge);
  else {
    boundary(b, (-side * pw) / 2, street - 0.1, doorX - side * 0.17, street - 0.1, o.edge);
    boundary(b, doorX + side * 0.17, street - 0.1, inner, street - 0.1, o.edge);
  }

  // a garage at the end of the drive, or a car on it
  let shedded = false;
  if (drive && !o.lane) {
    if (driveEnd - 0.62 > -pd / 2 && maybe(b, 0.3) && room(12)) {
      b.box(dx, G, driveEnd - 0.3, 0.5, 0.42, 0.6, shade(wall, 0.95), { top: C.roofFlat });
      decal(b, dx, G, driveEnd, 0, 0.38, 0.32, C.panelDark);
      shedded = true;
    }
    if (maybe(b, 0.55) && room(30)) parked(b, dx, street - 0.6 - b.rand() * Math.max(0, street - driveEnd - 1.15), maybe(b, 0.7) ? 0 : Math.PI);
  }

  // the garden behind the house
  const gz0 = -pd / 2 + 0.12;
  const depth = back - 0.12 - gz0;
  const outer = -side * (pw / 2 - 0.5);
  if (depth > 1.5) {
    // a deep garden: a terrace behind the house, then a pool or vegetable beds, a shed, trees at the far end
    b.plane(hx, y, back - 0.24, hw * 0.8, 0.44, C.pavement);
    const what = whole(b, 0, 2);
    const gx = hx + side * 0.1;
    const gz = back - 0.95;
    if (what === 0 && depth > 1.9) {
      b.plane(gx, y, gz, 0.84, 0.56, C.white);
      b.layer('water').plane(gx, y + LIFT, gz, 0.7, 0.42, C.water).layer('solid');
    } else if (what === 1 && depth > 2.1) {
      b.plane(gx, y, gz - 0.1, 0.8, 0.7, C.soil);
      for (const s of [-1, 0, 1]) b.plane(gx + s * 0.26, y + LIFT, gz - 0.1, 0.12, 0.62, C.cropGreen);
    }
    if (!shedded && maybe(b, 0.5) && room(10)) b.box(dx, G, gz0 + 0.28, 0.46, 0.34, 0.4, C.wood, { top: C.roofDark, ao: 0.9 });
    if (room(26)) leafy(b, outer + side * b.rand() * 0.3, gz0 + 0.45 + b.rand() * Math.max(0, depth - 2.2), between(b, 0.75, 1));
    if (maybe(b, 0.6) && room(24)) conifer(b, side * b.rand() * (pw / 2 - 0.85), gz0 + 0.4, between(b, 0.6, 0.85));
    for (const s of [-1, 1]) if (maybe(b, 0.5) && room(6)) disc(b, hx + s * hw * 0.3, y, gz0 + 0.2, 0.22, 0.12, pick(b, [C.red, C.yellow, C.white, C.plasterRose]), 6);
  } else if (depth > 0.5) {
    const s = clamp(depth * 0.95, 0.5, 0.9);
    const grow = maybe(b, 0.25) ? conifer : leafy;
    if (maybe(b, 0.6) && room(26)) grow(b, outer, gz0 + 0.47 * s, s);
    else if (!shedded && maybe(b, 0.4) && room(10)) b.box(dx, G, gz0 + 0.24, 0.44, 0.32, 0.36, C.wood, { top: C.roofDark, ao: 0.9 });
  }
  // something green by the front door
  if (maybe(b, 0.5) && room(15)) shrub(b, doorX - side * 0.4, front + 0.17, 0.15);
}

/** Detached houses with pitched roofs, each in its garden: one to a plot 2.5 wide, two where the plot is deep. */
function house(b, w, d) {
  slab(b, w, d, pick(b, LAWNS));
  const cols = Math.max(1, Math.round(w / 2.5));
  const pw = w / cols;
  const edge = pick(b, EDGES);
  const paving = pick(b, [C.gravel, C.concrete, C.pavement]);
  const roofs = [pick(b, TILES), pick(b, TILES)]; // a street shares its roofing
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (i + 0.5) * pw;
    const side = i % 2 ? -1 : 1; // the drives of neighbours lie side by side
    const o = () => ({ side, edge, paving, roof: pick(b, roofs) });
    if (d >= 4.4 && maybe(b, 0.5)) {
      b.at(x, 0, d / 4, 0, () => homestead(b, pw, d / 2, { ...o(), lane: true }));
      b.at(x, 0, -d / 4, 0, () => homestead(b, pw, d / 2, { ...o(), rear: true }));
    } else b.at(x, 0, 0, 0, () => homestead(b, pw, d, o()));
    // between neighbours: all the way where gardens meet, only at the back where drives do
    if (i + 1 < cols) boundary(b, x + pw / 2, -d / 2, x + pw / 2, side > 0 ? -d / 2 + d * 0.3 : d / 2 - 0.2, edge === 'none' ? 'wood' : edge);
  }
}

/** A terrace of narrow houses, alternating colours, long gardens behind. */
function rowhouses(b, w, d) {
  const room = allowance(b, 314, w, d);
  slab(b, w, d, pick(b, LAWNS));
  const total = w - 0.3;
  const count = Math.max(1, Math.round(total / between(b, 0.95, 1.2)));
  const groups = Math.ceil(count / 6); // a long terrace is broken by a passage
  const per = Math.ceil(count / groups);
  const gap = groups > 1 ? 0.5 : 0;
  const uw = (total - gap * (groups - 1)) / count;
  const hd = clamp(d * 0.4, 0.95, 1.9);
  const setback = clamp(d * 0.11, 0.25, 0.55);
  const hz = d / 2 - setback - hd / 2;
  const front = hz + hd / 2;
  const back = hz - hd / 2;
  const storeys = count <= 4 && maybe(b, 0.35) ? 3 : 2;
  const wallH = 0.1 + storeys * 0.56;
  const roofH = Math.min(0.62, hd * between(b, 0.3, 0.42));
  const roof = pick(b, TILES);
  const brick = maybe(b, 0.4);
  const walls = [pick(b, brick ? BRICKS : PLASTERS), pick(b, PLASTERS), pick(b, brick ? BRICKS : PLASTERS)];
  const y = G + LIFT;
  b.plane(0, y, d / 2 - setback / 2, w, setback, C.pavement);
  const xs = [];
  for (let i = 0; i < count; i++) {
    const x = -total / 2 + (i + 0.5) * uw + Math.floor(i / per) * gap;
    const first = i % per === 0;
    const last = i % per === per - 1 || i === count - 1;
    const flip = i % 2 ? 1 : -1; // houses come in mirrored pairs
    const tall = i % 2 ? 0.07 : 0; // neighbours differ in height, so their roofs never share a plane
    xs.push(x);
    b.gable(x, G, hz, uw, hd, wallH + tall, roofH, walls[i % walls.length], i % 2 ? shade(roof, 0.93) : roof, { over: 0.05 });
    // front: the door and a window below, two windows on each floor above
    const half = (uw - 0.16) / 2;
    panes(b, x, G + 0.66, front, 0, uw - 0.16, (storeys - 1) * 0.56, 2, storeys - 1, HOME, 0.23);
    panes(b, x + (flip * half) / 2, G + 0.14, front, 0, half, 0.5, 1, 1, HOME, 0.23);
    decal(b, x - (flip * half) / 2, G, front, 0, 0.18, 0.4, pick(b, DOORS));
    panes(b, x, G + 0.1, back, Math.PI, uw - 0.16, storeys * 0.56, 2, storeys, HOME, 0.23);
    if (first) panes(b, x - uw / 2, G + 0.66, hz, -HALF, hd - 0.5, (storeys - 1) * 0.56, 1, storeys - 1, HOME);
    if (last) panes(b, x + uw / 2, G + 0.66, hz, HALF, hd - 0.5, (storeys - 1) * 0.56, 1, storeys - 1, HOME);
    if (i % 2 === 0 && room(10)) b.box(x + (last ? 0 : uw / 2), G + wallH + roofH * 0.5, hz - hd * 0.1, 0.22, roofH * 0.5 + 0.2, 0.13, C.brickDark, { ao: 1 });
  }
  // gardens behind: a fence between neighbours, then whatever each household likes
  const garden = back + d / 2;
  if (garden < 0.5) return;
  for (let i = 0; i + 1 < count; i++) {
    if (i % per !== per - 1 && room(10)) boundary(b, xs[i] + uw / 2, -d / 2 + 0.02, xs[i] + uw / 2, back - 0.02, 'wood');
  }
  for (let i = 0; i < count; i++) {
    const what = whole(b, 0, 4);
    const gz = -d / 2 + 0.3 + b.rand() * Math.max(0, garden - 1.2);
    if (room(2)) b.plane(xs[i], y, back - 0.22, uw * 0.7, 0.36, C.pavement);
    if (what === 0 && garden > 1 && room(26)) leafy(b, xs[i], gz + 0.1, Math.min(0.8, uw * 0.72));
    else if (what === 1 && room(10)) b.box(xs[i] + uw * 0.14, G, -d / 2 + 0.26, uw * 0.5, 0.32, 0.36, C.wood, { top: C.roofDark, ao: 0.9 });
    else if (what === 2 && room(15)) shrub(b, xs[i] - uw * 0.2, gz, 0.16);
    else if (what === 3 && garden > 1.3 && room(2)) b.plane(xs[i], y, gz, uw * 0.55, 0.5, C.soil);
  }
}

/**
 * A block of flats on its cell of the parcel, its long front looking out
 * over +z. Balconies either run along every floor or stand in stacks.
 */
function flats(b, W, D, look) {
  const room = allowance(b, 468, W, D);
  const y = G + LIFT;
  const point = W < 3.3; // a small parcel takes a point block
  const storeys = clamp(look.storeys + whole(b, -1, 1), 3, point ? 5 : 6);
  const L = point ? clamp(Math.min(W, D) - 0.95, 1.2, 1.9) : clamp(W - between(b, 1.0, 1.5), 1.6, 4.4);
  const T = point ? L * between(b, 0.82, 1) : clamp(D * 0.33, 1.15, 1.7);
  const h = 0.14 + storeys * 0.58;
  const x = point ? 0 : between(b, -1, 1) * Math.max(0, (W - L) / 2 - 0.5);
  const lo = -D / 2 + 0.45 + T / 2;
  const hi = D / 2 - 0.75 - T / 2;
  const z = hi <= lo ? (lo + hi) / 2 : maybe(b, 0.6) ? lo + b.rand() * 0.3 * (hi - lo) : hi - b.rand() * 0.2 * (hi - lo);
  const front = z + T / 2;
  const back = z - T / 2;
  const usable = h - 0.2;
  const rowH = usable / storeys;
  const cols = Math.max(2, Math.round((L - 0.28) / 0.68));
  const cell = (L - 0.28) / cols;
  const colX = (c) => x - L / 2 + 0.14 + (c + 0.5) * cell;
  const win = { gapX: 0.36, gapY: 0.42, lit: 0.5 };

  b.box(x, G, z, L, h, T, look.wall, { top: shade(look.wall, 0.82) });
  b.windows(x, G + 0.14, back, Math.PI, L - 0.28, usable, cols, storeys, win);
  const ends = T > 1.45 ? 2 : 1;
  panes(b, x + L / 2, G + 0.14, z, HALF, T - 0.3, usable, ends, storeys, win);
  panes(b, x - L / 2, G + 0.14, z, -HALF, T - 0.3, usable, ends, storeys, win);

  // the front, column by column: an entrance, a stack of balconies, or plain windows
  const doors = cols >= 6 ? [1, cols - 2] : [Math.floor(cols / 2)];
  const phase = (doors[0] + 1) % 2;
  const stacks = look.balcony === 'stacks';
  for (let c = 0; c < cols; c++) {
    const cx = colX(c);
    if (doors.includes(c)) {
      b.windows(cx, G + 0.14 + rowH, front, 0, cell, usable - rowH, 1, storeys - 1, win);
      decal(b, cx, G, front, 0, 0.26, 0.44, C.glassDark);
      if (stacks) b.box(cx, G + 0.5, front + 0.13, 0.5, 0.05, 0.3, look.accent, { ao: 1 });
    } else if (stacks && (c + phase) % 2 === 0) {
      b.box(cx, G, front + 0.07, cell * 0.94, h - 0.1, 0.18, look.accent, { ao: 0.9 });
      b.windows(cx, G + 0.14, front + 0.16, 0, cell * 0.94 - 0.08, usable, 1, storeys, { gapX: 0, gapY: 0.42, color: C.glassDark, lit: 0.45 });
    } else b.windows(cx, G + 0.14, front, 0, cell, usable, 1, storeys, win);
  }
  if (!stacks) {
    for (let s = 1; s < storeys; s++) b.box(x, G + 0.14 + s * rowH - 0.03, front + 0.07, L - 0.4, 0.19, 0.18, s % 2 ? look.accent : look.rail, { ao: 1 });
  }
  if (look.pitched) b.hip(x, G + h, z, L + 0.2, T + 0.2, 0.3, look.roof, Math.max(0, L - T));
  else flatRoof(b, x, G + h, z, L, T, room, point ? 1 : 2);

  // paving along the entrance front, a path from each door to the street
  b.plane(x, y, front + 0.2, L + 0.3, 0.4, C.pavement);
  const before = D / 2 - front;
  const behind = back + D / 2;
  if (before > 0.45) for (const c of doors) b.plane(colX(c), y, front + 0.4 + (before - 0.4) / 2, 0.3, before - 0.4, C.pavement);

  // behind: a parking court where there is room for one
  const thrifty = (n) => room(n + 80); // leave something for the green
  if (behind >= 1.45 && thrifty(40)) {
    const court = behind - 0.3;
    b.plane(0, y, -D / 2 + 0.1 + court / 2, W - 0.3, court, C.asphalt);
    bays(b, 0, -D / 2 + 0.65, Math.max(2, Math.floor((W - 0.8) / 0.56)), between(b, 0.3, 0.7), thrifty, y + LIFT);
  }
  // in front: lawn with trees, a hedge along the street
  const lawn = before - 0.5;
  if (lawn > 0.3 && room(20)) {
    let from = -W / 2;
    for (const c of doors) {
      boundary(b, from, D / 2 - 0.1, colX(c) - 0.25, D / 2 - 0.1, 'hedge');
      from = colX(c) + 0.25;
    }
    boundary(b, from, D / 2 - 0.1, W / 2, D / 2 - 0.1, 'hedge');
  }
  if (lawn > 0.9) {
    for (const [tx, tz] of spots(b, W, lawn, 1.3, 0.5, 0.5)) {
      if (doors.some((c) => Math.abs(tx - colX(c)) < 0.55)) continue; // not on the paths
      if (maybe(b, 0.8) && room(26)) leafy(b, tx, front + 0.45 + lawn / 2 + tz * 0.6, between(b, 0.8, 1.05));
    }
  }
  for (const s of [-1, 1]) {
    const free = W / 2 - (s * x + L / 2); // lawn beside the end of the block
    if (free > 0.95 && room(26)) leafy(b, s * (W / 2 - free / 2), z + between(b, -0.3, 0.3) * T, clamp(free * 0.85, 0.7, 1.1));
  }
  if (lawn > 1.7 && room(22)) {
    // a playground: sand, a slide, something on a spring
    const px = colX(doors[0]) + (cols > 3 ? 1.0 : -0.9);
    const pz = D / 2 - 0.75;
    b.plane(px, y, pz, 0.8, 0.6, C.sand);
    b.wedge(px - 0.15, G, pz, 0.12, 0.26, 0.42, C.red);
    b.box(px + 0.22, G, pz + 0.1, 0.1, 0.14, 0.1, C.yellow, { ao: 1 });
  }
}

/** Blocks of flats, three to six storeys, with balconies, on a lawn. */
function apartments(b, w, d) {
  const wall = pick(b, [C.white, C.plaster, C.plasterCool, C.panel, C.plasterWarm, C.plasterMint]);
  // one estate, one look
  const look = {
    wall,
    accent: mix(pick(b, [C.orange, C.yellow, C.green, C.blue, C.red, C.roofGreen, C.brick]), C.white, between(b, 0.3, 0.55)),
    rail: pick(b, [C.white, C.panelDark, shade(wall, 0.85)]),
    balcony: maybe(b) ? 'stacks' : 'bands',
    storeys: whole(b, 3, 6),
    pitched: maybe(b, 0.25),
    roof: pick(b, TILES),
    lawn: pick(b, LAWNS),
  };
  cells(b, w, d, 5, (cw, cd) => {
    slab(b, cw, cd, look.lawn);
    // the long front follows the long side of the parcel; on a square one it mostly faces the street
    if (cd > cw * 1.3 || (cw <= cd * 1.3 && cw >= 3.3 && maybe(b, 0.3))) b.at(0, 0, 0, maybe(b) ? HALF : -HALF, () => flats(b, cd, cw, look));
    else flats(b, cw, cd, look);
  });
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

/** An office block: bands of glass, plant on the roof, parking behind. */
function office(b, W, D) {
  const room = allowance(b, 508, W, D);
  slab(b, W, D, C.pavement);
  const y = G + LIFT;
  const small = Math.min(W, D) < 3.3;
  const storeys = small ? whole(b, 3, 5) : whole(b, 4, 8);
  const bw = clamp(W - between(b, 0.9, 1.5), 1.3, 4.2);
  const bd = clamp(D - between(b, 1.6, 2.3), 1.2, 3.0);
  const x = between(b, -1, 1) * Math.max(0, (W - bw) / 2 - 0.4);
  const gap = Math.min(between(b, 0.5, 0.8), Math.max(0.3, (D - bd) / 2));
  const front = D / 2 - gap;
  const z = front - bd / 2;
  const back = front - bd;
  const h = 0.16 + storeys * 0.6;
  const style = pick(b, ['ribbon', 'ribbon', 'glass', 'grid']);
  const run = 2 * (bw + bd) * storeys; // length of window band all round, all floors
  let wall;
  let win;
  if (style === 'ribbon') {
    wall = pick(b, [C.white, C.panel, C.plaster, C.stone, C.plasterCool, C.plasterWarm]);
    win = { bay: Math.max(0.9, run / 100), margin: 0.07, gapX: 0.05, gapY: 0.44, color: C.glass };
  } else if (style === 'glass') {
    wall = pick(b, FRAMES);
    win = { bay: Math.max(0.75, run / 105), margin: 0.05, gapX: 0.08, gapY: 0.2, color: pick(b, GLAZING) };
  } else {
    wall = pick(b, [...BRICKS, ...STONES]);
    win = { bay: Math.max(0.58, run / 105), margin: 0.12, gapX: 0.36, gapY: 0.4 };
  }
  Object.assign(win, { rows: storeys, base: 0.12, cap: 0.04, lit: 0.4, glow: OFFICE_LIGHT });
  const rim = style === 'glass' ? C.panel : shade(wall, 0.82);

  // one block, or a tall part with a lower wing beside it
  const wing = bw >= 2.6 && maybe(b, 0.45);
  const s = maybe(b) ? 1 : -1;
  const mw = wing ? bw * between(b, 0.55, 0.68) : bw;
  const mx = wing ? x + (s * (bw - mw)) / 2 : x;
  if (style === 'glass') b.layer('glass');
  b.block(mx, G, z, mw, h, bd, wall, { top: rim, win: { ...win, faces: wing ? (s > 0 ? 'fbr' : 'fbl') : 'fblr' } });
  let low = 0;
  if (wing) {
    const floors = Math.max(2, Math.round(storeys * between(b, 0.35, 0.6)));
    const wd = bd * between(b, 0.75, 1);
    low = 0.16 + floors * 0.6;
    b.block(x - (s * mw) / 2, G, front - wd / 2, bw - mw, low, wd, wall, { top: rim, win: { ...win, rows: floors, faces: s > 0 ? 'fbl' : 'fbr' } });
    b.layer('solid');
    flatRoof(b, x - (s * mw) / 2, G + low, front - wd / 2, bw - mw, wd, room, 1);
  }
  b.layer('solid');
  flatRoof(b, mx, G + h, z, mw, bd, room, 3);
  if (maybe(b, 0.5) && room(6)) b.cyl(mx + mw * 0.3, G + h, z - bd * 0.3, 0.025, between(b, 0.5, 0.9), C.steelDark, { seg: 3, cap: false });
  lobby(b, mx, front, Math.min(0.9, mw - 0.3), Math.min(0.42, gap - 0.08), C.white);

  // behind: the car park; in front and beside: trees in tubs
  const behind = back + D / 2;
  const thrifty = (n) => room(n + 60);
  if (behind >= 1.3 && thrifty(40)) {
    b.plane(0, y, -D / 2 + behind / 2, W - 0.2, behind - 0.2, C.asphalt);
    bays(b, 0, -D / 2 + 0.65, Math.max(2, Math.floor((W - 0.6) / 0.56)), between(b, 0.3, 0.8), thrifty, y + LIFT);
  }
  for (const side of [-1, 1]) {
    const free = W / 2 - (side * x + bw / 2);
    if (free > 0.62 && room(36)) planter(b, side * (W / 2 - free / 2), front - 0.35 - b.rand() * (bd - 0.7), Math.min(0.8, free - 0.04));
  }
  if (gap > 0.62 && room(26)) lantern(b, mx + (mw / 2 - 0.2) * (maybe(b) ? 1 : -1), D / 2 - 0.2);
}

/** Office blocks of four to eight storeys. */
function offices(b, w, d) {
  cells(b, w, d, 5, (cw, cd) => office(b, cw, cd));
}

/** A downtown high-rise: ten to twenty storeys in tiers that step back, a mast on top. */
function highrise(b, W, D) {
  const room = allowance(b, 880, W, D);
  slab(b, W, D, pick(b, [C.pavement, C.stone, C.concrete]));
  const style = pick(b, ['glass', 'glass', 'dark', 'stone']);
  const least = clamp(Math.min(W, D) - 1.3, 1.25, 3.3);
  const foot = Math.min(clamp(W - 1.3, 1.25, 3.3), least * 2); // on an oblong parcel the tower is a slab
  const span = Math.min(clamp(D - 1.3, 1.25, 3.3), least * 2);
  const total = whole(b, 10, clamp(Math.round(6 + (foot + span) * 2.25), 11, 20)); // a slim tower is not the tallest
  const podium = least >= 2.3 && maybe(b, 0.6) ? whole(b, 2, 3) : 0;
  const crown = whole(b, 2, 5);
  const k = podium ? between(b, 0.6, 0.76) : Math.min(1, 2.5 / least) * between(b, 0.86, 1); // the shaft, as a share of the foot
  const q = foot === span ? between(b, 0.8, 1) : 1; // depth to width
  const zc = -clamp((D - span) / 2 - 0.5, 0, 0.3); // stands back a little behind a forecourt
  const tiers = [];
  if (podium) tiers.push([foot, span * between(b, 0.85, 1), podium]);
  tiers.push([foot * k, span * k * q, total - podium - crown]);
  tiers.push([foot * k * 0.72, span * k * q * 0.72, crown]);

  let wall;
  let win;
  let trim;
  if (style === 'glass') {
    wall = pick(b, FRAMES);
    win = { gapX: 0.07, gapY: 0.2, color: pick(b, GLAZING) };
    trim = C.panel;
  } else if (style === 'dark') {
    wall = C.dark;
    win = { gapX: 0.05, gapY: 0.14, color: mix(C.glass, C.glassLight, 0.3) };
    trim = C.panel;
  } else {
    wall = pick(b, [...STONES, C.plaster, C.plasterWarm, C.brick]);
    win = { gapX: 0.4, gapY: 0.3, color: C.glass };
    trim = shade(wall, 0.85);
  }
  // wide bays: no more than some two hundred panes on the whole tower
  let run = 0;
  for (const [tw, td, n] of tiers) run += 2 * (tw + td) * n;
  Object.assign(win, { bay: Math.max(style === 'stone' ? 0.6 : 0.8, run / 205), margin: 0.06, base: 0.05, cap: 0.05, lit: 0.42, glow: OFFICE_LIGHT });

  let top = G;
  tiers.forEach(([tw, td, n], i) => {
    if (style !== 'stone') b.layer('glass');
    b.block(0, top, zc, tw, n * 0.6, td, wall, { top: C.roofFlat, ao: 0.9, win: { ...win, rows: n } });
    b.layer('solid');
    top += n * 0.6;
    if (i < tiers.length - 1) b.box(0, top - 0.03, zc, tw + 0.08, 0.07, td + 0.08, trim, { ao: 1 }); // a ledge where it steps back
  });

  // the top: a spire, a sloping glass cap, or plant; and the mast with its red light
  const [cw, cd] = tiers[tiers.length - 1];
  let mast = top;
  const slim = Math.min(cw, cd);
  if (style === 'stone') {
    const rise = slim * between(b, 0.5, 0.9);
    b.hip(0, top, zc, cw + 0.08, cd + 0.08, rise, pick(b, [C.roofGreen, C.roofDark, C.roofGrey]), Math.max(0, cw - cd));
    mast += rise - 0.05;
  } else if (maybe(b, 0.4)) {
    const turn = whole(b, 0, 3);
    b.layer('glass').wedge(0, top, zc, turn % 2 ? cd : cw, slim * 0.45, turn % 2 ? cw : cd, win.color, { ry: turn * HALF }).layer('solid');
    mast += slim * 0.2;
  } else {
    b.box(0, top, zc, cw * 0.55, 0.3, cd * 0.55, C.panelDark, { top: C.steelDark, ao: 0.9 });
    mast += 0.3;
  }
  const reach = between(b, 0.7, 1.4);
  b.cyl(0, mast, zc, 0.03, reach, C.steelDark, { seg: 3, cap: false });
  b.lamp(0, mast + reach, zc, 0.07, 0.07, 0.07, C.red, C.lampRed);

  // the forecourt: a lit lobby under a canopy, trees in tubs, lamps
  const [bw, bd] = tiers[0];
  const front = zc + bd / 2;
  const fore = D / 2 - front;
  lobby(b, 0, front, Math.min(1.4, bw - 0.3), Math.min(0.42, fore - 0.1), trim);
  for (const s of [-1, 1]) {
    if (fore > 0.7 && room(36)) planter(b, s * (W / 2 - 0.45), D / 2 - 0.45, fore > 1 ? 0.85 : 0.7);
    if (W / 2 - bw / 2 > 0.6 && room(36)) planter(b, s * (W / 2 - 0.4), zc - b.rand() * bd * 0.4, 0.75);
    if (fore > 0.5 && room(26)) lantern(b, s * Math.min(bw / 2 + 0.15, W / 2 - 0.9), D / 2 - 0.22);
  }
}

/** High-rises of the centre. */
function tower(b, w, d) {
  cells(b, w, d, 5, (cw, cd) => highrise(b, cw, cd));
}

/** A row of small shops on the street: awnings, name boards, flats above, a yard behind. */
function shops(b, w, d) {
  const room = allowance(b, 372, w, d);
  slab(b, w, d, C.pavement);
  const y = G + LIFT;
  const total = w - 0.2;
  const count = Math.max(1, Math.round(total / between(b, 1.15, 1.45)));
  const shares = [];
  let sum = 0;
  for (let i = 0; i < count; i++) sum += shares[i] = between(b, 0.8, 1.25);
  const depth = clamp(d * 0.42, 1.1, 2.3);
  const front = d / 2 - 0.44;
  const yard = d - 0.44 - depth; // what is left behind the deepest shop
  if (yard > 0.5) b.plane(0, y, -d / 2 + 0.08 + (yard + depth * 0.2) / 2, w - 0.16, yard + depth * 0.2, pick(b, [C.asphalt, C.concrete, C.gravel]));
  let x = -total / 2;
  for (let i = 0; i < count; i++) {
    const uw = (shares[i] / sum) * total;
    const cx = x + uw / 2;
    x += uw;
    const upper = maybe(b, 0.3) ? 2 : 1;
    const h = 0.8 + upper * 0.58 + (i % 3) * 0.035; // never level with the neighbour
    const ud = depth * between(b, 0.8, 1);
    const z = front - ud / 2;
    const back = front - ud;
    const wall = maybe(b, 0.25) ? pick(b, BRICKS) : pick(b, PLASTERS);
    if (maybe(b, 0.45)) b.gable(cx, G, z, uw, ud, h, ud * between(b, 0.26, 0.36), wall, pick(b, TILES), { over: 0.04 });
    else {
      b.box(cx, G, z, uw, h, ud, wall, { top: shade(wall, 0.8) });
      b.plane(cx, G + h + LIFT, z, uw - 0.14, ud - 0.14, pick(b, FLATS));
      if (maybe(b, 0.5) && room(70)) b.box(cx + between(b, -0.2, 0.2) * uw, G + h, z - ud * 0.2, 0.26, 0.14, 0.26, C.panel, { top: C.steelDark, ao: 0.9 });
    }
    // the shop: glass from wall to wall, its name over it, an awning
    const tone = pick(b, BRIGHTS);
    b.windows(cx, G + 0.12, front, 0, uw - 0.14, 0.5, uw > 1.3 ? 3 : 2, 1, { gapX: 0.1, gapY: 0, color: SHOP_GLASS, lit: 0.9, glow: maybe(b) ? C.lampWarm : C.lampCool });
    if (maybe(b, 0.3) && room(90)) b.lamp(cx, G + 0.66, front + 0.02, uw - 0.24, 0.11, 0.04, tone, shade(tone, 1.25));
    else decal(b, cx, G + 0.66, front, 0, uw - 0.16, 0.12, tone);
    if (maybe(b, 0.7)) b.wedge(cx, G + 0.5, front + 0.15, uw - 0.12, 0.15, 0.32, pick(b, BRIGHTS), { h2: 0.04 });
    // the flats above; at the back their windows and the door to the yard
    const tall = upper * 0.58 - 0.08;
    panes(b, cx, G + 0.86, front, 0, uw - 0.2, tall, uw > 1.35 ? 3 : 2, upper, HOME, 0.24);
    panes(b, cx, G + 0.86, back, Math.PI, uw - 0.2, tall, 2, upper, HOME, 0.24);
    decal(b, cx + uw * 0.2, G, back, Math.PI, 0.18, 0.4, pick(b, DOORS));
    if (i === 0) panes(b, cx - uw / 2, G + 0.86, z, -HALF, ud - 0.4, tall, 2, upper, HOME, 0.24);
    if (i === count - 1) panes(b, cx + uw / 2, G + 0.86, z, HALF, ud - 0.4, tall, 2, upper, HOME, 0.24);
  }
  // the yard: a van, cars, bins, a tree
  const clear = yard - 0.2;
  if (clear < 0.5) return;
  const zy = -d / 2 + 0.1 + clear / 2;
  for (const [sx, sz] of spots(b, w, clear, 1.25, 0.35, 0.4)) {
    const what = whole(b, 0, 5);
    const turn = clear < 1.2 ? HALF : 0; // vehicles stand along a shallow yard
    if (what === 0 && clear > 0.7 && room(30)) parked(b, sx, zy + (turn ? 0 : sz), turn + (maybe(b) ? Math.PI : 0));
    else if (what === 1 && clear > 0.8 && room(34)) van(b, sx, zy + (turn ? 0 : sz * 0.5), turn, pick(b, [C.white, C.panel, C.yellow, C.blue]));
    else if (what === 2 && clear > 1 && room(26)) leafy(b, sx, zy + sz * 0.6, 0.8);
    else if (what === 3 && room(20)) {
      b.box(sx, G, zy + sz, 0.2, 0.24, 0.2, C.green, { ao: 0.9 });
      b.box(sx + 0.24, G, zy + sz, 0.2, 0.24, 0.2, C.steelDark, { ao: 0.9 });
    } else if (what === 4 && room(10)) b.box(sx, G, zy + sz, 0.34, 0.22, 0.34, C.wood, { ao: 0.9 });
  }
}

/** A warehouse on its cell: a wide shed with roller doors, and a yard with a truck and freight. */
function shed(b, W, D) {
  const room = allowance(b, 252, W, D);
  slab(b, W, D, pick(b, YARDS));
  const sw = clamp(W - between(b, 0.7, 1.3), 1.3, 6.4);
  const sd = clamp(D * between(b, 0.42, 0.54), 1.1, 3.2);
  const sx = between(b, -1, 1) * Math.max(0, (W - sw) / 2 - 0.3);
  const sz = -D / 2 + 0.3 + sd / 2;
  const front = sz + sd / 2;
  const wallH = between(b, 0.85, 1.15);
  const wall = pick(b, SHEDS);
  const roof = pick(b, [C.roofLight, C.roofFlat, C.roofGrey, shade(wall, 0.8)]);
  const along = sw >= sd; // the ridge follows the long side
  const rise = (along ? sd : sw) * 0.13;
  b.gable(sx, G, sz, sw, sd, wallH, rise, wall, roof, { axis: along ? 'x' : 'z', over: 0.05 });
  b.box(sx, G + wallH + rise - 0.03, sz, along ? sw * 0.7 : 0.16, 0.09, along ? 0.16 : sd * 0.7, C.panelDark, { ao: 1 }); // ridge vent

  // the front: a band of colour under the eaves, roller doors below
  decal(b, sx, G + wallH - 0.15, front, 0, sw - 0.04, 0.09, pick(b, [...FREIGHT, C.steelDark]));
  const doors = clamp(Math.round(sw / 1.25), 1, 5);
  const doorX = (i) => sx + ((i + 0.5) / doors - 0.5) * (sw - 0.2);
  for (let i = 0; i < doors; i++) decal(b, doorX(i), G, front, 0, 0.6, Math.min(0.64, wallH - 0.26), i % 2 ? C.steel : C.steelDark);
  // a strip of windows high on the other walls
  const strip = { gapY: 0, lit: 0.25, color: C.glass, glow: C.lampCool };
  panes(b, sx, G + wallH - 0.36, sz - sd / 2, Math.PI, sw - 0.3, 0.2, Math.max(2, Math.round(sw / 0.9)), 1, strip, 0.5);
  for (const s of [-1, 1]) panes(b, sx + (s * sw) / 2, G + wallH - 0.36, sz, s * HALF, sd - 0.3, 0.2, Math.max(1, Math.round(sd / 1.0)), 1, strip, 0.5);

  // the yard: a kerb with a gateway, a truck backed up to a door, freight in a corner
  const yard = D / 2 - front;
  const cs = maybe(b) ? 1 : -1; // the corner the containers stand in
  const dock = cs > 0 ? 0 : doors - 1;
  const gate = doorX(dock);
  boundary(b, -W / 2 + 0.03, D / 2 - 0.05, gate - 0.5, D / 2 - 0.05, 'kerb');
  boundary(b, gate + 0.5, D / 2 - 0.05, W / 2 - 0.03, D / 2 - 0.05, 'kerb');
  if (yard > 1.75 && room(40)) truck(b, gate, front + 0.86, 0, pick(b, [C.white, ...FREIGHT]));
  if (W >= 4 && yard > 0.9) {
    const n = whole(b, 1, 3);
    for (let i = 0; i < n && room(10); i++) {
      const tone = pick(b, FREIGHT);
      const up = i === 2 ? 1 : 0; // the third goes on top
      b.box(cs * (W / 2 - 0.82), G + up * 0.5, D / 2 - 0.45 - (up ? 0 : i * 0.56), 1.3, 0.5, 0.5, tone, { top: shade(tone, 0.85), ao: 0.9 });
    }
  }
  if (yard > 0.7) {
    for (let i = 0; i < 3 && room(10); i++) b.box(-cs * (W / 2 - 0.35 - (i % 2) * 0.4), G + (i === 2 ? 0.2 : 0), front + 0.25, 0.34, 0.2, 0.34, i % 2 ? shade(C.wood, 0.9) : C.wood, { ao: 0.92 });
  }
  if (yard > 1.2 && room(30)) parked(b, -cs * (W / 2 - 0.35), D / 2 - 0.75, 0);
  if (room(26)) lantern(b, -cs * (W / 2 - 0.2), D / 2 - 0.25, 1.1);
}

/** Warehouses with their yards. */
function warehouse(b, w, d) {
  cells(b, w, d, 6, (cw, cd) => shed(b, cw, cd));
}

/** A workshop on its cell: a small factory under a sawtooth roof, a garage, or a brick works with its chimney. */
function works(b, W, D) {
  const room = allowance(b, 312, W, D);
  slab(b, W, D, pick(b, YARDS));
  const type = pick(b, ['sawtooth', 'sawtooth', 'garage', 'forge']);
  const bw = clamp(W - between(b, 0.9, 1.5), 1.3, 4.2);
  const bd = clamp(D * between(b, 0.42, 0.55), 1.15, 2.8);
  const bx = between(b, -1, 1) * Math.max(0, (W - bw) / 2 - 0.35);
  const bz = -D / 2 + 0.35 + bd / 2;
  const front = bz + bd / 2;
  const yard = D / 2 - front;
  const side = maybe(b) ? 1 : -1;
  let wall;
  let wallH;
  let stack = 0; // height of the chimney
  if (type === 'sawtooth') {
    wall = pick(b, [...BRICKS, C.plaster, C.panelDark, C.plasterCool]);
    wallH = between(b, 0.72, 0.92);
    b.box(bx, G, bz, bw, wallH, bd, wall);
    // the teeth: glass on their upright side, which looks towards `face`
    const face = whole(b, 0, 3);
    const across = face % 2 ? bw : bd;
    const along = face % 2 ? bd : bw;
    const teeth = clamp(Math.round(across / 0.8), 2, 6);
    const t = across / teeth;
    const roof = pick(b, [C.roofGrey, C.roofFlat, C.roofDark, C.roofLight]);
    b.at(bx, G + wallH, bz, face * HALF, () => {
      for (let i = 0; i < teeth; i++) {
        const tz = -across / 2 + (i + 0.5) * t;
        b.wedge(0, 0, tz, along, 0.3, t, shade(wall, 0.95), { ry: Math.PI, top: roof });
        b.windows(0, 0.04, tz + t / 2, 0, along - 0.14, 0.22, Math.max(2, Math.round(along / 1.1)), 1, { color: C.glassLight, gapX: 0.1, gapY: 0, lit: 0.6, glow: C.lampCool });
      }
    });
    if (maybe(b, 0.6)) stack = wallH + between(b, 0.9, 1.3);
  } else if (type === 'garage') {
    wall = pick(b, [C.plaster, C.white, C.panel, C.plasterCool, C.plasterWarm]);
    wallH = 0.74;
    b.box(bx, G, bz, bw, wallH, bd, wall, { top: shade(wall, 0.8) });
    flatRoof(b, bx, G + wallH, bz, bw, bd, room, 1);
    decal(b, bx, G + wallH - 0.17, front, 0, bw - 0.04, 0.13, pick(b, BRIGHTS)); // the name over the doors
    b.cyl(bx + side * (bw / 2 - 0.3), G + wallH, bz - bd / 2 + 0.3, 0.06, 0.45, C.steel, { seg: 5, top: C.dark });
  } else {
    wall = pick(b, BRICKS);
    wallH = between(b, 0.8, 1.0);
    b.gable(bx, G, bz, bw, bd, wallH, bd * 0.3, wall, pick(b, TILES), { axis: 'x' });
    stack = wallH + bd * 0.3 + between(b, 0.7, 1.2);
  }
  if (stack) b.cyl(bx + side * (bw / 2 - 0.3), G, bz - bd / 2 + 0.3, 0.13, stack, C.brick, { seg: 6, r2: 0.09, top: C.dark });

  // the front: doors wide enough for a lorry, windows between them
  const slots = clamp(Math.round(bw / 1.0), 1, 4);
  const doorTone = type === 'garage' ? pick(b, [C.steel, C.blue, C.red, C.panelDark]) : pick(b, [C.steelDark, C.woodDark, C.roofGreen]);
  const open = whole(b, 0, slots - 1); // this one is a door whatever the dice say
  let doorX = bx;
  for (let i = 0; i < slots; i++) {
    const sx = bx + ((i + 0.5) / slots - 0.5) * (bw - 0.16);
    if (i === open || maybe(b, type === 'garage' ? 0.8 : 0.35)) {
      decal(b, sx, G, front, 0, 0.58, Math.min(0.56, wallH - 0.24), doorTone);
      if (i === open) doorX = sx;
    } else panes(b, sx, G + 0.22, front, 0, (bw - 0.16) / slots, wallH - 0.4, 2, 1, { gapY: 0, lit: 0.4 }, 0.24);
  }
  const lit = { gapY: 0, lit: 0.35 };
  panes(b, bx, G + 0.22, bz - bd / 2, Math.PI, bw - 0.3, wallH - 0.4, Math.max(2, Math.round(bw / 0.8)), 1, lit, 0.26);
  for (const s of [-1, 1]) panes(b, bx + (s * bw) / 2, G + 0.22, bz, s * HALF, bd - 0.3, wallH - 0.4, Math.max(1, Math.round(bd / 0.8)), 1, lit, 0.26);

  // the yard
  boundary(b, -W / 2 + 0.03, D / 2 - 0.05, doorX - 0.5, D / 2 - 0.05, 'kerb');
  boundary(b, doorX + 0.5, D / 2 - 0.05, W / 2 - 0.03, D / 2 - 0.05, 'kerb');
  if (yard < 0.9) return;
  if (type === 'garage') {
    // cars waiting their turn, a pile of tyres
    for (let x = -W / 2 + 0.55; x < W / 2 - 0.5 && yard > 1.3; x += 0.78) {
      if (Math.abs(x - doorX) > 0.5 && maybe(b, 0.6) && room(30)) parked(b, x, front + 0.62 + b.rand() * (yard - 1.25), between(b, -0.25, 0.25) + (maybe(b) ? Math.PI : 0));
    }
    if (room(18)) b.cyl(bx - side * (bw / 2 - 0.2), G, front + 0.16, 0.1, 0.22, C.black, { seg: 6 });
  } else {
    if (yard > 1.75 && room(40)) truck(b, doorX, front + 0.86, 0, pick(b, [C.white, ...FREIGHT]));
    else if (yard > 1.3 && room(34)) van(b, doorX, front + 0.65, 0, pick(b, [C.white, C.panel, C.blue]));
    // stacks of timber, crates and drums along the side
    for (let i = 0; i < 4 && room(15); i++) {
      const px = -side * (W / 2 - 0.4 - (i % 2) * 0.45);
      const pz = front + 0.3 + Math.floor(i / 2) * 0.5;
      if (pz > D / 2 - 0.4 || Math.abs(px - doorX) < 0.55) continue;
      if (maybe(b)) b.box(px, G, pz, 0.34, 0.2 + (i % 2) * 0.14, 0.34, C.wood, { ao: 0.92 });
      else b.cyl(px, G, pz, 0.09, 0.22, pick(b, [C.blue, C.red, C.steel]), { seg: 5 });
    }
    if (yard > 1.2 && room(30)) parked(b, side * (W / 2 - 0.35), D / 2 - 0.75, 0);
  }
  if (room(26)) lantern(b, side * (W / 2 - 0.2), D / 2 - 0.25, 1.1);
}

/** Small factories, garages and workshops. */
function workshop(b, w, d) {
  cells(b, w, d, 5, (cw, cd) => works(b, cw, cd));
}

// ---------------------------------------------------------------------------
// Open places
// ---------------------------------------------------------------------------

/** A park: lawn, paths meeting at a pond, a fountain or a bandstand, trees, benches, lamps. */
function park(b, w, d) {
  const room = allowance(b, 372, w, d);
  slab(b, w, d, pick(b, LAWNS));
  const y = G + LIFT;
  const small = Math.min(w, d) < 3.2;
  const path = pick(b, [C.gravel, C.sand, C.pavement]);
  const cx = between(b, -0.12, 0.12) * w;
  const cz = between(b, -0.12, 0.12) * d;
  const r = clamp(Math.min(w, d) * 0.16, 0.34, 1.1);
  const heart = pick(b, ['pond', 'pond', 'fountain', 'bandstand']);
  const clear = heart === 'pond' ? r * 1.25 + 0.2 : r + 0.28; // the clearing round it

  // paths: in from the street, and on to most of the other sides
  b.plane(cx, y, (cz + d / 2) / 2, 0.3, d / 2 - cz, path);
  if (maybe(b, 0.7)) b.plane(cx, y, (cz - d / 2) / 2, 0.3, cz + d / 2, path);
  if (maybe(b, 0.8)) b.plane((cx - w / 2) / 2, y, cz, cx + w / 2, 0.3, path);
  if (maybe(b, 0.8)) b.plane((cx + w / 2) / 2, y, cz, w / 2 - cx, 0.3, path);
  disc(b, cx, y, cz, clear, clear, path, 10);
  if (heart === 'pond') {
    const long = maybe(b);
    b.layer('water');
    disc(b, cx, y + LIFT, cz, r * (long ? 1.25 : 0.85), r * (long ? 0.85 : 1.25), C.water, 9);
    b.layer('solid');
  } else if (heart === 'fountain') fountain(b, cx, cz, r * 0.62);
  else {
    // a bandstand: a round floor, posts, a pointed roof
    b.cyl(cx, G, cz, r * 0.62, 0.09, C.stone, { seg: 6 });
    for (let i = 0; i < 6; i++) b.cyl(cx + Math.cos((i / 6) * TAU) * r * 0.54, G + 0.09, cz + Math.sin((i / 6) * TAU) * r * 0.54, 0.022, 0.5, C.white, { seg: 3, cap: false });
    spike(b, cx, G + 0.59, cz, r * 0.72, r * 0.42, pick(b, [C.roofGreen, C.roofRed, C.roofDark]), 6);
  }

  // where trees may stand: off the paths and the clearing; a small park has only its corners
  const places = small
    ? [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (w / 2 - 0.42), sz * (d / 2 - 0.42)]))
    : spots(b, w, d, 0.95, 0.55, 0.8).filter(([x, z]) => Math.hypot(x - cx, z - cz) > clear + 0.42 && Math.abs(x - cx) > 0.5 && Math.abs(z - cz) > 0.5 && z < d / 2 - 0.8);
  const grow = (count) => {
    for (let i = 0; i < count && places.length; i++) {
      const [x, z] = places.pop();
      const s = small ? 0.7 : between(b, 0.85, 1.2);
      if (maybe(b, 0.18)) {
        if (room(24)) conifer(b, x, z, s * 0.9);
      } else if (small || maybe(b, 0.88)) {
        if (room(26)) leafy(b, x, z, s);
      } else if (room(15)) shrub(b, x, z, between(b, 0.18, 0.26));
    }
  };
  grow(Math.ceil((w * d) / 6)); // these first: a park is its trees

  // benches round the clearing, lamps by the paths, flower beds and a hedge along the street
  for (let i = 0; i < 4; i++) {
    const t = TAU / 8 + (i * TAU) / 4;
    if (maybe(b, 0.7) && room(10)) bench(b, cx + Math.cos(t) * (clear - 0.14), cz + Math.sin(t) * (clear - 0.14), Math.atan2(-Math.cos(t), -Math.sin(t)));
  }
  if (room(26)) lantern(b, cx + 0.3, (cz + clear + d / 2) / 2);
  if (room(26) && d > 3.5) lantern(b, cx - 0.3, (cz - clear - d / 2) / 2);
  if (!small) {
    for (const s of [-1, 1]) {
      if (room(6)) disc(b, cx + s * 0.62, y, d / 2 - 0.5, 0.26, 0.18, pick(b, [C.red, C.yellow, C.white, C.orange, C.plasterRose]), 6);
    }
  }
  if (room(20)) {
    boundary(b, -w / 2, d / 2 - 0.1, cx - 0.3, d / 2 - 0.1, 'hedge');
    boundary(b, cx + 0.3, d / 2 - 0.1, w / 2, d / 2 - 0.1, 'hedge');
  }
  grow(99);
}

/** A paved square: a fountain, a statue or an obelisk in the middle, trees in tubs, benches, parasols. */
function plaza(b, w, d) {
  const room = allowance(b, 312, w, d);
  const stone = pick(b, [C.pavement, C.stone, C.concrete, mix(C.pavement, C.plasterWarm, 0.35)]);
  slab(b, w, d, stone);
  const y = G + LIFT;
  // paving: a darker field, two lighter bands crossing in the middle
  b.plane(0, y, 0, w - 0.8, d - 0.8, shade(stone, 0.92));
  b.plane(0, y + LIFT, 0, w - 0.8, 0.5, shade(stone, 1.04));
  b.plane(0, y + LIFT, 0, 0.5, d - 0.8, shade(stone, 1.04));
  const r = clamp(Math.min(w, d) * 0.13, 0.32, 0.8);
  const heart = pick(b, ['fountain', 'fountain', 'statue', 'obelisk']);
  if (heart === 'fountain') fountain(b, 0, 0, r);
  else if (heart === 'statue') {
    const bronze = pick(b, [C.roofGreen, C.woodDark, C.steelDark]);
    b.box(0, G, 0, 0.42, 0.36, 0.42, C.stone, { ao: 0.85 });
    b.box(0, G + 0.36, 0, 0.14, 0.36, 0.1, bronze, { ao: 1 });
    b.ball(0, G + 0.78, 0, 0.065, bronze, { seg: 4, rings: 2 });
  } else {
    b.box(0, G, 0, 0.4, 0.14, 0.4, C.stone, { ao: 0.85 });
    b.cyl(0, G + 0.14, 0, 0.1, 0.95, C.stone, { seg: 4, r2: 0.055, cap: false });
    spike(b, 0, G + 1.09, 0, 0.055, 0.1, C.stone, 4);
  }
  // benches facing the middle, lamps at the sides
  const ring = (heart === 'fountain' ? r : 0.25) + 0.45;
  for (let i = 0; i < 4; i++) {
    const t = TAU / 8 + (i * TAU) / 4;
    if (ring < Math.min(w, d) / 2 - 0.7 && room(10)) bench(b, Math.cos(t) * ring, Math.sin(t) * ring, Math.atan2(-Math.cos(t), -Math.sin(t)));
  }
  for (const s of [-1, 1]) if (room(26)) lantern(b, s * (w / 2 - 0.4), 0);
  // a café in one corner: parasols; trees in tubs in the others, and along the long sides
  const cafe = maybe(b, 0.6) ? whole(b, 0, 3) : -1;
  const nx = Math.max(2, Math.round(w / 2.4));
  let corner = 0;
  for (let i = 0; i < nx; i++) {
    for (const sz of [-1, 1]) {
      const x = -w / 2 + 0.62 + (i * (w - 1.24)) / (nx - 1);
      const z = sz * (d / 2 - 0.62);
      const isCorner = i === 0 || i === nx - 1;
      if (isCorner && corner++ === cafe) {
        for (const [px, pz] of [[0, 0], [0.55, 0.06], [0.1, 0.55]]) {
          if (!room(12)) break;
          const tx = x + (i === 0 ? px : -px); // the others stand further in
          b.cyl(tx, G, z - sz * pz, 0.02, 0.42, C.steelDark, { seg: 3, cap: false });
          spike(b, tx, G + 0.4, z - sz * pz, 0.24, 0.13, pick(b, BRIGHTS), 6);
        }
      } else if (room(36)) planter(b, x, z, 0.85, shade(stone, 0.78));
    }
  }
}

/** A car park: rows of marked bays with some cars, a planted island, the sign and the booth at the way in. */
function parking(b, w, d) {
  const room = allowance(b, 312, w, d);
  slab(b, w, d, C.asphalt);
  const y = G + LIFT;
  const pitch = 0.56;
  const n = Math.max(1, Math.floor((w - 0.7) / pitch));
  const rows = Math.max(1, Math.floor((d + 0.7) / 2.2));
  const fill = between(b, 0.3, 0.8);
  const gate = maybe(b) ? 1 : -1; // the end of the front row left open as the way in
  const z0 = -d / 2 + 0.8;
  const z1 = rows > 1 ? d / 2 - 0.8 : z0;
  const thrifty = (k) => room(k + 70);
  if (room(10)) hedge(b, -w / 2 + 0.1, -d / 2 + 0.11, w / 2 - 0.1, -d / 2 + 0.11, 0.2);
  for (let r = 0; r < rows; r++) {
    const z = rows > 1 ? z0 + ((z1 - z0) * r) / (rows - 1) : z0;
    const open = rows > 1 && r === rows - 1 ? Math.min(2, n - 1) : 0;
    bays(b, (-gate * open * pitch) / 2, z, n - open, fill, thrifty, y);
  }
  // the way in: a booth with its barrier, and the blue sign
  const gx = gate * ((n * pitch) / 2 - pitch);
  const gz = rows > 1 ? z1 : d / 2 - 0.5;
  if (rows > 1) {
    b.box(gx + gate * 0.5, G, gz + 0.1, 0.32, 0.42, 0.32, C.panel, { top: C.roofDark, ao: 0.9 });
    b.box(gx - gate * 0.05, G + 0.24, gz + 0.1, 0.78, 0.03, 0.03, C.red, { ao: 1 });
  }
  b.cyl(gate * (w / 2 - 0.2), G, d / 2 - 0.2, 0.025, 0.7, C.steelDark, { seg: 3, cap: false });
  b.lamp(gate * (w / 2 - 0.2), G + 0.7, d / 2 - 0.2, 0.26, 0.26, 0.05, C.blue, mix(C.blue, C.lampCool, 0.45));
  // islands between the rows: grass, a tree or a lamp
  for (let r = 0; r + 1 < rows; r++) {
    const z = z0 + ((z1 - z0) * (r + 0.5)) / (rows - 1);
    if ((z1 - z0) / (rows - 1) < 2.9) {
      if (room(26)) lantern(b, 0, z, 1.1);
      continue;
    }
    b.box(0, G, z, w - 2.4, 0.05, 0.42, C.curb, { top: C.grass, ao: 1 });
    for (let i = -1; i <= 1; i++) {
      const x = (i * (w - 3.2)) / 2;
      if (i === 0 && room(26)) lantern(b, x, z, 1.1);
      else if (i && w > 4 && room(26)) leafy(b, x, z, 0.75);
    }
  }
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

/** A school: a long block with big windows, a clock over the door, a gym hall, a playground with a court, the flag, the bus. */
function school(b, w, d) {
  const room = allowance(b, 470, w, d);
  slab(b, w, d, pick(b, LAWNS));
  const y = G + LIFT;
  const bw = clamp(w - 1.4, 1.5, 4.4);
  const bd = clamp(d * 0.26, 1.0, 1.4);
  const storeys = w < 3.4 ? 2 : whole(b, 2, 3);
  const h = 0.16 + storeys * 0.6;
  const bz = -d / 2 + 0.45 + bd / 2;
  const front = bz + bd / 2;
  const yard = d / 2 - front;
  const side = maybe(b) ? 1 : -1; // the end the gym stands at
  const wall = pick(b, [C.plasterWarm, C.plaster, C.plasterRose, C.brick, C.white, mix(C.brick, C.plasterWarm, 0.3)]);
  const roof = pick(b, TILES);
  b.block(0, G, bz, bw, h, bd, wall, { top: shade(wall, 0.8), win: { rows: storeys, bay: 0.58, base: 0.14, gapX: 0.28, gapY: 0.36, lit: 0.3, colsSide: 2 } });
  if (maybe(b, 0.55)) b.hip(0, G + h, bz, bw + 0.18, bd + 0.18, 0.4, roof, bw - bd);
  else flatRoof(b, 0, G + h, bz, bw, bd, room, 1);

  // the gym: a tall hall at one end, reaching forward
  const gym = bw >= 3 && yard >= 2;
  const gw = 1.3;
  const gd = Math.min(1.9, yard - 0.9);
  const gx = side * (bw / 2 - gw / 2);
  const gz = front + gd / 2 - 0.02;
  if (gym) {
    b.gable(gx, G, gz, gw, gd, 0.95, 0.2, shade(wall, 0.94), C.roofLight, { axis: 'z', over: 0.04 });
    const high = { gapY: 0, lit: 0.4, glow: C.lampCool };
    panes(b, gx + (side * gw) / 2, G + 0.6, gz, side * HALF, gd - 0.3, 0.24, 3, 1, high, 0.36);
    panes(b, gx, G + 0.6, gz + gd / 2, 0, gw - 0.3, 0.24, 2, 1, high, 0.36);
  }
  // the entrance: a bay with a little gable, the clock in it
  const ex = gym ? (-side * gw) / 2 : 0;
  b.gable(ex, G, front + 0.1, 0.8, 0.24, h + 0.04, 0.3, C.white, roof, { axis: 'z', over: 0.04 });
  decal(b, ex, G, front + 0.22, 0, 0.32, 0.46, C.woodDark);
  dial(b, ex, G + h + 0.13, front + 0.22, 0, 0.1, C.dark, 6, C.lampWarm);
  panes(b, ex, G + 0.74, front + 0.22, 0, 0.6, (storeys - 1) * 0.6 - 0.1, 2, storeys - 1, { gapY: 0.36, lit: 0.3 }, 0.2);

  // the playground with its court
  const p0 = -side * (bw / 2 - 0.05);
  const p1 = gym ? gx - side * (gw / 2 + 0.12) : side * (bw / 2 - 0.05);
  const pw = Math.abs(p1 - p0);
  const pd = yard - 0.6;
  const px = (p0 + p1) / 2;
  if (pd > 0.4) {
    b.plane(px, y, front + 0.05 + pd / 2, pw, pd, C.asphalt);
    const cw = Math.min(pw - 0.5, 2.1);
    const cd = Math.min(pd - 0.75, 1.25);
    if (cw > 0.7 && cd > 0.5) {
      const cx = px + side * (pw - cw - 0.3) * -0.5;
      const cz = front + pd - cd / 2 - 0.12;
      b.plane(cx, y + LIFT, cz, cw, cd, pick(b, [mix(C.orange, C.brick, 0.5), C.roofGreen, mix(C.blue, C.steel, 0.5)]));
      b.plane(cx, y + LIFT * 2, cz, 0.03, cd, C.marking);
      for (const s of [-1, 1]) {
        b.plane(cx + s * (cw / 2 - 0.02), y + LIFT * 2, cz, 0.03, cd, C.marking);
        b.plane(cx + s * (cw / 2 - 0.16), y + LIFT * 2, cz, 0.3, 0.03, C.marking);
        b.plane(cx, y + LIFT * 2, cz + s * (cd / 2 - 0.02), cw, 0.03, C.marking);
      }
    }
    flag(b, ex + (gym ? -side : 1) * 0.62, front + 0.42, C.red, 1.25);
  }
  // the bus at the kerb, trees round the edge
  const busX = px + side * Math.max(0, pw / 2 - 1.0) * -1;
  if (w >= 3.6 && room(34)) {
    b.plane(busX, y, d / 2 - 0.3, 1.9, 0.6, C.asphalt);
    bus(b, busX, d / 2 - 0.3, HALF);
  }
  for (const s of [-1, 1]) {
    if (room(26)) leafy(b, s * (w / 2 - 0.36), bz + between(b, -0.3, 0.3), 0.7);
    if (room(26) && yard > 1.6) leafy(b, s * (w / 2 - 0.36), front + 0.6 + b.rand() * (yard - 1.2), 0.7);
  }
  if (gym && yard - gd > 0.95 && room(26)) leafy(b, gx, d / 2 - 0.45, 0.8);
}

/** The church proper, its nave running away from +z: tower and door in front, apse behind, the churchyard around. */
function chapel(b, W, D, room) {
  const y = G + LIFT;
  const nw = clamp(W * 0.3, 0.85, 1.5);
  const tw = clamp(nw * 0.62, 0.55, 0.9);
  const lead = clamp(D * 0.16, 0.5, 1.2); // the yard before the door
  const wallH = clamp(nw * 0.75, 0.72, 1.1);
  const roofH = nw * between(b, 0.55, 0.7);
  const nl = clamp(D - lead - tw * 0.6 - nw * 0.4 - 0.3, 0.9, 3.4);
  const x0 = between(b, -0.6, 0.6) * Math.max(0, W / 2 - nw / 2 - 1.0);
  const zt = D / 2 - lead - tw / 2; // the tower
  const z1 = zt - tw * 0.1; // the nave: front…
  const z0 = z1 - nl; // …and back, where the apse is
  const zc = (z0 + z1) / 2;
  const wall = pick(b, [C.white, C.plaster, C.stone, C.brick, C.brickDark, C.plasterWarm]);
  const roof = pick(b, [C.roofRed, C.roofDark, C.roofGrey, C.roofBrown]);
  const cap = pick(b, [C.roofGreen, C.roofDark, roof]);
  const glass = mix(C.glassDark, pick(b, [C.blue, C.red, C.yellow]), 0.35);

  b.gable(x0, G, zc, nw, nl, wallH, roofH, wall, roof, { axis: 'z', over: 0.06 });
  b.cyl(x0, G, z0, nw * 0.4, wallH * 0.9, wall, { seg: 6, cap: false });
  spike(b, x0, G + wallH * 0.9, z0, nw * 0.45, nw * 0.36, roof, 6);
  if (nl >= 2.2 && W >= nw + 1.6 && maybe(b, 0.5)) b.gable(x0, G, z0 + nl * 0.3, nw + 0.7, 0.72, wallH, roofH * 0.85, wall, roof, { axis: 'x', over: 0.05 }); // transept
  const n = Math.max(2, Math.round(nl / 0.62));
  for (const s of [-1, 1]) panes(b, x0 + (s * nw) / 2, G + 0.24, zc, s * HALF, nl - 0.4, wallH - 0.36, n, 1, { gapY: 0, color: glass, lit: 0.7 }, 0.16);

  // the tower: belfry openings, a spire or an onion dome, the cross
  const th = wallH + roofH + between(b, 0.45, 0.9);
  b.box(x0, G, zt, tw, th, tw, wall);
  for (const [ux, uz, ry] of [[0, 1, 0], [1, 0, HALF], [0, -1, Math.PI], [-1, 0, -HALF]]) decal(b, x0 + (ux * tw) / 2, G + th - 0.42, zt + (uz * tw) / 2, ry, tw * 0.36, 0.3, C.dark);
  let tip = G + th;
  if (maybe(b, 0.25)) {
    b.ball(x0, tip, zt, tw * 0.56, cap, { seg: 6, rings: 2, half: true, sy: 1.15 });
    spike(b, x0, tip + tw * 0.6, zt, 0.07, 0.3, cap, 4);
    tip += tw * 0.6 + 0.24;
  } else {
    const rise = tw * between(b, 1.5, 2.6);
    b.hip(x0, tip, zt, tw + 0.12, tw + 0.12, rise, cap);
    tip += rise - 0.04;
  }
  b.box(x0, tip, zt, 0.04, 0.3, 0.04, C.yellow, { ao: 1 });
  b.box(x0, tip + 0.17, zt, 0.17, 0.035, 0.016, C.yellow, { ao: 1 });
  decal(b, x0, G, zt + tw / 2, 0, tw * 0.42, 0.46, C.woodDark);
  dial(b, x0, G + wallH + 0.14, zt + tw / 2, 0, tw * 0.2, glass, 6, C.lampWarm);

  // the churchyard: the path to the door, a low wall with a gate, graves, dark trees
  b.plane(x0, y, (zt + tw / 2 + D / 2) / 2, 0.34, D / 2 - zt - tw / 2, C.gravel);
  if (room(20)) {
    boundary(b, -W / 2 + 0.03, D / 2 - 0.06, x0 - 0.3, D / 2 - 0.06, 'wall');
    boundary(b, x0 + 0.3, D / 2 - 0.06, W / 2 - 0.03, D / 2 - 0.06, 'wall');
  }
  const gs = x0 > 0 ? -1 : 1; // the roomier side takes the graves
  const free = W / 2 - nw / 2 + gs * -x0;
  if (free > 1.1) {
    const cols = Math.min(4, Math.floor((free - 0.6) / 0.34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 2; j++) {
        if (maybe(b, 0.75) && room(60)) b.box(x0 + gs * (nw / 2 + 0.5 + i * 0.34), G, zc - 0.2 + j * 0.5, 0.11, 0.15, 0.045, pick(b, [C.rock, C.stone, C.rockDark]), { ao: 0.9 });
      }
    }
  }
  for (const s of [-1, 1]) {
    if (room(24)) conifer(b, x0 + s * Math.min(0.75, W / 2 - 0.4 - Math.abs(x0)), D / 2 - 0.5, between(b, 0.65, 0.85));
    const side = W / 2 - nw / 2 - s * x0; // room beside the nave
    if (side > 0.9 && room(26)) leafy(b, s * (W / 2 - 0.5), z0 + b.rand() * nl * 0.5, clamp(side * 0.8, 0.7, 1.1));
  }
}

/** A church: a nave under a steep roof, a tower with a spire. On a shallow parcel it stands side-on to the street. */
function church(b, w, d) {
  const room = allowance(b, 412, w, d);
  slab(b, w, d, pick(b, LAWNS));
  if (d < w * 0.72) b.at(0, 0, 0, maybe(b) ? HALF : -HALF, () => chapel(b, d, w, room));
  else chapel(b, w, d, room);
}

/** The town hall: a formal front with a centre bay, a clock tower over it, flags, a paved forecourt. */
function townhall(b, w, d) {
  const room = allowance(b, 512, w, d);
  const stone = pick(b, [C.pavement, C.stone, mix(C.pavement, C.plasterWarm, 0.3)]);
  slab(b, w, d, stone);
  const y = G + LIFT;
  const bw = clamp(w - 1.2, 1.5, 4.2);
  const bd = clamp(d * 0.34, 1.1, 1.9);
  const storeys = w < 3.4 ? 2 : whole(b, 2, 3);
  const base = 0.14; // the ground floor stands on a plinth
  const h = base + storeys * 0.64;
  const bz = -d / 2 + 0.5 + bd / 2;
  const front = bz + bd / 2;
  const fore = d / 2 - front;
  const wall = pick(b, [C.plaster, C.plasterWarm, C.stone, C.white, C.plasterRose, C.brick]);
  const trim = wall === C.brick ? C.stone : C.white;
  const roof = pick(b, [C.roofRed, C.roofDark, C.roofGreen, C.roofGrey]);
  const win = { gapX: 0.42, gapY: 0.34, lit: 0.3 };
  const bay = clamp(bw * 0.3, 0.7, 1.2);
  const tall = h - base - 0.12;

  // the main block; on the front the windows stand either side of the centre bay
  b.block(0, G, bz, bw, h, bd, wall, { win: { ...win, faces: 'blr', rows: storeys, bay: 0.56, base: base + 0.06, colsSide: 2 } });
  const ww = (bw - bay) / 2 - 0.14;
  const cols = Math.max(1, Math.round(ww / 0.56));
  for (const s of [-1, 1]) b.windows(s * (bay / 2 + (bw - bay) / 4), G + base + 0.06, front, 0, ww, tall, cols, storeys, win);
  const roofH = bd * 0.3;
  b.hip(0, G + h, bz, bw + 0.2, bd + 0.2, roofH, roof, bw - bd);

  // the centre bay: pediment, door, pilasters, steps
  const face = front + 0.23;
  b.gable(0, G, front + 0.1, bay, 0.26, h + 0.06, bay * 0.3, wall, roof, { axis: 'z', over: 0.05 });
  decal(b, 0, G + base, face, 0, 0.3, 0.5, C.woodDark);
  if (storeys > 1) panes(b, 0, G + base + 0.7, face, 0, bay - 0.24, tall - 0.64, 2, storeys - 1, win, 0.2);
  if (fore > 0.75) b.box(0, G, face + 0.14, bay + 0.3, base * 0.7, 0.3, C.concrete, { ao: 0.9 });
  for (const s of [-1, 1]) if (room(120)) b.box(s * (bay / 2 - 0.05), G + base, face, 0.08, h - base, 0.08, trim, { ao: 1 });

  // the clock tower over the entrance
  const tw = clamp(bay * 0.74, 0.55, 0.85);
  const zt = front - tw / 2 + 0.02;
  const top = G + h + roofH + between(b, 0.9, 1.5);
  b.box(0, G + h - 0.02, zt, tw, top - G - h + 0.02, tw, wall);
  for (const [ux, uz, ry] of [[0, 1, 0], [1, 0, HALF], [0, -1, Math.PI], [-1, 0, -HALF]]) dial(b, (ux * tw) / 2, top - tw * 0.52, zt + (uz * tw) / 2, ry, tw * 0.32, C.white, 6, C.lampWarm);
  b.box(0, top, zt, tw + 0.1, 0.07, tw + 0.1, trim, { ao: 1 });
  let tip = top + 0.07;
  if (maybe(b, 0.4)) {
    b.ball(0, tip, zt, tw * 0.5, C.roofGreen, { seg: 6, rings: 2, half: true });
    tip += tw * 0.5;
  } else {
    b.hip(0, tip, zt, tw + 0.06, tw + 0.06, tw * 1.1, roof);
    tip += tw * 1.1;
  }
  spike(b, 0, tip - 0.05, zt, 0.035, 0.34, C.yellow, 3);

  // the forecourt: paving bands, flags, lamps, trees in tubs
  if (fore > 0.9) {
    b.plane(0, y, front + fore / 2 + 0.2, w - 0.6, fore - 0.7, shade(stone, 0.93));
    b.plane(0, y + LIFT, front + fore / 2, bay + 0.3, fore, shade(stone, 1.05));
  }
  for (const s of [-1, 1]) {
    const fx = s * Math.min(bay / 2 + 0.45, w / 2 - 0.3);
    if (fore > 0.75 && room(46)) flag(b, fx, face + 0.2, s > 0 ? C.red : C.white, 1.3);
    if (fore > 1.2 && room(26)) lantern(b, fx, d / 2 - 0.3);
    if (fore > 1.5 && room(36)) planter(b, s * (w / 2 - 0.6), d / 2 - 0.7, 0.85, shade(stone, 0.78));
    if ((w - bw) / 2 > 0.55 && room(26)) leafy(b, s * (w / 2 - 0.36), bz, 0.7);
  }
}

/** A red cross on a white field, lit at night, on a wall facing `ry`. */
function cross(b, x, y, z, ry, s) {
  decal(b, x, y, z, ry, s, s, C.white);
  const bars = (out, tone) => {
    decal(b, x, y + s * 0.14, z, ry, s * 0.24, s * 0.72, tone, out);
    for (const side of [-1, 1]) b.at(x, y, z, ry, () => decal(b, side * s * 0.24, s * 0.38, 0, 0, s * 0.24, s * 0.24, tone, out));
  };
  bars(0.026, C.red);
  if (b.night) {
    b.layer('glow');
    bars(0.034, C.lampRed);
    b.layer('solid');
  }
}

/** A hospital: a white slab of wards, a lower wing with the emergency entrance, crosses, a helipad on the roof. */
function hospital(b, w, d) {
  const room = allowance(b, 512, w, d);
  slab(b, w, d, C.pavement);
  const y = G + LIFT;
  const bw = clamp(w - 1.1, 1.5, 4.4);
  const bd = clamp(d * 0.27, 1.1, 1.5);
  const storeys = w < 3.4 ? whole(b, 3, 4) : whole(b, 4, 6);
  const h = 0.16 + storeys * 0.6;
  const bz = -d / 2 + 0.4 + bd / 2;
  const front = bz + bd / 2;
  const fore = d / 2 - front;
  const side = maybe(b) ? 1 : -1; // the end with the helipad; the wing stands at the other
  const wall = pick(b, [C.white, C.panel, C.plasterCool, C.plaster]);
  const tint = pick(b, [mix(C.blue, C.white, 0.5), C.plasterMint, mix(C.green, C.white, 0.55), mix(C.red, C.white, 0.6)]);
  const win = { bay: 0.82, base: 0.14, gapX: 0.14, gapY: 0.46, lit: 0.55, glow: C.lampCool };

  b.block(0, G, bz, bw, h, bd, wall, { win: { ...win, rows: storeys, colsSide: 1 } });
  b.box(0, G + h - 0.02, bz, bw + 0.06, 0.1, bd + 0.06, tint, { ao: 1 }); // a band of colour round the top
  const roofY = G + h + 0.08;
  b.plane(0, roofY + LIFT, bz, bw - 0.1, bd - 0.1, C.roofLight);
  // the lift house carries the crosses: one faces the street, one the back, so one always shows
  const lx = -side * bw * 0.2;
  b.box(lx, roofY, bz, 0.8, 0.5, bd * 0.6, shade(wall, 0.94), { top: C.roofFlat, ao: 0.9 });
  cross(b, lx, roofY + 0.07, bz + bd * 0.3, 0, 0.36);
  cross(b, lx, roofY + 0.07, bz - bd * 0.3, Math.PI, 0.36);
  if (bw > 2.6) {
    // the helipad
    const hx = side * (bw / 2 - 0.68);
    const r = Math.min(0.5, bd * 0.38);
    disc(b, hx, roofY + LIFT * 2, bz, r, r, C.asphaltDark, 10);
    for (const s of [-1, 1]) b.plane(hx + s * r * 0.3, roofY + LIFT * 3, bz, 0.06, r * 0.9, C.marking);
    b.plane(hx, roofY + LIFT * 3, bz, r * 0.6, 0.06, C.marking);
  }

  // the wing with the emergency entrance: a red canopy, the ambulance under it
  const wing = fore >= 2.2 && bw >= 2.6;
  const ww = clamp(bw * 0.5, 1.2, 2.2);
  const wd = clamp(fore - 1.4, 0.8, 1.6);
  const wx = -side * (bw / 2 - ww / 2);
  const wfront = wing ? front + wd - 0.02 : front;
  if (wing) {
    b.block(wx, G, front + wd / 2 - 0.02, ww, 1.36, wd, wall, { top: shade(wall, 0.85), win: { ...win, rows: 2, faces: side > 0 ? 'fl' : 'fr', colsSide: 1 } });
    flatRoof(b, wx, G + 1.36, front + wd / 2 - 0.02, ww, wd, room, 1);
  }
  const ex = wing ? wx : 0;
  const reach = Math.min(0.6, d / 2 - wfront - 0.1);
  if (reach > 0.2) {
    b.box(ex, G + 0.56, wfront + reach / 2 - 0.01, 1.0, 0.07, reach, C.red, { ao: 1 });
    b.lamp(ex, G + 0.63, wfront + reach - 0.04, 0.6, 0.1, 0.03, C.white, C.lampCool);
  }
  decal(b, ex, G, wfront, 0, 0.5, 0.46, C.glassDark, 0.034);

  // the forecourt: a drive past the door, the ambulance, parked cars, lawn and trees
  const drive = d / 2 - wfront;
  if (drive > 0.75) {
    b.plane(0, y, d / 2 - 0.42, w - 0.2, 0.64, C.asphalt);
    if (room(40)) van(b, ex + (wing ? side * -0.1 : Math.min(0.9, w / 2 - 0.6)), d / 2 - 0.42, HALF, C.white, C.red);
  }
  if (wing) {
    // beside the wing: bays for visitors, a lawn with trees
    const free = bw - ww; // width of the forecourt beside the wing
    const px = side * (bw / 2 - free / 2);
    b.plane(px, y, front + 0.6, free, 1.1, C.asphalt);
    bays(b, px, front + 0.6, Math.max(1, Math.floor((free - 0.2) / 0.56)), 0.6, (n) => room(n + 60), y + LIFT);
  }
  for (const s of [-1, 1]) {
    if ((w - bw) / 2 > 0.5 && room(26)) leafy(b, s * (w / 2 - 0.33), bz + between(b, -0.3, 0.3), 0.65);
    if (drive > 1.5 && room(36) && !(wing && s === -side)) planter(b, s * (w / 2 - 0.5), d / 2 - 1.15, 0.8);
  }
}

/**
 * The ground itself, its long side along x. On a long parcel a running track
 * goes round the pitch and the stands follow it all the way; otherwise four
 * straight stands leave the corners open. The forecourt is towards +z.
 */
function arena(b, W, D) {
  const room = allowance(b, 640, W, D);
  const y = G + LIFT;
  const tiny = Math.min(W, D) < 3.6;
  const oval = W >= D * 1.6 && D >= 4.2;
  const deep = clamp(Math.min(W, D) * 0.15, 0.34, 0.8); // depth of the stands
  const fore = tiny ? 0.28 : clamp(D * 0.1, 0.4, 0.7);
  const long = W - 2 * deep - (oval ? 1.1 : 0.7); // the most the floor of the bowl can measure
  const Bz = Math.min(D - fore - 0.22 - 2 * deep, long * (oval ? 0.5 : 0.68)); // across…
  const A = Math.min(long, Bz * (oval ? 2.3 : 1.5)); // …and along
  const zc = -D / 2 + 0.22 + deep + Bz / 2;
  const r0 = Bz / 2;
  const r1 = r0 + deep;
  const straight = oval ? A - Bz : A; // length of the stands along the pitch
  const sh = clamp(deep * 1.05, 0.36, 0.85); // their height at the back
  const low = 0.1; // and at the front
  const turf = mix(C.grass, C.green, 0.35);
  const team = pick(b, [C.blue, C.red, C.green, C.yellow, C.orange]);
  const seats = [team, shade(team, 0.8), C.panel];

  // the floor: track or a grass verge, then the pitch with its stripes and lines
  let pw = Bz - 0.2;
  let pl = A - 0.2;
  if (oval) {
    const lane = Math.min(0.34, Bz * 0.13);
    const tartan = mix(C.brick, C.red, 0.35);
    b.plane(0, y, zc, straight, Bz, tartan);
    b.plane(0, y + LIFT, zc, straight, Bz - lane * 2, turf);
    for (const s of [-1, 1]) {
      disc(b, (s * straight) / 2, y, zc, r0, r0, tartan, 6, -s * HALF, -s * HALF + Math.PI);
      disc(b, (s * straight) / 2, y + LIFT, zc, r0 - lane, r0 - lane, turf, 6, -s * HALF, -s * HALF + Math.PI);
    }
    pw = (Bz - lane * 2) * 0.84;
    pl = Math.min(pw * 1.6, straight + pw * 0.5);
  } else b.plane(0, y + LIFT, zc, A, Bz, shade(turf, 0.9));
  const stripes = 6;
  for (let i = 0; i < stripes; i += 2) b.plane(-pl / 2 + ((i + 0.5) * pl) / stripes, y + LIFT * 2, zc, pl / stripes, pw, shade(turf, 1.1));
  const chalk = y + LIFT * 3;
  b.plane(0, chalk, zc, 0.03, pw, C.marking);
  for (const s of [-1, 1]) {
    b.plane((s * pl) / 2, chalk, zc, 0.03, pw, C.marking);
    b.plane(0, chalk, zc + (s * pw) / 2, pl, 0.03, C.marking);
    b.plane(s * pl * 0.36, chalk, zc, 0.03, pw * 0.5, C.marking);
    b.plane(s * pl * 0.43, chalk, zc - pw * 0.25, pl * 0.14, 0.03, C.marking);
    b.plane(s * pl * 0.43, chalk, zc + pw * 0.25, pl * 0.14, 0.03, C.marking);
    b.box(s * (pl / 2 + 0.04), G, zc, 0.05, 0.13, Math.min(0.34, pw * 0.25), C.white, { ao: 1 });
  }

  // straight stands: concrete wedges, seats in the club's colours, blocks of a second tone
  const stand = (x, z, ry, len, dep, tone) => {
    b.wedge(x, G, z, len, sh, dep, C.concreteDark, { ry, h2: low, top: tone });
    b.at(x, G, z, ry, () => {
      const n = Math.max(2, Math.round(len / 1.1));
      const rise = (t) => low + (sh - low) * t + 0.014;
      for (let i = 0; i < n; i += 2) {
        const xa = -len / 2 + (i * len) / n + 0.04;
        const xb = -len / 2 + ((i + 1) * len) / n - 0.04;
        b.quad([xa, rise(0.1), dep * 0.4], [xb, rise(0.1), dep * 0.4], [xb, rise(0.9), -dep * 0.4], [xa, rise(0.9), -dep * 0.4], seats[1]);
      }
    });
  };
  const zn = zc - r0 - deep / 2;
  stand(0, zn, 0, straight, deep, seats[0]);
  stand(0, zc + r0 + deep / 2, Math.PI, straight, deep, seats[0]);
  if (oval) {
    // the ends follow the track: slices of a ring, low at the track, high at the back
    for (const s of [-1, 1]) {
      const cx = (s * straight) / 2;
      const at = (t, r, h) => [cx + Math.cos(t) * r, G + h, zc + Math.sin(t) * r];
      for (let i = 0; i < 6; i++) {
        const p = -s * HALF + (i / 6) * Math.PI;
        const q = p + Math.PI / 6;
        b.quad(at(p, r0, low), at(q, r0, low), at(q, r1, sh), at(p, r1, sh), seats[i % 2 ? 0 : 2]);
        b.quad(at(q, r1, 0), at(p, r1, 0), at(p, r1, sh), at(q, r1, sh), C.concreteDark, 0.86);
        b.quad(at(p, r0, 0), at(q, r0, 0), at(q, r0, low), at(p, r0, low), C.concreteDark);
      }
    }
  } else {
    const end = deep * 0.8;
    stand(A / 2 + end / 2, zc, -HALF, Bz, end, seats[2]);
    stand(-A / 2 - end / 2, zc, HALF, Bz, end, seats[2]);
  }
  // the main stand has a roof, carried by the wall behind it
  b.box(0, G, zn - deep / 2 + 0.03, straight, sh + 0.32, 0.06, C.concrete, { ao: 0.9 });
  b.box(0, G + sh + 0.32, zn - deep * 0.06, straight + 0.1, 0.05, deep * 0.98, C.panel, { bottom: true, top: C.roofLight, ao: 1 });

  // floodlights at the four corners, turned to the centre spot; the scoreboard over one end
  const reach = oval ? straight / 2 + r1 * 0.93 : A / 2 + deep * 0.62;
  const mast = tiny ? 1.15 : 1.8;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = sx * reach;
      const fz = zc + sz * (oval ? r1 * 0.93 : r0 + deep * 0.72);
      b.cyl(fx, G, fz, 0.035, mast, C.steelDark, { seg: 3, cap: false });
      b.at(fx, G + mast, fz, Math.atan2(-fx, zc - fz), () => b.lamp(0, 0, 0, 0.36, 0.2, 0.06, C.white, C.lampCool));
    }
  }
  const board = pick(b, [-1, 1]);
  b.lamp(board * (A / 2 + (oval ? deep : deep * 0.8) - 0.06), G + sh + (oval ? 0 : -0.25 * sh), zc, 0.07, 0.3, Math.min(0.8, Bz * 0.4), C.dark, C.orange);

  // the forecourt: ticket booths, flags, trees
  const edge = zc + r1; // the back of the stand on the street side
  const court = D / 2 - edge;
  for (const s of [-1, 1]) {
    if (court > 0.4 && room(10)) b.box(s * 0.5, G, edge + 0.18, 0.36, 0.34, 0.24, C.plaster, { top: team, ao: 0.9 });
    if (court > 0.3 && room(20)) flag(b, s * Math.min(1.3, W / 2 - 0.5), edge + Math.min(0.5, court - 0.15), team, 1.3);
    if (room(26)) leafy(b, s * (W / 2 - 0.42), D / 2 - 0.42, oval || court > 1 ? 0.8 : 0.6);
    if (oval && room(26)) leafy(b, s * (W / 2 - 0.42), -D / 2 + 0.42, 0.8);
  }
  if (court > 1.3) {
    // room for a few cars before the gates
    b.plane(0, y, D / 2 - 0.55, W - 1.8, 0.95, C.asphalt);
    bays(b, 0, D / 2 - 0.55, Math.max(1, Math.floor((W - 2) / 0.56)), 0.45, room, y + LIFT);
  }
}

/** A stadium: wants 10 × 5 or more (then it has a running track), makes do with less. */
function stadium(b, w, d) {
  slab(b, w, d, C.concrete);
  if (d > w * 1.25) b.at(0, 0, 0, HALF, () => arena(b, d, w));
  else arena(b, w, d);
}

// ---------------------------------------------------------------------------
// Edges of town
// ---------------------------------------------------------------------------

/** A crop field: ploughed soil, corn standing a little proud of the ground, green rows, or stubble. */
function field(b, w, d) {
  const crop = whole(b, 0, 3);
  const acrossZ = maybe(b); // rows run along x and are counted along z
  const span = acrossZ ? d : w;
  const n = clamp(Math.round(span / between(b, 0.4, 0.55)), 2, 28);
  const step = (span - 0.24) / n;
  const [ground, row] = [
    [C.soil, C.soilDark],
    [C.soil, C.cropDark],
    [C.soil, C.cropGreen],
    [C.hay, C.cropDark],
  ][crop];
  slab(b, w, d, ground);
  let y = G + LIFT;
  if (crop === 1) {
    b.box(0, G, 0, w - 0.24, 0.09, d - 0.24, C.crop, { ao: 0.9 });
    y += 0.09;
  }
  for (let i = 0; i < n; i++) {
    const t = -span / 2 + 0.12 + (i + 0.5) * step;
    const wide = step * (crop === 2 ? 0.55 : 0.3);
    if (acrossZ) b.plane(0, y, t, w - 0.36, wide, row);
    else b.plane(t, y, 0, wide, d - 0.36, row);
  }
}

/** Rough grass with a few bushes or a lone tree. */
function meadow(b, w, d) {
  const room = allowance(b, 58, w, d);
  slab(b, w, d, pick(b, [C.meadow, C.meadow, mix(C.meadow, C.grassLight, 0.5), mix(C.meadow, C.grass, 0.5)]));
  // patches of longer and of drier grass, one to a cell so that they never overlap
  const step = Math.max(1.6, Math.sqrt(w * d) / 2.2);
  const nx = Math.max(1, Math.round(w / step));
  const nz = Math.max(1, Math.round(d / step));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (maybe(b, 0.45) && room(2)) {
        const pw = (w / nx) * between(b, 0.4, 0.8);
        const pd = (d / nz) * between(b, 0.3, 0.7);
        const x = -w / 2 + ((i + 0.5) * w) / nx + between(b, -0.5, 0.5) * (w / nx - pw - 0.2);
        const z = -d / 2 + ((j + 0.5) * d) / nz + between(b, -0.5, 0.5) * (d / nz - pd - 0.2);
        b.plane(x, G + LIFT, z, pw, pd, pick(b, [C.grassLight, C.grass, mix(C.meadow, C.hay, 0.4)]));
      }
    }
  }
  for (const [x, z] of spots(b, w, d, step, 0.65, 0.8)) {
    if (maybe(b, 0.3) && room(26)) leafy(b, x, z, between(b, 0.8, 1.15));
    else if (maybe(b, 0.6) && room(15)) shrub(b, x, z, between(b, 0.16, 0.26));
  }
}

/** Woodland: trees shoulder to shoulder; only those near the edge show their trunks. */
function woods(b, w, d) {
  const room = allowance(b, 410, w, d);
  slab(b, w, d, mix(C.grassDark, C.pineDark, between(b, 0.15, 0.4)));
  const pines = pick(b, [0.15, 0.5, 0.5, 0.85]); // share of conifers: every wood has its own mix
  for (const [x, z] of spots(b, w, d, 1.12, 0.7, 0.7)) {
    const edge = Math.abs(x) > w / 2 - 1.6 || Math.abs(z) > d / 2 - 1.6;
    if (maybe(b, pines)) {
      if (room(24)) conifer(b, x, z, between(b, 0.9, 1.35), edge);
    } else if (room(26)) leafy(b, x, z, between(b, 1.05, 1.4), edge);
  }
  for (const [x, z] of spots(b, w, d, 1.7, 0.3, 0.9)) if (room(15)) shrub(b, x, z, between(b, 0.16, 0.24));
}

// ---------------------------------------------------------------------------

const KINDS = {
  house,
  rowhouses,
  apartments,
  offices,
  tower,
  shops,
  warehouse,
  workshop,
  park,
  plaza,
  parking,
  school,
  church,
  townhall,
  hospital,
  stadium,
  field,
  meadow,
  woods,
};

/**
 * Draw one parcel of the town: `w` × `d`, centred on the origin of the
 * current frame, its front (+z) on the street.
 */
export function parcel(b, kind, w, d) {
  const draw = KINDS[kind] ?? meadow;
  // Everything is drawn for parcels at least 2.4 across; a smaller one gets the same thing to scale.
  const k = Math.min(1, w / 2.4, d / 2.4);
  if (k < 1) b.at(0, 0, 0, 0, () => draw(b, w / k, d / k), k);
  else draw(b, w, d);
}

/** Kinds of parcel `parcel()` can draw. */
export const PARCELS = Object.keys(KINDS);

// The model viewer (dev/models.html) shows every kind as `town:<kind>`; its
// three "levels" are simply three random variations.
for (const kind of PARCELS) {
  registerModel(`town:${kind}`, (b, ctx) => parcel(b, kind, ctx.lot.w, ctx.lot.d), { lot: kind === 'stadium' ? { w: 10, d: 5 } : { w: 5, d: 5 } });
}
