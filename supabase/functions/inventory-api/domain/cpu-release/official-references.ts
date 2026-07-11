import { parseReleasePeriod } from "./date-parser.ts";
import type {
  CpuIdentity,
  CpuVendor,
  ReleaseEventType,
  ReleasePeriod,
} from "./types.ts";

export interface CuratedOfficialCpuReference {
  vendor: CpuVendor;
  modelNumber: string;
  canonicalName: string;
  rawReleaseValue?: string;
  launchValue?: string;
  announcementValue?: string;
  availabilityValue?: string;
  effectiveEventType?: ReleaseEventType;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
}

// Exact manufacturer references verified from the linked product specification.
// They keep synchronization authoritative when a manufacturer CDN blocks edge
// runtimes; they must never contain dates inferred from a CPU family or model year.
const officialReferences: readonly CuratedOfficialCpuReference[] = [
  {
    vendor: "amd",
    modelNumber: "Ryzen 5 4500U",
    canonicalName: "AMD Ryzen 5 4500U",
    rawReleaseValue: "1/6/2020",
    sourceUrl:
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-4000-series/amd-ryzen-5-4500u.html",
    sourceTitle: "AMD Ryzen 5 4500U Drivers and Downloads",
    sourceType: "amd-product-specification",
  },
  ...([
    ["Ryzen 5 5500U", "1/12/2021", "ryzen-5000-series/amd-ryzen-5-5500u"],
    ["Ryzen 5 5600H", "1/12/2021", "ryzen-5000-series/amd-ryzen-5-5600h"],
    ["Ryzen 5 7520U", "09/20/2022", "ryzen-7000-series/amd-ryzen-5-7520u"],
    ["Ryzen 7 3700U", "Q1 2019", "ryzen-3000-series/amd-ryzen-7-3700u"],
    ["Ryzen 7 5700U", "1/12/2021", "ryzen-5000-series/amd-ryzen-7-5700u"],
    ["Ryzen 7 5800H", "1/12/2021", "ryzen-5000-series/amd-ryzen-7-5800h"],
    ["Ryzen 7 7730U", "Q1 2023", "ryzen-7000-series/amd-ryzen-7-7730u"],
  ] as const).map(([modelNumber, rawReleaseValue, path]) => ({
    vendor: "amd" as const,
    modelNumber,
    canonicalName: `AMD ${modelNumber}`,
    rawReleaseValue,
    sourceUrl:
      `https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/${path}.html`,
    sourceTitle: `AMD ${modelNumber} Drivers and Downloads`,
    sourceType: "amd-product-specification",
  })),
  ...["Ryzen 5 8540U", "Ryzen 7 8840HS", "Ryzen 7 8840U"].map(
    (modelNumber) => ({
      vendor: "amd" as const,
      modelNumber,
      canonicalName: `AMD ${modelNumber}`,
      announcementValue: "December 6, 2023",
      availabilityValue: "Q1 2024",
      effectiveEventType: "expected_availability" as const,
      sourceUrl:
        "https://www.amd.com/en/newsroom/press-releases/2023-12-6-amd-extends-mobile-pc-leadership-with-amd-ryzen-8.html",
      sourceTitle:
        "AMD Extends Mobile PC Leadership with AMD Ryzen 8040 Series Processors",
      sourceType: "amd-expected-product-availability",
    }),
  ),
  {
    vendor: "amd",
    modelNumber: "Ryzen AI 7 350",
    canonicalName: "AMD Ryzen AI 7 350",
    rawReleaseValue: "2/18/2025",
    sourceUrl:
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-ai-300-series/amd-ryzen-al-7-350.html",
    sourceTitle: "AMD Ryzen AI 7 350 Drivers and Downloads",
    sourceType: "amd-product-specification",
  },
  {
    vendor: "amd",
    modelNumber: "Ryzen AI 7 445",
    canonicalName: "AMD Ryzen AI 7 445",
    rawReleaseValue: "1/5/2026",
    sourceUrl:
      "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-ai-400-series/amd-ryzen-ai-7-445.html",
    sourceTitle: "AMD Ryzen AI 7 445 Drivers and Downloads",
    sourceType: "amd-product-specification",
  },
  {
    vendor: "intel",
    modelNumber: "i7-1165G7",
    canonicalName: "Intel Core i7-1165G7",
    rawReleaseValue: "Q3'20",
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/sku/208921/intel-core-i71165g7-processor-12m-cache-up-to-4-70-ghz-with-ipu/specifications.html",
    sourceTitle: "Intel Core i7-1165G7 Processor",
    sourceType: "intel-ark-product-specification",
  },
  ...([
    [
      "i3-10110U",
      "Intel Core i3-10110U",
      "Q3'19",
      "196451/intel-core-i310110u-processor-4m-cache-up-to-4-10-ghz",
    ],
    [
      "i5-10210U",
      "Intel Core i5-10210U",
      "Q3'19",
      "195436/intel-core-i510210u-processor-6m-cache-up-to-4-20-ghz",
    ],
    [
      "i5-1035G1",
      "Intel Core i5-1035G1",
      "Q3'19",
      "196603/intel-core-i51035g1-processor-6m-cache-up-to-3-60-ghz",
    ],
    [
      "i5-11300H",
      "Intel Core i5-11300H",
      "Q1'21",
      "196656/intel-core-i511300h-processor-8m-cache-up-to-4-40-ghz-with-ipu",
    ],
    [
      "i5-1135G7",
      "Intel Core i5-1135G7",
      "Q3'20",
      "208658/intel-core-i51135g7-processor-8m-cache-up-to-4-20-ghz",
    ],
    [
      "i5-12450H",
      "Intel Core i5-12450H",
      "Q1'22",
      "132222/intel-core-i512450h-processor-12m-cache-up-to-4-40-ghz",
    ],
    [
      "i7-1250U",
      "Intel Core i7-1250U",
      "Q1'22",
      "226454/intel-core-i71250u-processor-12m-cache-up-to-4-70-ghz",
    ],
    [
      "i7-1255U",
      "Intel Core i7-1255U",
      "Q1'22",
      "226259/intel-core-i71255u-processor-12m-cache-up-to-4-70-ghz",
    ],
    [
      "i7-1260P",
      "Intel Core i7-1260P",
      "Q1'22",
      "226254/intel-core-i71260p-processor-18m-cache-up-to-4-70-ghz",
    ],
    [
      "i5-1334U",
      "Intel Core i5-1334U",
      "Q1'23",
      "232143/intel-core-i51334u-processor-12m-cache-up-to-4-60-ghz",
    ],
    [
      "i5-1335U",
      "Intel Core i5-1335U",
      "Q1'23",
      "232153/intel-core-i51335u-processor-12m-cache-up-to-4-60-ghz",
    ],
    [
      "i5-13420H",
      "Intel Core i5-13420H",
      "Q1'23",
      "232173/intel-core-i513420h-processor-12m-cache-up-to-4-60-ghz",
    ],
    [
      "i7-1355U",
      "Intel Core i7-1355U",
      "Q1'23",
      "232160/intel-core-i71355u-processor-12m-cache-up-to-5-00-ghz",
    ],
    [
      "Core 7 150U",
      "Intel Core 7 150U",
      "Q1'24",
      "236795/intel-core-7-processor-150u-12m-cache-up-to-5-40-ghz",
    ],
    [
      "i5-7200U",
      "Intel Core i5-7200U",
      "Q3'16",
      "95443/intel-core-i57200u-processor-3m-cache-up-to-3-10-ghz",
    ],
    [
      "i5-8250U",
      "Intel Core i5-8250U",
      "Q3'17",
      "124967/intel-core-i58250u-processor-6m-cache-up-to-3-40-ghz",
    ],
    [
      "Core Ultra 5 125H",
      "Intel Core Ultra 5 125H",
      "Q4'23",
      "236848/intel-core-ultra-5-processor-125h-18m-cache-up-to-4-50-ghz",
    ],
    [
      "Core Ultra 7 155H",
      "Intel Core Ultra 7 155H",
      "Q4'23",
      "236847/intel-core-ultra-7-processor-155h-24m-cache-up-to-4-80-ghz",
    ],
    [
      "Core Ultra 7 165U",
      "Intel Core Ultra 7 165U",
      "Q4'23",
      "237329/intel-core-ultra-7-processor-165u-12m-cache-up-to-4-90-ghz",
    ],
    [
      "Core Ultra 7 256V",
      "Intel Core Ultra 7 256V",
      "Q3'24",
      "240954/intel-core-ultra-7-processor-256v-12m-cache-up-to-4-80-ghz",
    ],
    [
      "Core Ultra 7 258V",
      "Intel Core Ultra 7 258V",
      "Q3'24",
      "240957/intel-core-ultra-7-processor-258v-12m-cache-up-to-4-80-ghz",
    ],
  ] as const).map(([modelNumber, canonicalName, rawReleaseValue, path]) => ({
    vendor: "intel" as const,
    modelNumber,
    canonicalName,
    rawReleaseValue,
    sourceUrl:
      `https://www.intel.com/content/www/us/en/products/sku/${path}/specifications.html`,
    sourceTitle: `${canonicalName} Processor`,
    sourceType: "intel-ark-product-specification",
  })),
  ...([
    ["Core Ultra 5 226V", "Intel Core Ultra 5 226V"],
    ["Core Ultra 9 288V", "Intel Core Ultra 9 288V"],
  ] as const).map(([modelNumber, canonicalName]) => ({
    vendor: "intel" as const,
    modelNumber,
    canonicalName,
    rawReleaseValue: "Q3'24",
    sourceUrl:
      "https://www.intel.com/content/www/us/en/products/details/processors/core-ultra/series-2.html",
    sourceTitle: "Intel Core Ultra Processors Series 2",
    sourceType: "intel-official-product-series",
  })),
];

function compact(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function findCuratedOfficialReference(
  identity: CpuIdentity,
): CuratedOfficialCpuReference | null {
  const model = compact(identity.modelNumber);
  if (!identity.vendor || !model) return null;
  return (
    officialReferences.find(
      (reference) =>
        reference.vendor === identity.vendor &&
        compact(reference.modelNumber) === model,
    ) ?? null
  );
}

export function curatedReferencePeriods(
  reference: CuratedOfficialCpuReference,
): {
  launch: ReleasePeriod | null;
  announcement: ReleasePeriod | null;
  availability: ReleasePeriod | null;
} {
  const launchValue = reference.launchValue ?? reference.rawReleaseValue ?? "";
  const parse = (value?: string) => {
    const period = parseReleasePeriod(value ?? "", "en-US");
    return period.periodStart ? period : null;
  };
  return {
    launch: parse(launchValue),
    announcement: parse(reference.announcementValue),
    availability: parse(reference.availabilityValue),
  };
}
