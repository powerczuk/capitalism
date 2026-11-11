// Mods loaded with the game. To add yours: write a plugin object
// `{ id, install(content) {...} }` (see ./coffee.js and docs/MODDING.md),
// import it here and put it on the list.

import { coffeeMod } from './coffee.js';

export const MODS = [coffeeMod];
