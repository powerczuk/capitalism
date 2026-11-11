// Loads every model file of the base game (each registers its models).
// A mod with its own models imports `registerModel` from ./index.js instead.

import './retail.js';
import './industry.js';
import './rural.js';
import './site.js';
import './town.js';

export { buildModel, hasModel, modelFor, modelIds, PLOT, plotOf, registerModel } from './index.js';
