export interface OperatingSystemInfo {
  osFamily: string;
  osVersion: string;
  osEdition: string;
  buildVersion: string;
  displayLabel: string;
  iconType: string;
  badgeClass: string;
  rawOsString: string;
}

export interface ManufacturerInfo {
  manufacturerName: string;
  normalizedName: string;
  logoType: string;
  badgeClass: string;
  colorClass: string;
  rawManufacturer: string;
}

export interface ValuationDevice {
  status?: string | null;
  last_enriched_at?: string | null;
  release_year?: number | string | null;
  model_release_year?: number | string | null;
  cpu_release_year?: number | string | null;
  cpu_release_period_start?: string | null;
  cpu_release_period_end?: string | null;
  cpu_release_precision?: string | null;
  cpu_release_event_type?: string | null;
  cpu_release_display?: string | null;
  cpu_release_source_type?: string | null;
  cpu_release_source_url?: string | null;
  cpu_release_match_scope?: string | null;
  cpu_release_match_method?: string | null;
  cpu_release_confidence?: number | string | null;
  cpu_release_is_official?: boolean | null;
  cpu_release_last_verified_at?: string | null;
  cpu_release_vendor?: string | null;
  cpu_release_canonical_name?: string | null;
  cpu_release_source_title?: string | null;
  cpu_release_raw_value?: string | null;
  resale_value?: number | string | null;
  estimated_current_value?: number | string | null;
  current_market_price_avg?: number | string | null;
  current_new_price?: number | string | null;
  estimated_launch_price?: number | string | null;
  cpu_score?: number | string | null;
}

export interface FleetAgeSummary {
  averageAge: number | null;
  devicesWithAge: number;
  olderThanFour: number;
}

const MANUFACTURER_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["Surface", /\bsurface\b/],
  ["Dell", /\bdell\b/],
  ["HP", /\b(hp|hewlett[- ]?packard)\b/],
  ["Lenovo", /\blenovo\b/],
  ["ASUS", /\b(asus|asustek)\b/],
  ["Acer", /\bacer\b/],
  ["Apple", /\bapple\b/],
  ["Microsoft", /\bmicrosoft\b/],
  ["MSI", /\b(msi|micro-star)\b/],
  ["Samsung", /\bsamsung\b/],
  ["Fujitsu", /\bfujitsu\b/],
  ["Dynabook", /\bdynabook\b/],
  ["Toshiba", /\btoshiba\b/],
  ["Huawei", /\bhuawei\b/],
  ["Framework", /\bframework\b/],
  ["Intel NUC", /\b(intel.*nuc|nuc)\b/],
  ["Gigabyte", /\bgigabyte\b/],
];

const DEVICE_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  Dell: ["Latitude", "Precision", "OptiPlex", "XPS"],
  HP: ["EliteBook", "ProBook", "ZBook", "EliteDesk"],
  Lenovo: ["ThinkPad", "ThinkCentre", "ThinkBook"],
  Apple: ["MacBook Air", "MacBook Pro", "iMac", "Mac Mini"],
  Microsoft: ["Surface Laptop", "Surface Pro", "Surface Studio", "Surface"],
  Surface: ["Surface Laptop", "Surface Pro", "Surface Studio", "Surface"],
};

const STATUS_RANKS: Readonly<Record<string, number>> = {
  active: 0,
  replace: 1,
  lost: 2,
  stock: 3,
  retired: 4,
};

function localeNumber(value: number, locale: string, maximumFractionDigits: number): string {
  return value.toLocaleString(locale, { maximumFractionDigits });
}

