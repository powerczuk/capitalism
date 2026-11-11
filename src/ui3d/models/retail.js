// Stores: supermarket, department store, electronics store.
//
// The supermarket is the reference model of the whole set — read it first if
// you are about to draw a building of your own.

import { C } from '../palette.js';
import { mix, shade } from '../kit.js';
import { PLOT, registerModel } from './index.js';
import { HALF, ac, bush, canopy, car, dock, flag, lamp, parking, pylon, tree, truck } from './props.js';

/** The paved yard a store stands on, with a kerb towards the street. */
export function yard(b, lot, color = C.asphalt) {
  b.box(0, 0, 0, lot.w - 0.1, 0.04, lot.d - 0.1, color, { ao: 1 });
  b.box(0, 0, lot.d / 2 - 0.115, lot.w - 0.08, 0.07, 0.15, C.curb, { ao: 1 }); // a touch proud of the slab, so their faces never share a plane
}

/** A strip of roof lights: `n` glazed panels in a row along x. */
export function skylights(b, x, y, z, n, w = 0.34, d = 0.7) {
  for (let i = 0; i < n; i++) {
    const sx = x + (i - (n - 1) / 2) * (w + 0.16);
    b.box(sx, y, z, w + 0.06, 0.05, d + 0.06, C.white, { ao: 1 });
    b.layer('glass').plane(sx, y + 0.056, z, w, d, C.glassLight).layer('solid');
    if (b.night) b.layer('glow').plane(sx, y + 0.06, z, w, d, shade(C.lampCool, 0.7)).layer('solid');
  }
}

/** A field of solar panels: `cols` × `rows`, lying flat on a roof. */
export function solar(b, x, y, z, cols, rows) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      b.box(x + (c - (cols - 1) / 2) * 0.46, y, z + (r - (rows - 1) / 2) * 0.34, 0.4, 0.035, 0.28, C.steelDark, { ao: 1, top: 0x27405c });
    }
  }
}

// ---------------------------------------------------------------------------
// Supermarket: a low, wide hall with a glazed front under a band in the
// owner's colour, a car park in front and a loading dock round the side.
//   level 1  a neighbourhood market
//   level 2  wider and deeper, solar panels on the roof, a delivery truck
//   level 3  fills the plot's width, a glazed entrance tower with the sign
// ---------------------------------------------------------------------------

registerModel(
  'supermarket',
  (b, { level, color, lot }) => {
    const w = Math.min(lot.w - 0.7, 2.5 + level * 0.6);
    const d = 1.7 + level * 0.36;
    const h = 0.92 + level * 0.06;
    const z = -lot.d / 2 + d / 2 + 0.28; // the hall stands at the back, the car park is in front
    const front = z + d / 2;
    const roof = h + 0.1;
    yard(b, lot);

    // The hall
    b.box(0, 0.04, z, w, h, d, C.panel, { top: C.roofLight });
    b.box(0, 0.04, z, w + 0.04, 0.16, d + 0.04, C.concreteDark, { ao: 0.9 }); // plinth
    b.box(0, h - 0.02, z, w + 0.1, 0.12, d + 0.1, C.white, { ao: 1, top: C.roofLight }); // parapet
    b.plane(0, roof + 0.004, z, w - 0.16, d - 0.16, C.roofFlat);

    // The band in the owner's colour runs along the front and round both corners
    b.box(0, h - 0.36, front + 0.03, w + 0.12, 0.32, 0.1, color, { ao: 1 });
    b.box(-w / 2 - 0.03, h - 0.36, front - 0.4, 0.1, 0.32, 0.8, color, { ao: 1 });
    b.box(w / 2 + 0.03, h - 0.36, front - 0.4, 0.1, 0.32, 0.8, color, { ao: 1 });
    b.box(0, h - 0.4, front + 0.03, w + 0.14, 0.04, 0.12, C.white, { ao: 1 });

    // Glazed front: glass, mullions, light behind it at night
    const gw = w - 0.5;
    const gh = h - 0.62;
    b.layer('glass').box(0, 0.2, front + 0.012, gw, gh, 0.03, C.glassLight, { ao: 0.95 }).layer('solid');
    for (let i = 0; i <= 6; i++) b.box(-gw / 2 + (i * gw) / 6, 0.2, front + 0.03, 0.035, gh, 0.02, C.white, { ao: 1 });
    b.windows(0, 0.2, front + 0.03, 0, gw, gh, 6, 1, { color: C.glassLight, lit: 1, gapX: 0.08, gapY: 0.06, glow: C.lampCool });

    // Entrance
    if (level < 3) {
      canopy(b, 0, 0.62, front + 0.32, 1.1, 0.6, shade(color, 0.88));
      b.box(0, 0.04, front + 0.02, 0.6, 0.5, 0.03, C.glassDark, { ao: 1 });
      b.lamp(0, h - 0.3, front + 0.085, w * 0.4, 0.2, 0.03, C.white, C.lampCool); // the sign on the band
    } else {
      // A glazed entrance tower that rises above the roof and carries the sign
      b.box(0, 0.04, front + 0.2, 1.3, h + 0.5, 0.7, C.white, { top: C.roofLight });
      b.layer('glass').box(0, 0.16, front + 0.36, 1.1, h - 0.1, 0.42, C.glassLight, { ao: 0.95 }).layer('solid');
      b.windows(0, 0.16, front + 0.575, 0, 1.1, h - 0.1, 3, 2, { color: C.glassLight, lit: 1, gapX: 0.1, gapY: 0.08, glow: C.lampCool });
      b.lamp(0, h + 0.12, front + 0.555, 1.14, 0.34, 0.04, color, shade(color, 1.3));
      b.box(0, h + 0.2, front + 0.58, 0.7, 0.16, 0.02, C.white, { ao: 1 });
    }

    // Roof: lights over the sales floor, plant at the back, panels when the store has grown
    skylights(b, -w / 4, roof, z + d * 0.12, level + 1);
    ac(b, w / 2 - 0.45, roof, z - d / 2 + 0.4);
    ac(b, w / 2 - 0.9, roof, z - d / 2 + 0.4);
    b.box(-w / 2 + 0.5, roof, z - d / 2 + 0.42, 0.55, 0.24, 0.4, C.panelDark, { top: C.steelDark });
    if (level >= 2) solar(b, w / 4, roof, z + d * 0.12, level, 3);

    // Loading dock on the right, a truck at it once deliveries pick up
    dock(b, w / 2 + 0.005, z - d / 4, Math.PI / 2, 0.6);
    if (level >= 2 && lot.w / 2 - w / 2 > 0.5) truck(b, w / 2 + 0.36, z + 0.25, 0, color);

    // Car park, pavement before the doors, trolley shelter
    const depth = lot.d / 2 - front;
    const bays = Math.floor((lot.w - 1.3) / 0.56);
    b.box(0, 0.04, front + 0.5, w * 0.8, 0.035, 0.42, C.pavement, { ao: 1 });
    carPark(b, -0.15, 0.04, front + 1.32, bays, Math.min(bays, 1 + level)); // on the yard slab, not under it
    if (depth > 3.0) carPark(b, -0.15, 0.04, front + 2.5, bays, Math.min(bays, level));
    b.box(-lot.w / 2 + 0.5, 0.04, front + 0.45, 0.5, 0.32, 0.28, C.glassLight, { top: C.steel, ao: 1 });

    // By the street: the pylon sign, a lamp and some green
    pylon(b, lot.w / 2 - 0.42, lot.d / 2 - 0.42, color, 1.45 + level * 0.18);
    lamp(b, 0.4, lot.d / 2 - 0.3, Math.PI);
    tree(b, -lot.w / 2 + 0.42, lot.d / 2 - 0.5, 0.75);
    bush(b, -lot.w / 2 + 0.95, lot.d / 2 - 0.4);
    if (level === 3) {
      flag(b, -lot.w / 2 + 0.3, front + 1.0, color);
      car(b, lot.w / 2 - 0.4, front + 0.55, Math.PI / 2, 3);
    }
  },
  { lot: PLOT.retail },
);

