import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const isFile = (p) => existsSync(p) && statSync(p).isFile();

// Node strips types but does not resolve the `@/` alias or extensionless `.ts` imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    let base;
    if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
    else if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      !context.parentURL.includes("/node_modules/")
    )
      base = path.resolve(
        path.dirname(fileURLToPath(context.parentURL)),
        specifier,
      );
    if (base && !isFile(base)) {
      const hit = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
      ].find(isFile);
      if (hit) return nextResolve(pathToFileURL(hit).href, context);
    }
    if (base) return nextResolve(pathToFileURL(base).href, context);
    return nextResolve(specifier, context);
  },
});
