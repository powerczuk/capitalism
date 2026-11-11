// Widgets: parts of the page that look after their own DOM — a WebGL canvas,
// say — instead of being re-rendered as markup. A view places one with
//
//   <div id="world3d" data-widget="world3d" data-morph="keep"></div>
//
// (`data-morph="keep"` tells the DOM patcher to leave the element's inside
// alone; the id keeps it the same element from one render to the next) and
// some module registers what lives there:
//
//   registerWidget('world3d', (element, app) => ({
//     update(app) { … },     // after every render of the page
//     destroy() { … },       // when the element has left the page
//   }));
//
// The app calls `syncWidgets` after each render.

const factories = new Map();
const live = new Map(); // element → widget instance

export function registerWidget(name, factory) {
  factories.set(name, factory);
}

export function syncWidgets(root, app) {
  const seen = new Set();
  for (const el of root.querySelectorAll('[data-widget]')) {
    seen.add(el);
    const widget = live.get(el);
    if (widget) {
      widget.update?.(app);
      continue;
    }
    const factory = factories.get(el.dataset.widget);
    if (factory) live.set(el, factory(el, app) ?? {});
  }
  for (const [el, widget] of live) {
    if (seen.has(el)) continue;
    widget.destroy?.();
    live.delete(el);
  }
}
