// Finance: keep a cash cushion, repay idle debt, set the dividend.

import { creditLimit } from '../../sim/accounting.js';

const round10k = (x) => Math.floor(x / 10_000) * 10_000;

export const financeModule = {
  id: 'finance',
  order: 10,
  eager: true,
  run(ctx) {
    const { game, co, profile } = ctx;
    const reserve = ctx.reserve();

    if (co.cash < reserve * 0.4) {
      // In an emergency every level goes to the bank, cautious or not.
      const room = co.cash < 0 ? Math.max(0, creditLimit(game, co) - co.loan) : ctx.borrowRoom();
      const amount = round10k(Math.min(reserve - co.cash, room));
      if (amount >= 50_000) ctx.act('borrow', { amount });
    } else if (co.loan > 0 && co.cash > reserve * 2) {
      const amount = round10k(Math.min(co.loan, co.cash - reserve * 1.5));
      if (amount >= 10_000) ctx.act('repay', { amount: amount >= co.loan - 10_000 ? co.loan : amount });
    }

    if (profile.rank >= 3) {
      const ratio = co.cash > reserve * 6 && co.loan === 0 ? 0.15 : 0;
      if (ratio !== co.div) ctx.act('setDividend', { ratio });
    }
  },
};
