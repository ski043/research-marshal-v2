import { XIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import icon from "@/assets/brand/icon-1024.png";
import { BrandMark, Wordmark } from "@/components/app/brand-mark";
import {
  Code,
  Part,
  Rules,
  Section,
  ThemeScope,
} from "@/components/design-system/section";
import { DecodoMark } from "@/components/run/decodo-mark";
import { type DesignSystem, THEME_NAMES } from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

const SIZES = [256, 64, 28, 16] as const;

function Lockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <Wordmark />
    </span>
  );
}

function Dont({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li className="flex flex-col gap-2">
      <div
        aria-hidden
        className="flex h-20 items-center justify-center overflow-hidden rounded-xl border bg-sidebar"
      >
        {children}
      </div>
      <p className="flex items-start gap-1.5 text-sm text-pretty text-muted-foreground">
        <XIcon
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-destructive"
        />
        <span>
          <span className="font-medium text-destructive">Do not</span> {label}
        </span>
      </p>
    </li>
  );
}

export function BrandSection({ system }: { system: DesignSystem }) {
  return (
    <Section
      id="brand"
      lead={
        <p>
          One icon and one wordmark. The icon is the letter R on the orange of
          the bridge, with a trail of halftone dots. The wordmark is the name in
          Geist, with Marshal in the primary ink.
        </p>
      }
    >
      <Part
        id="brand-icon"
        title="App icon"
        rule={
          <>
            One file, <Code>assets/brand/icon-1024.png</Code>, scaled down. The
            tile is always the bridge orange, in both themes. At 16px the dots
            go and the R stays.
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {THEME_NAMES.map((theme) => (
            <ThemeScope
              key={theme}
              system={system}
              theme={theme}
              className="rounded-2xl border bg-sidebar p-5"
            >
              <p className="mb-4 text-xs font-medium text-muted-foreground">
                On the {theme} theme
              </p>
              <ul className="flex flex-wrap items-end gap-5">
                {SIZES.map((size) => (
                  <li
                    key={size}
                    data-icon={size}
                    className="flex flex-col items-start gap-2"
                  >
                    <Image
                      src={icon}
                      alt=""
                      width={size}
                      height={size}
                      sizes={`${size}px`}
                      className="max-w-full"
                      style={{ width: size, height: "auto" }}
                    />
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {size}px
                    </span>
                  </li>
                ))}
              </ul>
            </ThemeScope>
          ))}
        </div>
      </Part>

      <Part
        id="brand-wordmark"
        title="Wordmark and clear space"
        rule="The icon at 28px, a gap of 10px, the name at 18px in semibold with tight tracking. Keep at least that gap free on every side: the dashed line shows it."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {THEME_NAMES.map((theme) => (
            <ThemeScope
              key={theme}
              system={system}
              theme={theme}
              className="flex items-center justify-center rounded-2xl border bg-sidebar px-5 py-10"
            >
              <span
                data-lockup={theme}
                className="rounded-lg border border-dashed border-input p-2.5"
              >
                <Lockup />
              </span>
            </ThemeScope>
          ))}
        </div>
      </Part>

      <Part id="brand-donts" title="What not to do">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dont label="set the whole name in orange. Only Marshal takes the ink.">
            <span className="flex items-center gap-2.5">
              <BrandMark />
              <Wordmark className="text-primary-ink" />
            </span>
          </Dont>
          <Dont label="recolour the icon. The tile is the bridge orange.">
            <span className="flex items-center gap-2.5">
              <BrandMark className="hue-rotate-180" />
              <Wordmark />
            </span>
          </Dont>
          <Dont label="stretch, tilt or outline the lockup.">
            <Lockup className="scale-x-125 -rotate-3" />
          </Dont>
          <Dont label="put the lockup on a colour. It stands on a surface of the system.">
            <span className="flex size-full items-center justify-center bg-link">
              <Lockup />
            </span>
          </Dont>
        </ul>
      </Part>

      <Part
        id="brand-decodo"
        title="Decodo"
        rule="Decodo provides the web data of every search, page read and site map, and the app says so with Decodo's own mark. One rule: the shapes stay unchanged, and the mark has one colour, the colour of the text around it."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {THEME_NAMES.map((theme) => (
            <ThemeScope
              key={theme}
              system={system}
              theme={theme}
              className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-2xl border bg-background p-5"
            >
              <span
                data-decodo={theme}
                className="flex items-center gap-4 text-foreground"
              >
                <DecodoMark className="size-8" />
                <DecodoMark wordmark className="h-5 w-auto" />
                <span className="sr-only">Decodo</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                Web data by
                <DecodoMark wordmark className="h-2.5 w-auto" />
              </span>
            </ThemeScope>
          ))}
        </div>
        <div className="mt-4">
          <Rules>
            <li>
              Set the colour with the text colour of its parent. Never fill a
              part of the mark on its own, and never use Decodo's brand colour.
            </li>
            <li>
              The mark is decorative. Say Decodo in text next to it, visible or
              for a screen reader.
            </li>
          </Rules>
        </div>
      </Part>
    </Section>
  );
}
