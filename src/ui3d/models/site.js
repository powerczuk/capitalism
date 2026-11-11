// Construction sites and the stand-in models for building types that have
// no model of their own.

import { C } from '../palette.js';
import { shade } from '../kit.js';
import { PLOT, registerModel } from './index.js';
import { HALF, ac, bush, canopy, chimney, container, crates, dock, flag, hedge, lamp, lorry, pine, pylon, silo, tree, truck } from './props.js';
import { beam, carPark, dish, glazingGlow, skylights, slopes, yard } from './retail.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------------------
// Things found on a building site
// ---------------------------------------------------------------------------

/** Wire fencing from (x1, z1) to (x2, z2): two rails on sparse posts, so it stays cheap round a big plot. */
function wireFence(b, x1, z1, x2, z2, y, h = 0.34) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const posts = clamp(Math.round(len / 1.5) + 1, 2, 8);
  b.at((x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1), () => {
    b.box(0, h * 0.5, 0, 0.02, 0.02, len, C.steel, { ao: 1 });
    b.box(0, h - 0.03, 0, 0.02, 0.02, len, C.steel, { ao: 1 });
    for (let i = 0; i < posts; i++) b.box(0, 0, -len / 2 + (i * len) / (posts - 1), 0.04, h, 0.04, C.steelDark, { ao: 1 });
  });
}

/** A run of hoarding along x from x1 to x2 at depth z: white boards under a band in the owner's colour. */
function hoarding(b, x1, x2, y, z, color) {
  const len = x2 - x1;
  if (len < 0.1) return;
  const posts = clamp(Math.round(len / 1.4) + 1, 2, 6);
  b.box((x1 + x2) / 2, y, z, len, 0.26, 0.04, C.panel, { ao: 0.9 });
  b.box((x1 + x2) / 2, y + 0.26, z, len, 0.12, 0.04, color, { ao: 1 });
  for (let i = 0; i < posts; i++) b.box(x1 + (i * len) / (posts - 1), y, z - 0.035, 0.05, 0.42, 0.05, C.steelDark, { ao: 1 });
}

/** An excavation: banks of spoil round a floor of dark earth (the ground itself cannot be dug into). */
function pit(b, x, y, z, w, d) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const top = y + 0.12; // the crest of the banks
  const low = y + 0.012; // the floor
  const i = 0.2; // how far the sides lean in
  const side = shade(C.soilDark, 0.9);
  slopes(b, x, y, z, w + 0.44, d + 0.44, 0.12, 0.22, C.soil);
  b.plane(x, low, z, w - i * 2, d - i * 2, shade(C.soilDark, 0.76));
  b.quad([x0, top, z1], [x1, top, z1], [x1 - i, low, z1 - i], [x0 + i, low, z1 - i], shade(side, 0.86)); // the sides of the hole
  b.quad([x1, top, z0], [x0, top, z0], [x0 + i, low, z0 + i], [x1 - i, low, z0 + i], side);
  b.quad([x1, top, z1], [x1, top, z0], [x1 - i, low, z0 + i], [x1 - i, low, z1 - i], shade(side, 0.92));
  b.quad([x0, top, z0], [x0, top, z1], [x0 + i, low, z1 - i], [x0 + i, low, z0 + i], shade(side, 1.06));
}

/** An excavator, its boom reaching towards +z. */
function excavator(b, x, y, z, ry) {
  b.at(x, y, z, ry, () => {
    for (const sx of [-0.16, 0.16]) b.box(sx, 0, 0, 0.1, 0.1, 0.56, C.black, { ao: 1 });
    b.box(0, 0.1, -0.04, 0.36, 0.17, 0.44, C.yellow, { ao: 0.9 });
    b.box(-0.08, 0.27, 0.04, 0.17, 0.17, 0.22, C.glassDark, { ao: 1, top: C.yellow });
    beam(b, [0.08, 0.26, 0.12], [0.08, 0.7, 0.52], 0.07, C.yellow); // boom
    beam(b, [0.08, 0.7, 0.52], [0.08, 0.2, 0.92], 0.055, C.yellow); // stick
    b.box(0.08, 0.06, 0.9, 0.16, 0.15, 0.14, C.dark, { ao: 1 }); // bucket
  });
}

/** A tipper lorry, 1.5 long, carrying a load of `load` (earth, sand, gravel). */
function tipper(b, x, y, z, ry, load = C.soil) {
  b.at(x, y, z, ry, () => {
    b.box(0, 0.1, 0.52, 0.48, 0.38, 0.38, C.orange, { ao: 0.85 });
    b.box(0, 0.31, 0.6, 0.485, 0.13, 0.23, C.glassDark, { ao: 1 });
    b.box(0, 0.12, -0.2, 0.4, 0.08, 1.04, C.dark, { ao: 1 });
    b.box(0, 0.2, -0.22, 0.52, 0.27, 0.98, C.steelDark, { ao: 0.9, top: shade(load, 0.85) });
    b.box(0, 0.47, -0.22, 0.38, 0.07, 0.78, load, { ao: 1 });
    for (const sx of [-0.23, 0.23]) for (const sz of [-0.5, -0.16, 0.52]) b.box(sx, 0, sz, 0.08, 0.17, 0.24, C.black, { ao: 1 });
  });
}

/** Site cabins, 1.2 long, `n` of them stacked; doors and windows face +z, a band in the owner's colour. */
function cabins(b, x, y, z, ry, n, color) {
  b.at(x, y, z, ry, () => {
    for (let k = 0; k < n; k++) {
      const cy = k * 0.44;
      b.box(0, cy + 0.03, 0, 1.2, 0.41, 0.5, k ? C.plasterCool : C.white, { ao: 0.9, top: C.panelDark });
      b.box(0, cy + 0.35, 0, 1.215, 0.06, 0.515, color, { ao: 1 });
      b.windows(0.2, cy + 0.12, 0.25, 0, 0.7, 0.2, 2, 1, { gapX: 0.3, gapY: 0.1, lit: 0.9 });
      b.box(-0.4, cy + 0.03, 0.256, 0.17, 0.3, 0.012, C.steelDark, { ao: 1 });
    }
    if (n > 1) {
      // outside stairs to the upper cabin
      b.box(-0.4, 0.44, 0.33, 0.36, 0.03, 0.16, C.steel, { ao: 1 });
      beam(b, [-0.98, 0.02, 0.33], [-0.58, 0.455, 0.33], 0.05, C.steel);
    }
  });
}