// ---------------------------------------------------------------------------
// Bits shared by the two stores below (site.js borrows them too)
// ---------------------------------------------------------------------------

/** A square bar from point `p` to point `q`, whatever its direction: stays, braces, booms, cables. */
export function beam(b, p, q, t, color) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const dz = q[2] - p[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const flat = Math.hypot(dx, dz);
  const k = t / 2;
  // `s` lies level and square to the bar, `u` is square to both
  const s = flat < 1e-6 ? [k, 0, 0] : [(-dz / flat) * k, 0, (dx / flat) * k];
  const u = [(-s[2] * dy) / len, (s[2] * dx - s[0] * dz) / len, (s[0] * dy) / len];
  const ring = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  const corner = (o, [i, j]) => [o[0] + i * s[0] + j * u[0], o[1] + i * s[1] + j * u[1], o[2] + i * s[2] + j * u[2]];
  for (let i = 0; i < 4; i++) {
    const m = ring[i];
    const n = ring[(i + 1) % 4];
    b.quad(corner(p, m), corner(q, m), corner(q, n), corner(p, n), color);
  }
}

/**
 * Light behind large glazing: `cols` panes on the wall plane through (x, z)
 * facing `ry` that glow at night (a share `lit` of them). By day nothing is
 * drawn, so glass stays glass.
 */
export function glazingGlow(b, x, y, z, ry, w, h, cols = 1, glow = C.lampWarm, frame = 0.03, lit = 1) {
  if (!b.night) return;
  const cw = w / cols;
  b.layer('glow').at(x, y, z, ry, () => {
    for (let c = 0; c < cols; c++) {
      if (lit < 1 && b.rand() >= lit) continue;
      const x0 = -w / 2 + c * cw + frame;
      const x1 = x0 + cw - frame * 2;
      b.quad([x0, 0.02, 0.008], [x1, 0.02, 0.008], [x1, h - 0.02, 0.008], [x0, h - 0.02, 0.008], glow);
    }
  });
  b.layer('solid');
}

/**
 * A marked row of `bays` centred on (x, z) of the ground at height `y`, with
 * exactly `n` cars dealt out over it (props.parking leaves the number to
 * chance, so now and then a car park would stand empty).
 */
