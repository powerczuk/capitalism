// A flat drawing of a city plan (see cityPlan.js) as an SVG string: streets,
// water, the town's parcels and the numbered building plots. It is the 2D
// stand-in for the 3D city view where WebGL is not available, and a handy way
// to look at what the plan generator did.
//
//   planSvg(plan, { plots: [{ district, lot, color, own, label }], free: { center: 4, … } })
//
// `plots` are the buildings standing on plots (drawn in the owner's colour),
// `free` says how many plots of each district exist right now — plots beyond
// that number are not shown, free ones below it are drawn as empty plots that
// can be clicked (data-act="openLot" data-district data-lot).
//
// Colours come from CSS custom properties with fallbacks, so the drawing
// follows the page's light or dark theme.

const esc = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const f = (n) => (Math.round(n * 100) / 100).toString();

const ROAD = {
  highway: { w: 2.6, c: 'var(--plan-road, #8d8778)' },
  avenue: { w: 2.2, c: 'var(--plan-road, #8d8778)' },
  street: { w: 1.8, c: 'var(--plan-road, #8d8778)' },
  bridge: { w: 1.8, c: 'var(--plan-bridge, #a39b88)' },
  lane: { w: 1.3, c: 'var(--plan-lane, #a8a292)' },
  track: { w: 0.8, c: 'var(--plan-track, #b9a98a)' },
};

const PARCEL = {
  park: '#9cc27e', meadow: '#b9d093', woods: '#7fae72', field: '#d9cc85', hill: '#b4b2a6', plaza: '#d6d2c4', parking: '#a9adb0',
  house: '#d8b99c', rowhouses: '#d1a98c', apartments: '#c9b6a2', shops: '#d6a77c', offices: '#b6c2cc', tower: '#9fb0c0',
  warehouse: '#b3b0a6', workshop: '#aaa397', townhall: '#c79a6b', church: '#c7a58c', school: '#d4b47a', hospital: '#e0d5d0', stadium: '#a7c79a',
};

/** Rectangle of a plot or parcel as SVG attributes (turned ones swap width and depth). */
function rect(r) {
  const turned = Math.abs(Math.sin(r.ry ?? 0)) > 0.5;
  const w = turned ? r.d : r.w;
  const d = turned ? r.w : r.d;
  return `x="${f(r.x - w / 2)}" y="${f(r.z - d / 2)}" width="${f(w)}" height="${f(d)}"`;
}

/**
 * @param {object} plan from cityPlan()
 * @param {{plots?: object[], free?: object, built?: number, title?: string, interactive?: boolean, lotLabel?: (district: string, lot: number) => string}} [opts]
 */
export function planSvg(plan, opts = {}) {
  const S = plan.size;
  const built = opts.built ?? 1;
  let out = `<svg class="plan" viewBox="${-S} ${-S} ${2 * S} ${2 * S}" role="img" aria-label="${esc(opts.title ?? '')}">`;
  out += `<rect x="${-S}" y="${-S}" width="${2 * S}" height="${2 * S}" fill="var(--plan-land, #cfdcb4)"/>`;

  if (plan.coast) out += `<rect x="${-S}" y="${-S}" width="${2 * S}" height="${f(S + plan.coast.z)}" fill="var(--plan-water, #9fc4d8)"/>`;
  if (plan.river) {
    const w = plan.river.width;
    out += plan.river.axis === 'x'
      ? `<rect x="${f(plan.river.at - w / 2)}" y="${-S}" width="${w}" height="${2 * S}" fill="var(--plan-water, #9fc4d8)"/>`
      : `<rect x="${-S}" y="${f(plan.river.at - w / 2)}" width="${2 * S}" height="${w}" fill="var(--plan-water, #9fc4d8)"/>`;
  }
  if (plan.port) out += `<rect ${rect(plan.port)} fill="var(--plan-quay, #b9b6aa)"/>`;

  for (const p of plan.scenery) out += `<rect ${rect(p)} rx="1.5" fill="${PARCEL[p.kind] ?? '#c4d3a8'}" opacity="0.55"/>`;
  for (const kind of ['track', 'lane', 'street', 'avenue', 'highway', 'bridge']) {
    const style = ROAD[kind];
    let d = '';
    for (const r of plan.roads) if (r.kind === kind) d += `M${f(r.x1)} ${f(r.z1)}L${f(r.x2)} ${f(r.z2)}`;
    if (d) out += `<path d="${d}" stroke="${style.c}" stroke-width="${style.w}" stroke-linecap="square" fill="none"/>`;
  }
  for (const p of plan.parcels) {
    const kind = p.t <= built ? p.kind : 'meadow';
    out += `<rect ${rect(p)} fill="${PARCEL[kind] ?? '#c9c2b4'}" opacity="${p.zone === 'edge' ? 0.55 : 0.9}"/>`;
  }

  const standing = new Map((opts.plots ?? []).map((p) => [`${p.district}:${p.lot}`, p]));
  for (const district of Object.keys(plan.lots)) {
    const open = opts.free?.[district] ?? plan.lots[district].length;
    plan.lots[district].forEach((lot, k) => {
      const here = standing.get(`${district}:${k}`);
      if (here) {
        out += `<rect ${rect(lot)} rx="0.6" fill="${here.color}" stroke="var(--plan-ink, #1f2a26)" stroke-width="${here.own ? 0.5 : 0.25}"${
          opts.interactive && here.id ? ` data-act="openLotBuilding" data-id="${esc(here.id)}" tabindex="0" role="button" class="plan-building"` : ''
        }><title>${esc(here.label ?? '')}</title></rect>`;
      } else if (k < open) {
        out += `<rect ${rect(lot)} rx="0.6" fill="var(--plan-lot, #f3efdf)" fill-opacity="0.75" stroke="var(--plan-ink, #1f2a26)" stroke-width="0.22" stroke-dasharray="0.9 0.6"${
          opts.interactive ? ` data-act="openLot" data-district="${esc(district)}" data-lot="${k}" tabindex="0" role="button" class="plan-lot"` : ''
        }>${opts.lotLabel ? `<title>${esc(opts.lotLabel(district, k))}</title>` : ''}</rect>`;
      } else {
        out += `<rect ${rect(lot)} fill="${PARCEL.meadow}" opacity="0.9"/>`;
      }
    });
  }
  return `${out}</svg>`;
}
