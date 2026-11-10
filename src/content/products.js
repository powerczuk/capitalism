// The product catalogue of the base game.
//
// Three kinds of products:
//   raw           grown or extracted (needs a natural resource in the city)
//   intermediate  made from raw materials, used by other factories
//   consumer      sold to people in stores
//
// Most numbers are *derived* when the content is finalised:
//   cost   — reference wholesale value (from the recipe unless given)
//   price  — reference retail price (cost × category markup unless given)
//   demand — units per 1000 inhabitants per day (from `spend` ÷ price)
// so adding a product usually takes one entry here and one recipe.
//
// Fields of a consumer product:
//   spend      consumer spending in $ per 1000 inhabitants per day
//   weights    what buyers care about: { price, quality, brand } (normalised)
//   necessity  1 = staple (steady demand), 0 = luxury (follows wealth and the cycle)
//   techShare  how much of the quality comes from technology (rest: input quality)
//   weight     transport weight per unit (drives freight cost)
//
// Raw materials list where they occur: `occurs[archetypeId] = [chance, minQ, maxQ]`
// ('*' = any other city). A raw material without a recipe is import-only.

export const CATEGORIES = [
  { id: 'food', icon: '🍽️', markup: 1.7, name: { pl: 'Żywność', en: 'Food' } },
  { id: 'household', icon: '🧼', markup: 1.8, name: { pl: 'Chemia i kosmetyki', en: 'Household & care' } },
  { id: 'apparel', icon: '👕', markup: 2.0, name: { pl: 'Odzież i obuwie', en: 'Apparel' } },
  { id: 'home', icon: '🪑', markup: 1.85, name: { pl: 'Dom i rekreacja', en: 'Home & leisure' } },
  { id: 'electronics', icon: '📱', markup: 1.6, name: { pl: 'Elektronika i AGD', en: 'Electronics' } },
];

