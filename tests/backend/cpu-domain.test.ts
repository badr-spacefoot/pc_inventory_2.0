import { describe, expect, it } from "vitest";

import {
  canonicalizeCpuBenchmarkSourceUrl,
  inferCpuGeneration,
  inferCpuReleaseYear,
  normalizeCpuName,
} from "../../supabase/functions/inventory-api/domain/cpu";

describe("CPU domain", () => {
  it.each([
    ["Intel(R) Core(TM) Ultra 7 256V", 2024, "Intel Core Ultra 200V"],
    ["Intel(R) Core(TM) Ultra 5 125H", 2023, "Intel Core Ultra Series 1"],
    ["13th Gen Intel(R) Core(TM) i5-1334U", 2023, "13th Gen Intel"],
    ["12th Gen Intel(R) Core(TM) i7-1260P", 2022, "12th Gen Intel"],
    ["AMD Ryzen AI 7 445 w/ Radeon 840M", 2026, "AMD Ryzen AI 400"],
    ["AMD Ryzen AI 7 350 w/ Radeon 860M", 2025, "AMD Ryzen AI 300"],
    ["Apple M1 Pro", 2021, "Apple M1 PRO"],
    ["Snapdragon(R) X Plus - X1P42100 - Qualcomm(R) Oryon(TM) CPU", 2024, "Qualcomm Snapdragon X"],
  ])("infers %s", (name, year, generation) => {
    expect(inferCpuReleaseYear(name)).toBe(year);
    expect(inferCpuGeneration(name)).toBe(generation);
  });

  it("normalizes vendor and graphics noise for benchmark matching", () => {
    expect(normalizeCpuName("AMD Ryzen 5 5600H with Radeon Graphics")).toBe("amd ryzen 5 5600h");
    expect(normalizeCpuName("Snapdragon(R) X Plus - X1P42100 - Qualcomm(R) Oryon(TM) CPU")).toBe(
      "snapdragon x plus x1p42100",
    );
  });

  it.each([
    ["11th Gen Intel(R) Core(TM) i5-11300H @ 3.10GHz", "Intel Core i5-11300H @ 3.10GHz"],
    ["12th Gen Intel(R) Core(TM) i5-12450H", "Intel Core i5-12450H"],
    ["13th Gen Intel(R) Core(TM) i5-13420H", "Intel Core i5-13420H"],
    ["AMD Ryzen 5 8540U w/ Radeon 740M Graphics", "AMD Ryzen 5 8540U"],
    ["AMD Ryzen 7 3700U with Radeon Vega Mobile Gfx", "AMD Ryzen 7 3700U"],
    ["AMD Ryzen 7 8840HS w/ Radeon 780M Graphics", "AMD Ryzen 7 8840HS"],
    ["AMD Ryzen 7 8840U w/ Radeon 780M Graphics", "AMD Ryzen 7 8840U"],
  ])("maps collector CPU name %s to the PassMark key", (collectorName, passMarkName) => {
    expect(normalizeCpuName(collectorName)).toBe(normalizeCpuName(passMarkName));
  });

  it("stores a stable PassMark detail URL when the lookup result has an id", () => {
    expect(
      canonicalizeCpuBenchmarkSourceUrl(
        "/cpu_lookup.php?cpu=Intel+Core+i5-12450H&id=4727",
        "https://www.cpubenchmark.net/cpu_lookup.php",
      ),
    ).toBe("https://www.cpubenchmark.net/cpu.php?cpu=Intel+Core+i5-12450H&id=4727");
    expect(canonicalizeCpuBenchmarkSourceUrl("https://www.cpubenchmark.net/cpu_lookup.php?cpu=Unknown")).toBe(
      "https://www.cpubenchmark.net/cpu_lookup.php?cpu=Unknown",
    );
  });
});
