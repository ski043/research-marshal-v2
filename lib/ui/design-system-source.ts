import { readFileSync } from "node:fs";
import path from "node:path";
import { type DesignSystem, designSystem } from "./design-system";

export const STYLESHEET = "app/globals.css";

/** The stylesheet that holds every token. Node.js only: a build, a script or a test. */
export function readGlobalsCss(root: string = process.cwd()): string {
  return readFileSync(path.join(root, STYLESHEET), "utf8");
}

export function loadDesignSystem(root?: string): DesignSystem {
  return designSystem(readGlobalsCss(root));
}
