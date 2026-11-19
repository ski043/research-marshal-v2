export type SidebarState = "expanded" | "collapsed";

export const SIDEBAR_KEY = "research-marshal.sidebar";

export function readSidebar(stored: string | null): SidebarState {
  return stored === "collapsed" ? "collapsed" : "expanded";
}

// The width lives in CSS, keyed on this attribute, so the script before the first paint
// and a toggle set the same thing.
export function showSidebar(state: SidebarState): void {
  const root = document.documentElement;
  if (state === "collapsed") root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
}

/** Ctrl or Cmd with Shift and the period key. Typing cannot produce it, AltGr included. */
export function isSidebarShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.code === "Period"
  );
}
