import { describe, expect, it } from "vitest";
import { AmdReleaseAdapter } from "../../supabase/functions/inventory-api/domain/cpu-release/adapters/amd.ts";
import { AppleReleaseAdapter } from "../../supabase/functions/inventory-api/domain/cpu-release/adapters/apple.ts";
import { IntelReleaseAdapter } from "../../supabase/functions/inventory-api/domain/cpu-release/adapters/intel.ts";
import { QualcommReleaseAdapter } from "../../supabase/functions/inventory-api/domain/cpu-release/adapters/qualcomm.ts";
import { parseReleasePeriod } from "../../supabase/functions/inventory-api/domain/cpu-release/date-parser.ts";
import type {
  CpuReleaseHttpClient,
  HttpTextResponse,
} from "../../supabase/functions/inventory-api/domain/cpu-release/http-client.ts";
import { BoundedCpuReleaseHttpClient } from "../../supabase/functions/inventory-api/domain/cpu-release/http-client.ts";
import { parseCpuIdentity } from "../../supabase/functions/inventory-api/domain/cpu-release/normalize.ts";
import { resolveCpuRelease } from "../../supabase/functions/inventory-api/domain/cpu-release/resolver.ts";
import { shouldAcceptOfficialRecord } from "../../supabase/functions/inventory-api/domain/cpu-release/quality.ts";
import {
  shouldSynchronizeCpuRelease,
  synchronizeCpuReleaseCatalog,
  type CpuReleaseSyncStore,
} from "../../supabase/functions/inventory-api/domain/cpu-release/sync.ts";
import { hasCpuReleaseSyncToken } from "../../supabase/functions/inventory-api/domain/cpu-release/authorization.ts";
import type {
  CpuReleaseAdapter,
  CpuReleaseCatalogRow,
  CpuReleaseResolution,
  OfficialCpuReleaseRecord,
  VendorSyncResult,
} from "../../supabase/functions/inventory-api/domain/cpu-release/types.ts";

class FixtureClient implements CpuReleaseHttpClient {
  constructor(private readonly fixtures: Record<string, string>) {}

  async getText(url: string): Promise<HttpTextResponse> {
    const body = this.fixtures[url];
    if (!body) throw new Error(`Missing fixture: ${url}`);
    return { url, body, status: 200, etag: '"fixture"', lastModified: null };
  }
}

describe("CPU release period parsing", () => {
  it.each([
    ["1/6/2020", "en-US", "2020-01-06", "2020-01-06", "day"],
    ["Q3'20", "en-US", "2020-07-01", "2020-09-30", "quarter"],
    ["05/03/2023", "en-US", "2023-05-03", "2023-05-03", "day"],
    ["Q3 2024", "en-US", "2024-07-01", "2024-09-30", "quarter"],
    ["Mid-2024", "en-US", "2024-04-01", "2024-09-30", "half_year"],
    ["Apr 24, 2024", "en-US", "2024-04-24", "2024-04-24", "day"],
    ["2024", "en-US", "2024-01-01", "2024-12-31", "year"],
  ] as const)("preserves precision for %s", (raw, locale, start, end, precision) => {
    const period = parseReleasePeriod(raw, locale);
    expect(period).toMatchObject({ periodStart: start, periodEnd: end, precision });
  });

  it("accepts leap days and rejects invalid calendar dates", () => {
    expect(parseReleasePeriod("02/29/2024", "en-US").periodStart).toBe("2024-02-29");
    expect(parseReleasePeriod("02/29/2023", "en-US").precision).toBe("unknown");
    expect(parseReleasePeriod("13/40/2024", "en-US").precision).toBe("unknown");
  });
});

