import type { ApiClientConfiguration, ApiRequestOptions, JsonObject, JsonValue } from "../types";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly status: number;
  readonly details: JsonObject;

  constructor(message: string, status: number, details: JsonObject = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(body: unknown): string {
  if (isJsonObject(body)) {
    const candidate = body.error ?? body.message;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "Erreur API";
}

function isRetryableResponse(status: number, body: unknown): boolean {
  if (RETRYABLE_STATUS_CODES.has(status)) return true;
  return status === 404 && /^requested function was not found\.?$/i.test(errorMessage(body));
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function createRequestSignal(parentSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );

  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function parseResponse(response: Response): Promise<JsonValue | string> {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? ((await response.json()) as JsonValue) : response.text();
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAuthToken: () => string;
  private readonly fetcher: typeof fetch;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;

  constructor(configuration: ApiClientConfiguration) {
    this.baseUrl = configuration.baseUrl.replace(/\/$/, "");
    this.getAuthToken = configuration.getAuthToken ?? (() => "");
    this.fetcher = configuration.fetcher ?? fetch.bind(window);
    this.defaultTimeoutMs = configuration.defaultTimeoutMs ?? 20_000;
    this.defaultRetries = configuration.defaultRetries ?? 2;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = String(options.method || "GET").toUpperCase();
    const retries = options.retries ?? (IDEMPOTENT_METHODS.has(method) ? this.defaultRetries : 0);
    const retryDelayMs = options.retryDelayMs ?? 250;
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const token = this.getAuthToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const requestSignal = createRequestSignal(options.signal, options.timeoutMs ?? this.defaultTimeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          ...options,
          headers,
          signal: requestSignal.signal,
        });
        const body = await parseResponse(response);
        if (response.ok) return body as T;

        if (attempt < retries && isRetryableResponse(response.status, body)) {
          await delay(retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new ApiError(errorMessage(body), response.status, isJsonObject(body) ? body : {});
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (options.signal?.aborted) throw error;
        if (attempt >= retries) throw error;
        await delay(retryDelayMs * 2 ** attempt);
      } finally {
        requestSignal.dispose();
      }
    }

    throw new Error("Unreachable API retry state");
  }
}
