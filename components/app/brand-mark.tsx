import icon from "@/app/icon.png";
import { cn } from "@/lib/utils";

/** The app icon. Decorative next to the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: the file is the 192px favicon, served as it is; next/image would add 15 kB of script to every route for one 28px icon
    <img
      src={icon.src}
      alt=""
      width={28}
      height={28}
      className={cn("size-7 shrink-0", className)}
    />
  );
}

/** The name next to the mark: one sans style, with "Marshal" in the primary ink. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-lg leading-none font-semibold tracking-tight whitespace-nowrap text-sidebar-foreground",
        className,
      )}
    >
      Research <span className="text-primary-ink">Marshal</span>
    </span>
  );
}
