// The user's selected cities, persisted to localStorage.
//
// - Hard cap of 3 rows: the three-row display is the whole point, so
//   every mutation is clamped.
// - First visit seeds DEFAULT_SELECTION (New York · London · Hong Kong).
// - Row colour is derived from slot index by the renderer, not stored,
//   so reordering also recolours.
//
// Storage is injected (anything with getItem/setItem) so tests use an
// in-memory map instead of the browser's localStorage.

import { cityWithId, DEFAULT_SELECTION, ALL_CITIES } from '../models/cityCatalog.js';

export const STORAGE_KEY = 'bttfclock.selectedCityIds.v1';
export const MAX_CITIES = 3;

/** Minimal in-memory Storage, used by tests and as a fallback. */
export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/**
 * Returns window.localStorage when it works. Private browsing modes and
 * blocked site data can make it throw on access, so probe it first.
 */
export function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__bttfclock_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return new MemoryStorage();
  }
}

export class CityStore {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.listeners = new Set();
    this.selected = CityStore.load(storage) ?? [...DEFAULT_SELECTION];
  }

  /**
   * Decodes the persisted list. Returns null (→ defaults) when absent,
   * empty, unparseable, or nothing resolves against the catalog.
   */
  static load(storage) {
    let ids;
    try {
      ids = JSON.parse(storage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const cities = ids.map(cityWithId).filter(Boolean);
    return cities.length === 0 ? null : cities.slice(0, MAX_CITIES);
  }

  /** Called with the new selection after every mutation. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Wholesale replace (used by ?cities=). Truncated to MAX_CITIES. */
  replace(cities) {
    this.selected = cities.slice(0, MAX_CITIES);
    this.#commit();
  }

  /** Appends if there's room and it isn't already present; else no-op. */
  add(city) {
    if (this.selected.length >= MAX_CITIES) return;
    if (this.selected.some((c) => c.id === city.id)) return;
    this.selected = [...this.selected, city];
    this.#commit();
  }

  removeAt(index) {
    if (index < 0 || index >= this.selected.length) return;
    this.selected = this.selected.filter((_, i) => i !== index);
    this.#commit();
  }

  /** Moves the city at `from` so it ends up at index `to`. */
  move(from, to) {
    const n = this.selected.length;
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
    const next = [...this.selected];
    const [city] = next.splice(from, 1);
    next.splice(to, 0, city);
    this.selected = next;
    this.#commit();
  }

  resetToDefaults() {
    this.selected = [...DEFAULT_SELECTION];
    this.#commit();
  }

  /** Catalog cities not already selected — populates the add list. */
  get availableToAdd() {
    const chosen = new Set(this.selected.map((c) => c.id));
    return ALL_CITIES.filter((c) => !chosen.has(c.id));
  }

  #commit() {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.selected.map((c) => c.id)));
    } catch {
      // Quota or privacy-mode failure: keep working in memory.
    }
    for (const fn of this.listeners) fn(this.selected);
  }
}
