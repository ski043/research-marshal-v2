import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/app/brand-mark";
import { ThemeToggle } from "@/components/app/theme-switcher";
import { AsciiSection } from "@/components/design-system/ascii";
import { BrandSection } from "@/components/design-system/brand";
import { ColourSection } from "@/components/design-system/colour";
import { ComponentsSection } from "@/components/design-system/components";
import { runFixture } from "@/components/design-system/fixture";
import { IdeaSection } from "@/components/design-system/idea";
import { MotionSection } from "@/components/design-system/motion";
import { Code, SECTIONS } from "@/components/design-system/section";
import { ShapeSection } from "@/components/design-system/shape";
import { TypographySection } from "@/components/design-system/typography";
import { BUDGET } from "@/lib/research/budget";
import { DEFAULT_MODEL } from "@/lib/research/events";
import { MODEL_OPTIONS } from "@/lib/research/model-config";
import { loadDesignSystem } from "@/lib/ui/design-system-source";

const CONTENT_ID = "design-system";

/**
 * The design system on one page that stands alone: no app shell, no database. It
 * renders the model that `lib/ui/design-system.ts` reads from `app/globals.css`.
 */
export function DesignSystemPage({ cut }: { cut: boolean }) {
  const sections = SECTIONS.filter(
    (section) => !cut || section.id !== "motion",
  );
  const system = loadDesignSystem();
  const run = runFixture();
  return (
    <div className="relative h-dvh overflow-y-auto scroll-pt-28 bg-background text-foreground">
      <a
        href={`#${CONTENT_ID}`}
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 focus:translate-y-0"
      >
        Skip to the content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-6xl items-center gap-3 px-4 sm:px-8">
          <Link
            href="/"
            title="Research Marshal"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandMark />
            <Wordmark className="hidden text-foreground sm:inline" />
          </Link>
          <span className="text-sm text-muted-foreground">Design system</span>
          <div className="ms-auto flex items-center gap-3">
            <Link
              href={cut ? "/designsystem/full" : "/designsystem"}
              className="rounded-md text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {cut ? "Full reference" : "Short version"}
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <nav
          aria-label="Sections"
          className="mx-auto max-w-6xl overflow-x-auto px-2.5 pb-2 [scrollbar-width:none] sm:px-6.5"
        >
          <ul className="flex gap-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex h-7 items-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main
        id={CONTENT_ID}
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 outline-none sm:px-8"
      >
        <div className="flex max-w-2xl flex-col gap-3 pt-12 sm:pt-16">
          <h1 className="text-2xl font-medium tracking-tight text-balance sm:text-[1.875rem] sm:leading-tight">
            The design system of Research Marshal
          </h1>
          <p className="text-[0.9375rem]/7 text-pretty text-muted-foreground">
            Research Marshal answers one research question with a cited report.
            This page shows how it looks and why: every colour, every size and
            every component, with the rule that decides when to use it. Each
            section and each part has a link of its own.
          </p>
          <p className="text-sm text-pretty text-muted-foreground">
            Every value comes from <Code>app/globals.css</Code>. The page cannot
            disagree with the app, because it reads the same file. An agent
            reads the same model as text in the <Code>design-system</Code>{" "}
            skill.
          </p>
        </div>

        <IdeaSection system={system} />
        <ColourSection system={system} compact={cut} />
        <TypographySection system={system} />
        <ShapeSection system={system} />
        <BrandSection system={system} />
        <AsciiSection />
        <ComponentsSection
          run={run}
          models={MODEL_OPTIONS}
          defaultModel={DEFAULT_MODEL}
          budget={{
            rounds: BUDGET.rounds,
            queriesPerRound: BUDGET.queriesPerRound,
            readsPerRound: BUDGET.readsPerRound,
            mapsPerRun: BUDGET.mapsPerRun,
          }}
        />
        {!cut && <MotionSection system={system} />}

        <footer className="border-t py-8 text-xs text-pretty text-muted-foreground">
          Generated from <Code>app/globals.css</Code> and{" "}
          <Code>lib/ui/design-system.ts</Code>. To change a value, change it
          there.
        </footer>
      </main>
    </div>
  );
}
