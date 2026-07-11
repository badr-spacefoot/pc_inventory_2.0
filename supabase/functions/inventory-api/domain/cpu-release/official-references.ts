import type { CpuIdentity, CpuVendor } from "./types.ts";

export interface CuratedOfficialCpuReference {
  vendor: CpuVendor;
  modelNumber: string;
  canonicalName: string;
  rawReleaseValue: string;
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
