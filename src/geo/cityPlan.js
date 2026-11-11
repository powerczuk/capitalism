// The plan of a city: where its streets run, which blocks belong to which
// district, where every numbered building plot lies and what stands on the
// land in between. Pure data from pure maths — no rendering, no game rules —
// so any view can draw it (the 3D view does) and it can be tested in Node.
//
//   const plan = cityPlan(content, city, { seed: game.state.settings.seed, cities: game.cities() });
//   plan.lots.center[0]   → { x, z, w, d, ry }   plot number 0 of the district
//
// Axes: x runs east, z runs south (so north is −z, the top of the map); one
// unit is about 5 m. A plot or parcel is a rectangle w × d centred on (x, z)
// whose front — the side on the street — looks along the angle ry
// (0 = south, π/2 = east, π = north, −π/2 = west).
//
// The plan depends on the city's identity (id, archetype) and on the seed,
// never on its present population: plots must stay where they are while the
// city grows. Growth only decides how many of the `parcels` are built up
// (see `builtShare`).
//
// Districts are placed by their `ring` ('core', 'inner', 'outer', 'sector',
// 'country'); the base game's five districts are known, a mod's district may
// say where it belongs with a `ring` field and otherwise joins the outer ring.

export const GRID = {
  block: 10, // a city block is 10 × 10 between the street edges
  road: 2, // width of a street including its pavements
  pitch: 12,
  quad: 5, // a block holds four 5 × 5 plots
};

const RING = { center: 'core', residential: 'inner', suburb: 'outer', industrial: 'sector', rural: 'country' };
const SOUTH = 0;
const EAST = Math.PI / 2;
const NORTH = Math.PI;
const WEST = -Math.PI / 2;

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ringOf = (district) => district.ring ?? RING[district.id] ?? 'outer';

/** Population the plan is sized for: the top of the archetype's range. */
function sizePop(content, city) {
  const arch = content.cityArchetypes.find(city.arch);
  if (arch?.pop) return arch.pop[1];
  return 2 ** Math.ceil(Math.log2(Math.max(100_000, city.pop))); // unknown archetype: a stable bucket
}

/** How many plots of each district the plan keeps room for. */
export function plotCaps(content, city) {
  const pop = sizePop(content, city) * 1.6;
  const caps = {};
  for (const d of content.districts.all()) caps[d.id] = d.plots.base + Math.ceil(pop / d.plots.per) + 1;
  return caps;
}

/**
 * Share (0–1) of the town's parcels that are built up at the city's present
 * population: a parcel is built when its `t` is not above this. A city at
 * the bottom of its class still has gaps in its outermost ring of blocks; at
 * the top of the class the town is complete.
 */
export function builtShare(content, city) {
  const hi = sizePop(content, city);
  const lo = content.cityArchetypes.find(city.arch)?.pop?.[0] ?? hi * 0.6;
  const k = (city.pop - lo) / Math.max(1, hi - lo);
  return Math.max(0.5, Math.min(1, 0.89 + 0.11 * k));
}

function weighted(rand, table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = rand() * total;
  for (const [kind, w] of table) {
    x -= w;
    if (x <= 0) return kind;
  }
  return table[0][0];
}

const FILL = {
  core: [['tower', 34], ['offices', 30], ['shops', 16], ['apartments', 10], ['plaza', 5], ['parking', 5]],
  inner: [['apartments', 34], ['rowhouses', 20], ['house', 14], ['shops', 12], ['park', 8], ['offices', 6], ['parking', 6]],
  outer: [['house', 62], ['rowhouses', 12], ['park', 7], ['meadow', 9], ['shops', 5], ['woods', 5]],
  sector: [['warehouse', 50], ['workshop', 36], ['parking', 14]],
};
const WIDE = {
  core: [['offices', 5], ['tower', 3], ['plaza', 2]],
  inner: [['apartments', 6], ['park', 3], ['school', 1]],
  outer: [['house', 6], ['park', 2], ['woods', 2]],
};
const SCENERY = {
  farmland: [['field', 56], ['meadow', 18], ['woods', 14], ['windfarm', 7], ['lake', 5]],
  highland: [['woods', 40], ['meadow', 20], ['hill', 26], ['lake', 9], ['windfarm', 5]],
  industrial: [['meadow', 32], ['woods', 26], ['field', 18], ['hill', 8], ['windfarm', 11], ['lake', 5]],
  default: [['meadow', 32], ['field', 30], ['woods', 24], ['lake', 8], ['windfarm', 6]],
};

