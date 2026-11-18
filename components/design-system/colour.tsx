import { CheckIcon, XIcon } from "lucide-react";
import { CopyValue } from "@/components/design-system/copy-value";
import { Code, Part, Rules, Section } from "@/components/design-system/section";
import {
  type ColorToken,
  type ContrastCheck,
  type ContrastKind,
  type DesignSystem,
  formatRatio,
  passes,
  THEME_NAMES,
  type ThemeName,
  type TokenName,
} from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

const THEME_LABEL: Readonly<Record<ThemeName, string>> = {
  light: "Light",
  dark: "Dark",
};

const KIND: Readonly<Record<ContrastKind, { title: string; mark: string }>> = {
  text: { title: "As text", mark: "Aa" },
  "non-text": { title: "As a shape", mark: "●" },
};

type Lookup = (token: TokenName, theme: ThemeName) => string;

function Swatch({
  token,
  theme,
  css,
}: {
  token: ColorToken;
  theme: ThemeName;
  css: Lookup;
}) {
  const value = token.value[theme];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* The colour on the page of its own theme, so an alpha or a near-white shows. */}
      <div
        className="rounded-lg border p-2"
        style={{
          backgroundColor: css("--background", theme),
          borderColor: css("--border", theme),
        }}
      >
        <div
          data-swatch={theme}
          className="h-12 rounded-md border"
          style={{
            backgroundColor: value.css,
            borderColor: css("--border", theme),
          }}
        />
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium">{THEME_LABEL[theme]}</span>
        <CopyValue value={value.css} />
        <CopyValue value={value.hex} />
      </div>
    </div>
  );
}

function Cell({
  token,
  check,
  theme,
  css,
}: {
  token: ColorToken;
  check: ContrastCheck;
  theme: ThemeName;
  css: Lookup;
}) {
  const pass = passes(check, theme);
  const Icon = pass ? CheckIcon : XIcon;
  return (
    <td className="w-32 py-1 ps-3">
      <span
        data-check={check.kind}
        data-token={token.token}
        data-on={check.on}
        data-theme={theme}
        data-ratio={formatRatio(check.ratio[theme])}
        data-pass={pass}
        className="flex items-center gap-1.5"
      >
        <span
          aria-hidden
          data-pair
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-[0.6875rem] font-medium"
          style={{
            color: token.value[theme].css,
            backgroundColor: css(check.on, theme),
            borderColor: css("--border", theme),
          }}
        >
          {KIND[check.kind].mark}
        </span>
        <span className="font-mono text-xs tabular-nums">
          {formatRatio(check.ratio[theme])}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs",
            pass ? "text-success" : "font-medium text-destructive",
          )}
        >
          <Icon aria-hidden className="size-3 shrink-0" />
          {pass ? "pass" : "fail"}
        </span>
      </span>
    </td>
  );
}

