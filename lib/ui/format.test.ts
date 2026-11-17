import { describe, expect, it } from "vitest";
import {
  ageLabel,
  formatClock,
  formatDateTime,
  formatDuration,
  greetingFor,
  groupByAge,
  plural,
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

  it.each([
    ["2026-11-16T00:05:00", "Today"],
    ["2026-11-15T23:59:00", "Yesterday"],
    ["2026-11-14T23:59:00", "Previous 7 days"],
    ["2026-11-09T00:00:00", "Previous 7 days"],
    ["2026-11-08T23:59:00", "Previous 30 days"],
    ["2026-10-17T00:00:00", "Previous 30 days"],
    ["2026-10-16T23:59:00", "October 2026"],
    ["2026-01-01T00:00:00", "January 2026"],
    ["2025-12-31T23:59:00", "2025"],
    ["2019-06-01T12:00:00", "2019"],
  ])("puts %s under %s", (date, label) => {
    expect(ageLabel(at(date), now)).toBe(label);
  });

  it("counts calendar days, not 24-hour spans", () => {
    expect(ageLabel(at("2026-11-15T21:50:00"), now)).toBe("Yesterday");
  });

  it("keeps a run with a clock ahead of this one under Today", () => {
    expect(ageLabel(at("2026-11-17T00:10:00"), now)).toBe("Today");
  });

  it("names a recent run by its span, not by last year, after New Year", () => {
    const january = at("2026-01-03T10:00:00");
    expect(ageLabel(at("2025-12-30T10:00:00"), january)).toBe(
      "Previous 7 days",
    );
    expect(ageLabel(at("2025-11-20T10:00:00"), january)).toBe("2025");
  });

  it("writes one fixed date format", () => {
    expect(formatDateTime(at("2026-11-06T07:04:00"))).toBe("6 Nov 2026, 07:04");
  });

  it("groups a newest-first list under one heading per age, in order", () => {
    const groups = groupByAge(
      [
        "2026-11-16T20:00:00",
        "2026-11-16T08:00:00",
        "2026-11-15T12:00:00",
        "2026-11-12T12:00:00",
        "2026-11-10T12:00:00",
        "2026-10-28T12:00:00",
        "2026-10-02T12:00:00",
        "2026-09-30T12:00:00",
        "2026-09-01T12:00:00",
        "2025-03-01T12:00:00",
        "2024-03-01T12:00:00",
      ],
      at,
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Previous 7 days", 2],
      ["Previous 30 days", 1],
      ["October 2026", 1],
      ["September 2026", 2],
      ["2025", 1],
      ["2024", 1],
    ]);
  });

  it("keeps one heading per age when the list is not sorted", () => {
    const groups = groupByAge(
      ["2026-11-16T20:00:00", "2026-11-15T12:00:00", "2026-11-16T08:00:00"],
      at,
      now,
    );
    expect(groups.map((g) => [g.label, g.items])).toEqual([
      ["Today", ["2026-11-16T20:00:00", "2026-11-16T08:00:00"]],
      ["Yesterday", ["2026-11-15T12:00:00"]],
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
