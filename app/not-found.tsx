import type { Metadata } from "next";
import Link from "next/link";
import { SidebarTrigger } from "@/components/app/app-shell";
import { RunNotice } from "@/components/run/run-notice";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:border lg:shadow-xs"
    >
      <div className="flex h-13 shrink-0 items-center px-3 lg:hidden">
        <SidebarTrigger />
      </div>
      <div className="m-auto">
        <RunNotice
          variant="not-found"
          title="Run not found"
          action={
            <Link href="/" className={buttonVariants({ variant: "default" })}>
              Ask a new question
            </Link>
          }
        >
          <p>
            No run is stored under this address. The history on the left lists
            every run that is.
          </p>
        </RunNotice>
      </div>
    </main>
  );
}
