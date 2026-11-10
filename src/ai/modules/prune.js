// Pruning: drop products that do not sell, close stores that keep losing
// money and free production lines nobody buys from.

const BAN_DAYS = 720;

export const pruneModule = {
  id: 'prune',
  order: 20,
  run(ctx) {
    const { game, co, mem, profile } = ctx;
    const { content, state } = game;
    const day = state.day;
    mem.red ||= {}; // key → consecutive reviews with bad results
    mem.banned ||= {}; // "building:product" → day until which not to retry
    const seen = new Set();
    const strike = (key, bad) => {
      seen.add(key);
      if (bad) mem.red[key] = (mem.red[key] || 0) + 1;
      else delete mem.red[key];
      return mem.red[key] || 0;
    };

    for (const b of [...game.buildingsOf(co.id)]) {
      if (!game.isReady(b) || day - b.ready < 90) continue;

      if (b.kind === 'retail') {
        // A store that lost money in each of the last twelve months is closed.
        const recent = b.hist.slice(-12);
        const hopeless = recent.length === 12 && recent.every((p) => p < 0);
        if (hopeless && strike(`${b.id}`, true) >= (profile.rank >= 2 ? 1 : 2)) {
          ctx.act('demolish', { building: b.id });
          continue;
        }
        for (let i = 0; i < b.slots.length; i++) {
          const slot = b.slots[i];
          if (!slot || !slot.last) continue;
          const key = `${b.id}:${i}:${slot.product}`;
          const bad = slot.last.profit <= 0 || slot.last.rev < 3000;
          if (strike(key, bad) >= 2) {
            ctx.act('clearSlot', { building: b.id, slot: i });
            mem.banned[`${b.id}:${slot.product}`] = day + BAN_DAYS;
            delete mem.red[key];
          }
        }
      } else if (b.kind === 'producer') {
        let used = 0;
        for (let i = 0; i < b.lines.length; i++) {
          const line = b.lines[i];
          if (!line) continue;
          used += 1;
          const recipe = content.recipes.get(line.recipe);
          const dead = line.idle === 'full' && (line.out ?? 0) < recipe.rate * 0.02;
          const strikes = strike(`${b.id}:${i}:${line.recipe}`, dead);
          if (strikes === 2 && profile.b2b && !line.sell) {
            ctx.act('setLineSale', { building: b.id, line: i, sell: true }); // try the open market first
          } else if (strikes >= 4) {
            ctx.act('clearLine', { building: b.id, line: i });
            used -= 1;
          }
        }
        if (used === 0 && strike(`${b.id}`, true) >= 3) ctx.act('demolish', { building: b.id });
        else if (used > 0) strike(`${b.id}`, false);
      }
    }

    for (const key in mem.red) if (!seen.has(key)) delete mem.red[key];
    for (const key in mem.banned) if (mem.banned[key] <= day) delete mem.banned[key];
  },
};
