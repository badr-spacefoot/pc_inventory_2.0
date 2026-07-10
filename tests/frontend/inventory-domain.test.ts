import { describe, expect, it } from "vitest";

import {
  compareVersions,
  detectDeviceFamily,
  deviceAge,
  fleetDeviceAges,
  fleetAgeSummary,
  formatCapacityGb,
  formatStorageMarketingCapacity,
  latestEnrichmentAt,
  normalizeManufacturer,
  normalizeOsInfo,
  storageMarketingCapacityGb,
} from "../../frontend/src/domain/inventory";

describe("inventory normalization", () => {
  it("normalizes compact OS families and editions", () => {
    expect(normalizeOsInfo("Microsoft Windows 11 Famille 10.0.26200")).toMatchObject({
      osFamily: "Windows 11",
      osEdition: "Home",
      iconType: "windows-11",
      buildVersion: "10.0.26200",
    });
    expect(normalizeOsInfo("Ubuntu 26.04 LTS (Resolute Raccoon)")).toMatchObject({
      osFamily: "Ubuntu",
      osVersion: "26.04 LTS",
    });
  });

  it("normalizes manufacturer aliases and detects device families", () => {
    expect(normalizeManufacturer("ASUSTeK COMPUTER INC.", "Zenbook UX425").manufacturerName).toBe("ASUS");
    expect(detectDeviceFamily("Dell", "Latitude 5450")).toBe("Latitude");
  });

  it("maps usable storage to marketed capacities", () => {
    expect(storageMarketingCapacityGb(930.85)).toBe(1024);
    expect(formatStorageMarketingCapacity(930.85, "fr-FR")).toBe("1 To");
    expect(formatCapacityGb(14.52, "fr-FR")).toBe("15 Go (14,52 Go)");
  });

  it("compares semantic collector versions", () => {
    expect(compareVersions("0.1.48", "0.1.47")).toBeGreaterThan(0);
    expect(compareVersions("missing", "0.1.47")).toBe(0);
  });

  it("uses the most reliable valid release year for device age", () => {
    expect(deviceAge({ model_release_year: 2022, release_year: 2020, cpu_release_year: 2021 }, 2026)).toBe(4);
    expect(deviceAge({ model_release_year: "invalid", release_year: 2021, cpu_release_year: 2020 }, 2026)).toBe(5);
    expect(deviceAge({ model_release_year: null, release_year: null, cpu_release_year: 2023 }, 2026)).toBe(3);
  });

  it("does not turn missing, invalid, or future release dates into zero-year devices", () => {
    expect(deviceAge({}, 2026)).toBeNull();
    expect(deviceAge({ release_year: 1979 }, 2026)).toBeNull();
    expect(deviceAge({ release_year: 2027 }, 2026)).toBeNull();
  });

  it("summarizes only current devices with usable age data", () => {
    expect(
      fleetAgeSummary(
        [
          { status: "active", model_release_year: 2022 },
          { status: "active", release_year: 2018 },
          { status: "active" },
          { status: "stock", release_year: 2015 },
          { status: "retired", release_year: 2010 },
        ],
        2026,
      ),
    ).toEqual({ averageAge: 6, devicesWithAge: 2, olderThanFour: 1 });
  });

  it("returns the same eligible ages used by fleet summaries and charts", () => {
    expect(
      fleetDeviceAges(
        [
          { status: "active", model_release_year: 2025 },
          { status: "active", cpu_release_year: 2021 },
          { status: "active" },
          { status: "stock", release_year: 2019 },
        ],
        2026,
      ),
    ).toEqual([1, 5]);
  });

  it("finds the latest valid fleet enrichment timestamp", () => {
    expect(
      latestEnrichmentAt([
        { last_enriched_at: "2026-07-08T10:00:00Z" },
        { last_enriched_at: "invalid" },
        { last_enriched_at: "2026-07-10T15:30:00Z" },
      ]),
    ).toBe("2026-07-10T15:30:00Z");
    expect(latestEnrichmentAt([])).toBeNull();
  });
});
