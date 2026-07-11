import { parseReleasePeriod } from "../date-parser.ts";
import {
  extractLinks,
  extractTitle,
  findLabelValue,
  textContainsIdentity,
} from "../html.ts";
import type { CpuReleaseHttpClient } from "../http-client.ts";
import { findCuratedOfficialReference } from "../official-references.ts";
import type {
  CpuIdentity,
  CpuReleaseAdapter,
  CpuReleaseFetchContext,
  CpuReleaseSyncOptions,
  OfficialCpuReleaseRecord,
} from "../types.ts";
import { conditionalRequest, officialRecord } from "./shared.ts";

const intelArkIndex = "https://www.intel.com/content/www/us/en/ark.html";

function intelSeriesMatcher(identity: CpuIdentity): RegExp | null {
  const name = identity.rawName;
  const ultra = name.match(/Core\s+Ultra\s+[579]\s+(\d{3})/i)?.[1];
  if (ultra) {
    const series = ultra.startsWith("1") ? 1 : ultra.startsWith("2") ? 2 : 3;
    return new RegExp(`Core.*Ultra.*Series\\s*${series}`, "i");
  }
  const modernCore = name.match(/\bCore\s+[357]\s+(\d{3})/i)?.[1];
  if (modernCore) {
    const series = modernCore.startsWith("1")
      ? 1
      : modernCore.startsWith("2")
      ? 2
      : 3;
    return new RegExp(`Core.*processors.*Series\\s*${series}`, "i");
  }
  const legacyCore = name.match(/\bi([3579])-?(\d{4,5})/i);
  const tier = legacyCore?.[1];
  const model = legacyCore?.[2];
  const generation = model?.length === 5
    ? model.slice(0, 2)
    : model && Number(model.slice(0, 2)) >= 10
    ? model.slice(0, 2)
    : model?.slice(0, 1);
  if (!generation) return null;
  const ordinal = generation === "1"
    ? "1st"
    : generation === "2"
    ? "2nd"
    : generation === "3"
    ? "3rd"
    : `${generation}th`;
  return new RegExp(`${ordinal}.*Generation.*Core.*i${tier}`, "i");
}

function identityMatchesLink(
  identity: CpuIdentity,
  link: { url: string; text: string },
): boolean {
  const compact = `${link.url} ${link.text}`.toLowerCase().replace(
    /[^a-z0-9]+/g,
    "",
  );
  return [identity.partNumber, identity.modelNumber, ...identity.aliases].some(
    (value) => {
      const token = String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      return token.length >= 4 && compact.includes(token);
    },
  );
}

export class IntelReleaseAdapter implements CpuReleaseAdapter {
  readonly vendor = "intel" as const;

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
    const results = new Map(
      supported.map((identity) => [
        identity.normalizedName,
        [findCuratedOfficialReference(identity)?.sourceUrl].filter(
          Boolean,
        ) as string[],
      ]),
    );
    if (supported.length === 0) return results;
    let index;
    try {
      index = await this.client.getText(intelArkIndex, {
        maxBytes: 1_500_000,
      });
    } catch {
      return results;
    }
    const indexLinks = extractLinks(index.body, index.url);
    const seriesUrls = new Set<string>();
    for (const identity of supported) {
      const matcher = intelSeriesMatcher(identity);
      for (const link of indexLinks) {
        if (
          matcher?.test(link.text) &&
          /intel\.com\/content\/www\/us\/en\/(?:ark\/)?products\//i.test(
            link.url,
          )
        ) {
          seriesUrls.add(link.url);
        }
      }
    }
    for (const seriesUrl of [...seriesUrls].slice(0, 16)) {
      const series = await this.client.getText(seriesUrl, {
        maxBytes: 1_500_000,
      });
      const productLinks = extractLinks(series.body, series.url).filter(
        (link) =>
          /\/products\/sku\/\d+\//i.test(link.url) &&
          /specifications\.html/i.test(link.url),
      );
      for (const identity of supported) {
        const matches = productLinks.filter((link) =>
          identityMatchesLink(identity, link)
        );
        results.set(
          identity.normalizedName,
          [
            ...new Set([
              ...(results.get(identity.normalizedName) ?? []),
              ...matches.map((link) => link.url),
            ]),
          ].slice(
            0,
            8,
          ),
        );
      }
    }
    return results;
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
        partNumber: reference.modelNumber,
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
      } catch {
        continue;
      }
      if (!textContainsIdentity(response.body, identity.aliases)) continue;
      const rawLaunch = findLabelValue(response.body, [
        /^Launch Date$/i,
        /^Date de lancement$/i,
      ]);
      const launch = parseReleasePeriod(rawLaunch ?? "", "en-US");
      if (!launch.periodStart) continue;
      const processorNumber = findLabelValue(response.body, [
        /^Processor Number$/i,
        /^Numero du processeur$/i,
      ]);
      return officialRecord({
        identity,
        canonicalName: findLabelValue(response.body, [/^Intel.*Processor$/i]) ??
          extractTitle(response.body)
            ?.replace(/\s*[-|].*$/, "")
            .trim() ??
          identity.rawName,
        partNumber: processorNumber ?? identity.partNumber,
        launch,
        sourceType: "intel-ark-product-specification",
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
