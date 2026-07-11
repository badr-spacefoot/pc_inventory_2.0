export interface HttpTextResponse {
  url: string;
  body: string;
  status: number;
  etag: string | null;
  lastModified: string | null;
}

export interface CpuReleaseHttpClient {
  getText(
    url: string,
    init?: {
      timeoutMs?: number;
      maxBytes?: number;
      etag?: string | null;
      lastModified?: string | null;
    },
  ): Promise<HttpTextResponse>;
}

export class OfficialSourceNotModifiedError extends Error {
  constructor(readonly url: string) {
    super(`Official source was not modified: ${url}`);
    this.name = "OfficialSourceNotModifiedError";
  }
}

const officialHosts = ["intel.com", "amd.com", "apple.com", "qualcomm.com"];

function isOfficialHost(hostname: string): boolean {
  return officialHosts.some((host) =>
    hostname === host || hostname.endsWith(`.${host}`)
  );
}

export class BoundedCpuReleaseHttpClient implements CpuReleaseHttpClient {
  private readonly cache = new Map<string, HttpTextResponse>();

  constructor(private readonly userAgent = "SpacefootInventory/1.0") {}

  async getText(
    rawUrl: string,
    init: {
      timeoutMs?: number;
      maxBytes?: number;
      etag?: string | null;
      lastModified?: string | null;
    } = {},
  ): Promise<HttpTextResponse> {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !isOfficialHost(url.hostname)) {
      throw new Error(
        `CPU release source is not an allowed official host: ${url.hostname}`,
      );
    }
    const cached = this.cache.get(url.toString());
    if (cached && !init.etag && !init.lastModified) return cached;

    const timeoutMs = Math.max(
      1_000,
      Math.min(init.timeoutMs ?? 8_000, 20_000),
    );
    const maxBytes = Math.max(
      8_192,
      Math.min(init.maxBytes ?? 750_000, 2_000_000),
    );
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const conditionalHeaders = {
          ...(init.etag ? { "if-none-match": init.etag } : {}),
          ...(init.lastModified
            ? { "if-modified-since": init.lastModified }
            : {}),
        };
        const response = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml,text/xml",
            "accept-language": "en-US,en;q=0.9",
            "user-agent": this.userAgent,
            ...conditionalHeaders,
          },
        });
        const finalUrl = new URL(response.url || url);
        if (!isOfficialHost(finalUrl.hostname)) {
          throw new Error(
            `Official source redirected to an untrusted host: ${finalUrl.hostname}`,
          );
        }
        if (response.status === 304) {
          throw new OfficialSourceNotModifiedError(finalUrl.toString());
        }
        if (!response.ok) {
          throw new Error(`Official source returned HTTP ${response.status}`);
        }
        const body = (await response.text()).slice(0, maxBytes);
        const result = {
          url: response.url || url.toString(),
          body,
          status: response.status,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        };
        this.cache.set(url.toString(), result);
        return result;
      } catch (error) {
        if (error instanceof OfficialSourceNotModifiedError) throw error;
        lastError = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Official source request failed");
  }
}
