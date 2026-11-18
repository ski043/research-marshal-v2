import { CopyValue } from "@/components/design-system/copy-value";
import { Code, Part, Section } from "@/components/design-system/section";
import { type DesignSystem, formatPx } from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

// A shape shows better in a colour. The fills step through the palette in this order.
const FILLS = [
  "bg-primary",
  "bg-link",
  "bg-highlight",
  "bg-success",
  "bg-ascii-purple",
  "bg-ascii-pink",
  "bg-warning-fill",
  "bg-ascii-green",
] as const;
const fill = (index: number) => FILLS[index % FILLS.length];

export function ShapeSection({ system }: { system: DesignSystem }) {
  return (
    <Section
      id="shape"
      lead={
        <p>
          Soft corners, hairlines and almost no shadow. A surface separates from
          the one under it by its colour and a 1px border. A shadow says only
          one thing: this floats above the page.
        </p>
      }
    >
      <Part
        id="shape-radii"
        title="Radii"
        rule={
          <>
            One base, <Code>--radius</Code>, and a multiple of it for each step.
            The smaller the element, the smaller its radius. An element inside
            another takes a smaller step than the one around it.
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ...system.radii.map((radius) => ({
              ...radius,
              size: `${formatPx(radius.px)} / ${Number(radius.rem.toFixed(4))}rem`,
            })),
            { ...system.fullRadius, name: "full", size: "round" },
          ].map((radius, index) => (
            <li
              key={radius.className}
              data-radius={radius.name}
              className={cn(
                "flex flex-col items-start gap-1",
                radius.use === null && "opacity-60",
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "mb-1 h-20 w-28 max-w-full",
                  fill(index),
                  radius.className,
                )}
              />
              <CopyValue value={radius.className} />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {radius.size}
              </span>
              <p className="text-sm text-pretty text-muted-foreground">
                {radius.use ??
                  "Not used. The preset declares it. Do not start to use it."}
              </p>
            </li>
          ))}
        </ul>
      </Part>

      <Part
        id="shape-borders"
        title="Borders"
        rule="Every border is 1px. Three colours, by how much the edge must be found."
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          <li className="flex flex-col items-start gap-1">
            <div
              aria-hidden
              className="mb-1 h-16 w-full rounded-xl border bg-primary-soft"
            />
            <CopyValue value="border" />
            <p className="text-sm text-pretty text-muted-foreground">
              The hairline of a card or a divider. Decoration.
            </p>
          </li>
          <li className="flex flex-col items-start gap-1">
            <div
              aria-hidden
              className="mb-1 h-16 w-full rounded-xl border border-input bg-link-soft"
            />
            <CopyValue value="border border-input" />
            <p className="text-sm text-pretty text-muted-foreground">
              The edge of a control. It reaches 3:1.
            </p>
          </li>
          <li className="flex flex-col items-start gap-1">
            <div
              aria-hidden
              className="mb-1 h-16 w-full rounded-xl border bg-success-soft outline-2 outline-offset-2 outline-ring"
            />
            <CopyValue value="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <p className="text-sm text-pretty text-muted-foreground">
              The focus ring: 2px, set off by 2px. It reaches 3:1.
            </p>
          </li>
        </ul>
      </Part>

      <Part
        id="shape-shadows"
        title="Shadows"
        rule="Four steps of Tailwind's default theme. The higher something floats, the larger its shadow."
      >
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {system.shadows.map((shadow, index) => (
            <li
              key={shadow.className}
              className="flex flex-col items-start gap-1"
            >
              <div className="mb-1 w-full rounded-xl bg-muted p-4">
                <div
                  aria-hidden
                  className={cn(
                    "h-12 rounded-lg",
                    fill(index),
                    shadow.className,
                  )}
                />
              </div>
              <CopyValue value={shadow.className} />
              <p className="text-sm text-pretty text-muted-foreground">
                {shadow.use}
              </p>
            </li>
          ))}
        </ul>
      </Part>

      <Part
        id="shape-spacing"
        title="Spacing"
        rule="Everything sits on a 4px grid. These are the measures that repeat."
      >
        <ul className="border-b">
          {system.spacing.map((space, index) => (
            <li
              key={space.className}
              className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-t py-2.5 sm:grid-cols-[7rem_8rem_minmax(0,1fr)]"
            >
              <span className="flex flex-col items-start">
                <CopyValue value={space.className} />
                {space.value && (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {space.value}
                  </span>
                )}
              </span>
              <span aria-hidden className="hidden sm:block">
                {space.value && (
                  <span
                    className={cn("block h-2 rounded-full", fill(index))}
                    style={{ width: space.value }}
                  />
                )}
              </span>
              <span className="col-span-2 text-sm text-pretty text-muted-foreground sm:col-span-1">
                {space.use}
              </span>
            </li>
          ))}
        </ul>
      </Part>
    </Section>
  );
}