/**
 * Scaffolding before a wall `len` long (the wall is local z = 0 and faces +z):
 * `lifts` plank decks, the first `first` above the ground, the others `lift` apart.
 */
function scaffold(b, len, lifts, lift, first) {
  const bays = clamp(Math.round(len / 0.95), 2, 7);
  const out = 0.27;
  const top = first + (lifts - 1) * lift;
  const at = (i) => -len / 2 + (i * len) / bays;
  for (let i = 0; i <= bays; i++) b.box(at(i), 0, out, 0.03, top + 0.26, 0.03, C.steel, { ao: 1 });
  for (let k = 0; k < lifts; k++) {
    b.box(0, first + k * lift - 0.025, out / 2 + 0.01, len, 0.025, out - 0.02, C.wood, { ao: 1, bottom: true }); // planks
    b.box(0, first + k * lift + 0.19, out, len, 0.02, 0.02, C.steel, { ao: 1 }); // guard rail
  }
  for (let i = 0; i < bays; i += 2) beam(b, [at(i), 0, out + 0.02], [at(i + 1), top, out + 0.02], 0.02, C.steel);
}

/**
 * A tower crane at the origin of the current frame: mast on a concrete foot,
 * jib towards +z (`reach` long), counter-jib with its weights behind (`tail`).
 * The hook hangs at `trolley` (0…1) along the jib, `drop` below it, with a load.
 */
function crane(b, h, reach, tail, trolley, drop, color) {
  const paint = C.yellow;
  const band = shade(C.yellow, 0.74);
  b.box(0, 0, 0, 0.56, 0.1, 0.56, C.concreteDark, { ao: 0.9 });
  b.box(0, 0.1, 0, 0.15, h - 0.1, 0.15, paint, { ao: 0.95 });
  for (let y = 0.5; y < h - 0.2; y += 0.5) b.box(0, y, 0, 0.17, 0.035, 0.17, band, { ao: 1 }); // the joints of the mast
  b.box(0, h, 0, 0.24, 0.1, 0.24, C.dark, { ao: 1 }); // slewing ring
  b.box(0.17, h + 0.01, 0.12, 0.16, 0.2, 0.2, C.white, { ao: 1 }); // the driver's cab
  b.box(0.17, h + 0.08, 0.12, 0.165, 0.09, 0.205, C.glassDark, { ao: 1 });
  b.box(0, h + 0.1, reach / 2 - 0.06, 0.1, 0.1, reach + 0.12, paint, { ao: 1, bottom: true }); // jib
  b.box(0, h + 0.1, -tail / 2, 0.14, 0.07, tail, paint, { ao: 1, bottom: true }); // counter-jib
  b.box(0, h - 0.1, -tail + 0.2, 0.22, 0.2, 0.34, C.concreteDark, { ao: 1, bottom: true }); // counterweights
  b.box(0, h + 0.17, -tail * 0.52, 0.15, 0.17, tail * 0.5, color, { ao: 1 }); // the firm's board
  b.box(0, h + 0.1, 0, 0.1, 0.56, 0.1, paint, { ao: 1 }); // tower head
  beam(b, [0, h + 0.64, 0], [0, h + 0.2, reach * 0.66], 0.024, C.dark); // tie bars
  beam(b, [0, h + 0.64, 0], [0, h + 0.34, -tail + 0.08], 0.024, C.dark);
  b.lamp(0, h + 0.66, 0, 0.05, 0.05, 0.05, C.lampRed);
  b.lamp(0, h + 0.2, reach - 0.03, 0.05, 0.05, 0.05, C.lampRed);
  // trolley, rope, hook and what hangs on it
  const tz = reach * trolley;
  const hy = h + 0.04 - drop;
  b.box(0, h + 0.05, tz, 0.14, 0.05, 0.16, C.dark, { ao: 1 });
  b.box(0, hy, tz, 0.014, drop, 0.014, C.dark, { ao: 1 });
  b.box(0, hy - 0.06, tz, 0.07, 0.07, 0.07, paint, { ao: 1 });
  b.box(0, hy - 0.2, tz, 0.26, 0.1, 0.52, C.wood, { ao: 1, bottom: true });
  for (const s of [-1, 1]) beam(b, [0, hy - 0.04, tz], [0, hy - 0.1, tz + s * 0.22], 0.014, C.dark);
  b.lamp(0, h + 0.01, tz, 0.08, 0.04, 0.1, C.lampCool); // the work light on the trolley …
  b.pool(0, -0.02, tz, 1.2, shade(C.lampCool, 0.75)); // … and what it lights below
}

/** A heap of sand, gravel or earth. */
function heap(b, x, y, z, r, color) {
  b.cone(x, y, z, r, r * 0.62, color, { seg: 7 });
}

/** A floodlight on a pole; at night it lights the ground towards `ry`. */
function floodlight(b, x, y, z, ry) {
  b.at(x, y, z, ry, () => {
    b.box(0, 0, 0, 0.045, 1.3, 0.045, C.steelDark, { ao: 1 });
    b.lamp(0, 1.24, 0.06, 0.22, 0.09, 0.07, C.lampCool);
    b.pool(0, 0.04, 1.0, 1.45, shade(C.lampCool, 0.75));
  });
}

/** One stack of building material; `kind` picks which. Fits a 0.9 × 0.6 patch, long side along local x. */
function material(b, kind, x, y, z, ry) {
  b.at(x, y, z, ry, () => {
    if (kind === 0) {
      // pallets of bricks
      crates(b, -0.2, 0, 2, C.brick);
      crates(b, 0.2, 0, 1, C.brick);
    } else if (kind === 1) {
      // steel beams in red primer
      for (let i = 0; i < 3; i++) b.box(0, 0, -0.14 + i * 0.14, 0.95, 0.07, 0.07, C.brickDark, { ao: 0.95 });
      b.box(0.03, 0.07, -0.07, 0.95, 0.07, 0.07, C.brickDark, { ao: 1 });
    } else if (kind === 2) {
      // boards and formwork
      b.box(0, 0, 0, 0.9, 0.16, 0.42, C.wood, { ao: 0.9, top: shade(C.wood, 1.12) });
      b.box(0.05, 0.16, 0.02, 0.8, 0.05, 0.36, shade(C.wood, 1.2), { ao: 1 });
    } else if (kind === 3) {
      // sacks of cement on pallets
      crates(b, -0.2, 0, 2, C.plasterCool);
      crates(b, 0.2, 0, 2, C.plasterCool);
    } else if (kind === 4) {
      // concrete pipes
      for (const sx of [-0.2, 0.2]) b.box(sx, 0, 0, 0.3, 0.3, 0.7, C.concrete, { ao: 0.9, top: C.concreteDark });
    } else {
      // mats of reinforcing steel
      b.box(0, 0, 0, 0.9, 0.06, 0.5, C.roofBrown, { ao: 1, top: shade(C.roofBrown, 0.85) });
      b.box(0.04, 0.06, -0.03, 0.9, 0.03, 0.5, C.roofBrown, { ao: 1 });
    }
  });
}

