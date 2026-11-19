import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import { Scene } from "@/components/design-system/scene";
import { Code, Part, Rules, Section } from "@/components/design-system/section";
import { RunNotice } from "@/components/run/run-notice";

const NOTICES = [
  {
    variant: "cancelled",
    title: "Run cancelled",
    text: "A cancelled run writes no report.",
  },
  {
    variant: "failed",
    title: "Run failed",
    text: "The run stopped at a step that failed.",
  },
  {
    variant: "not-found",
    title: "Run not found",
    text: "No run is stored under this address.",
  },
] as const;

export function AsciiSection() {
  return (
    <Section
      id="ascii"
      lead={
        <p>
          ASCII art is the signature of Research Marshal: the scene of the start
          screen, the spinner of everything that runs, and the glyph of a run
          without a report. It is a signature, not wallpaper. It appears where
          the app has something to say and nowhere else.
        </p>
      }
    >
      <Part
        id="ascii-scene"
        title="The scene"
        rule="Drawn live, glyph by glyph, on a WebGL canvas. Here at a larger cell, so the dots show: each one is a glyph on a grid."
      >
        <Scene className="h-72 sm:h-80" cell={12} frame={{ scale: 1.35 }} />
      </Part>

      <Part
        id="ascii-spinner"
        title="The glyph spinner"
        rule="A Braille glyph that turns while something runs: a run in the history, a row of the Activity list, the send button. One timer turns every spinner on the page, so they stay in step."
      >
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card p-4 text-sm">
          <li className="flex items-center gap-2">
            <GlyphSpinner className="text-xs" />
            <span>
              <span className="font-mono text-xs">read</span> in a row
            </span>
          </li>
          <li className="flex items-center gap-2">
            <GlyphSpinner className="text-sm" />
            Running
          </li>
          <li className="flex items-center gap-2">
            <GlyphSpinner />
            Waiting for the first step of the run.
          </li>
        </ul>
      </Part>

      <Part
        id="ascii-glyphs"
        title="The dithered glyphs"
        rule="A run without a report gets a glyph in a cloud of dithered dots that shimmers slowly: cancelled, failed, not found."
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {NOTICES.map((notice) => (
            <li
              key={notice.variant}
              data-glyph={notice.variant}
              className="rounded-xl border bg-background"
            >
              <RunNotice variant={notice.variant} title={notice.title}>
                <p>{notice.text}</p>
              </RunNotice>
            </li>
          ))}
        </ul>
      </Part>

      <Part id="ascii-rules" title="Rules">
        <Rules>
          <li>
            <strong className="font-semibold">
              A signature, not wallpaper.
            </strong>{" "}
            One scene, on the start screen. No ASCII behind text that a person
            reads for longer than a line.
          </li>
          <li>
            <strong className="font-semibold">Glyphs, never pixels.</strong>{" "}
            Every picture is drawn from characters or dots on a cell grid, by
            the engine in <Code>lib/ascii</Code>. No bitmap, no blur, no
            gradient that stands in for one.
          </li>
          <li>
            <strong className="font-semibold">Decorative means silent.</strong>{" "}
            A canvas is hidden from assistive technology with{" "}
            <Code>aria-hidden</Code>, takes no pointer events, pauses while it
            is off screen or in a hidden tab, and holds a finished frame under
            reduced motion.
          </li>
          <li>
            <strong className="font-semibold">
              The WebGL engine never loads on a run page.
            </strong>{" "}
            A run page draws its glyphs as text and SVG. The scene loads in a
            chunk of its own, after the page it belongs to.
          </li>
          <li>
            The scene paints its own night, so its panel takes the dark tokens
            in both themes. Text on it is the dark theme's text.
          </li>
        </Rules>
      </Part>
    </Section>
  );
}
