import { contrast, oklchToLinearSrgb, parseOklch, toHex } from "./color";

/**
 * The design system as data. `app/globals.css` holds every value; this module reads the
 * stylesheet and adds what a value cannot say about itself: its role, its usage rule and
 * the surfaces it must stay readable on. The page at `/designsystem`, the generated
 * `tokens.md` of the design-system skill and the contrast test all read this model.
 */

export const THEME_NAMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export type TokenName = `--${string}`;

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for a shape that carries meaning without text. */
export const CONTRAST_FLOOR = { text: 4.5, "non-text": 3 } as const;
export type ContrastKind = keyof typeof CONTRAST_FLOOR;

type Declarations = ReadonlyMap<TokenName, string>;

/** The body of the first top-level block that `opener` starts, nested blocks included. */
function blockBody(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) throw new Error(`the stylesheet has no block ${opener.source}`);
  const start = match.index + match[0].length;
  let depth = 1;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, i);
  }
  throw new Error(`the block ${opener.source} never closes`);
}

function declarationsOf(body: string): Declarations {
  const found = new Map<TokenName, string>();
  for (const [, name = "", value = ""] of body.matchAll(
    /(--[\w-]+)\s*:\s*([^;]+);/g,
  )) {
    found.set(name as TokenName, value.replace(/\s+/g, " ").trim());
  }
  return found;
}

export type Stylesheet = {
  /** The custom properties of `:root` and of `.dark`, as they are written. */
  declared: Readonly<Record<ThemeName, Declarations>>;
  /** The `@theme inline` block: what Tailwind turns into utilities. */
  theme: Declarations;
};

