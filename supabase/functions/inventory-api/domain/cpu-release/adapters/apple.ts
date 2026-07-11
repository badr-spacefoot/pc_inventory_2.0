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
} from "../types.ts";
import { conditionalRequest, officialRecord } from "./shared.ts";

const appleSitemaps = ["https://www.apple.com/newsroom/sitemap.xml"];

function articleDate(html: string): string | null {
  const meta = extractMetaContent(html, [
    "article:published_time",
    "date",
    "parsely-pub-date",
  ]);
  if (meta) return meta.slice(0, 10);
  return (
    htmlToText(html).match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i,
    )?.[0] ?? null
  );
}

function availabilityDate(
  html: string,
  announcementDate: string | null,
): string | null {
  const text = htmlToText(html);
  const explicit = text.match(
    /(?:available|availability|orders begin|orderable)[^.]{0,140}?\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\b/i,
  )?.[1];
  if (explicit) return explicit;
  const withoutYear = text.match(
    /(?:available|availability|orders begin|orderable)[^.]{0,140}?\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\b/i,
  )?.[1];
  return withoutYear && announcementDate
    ? `${withoutYear}, ${announcementDate.slice(0, 4)}`
    : null;
}

export class AppleReleaseAdapter implements CpuReleaseAdapter {
  readonly vendor = "apple" as const;

  constructor(private readonly client: CpuReleaseHttpClient) {}

  supports(identity: CpuIdentity): boolean {
    return identity.vendor === this.vendor;
  }

  async discover(
    identities: readonly CpuIdentity[],
    options: CpuReleaseSyncOptions,
  ): Promise<Map<string, string[]>> {
    void options;
    return discoverBatchFromOfficialSitemaps(
      this.client,
      appleSitemaps,
      identities.filter((identity) => this.supports(identity)),
    );
  }

  async resolve(
    identity: CpuIdentity,
    candidateUrls: readonly string[],
    context?: CpuReleaseFetchContext,
  ): Promise<OfficialCpuReleaseRecord | null> {
    for (const url of candidateUrls.slice(0, 8)) {
      const response = await this.client.getText(
        url,
        conditionalRequest(context, url),
      );
      if (!textContainsIdentity(response.body, identity.aliases)) continue;
      const rawDate = articleDate(response.body);
      const announcement = parseReleasePeriod(rawDate ?? "", "en-US");
      if (!announcement.periodStart) continue;
      const rawAvailability = availabilityDate(
        response.body,
        announcement.periodStart,
      );
      const availability = parseReleasePeriod(rawAvailability ?? "", "en-US");
      return officialRecord({
        identity,
        canonicalName: `Apple ${
          identity.appleVariant ?? identity.modelNumber ?? "Silicon"
        }`,
        family: "Apple Silicon",
        announcement,
        availability: availability.periodStart ? availability : null,
        sourceType: "apple-newsroom-announcement",
        sourceUrl: response.url,
        sourceTitle: extractTitle(response.body),
        sourcePublishedAt: announcement.periodStart,
        matchScope: identity.appleVariant ? "exact_name" : "family",
        rawContent: response.body,
        etag: response.etag,
        lastModified: response.lastModified,
      });
    }
    return null;
  }
}
