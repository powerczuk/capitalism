// Saving and loading in the browser. localStorage can be missing or blocked
// (private windows, embedded previews), so every access is guarded and an
// in-memory copy keeps "continue" working for the rest of the session.

const PREFIX = 'wielka-hossa';
const memory = new Map();

function read(key) {
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
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  memory.delete(key);
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

/** @returns {boolean} false when the browser refused to store the save permanently */
export function saveGame(game, slot = 'auto') {
  const human = game.human;
  const data = {
    ...game.save(),
    meta: { company: human?.name ?? '', savedAt: Date.now() },
  };
  return write(slotKey(slot), JSON.stringify(data));
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

/** Light-weight description of a save for menus (no full parse of the state needed by callers). */
export function savedInfo(slot = 'auto') {
  const data = loadSaved(slot);
  if (!data?.state) return null;
  return { day: data.day ?? data.state.day, company: data.meta?.company ?? '', savedAt: data.meta?.savedAt ?? 0 };
}

export function deleteSave(slot = 'auto') {
  remove(slotKey(slot));
}

/** Text form of a save for copying between devices. */
export function exportText(game) {
  return JSON.stringify({ ...game.save(), meta: { company: game.human?.name ?? '', savedAt: Date.now() } });
}

export function parseImport(text) {
  const data = JSON.parse(String(text).trim());
  if (!data || typeof data !== 'object' || !data.state) throw new Error('save.invalid');
  return data;
}
