import { describe, expect, it } from "vitest";

import {
  buildMarketSearchQueries,
  marketListingMatchesDevice,
  manufacturerPriceForDevice,
} from "../../supabase/functions/inventory-api/domain/market-search";

describe("market search", () => {
  it("builds configuration-aware Dell queries", () => {
    expect(
      buildMarketSearchQueries({
        manufacturer: "Dell Inc.",
        model: "Dell 14 Plus DB14250",
        cpu: "Intel(R) Core(TM) Ultra 9 288V",
        ram_total_gb: 32,
        storage_total_gb: 930.85,
      })[0],
    ).toBe("Dell 14 Plus DB14250 Core Ultra 9 288V 32GB 1TB");
  });

  it("removes OEM noise and normalizes Apple searches", () => {
    expect(
      buildMarketSearchQueries({
        manufacturer: "Apple Inc.",
        model: "MacBook Pro 14-inch 2021 MacBookPro18,3",
        cpu: "Apple M1 Pro",
        ram_total_gb: 16,
        storage_total_gb: 494,
      })[0],
    ).toBe("Apple MacBook Pro 14 2021 M1 Pro 16GB 512GB");
  });

  it("returns the verified exact Dell configuration price only for a full match", () => {
    const exact = manufacturerPriceForDevice(
      {
        manufacturer: "Dell Inc.",
        model: "Dell 14 Plus DB14250",
        cpu: "Intel Core Ultra 9 288V",
        ram_total_gb: 32,
        storage_total_gb: 930,
      },
      "2026-07-10T00:00:00Z",
    );
    expect(exact).toMatchObject({
      current_new_price: 2098.99,
      spec_match: "exact",
    });
    expect(
      manufacturerPriceForDevice({
        manufacturer: "Dell",
        model: "DB14250",
        ram_total_gb: 16,
      }),
    ).toBeNull();
  });

  it("keeps Apple market listings on the collected RAM and storage variant", () => {
    const mac = {
      manufacturer: "Apple Inc.",
      model: "MacBook Pro 14-inch 2021",
      cpu: "Apple M1 Pro",
      ram_total_gb: 32,
      storage_total_gb: 465.92,
    };
    expect(marketListingMatchesDevice('Apple MacBook Pro 14" 2021 M1 Pro 32GB RAM 512GB SSD', mac)).toBe(true);
    expect(marketListingMatchesDevice('Apple MacBook Pro 14" 2021 M1 Pro 16GB RAM 512GB SSD', mac)).toBe(false);
    expect(marketListingMatchesDevice('Apple MacBook Pro 14" 2021 M1 Pro 32GB RAM 1TB SSD', mac)).toBe(false);
  });

  it("anchors known 2021 MacBook Pro launch prices to the collected variant", () => {
    const base = {
      manufacturer: "Apple Inc.",
      model: "MacBook Pro 14-inch 2021",
      cpu: "Apple M1 Pro",
      storage_total_gb: 465.92,
    };
    expect(manufacturerPriceForDevice({ ...base, ram_total_gb: 16 })).toMatchObject({
      list_price: 2249,
      spec_match: "configuration",
    });
    expect(manufacturerPriceForDevice({ ...base, ram_total_gb: 32 })).toMatchObject({
      list_price: 2709,
      spec_match: "configuration",
    });
  });
});
