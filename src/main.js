// Browser entry point.

import { App } from './ui/app.js';

function boot() {
  const root = document.getElementById('root');
  const app = new App(root);
  // Handy for debugging and for mods experimenting in the console.
  window.hossa = app;

  // When the page is hosted as a Claude artifact, an updated version may be
  // swapped in while someone is playing: hand the running game over.
  const hot = window.claude?.hot;
  if (hot?.snapshot) {
    hot.snapshot(() => (app.game ? { save: app.game.save(), view: app.ui.view } : {}));
  }
  const restore = (data) => {
    if (data?.save && app.loadGame(data.save) && data.view) app.go(data.view);
  };
  if (hot?.ready) hot.ready(restore);
  else restore(hot?.data);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
