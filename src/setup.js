// Assembles the game: base data + simulation rules + AI (+ optional mods).
// Both the browser UI and the headless tools start here.

import { Content } from './engine/content.js';
import { baseContentPlugin } from './content/index.js';
import { simPlugin } from './sim/index.js';
import { aiPlugin } from './ai/index.js';
import { MODS } from './mods/index.js';

/**
 * @param {{mods?: Array<{id: string, install: Function}>, ai?: boolean}} [options]
 *   mods — extra plugins (defaults to the list in src/mods/index.js)
 *   ai   — set to false to build a world without computer players' logic
 */
export function createContent({ mods = MODS, ai = true } = {}) {
  const content = new Content();
  content.use(simPlugin).use(baseContentPlugin);
  if (ai) content.use(aiPlugin);
  for (const mod of mods) content.use(mod);
  return content.finalize();
}

export { Game } from './engine/game.js';
