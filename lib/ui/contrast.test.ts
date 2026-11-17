import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  composite,
  contrast,
  inSrgbGamut,
  oklchToLinearSrgb,
  parseOklch,
  type Rgb,
} from "./color";

const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

function tokensOf(selector: string): Map<string, string> {
  const escaped = selector.replace(".", "\\.");
  const blocks = css.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "gm"));
  const tokens = new Map<string, string>();
  for (const [, body = ""] of blocks) {
    for (const [, name = "", value = ""] of body.matchAll(
      /(--[\w-]+)\s*:\s*([^;]+);/g,
    )) {
      tokens.set(name, value.replace(/\s+/g, " ").trim());
    }
  }
  return tokens;
}

const light = tokensOf(":root");
const THEMES = {
  light,
  dark: new Map([...light, ...tokensOf(".dark")]),
} as const;
type Theme = keyof typeof THEMES;

function raw(theme: Theme, name: string): string {
  const value = THEMES[theme].get(name);
  if (value === undefined) throw new Error(`${theme} has no token ${name}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias?.[1] ? raw(theme, alias[1]) : value;
}

/** The opaque colour of a token. A token with alpha is not a surface or a text colour. */
function color(theme: Theme, name: string): Rgb {
  const parsed = parseOklch(raw(theme, name));
  expect(parsed.alpha, `${theme} ${name} is opaque`).toBe(1);
  return oklchToLinearSrgb(parsed);
}

const SURFACES = [
  "--background",
  "--sidebar",
  "--card",
  "--popover",
  "--muted",
  "--accent",
  "--sidebar-accent",
] as const;

// Every text colour with every surface the components put it on.
const TEXT: readonly (readonly [text: string, on: readonly string[]])[] = [
  ["--foreground", SURFACES],
  ["--muted-foreground", SURFACES],
  ["--card-foreground", ["--card"]],
  ["--popover-foreground", ["--popover"]],
  ["--secondary-foreground", ["--secondary"]],
  ["--accent-foreground", ["--accent"]],
  ["--sidebar-foreground", ["--sidebar", "--sidebar-accent"]],
  ["--sidebar-accent-foreground", ["--sidebar-accent"]],
  // The primary button fills with the primary ink under the pointer.
  ["--primary-foreground", ["--primary", "--primary-ink"]],
  [
    "--primary-ink",
    [
      "--background",
      "--sidebar",
      "--card",
      "--popover",
      "--muted",
      "--accent",
      "--primary-soft",
    ],
  ],
  // Links of the report and the numbered chips of citations and claims.
  ["--link", ["--background", "--card", "--popover", "--muted", "--link-soft"]],
  [
    "--success",
    ["--background", "--card", "--popover", "--muted", "--success-soft"],
  ],
  // The bare word. On its soft surface a warning has its own text colour.
  ["--warning", ["--background", "--card", "--popover", "--muted"]],
  ["--warning-soft-foreground", ["--warning-soft"]],
  [
    "--destructive",
    ["--background", "--card", "--popover", "--muted", "--destructive-soft"],
  ],
];

// Focus rings, the borders of inputs, and fills that carry meaning without text.
const NON_TEXT: readonly (readonly [ui: string, on: readonly string[]])[] = [
  ["--ring", ["--background", "--sidebar", "--card", "--popover", "--muted"]],
  ["--sidebar-ring", ["--sidebar", "--sidebar-accent"]],
  ["--input", ["--background", "--sidebar", "--card"]],
  ["--primary", ["--background", "--sidebar", "--card"]],
  ["--ascii-ink", ["--background", "--sidebar", "--card"]],
  // The filled segments of the budget meters.
  ["--link", ["--background", "--card"]],
  // The quote marks of the citation popover, and the amber icons of the start screen.
  ["--highlight", ["--background", "--popover"]],
  // The other tinted icons of the example chips and of the budget pills.
  ...(["blue", "purple", "pink", "orange"] as const).map(
    (tone) => [`--ascii-color-${tone}`, ["--background"]] as const,
  ),
];

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  it("keeps every colour token inside sRGB, so the maths is the colour on screen", () => {
    for (const [name] of THEMES[theme]) {
      const value = raw(theme, name);
      if (!value.startsWith("oklch(")) continue;
      expect(
        inSrgbGamut(oklchToLinearSrgb(parseOklch(value))),
        `${name}: ${value}`,
      ).toBe(true);
    }
  });

  it.each(
    TEXT.flatMap(([text, on]) => on.map((surface) => [text, surface] as const)),
  )("text %s on %s reaches 4.5:1", (text, surface) => {
    expect(
      contrast(color(theme, text), color(theme, surface)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(
    NON_TEXT.flatMap(([ui, on]) => on.map((surface) => [ui, surface] as const)),
  )("non-text %s on %s reaches 3:1", (ui, surface) => {
    expect(
      contrast(color(theme, ui), color(theme, surface)),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps text readable through the scrim behind a sheet", () => {
    const scrim = parseOklch(raw(theme, "--scrim"));
    const dimmed = composite(
      oklchToLinearSrgb(scrim),
      scrim.alpha,
      color(theme, "--background"),
    );
    expect(
      contrast(color(theme, "--popover"), dimmed),
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
});
