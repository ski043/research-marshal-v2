import type { PageUrl } from "./events";

// This module has no schema, so browser code can import it without the Zod runtime.
export function domainOf(url: PageUrl): string {
  return new URL(url).hostname.replace(/^www\./, "");
}
