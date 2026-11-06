import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

const platformSecret = "synthetic-platform-secret-01234567890123456789";
function key(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", platformSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function config() {
  const environment: Record<string, string> = {
    VERIFY_JWT: "false",
    JWT_SECRET: platformSecret,
    SUPABASE_ANON_KEY: key("anon"),
    SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
    SUPABASE_PUBLIC_URL: "https://parc-api.piqa.fr",
    ALLOWED_ORIGINS: "https://parc.piqa.fr",
  };
  for (const key of [
    "ADMIN_SESSION_SECRET",
    "COLLECTION_ACCESS_TOKEN",
    "CPU_BENCHMARK_SYNC_TOKEN",
    "CPU_RELEASE_SYNC_TOKEN",
    "ENRICHMENT_SYNC_TOKEN",
  ])
    environment[key] = `${key}-synthetic-secret-01234567890123456789`;
  return {
    name: "parc",
    networks: {
      default: { name: "parc_backend", internal: true },
      proxy: { name: "parc_proxy", external: true },
      egress: { name: "parc_egress" },
    },
    services: {
      db: {
        container_name: "parc-db",
        networks: { default: {} },
        environment: { POSTGRES_PASSWORD: "synthetic-db-password-01234567890123456789", JWT_SECRET: platformSecret },
      },
      rest: { container_name: "parc-rest", networks: { default: {} } },
      storage: { container_name: "parc-storage", networks: { default: {} } },
      "api-gw": { container_name: "parc-gateway", networks: { default: {}, proxy: {} } },
      web: { container_name: "parc-web", networks: { proxy: {} } },
      functions: { container_name: "parc-functions", environment, networks: { default: {}, egress: {} } },
    },
  };
}
function validate(value: unknown): string[] {
  const code =
    "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('preflight',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.validate_config(json.load(sys.stdin))))";
  const result = spawnSync(process.env.PYTHON || "python", ["-c", code, resolve("deploy/vps/preflight.py")], {
    input: JSON.stringify(value),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as string[];
}
describe("VPS preflight isolation gate", () => {
  it("accepts the isolated synthetic graph", () => expect(validate(config())).toEqual([]));
  it("rejects a database with published ports", () => {
    const value = config();
    Object.assign(value.services.db, { ports: [{ published: "5432", target: 5432 }] });
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects host networking even without port mappings", () => {
    const value = config();
    Object.assign(value.services.db, { network_mode: "host" });
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects database egress outside its private network", () => {
    const value = config();
    Object.assign(value.services.db.networks, { egress: {} });
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects the Docker control socket inside a service", () => {
    const value = config();
    Object.assign(value.services.db, {
      volumes: [{ type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock" }],
    });
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects a missing database service", () => {
    const value = config();
    Reflect.deleteProperty(value.services, "db");
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects the official example database password and platform secret", () => {
    const value = config();
    value.services.db.environment.POSTGRES_PASSWORD = "your-super-secret-and-long-postgres-password";
    value.services.functions.environment.JWT_SECRET = "your-super-secret-jwt-token-with-at-least-32-characters-long";
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects a service key with the wrong role or signing secret", () => {
    const value = config();
    value.services.functions.environment.SUPABASE_SERVICE_ROLE_KEY = key("anon");
    expect(validate(value).length).toBeGreaterThan(0);
    value.services.functions.environment.SUPABASE_SERVICE_ROLE_KEY = `${key("service_role")}changed`;
    expect(validate(value).length).toBeGreaterThan(0);
  });
  it("rejects reused app credentials and wildcard frontend access", () => {
    const value = config();
    value.services.functions.environment.COLLECTION_ACCESS_TOKEN =
      value.services.functions.environment.ADMIN_SESSION_SECRET!;
    value.services.functions.environment.ALLOWED_ORIGINS = "*";
    expect(validate(value).length).toBeGreaterThan(0);
  });
});
