// Headless AI-vs-AI simulation — the balancing bench.
//
//   npm run sim -- --years 10 --seed demo --levels novice,manager,shark,tycoon
//   npm run sim -- --runs 8 --years 12            # league table over 8 seeds
//
// Options:
//   --years N      simulated years (default 10)
//   --seed S       world seed (default "sim"; with --runs the run number is appended)
//   --levels a,b   difficulty of each AI company (default: one of every level)
//   --personas a,b personality of each company (default: random)
//   --cities N     number of cities (default 4)
//   --runs N       repeat with different seeds and print averages
//   --no-takeovers disable hostile takeovers
//   --quiet        only the final table
//   --log          print every AI command (very verbose)
//   --pnl          also print each company's income statement of the last 12 months

import { createContent, Game } from '../src/setup.js';
import { assetsOf } from '../src/sim/accounting.js';
import { buildingCounts, retailShare } from '../src/sim/stats.js';
import { DAYS_PER_YEAR } from '../src/engine/calendar.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const years = Number(args.years ?? 10);
const runs = Number(args.runs ?? 1);
const content = createContent();
const levels = String(args.levels ?? content.difficulties.ids().join(',')).split(',');
const personas = args.personas ? String(args.personas).split(',') : [];

const money = (x) => {
  const a = Math.abs(x);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0);
  return (x < 0 ? '-' : '') + s;
};
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function snapshot(game) {
  return game.state.companyOrder.map((id) => {
    const co = game.state.companies[id];
    const a = co.alive ? assetsOf(game, co) : { total: 0 };
    const last12 = co.reports.slice(-12);
    const counts = buildingCounts(game, id);
    return {
      co,
      equity: co.alive ? a.total - co.loan : 0,
      revenue: last12.reduce((s, r) => s + r.retail + r.b2b, 0),
      profit: last12.reduce((s, r) => s + r.profit, 0),
      counts,
      share: co.alive ? retailShare(game, id) : 0,
    };
  });
}

function printTable(game, title) {
  console.log(`\n${title}`);
  console.log(
    pad('company', 18), pad('level', 9), pad('persona', 14), lpad('equity', 9), lpad('cash', 9), lpad('loan', 8),
    lpad('rev/yr', 9), lpad('profit/yr', 10), lpad('stores', 7), lpad('plants', 7), lpad('labs', 5), lpad('share', 7), lpad('price', 8),
  );
  for (const s of snapshot(game)) {
    const { co } = s;
    if (!co.alive) {
      console.log(pad(co.name, 18), pad(co.ai?.level ?? 'human', 9), pad(co.ai?.persona ?? '', 14), co.bankrupt ? '  — bankrupt' : `  — taken over by ${game.state.companies[co.acquiredBy]?.name}`);
      continue;
    }
    console.log(
      pad(co.name, 18), pad(co.ai?.level ?? 'human', 9), pad(co.ai?.persona ?? '', 14), lpad(money(s.equity), 9), lpad(money(co.cash), 9),
      lpad(money(co.loan), 8), lpad(money(s.revenue), 9), lpad(money(s.profit), 10), lpad(s.counts.retail, 7), lpad(s.counts.producer, 7),
      lpad(s.counts.research, 5), lpad(`${(s.share * 100).toFixed(1)}%`, 7), lpad(co.price.toFixed(2), 8),
    );
  }
}

function printPnl(game) {
  const keys = ['retail', 'b2b', 'cogs', 'opex', 'ads', 'rnd', 'depr', 'interest', 'other', 'tax', 'profit'];
  console.log('  ' + pad('last 12 months', 18) + keys.map((k) => lpad(k, 9)).join(''));
  for (const co of game.companies()) {
    const sum = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const r of co.reports.slice(-12)) for (const k of keys) sum[k] += r[k] || 0;
    console.log('  ' + pad(co.name, 18) + keys.map((k) => lpad(money(sum[k]), 9)).join(''));
  }
}

function runOnce(seed, verbose) {
  const game = Game.create(content, {
    seed,
    cityCount: Number(args.cities ?? 4),
    player: null,
    rivals: levels.map((level, i) => ({ level, persona: personas[i] ?? 'random' })),
    takeovers: !args['no-takeovers'],
  });
  if (args.log) game.aiLog = [];
  const t0 = Date.now();
  for (let y = 1; y <= years; y++) {
    game.run(DAYS_PER_YEAR);
    if (verbose) printTable(game, `── ${seed} · after year ${y} · economy ${game.state.economy.index.toFixed(2)} (${game.state.economy.phase})`);
    if (verbose && args.pnl) printPnl(game);
    if (args.log) {
      for (const e of game.aiLog) console.log(`  d${e.day} ${e.co}: ${e.type} ${JSON.stringify(e.params)}${e.ok ? '' : ` ✗ ${e.error}`}`);
      game.aiLog.length = 0;
    }
  }
  if (!verbose) printTable(game, `── ${seed} · after ${years} years`);
  console.log(`   (${Date.now() - t0} ms, ${Object.keys(game.state.buildings).length} buildings)`);
  return game;
}

if (runs === 1) {
  runOnce(String(args.seed ?? 'sim'), !args.quiet);
} else {
  const totals = new Map(); // level → { equity, rank, dead, n }
  for (let r = 1; r <= runs; r++) {
    const game = runOnce(`${args.seed ?? 'sim'}-${r}`, false);
    const snaps = snapshot(game).sort((a, b) => b.equity - a.equity);
    snaps.forEach((s, rank) => {
      const level = s.co.ai.level;
      const t = totals.get(level) ?? { equity: 0, rank: 0, dead: 0, n: 0 };
      t.equity += s.equity;
      t.rank += rank + 1;
      t.dead += s.co.alive ? 0 : 1;
      t.n += 1;
      totals.set(level, t);
    });
  }
  console.log(`\n══ averages over ${runs} runs of ${years} years`);
  console.log(pad('level', 10), lpad('avg equity', 12), lpad('avg rank', 9), lpad('eliminated', 11));
  for (const [level, t] of totals) {
    console.log(pad(level, 10), lpad(money(t.equity / t.n), 12), lpad((t.rank / t.n).toFixed(2), 9), lpad(`${t.dead}/${t.n}`, 11));
  }
}
