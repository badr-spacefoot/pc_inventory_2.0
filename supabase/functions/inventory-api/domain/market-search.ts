type DeviceRecord = Record<string, unknown>;

function safeString(value: unknown, max = 255): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function safeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanMarketToken(value: string): string {
  return compactSpaces(
    value
      .replace(/[\u00ae\u2122]/g, "")
      .replace(/\((?:R|TM|C)\)/gi, "")
      .replace(/[_/]+/g, " ")
      .replace(/[^\p{L}\p{N}+\-. ]/gu, " "),
  );
}

function marketManufacturerName(value: string): string {
  const manufacturer = cleanMarketToken(value);
  const lower = manufacturer.toLowerCase();
  if (
    lower.includes("asustek") || lower === "asus" ||
    /\b(zenbook|vivobook|rog|tuf)\b/i.test(manufacturer)
  ) {
    return "ASUS";
  }
  if (lower.includes("dell")) return "Dell";
  if (
    lower.includes("lenovo") ||
    /\b(thinkpad|ideapad|yoga)\b/i.test(manufacturer)
  ) return "Lenovo";
  if (lower.includes("hewlett") || lower === "hp") return "HP";
  if (lower.includes("samsung")) return "Samsung";
  if (
    lower.includes("apple") ||
    /\b(macbook|imac|mac\s+mini|mac\s+studio)\b/i.test(manufacturer)
  ) return "Apple";
  if (lower.includes("micro-star") || lower.includes("msi")) return "MSI";
  return compactSpaces(
    manufacturer
      .replace(
        /\b(inc|ltd|limited|corp|corporation|co|company|computer|electronics)\b\.?/gi,
        "",
      )
      .replace(/\b(s\.a\.|s\.a|gmbh)\b/gi, ""),
  );
}

function dedupeMarketWords(value: string): string {
  const words = compactSpaces(value).split(" ");
  const deduped: string[] = [];
  for (const word of words) {
    const previous = deduped.at(-1);
    if (previous && previous.toLowerCase() === word.toLowerCase()) continue;
    deduped.push(word);
  }
  return deduped.join(" ");
}

function marketModelName(manufacturer: string, model: string): string {
  const cleanManufacturer = marketManufacturerName(manufacturer);
  let cleanModel = cleanMarketToken(model)
    .replace(/\bASUSLaptop\b/gi, "")
    .replace(/\bLENOVO\s+MT\s+[A-Z0-9]+\s+BU\s+idea\s+FM\s+/gi, "")
    .replace(/\bMacBookPro\s*\d+[,. ]\s*\d+\b/gi, "")
    .replace(/\bMacBookAir\s*\d+[,. ]\s*\d+\b/gi, "")
    .replace(/\b(\d{2})\s*-\s*inch\b/gi, "$1")
    .replace(/\b(\d{2})\s*pouces?\b/gi, "$1")
    .replace(/\bComputer\b/gi, "")
    .replace(/\bInc\b\.?/gi, "");
  if (
    cleanManufacturer &&
    cleanModel.toLowerCase().startsWith(cleanManufacturer.toLowerCase())
  ) {
    cleanModel = compactSpaces(cleanModel.slice(cleanManufacturer.length));
  }
  return dedupeMarketWords(cleanModel);
}

function marketCpuName(cpuName: string): string {
  const cleanCpu = cleanMarketToken(cpuName)
    .replace(/\b\d+(?:st|nd|rd|th)\s+Gen\b/gi, "")
    .replace(/\bIntel\b/gi, "")
    .replace(/\bAMD\b/gi, "")
    .replace(/\bCPU\b/gi, "")
    .replace(/\bw\/\b.*$/i, "")
    .replace(/\bwith\s+Radeon\b.*$/i, "")
    .replace(/\bGraphics\b.*$/i, "");
  const ultra = cleanCpu.match(/\bCore\s+Ultra\s+\d+\s+[A-Z0-9]+/i)?.[0];
  if (ultra) return compactSpaces(ultra);
  const intelCore = cleanCpu.match(/\bCore\s+i[3579]-\d+[A-Z0-9]*/i)?.[0];
  if (intelCore) return compactSpaces(intelCore);
  const ryzen = cleanCpu.match(/\bRyzen\s+\d+\s+\d+[A-Z]*/i)?.[0];
  if (ryzen) return compactSpaces(ryzen);
  const apple =
    cleanCpu.match(/\bApple\s+M\d(?:\s+(?:Pro|Max|Ultra))?/i)?.[0] ??
      cleanCpu.match(/\bM\d(?:\s+(?:Pro|Max|Ultra))?/i)?.[0];
  if (apple) return compactSpaces(apple.replace(/^Apple\s+/i, "Apple "));
  return compactSpaces(cleanCpu.split("@")[0] || "").slice(0, 80);
}

