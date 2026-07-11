import { parseCpuIdentity } from "./normalize.ts";
import { OfficialSourceNotModifiedError } from "./http-client.ts";
import type {
  CpuIdentity,
  CpuReleaseAdapter,
  CpuReleaseResolution,
  CpuReleaseSyncOptions,
  CpuVendor,
  VendorSyncResult,
} from "./types.ts";

export interface CpuReleaseSyncStore {
  startRun(
    vendor: CpuVendor | "all",
    details: Record<string, unknown>,
  ): Promise<string>;
  finishRun(runId: string, result: VendorSyncResult): Promise<void>;
  upsert(
    record: import("./types.ts").OfficialCpuReleaseRecord,
  ): Promise<"inserted" | "updated" | "unchanged">;
  find?(
    identity: CpuIdentity,
  ): Promise<import("./types.ts").CpuReleaseCatalogRow | null>;
  markVerified?(id: string): Promise<void>;
}

export function shouldSynchronizeCpuRelease(
  resolution: CpuReleaseResolution | null,
  options: CpuReleaseSyncOptions,
  now = Date.now(),
): boolean {
  if (options.force || (!options.unresolvedOnly && !options.staleOnly)) {
    return true;
  }
  if (!resolution) return options.unresolvedOnly;
  if (!options.staleOnly) return false;
  const verifiedAt = resolution.lastVerifiedAt
    ? new Date(resolution.lastVerifiedAt).getTime()
    : 0;
  return !Number.isFinite(verifiedAt) ||
    verifiedAt < now - options.staleDays * 86_400_000;
}

function candidateUrls(
  identity: CpuIdentity,
  discovered: readonly string[],
  currentUrl = "",
): string[] {
  return [...new Set([currentUrl, ...discovered].filter(Boolean))];
}

function synchronizationError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      code?: unknown;
    };
    const parts = [candidate.message, candidate.details, candidate.code]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
  }
  return String(error || "unknown error");
}

export async function synchronizeCpuReleaseCatalog(input: {
  repository: CpuReleaseSyncStore;
  adapters: readonly CpuReleaseAdapter[];
  cpuNames: readonly string[];
  options: CpuReleaseSyncOptions;
  vendor?: CpuVendor;
  vendors?: readonly CpuVendor[];
}): Promise<VendorSyncResult[]> {
  const identities = input.cpuNames.map(parseCpuIdentity).filter((identity) =>
    identity.vendor
  );
  const requestedVendors = new Set(
    input.vendors ?? (input.vendor ? [input.vendor] : []),
  );
  const adapters = input.adapters.filter(
    (adapter) =>
      requestedVendors.size === 0 || requestedVendors.has(adapter.vendor),
  );
  const results: VendorSyncResult[] = [];

  for (const adapter of adapters) {
    const vendorIdentities = identities.filter((identity) =>
      adapter.supports(identity)
    ).slice(0, input.options.limit);
    const runId = await input.repository.startRun(adapter.vendor, {
      options: input.options,
      requested: vendorIdentities.length,
    });
    const result: VendorSyncResult = {
      vendor: adapter.vendor,
      status: "completed",
      discoveredCount: 0,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      unresolvedCount: 0,
      errors: [],
    };

    try {
      const discovered = await adapter.discover(
        vendorIdentities,
        input.options,
      );
      for (const identity of vendorIdentities) {
        const current = (await input.repository.find?.(identity)) ?? null;
        const urls = candidateUrls(
          identity,
          discovered.get(identity.normalizedName) ?? [],
          current?.source_url ?? "",
        );
        result.discoveredCount += urls.length;
        if (urls.length === 0) {
          result.unresolvedCount += 1;
          continue;
        }
        try {
          result.fetchedCount += 1;
          const record = await adapter.resolve(identity, urls, {
            currentRecord: current,
          });
          if (!record) {
            result.unresolvedCount += 1;
            continue;
          }
          const status = await input.repository.upsert(record);
          if (status === "inserted") result.insertedCount += 1;
          else if (status === "updated") result.updatedCount += 1;
          else result.unchangedCount += 1;
        } catch (error) {
          if (error instanceof OfficialSourceNotModifiedError && current) {
            await input.repository.markVerified?.(current.id);
            result.unchangedCount += 1;
            continue;
          }
          result.failedCount += 1;
          result.errors.push(
            `${identity.rawName}: ${synchronizationError(error)}`,
          );
        }
      }
      if (result.failedCount > 0) result.status = "partial";
    } catch (error) {
      result.status = "failed";
      result.failedCount += vendorIdentities.length || 1;
      result.errors.push(synchronizationError(error));
    }
    await input.repository.finishRun(runId, result);
    results.push(result);
  }
  return results;
}
