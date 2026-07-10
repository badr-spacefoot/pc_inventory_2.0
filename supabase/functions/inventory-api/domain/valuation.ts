export type DeviceRecord = Record<string, unknown>;
export type DeviceCategory =
  | "workstation"
  | "all-in-one"
  | "mini-pc"
  | "desktop"
  | "business-laptop";

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function safeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function detectDeviceCategory(
  device: DeviceRecord,
  cpuCategory = "",
): DeviceCategory {
  const text = [device.manufacturer, device.model, device.gpu, device.cpu]
    .map((value) => safeString(value).toLowerCase())
    .join(" ");
  if (
    /\b(workstation|precision|zbook|thinkstation|xeon|quadro|rtx a\d|firepro)\b/
      .test(text) ||
    cpuCategory === "workstation"
  ) {
    return "workstation";
  }
  if (/\b(all[- ]?in[- ]?one|aio|imac)\b/.test(text)) return "all-in-one";
  if (/\b(mini|micro|tiny|nuc|deskmini)\b/.test(text)) return "mini-pc";
  if (
    /\b(desktop|tower|optiplex|prodesk|elitedesk)\b/.test(text) ||
    cpuCategory === "desktop"
  ) {
    return "desktop";
  }
  return "business-laptop";
}

export function cpuTier(
  cpuName: string,
): "workstation" | "high" | "mid" | "entry" | "unknown" {
  const cpu = cpuName.toLowerCase().replace(/\(r\)|\(tm\)|[®™]/g, " ");
  if (/\b(i9|ryzen 9|xeon|core\s+ultra\s+9)\b/.test(cpu)) return "workstation";
  if (
    /\b(i7|ryzen 7|ryzen\s+ai\s+7|core\s+ultra\s+7|core\s+7|snapdragon\s+x\s+plus|apple m[1-4] (?:pro|max|ultra))\b/
      .test(
        cpu,
      )
  ) {
    return "high";
  }
  if (
    /\b(i5|ryzen 5|ryzen\s+ai\s+5|core\s+ultra\s+5|core\s+5|snapdragon\s+x|apple m[1-4])\b/
      .test(cpu)
  ) {
    return "mid";
  }
  if (/\b(i3|ryzen 3|ryzen\s+ai\s+3|core\s+3)\b/.test(cpu)) return "entry";
  return "unknown";
}

function hasDedicatedGpu(gpuName: string): boolean {
  const gpu = gpuName.toLowerCase();
  if (!gpu) return false;
  return !/\b(intel (?:uhd|hd|iris)|radeon graphics|microsoft basic|apple m[1-4])\b/
    .test(gpu);
}

export function estimateLaunchPrice(
  device: DeviceRecord,
  category: DeviceCategory,
): number {
  const tier = cpuTier(safeString(device.cpu));
  let price = 750;
  if (category === "business-laptop") {
    price = tier === "entry"
      ? 550
      : tier === "mid"
      ? 950
      : tier === "high"
      ? 1400
      : tier === "workstation"
      ? 2300
      : 800;
  } else if (category === "workstation") {
    price = tier === "workstation" ? 3000 : 2200;
  } else if (category === "mini-pc") {
    price = tier === "high" || tier === "workstation"
      ? 900
      : tier === "mid"
      ? 700
      : 500;
  } else if (category === "all-in-one") {
    price = tier === "high" ? 1400 : tier === "mid" ? 1000 : 750;
  } else if (category === "desktop") {
    price = tier === "workstation"
      ? 2100
      : tier === "high"
      ? 1250
      : tier === "mid"
      ? 850
      : 600;
  }
  const ram = safeNumber(device.ram_total_gb) ?? 0;
  if (ram >= 16) price += 120;
  if (ram >= 32) price += 280;
  if (ram >= 64) price += 450;
  if (hasDedicatedGpu(safeString(device.gpu))) {
    price += category === "workstation" ? 700 : 400;
  }
  return Math.round(price / 10) * 10;
}

export function depreciationFactor(age: number): number {
  if (age <= 0) return 0.85;
  if (age === 1) return 0.7;
  if (age === 2) return 0.55;
  if (age === 3) return 0.4;
  if (age === 4) return 0.3;
  if (age === 5) return 0.2;
  if (age === 6) return 0.15;
  return 0.1;
}

export function roundCurrency(value: number): number {
  return Math.max(0, Math.round(value));
}

export function replacementCostEstimate(
  launchPrice: number,
  category: DeviceCategory,
  cpuScore: number,
): number {
  let factor = 1.05;
  if (category === "workstation") factor = 1.12;
  if (category === "mini-pc") factor = 0.95;
  if (cpuScore >= 18_000) factor += 0.08;
  return Math.round((launchPrice * factor) / 10) * 10;
}

export function bookValueEstimate(launchPrice: number, age: number): number {
  const depreciationYears = 4;
  if (age >= depreciationYears) return 0;
  return roundCurrency(launchPrice * Math.max(0, 1 - age / depreciationYears));
}

export function valuationMethod(
  marketCount: number,
  hasModelEvidence: boolean,
  hasBenchmark: boolean,
  cpuReleaseYear: number | null,
): string {
  if (marketCount >= 5) return "market_verified";
  if (marketCount >= 3) return "market_blended";
  if (hasModelEvidence && hasBenchmark) return "model_matched";
  if (cpuReleaseYear) return "spec_estimate";
  return "fallback_estimate";
}