function marketModelNumberName(
  manufacturer: string,
  modelNumber: string,
  model: string,
): string {
  const cleanManufacturer = marketManufacturerName(manufacturer);
  const cleanModelNumber = cleanMarketToken(modelNumber)
    .replace(/\bLENOVO\s+MT\s+[A-Z0-9]+\s+BU\s+idea\s+FM\s+/gi, "")
    .replace(/\bASUSLaptop\b/gi, "");
  const normalized = compactSpaces(cleanModelNumber);
  if (
    !normalized || /^1(?:\.0+)?$/i.test(normalized) ||
    /^0[A-Z0-9]{2,5}$/i.test(normalized)
  ) return "";
  if (/^[A-F0-9-]{8,}$/i.test(normalized)) return "";
  if (
    cleanManufacturer === "Apple" &&
    /\b(?:MacBookPro|MacBookAir|Macmini|iMac)\s*\d+/i.test(normalized)
  ) {
    return "";
  }
  if (model && model.toLowerCase().includes(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}

function marketBaseModel(
  manufacturer: string,
  model: string,
  modelNumber: string,
): string {
  const cleanManufacturer = marketManufacturerName(manufacturer);
  const cleanModel = marketModelName(cleanManufacturer, model);
  const cleanModelNumber = marketModelNumberName(
    cleanManufacturer,
    modelNumber,
    cleanModel,
  );
  const baseModel = cleanModel || cleanModelNumber;
  if (!cleanManufacturer) return baseModel;
  if (!baseModel) return cleanManufacturer;
  return compactSpaces(`${cleanManufacturer} ${baseModel}`);
}

function nearestCapacity(value: number, options: readonly number[]): number {
  return options.reduce(
    (
      closest,
      option,
    ) => (Math.abs(option - value) < Math.abs(closest - value)
      ? option
      : closest),
    options[0] ?? value,
  );
}

function formatMarketMemoryGb(value: unknown): string {
  const number = safeNumber(value);
  if (number === null || number <= 0) return "";
  return `${
    nearestCapacity(number, [4, 8, 12, 16, 24, 32, 48, 64, 96, 128])
  }GB`;
}

function formatMarketStorage(value: unknown): string {
  const number = safeNumber(value);
  if (number === null || number <= 0) return "";
  const nearest = nearestCapacity(number, [
    128,
    256,
    512,
    1024,
    2048,
    4096,
    8192,
  ]);
  if (nearest >= 1024) {
    const terabytes = nearest / 1024;
    return `${
      Number.isInteger(terabytes) ? terabytes : terabytes.toFixed(1)
    }TB`;
  }
  return `${nearest}GB`;
}

function uniqueMarketQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  return queries
    .map((query) => compactSpaces(query).slice(0, 100))
    .filter((query) => {
      const key = query.toLowerCase();
      if (!query || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildMarketSearchQueries(device: DeviceRecord): string[] {
  const manufacturer = marketManufacturerName(
    safeString(device.manufacturer, 160),
  );
  const model = marketModelName(manufacturer, safeString(device.model, 160));
  const modelNumber = marketModelNumberName(
    manufacturer,
    safeString(device.model_number, 160),
    model,
  );
  const cpu = marketCpuName(
    safeString(device.cpu || device.enrichment_cpu_name, 260),
  ).replace(
    manufacturer === "Apple" ? /^Apple\s+/i : /^$/,
    "",
  );
  const ram = formatMarketMemoryGb(device.ram_total_gb);
  const storage = formatMarketStorage(device.storage_total_gb);
  const baseModel = marketBaseModel(manufacturer, model, modelNumber);
  const fallbackModel = !model && modelNumber
    ? [manufacturer, modelNumber].filter(Boolean).join(" ")
    : "";
  return uniqueMarketQueries([
    [baseModel, cpu, ram, storage].filter(Boolean).join(" "),
    [baseModel, cpu, ram].filter(Boolean).join(" "),
    [baseModel, cpu].filter(Boolean).join(" "),
    [baseModel, ram, storage].filter(Boolean).join(" "),
    baseModel,
    [fallbackModel, cpu].filter(Boolean).join(" "),
  ]);
}

function hasAppleMacBookProConfiguration(device: DeviceRecord): boolean {
  const manufacturer = safeString(device.manufacturer).toLowerCase();
  const model = safeString(device.model).toLowerCase();
  return (manufacturer.includes("apple") || model.includes("macbook")) &&
    model.includes("macbook pro");
}

function listingCapacityPattern(capacityGb: number): RegExp {
  if (capacityGb >= 1024) {
    const terabytes = capacityGb / 1024;
    const value = Number.isInteger(terabytes)
      ? String(terabytes)
      : terabytes.toFixed(1).replace(".", "[.,]");
    return new RegExp(`\\b${value}\\s*(?:tb|to)\\b`, "i");
  }
  return new RegExp(`\\b${capacityGb}\\s*(?:gb|go)\\b`, "i");
}

export function marketListingMatchesDevice(
  title: string,
  device: DeviceRecord,
): boolean {
  if (!hasAppleMacBookProConfiguration(device)) return true;
  const normalizedTitle = cleanMarketToken(title);
  const model = safeString(device.model).toLowerCase();
  const cpu = marketCpuName(
    safeString(device.cpu || device.enrichment_cpu_name),
  ).replace(/^Apple\s+/i, "");
  const ram = nearestCapacity(safeNumber(device.ram_total_gb) ?? 0, [
    8,
    16,
    24,
    32,
    48,
    64,
    96,
    128,
  ]);
  const storage = nearestCapacity(safeNumber(device.storage_total_gb) ?? 0, [
    128,
    256,
    512,
    1024,
    2048,
    4096,
    8192,
  ]);
  const expectedScreen = model.match(/\b(13|14|15|16)\b/)?.[1] ?? "";
  return (
    /\bmacbook\s+pro\b/i.test(normalizedTitle) &&
    (!expectedScreen ||
      new RegExp(
        `\\b${expectedScreen}(?:[.,]\\d)?(?:\\s*(?:inch|pouces?|\"))?\\b`,
        "i",
      ).test(normalizedTitle)) &&
    (!cpu ||
      new RegExp(`\\b${escapeRegex(cpu).replace(/\\s+/g, "\\s+")}\\b`, "i")
        .test(normalizedTitle)) &&
    (ram <= 0 || listingCapacityPattern(ram).test(normalizedTitle)) &&
    (storage <= 0 || listingCapacityPattern(storage).test(normalizedTitle))
  );
}

function isDellDb14250MaxConfig(device: DeviceRecord): boolean {
  const manufacturer = safeString(device.manufacturer).toLowerCase();
  const model = `${safeString(device.model)} ${safeString(device.model_number)}`
    .toLowerCase();
  const cpu = safeString(device.cpu).toLowerCase();
  const ram = safeNumber(device.ram_total_gb) ?? 0;
  const storage = safeNumber(device.storage_total_gb) ?? 0;
  return (
    manufacturer.includes("dell") &&
    (model.includes("14 plus") || model.includes("db14250")) &&
    cpu.includes("ultra 9") &&
    cpu.includes("288v") &&
    ram >= 31 &&
    storage >= 900
  );
}

function appleMacBookPro14M1Pro2021Price(
  device: DeviceRecord,
  collectedAt: string,
) {
  const manufacturer = safeString(device.manufacturer).toLowerCase();
  const model = safeString(device.model).toLowerCase();
  const cpu = safeString(device.cpu).toLowerCase();
  const ram = safeNumber(device.ram_total_gb) ?? 0;
  const storage = safeNumber(device.storage_total_gb) ?? 0;
  if (
    !(manufacturer.includes("apple") || model.includes("macbook")) ||
    !model.includes("macbook pro") ||
    !model.includes("14") ||
    !model.includes("2021") ||
    !cpu.includes("m1 pro") ||
    ![16, 32].some((capacity) => Math.abs(ram - capacity) <= 1) ||
    storage < 450 ||
    storage > 600
  ) {
    return null;
  }
  const normalizedRam = ram >= 31 ? 32 : 16;
  const listPrice = normalizedRam === 32 ? 2709 : 2249;
  return {
    source: "apple",
    source_url:
      "https://www.apple.com/fr/newsroom/2021/10/apple-unveils-game-changing-macbook-pro/",
    current_new_price: undefined,
    list_price: listPrice,
    currency: "EUR",
    spec_match: "configuration",
    specs: {
      model: "MacBook Pro 14-inch 2021",
      cpu: "Apple M1 Pro",
      ram: `${normalizedRam} Go`,
      storage: "512 Go",
    },
    matched: { model: true, cpu: true, ram: true, storage: true },
    collected_at: collectedAt,
  };
}

export function manufacturerPriceForDevice(
  device: DeviceRecord,
  collectedAt = new Date().toISOString(),
) {
  if (isDellDb14250MaxConfig(device)) {
    return {
      source: "dell",
      source_url:
        "https://www.dell.com/fr-fr/shop/ordinateurs-portables-dell/dell-14-plus-laptop/spd/dell-db14250-laptop/cndb1425003sc",
      current_new_price: 2098.99,
      list_price: 2098.99,
      currency: "EUR",
      spec_match: "exact",
      specs: {
        cpu: "Intel Core Ultra 9 288V",
        ram: "32 Go",
        storage: "1 To",
      },
      matched: { cpu: true, ram: true, storage: true },
      collected_at: collectedAt,
    };
  }
  return appleMacBookPro14M1Pro2021Price(device, collectedAt);
}
