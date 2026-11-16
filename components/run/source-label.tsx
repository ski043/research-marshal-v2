import {
  BookOpenIcon,
  Building2Icon,
  FileTextIcon,
  GlobeIcon,
  LandmarkIcon,
  type LucideIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  PenLineIcon,
} from "lucide-react";
import type { SourceLabel } from "@/lib/research/events";
import { cn } from "@/lib/utils";

// One shape per label of S2, so a label reads without its colour.
const ICON: Readonly<Record<SourceLabel, LucideIcon>> = {
  Paper: FileTextIcon,
  Official: LandmarkIcon,
  Reference: BookOpenIcon,
  News: NewspaperIcon,
  Organization: Building2Icon,
  Blog: PenLineIcon,
  Forum: MessagesSquareIcon,
  Other: GlobeIcon,
};

/** The label of a source (S3), wherever the source appears. */
export function SourceLabelBadge({
  label,
  className,
}: {
  label: SourceLabel;
  className?: string;
}) {
  const Icon = ICON[label];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border bg-muted px-1.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-3 text-muted-foreground" />
      {label}
    </span>
  );
}