export function carPark(b, x, y, z, bays, n) {
  const order = Array.from({ length: bays }, (_, i) => i);
  for (let i = bays - 1; i > 0; i--) {
    const j = Math.floor(b.rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  b.at(x, y, z, 0, () => {
    parking(b, 0, 0, bays, 0); // just the markings
    for (const i of order.slice(0, n)) car(b, (i + 0.5 - bays / 2) * 0.56, (b.rand() - 0.5) * 0.08, b.rand() < 0.5 ? 0 : Math.PI, b.rand() * 97);
  });
}

/**
 * Four slopes rising `h` from a `w` × `d` rectangle and leaning in by `inset`:
 * a mansard roof, a bank of earth. The flat top is left to the caller.
 */
export function slopes(b, x, y, z, w, d, h, inset, color) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const i = inset;
  const y1 = y + h;
  b.quad([x0, y, z1], [x1, y, z1], [x1 - i, y1, z1 - i], [x0 + i, y1, z1 - i], color); // front
  b.quad([x1, y, z0], [x0, y, z0], [x0 + i, y1, z0 + i], [x1 - i, y1, z0 + i], shade(color, 0.93)); // back
  b.quad([x1, y, z1], [x1, y, z0], [x1 - i, y1, z0 + i], [x1 - i, y1, z1 - i], shade(color, 0.97)); // right
  b.quad([x0, y, z0], [x0, y, z1], [x0 + i, y1, z1 - i], [x0 + i, y1, z0 + i], shade(color, 0.9)); // left
}

/** A glazed lantern over an atrium: a hipped glass roof on a kerb, lit from below at night. */
function lantern(b, x, y, z, w, d, h = 0.3, bars = 2) {
  const top = y + 0.08;
  b.box(x, y, z, w + 0.1, 0.08, d + 0.1, C.white, { ao: 1 });
  b.layer('glass').hip(x, top, z, w, d, h, C.glassLight, w - d).layer('solid');
  if (b.night) b.layer('glow').hip(x, top + 0.01, z, w, d, h, shade(C.lampWarm, 0.78), w - d).layer('solid');
  // glazing bars: the ridge, the four hips and a few rafters
  const rx = (w - d) / 2;
  b.box(x, top + h - 0.012, z, rx * 2 + 0.04, 0.035, 0.035, C.white, { ao: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, [x + (sx * w) / 2, top, z + (sz * d) / 2], [x + sx * rx, top + h, z], 0.03, C.white);
  for (let i = 0; i < bars; i++) {
    const bx = x - rx + ((i + 0.5) * rx * 2) / bars;
    for (const sz of [-1, 1]) beam(b, [bx, top, z + (sz * d) / 2], [bx, top + h, z], 0.025, C.white);
  }
}

// ---------------------------------------------------------------------------
// Department store: a town block of stone and plaster, shop windows under
// awnings in the owner's colour all round, a portal with a marquee, the name
// in big letters on the roof. It stands close to the street behind a small
// paved forecourt.
//   level 1  two storeys, a flat roof with roof lights
//   level 2  three storeys under a slate mansard, a glazed lantern over the atrium, flags
//   level 3  four storeys, a domed rotunda on the corner, a café terrace on the roof
// ---------------------------------------------------------------------------

registerModel(
  'department',
  (b, { level, color, lot }) => {
    const floors = level + 1;
    const w = Math.min(lot.w - 1, 2.72 + level * 0.44);
    const d = Math.min(lot.d - 2, 2.1 + level * 0.3);
    const g = 0.74; // the ground floor is taller: shop windows under a fascia
    const s = 0.58; // an upper storey
    const y0 = 0.04; // the paving
    const y1 = y0 + g; // first-floor level
    const uh = (floors - 1) * s; // the upper storeys together
    const h = y1 + uh; // top of the walls
    const z = -lot.d / 2 + d / 2 + 0.36 + (3 - level) * 0.18;
    const front = z + d / 2;
    const back = z - d / 2;
    const nf = level === 3 ? 7 : 5; // bays along the front (the middle one is the portal)
    const ns = level === 3 ? 5 : 4; // … and along the sides
    const bay = w / nf;
    const sbay = d / ns;
    const mid = (nf - 1) / 2;
    const tower = level === 3; // a rotunda takes the front right corner
    const wall = C.plaster;
    const valance = shade(color, 0.8);
    const bright = shade(color, 1.3);
    const pane = mix(C.glass, C.glassLight, 0.22); // upstairs windows
    yard(b, lot, C.pavement);

    // The block: a stone ground floor, plastered storeys above, white bands between them
    b.box(0, y0, z, w, g, d, C.stone);
    b.box(0, y1, z, w, uh, d, wall);
    b.box(0, y0, z, w + 0.07, 0.1, d + 0.07, C.concreteDark, { ao: 0.9 }); // plinth
    b.box(0, y1 - 0.08, z, w + 0.1, 0.08, d + 0.1, C.white, { ao: 1 }); // fascia over the shop windows
    b.box(0, h - 0.04, z, w + 0.16, 0.1, d + 0.16, C.white, { ao: 1 }); // cornice

    // Piers at the corners, pilasters between the bays of the front and the sides
    const pb = y0 + 0.1;
    const ph = h - 0.04 - pb;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) if (!(tower && sx > 0 && sz > 0)) b.box(sx * (w / 2 - 0.03), pb, z + sz * (d / 2 - 0.03), 0.13, ph, 0.13, C.white, { ao: 0.92 });
      for (let i = 1; i < ns; i++) b.box((sx * w) / 2, pb, back + i * sbay, 0.07, ph, 0.09, C.white, { ao: 0.92 });
    }
    for (let i = 1; i < nf; i++) b.box(-w / 2 + i * bay, pb, front, 0.09, ph, 0.07, C.white, { ao: 0.92 });

    // Shop windows: glass behind the pilasters, light in them at night, an awning over every bay
    const shop = (x, zz, ry, len, n, skip) => {
      const bw = len / n;
      b.at(x, 0, zz, ry, () => {
        b.layer('glass').box(0, y0 + 0.12, 0.008, len - 0.2, g - 0.38, 0.02, C.glassLight, { ao: 0.95 }).layer('solid');
        for (let i = 0; i < n; i++) {
          if (skip.includes(i)) continue;
          const cx = -len / 2 + (i + 0.5) * bw;
          glazingGlow(b, cx, y0 + 0.12, 0.018, 0, bw - 0.1, g - 0.38, 1, C.lampWarm);
          b.wedge(cx, y0 + 0.48, 0.175, bw - 0.1, 0.18, 0.28, valance, { h2: 0.04, top: color });
        }
      });
    };
    shop(0, front, 0, w, nf, tower ? [mid, nf - 1] : [mid]);
    shop(w / 2, z, HALF, d, ns, tower ? [0] : []);
    shop(-w / 2, z, -HALF, d, ns, []);

    // Windows of the upper storeys (the portal takes the middle of the first floor)
    const win = { gapX: 0.3, gapY: 0.3, lit: 0.6, color: pane };
    const cut = tower ? 1 : 0; // bays lost to the rotunda
    b.windows(-(w + bay) / 4, y1, front, 0, (w - bay) / 2, uh, mid, floors - 1, win);
    b.windows((w + bay) / 4 - (cut * bay) / 2, y1, front, 0, (w - bay) / 2 - cut * bay, uh, mid - cut, floors - 1, win);
    if (floors > 2) b.windows(0, y1 + s, front, 0, bay, uh - s, 1, floors - 2, win);
    b.windows(w / 2, y1, z - (cut * sbay) / 2, HALF, d - cut * sbay, uh, ns - cut, floors - 1, win);
    b.windows(-w / 2, y1, z, -HALF, d, uh, ns, floors - 1, win);
    b.windows(0, y1, back, Math.PI, w - 0.2, uh, nf, floors - 1, { ...win, lit: 0.35 });

    // Banners down the front and the sides
    const banner = (x, zz, ry) => b.box(x, y1 + 0.07, zz, 0.17, uh - 0.2, 0.024, color, { ry, ao: 1 });
    for (const sx of [-1, 1]) banner(sx * 1.5 * bay, front + 0.06, 0);
    banner(w / 2 + 0.06, back + 2 * sbay, HALF);
    banner(-w / 2 - 0.06, back + 2 * sbay, HALF);

    // The portal: a stone frame with a pediment, glazed doors under a marquee, the sign over it
    const pw = bay + 0.14;
    const pt = level === 1 ? y1 + 0.3 : y1 + s - 0.16;
    const pz = front + 0.17;
    b.box(0, y0, front + 0.085, pw, pt - y0, 0.17, C.white, { ao: 0.9 });
    b.gable(0, pt, front + 0.085, pw + 0.06, 0.2, 0, 0.16, C.white, C.roofGrey, { axis: 'z', over: 0.02 });
    b.layer('glass').box(0, y0 + 0.02, pz + 0.008, pw - 0.2, 0.5, 0.02, C.glass, { ao: 0.95 }).layer('solid');
    glazingGlow(b, 0, y0 + 0.02, pz + 0.018, 0, pw - 0.2, 0.5, 2);
    b.box(0, y0 + 0.58, pz + 0.22, pw + 0.3, 0.07, 0.5, C.dark, { ao: 1, bottom: true }); // marquee
    b.lamp(0, y0 + 0.595, pz + 0.478, pw + 0.26, 0.04, 0.016, C.lampWarm); // bulbs along its edges
    for (const sx of [-1, 1]) b.lamp(sx * (pw / 2 + 0.158), y0 + 0.595, pz + 0.23, 0.016, 0.04, 0.44, C.lampWarm);
    b.pool(0, y0 + 0.03, pz + 0.3, 1.0); // their light on the paving
    b.lamp(0, y0 + 0.72, pz + 0.02, pw - 0.1, pt - y0 - 0.8, 0.04, color, bright);
    b.box(0, y0 + 0.72 + (pt - y0 - 0.8) / 2 - 0.03, pz + 0.05, pw - 0.34, 0.06, 0.012, C.white, { ao: 1 });

    // The roof: flat behind a parapet at first, later a slate mansard with a flat top
    let roof = h + 0.06;
    let rw = w - 0.1;
    let rd = d - 0.1;
    if (level > 1) {
      slopes(b, 0, roof, z, w + 0.04, d + 0.04, 0.3, 0.24, C.roofGrey);
      roof += 0.3;
      rw = w - 0.44;
      rd = d - 0.44;
      b.box(0, roof - 0.03, z, rw + 0.06, 0.03, rd + 0.06, C.white, { ao: 1 });
    }
    b.plane(0, roof + 0.012, z, rw - 0.06, rd - 0.06, C.roofFlat);
    roof += 0.012;
    const rb = z - rd / 2; // back edge of the flat roof

    // Up there: daylight for the sales floors, the lift head, air conditioning
    if (level === 1) skylights(b, -0.3, roof, z - 0.1, 3, 0.3, 0.6);
    else lantern(b, tower ? 0.3 : 0, roof, z - 0.12, 0.9 + level * 0.2, 0.5 + level * 0.12, 0.3, 2);
    b.box(-rw / 2 + 0.42, roof, rb + 0.36, 0.6, 0.3, 0.46, wall, { top: C.roofGrey });
    b.box(-rw / 2 + 0.42, roof, rb + 0.6, 0.2, 0.24, 0.012, C.steelDark, { ao: 1 });
    for (let i = 0; i < 2 + (level > 1); i++) ac(b, rw / 2 - 0.34 - i * 0.44, roof, rb + 0.34);

    // The rooftop sign: letters in the owner's colour before a white board, on a steel frame
    const letters = level + 3;
    const lh = 0.24 + level * 0.04;
    const lw = lh * 0.62;
    const pitch = lw + 0.06;
    const len = letters * pitch + 0.1;
    const sz = z + rd / 2 - 0.16;
    const sy = roof + 0.14;
    b.box(0, sy, sz, len, lh + 0.12, 0.03, C.white, { ao: 1 });
    for (let i = 0; i < letters; i++) b.lamp((i - (letters - 1) / 2) * pitch, sy + 0.06, sz + 0.046, lw, lh, 0.05, color, bright);
    for (const sx of [-1, 0, 1]) {
      const lx = sx * (len / 2 - 0.06);
      b.box(lx, roof, sz - 0.035, 0.035, sy + lh - roof, 0.035, C.steelDark, { ao: 1 });
      beam(b, [lx, sy + lh, sz - 0.035], [lx, roof, sz - 0.42], 0.028, C.steelDark);
    }

    // Flags on the back corners of the roof
    if (level > 1) for (const sx of [-1, 1]) b.at(sx * (rw / 2 - 0.1), roof, rb + 0.1, 0, () => flag(b, 0, 0, color, 0.75));

    if (tower) {
      // The rotunda: a round corner tower with ribbon windows, the name round its drum, a copper dome
      const r = 0.42;
      const cx = w / 2 - 0.2;
      const cz = front - 0.2;
      const top = h + 0.52;
      const round = { seg: 10 };
      const band = { seg: 10, cap: false };
      b.cyl(cx, y0, cz, r, top - y0, C.white, band);
      for (let i = 0; i < floors; i++) {
        const by = i ? y1 + (i - 1) * s + 0.1 : y0 + 0.12;
        const bh = i ? s - 0.2 : g - 0.38;
        b.layer('glass').cyl(cx, by, cz, r + 0.012, bh, i ? mix(C.glass, C.glassLight, 0.45) : C.glassLight, band).layer('solid');
        if (b.night) b.layer('glow').cyl(cx, by + 0.02, cz, r + 0.02, bh - 0.04, C.lampWarm, band).layer('solid');
      }
      b.cyl(cx, y1 - 0.08, cz, r + 0.05, 0.08, C.white, round);
      b.cyl(cx, h - 0.04, cz, r + 0.08, 0.1, C.white, round);
      b.cyl(cx, h + 0.14, cz, r + 0.03, 0.28, color, band);
      if (b.night) b.layer('glow').cyl(cx, h + 0.145, cz, r + 0.036, 0.27, bright, band).layer('solid');
      b.cyl(cx, h + 0.25, cz, r + 0.045, 0.06, C.white, band);
      b.cyl(cx, top, cz, r + 0.06, 0.07, C.white, round);
      b.ball(cx, top + 0.07, cz, r + 0.02, C.roofGreen, { seg: 10, rings: 3, half: true, sy: 0.82 });
      b.cyl(cx, top + 0.38, cz, 0.025, 0.3, C.yellow, { seg: 4 });
      b.ball(cx, top + 0.7, cz, 0.065, C.yellow, { seg: 5, rings: 2 });

      // A café terrace on the roof: decking behind a glass balustrade, parasols in the owner's colour
      const tw = 0.95;
      const td = rd - 1.5;
      const tx = -rw / 2 + 0.1 + tw / 2;
      const tz = sz - 0.52 - td / 2;
      b.plane(tx, roof + 0.012, tz, tw, td, C.wood);
      b.layer('glass');
      b.box(tx + tw / 2, roof, tz, 0.016, 0.13, td, C.glassLight, { ao: 1 });
      for (const sz2 of [-1, 1]) b.box(tx, roof, tz + (sz2 * td) / 2, tw, 0.13, 0.016, C.glassLight, { ao: 1 });
      b.layer('solid');
      for (const [px, pz2] of [[-0.2, -0.3], [0.2, 0], [-0.2, 0.3]]) {
        b.box(tx + px, roof, tz + pz2, 0.02, 0.3, 0.02, C.steelDark, { ao: 1 });
        b.cone(tx + px, roof + 0.24, tz + pz2, 0.19, 0.09, color, { seg: 6 });
      }
    }

    // Round the back: the goods entrance and a staff door
    dock(b, w / 4, back - 0.005, Math.PI, 0.7);
    b.box(-w / 4, y0, back - 0.012, 0.3, 0.5, 0.024, C.steelDark, { ao: 1 });

    // Forecourt: paving up to a parking lane by the street, planters, lamps, a few cars
    const lane = lot.d / 2 - 0.47;
    b.plane(0, y0 + 0.012, lane, lot.w - 0.1, 0.56, C.asphalt);
    b.plane(0, y0 + 0.012, (pz + lane - 0.28) / 2, pw + 0.5, lane - 0.28 - pz, C.stone); // a paved path to the doors
    [-1.55, 0.05, 1.45].slice(0, level === 1 ? 2 : 3).forEach((cx, i) => car(b, (cx * lot.w) / 5, lane, HALF, [8, 3, 0][i]));
    for (const sx of [-1, 1]) {
      const k = (sx * lot.w) / 5;
      const corner = tower && sx > 0; // keep the view of the rotunda clear
      for (const px of corner ? [0.95, 1.86] : [0.95]) {
        b.box(k * px, y0, lane - 0.5, 0.66, 0.15, 0.24, C.concrete, { ao: 0.92 });
        b.box(k * px, y0 + 0.15, lane - 0.5, 0.58, 0.1, 0.16, C.leafDark, { ao: 1, top: C.leaf });
      }
      lamp(b, k * 1.42, lane - 0.5, Math.PI);
      if (!corner) {
        b.box(k * 1.9, y0, lane - 0.5, 0.36, 0.15, 0.36, C.concrete, { ao: 0.92, top: C.soilDark });
        tree(b, k * 1.9, lane - 0.5, 0.6);
      }
    }
  },
  { lot: PLOT.retail },
);

