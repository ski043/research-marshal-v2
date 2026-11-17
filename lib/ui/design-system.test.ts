import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, oklchToLinearSrgb, parseOklch } from "./color";
import {
  COLOR_ROLES,
  DURATION_ROLES,
  designSystem,
  EASING_ROLES,
  FULL_RADIUS,
  fontSizeOf,
  formatRatio,
  readStylesheet,
  registryProblems,
  SHADOW_ROLES,
  SPACING_ROLES,
  TYPE_ROLES,
} from "./design-system";
import {
  TOKENS_COMMAND,
  TOKENS_FILE,
  tokensMarkdown,
} from "./design-system-markdown";
import { readGlobalsCss } from "./design-system-source";

const css = readGlobalsCss();
const system = designSystem(css);

describe("the roles and the stylesheet", () => {
  it("give every token of app/globals.css a role, and every role a token", () => {
    expect(registryProblems(css)).toEqual([]);
  });

  it("report a token that has no role", () => {
    const more = css.replace(
      "--radius: 0.625rem;",
      "--radius: 0.625rem;\n  --brand-new: oklch(0.5 0.1 20);",
    );
    expect(registryProblems(more)).toEqual([
      "--brand-new is in app/globals.css and has no role in lib/ui/design-system.ts",
    ]);
  });

  it("report a role whose token is gone, and a colour that .dark leaves out", () => {
    const less = css.replaceAll(/^\s*--highlight:.*$/gm, "");
    expect(registryProblems(less)).toContain(
      "--highlight has a role and is not declared in :root of app/globals.css",
    );
    const lightOnly = css.replace(/(\.dark \{[^}]*?)--link:[^;]+;/, "$1");
    expect(registryProblems(lightOnly)).toEqual([
      "--link is a colour and .dark does not spell it out",
    ]);
  });

  it("report a radius step that the theme block adds", () => {
    const more = css.replace(
      "--radius-lg: var(--radius);",
      "--radius-lg: var(--radius);\n  --radius-5xl: calc(var(--radius) * 3);",
    );
    expect(registryProblems(more)).toEqual([
      "--radius-5xl is in the theme block and has no role",
    ]);
  });

  it("refuse to build a model that is out of step", () => {
    expect(() => designSystem(css.replace("--scrim:", "--veil:"))).toThrow(
      /out of step/,
    );
  });
});

describe("the model", () => {
  it("has one colour for each colour of the stylesheet, in both themes", () => {
    const { declared } = readStylesheet(css);
    const colours = [...declared.dark].filter(([, value]) =>
      value.startsWith("oklch("),
    );
    expect(system.colors).toHaveLength(colours.length);
    expect(system.groups.flatMap((group) => group.tokens)).toHaveLength(
      COLOR_ROLES.length,
    );
  });

  it("writes each colour as the sRGB hex of its oklch value", () => {
    const value = (token: string) =>
      system.colors.find((color) => color.token === token)?.value;
    expect(value("--background")?.light.hex).toBe("#ffffff");
    // The approved sheet names the bridge orange #F2662B and the starlight #9DB2FF.
    expect(value("--primary")?.dark.hex).toBe("#f2662b");
    expect(value("--link")?.dark.hex).toBe("#9db2ff");
    expect(value("--scrim")?.dark).toMatchObject({
      hex: "#00000099",
      alpha: 0.6,
    });
  });

  it("measures each pair with the contrast of lib/ui/color.ts", () => {
    const { declared } = readStylesheet(css);
    const rgb = (theme: "light" | "dark", token: `--${string}`) =>
      oklchToLinearSrgb(parseOklch(declared[theme].get(token) ?? ""));
    const foreground = system.colors.find(
      (color) => color.token === "--foreground",
    );
    const onBackground = foreground?.checks.find(
      (check) => check.on === "--background",
    );
    for (const theme of ["light", "dark"] as const) {
      expect(onBackground?.ratio[theme]).toBe(
        contrast(rgb(theme, "--foreground"), rgb(theme, "--background")),
      );
    }
    expect(onBackground).toMatchObject({ kind: "text", floor: 4.5 });
  });

  it("cuts a ratio and never rounds it up to a pass", () => {
    expect(formatRatio(4.499)).toBe("4.49");
    expect(formatRatio(21)).toBe("21.00");
  });

  it("reads the size, the line height and the weight of a step from its classes", () => {
    const step = (id: string) => system.type.find((each) => each.id === id);
    expect(step("page-title")).toMatchObject({
      weight: 500,
      family: "sans",
      sizes: [
        { from: null, px: 24, lineHeightPx: 32 },
        { from: 640, px: 30, lineHeightPx: 37.5 },
      ],
    });
    expect(step("report-body")?.sizes).toEqual([
      { from: null, rem: 0.9375, px: 15, lineHeightPx: 28 },
    ]);
    expect(step("micro")?.sizes[0]).toMatchObject({
      px: 11,
      lineHeightPx: null,
    });
    expect(step("mono-detail")).toMatchObject({ family: "mono", weight: 400 });
  });

  it("derives each radius from --radius and its factor in the theme block", () => {
    const px = Object.fromEntries(
      system.radii.map((radius) => [radius.name, radius.px]),
    );
    expect(px).toMatchObject({ sm: 6, md: 8, lg: 10, xl: 14, "2xl": 18 });
  });
});