function Checks({
  token,
  kind,
  css,
}: {
  token: ColorToken;
  kind: ContrastKind;
  css: Lookup;
}) {
  const checks = token.checks.filter((check) => check.kind === kind);
  const [first] = checks;
  if (!first) return null;
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="pb-1 text-left text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{KIND[kind].title}</span>,
        floor {first.floor}:1
      </caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="font-normal">
            On
          </th>
          {THEME_NAMES.map((theme) => (
            <th key={theme} scope="col" className="w-32 ps-3 font-normal">
              {THEME_LABEL[theme]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {checks.map((check) => (
          <tr key={check.on} className="border-t">
            <th
              scope="row"
              className="truncate py-1 font-mono text-xs font-normal text-muted-foreground"
            >
              {check.on}
            </th>
            {THEME_NAMES.map((theme) => (
              <Cell
                key={theme}
                token={token}
                check={check}
                theme={theme}
                css={css}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Token({
  token,
  carries,
  css,
}: {
  token: ColorToken;
  /** The colours that are measured on this one, when it is a surface. */
  carries: readonly TokenName[];
  css: Lookup;
}) {
  return (
    <li
      data-color-token={token.token}
      className="grid gap-x-8 gap-y-4 border-t py-5 lg:grid-cols-[26rem_minmax(0,1fr)_minmax(0,1.3fr)]"
    >
      <div className="flex gap-3">
        {THEME_NAMES.map((theme) => (
          <Swatch key={theme} token={token} theme={theme} css={css} />
        ))}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h4 className="text-sm font-medium">{token.name}</h4>
        <CopyValue value={token.token} />
        <p className="text-sm text-pretty text-muted-foreground">{token.use}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Checks token={token} kind="text" css={css} />
        <Checks token={token} kind="non-text" css={css} />
        {carries.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">As a surface</span>,
              it carries
            </p>
            <p className="font-mono text-xs text-pretty text-muted-foreground">
              {carries.join(", ")}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

const TILES: readonly { title: string; tokens: readonly TokenName[] }[] = [
  {
    title: "Palette",
    tokens: [
      "--primary",
      "--primary-ink",
      "--link",
      "--highlight",
      "--background",
      "--foreground",
    ],
  },
  { title: "Statuses", tokens: ["--success", "--warning", "--destructive"] },
];

function Tile({ token }: { token: ColorToken }) {
  return (
    <li data-color-tile={token.token} className="flex min-w-0 flex-col gap-2">
      <div
        className="h-28 rounded-2xl border shadow-xs"
        style={{ backgroundColor: `var(${token.token})` }}
      />
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="text-sm font-medium">{token.name}</span>
        <CopyValue value={token.token} />
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground uppercase dark:hidden">
          {token.value.light.hex}
        </span>
        <span className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground uppercase dark:inline">
          {token.value.dark.hex}
        </span>
      </div>
    </li>
  );
}

function Tiles({ system }: { system: DesignSystem }) {
  const byToken = new Map(system.colors.map((color) => [color.token, color]));
  return (
    <div className="flex flex-col gap-8 pt-2">
      {TILES.map((group) => (
        <div key={group.title} className="flex flex-col gap-4">
          <h3 className="text-base font-semibold">{group.title}</h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {group.tokens.flatMap((name) => {
              const token = byToken.get(name);
              return token ? [<Tile key={name} token={token} />] : [];
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ColourSection({
  system,
  compact = false,
}: {
  system: DesignSystem;
  /** The short cut of the page: one tile for each colour that matters, no contrast tables. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Section
        id="colour"
        lead={
          <p>
            The palette comes from one picture: near-black for the night, orange
            for the lit steel of the bridge, blue for the stars, amber for the
            lamps. Green, yellow and red mean what they mean everywhere.
          </p>
        }
      >
        <Tiles system={system} />
      </Section>
    );
  }
  const byToken = new Map(system.colors.map((color) => [color.token, color]));
  const css: Lookup = (token, theme) => {
    const color = byToken.get(token);
    if (!color) throw new Error(`no colour ${token}`);
    return color.value[theme].css;
  };
  const pairs = system.colors.reduce((sum, c) => sum + c.checks.length, 0);
  const carries = (surface: TokenName) =>
    system.colors
      .filter((color) => color.checks.some((check) => check.on === surface))
      .map((color) => color.token);

  return (
    <Section
      id="colour"
      lead={
        <>
          <p>
            {system.colors.length} colours, each written once for the light and
            once for the dark theme in <Code>app/globals.css</Code>. Each one
            has a job. Use a colour for its job and for nothing else, and never
            write a colour value in a component.
          </p>
          <p>
            Both themes show side by side, whatever theme this page is in. The
            contrast is measured, not claimed: {pairs} pairs of a colour and a
            surface, in each theme. A click on a value copies it.
          </p>
        </>
      }
    >
      <Rules>
        <li>
          <strong className="font-semibold">Orange is rare.</strong> It marks
          the one main action of a screen, what is running now, and the name. If
          two things on a screen are orange, one of them is wrong.
        </li>
        <li>
          <strong className="font-semibold">
            Links and citations are starlight blue.
          </strong>{" "}
          Blue leads to a source. It is never a status and never a button.
        </li>
        <li>
          <strong className="font-semibold">
            A button on orange has near-black text
          </strong>{" "}
          in the dark theme, and white text in the light theme. White on the
          dark theme's orange is 3.1:1.
        </li>
        <li>
          <strong className="font-semibold">
            Statuses are green, dark yellow and red,
          </strong>{" "}
          and always carry a word and an icon. Colour is never the only cue.
        </li>
        <li>
          <strong className="font-semibold">
            Yellow in the light theme is a fill.
          </strong>{" "}
          A pill or a dot takes the yellow. A bare word takes the dark gold,
          because yellow fails as text on white.
        </li>
      </Rules>

      {system.groups.map((group) => (
        <Part
          key={group.id}
          id={`colour-${group.id}`}
          title={group.title}
          rule={group.rule}
        >
          <ul className="border-b">
            {group.tokens.map((token) => (
              <Token
                key={token.token}
                token={token}
                carries={carries(token.token)}
                css={css}
              />
            ))}
          </ul>
        </Part>
      ))}
    </Section>
  );
}