export function normalizeOsInfo(osValue: unknown): OperatingSystemInfo {
  const original = String(osValue || "").trim();
  const normalized = original.toLowerCase();
  const buildVersion = original.match(/\b\d+\.\d+\.\d+(?:\.\d+)?\b/)?.[0] || "";
  let osFamily = "Unknown";
  let iconType = "unknown";
  let osVersion = "";

  if (normalized.includes("windows server")) {
    osVersion = original.match(/Windows Server\s*(\d{4})?/i)?.[1] || "";
    osFamily = "Windows Server";
    iconType = "windows-server";
  } else if (normalized.includes("windows 11")) {
    osFamily = "Windows 11";
    iconType = "windows-11";
  } else if (normalized.includes("windows 10")) {
    osFamily = "Windows 10";
    iconType = "windows-10";
  } else if (/\bubuntu\b/.test(normalized)) {
    osFamily = "Ubuntu";
    osVersion = original.match(/\b\d{2}\.\d{2}(?:\.\d+)?(?:\s+LTS)?/i)?.[0] || "";
    iconType = "ubuntu";
  } else if (/\b(debian|fedora|linux)\b/.test(normalized)) {
    osFamily = normalized.includes("debian") ? "Debian" : normalized.includes("fedora") ? "Fedora" : "Linux";
    osVersion = original.match(/\b\d+(?:\.\d+){1,2}\b/)?.[0] || "";
    iconType = "linux";
  } else if (/\b(macos|mac os|darwin|sonoma|ventura|monterey|sequoia)\b/.test(normalized)) {
    osFamily = "macOS";
    const releaseName = original.match(/\b(Sequoia|Sonoma|Ventura|Monterey)\b/i)?.[0] || "";
    const releaseNumber = original.match(/\b\d{1,2}\.\d+(?:\.\d+)?\b/)?.[0] || "";
    osVersion = [releaseName, releaseNumber].filter(Boolean).join(" ");
    iconType = "macos";
  }

  let osEdition = "Unknown";
  if (/\b(enterprise|entreprise)\b/.test(normalized)) osEdition = "Enterprise";
  else if (/\b(education|educational)\b/.test(normalized)) osEdition = "Education";
  else if (/\b(professionnel|professional|pro)\b/.test(normalized)) osEdition = "Pro";
  else if (/\b(famille|home)\b/.test(normalized)) osEdition = "Home";

  return {
    osFamily,
    osVersion,
    osEdition,
    buildVersion,
    displayLabel: [osFamily, osVersion, osEdition === "Unknown" ? "" : osEdition].filter(Boolean).join(" "),
    iconType,
    badgeClass: `os-${iconType}`,
    rawOsString: original,
  };
}

export function roundedCapacityGb(value: unknown): number | "" {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const common = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
  const match = common.find((candidate) => Math.abs(numeric - candidate) / candidate <= 0.08);
  return match || Math.round(numeric);
}

export function formatCapacityGb(value: unknown, locale: string, suffix = "Go"): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const rounded = roundedCapacityGb(numeric);
  if (rounded && Math.abs(rounded - numeric) >= 0.1) {
    return `${rounded} ${suffix} (${localeNumber(numeric, locale, 2)} ${suffix})`;
  }
  return `${localeNumber(numeric, locale, 2)} ${suffix}`;
}

export function formatStorageUsableGb(value: unknown, locale: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return `${localeNumber(numeric, locale, numeric >= 100 ? 0 : 1)} Go`;
}

export function storageMarketingCapacityGb(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const common = [64, 128, 256, 512, 1024, 1536, 2048, 4096, 8192];
  return (
    common.find((candidate) => numeric >= candidate * 0.88 && numeric <= candidate * 1.02) ||
    Number(roundedCapacityGb(numeric))
  );
}

export function formatStorageMarketingCapacity(value: unknown, locale: string): string {
  const capacity = storageMarketingCapacityGb(value);
  if (!capacity) return "";
  if (capacity >= 1024) return `${localeNumber(capacity / 1024, locale, 1)} To`;
  return `${capacity} Go`;
}

