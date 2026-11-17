import path from "node:path";

export const ICON_DIR = path.join(process.cwd(), "public/lab/icons");

const ICON_TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

/** The media type of an icon candidate, or `undefined` for a file that is no image. */
export function iconType(file: string): string | undefined {
  return ICON_TYPES[path.extname(file).toLowerCase()];
}
