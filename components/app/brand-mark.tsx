import { cn } from "@/lib/utils";

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
