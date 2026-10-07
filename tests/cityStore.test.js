import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityStore, MemoryStorage, MAX_CITIES, STORAGE_KEY } from '../js/services/cityStore.js';
import { cityWithId, ALL_CITIES } from '../js/models/cityCatalog.js';

const ids = (store) => store.selected.map((c) => c.id);

test('new store uses the default three cities', () => {
  const store = new CityStore(new MemoryStorage());
  assert.deepEqual(ids(store), ['new_york', 'london', 'hong_kong']);
});

test('adding a city persists and appends', () => {
  const storage = new MemoryStorage();
  const store = new CityStore(storage);
  store.replace([cityWithId('london')]);
  store.add(cityWithId('tokyo'));
  assert.deepEqual(ids(store), ['london', 'tokyo']);
  assert.deepEqual(ids(new CityStore(storage)), ['london', 'tokyo']);
});

test('adding caps at three', () => {
  const store = new CityStore(new MemoryStorage());
  store.add(cityWithId('tokyo'));
  assert.equal(store.selected.length, 3);
  assert.equal(ids(store).includes('tokyo'), false);
});

test('adding skips duplicates', () => {
  const store = new CityStore(new MemoryStorage());
  store.replace([cityWithId('london')]);
  store.add(cityWithId('london'));
  assert.equal(store.selected.length, 1);
});

test('removeAt shrinks the list', () => {
  const store = new CityStore(new MemoryStorage());
  store.removeAt(1);
  assert.deepEqual(ids(store), ['new_york', 'hong_kong']);
});

test('move reorders', () => {
  const store = new CityStore(new MemoryStorage());
  store.move(2, 0);
  assert.deepEqual(ids(store), ['hong_kong', 'new_york', 'london']);
});

test('resetToDefaults restores the original three', () => {
  const store = new CityStore(new MemoryStorage());
  store.replace([cityWithId('tokyo')]);
  store.resetToDefaults();
  assert.deepEqual(ids(store), ['new_york', 'london', 'hong_kong']);
});

test('availableToAdd excludes selected cities', () => {
  const store = new CityStore(new MemoryStorage());
  const available = store.availableToAdd.map((c) => c.id);
  assert.equal(available.includes('new_york'), false);
  assert.ok(available.includes('tokyo'));
});

test('replace truncates to the maximum', () => {
  const store = new CityStore(new MemoryStorage());
  store.replace([...ALL_CITIES]);
  assert.equal(store.selected.length, MAX_CITIES);
});

test('corrupt or unknown persisted data falls back to defaults', () => {
  for (const raw of ['not json', '[]', '["atlantis"]', '{"a":1}']) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    assert.deepEqual(ids(new CityStore(storage)), ['new_york', 'london', 'hong_kong'], raw);
  }
});

test('subscribers are notified on every mutation', () => {
  const store = new CityStore(new MemoryStorage());
  let calls = 0;
  store.subscribe(() => calls++);
  store.removeAt(0);
  store.add(cityWithId('tokyo'));
  store.move(0, 1);
  store.resetToDefaults();
  assert.equal(calls, 4);
});