// ---------------------------------------------------------------------------
// Construction site: what stands on a plot while its building is being built
// or enlarged. It fits any plot and changes with `ctx.progress` (0 → 1;
// without it the three levels stand for an early, a middle and a late stage).
//   up to 0.2   earthworks: a fenced plot, an excavation, an excavator and a tipper
//   0.2 – 0.7   the slab is poured, a tower crane goes up, a concrete frame rises
//               storey by storey inside scaffolding
//   0.5 – 0.95  walls close the storeys from the bottom up, the roof goes on,
//               the scaffolding comes down
// The hoarding along the street, the banner on it, the cabins and the board
// on the crane carry the owner's colour.
// ---------------------------------------------------------------------------

registerModel(
  'site',
  (b, ctx) => {
    const { level, color, lot } = ctx;
    const p = clamp(ctx.progress ?? [0.15, 0.5, 0.85][level - 1], 0, 1);
    const y0 = 0.04;
    const L = -lot.w / 2 + 0.16; // the fence line
    const R = lot.w / 2 - 0.16;
    const B = -lot.d / 2 + 0.16;
    const F = lot.d / 2 - 0.28; // the hoarding stands just behind the kerb
    yard(b, lot, C.soil);

    // What is being built: a frame of three storeys, towards the back right of the plot
    const fw = clamp(lot.w * 0.5, 2.2, 6);
    const fd = clamp(lot.d * 0.46, 2, 5.5);
    const fx = R - 0.52 - fw / 2;
    const fz = B + 0.45 + fd / 2;
    const nx = clamp(Math.round(fw / 1.2), 2, 5);
    const nz = clamp(Math.round(fd / 1.2), 2, 3);
    const storeys = 3;
    const sh = 0.6;
    const base = y0 + 0.1; // top of the ground slab
    const rise = clamp((p - 0.2) / 0.5, 0, 1) * storeys; // storeys of frame standing
    const done = Math.floor(rise + 1e-6);
    const part = rise - done; // how far the next one has got
    const walls = clamp((p - 0.5) / 0.4, 0, 1) * storeys; // storeys closed in
    const topped = done >= storeys;
    const colX = (i) => fx - fw / 2 + 0.13 + (i * (fw - 0.26)) / nx;
    const colZ = (j) => fz - fd / 2 + 0.13 + (j * (fd - 0.26)) / nz;
    const left = fx - fw / 2;
    const front = fz + fd / 2;

    // Trampled ground: the way in from the gate, wheel tracks, dark earth round the works
    const gate = clamp((L + left) / 2 - 0.2, L + 0.7, left - 0.3);
    const road = front + 0.4; // the near edge of the track along the frame
    b.plane(gate, y0 + 0.012, (F + road) / 2, 0.8, F - road, C.gravel);
    b.plane((gate + 0.4 + fx + fw * 0.3) / 2, y0 + 0.012, road + 0.35, fx + fw * 0.3 - gate - 0.4, 0.7, C.gravel);
    for (const s of [-1, 1]) b.plane(gate + s * 0.2, y0 + 0.024, (F + road) / 2, 0.09, F - road, C.soilDark);

    if (p < 0.2) {
      // Earthworks: the hole, footings going in, the spoil heaped at the back
      pit(b, fx, y0, fz, fw + 0.3, fd + 0.3);
      const pads = Math.floor(clamp((p - 0.06) / 0.13, 0, 1) * (nx + 1) * (nz + 1));
      for (let k = 0; k < pads; k++) {
        const cx = colX(k % (nx + 1));
        const cz = colZ(Math.floor(k / (nx + 1)));
        b.box(cx, y0 + 0.012, cz, 0.32, 0.07, 0.32, C.concrete, { ao: 0.9 });
        b.box(cx, y0 + 0.082, cz, 0.09, 0.2, 0.09, C.roofBrown, { ao: 1 });
      }
      excavator(b, left + 0.15, y0, front + 0.6, Math.PI * 0.82);
      const spoil = Math.min(0.26 + p * 1.2, (left - L - 0.8) / 2);
      heap(b, left - 0.42 - spoil, y0, fz - fd * 0.18, spoil, C.soil);
      if (lot.w > 8) heap(b, left - 1.6 - spoil, y0, fz + 0.2, spoil * 0.8, shade(C.soil, 0.93));
    } else {
      b.plane(fx, y0 + 0.012, fz, fw + 0.7, fd + 0.7, shade(C.soilDark, 1.06));
      b.box(fx, y0, fz, fw + 0.2, 0.1, fd + 0.2, C.concrete, { ao: 0.92 });

      // The frame: columns through every finished storey, floor slabs, the stair core
      const colTop = topped ? base + storeys * sh - 0.08 : base + done * sh + clamp(part / 0.5, 0.12, 1) * (sh - 0.08);
      const few = (nx + 1) * (nz + 1) <= 12;
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= nz; j++) {
          b.box(colX(i), base, colZ(j), 0.13, colTop - base, 0.13, C.concrete, { ao: 0.9 });
          if (!topped && (few || (i + j) % 2 === 0)) b.box(colX(i), colTop, colZ(j), 0.06, 0.14, 0.06, C.roofBrown, { ao: 1 }); // starter bars
        }
      }
      for (let k = 1; k <= done; k++) b.box(fx, base + k * sh - 0.08, fz, fw + 0.12, 0.08, fd + 0.12, C.concrete, { ao: 1, bottom: true });
      if (!topped && part > 0.5) {
        // formwork for the next floor creeps across the columns
        const len = (fw + 0.12) * clamp((part - 0.5) / 0.5, 0.15, 1);
        b.box(left - 0.06 + len / 2, colTop, fz, len, 0.045, fd + 0.12, C.wood, { ao: 1, bottom: true, top: shade(C.wood, 1.12) });
      }
      const coreTop = Math.min(storeys * sh + 0.3, (done + 1) * sh + 0.16);
      b.box((colX(1) + colX(2)) / 2, base, colZ(0) + 0.32, 0.56, coreTop, 0.5, C.concreteDark, { ao: 0.9 });

      // Walls close the storeys from the bottom up: first the back and the left, then all round
      const wall = C.plasterCool;
      const hole = { color: C.glassDark, gapX: 0.36, gapY: 0.34, lit: 0.25 };
      for (let k = 0; k < storeys; k++) {
        const wy = base + k * sh;
        if (walls >= k + 1) {
          b.box(fx, wy, fz, fw + 0.04, sh - 0.08, fd + 0.04, wall, { ao: 0.95 });
          for (const s of [0, 1]) {
            b.windows(fx, wy + 0.03, fz + (s ? -1 : 1) * (fd / 2 + 0.02), s * Math.PI, fw - 0.1, sh - 0.14, nx * 2, 1, hole);
            b.windows(fx + (s ? -1 : 1) * (fw / 2 + 0.02), wy + 0.03, fz, (s ? -1 : 1) * HALF, fd - 0.1, sh - 0.14, nz * 2, 1, hole);
          }
        } else if (walls >= k + 0.4) {
          b.box(fx, wy, fz - fd / 2, fw + 0.04, sh - 0.08, 0.07, wall, { ao: 0.95 });
          b.box(left, wy, fz, 0.07, sh - 0.08, fd + 0.04, wall, { ao: 0.95 });
        }
      }
      const deck = base + storeys * sh;
      if (p >= 0.92) {
        // the roof is on
        b.box(fx, deck, fz, fw + 0.16, 0.08, fd + 0.16, C.white, { ao: 1 });
        b.plane(fx, deck + 0.092, fz, fw, fd, C.roofFlat);
      } else if (topped) {
        // things left on the top deck
        b.at(0, deck, 0, 0, () => crates(b, fx + fw * 0.28, fz + fd * 0.2, 2, C.plasterCool));
        b.box(fx + fw * 0.1, deck, fz - fd * 0.25, 0.7, 0.05, 0.4, C.roofBrown, { ao: 1 });
      }

      // Scaffolding on the two sides towards the street; the firm's banner hangs on it
      const lifts = clamp(done + 1, 1, storeys);
      if (p < 0.97) {
        b.at(fx, y0, front + 0.07, 0, () => {
          scaffold(b, fw + 0.1, lifts, sh, sh + 0.1);
          const bw = Math.min(1.3, fw * 0.45);
          b.box(fw * 0.2, lifts * sh - 0.32, 0.33, bw, 0.4, 0.016, color, { ao: 1 });
          b.box(fw * 0.2, lifts * sh - 0.15, 0.345, bw * 0.6, 0.07, 0.012, C.white, { ao: 1 });
        });
      }
      if (p < 0.86) b.at(fx + fw / 2 + 0.07, y0, fz, HALF, () => scaffold(b, fd + 0.1, lifts, sh, sh + 0.1));

      // The tower crane stands in what will be the lift shaft; its jib swings over the yard and
      // the frame as the work goes on. It is taken down when the roof goes on.
      if (p < 0.92) {
        const mx = (colX(0) + colX(1)) / 2;
        const mz = (colZ(0) + colZ(1)) / 2;
        const aim = -Math.PI / 4 + Math.sin(p * 9) * 0.45;
        const room = (dx, dz) => Math.min(dx > 0 ? (R - mx) / dx : dx < 0 ? (L - mx) / dx : 99, dz > 0 ? (F - mz) / dz : dz < 0 ? (B - mz) / dz : 99);
        const reach = Math.min(Math.hypot(fw, fd) * 0.85, room(Math.sin(aim), Math.cos(aim)) - 0.1);
        const tail = Math.min(reach * 0.34, room(-Math.sin(aim), -Math.cos(aim)) - 0.1);
        const mast = storeys * sh + 1.2;
        const hang = 0.5 + 0.38 * Math.abs(Math.sin(p * 23));
        b.at(mx, base, mz, aim, () => crane(b, mast, reach, tail, hang, mast - lifts * sh - 0.75, color));
      }
    }

    // The fence: wire on three sides, a hoarding with a gate and the firm's banner along the street
    wireFence(b, L, B, R, B, y0);
    wireFence(b, L, B, L, F, y0);
    wireFence(b, R, B, R, F, y0);
    hoarding(b, L, gate - 0.5, y0, F, color);
    hoarding(b, gate + 0.5, R, y0, F, color);
    for (const s of [-1, 1]) b.box(gate + s * 0.572, y0, F - 0.2, 0.03, 0.36, 0.42, C.steel, { ry: -s * 0.35, ao: 1 }); // the gate, open
    const bx = Math.min(gate + 1.3, R - 0.7);
    b.lamp(bx, y0 + 0.2, F + 0.03, 1.2, 0.5, 0.03, color);
    b.box(bx, y0 + 0.5, F + 0.055, 0.8, 0.08, 0.012, C.white, { ao: 1 });
    b.box(bx - 0.15, y0 + 0.36, F + 0.055, 0.5, 0.05, 0.012, C.white, { ao: 1 });

    // Cabins and the privy by the left fence, lorries on the way in
    const stack = p >= 0.35 ? 2 : 1;
    cabins(b, L + 0.42, y0, B + 0.95, HALF, stack, color);
    if (lot.w > 8) cabins(b, L + 0.42, y0, B + 2.4, HALF, 1, color);
    b.box(L + 0.3, y0, B + (lot.w > 8 ? 3.35 : 1.95), 0.22, 0.42, 0.22, C.blue, { ao: 0.9, top: C.white });
    if (p < 0.3) tipper(b, gate, y0, Math.min(road + 0.75, F - 0.8), Math.PI, C.soil);
    else b.at(0, y0, 0, 0, () => truck(b, gate + 0.02, Math.min(road + 0.75, F - 0.8), Math.PI, color));
    if (lot.w > 8 && p >= 0.2) b.at(0, y0, 0, 0, () => lorry(b, (gate + fx) / 2 + 0.3, road + 0.35, HALF, C.wood));
    floodlight(b, L + 0.2, y0, F - 0.25, Math.PI * 0.75);
    floodlight(b, R - 0.2, y0, F - 0.25, -Math.PI * 0.75);

    // Material waits along the hoarding, beyond the track; more of it on a bigger plot
    const stacks = clamp(Math.floor((R - gate - 1.2) / 1.1), 1, 5);
    const rows = F - road > 3 ? 2 : 1;
    const due = p < 0.08 ? 1 : p < 0.2 ? 2 : 99; // how much has been delivered so far
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < Math.min(stacks, due); i++) {
        const k = (i + r * 3) % 8;
        const sx = R - 0.7 - i * 1.1;
        const sz = F - 0.45 - r * 1.3;
        if (k === 1 || k === 5) heap(b, sx, y0, sz, 0.3, k === 1 ? C.sand : C.gravel);
        else material(b, k > 5 ? k - 2 : k > 1 ? k - 1 : k, sx, y0, sz, (b.rand() - 0.5) * 0.24);
      }
    }
  },
  { lot: PLOT.retail },
);

