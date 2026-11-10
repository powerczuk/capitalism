// Building types and city districts.
//
// Building kinds understood by the simulation:
//   retail    sells consumer goods:  slots, capacity ($ of sales per shelf per day), categories
//   producer  runs recipes:          lines (which recipes: see recipes.js `building`)
//   research  develops technology:   labs
//
// Common fields: cost (at national-average land prices), upkeep (per month at
// average wages), buildDays, districts (where it may stand), maxLevel.
// Each upgrade adds one slot/line/lab; retail upgrades also raise capacity.

export const DISTRICTS = [
  {
    id: 'center', icon: '🏙️', traffic: 1.35, cost: 1.8, upkeep: 1.3, plots: { base: 2, per: 600_000 },
    name: { pl: 'Centrum', en: 'Downtown' },
    desc: { pl: 'Najwięcej klientów, najdroższe działki — i jest ich mało.', en: 'Most customers, priciest plots — and only a few of them.' },
  },
  {
    id: 'residential', icon: '🏘️', traffic: 1.0, cost: 1.0, upkeep: 1.0, plots: { base: 4, per: 300_000 },
    name: { pl: 'Osiedla', en: 'Residential' },
    desc: { pl: 'Przeciętny ruch i przeciętne koszty.', en: 'Average traffic at average cost.' },
  },
  {
    id: 'suburb', icon: '🏡', traffic: 0.75, cost: 0.65, upkeep: 0.8, plots: { base: 5, per: 250_000 },
    name: { pl: 'Przedmieścia', en: 'Suburbs' },
    desc: { pl: 'Tanio, ale klientów mniej.', en: 'Cheap, but fewer customers.' },
  },
  {
    id: 'industrial', icon: '🏭', traffic: 0.4, cost: 0.8, upkeep: 0.9, plots: { base: 6, per: 400_000 },
    name: { pl: 'Strefa przemysłowa', en: 'Industrial zone' },
    desc: { pl: 'Miejsce dla fabryk i laboratoriów.', en: 'Home of factories and labs.' },
  },
  {
    id: 'rural', icon: '🌄', traffic: 0.3, cost: 0.6, upkeep: 0.8, plots: { base: 8, per: 600_000 },
    name: { pl: 'Tereny wiejskie', en: 'Countryside' },
    desc: { pl: 'Farmy, kopalnie i lasy wokół miasta.', en: 'Farms, mines and forests around the city.' },
  },
];

const RETAIL_DISTRICTS = ['center', 'residential', 'suburb'];

export const BUILDING_TYPES = [
  {
    id: 'supermarket', kind: 'retail', icon: '🛒',
    cost: 6_000_000, upkeep: 120_000, buildDays: 40,
    slots: 5, capacity: 10_000, categories: ['food', 'household'], districts: RETAIL_DISTRICTS,
    name: { pl: 'Supermarket', en: 'Supermarket' },
    desc: { pl: 'Sprzedaje żywność, chemię i kosmetyki.', en: 'Sells food, household goods and cosmetics.' },
  },
  {
    id: 'department', kind: 'retail', icon: '🏬',
    cost: 6_500_000, upkeep: 130_000, buildDays: 40,
    slots: 5, capacity: 10_000, categories: ['apparel', 'home'], districts: RETAIL_DISTRICTS,
    name: { pl: 'Dom towarowy', en: 'Department store' },
    desc: { pl: 'Sprzedaje odzież, obuwie, meble i artykuły dla domu.', en: 'Sells apparel, shoes, furniture and home goods.' },
  },
  {
    id: 'electronics', kind: 'retail', icon: '📺',
    cost: 6_200_000, upkeep: 115_000, buildDays: 40,
    slots: 4, capacity: 15_000, categories: ['electronics'], districts: RETAIL_DISTRICTS,
    name: { pl: 'Salon elektroniki', en: 'Electronics store' },
    desc: { pl: 'Sprzedaje elektronikę i sprzęt AGD.', en: 'Sells electronics and appliances.' },
  },
  {
    id: 'factory', kind: 'producer', icon: '🏭',
    cost: 10_000_000, upkeep: 240_000, buildDays: 70,
    lines: 2, districts: ['industrial'],
    name: { pl: 'Fabryka', en: 'Factory' },
    desc: { pl: 'Przetwarza surowce i półprodukty w towary. Każda linia produkuje jeden wyrób.', en: 'Turns raw and intermediate goods into products. Each line makes one product.' },
  },
  {
    id: 'farm', kind: 'producer', icon: '🚜',
    cost: 4_500_000, upkeep: 110_000, buildDays: 50,
    lines: 2, districts: ['rural'],
    name: { pl: 'Farma', en: 'Farm' },
    desc: { pl: 'Uprawy i hodowla. Jakość zależy od warunków w okolicy miasta.', en: 'Crops and livestock. Quality depends on local conditions.' },
  },
  {
    id: 'mine', kind: 'producer', icon: '⛏️',
    cost: 7_500_000, upkeep: 160_000, buildDays: 70,
    lines: 2, districts: ['rural'],
    name: { pl: 'Kopalnia', en: 'Mine' },
    desc: { pl: 'Wydobywa rudy, węgiel, piasek i ropę — tam, gdzie są złoża.', en: 'Extracts ore, coal, sand and oil — where deposits exist.' },
  },
  {
    id: 'forestry', kind: 'producer', icon: '🌲',
    cost: 4_000_000, upkeep: 80_000, buildDays: 50,
    lines: 2, districts: ['rural'],
    name: { pl: 'Leśnictwo', en: 'Forestry' },
    desc: { pl: 'Pozyskuje drewno dla tartaków i fabryk mebli.', en: 'Harvests timber for sawmills and furniture makers.' },
  },
  {
    id: 'lab', kind: 'research', icon: '🔬',
    cost: 7_000_000, upkeep: 110_000, buildDays: 60,
    labs: 2, districts: ['industrial'],
    name: { pl: 'Centrum badawcze', en: 'Research centre' },
    desc: { pl: 'Zespoły badawcze podnoszą technologię — a więc jakość — wybranych wyrobów.', en: 'Research teams raise the technology — and so the quality — of chosen products.' },
  },
];
