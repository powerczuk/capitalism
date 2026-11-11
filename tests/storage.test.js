// Saving in the browser has to work with a storage that is full, blocked or
// missing: the newest save then lives on for the session, and reading it back
// must give that newest save, not an older one the browser still holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';

/** A stand-in for localStorage that can be told to refuse writes. */
function fakeStorage() {
  const data = new Map();
  return {
    data,
    full: false,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      if (this.full) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
  };
}

// A save is JSON: the sign of a zero and the like do not survive it, and need not.
const plain = (value) => JSON.parse(JSON.stringify(value));

const content = createContent();
const local = fakeStorage();
globalThis.window = { localStorage: local };
const storage = await import('../src/ui/storage.js');

test('storage: saves, describes and loads a game', () => {
  const game = Game.create(content, { seed: 'store', cityCount: 3, player: { name: 'Zapis & Syn' }, rivals: [{ level: 'novice' }] });
  game.run(30);
  assert.equal(storage.savedInfo('manual'), null);
  assert.equal(storage.saveGame(game, 'manual'), true);
  const info = storage.savedInfo('manual');
  assert.equal(info.day, 30);
  assert.equal(info.company, 'Zapis & Syn');
  const loaded = Game.load(content, storage.loadSaved('manual'));
  assert.deepEqual(plain(loaded.state), plain(game.state));
  // The text form for moving a game between devices loads just the same.
  assert.deepEqual(plain(Game.load(content, storage.parseImport(storage.exportText(game))).state), plain(game.state));
  for (const junk of ['', 'nope', '[]', '7', '{"v":1}']) assert.throws(() => storage.parseImport(junk), junk || 'empty text');
  storage.deleteSave('manual');
  assert.equal(storage.savedInfo('manual'), null);
  assert.equal(storage.loadSaved('manual'), null);
});

test('storage: when the browser refuses a save, the session keeps the newest one', () => {
  const game = Game.create(content, { seed: 'full', cityCount: 3, player: { name: 'Pełny Dysk' }, rivals: [] });
  game.run(30);
  assert.equal(storage.saveGame(game, 'auto'), true);
  game.run(300);
  local.full = true;
  assert.equal(storage.saveGame(game, 'auto'), false, 'the caller learns the save is not permanent');
  assert.equal(storage.savedInfo('auto').day, 330, 'the menu describes the newest save');
  assert.equal(storage.loadSaved('auto').state.day, 330, 'and loading gives the newest save');
  assert.equal(JSON.parse(local.data.get('wielka-hossa:save:auto')).state.day, 30, 'while the browser still holds the old one');
  // Once the browser accepts writes again, the permanent copy catches up.
  local.full = false;
  game.run(30);
  assert.equal(storage.saveGame(game, 'auto'), true);
  assert.equal(JSON.parse(local.data.get('wielka-hossa:save:auto')).state.day, 360);
  assert.equal(storage.savedInfo('auto').day, 360);
});

test('storage: works without any browser storage at all', () => {
  const real = globalThis.window;
  globalThis.window = {
    get localStorage() {
      throw new Error('SecurityError');
    },
  };
  try {
    const game = Game.create(content, { seed: 'none', cityCount: 3, player: { name: 'Incognito' }, rivals: [] });
    game.run(10);
    assert.equal(storage.saveGame(game, 'manual'), false);
    assert.equal(storage.savedInfo('manual').day, 10);
    assert.equal(storage.loadSaved('manual').state.day, 10);
    storage.savePrefs({ locale: 'en' });
    assert.deepEqual(storage.loadPrefs(), { locale: 'en' });
    storage.deleteSave('manual');
    assert.equal(storage.savedInfo('manual'), null);
  } finally {
    globalThis.window = real;
  }
});
