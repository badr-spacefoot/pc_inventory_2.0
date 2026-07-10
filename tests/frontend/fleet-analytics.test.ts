import { describe, expect, it } from "vitest";

import {
  ageBucket,
  filterFleetDevices,
  fleetHealthSnapshot,
  fleetKpiSnapshot,
  fleetValuationSnapshot,
  riskScoreForDevice,
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
    expect(kpis.value).toBe(800);
    expect(kpis.averageAge).toBe(5);
    expect(kpis.devicesWithAge).toBe(2);
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

  it("uses the same actionable-device perimeter for dashboard and valuation totals", () => {
    const active = device({ resale_value: 700 });
    const stock = device({ id: "stock", status: "stock", resale_value: 900 });
    const retired = device({ id: "retired", status: "retired", resale_value: 500 });

    expect(fleetKpiSnapshot([active, stock, retired], context).value).toBe(700);
    expect(fleetValuationSnapshot([active, stock, retired], context, "Unknown").total).toBe(700);
  });
});
