// Stores: supermarket, department store, electronics store.
//
// The supermarket is the reference model of the whole set — read it first if
// you are about to draw a building of your own.

import { C } from '../palette.js';
import { shade } from '../kit.js';
import { PLOT, registerModel } from './index.js';
import { ac, bush, canopy, car, dock, flag, lamp, parking, pylon, tree, truck } from './props.js';

/** The paved yard a store stands on, with a kerb towards the street. */
export function yard(b, lot, color = C.asphalt) {
  b.box(0, 0, 0, lot.w - 0.1, 0.04, lot.d - 0.1, color, { ao: 1 });
  b.box(0, 0, lot.d / 2 - 0.12, lot.w - 0.1, 0.07, 0.14, C.curb, { ao: 1 });
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
    parking(b, -0.15, front + 1.32, bays, 0.25 + level * 0.2);
    if (depth > 3.0) parking(b, -0.15, front + 2.5, bays, 0.1 + level * 0.15);
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