export const PRODUCTS = [
  // --- raw materials: farm ---------------------------------------------
  {
    id: 'wheat', type: 'raw', icon: '🌾', cost: 0.2, weight: 1,
    name: { pl: 'Pszenica', en: 'Wheat' },
    occurs: { farmland: [1, 54, 71], metropolis: [0.5, 34, 48], port: [0.4, 34, 48], '*': [0.3, 30, 48] },
  },
  {
    id: 'cotton', type: 'raw', icon: '🧶', cost: 0.9, weight: 1,
    name: { pl: 'Bawełna', en: 'Cotton' },
    occurs: { farmland: [0.9, 48, 68], port: [0.3, 34, 49], '*': [0.2, 30, 48] },
  },
  {
    id: 'milk', type: 'raw', icon: '🥛', cost: 0.35, weight: 1,
    name: { pl: 'Mleko', en: 'Milk' },
    occurs: { highland: [1, 55, 71], farmland: [0.9, 48, 66], '*': [0.35, 34, 49] },
  },
  {
    id: 'livestock', type: 'raw', icon: '🐄', cost: 1.4, weight: 1.2,
    name: { pl: 'Żywiec', en: 'Livestock' },
    occurs: { farmland: [0.9, 49, 68], highland: [0.7, 44, 62], '*': [0.3, 32, 48] },
  },
  {
    id: 'fruit', type: 'raw', icon: '🍎', cost: 0.45, weight: 1,
    name: { pl: 'Owoce', en: 'Fruit' },
    occurs: { farmland: [0.8, 48, 68], university: [0.6, 41, 59], port: [0.5, 37, 55], '*': [0.25, 32, 48] },
  },
  {
    // Tropical: cannot be grown here, always imported.
    id: 'cocoa', type: 'raw', icon: '🌰', cost: 1.6, weight: 1,
    name: { pl: 'Kakao', en: 'Cocoa' },
  },

  // --- raw materials: forestry and mining ---------------------------------
  {
    id: 'timber', type: 'raw', icon: '🪵', cost: 0.4, weight: 1.2,
    name: { pl: 'Drewno', en: 'Timber' },
    occurs: { highland: [1, 55, 71], industrial: [0.6, 41, 59], '*': [0.3, 34, 52] },
  },
  {
    id: 'iron_ore', type: 'raw', icon: '🪨', cost: 0.3, weight: 1.5,
    name: { pl: 'Ruda żelaza', en: 'Iron ore' },
    occurs: { industrial: [1, 49, 68], highland: [0.5, 37, 55], '*': [0.1, 30, 44] },
  },
  {
    id: 'coal', type: 'raw', icon: '🌑', cost: 0.25, weight: 1.5,
    name: { pl: 'Węgiel', en: 'Coal' },
    occurs: { industrial: [1, 52, 70], highland: [0.3, 34, 48], '*': [0.1, 30, 44] },
  },
  {
    id: 'oil', type: 'raw', icon: '🛢️', cost: 0.5, weight: 1.2,
    name: { pl: 'Ropa naftowa', en: 'Crude oil' },
    occurs: { port: [0.9, 41, 62], industrial: [0.3, 34, 52], '*': [0.12, 30, 48] },
  },
  {
    id: 'sand', type: 'raw', icon: '⌛', cost: 0.15, weight: 1.5,
    name: { pl: 'Piasek kwarcowy', en: 'Silica sand' },
    occurs: { port: [1, 49, 68], university: [0.4, 37, 55], '*': [0.3, 34, 49] },
  },

  // --- intermediate goods -----------------------------------------------
  { id: 'flour', type: 'intermediate', icon: '🍚', techShare: 0.3, weight: 1, name: { pl: 'Mąka', en: 'Flour' } },
  { id: 'fabric', type: 'intermediate', icon: '🧵', techShare: 0.4, weight: 0.8, name: { pl: 'Tkanina', en: 'Fabric' } },
  { id: 'leather', type: 'intermediate', icon: '🟫', techShare: 0.3, weight: 0.8, name: { pl: 'Skóra', en: 'Leather' } },
  { id: 'steel', type: 'intermediate', icon: '🔩', techShare: 0.5, weight: 1.5, name: { pl: 'Stal', en: 'Steel' } },
  { id: 'plastic', type: 'intermediate', icon: '🧩', techShare: 0.6, weight: 0.8, name: { pl: 'Tworzywo sztuczne', en: 'Plastic' } },
  { id: 'glass', type: 'intermediate', icon: '🪟', techShare: 0.5, weight: 1.5, name: { pl: 'Szkło', en: 'Glass' } },
  { id: 'lumber', type: 'intermediate', icon: '🪚', techShare: 0.3, weight: 1.2, name: { pl: 'Tarcica', en: 'Lumber' } },
  { id: 'chips', type: 'intermediate', icon: '💾', techShare: 0.85, weight: 0.2, name: { pl: 'Podzespoły elektroniczne', en: 'Electronic components' } },
  { id: 'chemicals', type: 'intermediate', icon: '⚗️', techShare: 0.6, weight: 1, name: { pl: 'Chemikalia', en: 'Chemicals' } },

  // --- consumer goods: food ---------------------------------------------
  {
    id: 'bread', type: 'consumer', category: 'food', icon: '🍞', spend: 61,
    weights: { price: 0.55, quality: 0.35, brand: 0.1 }, necessity: 1, techShare: 0.3, weight: 0.5,
    name: { pl: 'Pieczywo', en: 'Bread' },
  },
  {
    id: 'cookies', type: 'consumer', category: 'food', icon: '🍪', spend: 35,
    weights: { price: 0.4, quality: 0.35, brand: 0.25 }, necessity: 0.7, techShare: 0.35, weight: 0.4,
    name: { pl: 'Ciastka', en: 'Cookies' },
  },
  {
    id: 'cheese', type: 'consumer', category: 'food', icon: '🧀', spend: 48,
    weights: { price: 0.4, quality: 0.45, brand: 0.15 }, necessity: 0.8, techShare: 0.35, weight: 0.5,
    name: { pl: 'Ser', en: 'Cheese' },
  },
  {
    id: 'sausage', type: 'consumer', category: 'food', icon: '🥓', spend: 58,
    weights: { price: 0.4, quality: 0.45, brand: 0.15 }, necessity: 0.8, techShare: 0.3, weight: 0.6,
    name: { pl: 'Wędliny', en: 'Cold cuts' },
  },
  {
    id: 'juice', type: 'consumer', category: 'food', icon: '🧃', spend: 38,
    weights: { price: 0.4, quality: 0.35, brand: 0.25 }, necessity: 0.7, techShare: 0.25, weight: 1,
    name: { pl: 'Sok owocowy', en: 'Fruit juice' },
  },
  {
    id: 'chocolate', type: 'consumer', category: 'food', icon: '🍫', spend: 35,
    weights: { price: 0.3, quality: 0.35, brand: 0.35 }, necessity: 0.5, techShare: 0.4, weight: 0.2,
    name: { pl: 'Czekolada', en: 'Chocolate' },
  },
  {
    id: 'jam', type: 'consumer', category: 'food', icon: '🍓', spend: 19,
    weights: { price: 0.45, quality: 0.4, brand: 0.15 }, necessity: 0.7, techShare: 0.25, weight: 0.6,
    name: { pl: 'Dżem', en: 'Jam' },
  },

  // --- consumer goods: household ------------------------------------------
  {
    id: 'detergent', type: 'consumer', category: 'household', icon: '🧼', spend: 32,
    weights: { price: 0.45, quality: 0.3, brand: 0.25 }, necessity: 0.9, techShare: 0.6, weight: 1.5,
    name: { pl: 'Proszek do prania', en: 'Detergent' },
  },
  {
    id: 'shampoo', type: 'consumer', category: 'household', icon: '🧴', spend: 29,
    weights: { price: 0.35, quality: 0.3, brand: 0.35 }, necessity: 0.8, techShare: 0.6, weight: 0.5,
    name: { pl: 'Szampon', en: 'Shampoo' },
  },

  // --- consumer goods: apparel --------------------------------------------
  {
    id: 'tshirt', type: 'consumer', category: 'apparel', icon: '👕', spend: 32,
    weights: { price: 0.4, quality: 0.3, brand: 0.3 }, necessity: 0.6, techShare: 0.4, weight: 0.3,
    name: { pl: 'Koszulka', en: 'T-shirt' },
  },
  {
    id: 'jeans', type: 'consumer', category: 'apparel', icon: '👖', spend: 38,
    weights: { price: 0.3, quality: 0.35, brand: 0.35 }, necessity: 0.5, techShare: 0.4, weight: 0.7,
    name: { pl: 'Dżinsy', en: 'Jeans' },
  },
  {
    id: 'jacket', type: 'consumer', category: 'apparel', icon: '🧥', spend: 26, markup: 2.3,
    weights: { price: 0.2, quality: 0.4, brand: 0.4 }, necessity: 0.2, techShare: 0.4, weight: 1.5,
    name: { pl: 'Kurtka skórzana', en: 'Leather jacket' },
  },
  {
    id: 'shoes', type: 'consumer', category: 'apparel', icon: '👞', spend: 42,
    weights: { price: 0.3, quality: 0.4, brand: 0.3 }, necessity: 0.5, techShare: 0.45, weight: 1,
    name: { pl: 'Buty skórzane', en: 'Leather shoes' },
  },
  {
    id: 'handbag', type: 'consumer', category: 'apparel', icon: '👜', spend: 19, markup: 2.3,
    weights: { price: 0.15, quality: 0.35, brand: 0.5 }, necessity: 0.1, techShare: 0.45, weight: 0.8,
    name: { pl: 'Torebka', en: 'Handbag' },
  },

  // --- consumer goods: home & leisure -------------------------------------
  {
    id: 'chair', type: 'consumer', category: 'home', icon: '🪑', spend: 16,
    weights: { price: 0.4, quality: 0.45, brand: 0.15 }, necessity: 0.4, techShare: 0.45, weight: 6,
    name: { pl: 'Krzesło', en: 'Chair' },
  },
  {
    id: 'bed', type: 'consumer', category: 'home', icon: '🛏️', spend: 19,
    weights: { price: 0.35, quality: 0.5, brand: 0.15 }, necessity: 0.3, techShare: 0.45, weight: 40,
    name: { pl: 'Łóżko', en: 'Bed' },
  },
  {
    id: 'cookware', type: 'consumer', category: 'home', icon: '🍳', spend: 19,
    weights: { price: 0.4, quality: 0.45, brand: 0.15 }, necessity: 0.5, techShare: 0.5, weight: 3,
    name: { pl: 'Garnki', en: 'Cookware' },
  },
  {
    id: 'toys', type: 'consumer', category: 'home', icon: '🧸', spend: 26,
    weights: { price: 0.35, quality: 0.35, brand: 0.3 }, necessity: 0.4, techShare: 0.5, weight: 1,
    name: { pl: 'Zabawki', en: 'Toys' },
  },
  {
    id: 'bicycle', type: 'consumer', category: 'home', icon: '🚲', spend: 19,
    weights: { price: 0.3, quality: 0.45, brand: 0.25 }, necessity: 0.3, techShare: 0.6, weight: 14,
    name: { pl: 'Rower', en: 'Bicycle' },
  },

  // --- consumer goods: electronics ----------------------------------------
  {
    id: 'smartphone', type: 'consumer', category: 'electronics', icon: '📱', spend: 64,
    weights: { price: 0.2, quality: 0.45, brand: 0.35 }, necessity: 0.3, techShare: 0.85, weight: 0.3,
    name: { pl: 'Smartfon', en: 'Smartphone' },
  },
  {
    id: 'laptop', type: 'consumer', category: 'electronics', icon: '💻', spend: 54,
    weights: { price: 0.25, quality: 0.5, brand: 0.25 }, necessity: 0.3, techShare: 0.85, weight: 2.5,
    name: { pl: 'Laptop', en: 'Laptop' },
  },
  {
    id: 'tv', type: 'consumer', category: 'electronics', icon: '📺', spend: 42,
    weights: { price: 0.3, quality: 0.45, brand: 0.25 }, necessity: 0.3, techShare: 0.8, weight: 14,
    name: { pl: 'Telewizor', en: 'TV set' },
  },
  {
    id: 'headphones', type: 'consumer', category: 'electronics', icon: '🎧', spend: 19,
    weights: { price: 0.3, quality: 0.4, brand: 0.3 }, necessity: 0.3, techShare: 0.75, weight: 0.4,
    name: { pl: 'Słuchawki', en: 'Headphones' },
  },
  {
    id: 'washer', type: 'consumer', category: 'electronics', icon: '🧺', spend: 26,
    weights: { price: 0.35, quality: 0.5, brand: 0.15 }, necessity: 0.4, techShare: 0.7, weight: 65,
    name: { pl: 'Pralka', en: 'Washing machine' },
  },
];
