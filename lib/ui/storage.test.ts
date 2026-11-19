import { expect, it, vi } from "vitest";
import { readStored, writeStored } from "./storage";

function stubStorage(entries: Record<string, string>) {
  const state = { full: false };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => {
      if (state.full) throw new DOMException("full", "QuotaExceededError");
      entries[key] = value;
    },
  });
  return state;
}

it("shows a change that storage refused, over the older stored value", () => {
  const storage = stubStorage({ "test.refused": "light" });
  storage.full = true;

  writeStored("test.refused", "dark");

  expect(readStored("test.refused")).toBe("dark");
});

it("goes back to storage once a write succeeds", () => {
  const entries = { "test.recovered": "light" };
  const storage = stubStorage(entries);
  storage.full = true;
  writeStored("test.recovered", "dark");
  storage.full = false;

  writeStored("test.recovered", "system");
  entries["test.recovered"] = "light";

  expect(readStored("test.recovered")).toBe("light");
});

it("keeps a value for the page when storage refuses every read and write", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
  });

  writeStored("test.denied", "dark");

  expect(readStored("test.denied")).toBe("dark");
});