describe("official vendor adapters", () => {
  it("reads the exact AMD Ryzen 5 4500U launch date from general specifications", async () => {
    const url = "https://www.amd.com/amd-ryzen-5-4500u.html";
    const adapter = new AmdReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>AMD Ryzen 5 4500U</title></head><body>
        <div>Name</div><div>AMD Ryzen 5 4500U</div><div>Family</div><div>Ryzen</div>
        <div>Series</div><div>Ryzen 4000 Series</div><div>Launch Date</div><div>1/6/2020</div>
        <div>Product ID Tray</div><div>100-000000084</div></body></html>`,
      }),
    );
    const result = await adapter.resolve(parseCpuIdentity("AMD Ryzen 5 4500U with Radeon Graphics"), [url]);
    expect(result).toMatchObject({
      effectivePeriodStart: "2020-01-06",
      effectivePeriodEnd: "2020-01-06",
      releasePrecision: "day",
      releaseEventType: "launch",
      sourceType: "amd-product-specification",
    });
  });

  it("falls back to verifiable official AMD product URLs when the sitemap is unavailable", async () => {
    const identity = parseCpuIdentity("AMD Ryzen 5 4500U with Radeon Graphics");
    const discovered = await new AmdReleaseAdapter(new FixtureClient({})).discover([identity], syncOptions);
    expect(discovered.get(identity.normalizedName)).toContain(
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-4000-series/amd-ryzen-5-4500u.html",
    );
  });

  it("preserves an exact verified AMD reference when the official CDN is unavailable", async () => {
    const identity = parseCpuIdentity("AMD Ryzen 5 4500U with Radeon Graphics");
    const adapter = new AmdReleaseAdapter(new FixtureClient({}));
    const discovered = await adapter.discover([identity], syncOptions);
    const result = await adapter.resolve(identity, discovered.get(identity.normalizedName) ?? []);
    expect(result).toMatchObject({
      effectivePeriodStart: "2020-01-06",
      releasePrecision: "day",
      rawReleaseValue: "1/6/2020",
      sourceUrl: expect.stringContaining("amd-ryzen-5-4500u.html"),
      isOfficial: true,
    });
  });

  it("reads Intel ARK quarter values without converting them to an invented day", async () => {
    const url = "https://www.intel.com/i7-1165g7/specifications.html";
    const adapter = new IntelReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>Intel Core i7-1165G7 Processor</title></head><body>
        <div>Processor Number</div><div>i7-1165G7</div><div>Launch Date</div><div>Q3'20</div>
      </body></html>`,
      }),
    );
    const result = await adapter.resolve(parseCpuIdentity("Intel(R) Core(TM) i7-1165G7"), [url]);
    expect(result).toMatchObject({
      effectivePeriodStart: "2020-07-01",
      effectivePeriodEnd: "2020-09-30",
      releasePrecision: "quarter",
      releaseDisplay: "Q3 2020",
      sourceType: "intel-ark-product-specification",
    });
  });

  it("preserves the exact Intel ARK quarter when discovery is unavailable", async () => {
    const identity = parseCpuIdentity("Intel(R) Core(TM) i7-1165G7 @ 2.80GHz");
    const adapter = new IntelReleaseAdapter(new FixtureClient({}));
    const discovered = await adapter.discover([identity], syncOptions);
    const result = await adapter.resolve(identity, discovered.get(identity.normalizedName) ?? []);
    expect(result).toMatchObject({
      effectivePeriodStart: "2020-07-01",
      effectivePeriodEnd: "2020-09-30",
      releasePrecision: "quarter",
      rawReleaseValue: "Q3'20",
      sourceUrl: expect.stringContaining("208921"),
      isOfficial: true,
    });
  });

  it.each([
    ["AMD Ryzen 5 5500U with Radeon Graphics", "2021-01-12", "launch"],
    ["AMD Ryzen 5 5600H with Radeon Graphics", "2021-01-12", "launch"],
    ["AMD Ryzen 5 7520U with Radeon Graphics", "2022-09-20", "launch"],
    ["AMD Ryzen 7 3700U with Radeon Vega Mobile Gfx", "2019-01-01", "launch"],
    ["AMD Ryzen 7 5700U with Radeon Graphics", "2021-01-12", "launch"],
    ["AMD Ryzen 7 5800H with Radeon Graphics", "2021-01-12", "launch"],
    ["AMD Ryzen 7 7730U with Radeon Graphics", "2023-01-01", "launch"],
    ["AMD Ryzen 5 8540U w/ Radeon 740M Graphics", "2024-01-01", "expected_availability"],
    ["AMD Ryzen 7 8840HS w/ Radeon 780M Graphics", "2024-01-01", "expected_availability"],
    ["AMD Ryzen 7 8840U w/ Radeon 780M Graphics", "2024-01-01", "expected_availability"],
    ["AMD Ryzen AI 7 350 w/ Radeon 860M", "2025-02-18", "launch"],
    ["AMD Ryzen AI 7 445 w/ Radeon 840M", "2026-01-05", "launch"],
  ] as const)(
    "retains the verified AMD manufacturer period for %s when the CDN is unavailable",
    async (cpu, start, eventType) => {
      const identity = parseCpuIdentity(cpu);
      const adapter = new AmdReleaseAdapter(new FixtureClient({}));
      const discovered = await adapter.discover([identity], syncOptions);
      const result = await adapter.resolve(identity, discovered.get(identity.normalizedName) ?? []);
      expect(result).toMatchObject({
        effectivePeriodStart: start,
        releaseEventType: eventType,
        isOfficial: true,
        matchScope: "exact_name",
      });
      expect(result?.sourceUrl).toMatch(/^https:\/\/www\.amd\.com\//);
    },
  );

  it.each([
    ["Intel(R) Core(TM) i3-10110U CPU @ 2.10GHz", "2019-07-01"],
    ["Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz", "2019-07-01"],
    ["Intel(R) Core(TM) i5-1035G1 CPU @ 1.00GHz", "2019-07-01"],
    ["11th Gen Intel(R) Core(TM) i5-11300H", "2021-01-01"],
    ["11th Gen Intel(R) Core(TM) i5-1135G7", "2020-07-01"],
    ["12th Gen Intel(R) Core(TM) i5-12450H", "2022-01-01"],
    ["12th Gen Intel(R) Core(TM) i7-1250U", "2022-01-01"],
    ["12th Gen Intel(R) Core(TM) i7-1255U", "2022-01-01"],
    ["12th Gen Intel(R) Core(TM) i7-1260P", "2022-01-01"],
    ["13th Gen Intel(R) Core(TM) i5-1334U", "2023-01-01"],
    ["13th Gen Intel(R) Core(TM) i5-1335U", "2023-01-01"],
    ["13th Gen Intel(R) Core(TM) i5-13420H", "2023-01-01"],
    ["13th Gen Intel(R) Core(TM) i7-1355U", "2023-01-01"],
    ["Intel(R) Core(TM) 7 150U", "2024-01-01"],
    ["Intel(R) Core(TM) i5-7200U", "2016-07-01"],
    ["Intel(R) Core(TM) i5-8250U", "2017-07-01"],
    ["Intel(R) Core(TM) Ultra 5 125H", "2023-10-01"],
    ["Intel(R) Core(TM) Ultra 5 226V", "2024-07-01"],
    ["Intel(R) Core(TM) Ultra 7 155H", "2023-10-01"],
    ["Intel(R) Core(TM) Ultra 7 165U", "2023-10-01"],
    ["Intel(R) Core(TM) Ultra 7 256V", "2024-07-01"],
    ["Intel(R) Core(TM) Ultra 7 258V", "2024-07-01"],
    ["Intel(R) Core(TM) Ultra 9 288V", "2024-07-01"],
  ] as const)("retains the verified Intel manufacturer quarter for %s when ARK is unavailable", async (cpu, start) => {
    const identity = parseCpuIdentity(cpu);
    const adapter = new IntelReleaseAdapter(new FixtureClient({}));
    const discovered = await adapter.discover([identity], syncOptions);
    const result = await adapter.resolve(identity, discovered.get(identity.normalizedName) ?? []);
    expect(result).toMatchObject({
      effectivePeriodStart: start,
      releasePrecision: "quarter",
      releaseEventType: "launch",
      isOfficial: true,
      matchScope: "exact_name",
    });
    expect(result?.sourceUrl).toMatch(/^https:\/\/www\.intel\.com\//);
  });

  it("matches Intel Core i5-1135G7 by exact processor number", async () => {
    const url = "https://www.intel.com/i5-1135g7/specifications.html";
    const result = await new IntelReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>Intel Core i5-1135G7 Processor</title></head><body>
        <div>Processor Number</div><div>i5-1135G7</div><div>Launch Date</div><div>Q3'20</div>
      </body></html>`,
      }),
    ).resolve(parseCpuIdentity("11th Gen Intel(R) Core(TM) i5-1135G7"), [url]);
    expect(result).toMatchObject({
      partNumber: "i5-1135G7",
      effectivePeriodStart: "2020-07-01",
      effectivePeriodEnd: "2020-09-30",
      releasePrecision: "quarter",
      matchScope: "exact_name",
    });
  });

  it("discovers 11th-generation Intel CPUs through the official ARK family index", async () => {
    const indexUrl = "https://www.intel.com/content/www/us/en/ark.html";
    const seriesUrl =
      "https://www.intel.com/content/www/us/en/ark/products/series/202986/11th-generation-intel-core-i7-processors.html";
    const productUrl =
      "https://www.intel.com/content/www/us/en/products/sku/208921/intel-core-i71165g7-processor/specifications.html";
    const identity = parseCpuIdentity("Intel(R) Core(TM) i7-1165G7");
    const discovered = await new IntelReleaseAdapter(
      new FixtureClient({
        [indexUrl]: `<a href="${seriesUrl}">11th Generation Intel Core i7 Processors</a>`,
        [seriesUrl]: `<a href="${productUrl}">Intel Core i7-1165G7 Processor</a>`,
      }),
    ).discover([identity], syncOptions);

    expect(discovered.get(identity.normalizedName)).toEqual(expect.arrayContaining([productUrl]));
  });

  it.each([
    ["AMD Ryzen 7 7840U", "05/03/2023", "2023-05-03", "day"],
    ["AMD Ryzen 5 7533HS", "Q3 2024", "2024-07-01", "quarter"],
  ] as const)("parses official AMD release for %s", async (cpu, rawDate, start, precision) => {
    const url = `https://www.amd.com/${cpu.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const result = await new AmdReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>${cpu}</title></head><body>
        <div>Name</div><div>${cpu}</div><div>Family</div><div>Ryzen</div>
        <div>Series</div><div>Ryzen Series</div><div>Launch Date</div><div>${rawDate}</div>
      </body></html>`,
      }),
    ).resolve(parseCpuIdentity(cpu), [url]);
    expect(result).toMatchObject({
      effectivePeriodStart: start,
      releasePrecision: precision,
      rawReleaseValue: rawDate,
    });
  });

  it("uses Apple newsroom publication as an announcement event", async () => {
    const url = "https://www.apple.com/newsroom/apple-m1-pro/";
    const adapter = new AppleReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>Apple unveils M1 Pro</title>
        <meta property="article:published_time" content="2021-10-18T13:00:00Z"></head>
        <body>Apple M1 Pro brings performance to MacBook Pro.</body></html>`,
      }),
    );
    const result = await adapter.resolve(parseCpuIdentity("Apple M1 Pro"), [url]);
    expect(result).toMatchObject({
      effectivePeriodStart: "2021-10-18",
      releasePrecision: "day",
      releaseEventType: "announcement",
      sourceType: "apple-newsroom-announcement",
    });
  });

  it.each([
    ["Apple M1", "2020-11-10T09:00:00Z", null, "2020-11-10", "announcement"],
    [
      "Apple M5",
      "2025-10-15T09:00:00Z",
      "The first products with Apple M5 will be available October 22, 2025.",
      "2025-10-22",
      "first_product_availability",
    ],
  ] as const)(
    "keeps announcement and availability separate for %s",
    async (cpu, published, availabilityText, effectiveDate, eventType) => {
      const url = `https://www.apple.com/newsroom/${cpu.toLowerCase().replace(/\s+/g, "-")}`;
      const result = await new AppleReleaseAdapter(
        new FixtureClient({
          [url]: `<html><head><title>Apple announces ${cpu}</title>
          <meta property="article:published_time" content="${published}"></head>
          <body>${cpu} is here. ${availabilityText ?? ""}</body></html>`,
        }),
      ).resolve(parseCpuIdentity(cpu), [url]);
      expect(result).toMatchObject({
        announcementDate: published.slice(0, 10),
        effectivePeriodStart: effectiveDate,
        releaseEventType: eventType,
      });
    },
  );

  it("does not present expected Qualcomm availability as a confirmed launch", async () => {
    const url = "https://www.qualcomm.com/news/snapdragon-x-plus";
    const adapter = new QualcommReleaseAdapter(
      new FixtureClient({
        [url]: `<html><head><title>Snapdragon X Plus announced</title>
        <meta property="article:published_time" content="2024-04-24T09:00:00Z"></head>
        <body>Snapdragon X Plus X1P-42-100 devices are expected to be available June 2024.</body></html>`,
      }),
    );
    const result = await adapter.resolve(
      parseCpuIdentity("Snapdragon(R) X Plus - X1P42100 - Qualcomm(R) Oryon(TM) CPU"),
      [url],
    );
    expect(result).toMatchObject({
      effectivePeriodStart: "2024-06-01",
      releasePrecision: "month",
      releaseEventType: "expected_availability",
      matchScope: "family",
    });
    expect(result?.sourceType).toContain("expected");
  });

  it("maps an exact Qualcomm SKU to a family-level announcement without claiming SKU launch", async () => {
    const productUrl = "https://www.qualcomm.com/products/x1e-80-100";
    const newsUrl = "https://www.qualcomm.com/news/snapdragon-x-elite";
    const adapter = new QualcommReleaseAdapter(
      new FixtureClient({
        [productUrl]: `<html><head><title>Snapdragon X Elite X1E-80-100</title></head>
        <body>Part number X1E-80-100 belongs to Snapdragon X Elite.</body></html>`,
        [newsUrl]: `<html><head><title>Snapdragon X Elite announcement</title>
        <meta property="article:published_time" content="2023-10-24T09:00:00Z"></head>
        <body>Qualcomm announces the Snapdragon X Elite platform.</body></html>`,
      }),
    );
    const result = await adapter.resolve(parseCpuIdentity("Snapdragon X Elite X1E-80-100"), [productUrl, newsUrl]);
    expect(result).toMatchObject({
      partNumber: "X1E-80-100",
      family: "Snapdragon X Elite",
      announcementDate: "2023-10-24",
      releaseEventType: "announcement",
      matchScope: "family",
    });
    expect(result?.sourceEvidence).toHaveLength(2);
  });

  it("links X1P-42-100 to the official X Plus announcement and expected availability", async () => {
    const productUrl = "https://www.qualcomm.com/laptops/products/snapdragon-x-plus";
    const newsUrl =
      "https://www.qualcomm.com/news/releases/2024/04/qualcomm-continues-to-disrupt-the-pc-industry-with-the-addition-";
    const result = await new QualcommReleaseAdapter(
      new FixtureClient({
        [productUrl]: `<html><head><title>Snapdragon X Plus</title></head>
        <body>Snapdragon X Plus Part Number X1P-42-100</body></html>`,
        [newsUrl]: `<html><head><title>Snapdragon X Plus announced</title></head>
        <body>Apr 24, 2024. Snapdragon X Plus PCs are expected to launch starting mid-2024.</body></html>`,
      }),
    ).resolve(parseCpuIdentity("Snapdragon X Plus X1P42100"), [productUrl, newsUrl]);
    expect(result).toMatchObject({
      partNumber: "X1P-42-100",
      announcementDate: "2024-04-24",
      effectivePeriodStart: "2024-04-01",
      effectivePeriodEnd: "2024-09-30",
      releasePrecision: "half_year",
      releaseEventType: "expected_availability",
      matchScope: "family",
    });
  });

  it("parses Qualcomm AEM model JSON when the public page is a JavaScript shell", async () => {
    const productUrl = "https://www.qualcomm.com/laptops/products/snapdragon-x-plus";
    const newsUrl =
      "https://www.qualcomm.com/news/releases/2024/04/qualcomm-continues-to-disrupt-the-pc-industry-with-the-addition-";
    const result = await new QualcommReleaseAdapter(
      new FixtureClient({
        [`${productUrl}.model.json`]: JSON.stringify({
          title: "Snapdragon X Plus",
          body: "Official Snapdragon X Plus comparison table",
        }),
        [`${newsUrl}.model.json`]: JSON.stringify({
          title: "Qualcomm adds Snapdragon X Plus",
          items: {
            mediaheader: { titleInfo: { publishDate: 1_713_963_600 } },
            article: {
              text: "Snapdragon X Plus PCs are expected to launch starting mid-2024.",
            },
          },
        }),
      }),
    ).resolve(parseCpuIdentity("Snapdragon X Plus X1P42100"), [productUrl, newsUrl]);
    expect(result).toMatchObject({
      partNumber: "X1P-42-100",
      announcementDate: "2024-04-24",
      effectivePeriodStart: "2024-04-01",
      effectivePeriodEnd: "2024-09-30",
      releaseEventType: "expected_availability",
      sourceUrl: newsUrl,
      matchScope: "family",
    });
    expect(result?.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "qualcomm-product-part-number", url: productUrl }),
        expect.objectContaining({ type: "qualcomm-family-announcement", url: newsUrl }),
      ]),
    );
  });
});