/**
 * A video wall: `cols` × `rows` screens on the wall plane through (x, z)
 * facing `ry`, each coloured by `tone(col, row)` (row 0 is the bottom one).
 * They are lit at night. `gap` is the dark joint between two screens.
 */
export function videoWall(b, x, y, z, ry, w, h, cols, rows, tone, gap = 0.014) {
  const cw = w / cols;
  const ch = h / rows;
  b.at(x, y, z, ry, () => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = -w / 2 + c * cw + gap / 2;
        const x1 = x0 + cw - gap;
        const q0 = r * ch + gap / 2;
        const q1 = q0 + ch - gap;
        const color = tone(c, r);
        b.quad([x0, q0, 0.012], [x1, q0, 0.012], [x1, q1, 0.012], [x0, q1, 0.012], color);
        if (b.night) b.layer('glow').quad([x0, q0, 0.02], [x1, q0, 0.02], [x1, q1, 0.02], [x0, q1, 0.02], color).layer('solid');
      }
    }
  });
}

/** A picture for a video wall: chevrons climbing in tones of one colour, a pale block where the logo would be. */
function chevrons(color, cols, rows) {
  const tones = [mix(color, 0xffffff, 0.42), color, shade(color, 0.82)];
  const pale = mix(color, 0xffffff, 0.85);
  const mid = (cols - 1) / 2;
  const logo = rows > 4 ? rows - 2.5 : -9; // only a tall wall has room for one
  return (c, r) => (Math.abs(c - mid) < 1 && Math.abs(r - logo) < 1 ? pale : tones[(r + Math.round(Math.abs(c - mid))) % 3]);
}

