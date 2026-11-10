// Minimal publish/subscribe bus. The simulation emits, the UI (or tests)
// listens — the engine never needs to know who is watching.

export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  /** Subscribe; returns an unsubscribe function. */
  on(type, fn) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