describe("catalog resolution precedence", () => {
  const row = {
    id: "catalog-1",
    vendor: "intel",
    canonical_name: "Intel Core i7-1165G7",
    normalized_name: "intel core i7 1165g7",
    part_number: "i7-1165G7",
    family: "Intel Core",
    series: "11th Generation",
    announcement_date: null,
    availability_period_start: null,
    availability_period_end: null,
    effective_period_start: "2020-07-01",
    effective_period_end: "2020-09-30",
    release_precision: "quarter",
    release_event_type: "launch",
    release_display: "Q3 2020",
    raw_release_value: "Q3'20",
    source_type: "intel-ark-product-specification",
    source_url: "https://www.intel.com/example",
    source_title: "Intel Core i7-1165G7",
    source_published_at: null,
    source_evidence: [],
    is_official: true,
    match_scope: "exact_name",
    content_hash: "fixture",
    etag: null,
    last_modified: null,
    last_verified_at: "2026-07-11T00:00:00Z",
  } satisfies CpuReleaseCatalogRow;

  it("prefers exact part number over aliases and family matching", () => {
    const result = resolveCpuRelease("11th Gen Intel Core i7-1165G7", [row], []);
    expect(result).toMatchObject({ matchMethod: "exact_part_number", confidence: 100 });
  });

  it("resolves a validated alias but leaves an unknown CPU officially unresolved", () => {
    expect(
      resolveCpuRelease(
        "Intel Tiger Lake mobile i7",
        [row],
        [
          {
            cpu_release_id: row.id,
            normalized_alias: "intel tiger lake mobile i7",
          },
        ],
      )?.matchMethod,
    ).toBe("validated_alias");
    expect(resolveCpuRelease("Imaginary CPU 9999Z", [row], [])).toBeNull();
  });

  it("never downgrades an exact official record to family-level evidence", () => {
    const familyCandidate = {
      ...syncRecord("intel", "Intel Core i7-1165G7"),
      matchScope: "family" as const,
      releaseEventType: "announcement" as const,
    };
    expect(shouldAcceptOfficialRecord(row, familyCandidate)).toBe(false);
    expect(
      shouldAcceptOfficialRecord(
        { ...row, match_scope: "family", release_event_type: "announcement" },
        syncRecord("intel", "Intel Core i7-1165G7"),
      ),
    ).toBe(true);
  });
});

