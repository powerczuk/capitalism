// Sourcing: decide where every shelf and every production input gets its
// goods from.
//
// The company's own lines are the cheapest supplier but can only make so
// much. So this module works like a planner: it lists every consumer (shelf
// or input), what switching it to each own line would be worth per day, and
// hands out line capacity to the consumers that gain most. Whoever does not
// fit buys from the best outside source (imports or another company).

import { lineSrc, linePace } from '../../sim/supply.js';
import { shelfOption, storeShelf } from '../analysis.js';

const KEEP_BONUS = 1.15; // prefer leaving a consumer on the line it already uses

export const sourcingModule = {
  id: 'sourcing',
  order: 30,
  run(ctx) {
    const { game, co, profile } = ctx;
    const { content } = game;
    // A better input is worth a little more to players who understand quality.
    const value = (s) => (profile.qualityAware ? s.unitCost * (1 - 0.004 * (s.quality - 50)) : s.unitCost);

    // What each own line can deliver per day.
    const capacity = new Map();
    for (const b of game.buildingsOf(co.id)) {
      if (b.kind !== 'producer' || !game.isReady(b)) continue;
      b.lines.forEach((line, i) => {
        if (line) capacity.set(lineSrc(b.id, i), linePace(line, content.recipes.get(line.recipe)));
      });
    }

    // Jobs: one per consumer. `options` = own lines worth switching to;
    // `outside` = best non-own source (kept as it is when good enough).
    const jobs = [];

    for (const b of game.buildingsOf(co.id)) {
      if (b.kind === 'retail') {
        b.slots.forEach((slot, i) => {
          if (!slot) return;
          const product = content.products.get(slot.product);
          const store = storeShelf(game, b, product);
          const key = `${b.id}:${i}`;
          const flow = slot.s ?? 0;
          const outside = shelfOption(ctx, store, slot.product, {
            ignoreKey: key,
            currentSrc: slot.src,
            currentFlow: flow,
            only: (s) => !s.own,
          });
          const own = capacity.size
            ? shelfOption(ctx, store, slot.product, { ignoreKey: key, only: (s) => s.own && capacity.has(s.src), unlimited: true })
            : null;
          const outsideProfit = outside?.profitDay ?? 0;
          // Stay with the present outside supplier unless the best one is clearly better.
          let outsideSrc = outside?.src ?? null;
          const presentProfit = outside?.tried.get(slot.src);
          if (outside && presentProfit !== undefined && outside.src !== slot.src && outside.profitDay <= presentProfit * 1.05 + 1) {
            outsideSrc = slot.src;
          }
          const options = [];
          if (own) {
            for (const [src, profit] of own.tried) {
              if (!outside || profit > outsideProfit) options.push({ src, benefit: outside ? profit - outsideProfit : profit + 1 });
            }
          }
          jobs.push({
            current: slot.src,
            need: own ? own.units : 0,
            options,
            outsideSrc,
            outsideSource: outside?.source ?? null,
            apply: (src) => ctx.act('setSlotSource', { building: b.id, slot: i, src }).ok,
          });
        });
      } else if (b.kind === 'producer') {
        b.lines.forEach((line, i) => {
          if (!line) return;
          const recipe = content.recipes.get(line.recipe);
          // A line whose output piles up does not need inputs for its full rate.
          const pace = line.idle === 'full' ? Math.max(line.made ?? 0, recipe.rate * 0.2) : recipe.rate;
          for (const id in recipe.inputs) {
            const inp = line.inputs[id];
            const need = pace * recipe.inputs[id];
            let outside = null;
            let present = null;
            const owned = [];
            for (const s of ctx.sources(b.city, id)) {
              if (s.own) {
                if (capacity.has(s.src)) owned.push(s);
                continue;
              }
              if (s.src === inp.src) present = s;
              if (ctx.lineFree(s) + (s.src === inp.src ? need : 0) < need * 0.5) continue;
              if (!outside || value(s) < value(outside)) outside = s;
            }
            if (outside && present && present !== outside && value(outside) > value(present) * 0.97) outside = present;
            const options = [];
            for (const s of owned) {
              const benefit = outside ? need * (value(outside) - value(s)) : need * value(s) + 1;
              if (benefit > 0) options.push({ src: s.src, benefit });
            }
            jobs.push({
              current: inp.src,
              need,
              options,
              outsideSrc: outside?.src ?? null,
              outsideSource: outside,
              apply: (src) => ctx.act('setLineSource', { building: b.id, line: i, input: id, src }).ok,
            });
          }
        });
      }
    }

    // Hand out own capacity to the consumers that gain most from it.
    const bids = [];
    for (const job of jobs) {
      for (const option of job.options) {
        bids.push({ job, src: option.src, score: option.benefit * (job.current === option.src ? KEEP_BONUS : 1) });
      }
    }
    bids.sort((a, b) => b.score - a.score);
    for (const bid of bids) {
      if (bid.job.assigned) continue;
      const left = capacity.get(bid.src) ?? 0;
      if (left >= bid.job.need * 0.75) {
        bid.job.assigned = bid.src;
        capacity.set(bid.src, left - bid.job.need);
      }
    }

    for (const job of jobs) {
      const target = job.assigned ?? job.outsideSrc;
      if (!target) continue;
      if (!job.assigned && job.outsideSource) ctx.reserveLine(job.outsideSource, job.need);
      if (target !== job.current) job.apply(target);
    }
  },
};
