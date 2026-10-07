// Clock state: either the live wall clock or a frozen instant (from the
// ?frozendate= URL parameter), plus the colon's wall-clock step function.

import { TimeReadout } from '../models/timeReadout.js';

export class ClockModel {
  /** @param {{ frozenDate?: Date|null, nowFn?: () => number }} opts */
  constructor({ frozenDate = null, nowFn = Date.now } = {}) {
    this.frozenDate = frozenDate;
    this.nowFn = nowFn;
  }

  get isFrozen() { return this.frozenDate !== null; }

  /** Current display instant. Frozen dates never advance. */
  get now() {
    return this.isFrozen ? new Date(this.frozenDate.getTime()) : new Date(this.nowFn());
  }

  readouts(cities, instant = this.now) {
    return cities.map((c) => TimeReadout.make(instant, c.timeZone));
  }

  /**
   * Milliseconds until the next wall-clock minute boundary — when any
   * displayed digit can next change. Lets the app schedule one timeout
   * instead of polling every second.
   */
  msUntilNextMinute(epochMs = this.nowFn()) {
    return 60_000 - (((epochMs % 60_000) + 60_000) % 60_000);
  }
}

/**
 * Colon step function: lit for the first half of every wall-clock
 * second, unlit for the second half. Driven from the real time (not an
 * animation start) so the tick stays phase-locked to :00, :01, …
 * The colon keeps ticking even when the date is frozen, as in the app.
 */
export function isColonLit(epochMs) {
  const phase = ((epochMs % 1000) + 1000) % 1000;
  return phase < 500;
}
