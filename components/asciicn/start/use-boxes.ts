"use client";

import { type RefObject, useEffect, useState } from "react";

/** A box in the `uv` space of a shader: x and y of the lower left corner, width, height. */
export type UvBox = readonly [number, number, number, number];

export type StartBoxes = {
  /** The greeting. */
  greeting: UvBox;
  /** The block of the greeting, the prompt box, the note and the chips. */
  column: UvBox;
  /** The free height above the greeting, in CSS pixels. */
  headroom: number;
};

const NONE: UvBox = [0, 0, 0, 0];
const EMPTY: StartBoxes = { greeting: NONE, column: NONE, headroom: 0 };

const same = (a: UvBox, b: UvBox) => a.every((value, i) => value === b[i]);

/**
 * Where the text of the start screen sits inside `canvas`, so a scene can thin out
 * behind it. The boxes follow every change of size.
 */
export function useStartBoxes(
  canvas: RefObject<HTMLElement | null>,
): StartBoxes {
  const [boxes, setBoxes] = useState(EMPTY);

  useEffect(() => {
    const root = canvas.current;
    const main = root?.closest("main");
    const greeting = main?.querySelector("h1");
    // The smallest block that holds both the greeting and the prompt box.
    const column = greeting?.closest("div:has(textarea)");
    if (!(root && main && greeting && column)) return;

    const toUv = (outer: DOMRect, inner: DOMRect): UvBox => [
      (inner.left - outer.left) / outer.width,
      (outer.bottom - inner.bottom) / outer.height,
      inner.width / outer.width,
      inner.height / outer.height,
    ];
    const measure = () => {
      const outer = root.getBoundingClientRect();
      if (!(outer.width && outer.height)) return;
      const next: StartBoxes = {
        greeting: toUv(outer, greeting.getBoundingClientRect()),
        column: toUv(outer, column.getBoundingClientRect()),
        headroom: Math.max(
          0,
          Math.round(greeting.getBoundingClientRect().top - outer.top),
        ),
      };
      setBoxes((last) =>
        same(last.greeting, next.greeting) &&
        same(last.column, next.column) &&
        last.headroom === next.headroom
          ? last
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [root, main, greeting, column])
      observer.observe(element);
    return () => observer.disconnect();
  }, [canvas]);

  return boxes;
}
