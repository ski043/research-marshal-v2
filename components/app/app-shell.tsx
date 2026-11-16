"use client";

import { MenuIcon } from "lucide-react";
import { createContext, type ReactNode, use, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

const ShellContext = createContext<() => void>(() => {});

/**
 * The frame of every screen: the sidebar beside the page from 1024px up, and below that
 * a slide-over that `SidebarTrigger` opens.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ShellContext value={() => setOpen(true)}>
      <div className="flex h-dvh min-h-0 w-full">
        <aside
          aria-label="History"
          className="hidden w-[260px] shrink-0 lg:block"
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 lg:py-2 lg:pe-2">{children}</div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[280px] max-w-[85%] gap-0 bg-sidebar p-0 lg:hidden"
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
  const open = use(ShellContext);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Open the history"
      className="lg:hidden"
      onClick={open}
    >
      <MenuIcon />
    </Button>
  );
}
