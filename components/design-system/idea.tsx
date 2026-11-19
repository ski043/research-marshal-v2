import { Scene } from "@/components/design-system/scene";
import { Section } from "@/components/design-system/section";
import type { DesignSystem, TokenName } from "@/lib/ui/design-system";

const FROM_THE_PICTURE: readonly {
  token: TokenName;
  part: string;
  becomes: string;
  href: string;
}[] = [
  {
    token: "--background",
    part: "The night",
    becomes: "the ground of every surface",
    href: "#colour-surfaces",
  },
  {
    token: "--primary",
    part: "The lit steel",
    becomes: "the primary",
    href: "#colour-primary",
  },
  {
    token: "--link",
    part: "The stars",
    becomes: "links and citations",
    href: "#colour-secondary",
  },
  {
    token: "--highlight",
    part: "The lamps",
    becomes: "small highlights",
    href: "#colour-highlight",
  },
];

export function IdeaSection({
  system,
  compact = false,
}: {
  system: DesignSystem;
  /** The short cut of the page: one sentence, and chips that lead to the one colour section. */
  compact?: boolean;
}) {
  return (
    <Section
      id="idea"
      lead={
        compact ? (
          <p className="text-sm/6">
            One picture, the Golden Gate Bridge at dusk in halftone dots. Its
            colours are the colours of the interface.
          </p>
        ) : (
          <>
            <p>
              Research Marshal opens on one picture: the Golden Gate Bridge at
              dusk, drawn in halftone dots. The colours of the interface are the
              colours of this picture.
            </p>
            <p>
              The night is the ground, the lit steel of the bridge is the
              primary, the stars are the links and the citations, and the lamps
              are the small highlights. Statuses are the one exception: green,
              yellow and red mean what they mean everywhere.
            </p>
          </>
        )
      }
    >
      <Scene className="h-64 sm:h-96" frame={{ scale: 1.15 }} />
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FROM_THE_PICTURE.map((each) => {
          const color = system.colors.find((c) => c.token === each.token);
          return (
            <li key={each.token}>
              <a
                href={compact ? "#colour" : each.href}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors duration-150 hover:border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden
                  className="size-9 shrink-0 rounded-lg border"
                  style={{ backgroundColor: color?.value.dark.css }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{each.part}</span>
                  <span className="text-xs text-pretty text-muted-foreground">
                    {each.becomes}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
