import { describe, expect, it } from "vitest";
import {
  composite,
  contrast,
  inSrgbGamut,
  oklchToLinearSrgb,
  parseOklch,
  toHex,
} from "./color";
import { type ContrastKind, THEME_NAMES } from "./design-system";
import { loadDesignSystem } from "./design-system-source";

// The pairs come from the roles in lib/ui/design-system.ts: each colour names the
// surfaces that the components put it on.
const system = loadDesignSystem();

const pairs = (kind: ContrastKind) =>
  system.colors.flatMap((color) =>
    color.checks
      .filter((check) => check.kind === kind)
      .map((check) => [color.token, check.on, check] as const),
  );

describe.each(THEME_NAMES)("%s theme", (theme) => {
  it("keeps every colour token inside sRGB, so the maths is the colour on screen", () => {
    for (const color of system.colors) {
      const { css } = color.value[theme];
      expect(
        inSrgbGamut(oklchToLinearSrgb(parseOklch(css))),
        `${color.token}: ${css}`,
      ).toBe(true);
    }
  });

  it("puts text and shapes only on opaque colours", () => {
    const opaque = (token: string) =>
      system.colors.find((color) => color.token === token)?.value[theme].alpha;
    for (const color of system.colors) {
      if (color.checks.length > 0) expect(opaque(color.token)).toBe(1);
      for (const check of color.checks) expect(opaque(check.on)).toBe(1);
    }
  });

  it.each(pairs("text"))("text %s on %s reaches 4.5:1", (_text, _on, check) => {
    expect(check.ratio[theme]).toBeGreaterThanOrEqual(4.5);
  });

  it.each(pairs("non-text"))(
    "non-text %s on %s reaches 3:1",
    (_ui, _on, check) => {
      expect(check.ratio[theme]).toBeGreaterThanOrEqual(3);
    },
  );

  it("keeps text readable through the scrim behind a sheet", () => {
    const value = (token: string) => {
      const color = system.colors.find((each) => each.token === token);
      if (!color) throw new Error(`no colour ${token}`);
      return parseOklch(color.value[theme].css);
    };
    const scrim = value("--scrim");
    const dimmed = composite(
      oklchToLinearSrgb(scrim),
      scrim.alpha,
      oklchToLinearSrgb(value("--background")),
    );
    expect(
      contrast(oklchToLinearSrgb(value("--popover")), dimmed),
      "the sheet stands out from the dimmed page",
    ).toBeGreaterThan(1.15);
  });
});

describe("colour maths", () => {
  it("matches the WCAG reference values", () => {
    const white = oklchToLinearSrgb(parseOklch("oklch(1 0 0)"));
    const black = oklchToLinearSrgb(parseOklch("oklch(0 0 0)"));
    expect(contrast(white, black)).toBeCloseTo(21, 1);
    // #767676 on white is the textbook 4.54:1 pair.
    const grey = oklchToLinearSrgb(parseOklch("oklch(0.5659 0 0)"));
    expect(contrast(white, grey)).toBeCloseTo(4.54, 1);
  });

  it("reads alpha as a fraction or a percentage", () => {
    expect(parseOklch("oklch(1 0 0 / 10%)").alpha).toBeCloseTo(0.1);
    expect(parseOklch("oklch(1 0 0 / 0.4)").alpha).toBeCloseTo(0.4);
  });

  it("rejects a colour it cannot check", () => {
    expect(() => parseOklch("#fff")).toThrow();
  });

  it("writes a colour as sRGB hex, with its alpha when it has one", () => {
    const of = (value: string) => {
      const parsed = parseOklch(value);
      return toHex(oklchToLinearSrgb(parsed), parsed.alpha);
    };
    expect(of("oklch(1 0 0)")).toBe("#ffffff");
    expect(of("oklch(0 0 0)")).toBe("#000000");
    expect(of("oklch(0.5659 0 0)")).toBe("#767676");
    expect(of("oklch(0 0 0 / 60%)")).toBe("#00000099");
  });
});
