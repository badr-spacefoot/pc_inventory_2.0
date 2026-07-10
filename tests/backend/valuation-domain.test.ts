import { describe, expect, it } from "vitest";

import {
  cpuTier,
  detectDeviceCategory,
  estimateLaunchPrice,
  filterMarketRowsByPrice,
  priceStats,
  replacementPriority,
  resolveMarketPriceStats,
} from "../../supabase/functions/inventory-api/domain/valuation";

describe("valuation domain", () => {
  it("classifies workstation and portable models", () => {
    expect(detectDeviceCategory({ manufacturer: "Dell", model: "Precision 5690" })).toBe("workstation");
    expect(detectDeviceCategory({ manufacturer: "Dell", model: "Latitude 7450" })).toBe("business-laptop");
  });

  it("adds RAM and dedicated GPU configuration value to launch estimates", () => {
    const base = estimateLaunchPrice({ cpu: "Intel Core Ultra 5 125H", ram_total_gb: 16 }, "business-laptop");
    const configured = estimateLaunchPrice(
      { cpu: "Intel Core Ultra 9 288V", ram_total_gb: 32, gpu: "NVIDIA RTX 4060" },
      "business-laptop",
    );
    expect(configured).toBeGreaterThan(base);
  });

  it("classifies Apple Pro chips as high tier, including M1 Pro", () => {
    expect(cpuTier("Apple M1 Pro")).toBe("high");
  });

  it("prioritizes 8 GB machines ahead of healthy 16 GB machines", () => {
    const oldEightGb = replacementPriority({ ram_total_gb: 8 }, 6, 6500, 120, "business-laptop", Date.now());
    const oldSixteenGb = replacementPriority({ ram_total_gb: 16 }, 6, 14_000, 400, "business-laptop", Date.now());
    expect(oldEightGb.score).toBeGreaterThan(oldSixteenGb.score);
    expect(oldEightGb.reasons).toContain("8-15 GB RAM");
  });

  it("filters accessories and implausibly cheap market rows", () => {
    const rows = [
      { title: "Laptop", price: 700 },
      { title: "Laptop", price: 30 },
    ];
    expect(filterMarketRowsByPrice(rows, 1500, "business-laptop")).toEqual([rows[0]]);
  });

  it("calculates stable price statistics", () => {
    expect(priceStats([500, 700, 900, 1100])).toEqual({ min: 500, avg: 800, median: 800, max: 1100, count: 4 });
  });

  it("preserves cached market evidence during an internal recalculation", () => {
    const cached = resolveMarketPriceStats(
      {
        market_observation_count: 8,
        current_market_price_min: 500,
        current_market_price_avg: 725,
        current_market_price_max: 950,
      },
      priceStats([]),
      false,
    );
    expect(cached).toEqual({
      min: 500,
      avg: 725,
      median: null,
      max: 950,
      count: 8,
    });
  });
});
