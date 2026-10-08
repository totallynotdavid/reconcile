// Lets plain Node run the app's TypeScript: it resolves the `@/` alias and extensionless relative imports.
// Used by tests that start separate processes, which cannot go through vitest's resolver.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = new URL("../", import.meta.url);
const files = (base) => [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base];

registerHooks({
  resolve(specifier, context, next) {
    const relative = /^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier);
    const target = specifier.startsWith("@/") ? new URL(specifier.slice(2), src) : relative ? new URL(specifier, context.parentURL) : null;
    const found = target && files(fileURLToPath(target)).find((file) => existsSync(file) && statSync(file).isFile());
    return next(found ? pathToFileURL(found).href : specifier, context);
  },
});