// ---------------------------------------------------------------------------
// Stand-ins: what a building type gets when nobody has drawn a model for it
// (a mod's new building, say). One per kind — a shop, a plant, a laboratory
// and a plain house of business. They are simple but tidy, fit any plot and
// grow with the level.
// ---------------------------------------------------------------------------

/** How long a side of a stand-in is: a share of the plot between limits — four fifths of that at level 1. */
const sized = (plot, level, share, min, max) => clamp(plot * share, min, max) * (0.7 + level * 0.1);

/**
 * The ground of a stand-in: `paving` from the street back to z = `edge` and
 * `half` to either side of the middle; the rest of the plot is lawn with a few
 * trees, so a big plot is not paved all over. Trees keep out of the paving and
 * of `clear` = [x0, x1, z0] — the building and what lies before it.
 */
function grounds(b, lot, edge, half, paving = C.asphalt, clear = [0, 0, 99]) {
  const back = -lot.d / 2 + 0.05;
  const front = lot.d / 2 - 0.05;
  const side = lot.w / 2 - 0.05;
  const e = edge - back < 1 ? back : edge; // a thin strip of lawn is not worth having
  const hw = side - half < 1 ? side : half;
  b.box(0, 0, 0, side * 2, 0.03, lot.d - 0.1, C.grass, { ao: 1 });
  b.box(0, 0, (e + front) / 2, hw * 2, 0.04, front - e, paving, { ao: 1 });
  b.box(0, 0, lot.d / 2 - 0.12, side * 2, 0.07, 0.14, C.curb, { ao: 1 });
  const lawn = side * 2 * (lot.d - 0.1) - hw * 2 * (front - e);
  for (let i = clamp(Math.round(lawn / 11), 0, 6), tries = 0; i > 0 && tries < 60; tries++) {
    const x = (b.rand() * 2 - 1) * (side - 0.6);
    const z = back + 0.6 + b.rand() * (front - back - 1.4);
    const kind = b.rand();
    const size = 0.7 + b.rand() * 0.35;
    if (Math.abs(x) < hw + 0.5 && z > e - 0.5) continue; // on the paving
    if (x > clear[0] - 0.5 && x < clear[1] + 0.5 && z > clear[2] - 0.5) continue;
    if (kind < 0.35) pine(b, x, z, size, kind * 2);
    else tree(b, x, z, size, kind);
    i--;
  }
}

