import { parseReleasePeriod } from "../date-parser.ts";
import {
  extractMetaContent,
  extractTitle,
  htmlToText,
  textContainsIdentity,
} from "../html.ts";
import type { CpuReleaseHttpClient } from "../http-client.ts";
import { discoverBatchFromOfficialSitemaps } from "../sitemap.ts";
import type {
  CpuIdentity,
  CpuReleaseAdapter,
  CpuReleaseFetchContext,
  CpuReleaseSyncOptions,
  OfficialCpuReleaseRecord,
  ReleasePeriod,
} from "../types.ts";
import { conditionalRequest, officialRecord } from "./shared.ts";

const qualcommSitemaps = ["https://www.qualcomm.com/sitemap.xml"];
const snapdragonXProductPage =
  "https://www.qualcomm.com/laptops/products/snapdragon-x-plus";
const snapdragonXPlusAnnouncement =
  "https://www.qualcomm.com/news/releases/2024/04/qualcomm-continues-to-disrupt-the-pc-industry-with-the-addition-";
const snapdragonXAnnouncement =
  "https://www.qualcomm.com/snapdragon/news/welcome-to-the-future-with-snapdragon-x-unveiled-at-ces-2025-";

function officialEntryPoints(identity: CpuIdentity): string[] {
  if (identity.family === "Snapdragon X Plus") {
    return [snapdragonXProductPage, snapdragonXPlusAnnouncement];
  }
  if (identity.family === "Snapdragon X") {
    return [snapdragonXProductPage, snapdragonXAnnouncement];
  }
  return [];
}

function aemModelUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!url.pathname.endsWith(".model.json")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}.model.json`;
  }
  return url.toString();
}

function findFirstProperty(value: unknown, property: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstProperty(item, property);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (key === property) return item;
    const match = findFirstProperty(item, property);
    if (match !== undefined) return match;
  }
  return undefined;
}

function parseAemModel(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function modelPublishedDate(body: string): string | null {
  const raw = findFirstProperty(parseAemModel(body), "publishDate");
  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp * (timestamp < 10_000_000_000 ? 1_000 : 1))
    .toISOString().slice(0, 10);
}

function modelTitle(body: string): string | null {
  const title = findFirstProperty(parseAemModel(body), "title");
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function matchesQualcommFamily(body: string, family: string | null): boolean {
  if (family !== "Snapdragon X") {
    return textContainsIdentity(body, [family ?? ""]);
  }
  return /\bSnapdragon\s+X(?!\d)(?=\s+(?:processor|platform|series)|[\s—:,.]|$)/i
    .test(htmlToText(body));
}

function publishedDate(html: string): ReleasePeriod | null {
  const value = modelPublishedDate(html) ??
    extractMetaContent(html, [
      "article:published_time",
      "date",
      "datePublished",
    ])?.slice(0, 10) ??
    htmlToText(html).match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\b/i,
    )?.[0];
  const period = parseReleasePeriod(value ?? "", "en-US");
  return period.periodStart ? period : null;
}

function expectedAvailability(html: string): ReleasePeriod | null {
  const text = htmlToText(html);
  const match = text.match(
    /(?:expected|scheduled|set)[^.]{0,80}?(?:available|launch)[^.]{0,140}?\b((?:mid[- ]?)?20\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+20\d{2}|Q[1-4]\s*[' ]?\s*\d{2,4})\b/i,
  );
  const period = parseReleasePeriod(match?.[1] ?? "", "en-US");
  return period.periodStart ? period : null;
}

export class QualcommReleaseAdapter implements CpuReleaseAdapter {
  readonly vendor = "qualcomm" as const;

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
    const exact = await discoverBatchFromOfficialSitemaps(
      this.client,
      qualcommSitemaps,
      supported,
    );
    const familyIdentities = supported.map((identity) => ({
      ...identity,
      aliases: [...new Set([...identity.aliases, identity.family ?? ""])]
        .filter(Boolean),
    }));
    const family = await discoverBatchFromOfficialSitemaps(
      this.client,
      qualcommSitemaps,
      familyIdentities,
      30,
      32,
    );
    return new Map(
      supported.map((identity) => {
        const partToken =
          identity.partNumber?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
        const entryPoints = officialEntryPoints(identity);
        const rank = (url: string): number => {
          const officialIndex = entryPoints.indexOf(url);
          if (officialIndex >= 0) return officialIndex;
          const compact = url.toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (partToken && compact.includes(partToken)) return 10;
          if (/\/laptops\/products\//i.test(url)) return 11;
          if (/\/news\/releases\//i.test(url)) return 12;
          if (/\/news\/onq\//i.test(url)) return 13;
          return 14;
        };
        const candidates = [
          ...new Set([
            ...entryPoints,
            ...(exact.get(identity.normalizedName) ?? []),
            ...(family.get(identity.normalizedName) ?? []),
          ]),
        ]
          .sort((left, right) => rank(left) - rank(right))
          .slice(0, 12);
        return [identity.normalizedName, candidates];
      }),
    );
  }

  async resolve(
    identity: CpuIdentity,
    candidateUrls: readonly string[],
    context?: CpuReleaseFetchContext,
  ): Promise<OfficialCpuReleaseRecord | null> {
    const evidence = [];
    let exactProduct:
      | Awaited<ReturnType<CpuReleaseHttpClient["getText"]>>
      | null = null;
    let announcementSource:
      | Awaited<ReturnType<CpuReleaseHttpClient["getText"]>>
      | null = null;
    let announcement: ReleasePeriod | null = null;
    let availability: ReleasePeriod | null = null;
    for (const url of candidateUrls.slice(0, 8)) {
      let response;
      try {
        const modelResponse = await this.client.getText(aemModelUrl(url));
        response = { ...modelResponse, url };
      } catch {
        try {
          response = await this.client.getText(
            url,
            conditionalRequest(context, url),
          );
        } catch {
          continue;
        }
      }
      const matchesExactIdentity = textContainsIdentity(
        response.body,
        identity.aliases,
      );
      const matchesFamily = matchesQualcommFamily(
        response.body,
        identity.family,
      );
      if (!matchesExactIdentity && !matchesFamily) continue;
      const title = extractTitle(response.body) ?? modelTitle(response.body) ??
        undefined;
      const exactPartProvenByProductPage = url === snapdragonXProductPage &&
        Boolean(identity.partNumber);
      if (
        identity.partNumber &&
        (textContainsIdentity(response.body, [identity.partNumber]) ||
          exactPartProvenByProductPage)
      ) {
        exactProduct ??= response;
        evidence.push({
          type: "qualcomm-product-part-number",
          url: response.url,
          ...(title ? { title } : {}),
        });
      }
      const published = url === snapdragonXProductPage
        ? null
        : publishedDate(response.body);
      if (published?.periodStart && matchesFamily) {
        announcementSource ??= response;
        announcement ??= published;
        availability ??= expectedAvailability(response.body);
        evidence.push({
          type: "qualcomm-family-announcement",
          url: response.url,
          ...(title ? { title } : {}),
        });
      }
    }
    if (!announcementSource || !announcement?.periodStart) return null;
    const hasExactSkuMapping = Boolean(exactProduct && identity.partNumber);
    return officialRecord({
      identity,
      canonicalName: identity.partNumber
        ? `${identity.family ?? "Qualcomm Snapdragon"} ${identity.partNumber}`
        : (identity.family ?? identity.rawName),
      family: identity.family,
      partNumber: identity.partNumber,
      announcement,
      availability,
      effectiveEventType: availability?.periodStart
        ? "expected_availability"
        : "announcement",
      sourceType: availability?.periodStart
        ? "qualcomm-expected-product-availability"
        : "qualcomm-family-announcement",
      sourceUrl: announcementSource.url,
      sourceTitle: extractTitle(announcementSource.body) ??
        modelTitle(announcementSource.body),
      sourcePublishedAt: announcement.periodStart,
      sourceEvidence: evidence,
      matchScope: "family",
      aliases: hasExactSkuMapping && identity.partNumber
        ? [identity.partNumber]
        : [],
      rawContent: [exactProduct?.body, announcementSource.body]
        .filter((body): body is string => Boolean(body))
        .join("\n"),
      etag: announcementSource.etag,
      lastModified: announcementSource.lastModified,
    });
  }
}
