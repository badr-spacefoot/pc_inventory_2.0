import type { CpuIdentity, CpuVendor } from "./types.ts";

function clean(value: unknown): string {
  return String(value || "")
    .replace(/\(R\)|\(TM\)|®|™/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReleaseName(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(
      /\b(?:with|w\/)\s+radeon(?:\s+vega)?(?:\s+\d+m)?(?:\s+mobile)?(?:\s+graphics|\s+gfx)?\b/g,
      " ",
    )
    .replace(/\bqualcomm\s+oryon(?:\s+cpu)?\b/g, " ")
    .replace(/@\s*[\d.]+\s*ghz\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectVendor(value: string): CpuVendor | null {
  const lower = value.toLowerCase();
  if (/\bintel\b|\bcore\b|\bxeon\b/.test(lower)) return "intel";
  if (/\bamd\b|\bryzen\b|\bathlon\b|\bepyc\b/.test(lower)) return "amd";
  if (/\bapple\b|\bm\d+\s*(?:pro|max|ultra)?\b/.test(lower)) return "apple";
  if (
    /\bqualcomm\b|\bsnapdragon\b|\boryon\b|\bx[12][ep]-?\d{2}-?\d{3}\b/i.test(
      lower,
    )
  ) {
    return "qualcomm";
  }
  return null;
}

function normalizeQualcommPartNumber(value: string): string | null {
  const match = value.toUpperCase().match(
    /\b(X[12][EP]|X1)\s*-?\s*(\d{2})\s*-?\s*(\d{3})\b/,
  );
  return match?.[1] && match[2] && match[3]
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

export function parseCpuIdentity(value: unknown): CpuIdentity {
  const rawName = clean(value);
  const vendor = detectVendor(rawName);
  const normalizedName = normalizeReleaseName(rawName);
  const intel = rawName.match(
    /\b(i[3579]-?\d{4,5}[A-Za-z0-9]*|Core\s+Ultra\s+[579]\s+\d{3}[A-Za-z]|Core\s+[357]\s+\d{3}[A-Za-z]?)\b/i,
  );
  const amd = rawName.match(
    /\b(Ryzen(?:\s+AI)?\s+[3579]\s+\d{3,4}[A-Za-z0-9]*)\b/i,
  );
  const apple = rawName.match(
    /\b(?:Apple\s+)?(M\d+(?:\s+(?:Pro|Max|Ultra))?)\b/i,
  );
  const qualcommPart = normalizeQualcommPartNumber(rawName);
  const model = intel?.[1] || amd?.[1] || apple?.[1] || qualcommPart;
  const suffix = model?.match(/\d([A-Za-z]{1,4})$/)?.[1]?.toUpperCase() || null;
  const family = vendor === "intel"
    ? /core\s+ultra/i.test(rawName) ? "Intel Core Ultra" : "Intel Core"
    : vendor === "amd"
    ? /ryzen\s+ai/i.test(rawName) ? "AMD Ryzen AI" : "AMD Ryzen"
    : vendor === "apple"
    ? "Apple Silicon"
    : vendor === "qualcomm"
    ? /x\s+elite/i.test(rawName) || qualcommPart?.startsWith("X1E")
      ? "Snapdragon X Elite"
      : /x\s+plus/i.test(rawName) || qualcommPart?.startsWith("X1P")
      ? "Snapdragon X Plus"
      : "Snapdragon X"
    : null;
  const aliases = new Set([
    rawName,
    normalizedName,
    model || "",
    qualcommPart || "",
  ]);
  return {
    rawName,
    vendor,
    normalizedName,
    family,
    productLine: family,
    modelNumber: model || null,
    suffix,
    partNumber: qualcommPart ||
      (vendor === "intel" ? intel?.[1] || null : amd?.[1] || null),
    appleVariant: apple?.[1] || null,
    aliases: [...aliases].filter(Boolean),
  };
}