// A shop: a plastered box with a glass front under an awning in the owner's
// colour, the sign over it, cars before the door. Level 3 adds a floor.
registerModel(
  'kind:retail',
  (b, { level, color, lot }) => {
    const y0 = 0.04;
    const w = Math.min(lot.w - 0.9, sized(lot.w, level, 0.62, 2.8, 6));
    const d = Math.min(lot.d - 2.4, sized(lot.d, level, 0.38, 1.8, 3.4));
    const g = 1.0; // the shop
    const h = g + (level === 3 ? 0.6 : 0); // … and the rooms over it
    const front = lot.d / 2 - Math.min(lot.d - d - 0.5, 2.9);
    const z = front - d / 2;
    const back = z - d / 2;
    const bright = shade(color, 1.3);
    grounds(b, lot, back - 0.5, w / 2 + 1.6);

    b.box(0, y0, z, w, h, d, C.plaster);
    b.box(0, y0, z, w + 0.04, 0.12, d + 0.04, C.concreteDark, { ao: 0.9 });
    b.box(0, y0 + h - 0.02, z, w + 0.1, 0.11, d + 0.1, C.white, { ao: 1 });
    const roof = y0 + h + 0.102;
    b.plane(0, roof, z, w - 0.08, d - 0.08, C.roofFlat);

    // Shop front: glass between white posts, the door, the awning, the sign
    const gw = w - 0.5;
    const panes = Math.max(2, Math.round(gw / 0.6));
    b.layer('glass').box(0, y0 + 0.14, front + 0.008, gw, 0.44, 0.02, C.glassLight, { ao: 0.95 }).layer('solid');
    glazingGlow(b, 0, y0 + 0.14, front + 0.018, 0, gw, 0.44, panes);
    for (let i = 0; i <= panes; i++) b.box(-gw / 2 + (i * gw) / panes, y0 + 0.12, front + 0.025, 0.035, 0.48, 0.03, C.white, { ao: 1 });
    b.box(panes % 2 ? 0 : gw / 2 / panes, y0, front + 0.035, gw / panes - 0.1, 0.5, 0.03, C.glassDark, { ao: 1 });
    b.wedge(0, y0 + 0.57, front + 0.21, gw + 0.16, 0.17, 0.36, shade(color, 0.8), { h2: 0.04, top: color });
    b.lamp(0, y0 + 0.77, front + 0.02, w * 0.5, 0.19, 0.04, color, bright);
    b.box(0, y0 + 0.835, front + 0.05, w * 0.32, 0.06, 0.012, C.white, { ao: 1 });

    // Windows: the rooms upstairs, one in each side wall, the office behind
    const win = { gapX: 0.36, gapY: 0.3, lit: 0.55 };
    if (level === 3) {
      const cols = Math.max(2, Math.round(w / 0.62));
      const rows = Math.max(2, Math.round(d / 0.62));
      b.windows(0, y0 + g, front, 0, w - 0.2, 0.56, cols, 1, win);
      b.windows(0, y0 + g, back, Math.PI, w - 0.2, 0.56, cols, 1, win);
      for (const s of [-1, 1]) b.windows((s * w) / 2, y0 + g, z, s * HALF, d - 0.2, 0.56, rows, 1, win);
    }
    for (const s of [-1, 1]) b.windows((s * w) / 2, y0 + 0.2, z + d * 0.14, s * HALF, d * 0.5, 0.5, 2, 1, { ...win, gapX: 0.2, lit: 0.8 });
    b.windows(-w / 4, y0 + 0.32, back, Math.PI, w * 0.36, 0.4, 2, 1, win);
    b.box(w / 4, y0, back - 0.012, 0.3, 0.5, 0.024, C.steelDark, { ao: 1 });

    // Roof: light for the shop floor, air conditioning
    skylights(b, -w / 5, roof, z, level === 2 ? 2 : 1);
    for (let i = 0; i < (level > 1 ? 2 : 1); i++) ac(b, w / 2 - 0.4 - i * 0.44, roof, back + 0.36);

    // Before the door: paving, a row of bays, a lamp and a tree by the street
    const bays = clamp(Math.floor((Math.min(lot.w, w + 3) - 1.3) / 0.56), 2, 9);
    b.box(0, y0, front + 0.3, w + 0.3, 0.03, 0.6, C.pavement, { ao: 1 });
    carPark(b, 0.15, y0, lot.d / 2 - 0.8, bays, Math.min(bays, level + 1));
    lamp(b, -(bays * 0.28) - 0.25, lot.d / 2 - 0.3, Math.PI);
    if (level > 1) b.at(0, y0, 0, 0, () => flag(b, Math.min(bays * 0.28 + 0.5, lot.w / 2 - 0.5), lot.d / 2 - 0.4, color, 1.3));
    bush(b, -(bays * 0.28) - 0.3, lot.d / 2 - 0.95);
  },
  { lot: PLOT.retail },
);

