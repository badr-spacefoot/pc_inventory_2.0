function boundedString(value: unknown, max = 255): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

export function normalizeCpuName(cpuName: unknown): string {
  return boundedString(cpuName, 260)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\u00ae|\u2122/g, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+gen\b/g, " ")
    .replace(
      /\b(?:with|w\/)\s+radeon(?:\s+vega)?(?:\s+\d+m)?(?:\s+mobile)?(?:\s+gfx|\s+graphics)?\b/g,
      " ",
    )
    .replace(/\bradeon\s+vega\s+mobile\s+gfx\b/g, " ")
    .replace(/\b(qualcomm|oryon|cpu|processor|graphics|gfx|@.*|series)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalizeCpuBenchmarkSourceUrl(
  sourceUrl: string,
  baseUrl?: string,
): string {
  try {
    const url = new URL(sourceUrl, baseUrl);
    if (
      /(^|\.)cpubenchmark\.net$/i.test(url.hostname) &&
      /\/cpu_lookup\.php$/i.test(url.pathname) &&
      url.searchParams.has("id")
    ) {
      url.pathname = url.pathname.replace(/cpu_lookup\.php$/i, "cpu.php");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function intelGenerationLabel(generation: number): string {
  const suffix = generation % 100 >= 11 && generation % 100 <= 13
    ? "th"
    : generation % 10 === 1
    ? "st"
    : generation % 10 === 2
    ? "nd"
    : generation % 10 === 3
    ? "rd"
    : "th";
  return `${generation}${suffix} Gen Intel`;
}

export function canonicalCpuText(cpuName: string): string {
  return cpuName
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\u00ae|\u2122/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferCpuGeneration(cpuName: string): string {
  const cpu = canonicalCpuText(cpuName);
  const intel = cpu.match(/i[3579]-?(\d{4,5})/i);
  if (intel?.[1]) {
    const digits = intel[1];
    const generation = digits.length === 5 || /^1[0-5]/.test(digits)
      ? Number(digits.slice(0, 2))
      : Number(digits[0]);
    return intelGenerationLabel(generation);
  }
  const intelCoreUltra = cpu.match(
    /\bcore\s+ultra\s+[579]\s+(\d{3})([a-z])\b/i,
  );
  if (intelCoreUltra?.[1] && intelCoreUltra[2]) {
    const model = Number(intelCoreUltra[1]);
    const suffix = intelCoreUltra[2].toUpperCase();
    if (model >= 200 && suffix === "V") return "Intel Core Ultra 200V";
    if (model >= 100 && model < 200) return "Intel Core Ultra Series 1";
    return "Intel Core Ultra";
  }
  const intelCore = cpu.match(/\bcore\s+[357]\s+(\d{3})([a-z])?\b/i);
  if (intelCore?.[1]) return `Intel Core Series ${intelCore[1][0]}`;
  const amd = cpu.match(/ryzen\s+[3579]\s+(\d{4})/i);
  if (amd?.[1]) return `Ryzen ${amd[1][0]}000`;
  const amdAi = cpu.match(/\bryzen\s+ai\s+[3579]\s+(\d{3})\b/i);
  if (amdAi?.[1]) return `AMD Ryzen AI ${amdAi[1][0]}00`;
  const apple = cpu.match(/\bapple\s+(m[1-4](?:\s+(?:pro|max|ultra))?)/i);
  if (apple?.[1]) return `Apple ${apple[1].toUpperCase()}`;
  if (/\b(snapdragon|qualcomm)\b/.test(cpu)) return "Qualcomm Snapdragon X";
  if (cpu.includes("core ultra")) return "Intel Core Ultra";
  if (cpu.includes("xeon")) return "Intel Xeon";
  return "";
}

export function inferCpuReleaseYear(cpuName: string): number | null {
  const cpu = canonicalCpuText(cpuName);
  if (/\bryzen\s+5\s+7520u\b/.test(cpu)) return 2022;
  if (/\bapple\s+m1\s+(?:pro|max)\b/.test(cpu)) return 2021;
  const intel = cpu.match(/i[3579]-?(\d{4,5})/i);
  if (intel?.[1]) {
    const digits = intel[1];
    const generation = digits.length === 5 || /^1[0-5]/.test(digits)
      ? Number(digits.slice(0, 2))
      : Number(digits[0]);
    const mobileSuffix = cpu.match(/i[3579]-?\d{4,5}([a-z]+)/i)?.[1]?.[0] || "";
    if (/[uph]/i.test(mobileSuffix)) {
      const mobileGenerationYears: Record<number, number> = {
        12: 2022,
        13: 2023,
        14: 2024,
        15: 2024,
      };
      if (mobileGenerationYears[generation]) {
        return mobileGenerationYears[generation];
      }
    }
    const byGeneration: Record<number, number> = {
      2: 2011,
      3: 2012,
      4: 2013,
      5: 2015,
      6: 2015,
      7: 2016,
      8: 2017,
      9: 2018,
      10: 2019,
      11: 2020,
      12: 2021,
      13: 2022,
      14: 2023,
      15: 2024,
    };
    return byGeneration[generation] ?? null;
  }
  if (/\bcore\s+ultra\s+[579]\s+2\d{2}v\b/.test(cpu)) return 2024;
  if (/\bcore\s+ultra\s+[579]\s+1\d{2}[hup]\b/.test(cpu)) return 2023;
  if (/\bcore\s+[357]\s+1\d{2}[hup]?\b/.test(cpu)) return 2024;
  const amd = cpu.match(/ryzen\s+[3579]\s+(\d{4})/i);
  if (amd?.[1]) {
    const family = Number(amd[1][0]);
    return ({
      1: 2017,
      2: 2018,
      3: 2019,
      4: 2020,
      5: 2021,
      6: 2022,
      7: 2023,
      8: 2024,
    } as Record<
      number,
      number
    >)[family] ?? null;
  }
  const amdAi = cpu.match(/\bryzen\s+ai\s+[3579]\s+(\d{3})\b/i);
  if (amdAi?.[1]) {
    const model = Number(amdAi[1]);
    if (model >= 400 && model < 500) return 2026;
    if (model >= 360 && model < 400) return 2024;
    if (model >= 300 && model < 500) return 2025;
  }
  const apple = cpu.match(/\bapple\s+m([1-4])/i);
  if (apple?.[1]) {
    return ({ 1: 2020, 2: 2022, 3: 2023, 4: 2024 } as Record<number, number>)[
      Number(apple[1])
    ] ?? null;
  }
  if (/\bsnapdragon(?:\s+x\s+plus)?.*\bx1p/i.test(cpu)) return 2024;
  if (/\bsnapdragon\s+x\b|\bx1-?\d{5}\b/i.test(cpu)) return 2025;
  if (cpu.includes("core ultra")) return 2023;
  return null;
}

export function estimateCpuScore(cpuName: string): number {
  const cpu = canonicalCpuText(cpuName);
  const year = inferCpuReleaseYear(cpuName) ?? 2017;
  let score = 2800 + Math.max(0, year - 2015) * 1450;
  if (
    cpu.includes("celeron") || cpu.includes("pentium") || cpu.includes("athlon")
  ) score *= 0.42;
  if (cpu.includes("i3") || cpu.includes("ryzen 3")) score *= 0.68;
  if (
    cpu.includes("i7") ||
    cpu.includes("ryzen 7") ||
    /\bcore\s+(?:ultra\s+)?7\b/.test(cpu) ||
    /\bryzen\s+ai\s+7\b/.test(cpu) ||
    cpu.includes("snapdragon x plus")
  ) {
    score *= 1.25;
  }
  if (
    cpu.includes("i9") || cpu.includes("ryzen 9") ||
    /\bcore\s+ultra\s+9\b/.test(cpu) || cpu.includes("xeon")
  ) {
    score *= 1.55;
  }
  if (
    /\bcore\s+(?:ultra\s+)?5\b/.test(cpu) || /\bryzen\s+ai\s+5\b/.test(cpu) ||
    /\bsnapdragon\s+x\b/.test(cpu)
  ) {
    score *= 1.08;
  }
  if (/\b\d{4,5}u\b/.test(cpu)) score *= 0.82;
  if (/\b\d{4,5}h[x]?\b/.test(cpu)) score *= 1.15;
  if (cpu.includes("ultra")) score *= 1.28;
  return Math.round(Math.max(800, Math.min(score, 50_000)));
}

export function inferModelReleaseYear(
  model: string,
  cpuYear: number | null,
): {
  year: number | null;
  match: "model-year" | "known-model" | "cpu-year-fallback" | "unknown";
} {
  const text = model.toLowerCase();
  const explicitYear = text.match(/\b(20(?:0[8-9]|1[0-9]|2[0-6]))\b/);
  if (explicitYear?.[1]) {
    return { year: Number(explicitYear[1]), match: "model-year" };
  }
  const knownHints: Array<[RegExp, number]> = [
    [/\b(?:latitude|precision)\s+564[05]\b/, 2024],
    [/\blatitude\s+5435\b/, 2023],
    [/\blatitude\s+5515\b/, 2021],
    [/\b(?:x1504|e1404)\b/, 2023],
    [/\bx415\b/, 2021],
  ];
  const knownModel = knownHints.find(([pattern]) => pattern.test(text));
  if (knownModel) return { year: knownModel[1], match: "known-model" };
  return { year: cpuYear, match: cpuYear ? "cpu-year-fallback" : "unknown" };
}
