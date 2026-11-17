import { readFile } from "node:fs/promises";
import path from "node:path";
import { ICON_DIR, iconType } from "@/app/lab/icons";

/**
 * One icon candidate from public/lab/icons. `next start` serves only the public files
 * that were there when it started, and a candidate arrives while the app runs.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/lab/icon/[name]">,
): Promise<Response> {
  const { name } = await context.params;
  const type = iconType(name);
  if (!type || path.basename(name) !== name) {
    return new Response(null, { status: 404 });
  }
  const bytes = await readFile(path.join(ICON_DIR, name)).catch(() => null);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(bytes, {
    headers: {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // An SVG opened on its own is a document. This keeps a script in it from running.
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