// A plant: a hall under a sawtooth roof with a band in the owner's colour, a
// brick boiler house whose chimney smokes, tanks from level 2, a fenced yard
// with a lorry at the dock.
registerModel(
  'kind:producer',
  (b, { level, color, lot }) => {
    const y0 = 0.04;
    const bw = 1.05 + level * 0.1; // the boiler house stands to the right of the hall
    const w = Math.min(lot.w - bw - 1.2, sized(lot.w, level, 0.5, 2.4, 6.2));
    const d = Math.min(lot.d - 2.5, sized(lot.d, level, 0.42, 1.9, 4.4));
    const wallH = 0.9 + level * 0.1;
    const hx = -(bw + 0.25) / 2;
    const z = -lot.d / 2 + 0.6 + d / 2;
    const front = z + d / 2;
    const back = z - d / 2;
    const right = hx + w / 2;
    const bx = right + 0.25 + bw / 2;
    const depth = lot.d / 2 - front; // of the yard
    const bright = shade(color, 1.3);
    yard(b, lot, lot.d > 8 ? C.gravel : C.concrete);
    if (lot.d > 8) b.box(0, 0.012, front + 1.6, Math.min(lot.w - 0.6, w + bw + 2), 0.04, 3.2, C.concrete, { ao: 1 }); // an apron before the doors

    // The hall: light cladding on a plinth, the band, a sawtooth roof with its lights to the right
    b.box(hx, y0, z, w, wallH, d, C.panel, { top: C.roofGrey });
    b.box(hx, y0, z, w + 0.04, 0.14, d + 0.04, C.concreteDark, { ao: 0.9 });
    b.box(hx, y0 + wallH - 0.28, z, w + 0.03, 0.13, d + 0.03, color, { ao: 1 });
    const teeth = clamp(Math.round(w / 0.85), 2, 6);
    const tw = w / teeth;
    for (let i = 0; i < teeth; i++) {
      const tx = hx - w / 2 + (i + 0.5) * tw;
      b.wedge(tx, y0 + wallH, z, d, 0.34, tw, C.panel, { ry: -HALF, top: C.roofGrey });
      b.layer('glass').box(tx + tw / 2 - 0.004, y0 + wallH + 0.06, z, 0.02, 0.22, d - 0.3, C.glassLight, { ao: 1 }).layer('solid');
      glazingGlow(b, tx + tw / 2 + 0.006, y0 + wallH + 0.06, z, HALF, d - 0.3, 0.22, 3, shade(C.lampCool, 0.8), 0.03, 0.7);
    }
    const door = Math.min(0.9, w * 0.34);
    b.box(hx - w * 0.22, y0, front + 0.012, door, 0.6, 0.024, C.steelDark, { ao: 1 });
    b.box(hx - w * 0.22, y0 + 0.6, front + 0.02, door + 0.3, 0.035, 0.04, C.steel, { ao: 1 }); // the rail it slides on
    dock(b, hx + w * 0.24, front + 0.005, 0, 0.64);
    b.lamp(hx, y0 + wallH - 0.34, front + 0.03, Math.min(1.2, w * 0.42), 0.24, 0.04, color, bright);
    b.box(hx, y0 + wallH - 0.25, front + 0.06, Math.min(0.8, w * 0.28), 0.06, 0.012, C.white, { ao: 1 });
    const win = { gapX: 0.4, gapY: 0.1, lit: 0.5 };
    b.windows(hx, y0 + wallH - 0.64, back, Math.PI, w - 0.4, 0.3, Math.max(2, Math.round(w / 0.7)), 1, win);
    b.windows(hx - w / 2, y0 + wallH - 0.64, z, -HALF, d - 0.4, 0.3, Math.max(2, Math.round(d / 0.7)), 1, win);

    // The boiler house and its chimney
    const bd = Math.min(d * 0.62, 1.7);
    const bz = back + bd / 2;
    const bh = wallH + 0.3;
    b.block(bx, y0, bz, bw, bh, bd, C.brick, { win: { rows: 1, cols: 2, colsSide: 2, faces: 'fr', base: bh - 0.52, cap: 0.16, lit: 0.6 } });
    b.box(bx, y0 + bh - 0.02, bz, bw + 0.08, 0.1, bd + 0.08, C.brickDark, { ao: 1, top: C.roofDark });
    b.box(bx - bw * 0.2, y0, bz + bd / 2 + 0.012, 0.3, 0.5, 0.024, C.steelDark, { ao: 1 });
    b.box(bx + bw * 0.14, y0 + bh + 0.08, bz - bd * 0.12, 0.5, 0.12, 0.5, C.brickDark, { ao: 0.95 });
    const smoke = [chimney(b, bx + bw * 0.14, y0 + bh + 0.2, bz - bd * 0.12, 0.17 + level * 0.012, 1.1 + level * 0.32, C.brick)];
    b.box((right + bx - bw / 2) / 2, y0 + wallH * 0.62, bz, 0.25, 0.07, 0.07, C.steel, { ao: 1 }); // steam main to the hall

    // Tanks once the plant has grown
    b.at(0, y0, 0, 0, () => {
      const tz = bz + bd / 2 + 0.52;
      if (level > 1) {
        silo(b, bx, tz, 0.36, 0.75 + level * 0.12, C.panel);
        b.box((right + bx) / 2, 0.42, tz, bx - right, 0.06, 0.06, C.steel, { ao: 1 });
      }
      if (level > 2 && depth > 1.9) silo(b, bx + 0.04, tz + 0.82, 0.3, 1.3, C.plasterCool, true);

      // The yard: a lorry at the dock, pallets by the door, containers where there is room
      if (depth > 3) lorry(b, hx + w * 0.24, front + 1.5, 0, level > 1 ? color : C.steel);
      else if (level > 1) truck(b, hx + w * 0.24, front + 1.08, 0, color);
      const px = Math.max(hx - w * 0.22 - door / 2 - 0.3, -lot.w / 2 + 0.85);
      crates(b, px, front + 0.3, level, C.wood);
      if (level > 1) crates(b, px - 0.42, front + 0.34, 2, C.plasterCool);
      if (lot.w >= 8) {
        const cx = -lot.w / 2 + 0.75;
        container(b, cx, 0, front + 0.3, 0, C.blue);
        container(b, cx + 0.56, 0, front + 0.3, 0, color);
        if (level > 1) container(b, cx + 0.28, 0.5, front + 0.3, 0, C.red);
      }
    });

    // A wire fence with a gate, the firm's flag beside it
    const L = -lot.w / 2 + 0.16;
    const R = lot.w / 2 - 0.16;
    const F = lot.d / 2 - 0.28;
    const gate = hx + w * 0.24;
    wireFence(b, L, back - 0.4, R, back - 0.4, y0);
    wireFence(b, L, back - 0.4, L, F, y0);
    wireFence(b, R, back - 0.4, R, F, y0);
    wireFence(b, L, F, gate - 0.6, F, y0);
    wireFence(b, gate + 0.6, F, R, F, y0);
    b.at(0, y0, 0, 0, () => flag(b, gate + 0.85, F - 0.12, color, 1.4));
    return { smoke };
  },
  { lot: PLOT.industrial },
);

