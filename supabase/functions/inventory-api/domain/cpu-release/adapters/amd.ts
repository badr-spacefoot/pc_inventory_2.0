import { parseReleasePeriod } from "../date-parser.ts";
import { extractTitle, findLabelValue, textContainsIdentity } from "../html.ts";
import type { CpuReleaseHttpClient } from "../http-client.ts";
import { OfficialSourceNotModifiedError } from "../http-client.ts";
import { findCuratedOfficialReference } from "../official-references.ts";
import { discoverBatchFromOfficialSitemaps } from "../sitemap.ts";
import type {
  CpuIdentity,
  CpuReleaseAdapter,
  CpuReleaseFetchContext,
  CpuReleaseSyncOptions,
  OfficialCpuReleaseRecord,
} from "../types.ts";
import { conditionalRequest, officialRecord } from "./shared.ts";

const amdSitemaps = ["https://www.amd.com/en.sitemap.xml"];

function amdOfficialCandidateUrls(identity: CpuIdentity): string[] {
  const model = identity.modelNumber
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const number = identity.modelNumber?.match(/\b(\d{3,4})[a-z0-9]*\b/i)?.[1];
  if (!model || !number) return [];
  const slug = `amd-${model}`;
  const isAi = /ryzen\s+ai/i.test(identity.modelNumber ?? "");
  const series = isAi ? `${number.slice(0, 1)}00` : `${number.slice(0, 1)}000`;
  const supportSeries = isAi
    ? `ryzen-ai-${series}-series`
    : `ryzen-${series}-series`;
  const urls = [
    `https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/${supportSeries}/${slug}.html`,
  ];
  if (isAi) {
    urls.push(
      `https://www.amd.com/en/products/processors/laptop/ryzen/ai-${series}-series/${slug}.html`,
    );
  }
  return urls;
}

export class AmdReleaseAdapter implements CpuReleaseAdapter {
  readonly vendor = "amd" as const;

  constructor(private readonly client: CpuReleaseHttpClient) {}

  supports(identity: CpuIdentity): boolean {
    return identity.vendor === this.vendor;
  }

  async discover(
    identities: readonly CpuIdentity[],
    options: CpuReleaseSyncOptions,
  ): Promise<Map<string, string[]>> {
    void options;
    const supported = identities.filter((identity) => this.supports(identity));
    let discovered = new Map(
      supported.map((identity) => [identity.normalizedName, [] as string[]]),
    );
    try {
      discovered = await discoverBatchFromOfficialSitemaps(
        this.client,
        amdSitemaps,
        supported,
      );
    } catch {
      // AMD's CDN occasionally rejects sitemap requests from edge runtimes.
      // Product candidates below remain official AMD URLs and are verified by parsing.
    }
    return new Map(
      supported.map((identity) => [
        identity.normalizedName,
        [
          ...new Set(
            [
              ...(discovered.get(identity.normalizedName) ?? []),
              findCuratedOfficialReference(identity)?.sourceUrl ?? "",
              ...amdOfficialCandidateUrls(identity),
            ].filter(Boolean),
          ),
        ],
      ]),
    );
  }

  async resolve(
    identity: CpuIdentity,
    candidateUrls: readonly string[],
    context?: CpuReleaseFetchContext,
  ): Promise<OfficialCpuReleaseRecord | null> {
    const reference = findCuratedOfficialReference(identity);
    const verifiedLaunch = parseReleasePeriod(
      reference?.rawReleaseValue ?? "",
      "en-US",
    );
    if (reference && verifiedLaunch.periodStart) {
      return officialRecord({
        identity,
        canonicalName: reference.canonicalName,
        launch: verifiedLaunch,
        sourceType: reference.sourceType,
        sourceUrl: reference.sourceUrl,
        sourceTitle: reference.sourceTitle,
        rawContent: JSON.stringify(reference),
      });
    }
    for (const url of candidateUrls.slice(0, 5)) {
      let response;
      try {
        response = await this.client.getText(
          url,
          conditionalRequest(context, url),
        );
      } catch (error) {
        if (error instanceof OfficialSourceNotModifiedError) throw error;
        continue;
      }
      if (!textContainsIdentity(response.body, identity.aliases)) continue;
      const rawLaunch = findLabelValue(response.body, [/^Launch Date$/i]);
      const launch = parseReleasePeriod(rawLaunch ?? "", "en-US");
      if (!launch.periodStart) continue;
      const name = findLabelValue(response.body, [/^Name$/i]) ??
        identity.rawName;
      const series = findLabelValue(response.body, [/^Series$/i]);
      const family = findLabelValue(response.body, [/^Family$/i]);
      const trayId = findLabelValue(response.body, [/^Product ID Tray$/i]);
      return officialRecord({
        identity,
        canonicalName: name,
        family,
        series,
        partNumber: trayId ?? identity.partNumber,
        launch,
        sourceType: "amd-product-specification",
        sourceUrl: response.url,
        sourceTitle: extractTitle(response.body),
        rawContent: response.body,
        etag: response.etag,
        lastModified: response.lastModified,
      });
    }
    return null;
  }
}
