import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizeReleaseName } from "./normalize.ts";
import type {
  CpuIdentity,
  CpuReleaseCatalogRow,
  CpuVendor,
  OfficialCpuReleaseRecord,
  VendorSyncResult,
} from "./types.ts";
import type { CpuReleaseAliasRow } from "./resolver.ts";
import { shouldAcceptOfficialRecord } from "./quality.ts";

export class CpuReleaseRepository {
  constructor(private readonly db: SupabaseClient) {}

  private async findExisting(
    vendor: CpuVendor,
    normalizedName: string,
    partNumber: string | null,
  ): Promise<CpuReleaseCatalogRow | null> {
    const { data: named, error: namedError } = await this.db
      .from("cpu_release_catalog")
      .select("*")
      .eq("vendor", vendor)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (namedError) throw namedError;
    if (named) return named as CpuReleaseCatalogRow;
    if (!partNumber) return null;
    const { data: numbered, error: numberedError } = await this.db
      .from("cpu_release_catalog")
      .select("*")
      .eq("vendor", vendor)
      .ilike("part_number", partNumber)
      .maybeSingle();
    if (numberedError) throw numberedError;
    return numbered as CpuReleaseCatalogRow | null;
  }

  async observedCpuNames(limit = 200): Promise<string[]> {
    const { data, error } = await this.db
      .from("device_inventory_view")
      .select("cpu,enrichment_cpu_name")
      .limit(Math.max(1, Math.min(limit, 1000)));
    if (error) throw error;
    return [
      ...new Set(
        (data ?? []).map((row) =>
          String(row.cpu || row.enrichment_cpu_name || "").trim()
        ).filter(Boolean),
      ),
    ];
  }

  async catalog(): Promise<
    { rows: CpuReleaseCatalogRow[]; aliases: CpuReleaseAliasRow[] }
  > {
    const [
      { data: rows, error: rowError },
      { data: aliases, error: aliasError },
    ] = await Promise.all([
      this.db.from("cpu_release_catalog").select("*"),
      this.db.from("cpu_release_aliases").select(
        "cpu_release_id,normalized_alias",
      ),
    ]);
    if (rowError) throw rowError;
    if (aliasError) throw aliasError;
    return {
      rows: (rows ?? []) as CpuReleaseCatalogRow[],
      aliases: (aliases ?? []) as CpuReleaseAliasRow[],
    };
  }

  async startRun(
    vendor: CpuVendor | "all",
    details: Record<string, unknown>,
  ): Promise<string> {
    const { data, error } = await this.db
      .from("cpu_release_sync_runs")
      .insert({
        vendor,
        status: "running",
        details,
      })
      .select("id")
      .single();
    if (error) throw error;
    return String(data.id);
  }

  async finishRun(runId: string, result: VendorSyncResult): Promise<void> {
    const { error } = await this.db
      .from("cpu_release_sync_runs")
      .update({
        status: result.status,
        discovered_count: result.discoveredCount,
        fetched_count: result.fetchedCount,
        inserted_count: result.insertedCount,
        updated_count: result.updatedCount,
        unchanged_count: result.unchangedCount,
        failed_count: result.failedCount,
        unresolved_count: result.unresolvedCount,
        last_error: result.errors[0] ?? null,
        details: { errors: result.errors },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (error) throw error;
  }

  async latestRuns(limit = 12): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.db
      .from("cpu_release_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  }

  async find(identity: CpuIdentity): Promise<CpuReleaseCatalogRow | null> {
    if (!identity.vendor) return null;
    return this.findExisting(
      identity.vendor,
      identity.normalizedName,
      identity.partNumber,
    );
  }

  async markVerified(id: string): Promise<void> {
    const { error } = await this.db
      .from("cpu_release_catalog")
      .update({
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }

  async upsert(
    record: OfficialCpuReleaseRecord,
  ): Promise<"inserted" | "updated" | "unchanged"> {
    const existingRecord = await this.findExisting(
      record.vendor,
      record.normalizedName,
      record.partNumber,
    );
    if (!shouldAcceptOfficialRecord(existingRecord, record)) {
      await this.markVerified(String(existingRecord!.id));
      return "unchanged";
    }
    const status = !existingRecord
      ? "inserted"
      : existingRecord?.content_hash === record.contentHash
      ? "unchanged"
      : "updated";
    const values = {
      vendor: record.vendor,
      canonical_name: record.canonicalName,
      normalized_name: record.normalizedName,
      part_number: record.partNumber,
      family: record.family,
      series: record.series,
      announcement_date: record.announcementDate,
      availability_period_start: record.availabilityPeriodStart,
      availability_period_end: record.availabilityPeriodEnd,
      effective_period_start: record.effectivePeriodStart,
      effective_period_end: record.effectivePeriodEnd,
      release_precision: record.releasePrecision,
      release_event_type: record.releaseEventType,
      release_display: record.releaseDisplay,
      raw_release_value: record.rawReleaseValue,
      source_type: record.sourceType,
      source_url: record.sourceUrl,
      source_title: record.sourceTitle,
      source_published_at: record.sourcePublishedAt,
      source_evidence: record.sourceEvidence,
      is_official: record.isOfficial,
      match_scope: record.matchScope,
      content_hash: record.contentHash,
      etag: record.etag,
      last_modified: record.lastModified,
      last_verified_at: record.lastVerifiedAt,
    };
    const query = existingRecord
      ? this.db.from("cpu_release_catalog").update(values).eq(
        "id",
        existingRecord.id,
      )
      : this.db.from("cpu_release_catalog").insert(values);
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    const catalogId = String(data.id);
    if (record.aliases.length > 0) {
      const aliasRows = record.aliases
        .map((alias) => ({
          cpu_release_id: catalogId,
          alias: alias.alias,
          normalized_alias: normalizeReleaseName(alias.alias),
          alias_type: alias.aliasType,
        }))
        .filter((alias) => alias.normalized_alias);
      const { error: aliasError } = await this.db.from("cpu_release_aliases")
        .upsert(aliasRows, {
          onConflict: "cpu_release_id,normalized_alias",
          ignoreDuplicates: true,
        });
      if (aliasError) throw aliasError;
    }
    return status;
  }
}
