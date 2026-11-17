import { CopyValue } from "@/components/design-system/copy-value";
import { Code, Part, Rules, Section } from "@/components/design-system/section";
import {
  CONTRAST_FLOOR,
  type DesignSystem,
  formatRatio,
  THEME_NAMES,
} from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

export function MotionSection({ system }: { system: DesignSystem }) {
  const measured = system.colors.flatMap((color) =>
    color.checks.flatMap((check) =>
      THEME_NAMES.map((theme) => ({
        token: color.token,
        on: check.on,
        theme,
        kind: check.kind,
        ratio: check.ratio[theme],
        margin: check.ratio[theme] / check.floor,
      })),
    ),
  );
  const failing = measured.filter((each) => each.margin < 1);
  const tightest = measured.reduce((a, b) => (b.margin < a.margin ? b : a));

  return (
    <Section
      id="motion"
      lead={
        <p>
          Motion says that something changed and where it came from. It is
          short, it never blocks a click, and it is gone for a reader who asked
          for less of it. Every control works with the keyboard and shows where
          the focus is.
        </p>
      }
    >
      <Part
        id="motion-durations"
        title="Durations"
        rule="Five steps. The larger the thing that moves, the longer it takes. Point at a row, or move the focus into it, to see its speed."
      >
        <ul className="border-b">
          {system.durations.map((duration) => (
            <li key={duration.className} className="border-t">
              <div className="group/speed grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[7rem_10rem_minmax(0,1fr)]">
                <span className="flex flex-col items-start">
                  <CopyValue value={duration.className} />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {duration.value}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="hidden h-2 rounded-full bg-muted sm:block"
                >
                  <span
                    className={cn(
                      "block size-2 rounded-full bg-primary transition-transform ease-out group-hover/speed:translate-x-38 group-focus-within/speed:translate-x-38 motion-reduce:transition-none",
                      duration.className,
                    )}
                  />
                </span>
                <span className="col-span-2 text-sm text-pretty text-muted-foreground sm:col-span-1">
                  {duration.use}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Part>

      <Part
        id="motion-easing"
        title="Easing"
        rule="Things arrive fast and settle. Nothing eases in: a slow start reads as a slow app."
      >
        <ul className="border-b">
          {system.easings.map((easing) => (
            <li
              key={easing.className}
              className="flex flex-col items-start gap-1 border-t py-2.5"
            >
              <CopyValue value={easing.className} />
              <p className="text-sm text-pretty text-muted-foreground">
                {easing.use}
              </p>
            </li>
          ))}
          <li className="flex flex-col items-start gap-1 border-t py-2.5">
            <CopyValue value="animate-placeholder" />
            <span className="font-mono text-xs text-muted-foreground">
              {system.placeholderAnimation}
            </span>
            <p className="text-sm text-pretty text-muted-foreground">
              The one long loop: the example question that rotates in the empty
              prompt box.
            </p>
          </li>
        </ul>
      </Part>

      <Part id="motion-reduced" title="Reduced motion">
        <Rules>
          <li>
            Every animation and every transition that moves something carries{" "}
            <Code>motion-reduce:animate-none</Code> or{" "}
            <Code>motion-reduce:transition-none</Code>. A change of colour may
            stay.
          </li>
          <li>
            The glyph spinner holds one still glyph. An ASCII canvas holds a
            finished frame. A typed example appears at once.
          </li>
          <li>
            Nothing waits for an animation: the content is there and usable in
            the first frame.
          </li>
        </Rules>
      </Part>

      <Part id="motion-focus" title="Focus">
        <Rules>
          <li>
            Every control shows a focus ring on keyboard focus, in{" "}
            <Code>--ring</Code>, or <Code>--sidebar-ring</Code> in the sidebar.
            Use <Code>focus-visible</Code>, never <Code>focus</Code>, and never
            remove an outline without a ring in its place.
          </li>
          <li>
            The order of the focus is the order on screen. What is hidden is out
            of the tab order.
          </li>
          <li>
            A control is at least 24px tall. The ones a thumb reaches for most,
            the send button and the rows of the sidebar, are 36px.
          </li>
        </Rules>
      </Part>

      <Part id="motion-contrast" title="Contrast floor">
        <Rules>
          <li>
            Text reaches {CONTRAST_FLOOR.text}:1 on every surface it sits on. A
            shape that carries meaning without text reaches{" "}
            {CONTRAST_FLOOR["non-text"]}:1. Both are WCAG 2.2 AA.
          </li>
          <li>
            <span data-contrast-summary data-failing={failing.length}>
              {measured.length} measurements in the two themes,{" "}
              {failing.length === 0
                ? "none under its floor"
                : `${failing.length} under their floor`}
              .
            </span>{" "}
            The tightest is <Code>{tightest.token}</Code> on{" "}
            <Code>{tightest.on}</Code> in the {tightest.theme} theme at{" "}
            {formatRatio(tightest.ratio)}:1.
          </li>
          <li>
            A pair that is not measured is not allowed. Add the surface to the
            role of the colour first, then run the contrast test.
          </li>
        </Rules>
      </Part>
    </Section>
  );
}
