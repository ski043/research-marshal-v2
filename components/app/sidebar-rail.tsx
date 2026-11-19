"use client";

import { PanelLeftIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SIDEBAR_ID, useSidebar } from "@/components/app/app-shell";
import { ICON_BUTTON } from "@/components/app/sidebar-classes";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

function useShortcutLabel(): string {
  const mac = useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
  return mac ? "⌘⇧." : "Ctrl+Shift+.";
}

export function SidebarToggle() {
  const { sidebar, setSidebar } = useSidebar();
  const shortcut = useShortcutLabel();
  const collapsed = sidebar === "collapsed";
  const label = collapsed ? "Expand the sidebar" : "Collapse the sidebar";
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls={SIDEBAR_ID}
      title={`${label} (${shortcut})`}
      onClick={() => setSidebar(collapsed ? "expanded" : "collapsed")}
      // On the rail it rides the closing edge left and down into the row under the
      // mark: 208px is the 260px sidebar less the 52px rail.
      className={cn(
        ICON_BUTTON,
        "absolute top-2 left-[216px] z-10 text-muted-foreground transition-[translate,background-color,color] duration-200 ease-out hover:text-sidebar-foreground motion-reduce:transition-none rail:-translate-x-52 rail:translate-y-11",
      )}
    >
      <PanelLeftIcon aria-hidden className="size-4" />
    </button>
  );
}
