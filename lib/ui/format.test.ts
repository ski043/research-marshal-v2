import { describe, expect, it } from "vitest";
import {
  dayLabel,
  formatClock,
  formatDateTime,
  formatDuration,
  greetingFor,
  groupByDay,
  plural,
  relativeTime,
} from "./format";

const at = (text: string) => new Date(text);

describe("formatDuration", () => {
  it.each([
    [0, "0ms"],
    [420, "420ms"],
    [999.6, "1000ms"],
    [1000, "1.0s"],
    [1640, "1.6s"],
    [9949, "9.9s"],
    [12_300, "12s"],
    [59_999, "59s"],
    [102_000, "1m 42s"],
    [3_723_000, "1h 02m"],
    [-5, "0ms"],
  ])("%d ms reads %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [7_900, "0:07"],
    [102_000, "1:42"],
    [3_723_000, "1:02:03"],
  ])("%d ms reads %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("history dates", () => {
  const now = at("2026-11-16T21:46:00");

  it("names today, yesterday and an earlier day", () => {
    expect(dayLabel(at("2026-11-16T00:05:00"), now)).toBe("Today");
    expect(dayLabel(at("2026-11-15T23:59:00"), now)).toBe("Yesterday");
    expect(dayLabel(at("2026-11-09T10:00:00"), now)).toBe("9 Nov");
    expect(dayLabel(at("2025-12-31T10:00:00"), now)).toBe("31 Dec 2025");
  });

  it("counts calendar days, not 24-hour spans", () => {
    expect(dayLabel(at("2026-11-15T21:50:00"), now)).toBe("Yesterday");
  });

  it("shows a relative time today and the clock time before", () => {
    expect(relativeTime(at("2026-11-16T21:45:40"), now)).toBe("now");
    expect(relativeTime(at("2026-11-16T21:34:00"), now)).toBe("12m");
    expect(relativeTime(at("2026-11-16T18:10:00"), now)).toBe("3h");
    expect(relativeTime(at("2026-11-15T09:05:00"), now)).toBe("09:05");
  });

  it("writes one fixed date format", () => {
    expect(formatDateTime(at("2026-11-06T07:04:00"))).toBe("6 Nov 2026, 07:04");
  });

  it("groups a newest-first list under one heading per day, in order", () => {
    const groups = groupByDay(
      [
        "2026-11-16T20:00:00",
        "2026-11-16T08:00:00",
        "2026-11-15T12:00:00",
        "2026-11-02T12:00:00",
      ],
      at,
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["2 Nov", 1],
    ]);
  });
});

describe("greetingFor", () => {
  it.each([
    [4, "Good evening"],
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("hour %d greets with %s", (hour, text) => {
    expect(greetingFor(hour)).toBe(text);
  });
});

describe("plural", () => {
  it("picks the form by the count", () => {
    expect(plural(1, "source")).toBe("1 source");
    expect(plural(0, "source")).toBe("0 sources");
    expect(plural(2, "search", "searches")).toBe("2 searches");
  });
});
