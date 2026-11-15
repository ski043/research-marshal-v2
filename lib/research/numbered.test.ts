import { describe, expect, it } from "vitest";
import { numberItems, pickByNumber } from "./numbered";

const list = numberItems(["a", "b", "c"]);

describe("numberItems", () => {
  it("numbers from 1 in list order", () => {
    expect(list).toEqual([
      { number: 1, item: "a" },
      { number: 2, item: "b" },
      { number: 3, item: "c" },
    ]);
  });
});

describe("pickByNumber", () => {
  it("keeps the model's order", () => {
    expect(pickByNumber(list, [3, 1])).toEqual({
      items: ["c", "a"],
      unknown: [],
    });
  });

  it("drops a repeated number", () => {
    expect(pickByNumber(list, [2, 2, 1, 2]).items).toEqual(["b", "a"]);
  });

  it("sends numbers outside the list to unknown and never to items", () => {
    expect(pickByNumber(list, [0, -1, 4, 2.5, 2])).toEqual({
      items: ["b"],
      unknown: [0, -1, 4, 2.5],
    });
  });
});