const syncOptions = {
  unresolvedOnly: true,
  staleOnly: true,
  limit: 20,
  force: false,
  staleDays: 30,
};

function syncRecord(vendor: "intel" | "amd", cpuName: string): OfficialCpuReleaseRecord {
  const identity = parseCpuIdentity(cpuName);
  return {
    vendor,
    canonicalName: cpuName,
    normalizedName: identity.normalizedName,
    partNumber: identity.partNumber,
    family: identity.family,
    series: null,
    announcementDate: null,
    availabilityPeriodStart: null,
    availabilityPeriodEnd: null,
    effectivePeriodStart: "2020-01-01",
    effectivePeriodEnd: "2020-12-31",
    releasePrecision: "year",
    releaseEventType: "launch",
    releaseDisplay: "2020",
    rawReleaseValue: "2020",
    sourceType: `${vendor}-fixture`,
    sourceUrl: `https://www.${vendor}.com/fixture`,
    sourceTitle: cpuName,
    sourcePublishedAt: null,
    sourceEvidence: [],
    isOfficial: true,
    matchScope: "exact_name",
    aliases: [],
    contentHash: `${vendor}-${identity.normalizedName}`,
    etag: null,
    lastModified: null,
    lastVerifiedAt: "2026-07-11T00:00:00Z",
  };
}

