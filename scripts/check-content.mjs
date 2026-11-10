// Prints the derived economics of every product: handy when balancing or
// after adding products in a mod.   Usage: npm run check

import { createContent } from '../src/setup.js';

const content = createContent();
const B = content.balance;
const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(9);

console.log(pad('product', 12), pad('type', 13), '     cost', '    price', '  import%', '   make%', '  rate/d', ' demand/1M', ' market$/1M');
for (const p of content.products.all()) {
  const recipe = content.recipesFor(p.id)[0];
  let makeCost = null;
  if (recipe) {
    makeCost = recipe.cost;
    for (const [id, per] of Object.entries(recipe.inputs)) makeCost += per * content.products.get(id).cost * B.import.markup;
  }
  const importPrice = p.cost * B.import.markup;
  const row = [
    pad(p.id, 12),
    pad(p.type, 13),
    num(p.cost),
    p.type === 'consumer' ? num(p.price) : '        -',
    p.type === 'consumer' ? num((1 - importPrice / p.price) * 100, 0) : '        -', // retail margin when importing
    p.type === 'consumer' && makeCost != null ? num((1 - makeCost / p.price) * 100, 0) : makeCost != null ? num((1 - makeCost / importPrice) * 100, 0) : '        -',
    recipe ? num(recipe.rate, 0) : '        -',
    p.type === 'consumer' ? num(p.demand * 1000, 0) : '        -',
    p.type === 'consumer' ? num(p.demand * 1000 * p.price, 0) : '        -',
  ];
  console.log(row.join(' '));
}

const consumer = content.consumerProducts;
const market = consumer.reduce((s, p) => s + p.demand * 1000 * p.price, 0);
console.log(`\n${content.products.size} products, ${content.recipes.size} recipes, ${content.buildingTypes.size} building types`);
console.log(`consumer market per 1M inhabitants: $${Math.round(market).toLocaleString('en')} / day`);
