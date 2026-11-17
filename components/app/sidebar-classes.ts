// Shared by the server and the client parts of the sidebar, so it is a plain module.

/** One row of the sidebar: an icon that stays put and a label that fades on the rail. */
export const ROW =
  "flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-sm font-medium whitespace-nowrap text-sidebar-foreground transition-[width,background-color] duration-200 ease-out hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring active:bg-sidebar-accent motion-reduce:transition-none rail:w-9";

/** A square icon button of the rail, 36px, with the hover and focus of a row. */
export const ICON_BUTTON =
  "hidden size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring active:bg-sidebar-accent lg:flex";

/** Fades a label out on the rail, and back in once the sidebar is nearly wide again. */
export const LABEL =
  "transition-opacity delay-100 duration-150 ease-out motion-reduce:transition-none rail:opacity-0 rail:delay-0";

// Visibility waits for the fade only on the way out. On the way in it turns visible at
// once, so a field can take focus in the same click that expands the sidebar.

/** Shows an element only on the rail. It stays out of the tab order everywhere else. */
export const RAIL_ONLY =
  "invisible opacity-0 transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none rail:visible rail:opacity-100 rail:transition-opacity";

/** Hides an element on the rail, out of the tab order and away from screen readers. */
export const WIDE_ONLY =
  "transition-opacity duration-150 ease-out motion-reduce:transition-none rail:invisible rail:opacity-0 rail:transition-[opacity,visibility]";