class MemorySyncStore implements CpuReleaseSyncStore {
  readonly records = new Map<string, string | null>();
  readonly finished: VendorSyncResult[] = [];
  private run = 0;

  async startRun(): Promise<string> {
    this.run += 1;
    return `run-${this.run}`;
  }

  async finishRun(_runId: string, result: VendorSyncResult): Promise<void> {
    this.finished.push(result);
  }

  async upsert(record: OfficialCpuReleaseRecord): Promise<"inserted" | "updated" | "unchanged"> {
    const previous = this.records.get(record.normalizedName);
    this.records.set(record.normalizedName, record.contentHash);
    if (previous === undefined) return "inserted";
    return previous === record.contentHash ? "unchanged" : "updated";
  }
}

function fixtureAdapter(
  vendor: "intel" | "amd",
  record: OfficialCpuReleaseRecord | null,
  failDiscovery = false,
): CpuReleaseAdapter {
  return {
    vendor,
    supports: (identity) => identity.vendor === vendor,
    discover: async (identities) => {
      if (failDiscovery) throw new Error(`${vendor} unavailable`);
      return new Map(identities.map((identity) => [identity.normalizedName, [record?.sourceUrl ?? ""]]));
    },
    resolve: async () => record,
  };
}

describe("CPU release synchronization behavior", () => {
  it("isolates a vendor failure and continues another vendor", async () => {
    const store = new MemorySyncStore();
    const amd = syncRecord("amd", "AMD Ryzen 5 4500U");
    const results = await synchronizeCpuReleaseCatalog({
      repository: store,
      adapters: [fixtureAdapter("intel", null, true), fixtureAdapter("amd", amd)],
      cpuNames: ["Intel Core i7-1165G7", "AMD Ryzen 5 4500U"],
      options: syncOptions,
    });
    expect(results.map((result) => result.status)).toEqual(["failed", "completed"]);
    expect(store.records.has(amd.normalizedName)).toBe(true);
  });

  it("is idempotent when official content has not changed", async () => {
    const store = new MemorySyncStore();
    const record = syncRecord("amd", "AMD Ryzen 5 4500U");
    const input = {
      repository: store,
      adapters: [fixtureAdapter("amd", record)],
      cpuNames: [record.canonicalName],
      options: syncOptions,
    };
    expect((await synchronizeCpuReleaseCatalog(input))[0]).toMatchObject({ insertedCount: 1 });
    expect((await synchronizeCpuReleaseCatalog(input))[0]).toMatchObject({ unchangedCount: 1 });
  });

  it("refreshes unresolved and stale rows but keeps fresh verified rows cached", () => {
    const fresh = {
      lastVerifiedAt: "2026-07-10T00:00:00Z",
    } as CpuReleaseResolution;
    const stale = {
      lastVerifiedAt: "2026-05-01T00:00:00Z",
    } as CpuReleaseResolution;
    const now = new Date("2026-07-11T00:00:00Z").getTime();
    expect(shouldSynchronizeCpuRelease(null, syncOptions, now)).toBe(true);
    expect(shouldSynchronizeCpuRelease(fresh, syncOptions, now)).toBe(false);
    expect(shouldSynchronizeCpuRelease(stale, syncOptions, now)).toBe(true);
  });
});

