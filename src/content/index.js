// The base game's data as a plugin. A mod is exactly the same thing:
// an object with an id and an `install(content)` function that registers
// definitions (see src/mods/ for an example).

import { CATEGORIES, PRODUCTS } from './products.js';
import { RECIPES } from './recipes.js';
import { BUILDING_TYPES, DISTRICTS } from './buildings.js';
import { CITY_ARCHETYPES } from './cities.js';
import { COMPANY_TEMPLATES } from './companies.js';
import { WORLD_EVENTS } from './events.js';
import { GOALS } from './goals.js';

export const baseContentPlugin = {
  id: 'base-content',
  install(content) {
    content.categories.registerAll(CATEGORIES);
    content.products.registerAll(PRODUCTS);
    content.districts.registerAll(DISTRICTS);
    content.buildingTypes.registerAll(BUILDING_TYPES);
    content.recipes.registerAll(RECIPES);
    content.cityArchetypes.registerAll(CITY_ARCHETYPES);
    content.companyTemplates.registerAll(COMPANY_TEMPLATES);
    content.worldEvents.registerAll(WORLD_EVENTS);
    content.goals.registerAll(GOALS);
  },
};
