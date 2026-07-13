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

  it("encodes account invitation tokens and activation payloads", async () => {
    const { api, request } = setup();

    await api.acceptAdminUserInvite("token with/slash", {
      password: "strong-password",
      passwordConfirmation: "strong-password",
    });

    expect(request).toHaveBeenCalledWith("/auth/user-invitations/token%20with%2Fslash", {
      method: "POST",
      body: JSON.stringify({
        password: "strong-password",
        passwordConfirmation: "strong-password",
      }),
    });
  });

  it("uses the dedicated admin invitation endpoints", async () => {
    const { api, request } = setup();

    await api.createAdminUserInvite({ username: "alex", role: "VIEWER" });
    await api.revokeAdminUserInvite("invite-1");

    expect(request).toHaveBeenNthCalledWith(1, "/admin/user-invitations", {
      method: "POST",
      body: JSON.stringify({ username: "alex", role: "VIEWER" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/admin/user-invitations/invite-1/revoke", {
      method: "POST",
      body: "{}",
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

  it("retries CPU synchronization during a transient Edge deployment", async () => {
    const { api, request } = setup();

    await api.syncCpuBenchmarks({ limit: 250 });

    expect(request).toHaveBeenCalledWith("/admin/cpu-benchmarks/sync", {
      method: "POST",
      body: JSON.stringify({ limit: 250 }),
      retries: 2,
      retryDelayMs: 750,
    });
  });
});
