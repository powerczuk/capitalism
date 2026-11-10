// Goals: decide when the human player has won or lost.
// Goal definitions live in the `goals` registry:
//
//   {
//     id: 'worth100',
//     check(game, company) → { progress: 0..1, done?: boolean, failed?: boolean }
//   }

import { fail } from '../engine/game.js';

/** Current progress of the human player's goal (for the UI). */
export function goalStatus(game) {
  const human = game.human;
  const goal = game.content.goals.find(game.state.settings.goal);
  if (!human || !goal) return null;
  return { goal, ...goal.check(game, human) };
}

export const goalSystem = {
  id: 'goals',
  order: 95,

  daily(game) {
    const { state } = game;
    if (state.outcome || !state.humanId) return;
    const human = state.companies[state.humanId];
    if (!human.alive) {
      state.outcome = { result: 'lost', reason: human.acquiredBy ? 'takeover' : 'bankrupt', day: state.day };
      game.bus.emit('outcome', state.outcome);
      return;
    }
    if (state.day % 10 !== 0) return;
    const status = goalStatus(game);
    if (!status) return;
    if (status.done) state.outcome = { result: 'won', reason: status.goal.id, day: state.day };
    else if (status.failed) state.outcome = { result: 'lost', reason: 'goal', day: state.day };
    if (state.outcome) game.bus.emit('outcome', state.outcome);
  },
};

export const goalCommands = [
  {
    id: 'continuePlay',
    /** Keep playing in free mode after the goal was decided. */
    check(game) {
      return game.state.outcome ? null : fail('err.badValue');
    },
    run(game) {
      game.state.outcome = null;
      game.state.settings.goal = 'sandbox';
      return {};
    },
  },
];
