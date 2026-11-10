// Investment planner: collects project proposals from every module that has
// a `propose(ctx, budget)` function, and funds the best ones.
//
// A project is { kind, cost, profitDay, roi, score, execute(ctx) → boolean }.
// `roi` is the expected yearly return on the money spent; `score` is the roi
// seen through the company's personality (an industrialist loves factories).

export function gatherProjects(ctx, budget) {
  const projects = [];
  for (const module of ctx.game.content.aiModules.all()) {
    if (!module.propose) continue;
    for (const project of module.propose(ctx, budget)) projects.push(project);
  }
  return projects;
}

export const investModule = {
  id: 'invest',
  order: 120,
  eager: true,
  run(ctx) {
    const { profile } = ctx;
    for (let round = 0; round < profile.maxProjects; round++) {
      const budget = ctx.budget();
      const projects = gatherProjects(ctx, budget)
        .filter((p) => p.cost <= budget && p.roi >= profile.minRoi)
        .sort((a, b) => b.score - a.score);
      const project = ctx.pick(projects);
      if (!project) break;
      if (project.cost > 0 && !ctx.fund(project.cost)) break;
      const done = project.execute(ctx);
      ctx.reset();
      if (!done) break;
    }
  },
};