/** A satellite dish on a short mast; the bowl looks up and towards `ry`. */
export function dish(b, x, y, z, r = 0.2, ry = 0) {
  const n = 8;
  const ca = Math.cos(0.75); // the bowl leans 43° off the vertical
  const sa = Math.sin(0.75);
  const cy = r * 1.3;
  const cz = 0.06;
  const rim = (i) => {
    const t = (i / n) * Math.PI * 2;
    return [r * Math.cos(t), cy + r * Math.sin(t) * sa, cz - r * Math.sin(t) * ca];
  };
  b.at(x, y, z, ry, () => {
    b.box(0, 0, 0, 0.045, r * 1.1, 0.045, C.steelDark, { ao: 1 });
    const apex = [0, cy - 0.3 * r * ca, cz - 0.3 * r * sa];
    for (let i = 0; i < n; i++) {
      b.tri(apex, rim(i), rim(i + 1), C.white); // the bowl …
      b.tri(apex, rim(i + 1), rim(i), C.panelDark); // … and its back
    }
    const focus = [0, cy + 0.6 * r * ca, cz + 0.6 * r * sa];
    beam(b, rim(n * 0.75), focus, 0.02, C.steelDark);
    b.box(focus[0], focus[1] - 0.025, focus[2], 0.05, 0.05, 0.05, C.dark, { ao: 1 });
  });
}

