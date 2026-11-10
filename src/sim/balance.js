// Default tuning numbers of the simulation. Nothing here is hard-wired:
// the values are merged into `content.balance`, so a mod can call
// `content.tune({ retail: { exponent: 5 } })` to change the feel of the game.

export const BALANCE = {
  /** Margin each stage of the supply chain adds when reference costs are derived. */
  chainMargin: 1.25,
  /** Default starting capital of every company. */
  startCash: 20_000_000,
  /** Smoothing factor of the daily moving averages shown in the UI and used by the AI. */
  ema: 0.15,

  /** The anonymous import market (available in every city, shipped from the nearest port). */
  import: {
    markup: 1.25, // import price = reference cost × markup
    techBonus: 5, // imported manufactured goods: quality = world tech + bonus
    rawQuality: 45, // quality of imported raw materials
    brand: 6, // brand rating of anonymous imported goods
  },

  /** Small local shops: the "outside option" every consumer always has. */
  local: {
    techBonus: 0, // their quality = world tech + bonus
    maxQuality: 75,
    brand: 10,
    popPerShop: 400_000, // one shop-equivalent of local competition per this many inhabitants
  },

  retail: {
    exponent: 2.5, // how sharply customers react to rating differences
    elasticityBase: 2, // price elasticity of demand = base + price weight × this ↓
    elasticityPrice: 4,
    priceRatioMax: 2, // nothing is gained by dumping below half the reference price
    redistribute: 0.6, // share of unserved customers who try another store
    stockDays: 3, // days of sales a shelf tries to keep in stock
    capacityByLevel: [1, 1.6, 2.3],
    pullByLevel: [1, 1.25, 1.5],
    wealthPrice: 0.5, // reference price scales with city wealth ^ this
  },

  freight: {
    perKm: 0.0002, // $ per weight unit per km
    localKm: 20, // distance charged for deliveries inside one city
  },

  production: {
    outputDays: 8, // a line stops when this many days of output are unsold
    inputDays: 3, // days of inputs a line tries to keep
    rawCostShare: 0.75, // default processing cost of raw recipes as a share of reference cost
    lineValue: { raw: 10_000, intermediate: 20_000, consumer: 24_000 }, // default daily output value of a line
  },

  building: {
    depreciation: 0.004, // per month, of original cost
    bookFloor: 0.3, // book value never falls below this share of cost
    salvage: 0.7, // cash recovered from book value on demolition
    liquidation: 0.5, // cash recovered from written-off stock
    upgradeCost: 0.6, // upgrade price as a share of the base price
    upgradeDays: 20,
    upkeepPerLevel: 0.5, // extra upkeep per level above 1
    cancelRefund: 0.8, // refund when a building is demolished before completion
  },

  loan: {
    base: 2_000_000, // every company can borrow at least this much
    equityFactor: 0.6, // credit limit = equity × this + yearly profit × profitFactor
    profitFactor: 1,
    spread: 0.02,
    leverageSpread: 0.03,
    penalty: 0.1, // extra interest on an overdrawn account
    overdraftShare: 0.1, // supplies are still paid while cash > -(this × assets)
    overdraftMin: 500_000,
  },

  brand: {
    adGain: 3, // brand points per month at `adScale` budget and zero brand
    adScale: 50_000,
    decay: 0.025, // monthly loss of brand rating
    organic: 0.02, // monthly gain per percentage point of national market share
    popRef: 3_000_000, // advertising gets pricier in bigger countries
    maxBudget: 2_000_000,
  },

  research: {
    gain: 1.3, // tech points per month at `budgetScale` budget and zero tech
    budgetScale: 100_000,
    exponent: 1.5, // diminishing returns near the top
    maxBudget: 1_000_000,
    diffusion: 5, // nobody stays more than this far behind world tech
  },

  stock: {
    shares: 1_000_000,
    founderShare: 0.4,
    pe: 10,
    reversion: 0.04, // daily pull of the price towards fundamental value
    volatility: 0.012,
    tradeImpact: 0.5, // price slippage when trading a large part of the company
    issueDiscount: 0.08,
    issueMaxShare: 0.25,
    issueCooldown: 180,
    takeoverPremium: 1.35,
    control: 0.5, // stake needed to take a company over
  },

  /** Corporate income tax on monthly profit (losses are carried forward). */
  tax: { rate: 0.19 },

  bankruptcy: { graceDays: 90 },

  economy: {
    cycleYears: 7,
    amplitude: 0.08,
    noise: 0.004,
    baseInterest: 0.06,
    interestSwing: 0.02,
    startTech: 30,
    techPerYear: 1.2,
    maxTech: 70,
  },

  world: {
    eventChance: 0.3, // chance per month that a random event fires
    width: 1000, // map size in km
    height: 640,
    minCityDistance: 170,
  },
};