// A laboratory: a white block with ribbon windows on a lawn, a glazed
// entrance under a canopy in the owner's colour, fume stacks on the roof;
// a dome from level 2, a dish at level 3. One storey more with every level.
registerModel(
  'kind:research',
  (b, { level, color, lot }) => {
    const y0 = 0.04;
    const w = Math.min(lot.w - 1.1, sized(lot.w, level, 0.6, 2.9, 6.2));
    const d = Math.min(lot.d - 2.6, sized(lot.d, level, 0.32, 1.7, 3.2));
    const floors = level + 1;
    const s = 0.6;
    const h = floors * s + 0.06;
    const front = lot.d / 2 - Math.min(lot.d - d - 0.6, 2.8);
    const z = front - d / 2;
    const back = z - d / 2;
    const bright = shade(color, 1.3);
    const park = lot.d / 2 - 1.5; // the car park is a strip along the street
    grounds(b, lot, park, lot.w, C.asphalt, [-w / 2 - 0.4, w / 2 + 0.4, back - 0.3]);
    b.box(0, 0.012, (front + park) / 2, 1.1, 0.03, park - front, C.pavement, { ao: 1 }); // the path to the door

    // The block: white bands and bands of glass, storey upon storey
    b.box(0, y0, z, w, h, d, C.white, { top: C.roofLight });
    b.box(0, y0, z, w + 0.04, 0.1, d + 0.04, C.concreteDark, { ao: 0.9 });
    b.box(0, y0 + h - 0.02, z, w + 0.1, 0.1, d + 0.1, C.panel, { ao: 1 });
    const roof = y0 + h + 0.092;
    b.plane(0, roof, z, w - 0.08, d - 0.08, C.roofLight);
    const cols = Math.max(3, Math.round(w / 0.7));
    const rows = Math.max(2, Math.round(d / 0.7));
    for (let k = 0; k < floors; k++) {
      const wy = y0 + k * s + 0.2;
      b.layer('glass').box(0, wy, z, w + 0.016, 0.3, d + 0.016, C.glass, { ao: 1 }).layer('solid');
      for (const f of [0, 1]) {
        glazingGlow(b, 0, wy, z + (f ? -1 : 1) * (d / 2 + 0.008), f * Math.PI, w - 0.24, 0.3, cols, C.lampCool, 0.03, 0.5);
        glazingGlow(b, (f ? -1 : 1) * (w / 2 + 0.008), wy, z, (f ? -1 : 1) * HALF, d - 0.24, 0.3, rows, C.lampCool, 0.03, 0.5);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.04), y0, z + sz * (d / 2 - 0.04), 0.13, h, 0.13, C.white, { ao: 0.92 });

    // The entrance: a glazed bay the height of the block, the canopy, the sign beside it
    b.layer('glass').box(0, y0, front + 0.07, 0.9, h - 0.16, 0.14, C.glassLight, { ao: 0.95 }).layer('solid');
    glazingGlow(b, 0, y0, front + 0.14, 0, 0.9, h - 0.16, 2, C.lampCool, 0.03);
    b.box(0, y0, front + 0.146, 0.4, 0.46, 0.012, C.glassDark, { ao: 1 });
    b.box(0, y0 + 0.52, front + 0.36, 1.3, 0.05, 0.5, color, { ao: 1, bottom: true });
    b.lamp(w / 4 + 0.2, y0 + 0.5, front + 0.03, Math.min(1.1, w * 0.3), 0.2, 0.04, color, bright);
    b.box(w / 4 + 0.2, y0 + 0.57, front + 0.06, Math.min(0.7, w * 0.2), 0.06, 0.012, C.white, { ao: 1 });
    b.box(-w / 4, y0, back - 0.012, 0.3, 0.5, 0.024, C.steelDark, { ao: 1 });

    // Roof: fume stacks over the laboratories, air conditioning, later a dome and a dish
    b.box(w / 2 - 0.75, roof, back + 0.4, 0.9, 0.14, 0.36, C.panelDark, { ao: 0.9 });
    for (let i = 0; i < 2 + level; i++) b.cyl(w / 2 - 1.1 + i * 0.22, roof + 0.14, back + 0.4, 0.05, 0.42, C.steel, { seg: 6, top: C.dark });
    ac(b, -w / 2 + 0.4, roof, back + 0.36);
    if (level > 1) {
      const r = 0.3 + level * 0.06;
      b.cyl(-w / 4, roof, z + 0.05, r, 0.14, C.panel, { seg: 10 });
      b.ball(-w / 4, roof + 0.14, z + 0.05, r, C.white, { seg: 10, rings: 3, half: true });
      b.box(-w / 4, roof + 0.14, z + 0.05 + r * 0.55, 0.1, r * 0.86, r * 0.9, C.dark, { ao: 1 }); // the slit
    }
    if (level > 2) dish(b, w / 5, roof, z + d * 0.12, 0.3, 0.5);

    // Grounds: a hedge either side of the path, cars by the street, the flag
    const bays = clamp(Math.floor((lot.w - 2.4) / 0.56), 2, 8);
    for (const sx of [-1, 1]) hedge(b, sx * 0.75, front + 0.3, sx * 0.75, park - 0.2);
    carPark(b, 0, y0, lot.d / 2 - 0.8, bays, Math.min(bays, level + 1));
    b.at(0, 0.03, 0, 0, () => {
      flag(b, -1.15, front + 0.5, color, 1.5);
      lamp(b, 1.15, park - 0.3, Math.PI);
    });
  },
  { lot: PLOT.industrial },
);