/** A radio mast in red and white bands, aerials on it and a warning light on top. */
export function mast(b, x, y, z, h) {
  const n = Math.max(2, Math.round(h / 0.32));
  for (let i = 0; i < n; i++) b.box(x, y + (i * h) / n, z, 0.05, h / n, 0.05, i % 2 ? C.white : C.red, { ao: 1 });
  b.box(x, y + h * 0.7, z, 0.3, 0.02, 0.02, C.steelDark, { ao: 1 });
  b.box(x, y + h * 0.84, z, 0.02, 0.02, 0.22, C.steelDark, { ao: 1 });
  b.lamp(x, y + h, z, 0.05, 0.05, 0.05, C.lampRed);
}

// ---------------------------------------------------------------------------
// Electronics store: a crisp graphite box with white edges and a white roof,
// its front all glass with televisions playing in the window. On the corner
// hangs a cube of screens showing the owner's colour; a line of light in that
// colour runs under the eaves. Dishes and a mast on the roof.
//   level 1  a showroom with a small cube of screens
//   level 2  taller, with a gallery floor, solar panels, charging posts
//   level 3  the cube grows into a media tower high above the roof
// ---------------------------------------------------------------------------

registerModel(
  'electronics',
  (b, { level, color, lot }) => {
    const w = Math.min(lot.w - 0.8, 2.6 + level * 0.5);
    const d = Math.min(lot.d - 2.2, 1.8 + level * 0.3);
    const h = 0.85 + level * 0.25;
    const y0 = 0.04;
    const top = y0 + h;
    const z = -lot.d / 2 + d / 2 + 0.32;
    const front = z + d / 2;
    const back = z - d / 2;
    const bright = shade(color, 1.3);
    const skin = mix(C.dark, C.steelDark, 0.45);
    yard(b, lot);

    // The box: graphite cladding between white corners, a white roof, a line of light under the eaves
    b.box(0, y0, z, w, h, d, skin);
    b.box(0, y0, z, w + 0.04, 0.08, d + 0.04, C.concreteDark, { ao: 0.9 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.04), y0, z + sz * (d / 2 - 0.04), 0.14, h, 0.14, C.white, { ao: 0.92 });
    b.lamp(0, top - 0.14, z, w + 0.03, 0.05, d + 0.03, color, bright);
    b.box(0, top - 0.02, z, w + 0.1, 0.1, d + 0.1, C.white, { ao: 1 });
    const roof = top + 0.092;
    b.plane(0, roof, z, w - 0.08, d - 0.08, C.roofLight);

    // The front is glass from the floor to the eaves
    const gw = w - 0.28;
    const gy = y0 + 0.1;
    const gh = h - 0.32;
    const panes = Math.round(gw / 0.6);
    b.layer('glass').box(0, gy, front + 0.008, gw, gh, 0.02, C.glassLight, { ao: 0.95 }).layer('solid');
    glazingGlow(b, 0, gy, front + 0.018, 0, gw, gh, panes, C.lampCool, 0.02);
    for (let i = 1; i < panes; i++) b.box(-gw / 2 + (i * gw) / panes, gy, front + 0.03, 0.03, gh, 0.03, C.white, { ao: 1 });
    if (level > 1) b.box(0, y0 + 0.74, front + 0.025, gw, 0.035, 0.03, C.white, { ao: 1 }); // the gallery floor

    // The entrance: a white portal, dark doors, a thin canopy hung on rods
    const ex = -w * 0.13;
    b.box(ex, y0, front + 0.06, 0.9, 0.66, 0.12, C.white, { ao: 0.95 });
    b.box(ex, y0, front + 0.125, 0.66, 0.54, 0.012, C.glassDark, { ao: 1 });
    glazingGlow(b, ex, y0, front + 0.131, 0, 0.66, 0.54, 2, shade(C.lampCool, 0.85));
    b.box(ex, y0 + 0.66, front + 0.36, 1.5, 0.04, 0.72, C.white, { ao: 1, bottom: true });
    b.lamp(ex, y0 + 0.662, front + 0.726, 1.5, 0.036, 0.012, color, bright);
    for (const sx of [-1, 1]) beam(b, [ex + sx * 0.68, y0 + 0.69, front + 0.62], [ex + sx * 0.68, top - 0.24, front + 0.03], 0.022, C.steel);
    b.pool(ex, y0 + 0.045, front + 0.5, 1.5, shade(C.lampCool, 0.7)); // the light of the showroom falls on the paving

    // Televisions playing in the window
    const telly = [C.lampCool, C.orange, mix(C.blue, 0xffffff, 0.35), C.green, C.red, C.yellow];
    const tvs = (x0, x1, y, k) => {
      const n = Math.floor((x1 - x0) / 0.44);
      if (n > 0) videoWall(b, (x0 + x1) / 2, y, front + 0.022, 0, n * 0.44, 0.26, n, 1, (c) => telly[(c * 2 + k) % telly.length], 0.1);
    };
    tvs(ex + 0.5, gw / 2 - 0.04, gy + 0.14, 0);
    tvs(-gw / 2 + 0.04, ex - 0.5, gy + 0.14, 3);
    if (level > 1) tvs(-gw / 2 + 0.04, ex + 0.3, y0 + 0.84, 1);

    // The video wall: a cube of screens hung on the corner — at level 3 a whole tower of them
    const mw = level === 3 ? 0.8 : 0.7 + level * 0.15;
    const mb = y0 + 0.7;
    const mt = top + (level === 3 ? 1.4 : 0.05 + level * 0.2);
    const mx = w / 2 - mw / 2 + 0.06;
    const mz = front - mw / 2 + 0.06;
    const cols = level === 3 ? 3 : level + 2;
    const rows = Math.round((mt - mb - 0.1) / ((mw - 0.1) / cols));
    b.box(mx, mb, mz, mw, mt - mb, mw, C.black, { ao: 1, bottom: true, top: C.dark });
    videoWall(b, mx, mb + 0.05, mz + mw / 2, 0, mw - 0.1, mt - mb - 0.1, cols, rows, chevrons(color, cols, rows));
    videoWall(b, mx + mw / 2, mb + 0.05, mz, HALF, mw - 0.1, mt - mb - 0.1, cols, rows, chevrons(color, cols, rows));
    if (level > 1) {
      // the other two sides show above the roof: one plain screen each
      const sy = roof + (level === 3 ? 0.2 : 0.07);
      b.lamp(mx - mw / 2 - 0.006, sy, mz, 0.012, mt - sy - 0.07, mw - 0.14, color, bright);
      b.lamp(mx, sy, mz - mw / 2 - 0.006, mw - 0.14, mt - sy - 0.07, 0.012, color, bright);
    }
    if (level === 3) mast(b, mx, mt, mz, 0.9);

    // Roof: dishes, a mast, air conditioning; solar panels once the store has grown
    dish(b, -w / 2 + 0.55, roof, back + 0.6, 0.22 + level * 0.04, 0.5);
    if (level > 1) dish(b, -w / 2 + 1.25, roof, back + 0.42, 0.2, 1.1);
    if (level > 2) dish(b, -w / 2 + 0.45, roof, back + 1.3, 0.18, -0.3);
    if (level < 3) mast(b, w / 2 - 0.3, roof, back + 0.3, 0.6 + level * 0.3);
    for (let i = 0; i < level; i++) ac(b, w / 2 - 0.75 - i * 0.44, roof, back + 0.36);
    b.box(-w / 2 + 0.3, roof, z + d * 0.18, 0.34, 0.12, 0.34, C.white, { top: C.panelDark }); // roof hatch
    b.box(0.1, roof, back + 0.82, w - 1.3, 0.035, 0.07, C.steel, { ao: 1 }); // cable tray from the dishes to the screens
    b.box(w / 2 - 0.58, roof, z + 0.1, 0.07, 0.03, d - 1.5, C.steel, { ao: 1 });
    if (level > 1) solar(b, -w * 0.08, roof, front - 0.32 - level * 0.2, level + 1, level);

    // Sides and back: a sign each side, the goods door on the left, a staff door behind
    for (const sx of [-1, 1]) {
      b.at((sx * w) / 2, 0, z - d * 0.12, sx * HALF, () => {
        b.lamp(0, top - 0.52, 0.02, d * 0.42, 0.26, 0.04, color, bright);
        b.box(0, top - 0.42, 0.05, d * 0.28, 0.06, 0.012, C.white, { ao: 1 });
      });
    }
    dock(b, -w / 2 - 0.005, back + 0.55, -HALF, 0.6);
    b.box(w / 4, y0, back - 0.012, 0.3, 0.5, 0.024, C.steelDark, { ao: 1 });
    b.windows(-w / 8, top - 0.62, back, Math.PI, w * 0.5, 0.3, level + 2, 1, { gapX: 0.4, gapY: 0.2, lit: 0.5, color: mix(C.glass, C.glassLight, 0.6) }); // offices and stores behind
    for (let i = 0; i < level; i++) b.box(-w / 2 + 0.5 + i * 0.5, y0, back - 0.12, 0.36, 0.3, 0.2, C.panelDark, { top: C.steelDark, ao: 0.9 }); // chillers
    b.layer('glass').box(w / 2 + 0.008, gy, front - d * 0.22, 0.02, 0.5, d * 0.3, C.glassLight, { ao: 0.95 }).layer('solid');
    glazingGlow(b, w / 2 + 0.018, gy, front - d * 0.22, HALF, d * 0.3, 0.5, 2, C.lampCool, 0.02);

    // Forecourt: paving by the glass, a row of bays with charging posts, a lamp and some green by the street
    const bays = Math.floor((lot.w - 1.3) / 0.56);
    const px = 0.15 - (bays * 0.56) / 2; // left end of the row
    const pz = lot.d / 2 - 0.8;
    const plugs = level - 1; // bays for electric cars, at the right end
    b.box(0, y0, front + 0.4, w + 0.3, 0.03, 0.8, C.pavement, { ao: 1 });
    for (let i = bays - plugs; i < bays; i++) {
      b.plane(px + (i + 0.5) * 0.56, y0 + 0.006, pz, 0.5, 0.96, mix(C.green, C.asphalt, 0.45));
      b.box(px + (i + 0.5) * 0.56, y0, pz - 0.58, 0.08, 0.34, 0.07, C.white, { ao: 1 });
      b.lamp(px + (i + 0.5) * 0.56, y0 + 0.22, pz - 0.54, 0.05, 0.07, 0.012, C.green, shade(C.green, 1.5));
    }
    carPark(b, 0.15, y0, pz, bays, level + 1);
    lamp(b, -lot.w / 2 + 0.95, lot.d / 2 - 0.3, Math.PI);
    tree(b, -lot.w / 2 + 0.4, lot.d / 2 - 0.5, 0.7);
    bush(b, -lot.w / 2 + 0.35, lot.d / 2 - 1.05);
  },
  { lot: PLOT.retail },
);
