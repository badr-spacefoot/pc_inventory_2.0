import { parseReleasePeriod } from "./date-parser.ts";
import { normalizeReleaseName, parseCpuIdentity } from "./normalize.ts";
import type {
  CpuReleaseCatalogRow,
  CpuReleaseMatchMethod,
  CpuReleaseResolution,
} from "./types.ts";

export interface CpuReleaseAliasRow {
  cpu_release_id: string;
  normalized_alias: string;
}

function asResolution(
  identity: ReturnType<typeof parseCpuIdentity>,
  row: CpuReleaseCatalogRow,
  matchMethod: CpuReleaseMatchMethod,
  confidence: number,
): CpuReleaseResolution {
  const period = row.effective_period_start
    ? {
      periodStart: row.effective_period_start,
      periodEnd: row.effective_period_end,
      precision: row.release_precision,
      displayValue: row.release_display ?? row.effective_period_start,
      rawValue: row.raw_release_value ?? row.release_display ?? "",
    }
    : parseReleasePeriod("");
  return {
    catalogId: row.id,
    identity,
    canonicalName: row.canonical_name,
    period,
    eventType: row.release_event_type,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    sourceVendor: row.vendor,
    matchScope: row.match_scope,
    matchMethod,
    confidence,
    isOfficial: row.is_official,
    lastVerifiedAt: row.last_verified_at,
  };
}

export function resolveCpuRelease(
  cpuName: string,
  catalog: readonly CpuReleaseCatalogRow[],
  aliases: readonly CpuReleaseAliasRow[] = [],
): CpuReleaseResolution | null {
  const identity = parseCpuIdentity(cpuName);
  if (!identity.vendor || !identity.normalizedName) return null;
  const vendorRows = catalog.filter((row) => row.vendor === identity.vendor);

  if (identity.partNumber) {
    const part = identity.partNumber.toLowerCase();
    const exactPart = vendorRows.find((row) =>
      row.part_number?.toLowerCase() === part
    );
    if (exactPart) {
      return asResolution(identity, exactPart, "exact_part_number", 100);
    }
  }

  const exact = vendorRows.find((row) =>
    row.normalized_name === identity.normalizedName
  );
  if (exact) return asResolution(identity, exact, "exact_canonical_name", 98);

  const normalizedAliases = new Set(identity.aliases.map(normalizeReleaseName));
  const alias = aliases.find((row) =>
    normalizedAliases.has(row.normalized_alias)
  );
  const aliasMatch = alias
    ? vendorRows.find((row) => row.id === alias.cpu_release_id)
    : null;
  if (aliasMatch) {
    return asResolution(identity, aliasMatch, "validated_alias", 94);
  }

  if (identity.family) {
    const familyMatches = vendorRows.filter((row) =>
      row.match_scope === "family" && row.family === identity.family
    );
    if (familyMatches.length === 1) {
      return asResolution(identity, familyMatches[0]!, "controlled_family", 75);
    }
  }
  return null;
}