export function valuationConfidenceLabel(
  method: string,
  confidenceScore: number,
): "A" | "B" | "C" | "D" {
  if (method === "manufacturer_msrp" && confidenceScore >= 90) return "A";
  if (method === "market_verified" && confidenceScore >= 85) return "A";
  if (
    ["market_blended", "model_matched"].includes(method) &&
    confidenceScore >= 70
  ) return "B";
  if (
    ["spec_estimate", "model_matched"].includes(method) && confidenceScore >= 50
  ) return "C";
  return "D";
}

export function replacementPriority(
  device: DeviceRecord,
  age: number,
  cpuScore: number,
  currentValue: number,
  category: DeviceCategory,
  nowMs = Date.now(),
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (age >= 6) {
    score += 34;
    reasons.push("6+ years old");
  } else if (age >= 5) {
    score += 28;
    reasons.push("5 years old");
  } else if (age >= 4) {
    score += 22;
    reasons.push("4 years old");
  } else if (age >= 3) score += 15;

  if (cpuScore < 5000) {
    score += 30;
    reasons.push("very low CPU score");
  } else if (cpuScore < 8000) {
    score += 20;
    reasons.push("low CPU score");
  } else if (cpuScore < 12_000) score += 8;

  const ram = safeNumber(device.ram_total_gb) ?? 0;
  if (ram > 0 && ram < 8) {
    score += 32;
    reasons.push("less than 8 GB RAM");
  } else if (ram > 0 && ram < 16) {
    score += 20;
    reasons.push("8-15 GB RAM");
  } else if (ram >= 16 && cpuScore >= 8000) score -= 10;

  const storageType = safeString(device.storage_type).toLowerCase();
  if (storageType.includes("hdd") || storageType.includes("hard disk")) {
    score += 15;
    reasons.push("HDD storage");
  }
  const os = `${safeString(device.os_name)} ${safeString(device.os_version)}`
    .toLowerCase();
  if (os.includes("windows 10") && nowMs > Date.parse("2025-10-14T00:00:00Z")) {
    score += 15;
    reasons.push("Windows 10 support ended");
  }
  if (currentValue > 0 && currentValue < 150) score += 5;
  if (category === "workstation" && cpuScore >= 12_000) score -= 5;
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function recommendationForPriority(
  priority: number,
): "replace" | "watch" | "keep" {
  if (priority >= 70) return "replace";
  if (priority >= 45) return "watch";
  return "keep";
}

export function priceStats(prices: readonly number[]): {
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  count: number;
} {
  if (prices.length === 0) {
    return { min: null, avg: null, median: null, max: null, count: 0 };
  }
  const sorted = prices.slice().sort((left, right) => left - right);
  const medianIndex = Math.floor(sorted.length / 2);
  const lower = sorted[medianIndex - 1] ?? 0;
  const middle = sorted[medianIndex] ?? 0;
  const median = sorted.length % 2 === 0 ? (lower + middle) / 2 : middle;
  const total = sorted.reduce((sum, price) => sum + price, 0);
  return {
    min: sorted[0] ?? null,
    avg: Math.round((total / sorted.length) * 100) / 100,
    median: Math.round(median * 100) / 100,
    max: sorted.at(-1) ?? null,
    count: sorted.length,
  };
}

type MarketPriceStats = ReturnType<typeof priceStats>;

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return safeNumber(value);
}

export function resolveMarketPriceStats(
  device: DeviceRecord,
  freshStats: MarketPriceStats,
  useExternal: boolean,
): MarketPriceStats {
  if (useExternal) return freshStats;
  const count = Math.max(
    0,
    Math.round(optionalNumber(device.market_observation_count) ?? 0),
  );
  if (count === 0) return priceStats([]);
  return {
    min: optionalNumber(device.current_market_price_min),
    avg: optionalNumber(device.current_market_price_avg),
    median: null,
    max: optionalNumber(device.current_market_price_max),
    count,
  };
}

export function isExcludedMarketListing(title: string): boolean {
  const lower = title.toLowerCase();
  if (!lower) return false;
  return (
    /\b(charger|chargeur|adapter|adaptateur|battery|batterie|screen|ecran|écran|lcd|keyboard|clavier|palmrest|cover|case|housse|sleeve|skin|cable|cordon|dc jack|hinge|charniere|charnière|fan|ventilateur|motherboard|carte mere|carte mère|touchpad|trackpad|webcam|speaker|haut-parleur|bezel|bottom cover|top case|rubber feet|screw|vis)\b/i
      .test(
        lower,
      ) ||
    /\b(for parts|spares|broken|defective|defect|defekt|non fonctionnel|hors service|pour pieces|pour pièces|reparation|réparation|repair only)\b/i
      .test(
        lower,
      )
  );
}

export function marketPriceFloor(
  launchPrice: number,
  category: DeviceCategory,
): number {
  if (!Number.isFinite(launchPrice) || launchPrice <= 0) {
    return category === "mini-pc" ? 80 : 140;
  }
  const ratio = category === "mini-pc"
    ? 0.12
    : category === "desktop"
    ? 0.15
    : 0.18;
  return Math.max(
    category === "mini-pc" ? 80 : 140,
    Math.min(450, launchPrice * ratio),
  );
}

export function filterMarketRowsByPrice(
  rows: readonly DeviceRecord[],
  launchPrice: number,
  category: DeviceCategory,
): DeviceRecord[] {
  const floor = marketPriceFloor(launchPrice, category);
  return rows.filter((row) => {
    const price = safeNumber(row.price);
    return price !== null && price >= floor;
  });
}
