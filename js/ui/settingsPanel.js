// The CITIES panel: reorder, remove, add, reset. A native <dialog>, so
// focus trapping, Escape-to-close and the backdrop come for free.

import { rowColorForIndex } from '../models/rowColor.js';
import { cssRGB } from '../models/palette.js';
import { MAX_CITIES } from '../services/cityStore.js';

const ROW_NAMES = ['Destination', 'Present', 'Last departed'];

const timeFormatters = new Map();
function localTime(timeZone, instant) {
  let f = timeFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true });
    timeFormatters.set(timeZone, f);
  }
  return f.format(instant);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export class SettingsPanel {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {import('../services/cityStore.js').CityStore} store
   * @param {() => Date} now  instant used for the local-time previews
   */
  constructor(dialog, store, now) {
    this.dialog = dialog;
    this.store = store;
    this.now = now;
    this.query = '';

    this.selectedList = dialog.querySelector('[data-selected]');
    this.catalogList = dialog.querySelector('[data-catalog]');
    this.countLabel = dialog.querySelector('[data-count]');
    this.search = dialog.querySelector('[data-search]');
    this.fullNote = dialog.querySelector('[data-full]');

    dialog.querySelector('[data-close]').addEventListener('click', () => this.close());
    dialog.querySelector('[data-reset]').addEventListener('click', () => store.resetToDefaults());
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.#renderCatalog();
    });
    // Click on the backdrop (outside the panel box) closes.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) this.close();
    });

    store.subscribe(() => this.render());
    this.render();
  }

  get isOpen() { return this.dialog.open; }

  open() {
    if (this.isOpen) return;
    this.render();
    this.dialog.showModal();
  }

  close() {
    this.dialog.close();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  render() {
    this.#renderSelected();
    this.#renderCatalog();
  }

  #renderSelected() {
    const { selected } = this.store;
    const instant = this.now();
    this.countLabel.textContent = `${selected.length} of ${MAX_CITIES}`;
    this.selectedList.replaceChildren(...selected.map((city, i) => {
      const color = rowColorForIndex(i);
      const move = (to, label, glyph) => el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': `${label} ${city.displayName}`,
        disabled: to < 0 || to >= selected.length,
        onclick: () => this.#keepFocus(() => this.store.move(i, to), `[data-move="${to}-${city.id}"]`),
        'data-move': `${to}-${city.id}`,
      }, glyph);
      return el('li', { class: 'city-row' },
        el('span', {
          class: 'led',
          style: `--led: ${cssRGB(color.lit)}`,
          title: `${color.name} row · ${ROW_NAMES[i]}`,
        }),
        el('span', { class: 'city-name' },
          el('strong', {}, city.displayName),
          el('small', {}, `${localTime(city.timeZone, instant)} · ${city.timeZone.replace(/_/g, ' ')}`)),
        el('span', { class: 'row-actions' },
          move(i - 1, 'Move up', '▲'),
          move(i + 1, 'Move down', '▼'),
          el('button', {
            class: 'icon-btn remove',
            type: 'button',
            'aria-label': `Remove ${city.displayName}`,
            onclick: () => this.store.removeAt(i),
          }, '✕')));
    }));
    if (selected.length === 0) {
      this.selectedList.append(el('li', { class: 'empty' }, 'No cities selected — add one below.'));
    }
  }

  #renderCatalog() {
    const full = this.store.selected.length >= MAX_CITIES;
    this.fullNote.hidden = !full;
    const instant = this.now();
    const q = this.query;
    const matches = this.store.availableToAdd.filter((c) => !q
      || c.displayName.toLowerCase().includes(q)
      || c.timeZone.toLowerCase().includes(q));
    this.catalogList.replaceChildren(...matches.map((city) => el('li', {},
      el('button', {
        type: 'button',
        class: 'catalog-btn',
        disabled: full,
        onclick: () => this.store.add(city),
      },
      el('strong', {}, city.displayName),
      el('small', {}, localTime(city.timeZone, instant))))));
    if (matches.length === 0) {
      this.catalogList.append(el('li', { class: 'empty' }, 'No matching cities.'));
    }
  }

  /** Re-renders, then puts focus back on the equivalent control. */
  #keepFocus(action, selector) {
    action();
    const target = this.selectedList.querySelector(selector);
    if (target && !target.disabled) target.focus();
  }
}