export function readStylesheet(css: string): Stylesheet {
  return {
    declared: {
      light: declarationsOf(blockBody(css, /^:root\s*\{/m)),
      dark: declarationsOf(blockBody(css, /^\.dark\s*\{/m)),
    },
    theme: declarationsOf(blockBody(css, /^@theme inline\s*\{/m)),
  };
}

export const COLOR_GROUPS = [
  {
    id: "surfaces",
    title: "Surfaces",
    rule: "Near-black in the dark theme with a trace of cool, white and cool greys in the light theme. A surface never carries meaning by its colour. Depth comes from the step between two surfaces and a hairline, not from a shadow.",
  },
  {
    id: "text",
    title: "Text",
    rule: "Two text colours do nearly all the work: the foreground and the quiet one. Each named pair exists so that a surface can change without its text failing.",
  },
  {
    id: "primary",
    title: "Primary",
    rule: "The orange of the bridge. Orange is rare: it marks the one main action of a screen, the thing that is running now, and the name. A button on orange has near-black text in the dark theme. Use the ink, not the fill, when orange is text.",
  },
  {
    id: "secondary",
    title: "Secondary",
    rule: "Starlight blue. Every link and every citation uses it, so a reader learns that blue leads to a source. It is never a status.",
  },
  {
    id: "highlight",
    title: "Highlight",
    rule: "Lamp amber, for a small detail that should glint: quote marks, one icon. It is never text and never the fill of a control.",
  },
  {
    id: "statuses",
    title: "Statuses",
    rule: "Green, dark yellow and red, the colours a reader already knows. A status always carries a word and an icon, so it reads without its colour. In the light theme yellow is a fill; as a bare word it is dark gold, because yellow fails as text on white.",
  },
  {
    id: "lines",
    title: "Borders and rings",
    rule: "A hairline is decoration and has no contrast floor. The edge of a control and every focus ring must be found, so they reach 3:1.",
  },
  {
    id: "ascii",
    title: "ASCII tints",
    rule: "The colours the scene is drawn in. The UI borrows them only as the tint of a small icon, never for text.",
  },
] as const;
export type ColorGroupId = (typeof COLOR_GROUPS)[number]["id"];

export type ColorRole = {
  token: TokenName;
  group: ColorGroupId;
  name: string;
  use: string;
  /** The surfaces this colour sits on as text. Each pair must reach 4.5:1. */
  text?: readonly TokenName[];
  /** The surfaces this colour sits on as a shape without text. Each pair must reach 3:1. */
  nonText?: readonly TokenName[];
};

// Every surface that body text is put on.
const SURFACES = [
  "--background",
  "--sidebar",
  "--card",
  "--popover",
  "--muted",
  "--accent",
  "--sidebar-accent",
] as const satisfies readonly TokenName[];

export const COLOR_ROLES: readonly ColorRole[] = [
  {
    token: "--background",
    group: "surfaces",
    name: "Page",
    use: "The ground of a page panel: the run, the report, a list.",
  },
  {
    token: "--sidebar",
    group: "surfaces",
    name: "Sidebar and frame",
    use: "The sidebar and the frame around the page panel. It is the colour of the body.",
  },
  {
    token: "--card",
    group: "surfaces",
    name: "Card",
    use: "A block that stands on the page: the prompt box, the budget card.",
  },
  {
    token: "--popover",
    group: "surfaces",
    name: "Popover",
    use: "Anything that floats above the page: the citation popover, a menu, a sheet.",
  },
  {
    token: "--muted",
    group: "surfaces",
    name: "Quiet fill",
    use: "A fill inside a surface: an open Activity row, a tab list, a source label, an empty meter segment.",
  },
  {
    token: "--accent",
    group: "surfaces",
    name: "Hover fill",
    use: "A row or a menu item under the pointer.",
  },
  {
    token: "--secondary",
    group: "surfaces",
    name: "Neutral button fill",
    use: "The fill of the secondary button. A neutral surface. The secondary colour of the palette is --link.",
  },
  {
    token: "--sidebar-accent",
    group: "surfaces",
    name: "Sidebar hover fill",
    use: "A row of the sidebar under the pointer or pressed, and the track of the theme switch.",
  },
  {
    token: "--scrim",
    group: "surfaces",
    name: "Scrim",
    use: "Dims the page behind a sheet. The only colour with alpha, and never a surface for text.",
  },

  {
    token: "--foreground",
    group: "text",
    name: "Text",
    use: "Headings and body text on every surface.",
    text: SURFACES,
  },
  {
    token: "--muted-foreground",
    group: "text",
    name: "Quiet text",
    use: "Captions, labels, metadata, placeholders and resting icons.",
    text: SURFACES,
  },
  {
    token: "--card-foreground",
    group: "text",
    name: "Text on a card",
    use: "Paired with --card.",
    text: ["--card"],
  },
  {
    token: "--popover-foreground",
    group: "text",
    name: "Text on a popover",
    use: "Paired with --popover.",
    text: ["--popover"],
  },
  {
    token: "--secondary-foreground",
    group: "text",
    name: "Text on the neutral button",
    use: "Paired with --secondary.",
    text: ["--secondary"],
  },
  {
    token: "--accent-foreground",
    group: "text",
    name: "Text on a hovered row",
    use: "Paired with --accent.",
    text: ["--accent"],
  },
  {
    token: "--sidebar-foreground",
    group: "text",
    name: "Text in the sidebar",
    use: "Rows, the wordmark and icons of the sidebar.",
    text: ["--sidebar", "--sidebar-accent"],
  },
  {
    token: "--sidebar-accent-foreground",
    group: "text",
    name: "Text on a hovered sidebar row",
    use: "Paired with --sidebar-accent.",
    text: ["--sidebar-accent"],
  },

  {
    token: "--primary",
    group: "primary",
    name: "Primary fill",
    use: "The fill of the main action of a screen, and of a citation chip under the pointer or the focus. One filled orange control per screen.",
    nonText: ["--background", "--sidebar", "--card"],
  },
  {
    token: "--primary-foreground",
    group: "primary",
    name: "Text on primary",
    use: "The label and the icon of a control filled with orange. Near-black in the dark theme: white on that orange is 3.1:1.",
    // The primary button fills with the primary ink under the pointer.
    text: ["--primary", "--primary-ink"],
  },
  {
    token: "--primary-ink",
    group: "primary",
    name: "Primary as text",
    use: "Orange as text or a thin stroke: Marshal in the wordmark, the glyph spinner, the clock of a running row, a link under the pointer. Also the primary button under the pointer.",
    text: [
      "--background",
      "--sidebar",
      "--card",
      "--popover",
      "--muted",
      "--accent",
      "--primary-soft",
    ],
  },
  {
    token: "--primary-soft",
    group: "primary",
    name: "Primary tint",
    use: "A faint orange surface for primary-ink text. Reserved: no component uses it yet.",
  },

  {
    token: "--link",
    group: "secondary",
    name: "Link and citation",
    use: "Links of the report, the numbers of citation and claim chips, and the filled segments of the budget meters.",
    text: ["--background", "--card", "--popover", "--muted", "--link-soft"],
    nonText: ["--background", "--card"],
  },
  {
    token: "--link-soft",
    group: "secondary",
    name: "Citation chip fill",
    use: "The resting fill of a citation chip and of a claim number.",
  },

  {
    token: "--highlight",
    group: "highlight",
    name: "Highlight",
    use: "The quote marks of the citation popover and the amber icons of the start screen.",
    nonText: ["--background", "--popover"],
  },

  {
    token: "--success",
    group: "statuses",
    name: "Success",
    use: "A step that went well, as a quiet word or an icon: read, answered, completed.",
    // A status word also sits on the accent of a hovered row.
    text: [
      "--background",
      "--card",
      "--popover",
      "--muted",
      "--accent",
      "--success-soft",
    ],
  },
  {
    token: "--success-soft",
    group: "statuses",
    name: "Success pill",
    use: "The surface of a success pill. Reserved: success is a bare word today.",
  },
  {
    token: "--warning",
    group: "statuses",
    name: "Warning as a word",
    use: "A shortfall as a bare word. Dark gold in the light theme, the yellow itself in the dark theme.",
    text: ["--background", "--card", "--popover", "--muted"],
  },
  {
    token: "--warning-fill",
    group: "statuses",
    name: "Warning as a fill",
    use: "The yellow dot before a caution. The same yellow in both themes, and never text.",
  },
  {
    token: "--warning-soft",
    group: "statuses",
    name: "Warning pill",
    use: "The surface of a warning pill: no results, not answered, cancelled.",
  },
  {
    token: "--warning-soft-foreground",
    group: "statuses",
    name: "Text on the warning pill",
    use: "The word and the icon on --warning-soft.",
    text: ["--warning-soft"],
  },
  {
    token: "--destructive",
    group: "statuses",
    name: "Failure",
    use: "A failure as a word, an icon or the ring of a failed row, and the destructive button.",
    text: [
      "--background",
      "--card",
      "--popover",
      "--muted",
      "--destructive-soft",
    ],
  },
  {
    token: "--destructive-soft",
    group: "statuses",
    name: "Failure pill",
    use: "The surface of a failure pill and of an error message.",
  },

  {
    token: "--border",
    group: "lines",
    name: "Hairline",
    use: "The edge of a card, a divider, the spine of the Activity list. Decoration, so it has no floor.",
  },
  {
    token: "--input",
    group: "lines",
    name: "Control edge",
    use: "The edge of a control that must be found: a hovered chip, the bar of a quote, an outlined button in the dark theme.",
    nonText: ["--background", "--sidebar", "--card"],
  },
  {
    token: "--ring",
    group: "lines",
    name: "Focus ring",
    use: "The focus outline of every control on a page surface.",
    nonText: ["--background", "--sidebar", "--card", "--popover", "--muted"],
  },
  {
    token: "--sidebar-border",
    group: "lines",
    name: "Sidebar hairline",
    use: "A divider inside the sidebar. Reserved: the sidebar has no divider today.",
  },
  {
    token: "--sidebar-ring",
    group: "lines",
    name: "Sidebar focus ring",
    use: "The focus outline of a control in the sidebar.",
    nonText: ["--sidebar", "--sidebar-accent"],
  },

  {
    token: "--ascii-ink",
    group: "ascii",
    name: "Glyph ink",
    use: "The colour of a glyph when a canvas names no other. Equal to --link.",
    nonText: ["--background", "--sidebar", "--card"],
  },
  {
    token: "--ascii-paper",
    group: "ascii",
    name: "Glyph paper",
    use: "The surface behind the glyphs. Equal to --background.",
  },
  {
    token: "--ascii-color-blue",
    group: "ascii",
    name: "Starlight",
    use: "The stars of the scene. Tints an icon of an example chip and of a budget pill.",
    nonText: ["--background"],
  },
  {
    token: "--ascii-color-purple",
    group: "ascii",
    name: "Violet",
    use: "The dusk of the scene. Tints an icon of an example chip and of a budget pill.",
    nonText: ["--background"],
  },
  {
    token: "--ascii-color-green",
    group: "ascii",
    name: "Green",
    use: "A colour of the asciicn palette. No part of the UI uses it.",
  },
  {
    token: "--ascii-color-pink",
    group: "ascii",
    name: "Rose",
    use: "The afterglow of the scene. Tints an icon of an example chip.",
    nonText: ["--background"],
  },
  {
    token: "--ascii-color-orange",
    group: "ascii",
    name: "Bridge orange",
    use: "The lit steel of the bridge. Tints an icon of an example chip and of a budget pill.",
    nonText: ["--background"],
  },
  {
    token: "--ascii-color-red",
    group: "ascii",
    name: "Red",
    use: "A colour of the asciicn palette. No part of the UI uses it.",
  },
  {
    token: "--ascii-color-grey",
    group: "ascii",
    name: "Grey",
    use: "A colour of the asciicn palette. No part of the UI uses it.",
  },
];

/** The custom properties of the stylesheet that are not colours. */
export const SETTING_ROLES: readonly {
  token: TokenName;
  name: string;
  use: string;
}[] = [
  {
    token: "--radius",
    name: "Base radius",
    use: "Every radius of the scale is a multiple of it.",
  },
  {
    token: "--ascii-cell",
    name: "Glyph cell",
    use: "The default size of one glyph cell of an ASCII canvas.",
  },
  {
    token: "--ascii-font",
    name: "Glyph font",
    use: "The monospace stack an ASCII canvas draws its glyphs with.",
  },
  {
    token: "--ascii-glow",
    name: "Glyph glow",
    use: "How far a glyph glows, from 0 to 1. Stronger on the dark paper.",
  },
  {
    token: "--ascii-bloom",
    name: "Glyph bloom",
    use: "Follows --ascii-glow.",
  },
];

/** One step of the radius scale. `use` is null for a step that no component uses. */
export const RADIUS_ROLES: Readonly<Record<string, string | null>> = {
  sm: "The focus outline of an inline link, a keyboard key.",
  md: "A chip inside a line of text: the citation chip, a source label, a segment of a switch.",
  lg: "The default: a button, a row, a menu, a popover.",
  xl: "A card inside a panel: the budget card, an error message, the citation popover.",
  "2xl": "The largest: the page panel and the prompt box.",
  "3xl": null,
  "4xl": null,
};

export const FULL_RADIUS = {
  className: "rounded-full",
  use: "A pill or a dot: a suggestion chip, a status pill, the send button, a meter segment.",
} as const;

export type TypeRole = {
  id: string;
  job: string;
  /** The classes of the step, exactly as the components write them. */
  className: string;
  where: string;
  sample: string;
};

export const TYPE_ROLES: readonly TypeRole[] = [
  {
    id: "page-title",
    job: "Page title",
    className:
      "text-2xl font-medium tracking-tight sm:text-[1.875rem] sm:leading-tight",
    where: "The greeting of the start screen. It grows from 640px.",
    sample: "Good evening",
  },
  {
    id: "report-title",
    job: "Report title",
    className: "text-2xl font-semibold tracking-tight",
    where: "The first heading of a report.",
    sample: "Sodium-ion batteries for grid storage",
  },
  {
    id: "notice-title",
    job: "Notice title",
    className: "text-xl font-semibold tracking-tight",
    where:
      "The heading of a run without a report: cancelled, failed, not found.",
    sample: "Run not found",
  },
  {
    id: "report-heading",
    job: "Report heading",
    className: "text-lg font-semibold tracking-tight",
    where: "A section of a report. The wordmark has the same size.",
    sample: "What the trials measured",
  },
  {
    id: "report-subheading",
    job: "Report subheading",
    className: "text-base font-semibold",
    where: "A subsection of a report, and the title of a sheet.",
    sample: "Cycle life at 25 °C",
  },
  {
    id: "report-body",
    job: "Report body",
    className: "text-[0.9375rem]/7",
    where: "The running text of a report: long lines, read for minutes.",
    sample:
      "Every fact in the report carries a quote that was checked on its page.",
  },
  {
    id: "input",
    job: "Input",
    className: "text-base/6 sm:text-sm/6",
    where:
      "The prompt box. 16px below 640px, so a phone does not zoom into the field.",
    sample: "Are sodium-ion batteries ready for grid storage?",
  },
  {
    id: "body",
    job: "Body",
    className: "text-sm",
    where:
      "The text of the interface: a button, a row, a claim, a message. Medium weight for a control.",
    sample: "The run has finished. The report is ready.",
  },
  {
    id: "label",
    job: "Label",
    className: "text-xs font-medium",
    where: "A name that stands for something: a tab, a status pill, a badge.",
    sample: "Budget",
  },
  {
    id: "caption",
    job: "Caption",
    className: "text-xs text-muted-foreground",
    where: "A line that explains: a hint, the detail of a row, metadata.",
    sample: "4 searches planned, 1 dropped by the budget",
  },
  {
    id: "small-button",
    job: "Small button",
    className: "text-[0.8rem] font-medium",
    where: "The small size of the button, and nothing else.",
    sample: "Re-run",
  },
  {
    id: "micro",
    job: "Micro",
    className: "text-[0.6875rem] font-medium",
    where:
      "The number of a citation or claim chip, in mono, and the one overline of the budget card.",
    sample: "THIS ROUND",
  },
  {
    id: "mono-detail",
    job: "Mono detail",
    className: "font-mono text-xs tabular-nums",
    where:
      "A machine fact: a query, a URL, a domain, a duration, a count, the name of a step.",
    sample: "search  site:example.org sodium-ion cycle life  1.6s",
  },
];

export const FONT_ROLES = [
  {
    variable: "--font-sans",
    className: "font-sans",
    name: "Geist",
    use: "Everything a person reads: headings, the report, labels.",
  },
  {
    variable: "--font-mono",
    className: "font-mono",
    name: "Geist Mono",
    use: "Machine facts only: queries, URLs, domains, durations, counts and step names. Add tabular-nums to a number that changes.",
  },
] as const;

export const SHADOW_ROLES: readonly { className: string; use: string }[] = [
  {
    className: "shadow-xs",
    use: "The page panel, the prompt box and the chosen segment of a switch. Barely there: the border does the work.",
  },
  {
    className: "shadow-sm",
    use: "The chosen tab of a tab list.",
  },
  {
    className: "shadow-md",
    use: "A popover or a menu, together with a 1px ring of the foreground at 10%.",
  },
  {
    className: "shadow-lg",
    use: "A sheet that slides over the page.",
  },
];

export const SPACING_ROLES: readonly { className: string; use: string }[] = [
  { className: "gap-1.5", use: "An icon and its label." },
  {
    className: "gap-2",
    use: "Items of one row, and chips next to each other.",
  },
  { className: "gap-3", use: "Blocks of one card, and rows of a list." },
  { className: "px-3", use: "The inner edge of a card, a panel and a header." },
  {
    className: "h-7",
    use: "A small control: the small button, a tab, a pill.",
  },
  {
    className: "h-8",
    use: "The default control: a button, a suggestion chip.",
  },
  { className: "h-9", use: "A row of the sidebar and its search field." },
  { className: "h-13", use: "The header of a page and of the progress panel." },
  { className: "max-w-2xl", use: "The text column of the start screen." },
];

export const DURATION_ROLES: readonly { className: string; use: string }[] = [
  {
    className: "duration-100",
    use: "A popover that opens or closes.",
  },
  {
    className: "duration-150",
    use: "A change under the pointer: colour, fill, border, the press of a chip.",
  },
  {
    className: "duration-200",
    use: "Something that moves or arrives: a new Activity row, an open row, the width of the sidebar.",
  },
  {
    className: "duration-300",
    use: "A screen that enters: the greeting, a notice, one cell of a dithered glyph.",
  },
  {
    className: "duration-400",
    use: "The slowest step: the suggestion chips, one after the other, 30ms apart, and a dot of the waiting bridge as it lights.",
  },
];

export const EASING_ROLES: readonly { className: string; use: string }[] = [
  {
    className: "ease-out",
    use: "The default. Motion starts at once and settles.",
  },
  {
    className: "ease-[cubic-bezier(0.23,1,0.32,1)]",
    use: "A longer way in that needs a soft landing: the suggestion chips, the rotating placeholder.",
  },
];

export type ColorValue = {
  /** The value as the stylesheet writes it. */
  css: string;
  hex: string;
  alpha: number;
};

export type ContrastCheck = {
  on: TokenName;
  kind: ContrastKind;
  floor: number;
  ratio: Readonly<Record<ThemeName, number>>;
};

export type ColorToken = ColorRole & {
  value: Readonly<Record<ThemeName, ColorValue>>;
  checks: readonly ContrastCheck[];
};

export type Radius = {
  name: string;
  className: string;
  rem: number;
  px: number;
  use: string | null;
};

export type TypeSize = {
  /** The width from which the size holds, in px. Null for the base size. */
  from: number | null;
  rem: number;
  px: number;
  /** Null when the step sets no line height and takes the one around it. */
  lineHeightPx: number | null;
};

export type TypeStep = TypeRole & {
  family: "sans" | "mono";
  weight: number;
  sizes: readonly TypeSize[];
};

export type Utility = {
  className: string;
  use: string;
  /** What the class comes to, where its name says so. */
  value: string | null;
};

export type DesignSystem = {
  colors: readonly ColorToken[];
  groups: readonly {
    id: ColorGroupId;
    title: string;
    rule: string;
    tokens: readonly ColorToken[];
  }[];
  settings: readonly {
    token: TokenName;
    name: string;
    use: string;
    value: Readonly<Record<ThemeName, string>>;
  }[];
  radii: readonly Radius[];
  fullRadius: typeof FULL_RADIUS;
  fonts: typeof FONT_ROLES;
  type: readonly TypeStep[];
  shadows: readonly Utility[];
  spacing: readonly Utility[];
  durations: readonly Utility[];
  easings: readonly Utility[];
  /** The one long loop: the placeholder of the prompt box, from the theme block. */
  placeholderAnimation: string;
};

const ROOT_PX = 16;
const SM_PX = 640;

// The sizes of Tailwind's default theme: font size and line height in rem.
const TEXT_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  xs: [0.75, 1],
  sm: [0.875, 1.25],
  base: [1, 1.5],
  lg: [1.125, 1.75],
  xl: [1.25, 1.75],
  "2xl": [1.5, 2],
};
const LEADING: Readonly<Record<string, number>> = {
  none: 1,
  tight: 1.25,
  relaxed: 1.625,
};
const WEIGHTS: Readonly<Record<string, number>> = {
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
};

const TEXT_CLASS =
  /^text-(?:(xs|sm|base|lg|xl|2xl)|\[([\d.]+)rem\])(?:\/([\w.]+))?$/;

/** The font size in rem of a `text-*` class, or null when the class sets a colour. */
export function fontSizeOf(className: string): number | null {
  const match = TEXT_CLASS.exec(className);
  if (!match) return null;
  const [, named, arbitrary] = match;
  return named ? (TEXT_SIZES[named]?.[0] ?? null) : Number(arbitrary);
}

function lineHeightOf(key: string, rem: number): number {
  const ratio = LEADING[key];
  // A bare number is a multiple of the 4px spacing unit.
  return ratio === undefined ? Number(key) * 4 : ratio * rem * ROOT_PX;
}

function typeSizes(className: string): TypeSize[] {
  const sizes: TypeSize[] = [];
  for (const breakpoint of [null, SM_PX] as const) {
    const prefix = breakpoint === null ? "" : "sm:";
    const classes = className
      .split(" ")
      .filter((each) => each.startsWith("sm:") === (breakpoint !== null))
      .map((each) => each.slice(prefix.length));
    const match = classes
      .map((each) => TEXT_CLASS.exec(each))
      .find((each) => each !== null);
    if (!match) continue;
    const [, named, arbitrary, slash] = match;
    const rem = named ? (TEXT_SIZES[named]?.[0] ?? 0) : Number(arbitrary);
    const leading = classes
      .find((each) => each.startsWith("leading-"))
      ?.slice("leading-".length);
    const key = slash ?? leading;
    sizes.push({
      from: breakpoint,
      rem,
      px: rem * ROOT_PX,
      lineHeightPx:
        key !== undefined
          ? lineHeightOf(key, rem)
          : named
            ? (TEXT_SIZES[named]?.[1] ?? 0) * ROOT_PX
            : null,
    });
  }
  return sizes;
}

function typeStep(role: TypeRole): TypeStep {
  const classes = role.className.split(" ");
  const weight = classes.map((each) => WEIGHTS[each]).find(Boolean) ?? 400;
  return {
    ...role,
    family: classes.includes("font-mono") ? "mono" : "sans",
    weight,
    sizes: typeSizes(role.className),
  };
}

/** What a class comes to, for the classes whose name is their value. */
function utilityValue(className: string): string | null {
  const duration = /^duration-(\d+)$/.exec(className);
  if (duration) return `${duration[1]}ms`;
  const curve = /^ease-\[(.+)\]$/.exec(className);
  if (curve?.[1]) return curve[1].replace(/,/g, ", ");
  const step = /^(?:gap|px|h)-([\d.]+)$/.exec(className);
  if (step) return `${Number(step[1]) * 4}px`;
  return null;
}

const utilities = (roles: readonly { className: string; use: string }[]) =>
  roles.map((role) => ({ ...role, value: utilityValue(role.className) }));

function colorValue(css: string): ColorValue {
  const parsed = parseOklch(css);
  return {
    css,
    hex: toHex(oklchToLinearSrgb(parsed), parsed.alpha),
    alpha: parsed.alpha,
  };
}

const radiusTokens = (sheet: Stylesheet) =>
  [...sheet.theme].filter(([name]) => name.startsWith("--radius-"));

/**
 * Where the stylesheet and the roles disagree. Empty when every token has a role, every
 * role has a token, and every colour is written out for both themes.
 */
export function registryProblems(css: string): string[] {
  const sheet = readStylesheet(css);
  const problems: string[] = [];
  const known = new Set<TokenName>([
    ...COLOR_ROLES.map((role) => role.token),
    ...SETTING_ROLES.map((role) => role.token),
  ]);
  const declared = new Set([
    ...sheet.declared.light.keys(),
    ...sheet.declared.dark.keys(),
  ]);
  for (const token of declared) {
    if (!known.has(token))
      problems.push(
        `${token} is in app/globals.css and has no role in lib/ui/design-system.ts`,
      );
  }
  for (const token of known) {
    if (!sheet.declared.light.has(token))
      problems.push(
        `${token} has a role and is not declared in :root of app/globals.css`,
      );
  }
  for (const { token } of COLOR_ROLES) {
    for (const theme of THEME_NAMES) {
      const value = sheet.declared[theme].get(token);
      if (value === undefined) {
        if (theme === "dark")
          problems.push(`${token} is a colour and .dark does not spell it out`);
      } else if (!value.startsWith("oklch(")) {
        problems.push(
          `${token} in ${theme} is not an oklch() colour: ${value}`,
        );
      }
    }
  }
  const surfaces = new Set(COLOR_ROLES.map((role) => role.token));
  for (const role of COLOR_ROLES) {
    for (const on of [...(role.text ?? []), ...(role.nonText ?? [])]) {
      if (!surfaces.has(on))
        problems.push(`${role.token} is checked on ${on}, which has no role`);
    }
  }
  const steps = new Set(
    radiusTokens(sheet).map(([name]) => name.slice("--radius-".length)),
  );
  for (const step of steps) {
    if (!(step in RADIUS_ROLES))
      problems.push(`--radius-${step} is in the theme block and has no role`);
  }
  for (const step of Object.keys(RADIUS_ROLES)) {
    if (!steps.has(step))
      problems.push(
        `the radius ${step} has a role and no --radius-${step} in the theme block`,
      );
  }
  return problems;
}

export function designSystem(css: string): DesignSystem {
  const problems = registryProblems(css);
  if (problems.length > 0)
    throw new Error(
      `The design system is out of step with app/globals.css:\n${problems.join("\n")}`,
    );
  const sheet = readStylesheet(css);
  const raw = (theme: ThemeName, token: TokenName): string => {
    const value =
      sheet.declared[theme].get(token) ?? sheet.declared.light.get(token);
    if (value === undefined) throw new Error(`${theme} has no token ${token}`);
    return value;
  };
  const rgb = (theme: ThemeName, token: TokenName) =>
    oklchToLinearSrgb(parseOklch(raw(theme, token)));
  const ratios = (token: TokenName, on: TokenName) => ({
    light: contrast(rgb("light", token), rgb("light", on)),
    dark: contrast(rgb("dark", token), rgb("dark", on)),
  });

  const colors = COLOR_ROLES.map((role): ColorToken => {
    const checks = (["text", "non-text"] as const).flatMap((kind) =>
      ((kind === "text" ? role.text : role.nonText) ?? []).map((on) => ({
        on,
        kind,
        floor: CONTRAST_FLOOR[kind],
        ratio: ratios(role.token, on),
      })),
    );
    return {
      ...role,
      value: {
        light: colorValue(raw("light", role.token)),
        dark: colorValue(raw("dark", role.token)),
      },
      checks,
    };
  });

  const baseRem = Number.parseFloat(raw("light", "--radius"));
  const radii = radiusTokens(sheet).map(([name, value]): Radius => {
    const step = name.slice("--radius-".length);
    const factor = /\*\s*([\d.]+)\s*\)/.exec(value);
    const rem = baseRem * (factor ? Number(factor[1]) : 1);
    return {
      name: step,
      className: `rounded-${step}`,
      rem,
      px: rem * ROOT_PX,
      use: RADIUS_ROLES[step] ?? null,
    };
  });

  const placeholderAnimation = sheet.theme.get("--animate-placeholder");
  if (placeholderAnimation === undefined)
    throw new Error("the theme block has no --animate-placeholder");

  return {
    colors,
    groups: COLOR_GROUPS.map((group) => ({
      ...group,
      tokens: colors.filter((color) => color.group === group.id),
    })),
    settings: SETTING_ROLES.map((role) => ({
      ...role,
      value: {
        light: raw("light", role.token),
        dark: raw("dark", role.token),
      },
    })),
    radii,
    fullRadius: FULL_RADIUS,
    fonts: FONT_ROLES,
    type: TYPE_ROLES.map(typeStep),
    shadows: utilities(SHADOW_ROLES),
    spacing: utilities(SPACING_ROLES),
    durations: utilities(DURATION_ROLES),
    easings: utilities(EASING_ROLES),
    placeholderAnimation,
  };
}

/** A ratio as it is shown: two decimals, cut and not rounded, so 4.499 never reads 4.50. */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

export const passes = (check: ContrastCheck, theme: ThemeName): boolean =>
  check.ratio[theme] >= check.floor;

/** A size in px without a trailing zero: 15, 12.8. */
export const formatPx = (px: number): string => `${Number(px.toFixed(2))}px`;
