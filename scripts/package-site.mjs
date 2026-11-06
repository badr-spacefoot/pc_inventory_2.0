import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (
  process.argv.includes("--target=vps") &&
  process.env.IT_INVENTORY_API_URL !== "https://parc-api.piqa.fr/functions/v1/inventory-api"
) {
  throw new Error("VPS package requires the parc API URL matching its Caddy policy");
}
const destination = resolve(process.argv[2] || resolve(root, "dist/site"));
await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length) throw new Error("Site output must be an empty directory");

// Publish only web assets and the documented fallback collectors, never deployment scripts or source trees.
const publicFiles = ["index.html", "theme-init.js", "app.js", "core.js", "styles.css", "collector-releases.json"];
for (const name of publicFiles) await cp(resolve(root, "frontend", name), resolve(destination, name));
await cp(resolve(root, "frontend/assets"), resolve(destination, "assets"), { recursive: true });
await mkdir(resolve(destination, "scripts"));
for (const name of ["collect-windows.ps1", "collect-cross-platform.py"]) {
  await cp(resolve(root, "scripts", name), resolve(destination, "scripts", name));
}

const configuration = {};
for (const key of ["IT_INVENTORY_API_URL", "IT_INVENTORY_SCRIPT_URL", "IT_INVENTORY_COLLECTOR_RELEASES_URL"]) {
  const value = process.env[key]?.trim();
  if (!value) continue;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${key} must be an HTTPS URL without credentials or a fragment`);
  }
  configuration[key] = url.href;
}
for (const key of ["IT_INVENTORY_STALE_DAYS", "IT_INVENTORY_WEATHER_LATITUDE", "IT_INVENTORY_WEATHER_LONGITUDE"]) {
  if (!process.env[key]) continue;
  const value = Number(process.env[key]);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  configuration[key] = value;
}
if (process.env.IT_INVENTORY_WEATHER_LOCATION) {
  configuration.IT_INVENTORY_WEATHER_LOCATION = process.env.IT_INVENTORY_WEATHER_LOCATION.slice(0, 100);
}
await writeFile(resolve(destination, "config.js"), `Object.assign(window, ${JSON.stringify(configuration)});\n`);

let html = await readFile(resolve(destination, "index.html"), "utf8");
for (const name of ["theme-init.js", "config.js", "core.js", "app.js", "styles.css"]) {
  const content = await readFile(resolve(destination, name));
  const version = createHash("sha256").update(content).digest("hex").slice(0, 16);
  html = html.replace(
    new RegExp(`((?:src|href)="(?:\\./)?${name.replace(".", "\\.")})(?:\\?[^"\\s]*)?"`, "g"),
    `$1?v=${version}"`,
  );
}
await writeFile(resolve(destination, "index.html"), html);
await writeFile(resolve(destination, "health.txt"), "ok\n");
await writeFile(resolve(destination, ".nojekyll"), "");
console.log(`Static site packaged in ${destination}`);
