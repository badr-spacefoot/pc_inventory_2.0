import type {
  CpuReleaseCatalogRow,
  CpuReleaseMatchScope,
  OfficialCpuReleaseRecord,
  ReleaseEventType,
  ReleasePrecision,
} from "./types.ts";

const scopeQuality: Record<CpuReleaseMatchScope, number> = {
  part_number: 400,
  exact_name: 300,
  alias: 200,
  family: 100,
};

const eventQuality: Record<ReleaseEventType, number> = {
  first_product_availability: 50,
  launch: 40,
  announcement: 30,
  expected_availability: 20,
  unknown: 0,
};

const precisionQuality: Record<ReleasePrecision, number> = {
  day: 6,
  month: 5,
  quarter: 4,
  half_year: 3,
  year: 2,
  unknown: 0,
};

type QualityInput =
  | Pick<
    CpuReleaseCatalogRow,
    "is_official" | "match_scope" | "release_event_type" | "release_precision"
  >
  | Pick<
    OfficialCpuReleaseRecord,
    "isOfficial" | "matchScope" | "releaseEventType" | "releasePrecision"
  >;

export function cpuReleaseSourceQuality(record: QualityInput): number {
  const databaseRecord = "is_official" in record;
  const isOfficial = databaseRecord ? record.is_official : record.isOfficial;
  const matchScope = databaseRecord ? record.match_scope : record.matchScope;
  const eventType = databaseRecord
    ? record.release_event_type
    : record.releaseEventType;
  const precision = databaseRecord
    ? record.release_precision
    : record.releasePrecision;
  return (isOfficial ? 1_000 : 0) + scopeQuality[matchScope] +
    eventQuality[eventType] + precisionQuality[precision];
}

export function shouldAcceptOfficialRecord(
  existing: CpuReleaseCatalogRow | null,
  candidate: OfficialCpuReleaseRecord,
): boolean {
  return !existing ||
    cpuReleaseSourceQuality(candidate) >= cpuReleaseSourceQuality(existing);
}
