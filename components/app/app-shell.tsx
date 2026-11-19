"use client";

import { MenuIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  isSidebarShortcut,
  readSidebar,
  SIDEBAR_KEY,
  type SidebarState,
  showSidebar,
} from "@/lib/ui/sidebar";
import { useStored } from "@/lib/ui/storage";

export const SIDEBAR_ID = "sidebar";
const DOCKED = "(min-width: 1024px)";

type Shell = {
  openSheet: () => void;
  /** The docked sidebar from 1024px up. The slide-over below that is always expanded. */
  sidebar: SidebarState;
  setSidebar: (next: SidebarState) => void;
};

const ShellContext = createContext<Shell>({
  openSheet: () => {},
  sidebar: "expanded",
  setSidebar: () => {},
});

export function useSidebar(): Pick<Shell, "sidebar" | "setSidebar"> {
  return use(ShellContext);
}

/**
 * The frame of every screen: the sidebar beside the page from 1024px up, wide or
 * collapsed to a rail of icons, and below that a slide-over that `SidebarTrigger` opens.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [stored, store] = useStored(SIDEBAR_KEY);
  const state = readSidebar(stored);
  const aside = useRef<HTMLElement>(null);

  // The first render sees no stored value, and the script before the first paint has
  // already set the attribute; this follows later changes, also from another tab.
  useEffect(() => {
    if (stored !== null) showSidebar(readSidebar(stored));
  }, [stored]);

  const setSidebar = (next: SidebarState) => {
    const focused = document.activeElement;
    showSidebar(next);
    store(next);
    // The history turns invisible, and focus must not stay on a link no one can see.
    if (next === "collapsed" && focused && aside.current?.contains(focused)) {
      aside.current
        .querySelector<HTMLElement>(`[aria-controls=${SIDEBAR_ID}]`)
        ?.focus();
    }
  };
  const toggle = useRef(() => {});
  toggle.current = () =>
    setSidebar(state === "collapsed" ? "expanded" : "collapsed");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !isSidebarShortcut(event)) return;
      if (!matchMedia(DOCKED).matches) return;
      event.preventDefault();
      toggle.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ShellContext
      value={{ openSheet: () => setOpen(true), sidebar: state, setSidebar }}
    >
      <div className="flex h-dvh min-h-0 w-full">
        <aside
          ref={aside}
          id={SIDEBAR_ID}
          aria-label="History"
          className="hidden w-[260px] shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block rail:w-[52px]"
        >
          {sidebar}
        </aside>
        {/* The skip link lands here. A page keeps no id of its own: Next.js keeps earlier
            pages in the document, hidden, and an id must stay unique. */}
        <div
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 outline-none lg:py-2 lg:pe-2"
        >
          {children}
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 bg-sidebar p-0 data-[side=left]:w-[min(300px,calc(100%-2.5rem))] lg:hidden"
          // A click on a run or on "New question" navigates, so the slide-over is done.
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
        >
          <SheetTitle className="sr-only">History</SheetTitle>
          <SheetDescription className="sr-only">
            Every past run, and a button for a new question.
          </SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>
    </ShellContext>
  );
}

export function SidebarTrigger() {
  const { openSheet } = use(ShellContext);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Open the history"
      className="lg:hidden"
      onClick={openSheet}
    >
      <MenuIcon />
    </Button>
  );
}
