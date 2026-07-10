import { describe, expect, it, vi } from "vitest";

import type { ApiRequestOptions } from "../../frontend/src/core/types";
import { InventoryApi, type ApiTransport } from "../../frontend/src/services/inventory-api";

function setup() {
  const request = vi.fn();
  const transport: ApiTransport = {
    request<T>(path: string, options?: ApiRequestOptions) {
      if (options) request(path, options);
      else request(path);
      return Promise.resolve({} as T);
    },
  };
  return { api: new InventoryApi(transport), request };
}

describe("InventoryApi", () => {
  it("encodes dynamic path segments", async () => {
    const { api, request } = setup();

    await api.getCollectionInvite("code with/slash");

    expect(request).toHaveBeenCalledWith("/collect/invite/code%20with%2Fslash");
  });

  it("serializes mutation payloads consistently", async () => {
    const { api, request } = setup();

    await api.updateDeviceStatus("device-1", { status: "stock", notes: "Ready" });

    expect(request).toHaveBeenCalledWith("/admin/devices/device-1/status", {
      method: "POST",
      body: JSON.stringify({ status: "stock", notes: "Ready" }),
    });
  });

  it("keeps cancellation on address autocomplete requests", async () => {
    const { api, request } = setup();
    const controller = new AbortController();

    await api.autocompleteAddress("q=Paris", controller.signal);

    expect(request).toHaveBeenCalledWith("/admin/address/autocomplete?q=Paris", { signal: controller.signal });
  });

  it("allows enrichment batches enough time to query external providers", async () => {
    const { api, request } = setup();

    await api.processEnrichmentJob({ jobId: "job-1", limit: 2 });

    expect(request).toHaveBeenCalledWith("/admin/enrichment-jobs/process", {
      method: "POST",
      body: JSON.stringify({ jobId: "job-1", limit: 2 }),
      timeoutMs: 120_000,
    });
  });
});
