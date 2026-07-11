import { preferEffectivePeriod } from "../date-parser.ts";
import type {
  CpuIdentity,
  CpuReleaseFetchContext,
  CpuReleaseMatchScope,
  OfficialCpuReleaseRecord,
  ReleasePeriod,
} from "../types.ts";

export function conditionalRequest(
  context: CpuReleaseFetchContext | undefined,
  url: string,
): { etag?: string; lastModified?: string } {
  const current = context?.currentRecord;
  if (!current || current.source_url !== url) return {};
  return {
    ...(current.etag ? { etag: current.etag } : {}),
    ...(current.last_modified ? { lastModified: current.last_modified } : {}),
  };
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function officialRecord(input: {
  identity: CpuIdentity;
  canonicalName: string;
  family?: string | null;
  series?: string | null;
  partNumber?: string | null;
  announcement?: ReleasePeriod | null;
  availability?: ReleasePeriod | null;
  launch?: ReleasePeriod | null;
  sourceType: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  sourcePublishedAt?: string | null;
  sourceEvidence?: Array<{ type: string; url: string; title?: string }>;
  effectiveEventType?: OfficialCpuReleaseRecord["releaseEventType"];
  matchScope?: CpuReleaseMatchScope;
  aliases?: string[];
  rawContent: string;
  etag?: string | null;
  lastModified?: string | null;
}): Promise<OfficialCpuReleaseRecord> {
  const preferred = preferEffectivePeriod(
    input.availability ?? null,
    input.launch ?? null,
    input.announcement ?? null,
  );
  return {
    vendor: input.identity.vendor!,
    canonicalName: input.canonicalName,
    normalizedName: input.identity.normalizedName,
    partNumber: input.partNumber ?? input.identity.partNumber,
    family: input.family ?? input.identity.family,
    series: input.series ?? null,
    announcementDate: input.announcement?.periodStart ?? null,
    availabilityPeriodStart: input.availability?.periodStart ?? null,
    availabilityPeriodEnd: input.availability?.periodEnd ?? null,
    effectivePeriodStart: preferred.period.periodStart,
    effectivePeriodEnd: preferred.period.periodEnd,
    releasePrecision: preferred.period.precision,
    releaseEventType: input.effectiveEventType ?? preferred.eventType,
    releaseDisplay: preferred.period.displayValue,
    rawReleaseValue: preferred.period.rawValue,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle ?? null,
    sourcePublishedAt: input.sourcePublishedAt ?? null,
    sourceEvidence: input.sourceEvidence ?? [
      {
        type: input.sourceType,
        url: input.sourceUrl,
        ...(input.sourceTitle ? { title: input.sourceTitle } : {}),
      },
    ],
    isOfficial: true,
    matchScope: input.matchScope ?? "exact_name",
    aliases: [
      ...new Set([
        input.canonicalName,
        ...input.identity.aliases,
        ...(input.aliases ?? []),
      ]),
    ]
      .filter(Boolean)
      .map((alias) => ({ alias, aliasType: "manufacturer" })),
    contentHash: await sha256(input.rawContent),
    etag: input.etag ?? null,
    lastModified: input.lastModified ?? null,
    lastVerifiedAt: new Date().toISOString(),
  };
}
