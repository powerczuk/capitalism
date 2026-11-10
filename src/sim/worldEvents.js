// Random world events ("news"): strikes, fashions, breakthroughs...
// Definitions live in the `worldEvents` registry; each one looks like
//
//   {
//     id: 'port_strike',
//     weight: 1,                    // relative likelihood
//     cooldown: 720,                // days before it may fire again (optional)
//     when(game) { return true; },  // optional precondition
//     fire(game) { ... }            // change the world, post news
//   }
//
// so a mod can add its own with `content.worldEvents.register({...})`.

export const worldEventSystem = {
  id: 'worldEvents',
  order: 20,

  setup(game) {
    game.state.eventLog = {}; // event id → last day it fired
  },

  monthly(game) {
    const { state, content, rng } = game;
    if (state.settings.events === false) return;
    if (state.day < 90) return; // a calm first quarter
    if (!rng.chance(content.balance.world.eventChance)) return;
    const candidates = content.worldEvents.filter((def) => {
      const last = state.eventLog[def.id];
      if (last != null && def.cooldown && state.day - last < def.cooldown) return false;
      return !def.when || def.when(game);
    });
    if (!candidates.length) return;
    const def = rng.weighted(candidates, (d) => d.weight ?? 1);
    state.eventLog[def.id] = state.day;
    def.fire(game);
  },
};
