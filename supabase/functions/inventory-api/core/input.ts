import type { Json } from "./types.ts";

export function safeString(value: unknown, max = 255): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

export function safeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function safeExternalUrl(value: unknown, max = 1000): string {
  const url = safeString(value, max);
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

export function firstPresent(body: Json, ...keys: string[]): string {
  for (const key of keys) {
    const value = safeString(body[key]);
    if (value) return value;
  }
  return "";
}

export function validateEmail(
  email: string,
  allowedDomains: readonly string[],
): string {
  if (!email) return "Email requis.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    return "Adresse email invalide.";
  }
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
    return `Domaine email non autorise. Domaines acceptes: ${
      allowedDomains.join(", ")
    }`;
  }
  return "";
}

export function titleCase(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_match, prefix: string, char: string) =>
        `${prefix}${char.toLocaleUpperCase("fr-FR")}`,
    );
}

export function parseGigabytes(value: unknown): number | null {
  if (typeof value === "number") return value;
  const text = safeString(value).replace(",", ".");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function normalizeMac(value: unknown): string | null {
  const mac = safeString(value, 160).replaceAll(":", "-").toUpperCase();
  return mac || null;
}

export function normalizeScanPayload(
  body: Json,
  now = () => new Date().toISOString(),
): Json {
  const hardwareIdentity =
    (body.hardwareIdentity && typeof body.hardwareIdentity === "object"
      ? body.hardwareIdentity
      : {}) as Json;
  return {
    hostname: firstPresent(body, "hostname", "pcName"),
    osName: firstPresent(body, "osName", "osType"),
    osVersion: firstPresent(body, "osVersion", "os"),
    manufacturer: firstPresent(body, "manufacturer") ||
      firstPresent(hardwareIdentity, "manufacturer"),
    model: firstPresent(body, "model") ||
      firstPresent(hardwareIdentity, "model", "productName"),
    modelNumber: firstPresent(body, "modelNumber") ||
      firstPresent(
        hardwareIdentity,
        "systemSku",
        "productNumber",
        "baseboardProduct",
      ),
    serviceTag: firstPresent(body, "serviceTag") ||
      firstPresent(
        hardwareIdentity,
        "serviceTag",
        "biosSerialNumber",
        "chassisSerialNumber",
      ),
    serialNumber: firstPresent(body, "serialNumber", "serial") ||
      firstPresent(
        hardwareIdentity,
        "serviceTag",
        "biosSerialNumber",
        "chassisSerialNumber",
      ),
    cpu: firstPresent(body, "cpu"),
    gpu: firstPresent(body, "gpu"),
    ramTotalGb: safeNumber(body.ramTotalGb) ?? parseGigabytes(body.ram),
    storageTotalGb: safeNumber(body.storageTotalGb),
    storageFreeGb: safeNumber(body.storageFreeGb),
    storageType: firstPresent(body, "storageType"),
    macAddress: normalizeMac(body.macAddress ?? body.mac),
    localIp: firstPresent(body, "localIp", "ip"),
    windowsUser: firstPresent(body, "windowsUser", "osUser", "user"),
    collectedAt: firstPresent(body, "collectedAt", "timestamp") || now(),
    scriptVersion: firstPresent(body, "scriptVersion", "collectorVersion"),
    hardwareIdentity,
  };
}