/**
 * @param {object} content the game's content (districts, city archetypes)
 * @param {{id: string, arch: string, pop: number, port?: boolean, x: number, y: number}} city
 * @param {{seed?: string, cities?: object[]}} [opts] `cities`: all cities, to point the highways at the neighbours
 */
export function cityPlan(content, city, opts = {}) {
  const rand = rng(hash(`${opts.seed ?? ''}|${city.id}|${city.arch}`));
  const P = GRID.pitch;
  const B = GRID.block;
  const Q = GRID.quad / 2;
  const districts = content.districts.all();
  const caps = plotCaps(content, city);
  const capOf = (ring) => districts.filter((d) => ringOf(d) === ring).reduce((sum, d) => sum + caps[d.id], 0);

  // --- size of the street grid ------------------------------------------------------
  const want = {
    core: Math.ceil(capOf('core') / 1.6) + 1,
    inner: Math.ceil(capOf('inner') / 1.25) + 1,
    outer: Math.ceil(capOf('outer') / 1.25) + 1,
    sector: Math.ceil(capOf('sector') / 2) + 1,
  };
  const need = want.core + want.inner + want.outer + want.sector;
  const hasCoast = !!city.port;
  const hasRiver = !hasCoast && rand() < 0.6;
  let n = 7;
  while (n < 15 && n * n - 4 - (hasRiver ? n : 0) < need + 2) n += 2;
  const c = (n - 1) / 2;
  const half = (n * P + GRID.road) / 2; // from the centre to the outer edge of the outermost street
  const size = half + 38;

  // --- river ---------------------------------------------------------------------------
  let river = null;
  if (hasRiver) {
    const offset = (rand() < 0.5 ? -1 : 1) * (n >= 9 && rand() < 0.5 ? 2 : 1);
    river = { axis: rand() < 0.5 ? 'x' : 'z', index: c + offset };
    river.at = (river.index - c) * P; // the coordinate of its centre line (x for a north–south river)
    river.width = B;
  }
  const inRiver = (i, j) => river && (river.axis === 'x' ? i === river.index : j === river.index);

  // --- blocks and their zones --------------------------------------------------------------
  const blocks = [];
  const grid = [];
  for (let i = 0; i < n; i++) {
    grid.push([]);
    for (let j = 0; j < n; j++) {
      const dx = i - c;
      const dz = j - c;
      const block = { i, j, x: dx * P, z: dz * P, zone: null, r: Math.hypot(dx, dz) * 0.55 + Math.max(Math.abs(dx), Math.abs(dz)) * 0.45 + (rand() - 0.5) * 0.5, lots: 0 };
      if (inRiver(i, j)) block.zone = 'river';
      else if (Math.abs(dx) === c && Math.abs(dz) === c) block.zone = 'edge';
      grid[i].push(block);
      blocks.push(block);
    }
  }
  const free = () => blocks.filter((b) => !b.zone);
  // Industry gathers on one side of town — towards the harbour where there is one.
  const theta = hasCoast ? -Math.PI / 2 + (rand() - 0.5) * 1.5 : rand() * Math.PI * 2;
  const tx = Math.cos(theta);
  const tz = Math.sin(theta);
  const pull = (b) => (b.i - c) * tx + (b.j - c) * tz - 0.4 * Math.abs(-(b.i - c) * tz + (b.j - c) * tx);
  for (const b of free().filter((b) => b.r > 1.3).sort((p, q) => pull(q) - pull(p)).slice(0, want.sector)) b.zone = 'sector';
  const byRadius = free().sort((p, q) => p.r - q.r);
  byRadius.splice(0, want.core).forEach((b) => (b.zone = 'core'));
  byRadius.splice(0, want.inner).forEach((b) => (b.zone = 'inner'));
  byRadius.splice(0, want.outer).forEach((b) => (b.zone = 'outer'));
  byRadius.forEach((b) => (b.zone = 'edge'));
  const built = (i, j) => {
    const b = grid[i]?.[j];
    return !!b && b.zone !== 'edge' && b.zone !== 'river';
  };
  const zoneAt = (i, j) => grid[i]?.[j]?.zone ?? 'edge';

  // --- streets -------------------------------------------------------------------------------
  // Line a (0…n) runs north–south at x = lineAt(a); line b runs east–west at z = lineAt(b).
  const lineAt = (a) => (a - c - 0.5) * P;
  const avenueX = c + (rand() < 0.5 ? 0 : 1);
  const avenueZ = c + (rand() < 0.5 ? 0 : 1);
  const roads = [];
  const degree = new Map();
  const key = (a, b) => `${a},${b}`;
  const touch = (a, b) => degree.set(key(a, b), (degree.get(key(a, b)) || 0) + 1);
  const kindOf = (zones, avenue) => {
    if (avenue) return 'avenue';
    if (zones.every((z) => z === 'outer' || z === 'edge' || z === 'river')) return 'lane';
    return 'street';
  };
  for (let a = 0; a <= n; a++) {
    for (let b = 0; b < n; b++) {
      // north–south piece of line a between rows b and b+1: blocks (a−1, b) and (a, b) lie on its sides
      if (!built(a - 1, b) && !built(a, b)) continue;
      const zones = [zoneAt(a - 1, b), zoneAt(a, b)];
      roads.push({ x1: lineAt(a), z1: lineAt(b), x2: lineAt(a), z2: lineAt(b + 1), kind: kindOf(zones, a === avenueX), a1: [a, b], a2: [a, b + 1] });
      touch(a, b);
      touch(a, b + 1);
    }
  }
  for (let b = 0; b <= n; b++) {
    for (let a = 0; a < n; a++) {
      const zones = [zoneAt(a, b - 1), zoneAt(a, b)];
      const overWater = zones[0] === 'river' && zones[1] === 'river'; // an east–west street meets a north–south river
      if (overWater) {
        // a bridge, where both banks are built up and not at every street
        const banks = (built(a - 1, b - 1) || built(a - 1, b)) && (built(a + 1, b - 1) || built(a + 1, b));
        if (!banks || (b !== avenueZ && b % 2 === 1)) continue;
        roads.push({ x1: lineAt(a), z1: lineAt(b), x2: lineAt(a + 1), z2: lineAt(b), kind: 'bridge', a1: [a, b], a2: [a + 1, b] });
      } else {
        if (!built(a, b - 1) && !built(a, b)) continue;
        roads.push({ x1: lineAt(a), z1: lineAt(b), x2: lineAt(a + 1), z2: lineAt(b), kind: kindOf(zones, b === avenueZ), a1: [a, b], a2: [a + 1, b] });
      }
      touch(a, b);
      touch(a + 1, b);
    }
  }
  if (river?.axis === 'z') {
    // an east–west river: the bridges carry the north–south streets
    const j = river.index;
    for (let a = 0; a <= n; a++) {
      const banks = (built(a - 1, j - 1) || built(a, j - 1)) && (built(a - 1, j + 1) || built(a, j + 1));
      if (!banks || (a !== avenueX && a % 2 === 1)) continue;
      roads.push({ x1: lineAt(a), z1: lineAt(j), x2: lineAt(a), z2: lineAt(j + 1), kind: 'bridge', a1: [a, j], a2: [a, j + 1] });
      touch(a, j);
      touch(a, j + 1);
    }
  }

  // --- highways towards the neighbouring cities -------------------------------------------------
  const sides = new Set();
  const others = (opts.cities ?? []).filter((o) => o.id !== city.id);
  others
    .map((o) => ({ dx: o.x - city.x, dy: o.y - city.y }))
    .sort((p, q) => Math.hypot(p.dx, p.dy) - Math.hypot(q.dx, q.dy))
    .slice(0, 3)
    .forEach(({ dx, dy }) => sides.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N'));
  if (hasCoast) sides.delete('N');
  if (sides.size < 2) for (const s of ['S', 'E', 'W']) if (sides.size < 2) sides.add(s);
  const exits = [];
  const avX = lineAt(avenueX);
  const avZ = lineAt(avenueZ);
  // A highway starts at the last crossing of the avenue on that side of town
  // (the town is not a square: the avenue may end well before the grid does).
  const lastOn = (side) => {
    const along = side === 'N' || side === 'S';
    const order = side === 'N' || side === 'W' ? [...Array(n + 1).keys()] : [...Array(n + 1).keys()].reverse();
    for (const m of order) {
      const at = along ? [avenueX, m] : [m, avenueZ];
      if (degree.has(key(...at))) return at;
    }
    return null;
  };
  for (const side of sides) {
    const at = lastOn(side);
    if (!at) continue;
    const x1 = lineAt(at[0]);
    const z1 = lineAt(at[1]);
    const end = side === 'N' ? [x1, -size] : side === 'S' ? [x1, size] : side === 'W' ? [-size, z1] : [size, z1];
    roads.push({ x1, z1, x2: end[0], z2: end[1], kind: 'highway', outside: true, a1: at, a2: null });
    touch(...at);
    exits.push({ side, x: x1, z: z1 });
  }

  const nodes = [...degree.entries()].map(([k, deg]) => {
    const [a, b] = k.split(',').map(Number);
    const around = [zoneAt(a - 1, b - 1), zoneAt(a, b - 1), zoneAt(a - 1, b), zoneAt(a, b)];
    const zone = ['core', 'inner', 'sector', 'outer'].find((z) => around.includes(z)) ?? 'edge';
    return { a, b, x: lineAt(a), z: lineAt(b), deg, zone };
  });

  // --- plots ---------------------------------------------------------------------------------------
  const lots = {};
  const taken = new Set(); // "i,j,qx,qz" of quarters given to plots or landmarks
  const qkey = (b, qx, qz) => `${b.i},${b.j},${qx},${qz}`;
  const quarter = (b, qx, qz, ry) => ({ x: b.x + (qx ? Q : -Q), z: b.z + (qz ? Q : -Q), w: GRID.quad, d: GRID.quad, ry });
  // Which street a corner plot looks at: south or east where possible, so that
  // most shop fronts show in the default view (the camera looks north-west).
  const facing = (qx, qz) => {
    if (qz) return rand() < 0.72 || !qx ? (rand() < 0.85 ? SOUTH : qx ? EAST : WEST) : EAST;
    if (qx) return rand() < 0.72 ? EAST : NORTH;
    return rand() < 0.5 ? NORTH : WEST;
  };
  const QUARTERS = [[1, 1], [0, 1], [1, 0], [0, 0]];
  const zoneBlocks = (zone) => blocks.filter((b) => b.zone === zone).sort((p, q) => p.r - q.r);
  const townCentre = zoneBlocks('core')[0] ?? null;

  for (const ring of ['core', 'inner', 'outer']) {
    const list = zoneBlocks(ring).filter((b) => b !== townCentre);
    const order = new Map(list.map((b) => [b, rand() < 0.5 ? QUARTERS : [QUARTERS[1], QUARTERS[0], QUARTERS[2], QUARTERS[3]]]));
    const candidates = [];
    for (let pass = 0; pass < 4; pass++) for (const b of list) candidates.push([b, order.get(b)[pass]]);
    const members = districts.filter((d) => ringOf(d) === ring);
    // Districts sharing a ring take turns, so each gets plots near the centre and further out.
    const queues = members.map((d) => ({ d, left: caps[d.id] }));
    for (const q of queues) lots[q.d.id] = [];
    let turn = 0;
    for (const [b, [qx, qz]] of candidates) {
      const open = queues.filter((q) => q.left > 0);
      if (!open.length) break;
      const q = open[turn++ % open.length];
      lots[q.d.id].push(quarter(b, qx, qz, facing(qx, qz)));
      taken.add(qkey(b, qx, qz));
      b.lots += 1;
      q.left -= 1;
    }
  }

  // Industrial plots: half a block each, 10 wide along the street and 5 deep.
  const sectorDistricts = districts.filter((d) => ringOf(d) === 'sector');
  const halves = [];
  for (const b of zoneBlocks('sector')) {
    b.split = rand() < 0.5 ? 'z' : 'x';
    b.halves = [false, false];
  }
  for (const first of [true, false]) {
    for (const b of zoneBlocks('sector')) {
      // the half that faces south or east goes first
      const h = first ? 1 : 0;
      halves.push({
        b,
        h,
        lot: b.split === 'z'
          ? { x: b.x, z: b.z + (h ? Q : -Q), w: B, d: GRID.quad, ry: h ? SOUTH : NORTH }
          : { x: b.x + (h ? Q : -Q), z: b.z, w: B, d: GRID.quad, ry: h ? EAST : WEST },
      });
    }
  }
  {
    const queues = sectorDistricts.map((d) => ({ d, left: caps[d.id] }));
    for (const q of queues) lots[q.d.id] = [];
    let turn = 0;
    for (const half2 of halves) {
      const open = queues.filter((q) => q.left > 0);
      if (!open.length) break;
      const q = open[turn++ % open.length];
      lots[q.d.id].push(half2.lot);
      half2.b.halves[half2.h] = true;
      half2.b.lots += 1;
      q.left -= 1;
    }
  }

  // Country plots: big ones in a ring round the town. A lane runs round the
  // town just outside the street grid; every plot has a short track to it,
  // and the outer streets and the highways tie it to the town.
  const countryDistricts = districts.filter((d) => ringOf(d) === 'country');
  const country = [];
  const ringAt = half + 1.6; // the lane's centre line, as a distance from the centre
  const ringSides = ['S', 'E', 'W', ...(hasCoast ? [] : ['N'])];
  const cuts = { N: [], S: [], E: [], W: [] }; // where something joins the lane, as a position along that side
  const outside = (road) => roads.push({ ...road, outside: true, a1: null, a2: null });
  const crossesRiver = (side, at) => river && (river.axis === 'x') === (side === 'N' || side === 'S') && Math.abs(at - river.at) < river.width / 2 + 0.5;
  {
    const step = 14;
    const lot = 12;
    const slots = { S: [], E: [], W: [], N: [] };
    for (const ringNo of [0, 1]) {
      const dist = half + 3.6 + lot / 2 + ringNo * (lot + 2.5);
      const count = Math.floor((2 * half + (ringNo ? 20 : 0)) / step);
      for (const side of ringSides) {
        const exitAt = exits.find((e) => e.side === side);
        for (let m = 0; m < count; m++) {
          // from the middle of the side outwards, left and right in turn
          const off = (m % 2 ? 1 : -1) * (Math.floor(m / 2) + 0.5) * step + (ringNo ? step / 2 : 0);
          const alongExit = exitAt && Math.abs(off - (side === 'N' || side === 'S' ? exitAt.x : exitAt.z)) < lot / 2 + 2.4;
          const overRiver = river && (river.axis === 'x') === (side === 'N' || side === 'S') && Math.abs(off - river.at) < lot / 2 + river.width / 2 + 1.5;
          if (alongExit || overRiver) continue;
          const place =
            side === 'S' ? { x: off, z: dist, ry: NORTH }
            : side === 'N' ? { x: off, z: -dist, ry: SOUTH }
            : side === 'E' ? { x: dist, z: off, ry: WEST }
            : { x: -dist, z: off, ry: EAST };
          slots[side].push({ ...place, w: lot, d: lot, side, ringNo, off });
        }
      }
    }
    // Deal the sides out in turn so farms spread all round the town; the inner ring first.
    const order = [];
    for (const ringNo of [0, 1]) {
      const queues = ringSides.map((side) => slots[side].filter((slot) => slot.ringNo === ringNo));
      for (let m = 0; queues.some((q) => q.length > m); m++) for (const q of queues) if (q[m]) order.push(q[m]);
    }
    const queues = countryDistricts.map((d) => ({ d, left: caps[d.id] }));
    for (const q of queues) lots[q.d.id] = [];
    let turn = 0;
    for (const place of order) {
      const open = queues.filter((q) => q.left > 0);
      if (!open.length) break;
      const q = open[turn++ % open.length];
      lots[q.d.id].push({ x: place.x, z: place.z, w: place.w, d: place.d, ry: place.ry });
      country.push(place);
      q.left -= 1;
      // the track from the plot's gate to the lane
      const gate = Math.abs(place.side === 'S' || place.side === 'N' ? place.z : place.x) - lot / 2;
      const sign = place.side === 'S' || place.side === 'E' ? 1 : -1;
      if (place.side === 'S' || place.side === 'N') outside({ x1: place.x, z1: sign * gate, x2: place.x, z2: sign * ringAt, kind: 'track' });
      else outside({ x1: sign * gate, z1: place.z, x2: sign * ringAt, z2: place.z, kind: 'track' });
      cuts[place.side].push(place.off);
    }
  }
  // Streets that end at the edge of the grid run on to the lane.
  for (const node of nodes) {
    const sidesHere = [node.b === 0 && 'N', node.b === n && 'S', node.a === 0 && 'W', node.a === n && 'E'].filter(Boolean);
    for (const side of sidesHere) {
      if (!ringSides.includes(side)) continue;
      const at = side === 'N' || side === 'S' ? node.x : node.z;
      if (crossesRiver(side, at) || exits.some((e) => e.side === side && Math.abs((side === 'N' || side === 'S' ? e.x : e.z) - at) < 0.1)) continue;
      const sign = side === 'S' || side === 'E' ? 1 : -1;
      const from = [node.a, node.b]; // it leaves a crossing of the grid
      if (side === 'N' || side === 'S') roads.push({ x1: node.x, z1: node.z, x2: node.x, z2: sign * ringAt, kind: 'lane', outside: true, a1: from, a2: null });
      else roads.push({ x1: node.x, z1: node.z, x2: sign * ringAt, z2: node.z, kind: 'lane', outside: true, a1: from, a2: null });
      cuts[side].push(at);
    }
  }
  for (const e of exits) if (ringSides.includes(e.side)) cuts[e.side].push(e.side === 'N' || e.side === 'S' ? e.x : e.z);
  // The lane itself, in pieces between the places where something joins it (and broken by the river).
  for (const side of ringSides) {
    const ends = [ringSides.includes(side === 'N' || side === 'S' ? 'W' : 'N') ? -ringAt : -ringAt + 3, ringSides.includes(side === 'N' || side === 'S' ? 'E' : 'S') ? ringAt : ringAt - 3];
    const stops = [...new Set([...ends, ...cuts[side].filter((v) => v > ends[0] && v < ends[1])].map((v) => Math.round(v * 100) / 100))].sort((p, q) => p - q);
    const sign = side === 'S' || side === 'E' ? 1 : -1;
    for (let m = 0; m + 1 < stops.length; m++) {
      const from = stops[m];
      const to = stops[m + 1];
      if (river && (river.axis === 'x') === (side === 'N' || side === 'S') && from < river.at + river.width / 2 + 0.5 && to > river.at - river.width / 2 - 0.5) continue;
      if (side === 'N' || side === 'S') outside({ x1: from, z1: sign * ringAt, x2: to, z2: sign * ringAt, kind: 'lane' });
      else outside({ x1: sign * ringAt, z1: from, x2: sign * ringAt, z2: to, kind: 'lane' });
    }
  }

  // --- the town in between -----------------------------------------------------------------------------
  const parcels = [];
  const rMax = Math.max(...blocks.filter((b) => built(b.i, b.j)).map((b) => b.r), 1);
  const early = (b) => Math.max(0, Math.min(1, (b.r / rMax) * 0.82 + rand() * 0.18));
  const frontOf = (qx, qz) => (qz ? SOUTH : qx ? EAST : rand() < 0.5 ? NORTH : WEST);
  const wide = (b, qz, kind, t) => parcels.push({ x: b.x, z: b.z + (qz ? Q : -Q), w: B, d: GRID.quad, ry: qz ? SOUTH : NORTH, kind, t, zone: b.zone });
  const tall = (b, qx, kind, t) => parcels.push({ x: b.x + (qx ? Q : -Q), z: b.z, w: B, d: GRID.quad, ry: qx ? EAST : WEST, kind, t, zone: b.zone });
  const landmark = (ring, kind, shape) => {
    const b = zoneBlocks(ring).find((x) => x !== townCentre && !x.special && x.lots <= 2 && (shape !== 'wide' || (!taken.has(qkey(x, 0, 1)) && !taken.has(qkey(x, 1, 1)))) && !taken.has(qkey(x, 1, 1)));
    if (!b) return;
    b.special = true;
    if (shape === 'wide') {
      wide(b, 1, kind, 0);
      taken.add(qkey(b, 0, 1));
      taken.add(qkey(b, 1, 1));
    } else {
      parcels.push({ ...quarter(b, 1, 1, SOUTH), kind, t: 0, zone: b.zone });
      taken.add(qkey(b, 1, 1));
    }
  };
  if (townCentre) {
    // the heart of the town: the town hall looking south over its square
    wide(townCentre, 0, 'townhall', 0);
    wide(townCentre, 1, 'plaza', 0);
    for (const [qx, qz] of QUARTERS) taken.add(qkey(townCentre, qx, qz));
  }
  landmark('core', 'church', 'quarter');
  landmark('inner', 'hospital', 'wide');
  landmark('inner', 'school', 'quarter');
  if (n >= 9) landmark('inner', 'school', 'quarter');
  if (n >= 9) landmark('outer', 'stadium', 'wide');
  landmark('outer', 'church', 'quarter');

  for (const b of blocks) {
    if (b.zone === 'edge') {
      // unbuilt corners of the grid: open country
      parcels.push({ x: b.x, z: b.z, w: B, d: B, ry: SOUTH, kind: weighted(rand, SCENERY[city.arch] ?? SCENERY.default), t: 0, zone: 'edge' });
      continue;
    }
    if (b.zone === 'river' || b === townCentre) continue;
    if (b.zone === 'sector') {
      for (const h of [0, 1]) {
        if (b.halves[h]) continue;
        const kind = weighted(rand, FILL.sector);
        const t = early(b) * 0.6; // an industrial zone is built up early
        if (b.split === 'z') wide(b, h, kind, t);
        else tall(b, h, kind, t);
      }
      continue;
    }
    const open = (qx, qz) => !taken.has(qkey(b, qx, qz));
    // a whole free block now and then becomes a park
    if (QUARTERS.every(([qx, qz]) => open(qx, qz)) && rand() < (b.zone === 'core' ? 0.1 : 0.16)) {
      parcels.push({ x: b.x, z: b.z, w: B, d: B, ry: SOUTH, kind: 'park', t: early(b) * 0.6, zone: b.zone });
      continue;
    }
    // two free quarters side by side sometimes join into one wide parcel
    for (const qz of [1, 0]) {
      if (open(0, qz) && open(1, qz) && rand() < 0.3) {
        wide(b, qz, weighted(rand, WIDE[b.zone]), early(b));
        taken.add(qkey(b, 0, qz));
        taken.add(qkey(b, 1, qz));
      }
    }
    for (const [qx, qz] of QUARTERS) {
      if (!open(qx, qz)) continue;
      parcels.push({ ...quarter(b, qx, qz, frontOf(qx, qz)), kind: weighted(rand, FILL[b.zone]), t: early(b), zone: b.zone });
    }
  }

  // --- open country round the town ---------------------------------------------------------------------------
  const scenery = [];
  const coast = hasCoast ? { z: -(half + 6.5) } : null;
  const cell = 12;
  const clear = (x, z) => {
    if (Math.abs(x) < half + 1 && Math.abs(z) < half + 1) return false;
    if (coast && z < coast.z + cell / 2 + 1) return false;
    if (river && Math.abs((river.axis === 'x' ? x : z) - river.at) < river.width / 2 + cell / 2 + 1) return false;
    if (country.some((p) => Math.abs(p.x - x) < 12.5 && Math.abs(p.z - z) < 12.5)) return false;
    for (const r of roads) {
      if (!r.outside) continue;
      const minX = Math.min(r.x1, r.x2) - cell / 2 - 1;
      const maxX = Math.max(r.x1, r.x2) + cell / 2 + 1;
      const minZ = Math.min(r.z1, r.z2) - cell / 2 - 1;
      const maxZ = Math.max(r.z1, r.z2) + cell / 2 + 1;
      if (x > minX && x < maxX && z > minZ && z < maxZ) return false;
    }
    return true;
  };
  const table = SCENERY[city.arch] ?? SCENERY.default;
  for (let x = -size + cell / 2; x < size; x += cell) {
    for (let z = -size + cell / 2; z < size; z += cell) {
      if (!clear(x, z) || rand() < 0.22) continue;
      scenery.push({ x, z, w: cell - 0.6, d: cell - 0.6, ry: [SOUTH, EAST, NORTH, WEST][Math.floor(rand() * 4)], kind: weighted(rand, table) });
    }
  }

  // --- the harbour -----------------------------------------------------------------------------------------------
  let port = null;
  if (coast) {
    const sector = zoneBlocks('sector');
    const cx = sector.length ? sector.reduce((s, b) => s + b.x, 0) / sector.length : 0;
    const w = Math.min(2 * half - 8, 40);
    port = { x: Math.max(-half + w / 2 + 2, Math.min(half - w / 2 - 2, cx)), z: coast.z - 1.9, w, d: 5 };
    // the harbour roads: from the northernmost streets down to the quay
    const quayside = nodes.filter((node) => node.b === 0 && Math.abs(node.x - port.x) < w / 2 - 1).sort((p, q) => Math.abs(p.x - port.x) - Math.abs(q.x - port.x));
    for (const node of quayside.slice(0, 2)) roads.push({ x1: node.x, z1: node.z, x2: node.x, z2: coast.z + 0.4, kind: 'lane', outside: true, a1: [node.a, node.b], a2: null });
  }

  // --- street furniture --------------------------------------------------------------------------------------------
  const lamps = [];
  for (const node of nodes) {
    if (node.deg < 2 || (node.zone === 'outer' && (node.a + node.b) % 2)) continue;
    lamps.push({ x: node.x + 0.78, z: node.z + 0.78, ry: -Math.PI * 0.75 });
  }
  const trees = [];
  for (const r of roads) {
    if (r.kind !== 'avenue') continue;
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const ux = (r.x2 - r.x1) / len;
    const uz = (r.z2 - r.z1) / len;
    for (let s = 2.4; s < len - 2; s += 2.6) {
      for (const sideSign of [-1, 1]) trees.push({ x: r.x1 + ux * s - uz * sideSign * 0.78, z: r.z1 + uz * s + ux * sideSign * 0.78, s: 0.62 + rand() * 0.16, k: 0 });
    }
  }

  return {
    id: city.id,
    arch: city.arch,
    n,
    half,
    size,
    rings: Object.fromEntries(districts.map((d) => [d.id, ringOf(d)])),
    coast,
    river,
    port,
    exits,
    blocks: blocks.map(({ i, j, x, z, zone, r }) => ({ i, j, x, z, zone, r })),
    roads,
    nodes,
    lots,
    caps,
    parcels,
    scenery,
    lamps,
    trees,
  };
}