export function normalizeManufacturer(manufacturerValue: unknown, modelValue: unknown = ""): ManufacturerInfo {
  const rawManufacturer = String(manufacturerValue || "").trim();
  const searchable = `${rawManufacturer} ${String(modelValue || "")}`.toLowerCase();
  const generic = /^(|system manufacturer|default string|to be filled by o\.e\.m\.|unknown|not available|oem)$/i;
  const matched = generic.test(rawManufacturer)
    ? undefined
    : MANUFACTURER_RULES.find(([, pattern]) => pattern.test(searchable));
  const manufacturerName = matched?.[0] || "Unknown";
  const normalizedName = manufacturerName.toLowerCase().replaceAll(" ", "-");
  return {
    manufacturerName,
    normalizedName,
    logoType: normalizedName,
    badgeClass: `manufacturer-badge oem-${normalizedName}`,
    colorClass: `oem-${normalizedName}`,
    rawManufacturer,
  };
}

export function detectDeviceFamily(manufacturer: string, modelValue: unknown): string {
  const model = String(modelValue || "").toLowerCase();
  return DEVICE_FAMILIES[manufacturer]?.find((family) => model.includes(family.toLowerCase())) || "";
}

export function deviceStatusRank(status: unknown): number {
  return STATUS_RANKS[String(status || "active")] ?? 5;
}

export function deviceRowStatusClass(status: unknown): string {
  return `device-row-status-${String(status || "active")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .toLowerCase()}`;
}

export function isMissingInventoryValue(value: unknown): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return !normalized || ["-", "unknown", "none", "null", "undefined", "n/a"].includes(normalized);
}

export function versionParts(value: unknown): [number, number, number] | null {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left: unknown, right: unknown): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

const NON_AGE_ACTIONABLE_STATUSES = new Set(["retired", "stock", "lost"]);

export function reliableDeviceReleaseYear(
  device: ValuationDevice,
  currentYear = new Date().getFullYear(),
): number | null {
  const candidates = [device.model_release_year, device.release_year, device.cpu_release_year];
  for (const candidate of candidates) {
    const year = Number(candidate);
    if (Number.isInteger(year) && year >= 1980 && year <= currentYear) return year;
  }
  return null;
}

export function deviceAge(device: ValuationDevice, currentYear = new Date().getFullYear()): number | null {
  const releaseYear = reliableDeviceReleaseYear(device, currentYear);
  return releaseYear === null ? null : currentYear - releaseYear;
}

export function isFleetAgeEligible(device: ValuationDevice): boolean {
  return !NON_AGE_ACTIONABLE_STATUSES.has(String(device.status || ""));
}

export function fleetDeviceAges(devices: readonly ValuationDevice[], currentYear = new Date().getFullYear()): number[] {
  return devices
    .filter(isFleetAgeEligible)
    .map((device) => deviceAge(device, currentYear))
    .filter((age): age is number => age !== null);
}

export function fleetAgeSummary(
  devices: readonly ValuationDevice[],
  currentYear = new Date().getFullYear(),
): FleetAgeSummary {
  const ages = fleetDeviceAges(devices, currentYear);
  return {
    averageAge: ages.length ? Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10 : null,
    devicesWithAge: ages.length,
    olderThanFour: ages.filter((age) => age > 4).length,
  };
}

export function estimatedValue(device: ValuationDevice): number {
  return Number(
    device.resale_value ||
      device.estimated_current_value ||
      device.current_market_price_avg ||
      device.current_new_price ||
      device.estimated_launch_price ||
      0,
  );
}

export function latestEnrichmentAt(devices: readonly ValuationDevice[]): string | null {
  let latestTimestamp = 0;
  let latestValue: string | null = null;
  devices.forEach((device) => {
    const value = String(device.last_enriched_at || "").trim();
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp) || timestamp <= latestTimestamp) return;
    latestTimestamp = timestamp;
    latestValue = value;
  });
  return latestValue;
}

export function cpuScoreBucket(device: ValuationDevice): "" | "low" | "medium" | "high" {
  const score = Number(device.cpu_score || 0);
  if (!score) return "";
  if (score < 7000) return "low";
  if (score < 12000) return "medium";
  return "high";
}

export function valueBucket(device: ValuationDevice): "" | "low" | "medium" | "high" {
  const value = estimatedValue(device);
  if (!value) return "";
  if (value < 180) return "low";
  if (value <= 350) return "medium";
  return "high";
}