describe("CPU release synchronization authorization", () => {
  it("accepts only the dedicated bearer or explicit header token", () => {
    expect(hasCpuReleaseSyncToken(new Headers({ authorization: "Bearer secret" }), "secret")).toBe(true);
    expect(hasCpuReleaseSyncToken(new Headers({ "x-cpu-release-sync-token": "secret" }), "secret")).toBe(true);
    expect(hasCpuReleaseSyncToken(new Headers({ authorization: "Bearer wrong" }), "secret")).toBe(false);
    expect(hasCpuReleaseSyncToken(new Headers(), "")).toBe(false);
  });
});

const runLiveCpuReleaseTests =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.RUN_LIVE_CPU_RELEASE_TESTS === "1";

describe.runIf(runLiveCpuReleaseTests)("official CPU release sources (live)", () => {
  const client = new BoundedCpuReleaseHttpClient("SpacefootInventoryLiveTest/1.0");

  it("reads Ryzen 5 4500U from AMD", async () => {
    const url =
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-4000-series/amd-ryzen-5-4500u.html";
    const record = await new AmdReleaseAdapter(client).resolve(
      parseCpuIdentity("AMD Ryzen 5 4500U with Radeon Graphics"),
      [url],
    );
    expect(record?.effectivePeriodStart).toBe("2020-01-06");
  }, 20_000);

  it("reads Core i7-1165G7 from Intel ARK", async () => {
    const url =
      "https://www.intel.com/content/www/us/en/products/sku/208921/intel-core-i71165g7-processor-12m-cache-up-to-4-70-ghz-with-ipu/specifications.html";
    const record = await new IntelReleaseAdapter(client).resolve(parseCpuIdentity("Intel(R) Core(TM) i7-1165G7"), [
      url,
    ]);
    expect(record).toMatchObject({
      effectivePeriodStart: "2020-07-01",
      effectivePeriodEnd: "2020-09-30",
      releasePrecision: "quarter",
    });
  }, 20_000);

  it("discovers an Intel ARK product through Intel's official family index", async () => {
    const identity = parseCpuIdentity("Intel Core i7-1165G7");
    const discovered = await new IntelReleaseAdapter(client).discover([identity], syncOptions);
    expect(discovered.get(identity.normalizedName)).toEqual(
      expect.arrayContaining([expect.stringContaining("intel-core-i71165g7")]),
    );
  }, 60_000);
});
