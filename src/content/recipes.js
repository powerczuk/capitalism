// Recipes: what a production line turns into what.
//
//   id        unique id (by convention the id of the output product)
//   building  building type that can run it
//   output    product id
//   inputs    { productId: units needed per unit of output }  (none = raw material)
//   cost      processing cost per unit (wages, energy) at average wages
//   rate      units per day per line — derived from the product value when omitted
//
// Raw recipes (no inputs) only work in cities where the resource occurs,
// and the output quality equals the quality of the local resource.

export const RECIPES = [
  // --- farm -------------------------------------------------------------
  { id: 'wheat', building: 'farm', output: 'wheat' },
  { id: 'cotton', building: 'farm', output: 'cotton' },
  { id: 'milk', building: 'farm', output: 'milk' },
  { id: 'livestock', building: 'farm', output: 'livestock' },
  { id: 'fruit', building: 'farm', output: 'fruit' },

  // --- forestry and mining --------------------------------------------------
  { id: 'timber', building: 'forestry', output: 'timber' },
  { id: 'iron_ore', building: 'mine', output: 'iron_ore' },
  { id: 'coal', building: 'mine', output: 'coal' },
  { id: 'oil', building: 'mine', output: 'oil' },
  { id: 'sand', building: 'mine', output: 'sand' },

  // --- factory: intermediate goods ------------------------------------------
  { id: 'flour', building: 'factory', output: 'flour', inputs: { wheat: 1.3 }, cost: 0.05 },
  { id: 'fabric', building: 'factory', output: 'fabric', inputs: { cotton: 1.1 }, cost: 0.25 },
  { id: 'leather', building: 'factory', output: 'leather', inputs: { livestock: 0.8 }, cost: 0.4 },
  { id: 'steel', building: 'factory', output: 'steel', inputs: { iron_ore: 2, coal: 1 }, cost: 0.35 },
  { id: 'plastic', building: 'factory', output: 'plastic', inputs: { oil: 1.6 }, cost: 0.25 },
  { id: 'glass', building: 'factory', output: 'glass', inputs: { sand: 2.5, coal: 0.4 }, cost: 0.2 },
  { id: 'lumber', building: 'factory', output: 'lumber', inputs: { timber: 1.6 }, cost: 0.15 },
  { id: 'chips', building: 'factory', output: 'chips', inputs: { sand: 1.5, plastic: 0.6 }, cost: 6 },
  { id: 'chemicals', building: 'factory', output: 'chemicals', inputs: { oil: 1.2, coal: 0.3 }, cost: 0.3 },

  // --- factory: food ----------------------------------------------------------
  { id: 'bread', building: 'factory', output: 'bread', inputs: { flour: 0.6 }, cost: 0.25 },
  { id: 'cookies', building: 'factory', output: 'cookies', inputs: { flour: 0.4, milk: 0.5 }, cost: 0.45 },
  { id: 'cheese', building: 'factory', output: 'cheese', inputs: { milk: 5 }, cost: 0.6 },
  { id: 'sausage', building: 'factory', output: 'sausage', inputs: { livestock: 1.5 }, cost: 0.8 },
  { id: 'juice', building: 'factory', output: 'juice', inputs: { fruit: 2.2 }, cost: 0.3 },
  { id: 'chocolate', building: 'factory', output: 'chocolate', inputs: { cocoa: 0.5, milk: 0.6 }, cost: 0.5 },
  { id: 'jam', building: 'factory', output: 'jam', inputs: { fruit: 1.6, glass: 0.25 }, cost: 0.35 },

  // --- factory: household -------------------------------------------------------
  { id: 'detergent', building: 'factory', output: 'detergent', inputs: { chemicals: 1, plastic: 0.25 }, cost: 0.5 },
  { id: 'shampoo', building: 'factory', output: 'shampoo', inputs: { chemicals: 0.5, plastic: 0.15 }, cost: 0.45 },

  // --- factory: apparel -----------------------------------------------------------
  { id: 'tshirt', building: 'factory', output: 'tshirt', inputs: { fabric: 1.2 }, cost: 1.5 },
  { id: 'jeans', building: 'factory', output: 'jeans', inputs: { fabric: 2.4 }, cost: 3 },
  { id: 'jacket', building: 'factory', output: 'jacket', inputs: { leather: 2.5, fabric: 1 }, cost: 12 },
  { id: 'shoes', building: 'factory', output: 'shoes', inputs: { leather: 1.2, plastic: 0.4 }, cost: 6 },
  { id: 'handbag', building: 'factory', output: 'handbag', inputs: { leather: 1.8 }, cost: 9 },

  // --- factory: home & leisure ----------------------------------------------------
  { id: 'chair', building: 'factory', output: 'chair', inputs: { lumber: 4 }, cost: 6 },
  { id: 'bed', building: 'factory', output: 'bed', inputs: { lumber: 10, fabric: 5 }, cost: 25 },
  { id: 'cookware', building: 'factory', output: 'cookware', inputs: { steel: 2.5 }, cost: 4 },
  { id: 'toys', building: 'factory', output: 'toys', inputs: { plastic: 1.2, fabric: 0.5 }, cost: 2.5 },
  { id: 'bicycle', building: 'factory', output: 'bicycle', inputs: { steel: 9, plastic: 2.5 }, cost: 30 },

  // --- factory: electronics --------------------------------------------------------
  { id: 'smartphone', building: 'factory', output: 'smartphone', inputs: { chips: 6, glass: 1.5, plastic: 1 }, cost: 70 },
  { id: 'laptop', building: 'factory', output: 'laptop', inputs: { chips: 12, plastic: 3, steel: 1.5 }, cost: 120 },
  { id: 'tv', building: 'factory', output: 'tv', inputs: { chips: 7, glass: 6, plastic: 5 }, cost: 70 },
  { id: 'headphones', building: 'factory', output: 'headphones', inputs: { chips: 1.5, plastic: 1.2 }, cost: 8 },
  { id: 'washer', building: 'factory', output: 'washer', inputs: { steel: 18, chips: 3, plastic: 6 }, cost: 70 },
];
