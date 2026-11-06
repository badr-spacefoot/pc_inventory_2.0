import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(join(tmpdir(), "parc-package-test-"))) throw new Error("Unexpected cleanup path");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(overrides: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "parc-package-test-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "frontend", "assets"), { recursive: true });
  writeFileSync(join(root, "scripts", "package-site.mjs"), readFileSync(resolve("scripts/package-site.mjs")));
  for (const name of ["theme-init.js", "app.js", "core.js", "styles.css", "collector-releases.json"])
    writeFileSync(join(root, "frontend", name), `/* ${name} */`);
  writeFileSync(
    join(root, "frontend", "index.html"),
    '<script src="./theme-init.js"></script><script src="./config.js"></script><script src="./core.js?v=old"></script><script src="./app.js?v=old"></script><link href="./styles.css" rel="stylesheet">',
  );
  writeFileSync(join(root, "frontend", ".env"), "PRIVATE_SENTINEL");
  writeFileSync(join(root, "scripts", "database-migrate.py"), "PRIVATE_SENTINEL");
  for (const name of ["collect-windows.ps1", "collect-cross-platform.py"])
    writeFileSync(join(root, "scripts", name), "# harmless fixture");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("IT_INVENTORY_")) delete env[key];
  const output = join(root, "site");
  const run = () =>
    spawnSync(process.execPath, [join(root, "scripts", "package-site.mjs"), output], {
      env: { ...env, ADMIN_SESSION_SECRET: "PRIVATE_SENTINEL", ...overrides },
      encoding: "utf8",
    });
  return { root, output, run };
}
describe("static site packaging", () => {
  it("publishes an allowlisted site and content-hashed assets without server secrets", () => {
    const { output, run } = fixture({ IT_INVENTORY_API_URL: "https://parc-api.piqa.fr/functions/v1/inventory-api" });
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(output, ".env"))).toBe(false);
    expect(readdirSync(join(output, "scripts")).sort()).toEqual(["collect-cross-platform.py", "collect-windows.ps1"]);
    const config = readFileSync(join(output, "config.js"), "utf8");
    expect(config).toContain("https://parc-api.piqa.fr/functions/v1/inventory-api");
    expect(config).not.toContain("PRIVATE_SENTINEL");
    const html = readFileSync(join(output, "index.html"), "utf8");
    for (const name of ["theme-init.js", "config.js", "core.js", "app.js", "styles.css"]) {
      const hash = createHash("sha256")
        .update(readFileSync(join(output, name)))
        .digest("hex")
        .slice(0, 16);
      expect(html).toContain(`${name}?v=${hash}`);
    }
    expect(run().status).not.toBe(0);
  });
  it.each(["http://example.com/api", "https://user:password@example.com/api", "https://example.com/api#secret"])(
    "rejects unsafe endpoint %s",
    (value) => {
      const { run } = fixture({ IT_INVENTORY_API_URL: value });
      expect(run().status).not.toBe(0);
    },
  );
  it("rejects nonnumeric configuration", () => {
    const { run } = fixture({ IT_INVENTORY_STALE_DAYS: "not-a-number" });
    expect(run().status).not.toBe(0);
  });
});