// The scale is a description of the app, so the app is where it is checked: a class
// that a component starts to use needs a step, and a step that nothing uses must go.
describe("the scale and the classes that the app uses", () => {
  const root = process.cwd();
  const OWN = ["app/designsystem", "components/design-system"];

  function sources(dir: string): string[] {
    return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(
      (entry) => {
        const file = `${dir}/${entry.name}`;
        if (OWN.includes(file)) return [];
        if (entry.isDirectory()) return sources(file);
        return /\.tsx?$/.test(file) && !file.endsWith(".test.ts") ? [file] : [];
      },
    );
  }

  const files = [...sources("app"), ...sources("components")].map((file) => ({
    file,
    text: readFileSync(path.join(root, file), "utf8"),
  }));

  /** Each match of `pattern` in the app, as its first group, with a file that has it. */
  function used(pattern: RegExp): Map<string, string> {
    const found = new Map<string, string>();
    for (const { file, text } of files) {
      for (const match of text.matchAll(pattern)) {
        const key = match[1] ?? match[0];
        if (!found.has(key)) found.set(key, file);
      }
    }
    return found;
  }

  const sorted = (values: Iterable<string | number>) =>
    [...new Set(values)].sort();
  const ofModel = (roles: readonly { className: string }[], prefix: string) =>
    sorted(roles.map((role) => role.className.slice(prefix.length)));

  it("has a type step for every font size, and no step without a use", () => {
    const sizeClass =
      /(?<![\w-])(text-(?:xs|sm|base|lg|\d?xl|\[[\d.]+rem\])(?:\/[\w.]+)?)/g;
    const inApp = new Map<number | null, string>();
    for (const [className, file] of used(sizeClass)) {
      const rem = fontSizeOf(className);
      if (!inApp.has(rem)) inApp.set(rem, `${className} in ${file}`);
    }
    expect(inApp.get(null), "a size the model cannot read").toBeUndefined();
    const inModel = system.type.flatMap((step) =>
      step.sizes.map((size) => size.rem),
    );
    expect(
      sorted(inApp.keys() as Iterable<number>),
      `font sizes in the app: ${[...inApp.values()].join("; ")}`,
    ).toEqual(sorted(inModel));
  });

  it("writes each type step with classes that a component has", () => {
    for (const step of TYPE_ROLES) {
      for (const className of step.className.split(" ")) {
        expect(
          files.some(({ text }) => text.includes(className)),
          `${step.id}: ${className}`,
        ).toBe(true);
      }
    }
  });

  it("has a use for every radius step, and no use for a step that is not there", () => {
    const inApp = used(
      /(?<![\w-])rounded(?:-[trblse]{1,2})?-(sm|md|lg|xl|\dxl|full)(?![\w-])/g,
    );
    const inModel = [
      ...system.radii.filter((radius) => radius.use !== null),
      FULL_RADIUS,
    ];
    expect(sorted(inApp.keys())).toEqual(ofModel(inModel, "rounded-"));
  });

  it("names every shadow, duration and easing", () => {
    expect(
      sorted(used(/(?<![\w-])shadow-(\d?x[sl]|sm|md|lg)(?![\w-])/g).keys()),
    ).toEqual(ofModel(SHADOW_ROLES, "shadow-"));
    expect(sorted(used(/(?<![\w-])duration-(\d+)/g).keys())).toEqual(
      ofModel(DURATION_ROLES, "duration-"),
    );
    expect(
      sorted(used(/(?<![\w-])ease-(in-out|in|out|linear|\[[^\]]+\])/g).keys()),
    ).toEqual(ofModel(EASING_ROLES, "ease-"));
  });

  it("finds no colour value written into a class, in the app or on the design system page", () => {
    const literal = /[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g;
    const everyFile = [
      ...files.map(({ file }) => file),
      ...OWN.flatMap((dir) => sources(dir)),
    ];
    const found = everyFile.flatMap((file) =>
      [...readFileSync(path.join(root, file), "utf8").matchAll(literal)].map(
        (match) => `${file}: ${match[0]}`,
      ),
    );

    expect(found).toEqual([]);
  });

  it("names only spacing that a component has", () => {
    for (const { className } of SPACING_ROLES) {
      expect(
        files.some(({ text }) =>
          new RegExp(
            `(?<![\\w-])${className.replace(".", "\\.")}(?![\\w.-])`,
          ).test(text),
        ),
        className,
      ).toBe(true);
    }
  });
});

describe("the generated reference of the design-system skill", () => {
  it(`is what ${TOKENS_COMMAND} writes`, () => {
    const committed = readFileSync(
      path.join(process.cwd(), TOKENS_FILE),
      "utf8",
    );
    expect(
      committed === tokensMarkdown(system),
      `${TOKENS_FILE} is stale. Run ${TOKENS_COMMAND} and commit the file.`,
    ).toBe(true);
  });

  it("says in its first line that it is generated, and by which command", () => {
    const [first = ""] = tokensMarkdown(system).split("\n");
    expect(first).toContain("Generated by");
    expect(first).toContain(TOKENS_COMMAND);
  });
});
