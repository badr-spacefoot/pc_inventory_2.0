import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "../../frontend/src/core/http/api-client";

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("adds authentication and parses successful JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: "https://example.test/api", getAuthToken: () => "token", fetcher });

    await expect(client.request<{ ok: boolean }>("/devices")).resolves.toEqual({ ok: true });
    const request = fetcher.mock.calls[0];
    expect(request?.[0]).toBe("https://example.test/api/devices");
    expect(new Headers(request?.[1]?.headers).get("Authorization")).toBe("Bearer token");
  });

  it("does not retry non-idempotent requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "No" }, 503));
    const client = new ApiClient({ baseUrl: "https://example.test", fetcher, defaultRetries: 3 });

    await expect(client.request("/devices", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries transient GET failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ devices: [] }));
    const client = new ApiClient({ baseUrl: "https://example.test", fetcher, defaultRetries: 1 });

    await expect(client.request("/devices", { retryDelayMs: 0 })).resolves.toEqual({ devices: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("exposes structured API error details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "Forbidden", code: "DENIED" }, 403));
    const client = new ApiClient({ baseUrl: "https://example.test", fetcher });

    const error = await client.request("/devices", { retries: 0 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Forbidden", status: 403, details: { code: "DENIED" } });
  });
});
