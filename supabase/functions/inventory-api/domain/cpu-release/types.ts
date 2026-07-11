export type CpuVendor = "intel" | "amd" | "apple" | "qualcomm";

export type ReleasePrecision =
  | "day"
  | "month"
  | "quarter"
  | "half_year"
  | "year"
  | "unknown";

export type ReleaseEventType =
  | "announcement"
  | "launch"
  | "first_product_availability"
  | "expected_availability"
  | "unknown";

export type CpuReleaseMatchScope =
  | "part_number"
  | "exact_name"
  | "alias"
  | "family";

export type CpuReleaseMatchMethod =
  | "exact_part_number"
  | "exact_canonical_name"
  | "validated_alias"
  | "controlled_family"
  | "heuristic"
  | "unresolved";

export interface CpuIdentity {
  rawName: string;
  vendor: CpuVendor | null;
  normalizedName: string;
  family: string | null;
  productLine: string | null;
  modelNumber: string | null;
  suffix: string | null;
  partNumber: string | null;
  appleVariant: string | null;
  aliases: string[];
}

export interface ReleasePeriod {
  periodStart: string | null;
  periodEnd: string | null;
  precision: ReleasePrecision;
  displayValue: string;
  rawValue: string;
}

export interface OfficialCpuReleaseRecord {
  vendor: CpuVendor;
  canonicalName: string;
  normalizedName: string;
  partNumber: string | null;
  family: string | null;
  series: string | null;
  announcementDate: string | null;
  availabilityPeriodStart: string | null;
  availabilityPeriodEnd: string | null;
  effectivePeriodStart: string | null;
  effectivePeriodEnd: string | null;
  releasePrecision: ReleasePrecision;
  releaseEventType: ReleaseEventType;
  releaseDisplay: string;
  rawReleaseValue: string;
  sourceType: string;
  sourceUrl: string;
  sourceTitle: string | null;
  sourcePublishedAt: string | null;
  sourceEvidence: Array<{ type: string; url: string; title?: string }>;
  isOfficial: boolean;
  matchScope: CpuReleaseMatchScope;
  aliases: Array<{ alias: string; aliasType: string }>;
  contentHash: string | null;
  etag: string | null;
  lastModified: string | null;
  lastVerifiedAt: string;
}

export interface CpuReleaseCatalogRow {
  id: string;
  vendor: CpuVendor;
  canonical_name: string;
  normalized_name: string;
  part_number: string | null;
  family: string | null;
  series: string | null;
  announcement_date: string | null;
  availability_period_start: string | null;
  availability_period_end: string | null;
  effective_period_start: string | null;
  effective_period_end: string | null;
  release_precision: ReleasePrecision;
  release_event_type: ReleaseEventType;
  release_display: string | null;
  raw_release_value: string | null;
  source_type: string;
  source_url: string;
  source_title: string | null;
  source_published_at: string | null;
  source_evidence: Array<{ type: string; url: string; title?: string }>;
  is_official: boolean;
  match_scope: CpuReleaseMatchScope;
  content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
  last_verified_at: string;
}

export interface CpuReleaseResolution {
  catalogId: string | null;
  identity: CpuIdentity;
  canonicalName: string;
  period: ReleasePeriod;
  eventType: ReleaseEventType;
  sourceType: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceVendor: CpuVendor | "heuristic" | "unknown";
  matchScope: CpuReleaseMatchScope | null;
  matchMethod: CpuReleaseMatchMethod;
  confidence: number;
  isOfficial: boolean;
  lastVerifiedAt: string | null;
}

export interface CpuReleaseSyncOptions {
  unresolvedOnly: boolean;
  staleOnly: boolean;
  limit: number;
  force: boolean;
  staleDays: number;
}

export interface VendorSyncResult {
  vendor: CpuVendor;
  status: "completed" | "partial" | "failed";
  discoveredCount: number;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  unresolvedCount: number;
  errors: string[];
}

export interface CpuReleaseFetchContext {
  currentRecord: CpuReleaseCatalogRow | null;
}

export interface CpuReleaseAdapter {
  readonly vendor: CpuVendor;
  supports(identity: CpuIdentity): boolean;
  discover(
    identities: readonly CpuIdentity[],
    options: CpuReleaseSyncOptions,
  ): Promise<Map<string, string[]>>;
  resolve(
    identity: CpuIdentity,
    candidateUrls: readonly string[],
    context?: CpuReleaseFetchContext,
  ): Promise<OfficialCpuReleaseRecord | null>;
}
