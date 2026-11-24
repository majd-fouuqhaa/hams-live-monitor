import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

// One shared ticker for every timestamp on screen, not one interval per row.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current time, refreshed every 30 s for all subscribers at once. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}

type Unit = "minute" | "hour" | "day" | "week" | "month" | "year";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Elapsed time as one whole number in the coarsest unit that is at least 1 ("90 min" → 1 hour), rounding
 * down. Intl formats a (value, unit) pair but does not choose the unit, so this does. null means under a
 * minute. A time in the future (e.g. the server's clock is ahead) counts as zero elapsed, so "now".
 */
function elapsedInLargestUnit(ms: number): { value: number; unit: Unit } | null {
  const elapsed = Math.max(0, ms);
  if (elapsed < MINUTE_MS) return null;
  if (elapsed < HOUR_MS) return { value: Math.floor(elapsed / MINUTE_MS), unit: "minute" };
  if (elapsed < DAY_MS) return { value: Math.floor(elapsed / HOUR_MS), unit: "hour" };
  const days = Math.floor(elapsed / DAY_MS);
  if (days < 7) return { value: days, unit: "day" };
  if (days < 35) return { value: Math.floor(days / 7), unit: "week" };
  if (days < 365) return { value: Math.floor(days / 30), unit: "month" };
  return { value: Math.floor(days / 365), unit: "year" };
}

// Intl formatters are costly to build and every row formats every 30 s: build each one once and reuse it.
const formatters = new Map<
  string,
  Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.DateTimeFormat
>();

function cached<T extends Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.DateTimeFormat>(
  key: string,
  create: () => T,
): T {
  let formatter = formatters.get(key) as T | undefined;
  if (!formatter) formatters.set(key, (formatter = create()));
  return formatter;
}

const relativeFormat = (locale: string | undefined) =>
  cached(`relative|${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));

const unitFormat = (locale: string | undefined, unit: Unit) =>
  cached(
    `unit|${locale}|${unit}`,
    () => new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }),
  );

const dateFormat = (locale: string | undefined, withYear: boolean) =>
  cached(
    `date|${locale}|${withYear}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(withYear && { year: "numeric" }),
      }),
  );

/**
 * Compact visible label: "now", "5m", "1h", "1d", "2w"; older than that, the date ("Oct 15", or
 * "Oct 20, 2025" in an earlier year). Months are never abbreviated: their narrow form ("3m") would read as
 * minutes.
 */
export function formatShort(iso: string, nowMs: number, locale?: string): string {
  const time = Date.parse(iso);
  const span = elapsedInLargestUnit(nowMs - time);

  if (!span) return relativeFormat(locale).format(0, "second");
  if (span.unit === "month" || span.unit === "year") {
    const sameYear = new Date(time).getFullYear() === new Date(nowMs).getFullYear();
    return dateFormat(locale, !sameYear).format(time);
  }
  return unitFormat(locale, span.unit).format(span.value);
}

/** Spoken label for screen readers: "now", "5 minutes ago", "yesterday", "3 months ago". */
export function formatLong(iso: string, nowMs: number, locale?: string): string {
  const span = elapsedInLargestUnit(nowMs - Date.parse(iso));
  const rtf = relativeFormat(locale);

  return span ? rtf.format(-span.value, span.unit) : rtf.format(0, "second");
}
