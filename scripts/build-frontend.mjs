import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(workspaceRoot, "frontend/src/index.ts")],
  outfile: resolve(workspaceRoot, "frontend/core.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  charset: "utf8",
  legalComments: "none",
  sourcemap: false,
  minify: false,
});
