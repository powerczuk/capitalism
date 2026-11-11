// Saving and loading in the browser. localStorage can be missing or blocked
// (private windows, embedded previews), so every access is guarded and an
// in-memory copy keeps "continue" working for the rest of the session.

const PREFIX = 'wielka-hossa';
const memory = new Map();
const unsaved = new Set(); // keys whose newest value exists only in `memory`

function read(key) {
  // What the browser refused to keep is newer than what it still holds.
  if (unsaved.has(key)) return memory.get(key) ?? null;
  try {
    const text = window.localStorage.getItem(key);
    if (text != null) return text;
  } catch {
    /* storage unavailable */
  }
  return memory.get(key) ?? null;
}

function write(key, text) {
  memory.set(key, text);
  try {
    window.localStorage.setItem(key, text);
    unsaved.delete(key);
    return true;
  } catch {
    unsaved.add(key);
    return false;
  }
}

function remove(key) {
  memory.delete(key);
  unsaved.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

// --- preferences -------------------------------------------------------------

export function loadPrefs() {
  try {
    return JSON.parse(read(`${PREFIX}:prefs`) || '{}') || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  write(`${PREFIX}:prefs`, JSON.stringify(prefs));
}

// --- saved games ---------------------------------------------------------------

const slotKey = (slot) => `${PREFIX}:save:${slot}`;
const metaKey = (slot) => `${PREFIX}:save:${slot}:meta`;

/** Save text of a game: the state is serialised directly, without an intermediate copy. */
function serialise(game) {
  const { state } = game;
  return JSON.stringify({ v: state.v, day: state.day, state, meta: { company: game.human?.name ?? '', savedAt: Date.now() } });
}

/** @returns {boolean} false when the browser refused to store the save permanently */
export function saveGame(game, slot = 'auto') {
  // A tiny companion entry lets menus describe the save without parsing all of it.
  write(metaKey(slot), JSON.stringify({ day: game.state.day, company: game.human?.name ?? '', savedAt: Date.now() }));
  return write(slotKey(slot), serialise(game));
}

export function loadSaved(slot = 'auto') {
  const text = read(slotKey(slot));
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Short description of a save for menus: { day, company, savedAt } or null. */
export function savedInfo(slot = 'auto') {
  if (read(slotKey(slot)) == null) return null;
  try {
    const meta = JSON.parse(read(metaKey(slot)) || 'null');
    if (meta && typeof meta.day === 'number') return meta;
  } catch {
    /* fall through to the full save */
  }
  const data = loadSaved(slot);
  if (!data?.state) return null;
  return { day: data.day ?? data.state.day, company: data.meta?.company ?? '', savedAt: data.meta?.savedAt ?? 0 };
}

export function deleteSave(slot = 'auto') {
  remove(slotKey(slot));
  remove(metaKey(slot));
}

/** Text form of a save for copying between devices. */
export function exportText(game) {
  return serialise(game);
}

export function parseImport(text) {
  const data = JSON.parse(String(text).trim());
  if (!data || typeof data !== 'object' || !data.state) throw new Error('save.invalid');
  return data;
}
