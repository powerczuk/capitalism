// Personalities of computer players — *what* they like to do, independent of
// how well they do it (that is the difficulty level).
//
//   w.retail / industry / raw / rnd / ads / finance   appetite multipliers (1 = neutral)
//   w.price     pricing stance: < 1 undercuts, > 1 charges a premium
//   w.risk      willingness to borrow and run on thin reserves
//   cats        favourite product categories (profit estimates are multiplied)
//
// Register more with `content.personalities.register({...})`.

export const PERSONALITIES = [
  {
    id: 'merchant',
    icon: '🧺',
    name: { pl: 'Kupiec', en: 'Merchant' },
    desc: { pl: 'Stawia na gęstą sieć sklepów i szeroki asortyment.', en: 'Bets on a dense store network and a wide range.' },
    w: { retail: 1.3, industry: 0.85, raw: 0.7, rnd: 0.7, ads: 1, finance: 0.8, price: 1, risk: 1 },
    cats: { food: 1.15, household: 1.1 },
  },
  {
    id: 'industrialist',
    icon: '⚙️',
    name: { pl: 'Przemysłowiec', en: 'Industrialist' },
    desc: { pl: 'Woli fabryki i kopalnie; chętnie zaopatruje inne spółki.', en: 'Prefers factories and mines; gladly supplies other companies.' },
    w: { retail: 0.9, industry: 1.4, raw: 1.35, rnd: 1, ads: 0.7, finance: 0.8, price: 1, risk: 1.1 },
    cats: { home: 1.15 },
  },
  {
    id: 'innovator',
    icon: '💡',
    name: { pl: 'Innowator', en: 'Innovator' },
    desc: { pl: 'Wygrywa jakością: dużo wydaje na badania, lubi elektronikę.', en: 'Wins on quality: spends big on research, loves electronics.' },
    w: { retail: 1, industry: 1.15, raw: 0.8, rnd: 1.7, ads: 1, finance: 0.8, price: 1.08, risk: 1 },
    cats: { electronics: 1.3 },
  },
  {
    id: 'discounter',
    icon: '🏷️',
    name: { pl: 'Dyskonter', en: 'Discounter' },
    desc: { pl: 'Niskie ceny, duży obrót, mało reklamy.', en: 'Low prices, high volume, little advertising.' },
    w: { retail: 1.2, industry: 1, raw: 1, rnd: 0.6, ads: 0.5, finance: 0.7, price: 0.92, risk: 0.9 },
    cats: { food: 1.2, household: 1.15 },
  },
  {
    id: 'brandBuilder',
    icon: '✨',
    name: { pl: 'Kreator marek', en: 'Brand builder' },
    desc: { pl: 'Buduje rozpoznawalne marki i każe sobie za nie płacić.', en: 'Builds famous brands and charges for them.' },
    w: { retail: 1, industry: 1, raw: 0.7, rnd: 1.1, ads: 1.8, finance: 0.9, price: 1.1, risk: 1 },
    cats: { apparel: 1.3, food: 1.05 },
  },
  {
    id: 'financier',
    icon: '📈',
    name: { pl: 'Finansista', en: 'Financier' },
    desc: { pl: 'Lewaruje się kredytem i poluje na okazje na giełdzie.', en: 'Leverages with credit and hunts for bargains on the stock market.' },
    w: { retail: 1, industry: 1, raw: 0.8, rnd: 0.8, ads: 0.9, finance: 1.7, price: 1, risk: 1.4 },
    cats: {},
  },
];