// Anything else: a plain house of business with a tiled roof, a porch in the
// owner's colour and a sign by the street. Level 2 adds a floor, level 3 a wing.
registerModel(
  'kind:generic',
  (b, { level, color, lot }) => {
    const y0 = 0.04;
    const w = Math.min(lot.w - 2.2, sized(lot.w, level, 0.46, 2.4, 4.4));
    const d = Math.min(lot.d - 2.5, sized(lot.d, level, 0.36, 1.7, 3));
    const floors = level === 1 ? 1 : 2;
    const h = floors * 0.6 + 0.14;
    const front = lot.d / 2 - Math.min(lot.d - d - 0.6, 2.7);
    const z = front - d / 2;
    const back = z - d / 2;
    const x = level === 3 ? -0.5 : 0; // the wing goes to the right
    grounds(b, lot, back - 0.5, w / 2 + 1.5, C.pavement, [x - w / 2, x + w / 2 + 1.6, back]);

    // The house: plastered walls, windows all round, a hipped roof of tiles
    const cols = Math.max(3, Math.round(w / 0.62) | 1); // odd, so the door is in the middle
    b.block(x, y0, z, w, h, d, C.plasterWarm, { win: { rows: floors, cols, bay: 0.62, cap: 0.12, lit: 0.5 } });
    b.box(x, y0, z, w + 0.04, 0.1, d + 0.04, C.concreteDark, { ao: 0.9 });
    b.box(x, y0 + h - 0.02, z, w + 0.2, 0.07, d + 0.2, C.white, { ao: 1 });
    b.hip(x, y0 + h + 0.05, z, w + 0.24, d + 0.24, 0.5, C.roofRed, w - d);
    b.box(x + w * 0.24, y0 + h + 0.1, z - d * 0.1, 0.2, 0.52, 0.2, C.brick, { ao: 0.95, top: C.dark }); // a chimney stack (cold)

    // The door under a porch in the owner's colour, the name over it
    b.box(x, y0, front + 0.02, 0.34, 0.52, 0.03, C.woodDark, { ao: 1 });
    canopy(b, x, y0 + 0.56, front + 0.24, 0.9, 0.46, color);
    if (floors > 1) {
      b.lamp(x, y0 + 0.66, front + 0.02, 0.8, 0.16, 0.04, color, shade(color, 1.3));
      b.box(x, y0 + 0.71, front + 0.05, 0.5, 0.05, 0.012, C.white, { ao: 1 });
    }

    if (level === 3) {
      // A flat-roofed wing with a workshop door
      const ww = Math.min(1.5, lot.w / 2 - 0.5 - (x + w / 2));
      const wx = x + w / 2 + ww / 2;
      b.block(wx, y0, z - d * 0.1, ww, 0.72, d * 0.8, C.plasterWarm, { win: { rows: 1, faces: 'br', lit: 0.5 } });
      b.box(wx, y0 + 0.7, z - d * 0.1, ww + 0.08, 0.08, d * 0.8 + 0.08, C.white, { ao: 1, top: C.roofFlat });
      b.box(wx, y0, z + d * 0.3 + 0.012, ww - 0.4, 0.5, 0.024, C.steelDark, { ao: 1 });
      ac(b, wx, y0 + 0.78, z - d * 0.2);
    }

    // By the street: the sign, a hedge with a gap for the path, a few bays for cars
    b.plane(x, y0 + 0.012, (front + lot.d / 2) / 2, 0.8, lot.d / 2 - front - 0.3, C.stone);
    b.at(0, y0, 0, 0, () => {
      pylon(b, x - 0.95, lot.d / 2 - 0.5, color, 1.2);
      hedge(b, x - w / 2 - 0.3, front + 0.5, x - 0.7, front + 0.5);
      hedge(b, x + 0.7, front + 0.5, x + w / 2 + 0.3, front + 0.5);
      if (level > 1) flag(b, x + 0.95, lot.d / 2 - 0.45, color, 1.4);
    });
    carPark(b, Math.min(x + 1.9, lot.w / 2 - 0.8), y0, lot.d / 2 - 0.8, 2, level > 1 ? 2 : 1);
    bush(b, x - w / 2 - 0.2, front + 0.15);
  },
  { lot: PLOT.retail },
);
