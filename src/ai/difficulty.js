// Difficulty levels of computer players.
//
// A level never cheats: every AI plays through the same commands and pays the
// same prices as a human. Levels differ in *competence*:
//   cadence   how often each routine module thinks, in days (missing = never)
//   projects  kinds of investments it considers ('store', 'upgrade', 'factory', 'raw', 'lab')
//   noise     relative error of its demand/profit forecasts
//   blunder   chance of picking a merely decent option instead of the best
//   pricing   'costPlus' (fixed markup) | 'follow' (copy the market) | 'optimize'
//   ...and how boldly it invests and borrows.
//
// Add a level with `content.difficulties.register({...})`.

export const DIFFICULTIES = [
  {
    id: 'novice',
    rank: 1,
    name: { pl: 'Nowicjusz', en: 'Novice' },
    desc: {
      pl: 'Otwiera sklepy powoli i sprzedaje towar z importu po stałej marży. Nie produkuje, nie reklamuje, nie pożycza.',
      en: 'Opens stores slowly and sells imported goods at a fixed markup. No factories, no ads, no loans.',
    },
    cadence: { finance: 60, prune: 240, sourcing: 90, shelves: 30, pricing: 75, invest: 100, stock: 90 },
    projects: ['store'],
    noise: 0.35,
    blunder: 0.35,
    pricing: 'costPlus',
    markup: [0.45, 0.75],
    minRoi: 0.2,
    reserveMonths: 8,
    investShare: 0.5,
    maxLeverage: 0,
    maxProjects: 1,
    qualityAware: false,
    cannibalAware: false,
    b2b: false,
    adRate: 0,
    rndRate: 0,
    raider: false,
  },
  {
    id: 'manager',
    rank: 2,
    name: { pl: 'Przedsiębiorca', en: 'Entrepreneur' },
    desc: {
      pl: 'Rozsądnie rozwija sieć, dopasowuje ceny do rynku i stawia fabryki dla najlepiej sprzedających się towarów.',
      en: 'Grows a chain sensibly, follows market prices and builds factories for its best sellers.',
    },
    cadence: { finance: 30, prune: 120, sourcing: 30, shelves: 14, pricing: 30, invest: 45, marketing: 90, stock: 60 },
    projects: ['store', 'upgrade', 'factory'],
    noise: 0.2,
    blunder: 0.18,
    pricing: 'follow',
    markup: [0.4, 0.6],
    minRoi: 0.25,
    reserveMonths: 5,
    investShare: 0.7,
    maxLeverage: 0.3,
    maxProjects: 1,
    qualityAware: false,
    cannibalAware: false,
    b2b: false,
    adRate: 0.015,
    rndRate: 0,
    raider: false,
  },
  {
    id: 'shark',
    rank: 3,
    name: { pl: 'Rekin biznesu', en: 'Business shark' },
    desc: {
      pl: 'Optymalizuje ceny, buduje pełne łańcuchy dostaw od surowca po półkę, inwestuje w badania i reklamę, korzysta z kredytu.',
      en: 'Optimises prices, builds full supply chains from raw material to shelf, invests in research and advertising, uses credit.',
    },
    cadence: { finance: 14, prune: 60, sourcing: 14, shelves: 7, pricing: 14, invest: 21, marketing: 30, research: 60, stock: 30 },
    projects: ['store', 'upgrade', 'factory', 'raw', 'lab'],
    noise: 0.08,
    blunder: 0.06,
    pricing: 'optimize',
    markup: [0.4, 0.6],
    minRoi: 0.3,
    reserveMonths: 3,
    investShare: 0.85,
    maxLeverage: 0.6,
    maxProjects: 2,
    qualityAware: true,
    cannibalAware: true,
    b2b: true,
    adRate: 0.03,
    rndRate: 0.03,
    raider: false,
  },
  {
    id: 'tycoon',
    rank: 4,
    name: { pl: 'Magnat', en: 'Tycoon' },
    desc: {
      pl: 'Gra bezbłędnie i agresywnie: błyskawiczna ekspansja, wojny cenowe, pełna integracja pionowa, gra na giełdzie i wrogie przejęcia.',
      en: 'Plays sharp and aggressive: rapid expansion, price wars, full vertical integration, stock-market plays and hostile takeovers.',
    },
    cadence: { finance: 7, prune: 30, sourcing: 7, shelves: 5, pricing: 7, invest: 10, marketing: 30, research: 30, stock: 14 },
    projects: ['store', 'upgrade', 'factory', 'raw', 'lab'],
    noise: 0.03,
    blunder: 0,
    pricing: 'optimize',
    markup: [0.4, 0.6],
    minRoi: 0.3,
    reserveMonths: 2,
    investShare: 1,
    maxLeverage: 0.8,
    maxProjects: 3,
    qualityAware: true,
    cannibalAware: true,
    b2b: true,
    adRate: 0.04,
    rndRate: 0.04,
    raider: true,
  },
];
