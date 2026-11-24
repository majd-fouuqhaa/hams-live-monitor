import { describe, expect, it } from "vite-plus/test";
import { formatLong, formatShort } from "./relative-time";

// Noon UTC, so the calendar date is the same in every realistic local time zone.
const NOW = Date.parse("2026-11-24T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const both = (iso: string) => [formatShort(iso, NOW, "en"), formatLong(iso, NOW, "en")];

describe("relative time", () => {
  it("says now for anything under a minute", () => {
    expect(both(ago(40 * SECOND))).toEqual(["now", "now"]);
  });

  it("says now for a time slightly in the future (clock skew), instead of a negative span", () => {
    expect(both(ago(-5 * MINUTE))).toEqual(["now", "now"]);
  });

  it("uses the largest whole unit: minutes, hours, days", () => {
    expect(both(ago(5 * MINUTE))).toEqual(["5m", "5 minutes ago"]);
    expect(both(ago(90 * MINUTE))).toEqual(["1h", "1 hour ago"]);
    expect(both(ago(30 * HOUR))).toEqual(["1d", "yesterday"]);
  });

  it("counts weeks for the first month", () => {
    expect(both(ago(10 * DAY))).toEqual(["1w", "last week"]);
    expect(both(ago(20 * DAY))).toEqual(["2w", "2 weeks ago"]);
  });

  it("shows the date once it is older than a few weeks, since '3m' would also mean minutes", () => {
    expect(both("2026-10-15T12:00:00Z")).toEqual(["Oct 15", "last month"]);
    expect(both("2026-08-10T12:00:00Z")).toEqual(["Aug 10", "3 months ago"]);
  });

  it("adds the year for dates in an earlier year", () => {
    expect(both("2025-10-20T12:00:00Z")).toEqual(["Oct 20, 2025", "last year"]);
    expect(both("2023-06-01T12:00:00Z")).toEqual(["Jun 1, 2023", "3 years ago"]);
  });
});
