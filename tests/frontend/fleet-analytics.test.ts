import { describe, expect, it } from "vitest";

import {
  ageBucket,
  filterFleetDevices,
  fleetHealthSnapshot,
  fleetKpiSnapshot,
  fleetValuationSnapshot,
  isLowStorageDevice,
  riskScoreForDevice,
  replacementCandidates,
  valuationFleetDevices,
  type FleetDevice,
} from "../../frontend/src/features/fleet/analytics";

const NOW = new Date("2026-07-10T12:00:00Z").getTime();
const context = { staleDays: 30, nowMs: NOW, currentYear: 2026 };

function device(overrides: Partial<FleetDevice> = {}): FleetDevice {
  return {
    id: "device-1",
    hostname: "WORKSTATION-1",
    status: "active",
    manufacturer: "Dell Inc.",
    model: "Latitude 7450",
    team_name: "IT",
    establishment_name: "Paris",
    os_name: "Microsoft Windows 11 Home",
    last_seen_at: "2026-07-09T12:00:00Z",
    release_year: 2024,
    ram_total_gb: 16,
    cpu_score: 14_000,
    storage_free_gb: 120,
    ...overrides,
  };
}

describe("fleet analytics", () => {
  it("filters PCs in repair without removing them from their team or fleet valuation", () => {
    const active = device();
    const repairing = device({
      id: "repairing",
      status: "in_repair",
      resale_value: 500,
      replacement_priority: 95,
      last_seen_at: "2020-01-01T00:00:00Z",
      storage_free_gb: 0,
    });
    const filtered = filterFleetDevices(
      [active, repairing],
      { status: "in_repair", team: "IT" },
      "last_seen",
      context,
      "en-US",
    );

    expect(filtered).toEqual([repairing]);
    expect(fleetKpiSnapshot(filtered, context)).toMatchObject({
      value: 500,
      actionable: 0,
      replace: 0,
      stale: 0,
      lowStorage: 0,
    });
    expect(replacementCandidates(filtered, context)).toEqual([]);
  });

  it("flags a full disk while keeping missing storage out of alerts", () => {
    expect(isLowStorageDevice(device({ storage_free_gb: 0 }))).toBe(true);
    expect(isLowStorageDevice(device({ storage_free_gb: "0" }))).toBe(true);
    expect(isLowStorageDevice(device({ storage_free_gb: null }))).toBe(false);
    expect(isLowStorageDevice(device({ storage_free_gb: "" }))).toBe(false);
    expect(isLowStorageDevice(device({ storage_free_gb: 30 }))).toBe(false);
    expect(isLowStorageDevice(device({ storage_free_gb: -1 }))).toBe(false);
  });
  it("keeps detached inventory out of team filters and age-only views", () => {
    const active = device();
    const stock = device({ id: "stock", status: "stock", hostname: "STOCK-1" });

    expect(filterFleetDevices([active, stock], { team: "IT" }, "last_seen", context, "fr-FR")).toEqual([active]);
    expect(filterFleetDevices([active, stock], { age: "recent" }, "last_seen", context, "fr-FR")).toEqual([active]);
  });

  it("preserves status grouping before the selected secondary sort", () => {
    const activeZulu = device({ id: "z", hostname: "ZULU" });
    const stockAlpha = device({ id: "a", hostname: "ALPHA", status: "stock" });

    expect(
      filterFleetDevices([stockAlpha, activeZulu], {}, "hostname", context, "en-US").map((item) => item.id),
    ).toEqual(["z", "a"]);
  });

  it("prioritizes old low-memory devices without forcing healthy 16 GB devices to replacement", () => {
    const eightGb = device({ release_year: 2019, ram_total_gb: 8, cpu_score: 6000 });
    const sixteenGb = device({ release_year: 2019, ram_total_gb: 16, cpu_score: 14_000 });

    expect(ageBucket(eightGb, context)).toBe("old");
    expect(ageBucket(sixteenGb, context)).toBe("aging");
    expect(riskScoreForDevice(eightGb, context)).toBeGreaterThan(riskScoreForDevice(sixteenGb, context));
  });

  it("computes actionable KPIs and health independently from retired stock", () => {
    const healthy = device({ resale_value: 700 });
    const staleWindows10 = device({
      id: "stale",
      os_name: "Windows 10 Pro",
      last_seen_at: "2026-05-01T12:00:00Z",
      storage_free_gb: 12,
      cpu_score: 6000,
      release_year: 2018,
      resale_value: 100,
    });
    const stock = device({ id: "stock", status: "stock", resale_value: 900 });

    const kpis = fleetKpiSnapshot([healthy, staleWindows10, stock], context);
    const health = fleetHealthSnapshot([healthy, staleWindows10, stock], context);

    expect(kpis).toMatchObject({ total: 3, actionable: 2, active: 2, stale: 1, lowStorage: 1, windows10: 1 });
    expect(kpis.value).toBe(1700);
    expect(kpis.averageAge).toBe(4);
    expect(kpis.devicesWithAge).toBe(3);
    expect(kpis.olderThanFour).toBe(1);
    expect(health.stale).toBe(1);
    expect(health.replace).toBe(1);
    expect(health.level).not.toBe("ok");
  });

  it("returns an empty age result instead of zero when no usable age data exists", () => {
    const withoutAge = device({ model_release_year: null, release_year: null, cpu_release_year: null });
    const future = device({ id: "future", release_year: 2030 });

    expect(fleetKpiSnapshot([withoutAge, future], context)).toMatchObject({
      averageAge: null,
      devicesWithAge: 0,
      olderThanFour: 0,
    });
  });

  it("includes stock in dashboard and valuation totals while excluding lost and retired assets", () => {
    const active = device({ resale_value: 700 });
    const stock = device({ id: "stock", status: "stock", resale_value: 900 });
    const retired = device({ id: "retired", status: "retired", resale_value: 500 });
    const lost = device({ id: "lost", status: "lost", resale_value: 400 });
    const devices = [active, stock, retired, lost];

    expect(fleetKpiSnapshot(devices, context).value).toBe(1600);
    expect(fleetValuationSnapshot(devices, context, "Unknown")).toMatchObject({ total: 1600, average: 800 });
    expect(valuationFleetDevices(devices)).toEqual([active, stock]);
  });

  it("preserves stock-only valuation and age without adding active replacement alerts", () => {
    const stock = device({
      id: "stock",
      status: "stock",
      resale_value: 900,
      estimated_launch_price: 1800,
      release_year: 2019,
      replacement_priority: 90,
      last_seen_at: "2020-01-01T00:00:00Z",
    });
    const filtered = filterFleetDevices([device(), stock], { status: "stock" }, "last_seen", context, "en-US");

    expect(valuationFleetDevices(filtered)).toEqual([stock]);
    expect(fleetKpiSnapshot(filtered, context)).toMatchObject({
      value: 900,
      averageAge: 7,
      devicesWithAge: 1,
      olderThanFour: 1,
      actionable: 0,
      replace: 0,
      stale: 0,
    });
    expect(fleetValuationSnapshot(filtered, context, "Unknown")).toEqual({
      total: 900,
      average: 900,
      replaceValue: 0,
      byLocation: [{ label: "Paris", value: 900, percent: 100 }],
    });
    expect(replacementCandidates(filtered, context)).toEqual([]);
    expect(fleetValuationSnapshot([], context, "Unknown")).toEqual({
      total: 0,
      average: 0,
      replaceValue: 0,
      byLocation: [],
    });
  });
});
