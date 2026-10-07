// The six values one Time Circuits row displays for one city at one
// instant, in that city's local time: 3-letter month, day, 4-digit year,
// 12-hour hour, minute, and AM/PM.
//
// Timezone maths is delegated to Intl.DateTimeFormat (the browser's ICU
// tz database), so DST transitions are handled for us.

export const MONTH_ABBREVIATIONS = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]);

// Constructing an Intl.DateTimeFormat is expensive (ICU setup); the clock
// asks for the same three zones every tick, so cache one per zone.
const formatterCache = new Map();

function formatterFor(timeZone) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/**
 * Returns `timeZone` if the runtime knows it, otherwise 'UTC'. A missing
 * tz entry should never take the clock down.
 */
export function resolveTimeZone(timeZone) {
  try {
    formatterFor(timeZone);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

const pad = (n, width) => String(n).padStart(width, '0');

export class TimeReadout {
  constructor({ month, day, year, hour12, minute, isAM }) {
    this.month = month;
    this.day = day;
    this.year = year;
    this.hour12 = hour12;
    this.minute = minute;
    this.isAM = isAM;
    Object.freeze(this);
  }

  /**
   * Projects `instant` into its Gregorian representation in `timeZone`.
   * 24h → 12h: 0 and 12 both render as 12 (midnight = 12 AM, noon = 12 PM).
   * Month index is clamped so malformed input never throws.
   */
  static make(instant, timeZone) {
    const parts = {};
    for (const p of formatterFor(resolveTimeZone(timeZone)).formatToParts(instant)) {
      parts[p.type] = p.value;
    }
    const monthIndex = (Number(parts.month) || 1) - 1;
    const rawHour = (Number(parts.hour) || 0) % 24;
    const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
    return new TimeReadout({
      month: MONTH_ABBREVIATIONS[Math.max(0, Math.min(11, monthIndex))],
      day: Number(parts.day) || 1,
      year: Number(parts.year) || 1985,
      hour12,
      minute: Number(parts.minute) || 0,
      isAM: rawHour < 12,
    });
  }

  /** Fixed-width display strings — the panels never change width. */
  get dayDigits() { return pad(this.day, 2); }
  get yearDigits() { return pad(Math.max(0, Math.min(9999, this.year)), 4); }
  get hourDigits() { return pad(this.hour12, 2); }
  get minuteDigits() { return pad(this.minute, 2); }

  /** Month padded/truncated to exactly three characters. */
  get paddedMonth() { return (this.month + '   ').slice(0, 3); }

  equals(other) {
    return other instanceof TimeReadout
      && this.month === other.month && this.day === other.day
      && this.year === other.year && this.hour12 === other.hour12
      && this.minute === other.minute && this.isAM === other.isAM;
  }
}

/** Placeholder used defensively when a readout is missing. */
export const BLANK_READOUT = new TimeReadout({
  month: '   ', day: 0, year: 0, hour12: 0, minute: 0, isAM: true,
});
