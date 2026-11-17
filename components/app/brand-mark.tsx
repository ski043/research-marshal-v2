import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";

const researchFace = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

/** The mark of Research Marshal: a quote that is checked. Decorative next to the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-[13px] font-semibold leading-none text-primary-foreground",
        className,
      )}
    >
      ⠶
    </span>
  );
}

/**
 * The name next to the mark: "Research" in an italic serif and the primary ink,
 * "Marshal" in the sans of the interface. It is variant W8 of the gallery at /lab.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("leading-none whitespace-nowrap", className)}>
      <span
        className={cn(
          researchFace.className,
          "text-[1.3em] text-primary-ink italic",
        )}
      >
        Research
      </span>{" "}
      <span className="font-semibold tracking-tight">Marshal</span>
    </span>
  );
}
