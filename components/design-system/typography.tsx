import { CopyValue } from "@/components/design-system/copy-value";
import { Code, Part, Rules, Section } from "@/components/design-system/section";
import {
  type DesignSystem,
  formatPx,
  type TypeStep,
} from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

const FAMILY = { sans: "Geist", mono: "Geist Mono" } as const;

function Step({ step }: { step: TypeStep }) {
  return (
    <li className="grid gap-x-8 gap-y-3 border-t py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <p
        data-type-step={step.id}
        data-sizes={JSON.stringify(step.sizes)}
        className={cn("min-w-0 break-words", step.className)}
      >
        {step.sample}
      </p>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h4 className="text-sm font-medium">{step.job}</h4>
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {step.sizes.map((size) => (
            <div key={size.from ?? 0} className="flex gap-1.5">
              <dt className="sr-only">
                Size{size.from === null ? "" : ` from ${size.from}px`}
              </dt>
              <dd>
                {formatPx(size.px)} / {size.rem}rem
                {size.lineHeightPx === null
                  ? ", line height inherited"
                  : `, line ${formatPx(size.lineHeightPx)}`}
                {size.from === null ? "" : ` from ${size.from}px`}
              </dd>
            </div>
          ))}
          <div className="flex gap-1.5">
            <dt className="sr-only">Weight and family</dt>
            <dd>
              {step.weight} {FAMILY[step.family]}
            </dd>
          </div>
        </dl>
        <CopyValue value={step.className} />
        <p className="text-sm text-pretty text-muted-foreground">
          {step.where}
        </p>
      </div>
    </li>
  );
}

export function TypographySection({ system }: { system: DesignSystem }) {
  return (
    <Section
      id="typography"
      lead={
        <>
          <p>
            Two families and one short scale. Geist is for everything a person
            reads. Geist Mono is for machine facts, so a reader can tell at a
            glance what the run produced and what the app says about it.
          </p>
          <p>
            The scale below is the one the components use today, named by the
            job of each step. Pick the step by its job, and write its classes as
            they stand here.
          </p>
        </>
      }
    >
      <Part id="typography-families" title="Families">
        <ul className="grid gap-4 sm:grid-cols-2">
          {system.fonts.map((font) => (
            <li
              key={font.name}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <p
                className={cn(
                  "text-2xl font-medium tracking-tight",
                  font.className,
                )}
              >
                {font.name}
              </p>
              <p
                aria-hidden
                className={cn("text-sm break-words", font.className)}
              >
                {font.className === "font-mono"
                  ? "site:example.org battery cycle life  1.6s  18,420 chars  3 / 5"
                  : "Every fact in the report carries a quote that was checked on its page."}
              </p>
              <CopyValue value={font.className} />
              <p className="text-sm text-pretty text-muted-foreground">
                {font.use}
              </p>
            </li>
          ))}
        </ul>
      </Part>

      <Part
        id="typography-scale"
        title="Scale"
        rule={
          <>
            Three weights: 400 for running text, 500 for a control or a label,
            600 for a heading. Headings from 18px up take{" "}
            <Code>tracking-tight</Code>. Long text takes{" "}
            <Code>text-pretty</Code>, a heading <Code>text-balance</Code>.
          </>
        }
      >
        <ul className="border-b">
          {system.type.map((step) => (
            <Step key={step.id} step={step} />
          ))}
        </ul>
      </Part>

      <Part id="typography-rules" title="Rules">
        <Rules>
          <li>
            A number that changes while you look at it takes{" "}
            <Code>tabular-nums</Code>: a clock, a count, a meter.
          </li>
          <li>
            Mono is never decoration. If a person wrote the words or the app
            says them, they are Geist.
          </li>
          <li>
            Do not add a size. If no step fits, the design is asking for a step
            that exists.
          </li>
        </Rules>
      </Part>
    </Section>
  );
}
