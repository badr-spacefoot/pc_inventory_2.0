import type { CpuReleaseHttpClient } from "./http-client.ts";
import type { CpuIdentity } from "./types.ts";

function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1]?.replace(/&amp;/g, "&").trim() ?? "")
    .filter(Boolean);
}

function discoveryTokens(identity: CpuIdentity): string[] {
  const values = [
    identity.partNumber,
    identity.modelNumber,
    ...identity.aliases,
  ];
  return [
    ...new Set(
      values.flatMap((value) => {
        const compact = String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "");
        const hyphenated = String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return [compact, hyphenated].filter((token) => token.length >= 4);
      }),
    ),
  ];
}

export async function discoverFromOfficialSitemaps(
  client: CpuReleaseHttpClient,
  roots: readonly string[],
  identity: CpuIdentity,
  maxSitemaps = 24,
): Promise<string[]> {
  const tokens = discoveryTokens(identity);
  const queue = [...roots];
  const visited = new Set<string>();
  const candidates = new Set<string>();

  while (queue.length > 0 && visited.size < maxSitemaps) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const response = await client.getText(sitemapUrl, { maxBytes: 2_000_000 });
    for (const location of sitemapLocations(response.body)) {
      if (/\.xml(?:\?|$)/i.test(location) || /sitemap/i.test(location)) {
        if (!visited.has(location) && queue.length < maxSitemaps * 2) {
          queue.push(location);
        }
        continue;
      }
      const normalizedUrl = location.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (
        tokens.some((token) => normalizedUrl.includes(token.replace(/-/g, "")))
      ) {
        candidates.add(location);
      }
    }
  }
  return [...candidates].slice(0, 8);
}

export async function discoverBatchFromOfficialSitemaps(
  client: CpuReleaseHttpClient,
  roots: readonly string[],
  identities: readonly CpuIdentity[],
  maxSitemaps = 30,
  maxCandidates = 8,
): Promise<Map<string, string[]>> {
  const tokens = new Map(
    identities.map((identity) => [
      identity.normalizedName,
      discoveryTokens(identity).map((token) => token.replace(/-/g, "")),
    ]),
  );
  const results = new Map(
    identities.map((identity) => [identity.normalizedName, [] as string[]]),
  );
  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length > 0 && visited.size < maxSitemaps) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const response = await client.getText(sitemapUrl, { maxBytes: 2_000_000 });
    for (const location of sitemapLocations(response.body)) {
      if (/\.xml(?:\?|$)/i.test(location) || /sitemap/i.test(location)) {
        if (!visited.has(location) && queue.length < maxSitemaps * 2) {
          queue.push(location);
        }
        continue;
      }
      const compactUrl = location.toLowerCase().replace(/[^a-z0-9]+/g, "");
      for (const [key, identityTokens] of tokens) {
        const matched = identityTokens.some((token) =>
          compactUrl.includes(token)
        );
        const existing = results.get(key)!;
        if (
          matched && existing.length < maxCandidates &&
          !existing.includes(location)
        ) {
          existing.push(location);
        }
      }
    }
  }
  return results;
}
