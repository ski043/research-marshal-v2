import Image from "next/image";
import icon from "@/app/icon.png";
import { cn } from "@/lib/utils";

/** The app icon. Decorative next to the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src={icon}
      alt=""
      width={28}
      height={28}
      // The file is the 192px favicon; the optimiser would only add a request for it.
      unoptimized
      loading="eager"
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
