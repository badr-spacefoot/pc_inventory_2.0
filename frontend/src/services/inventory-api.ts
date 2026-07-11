import type { ApiRequestOptions, JsonObject } from "../core/types";

export interface ApiTransport {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

type ApiResponse = JsonObject;
const ENRICHMENT_JOB_REQUEST_TIMEOUT_MS = 120_000;
const CPU_REFERENCE_REQUEST_TIMEOUT_MS = 120_000;
const EDGE_DEPLOYMENT_RETRIES = 2;
const EDGE_DEPLOYMENT_RETRY_DELAY_MS = 750;

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function jsonRequest(method: "POST" | "DELETE", payload?: JsonObject): ApiRequestOptions {
  return {
    method,
    ...(payload ? { body: JSON.stringify(payload) } : method === "POST" ? { body: "{}" } : {}),
  };
}

export class InventoryApi {
  constructor(private readonly transport: ApiTransport) {}

  getCollectionInvite(inviteCode: string): Promise<ApiResponse> {
    return this.transport.request(`/collect/invite/${encodePathSegment(inviteCode)}`);
  }

  createInvitePrefill(inviteCode: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(
      `/collect/invite/${encodePathSegment(inviteCode)}/prefill`,
      jsonRequest("POST", payload),
    );
  }

  createPrefill(payload: JsonObject, accessToken: string): Promise<ApiResponse> {
    const request = jsonRequest("POST", payload);
    return this.transport.request("/collect/prefill", {
      ...request,
      headers: { "X-Collection-Access-Token": accessToken },
    });
  }

  authenticateAdmin(credentials: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/auth/admin", jsonRequest("POST", credentials));
  }

  listAccessTokens(): Promise<ApiResponse> {
    return this.transport.request("/admin/access-tokens");
  }

  createAccessToken(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/access-tokens", jsonRequest("POST", payload));
  }

  revokeAccessToken(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/access-tokens/${encodePathSegment(id)}/revoke`, jsonRequest("POST"));
  }

  deleteAccessToken(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/access-tokens/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  listCollectionInvites(): Promise<ApiResponse> {
    return this.transport.request("/admin/collection-invites");
  }

  createCollectionInvite(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/collection-invites", jsonRequest("POST", payload));
  }

  revokeCollectionInvite(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/collection-invites/${encodePathSegment(id)}/revoke`, jsonRequest("POST"));
  }

  deleteCollectionInvite(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/collection-invites/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  listAdminUsers(): Promise<ApiResponse> {
    return this.transport.request("/admin/users");
  }

  saveAdminUser(id: string, payload: JsonObject): Promise<ApiResponse> {
    const path = id ? `/admin/users/${encodePathSegment(id)}` : "/admin/users";
    return this.transport.request(path, jsonRequest("POST", payload));
  }

  deleteAdminUser(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/users/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  listNotifications(): Promise<ApiResponse> {
    return this.transport.request("/admin/notifications");
  }

  markNotificationRead(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/notifications/${encodePathSegment(id)}/read`, jsonRequest("POST"));
  }

  markAllNotificationsRead(): Promise<ApiResponse> {
    return this.transport.request("/admin/notifications/read-all", jsonRequest("POST"));
  }

  listPendingChanges(): Promise<ApiResponse> {
    return this.transport.request("/admin/pending-changes");
  }

  decidePendingChange(id: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(
      `/admin/pending-changes/${encodePathSegment(id)}/decision`,
      jsonRequest("POST", payload),
    );
  }

  listDevices(): Promise<ApiResponse> {
    return this.transport.request("/admin/devices");
  }

  getDevice(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}`);
  }

  deleteDevice(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  updateDeviceAssignment(id: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}/assignment`, jsonRequest("POST", payload));
  }

  updateDeviceStatus(id: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}/status`, jsonRequest("POST", payload));
  }

  addDeviceInvoice(id: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}/invoices`, jsonRequest("POST", payload));
  }

  deleteDeviceInvoice(deviceId: string, invoiceId: string): Promise<ApiResponse> {
    return this.transport.request(
      `/admin/devices/${encodePathSegment(deviceId)}/invoices/${encodePathSegment(invoiceId)}`,
      jsonRequest("DELETE"),
    );
  }

  addDeviceHistoryNote(id: string, payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request(`/admin/devices/${encodePathSegment(id)}/history-note`, jsonRequest("POST", payload));
  }

  enrichDevices(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/enrich", jsonRequest("POST", payload));
  }

  startEnrichmentJob(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/enrichment-jobs", jsonRequest("POST", payload));
  }

  processEnrichmentJob(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/enrichment-jobs/process", {
      ...jsonRequest("POST", payload),
      timeoutMs: ENRICHMENT_JOB_REQUEST_TIMEOUT_MS,
    });
  }

  getActiveEnrichmentJob(): Promise<ApiResponse> {
    return this.transport.request("/admin/enrichment-jobs/active");
  }

  getAdminOrganization(): Promise<ApiResponse> {
    return this.transport.request("/admin/organization");
  }

  getPublicOrganization(): Promise<ApiResponse> {
    return this.transport.request("/organization");
  }

  reorderOrganization(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/organization/reorder", jsonRequest("POST", payload));
  }

  reassignOrganization(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/organization/reassign", jsonRequest("POST", payload));
  }

  saveTeam(id: string, payload: JsonObject): Promise<ApiResponse> {
    const path = id ? `/admin/teams/${encodePathSegment(id)}` : "/admin/teams";
    return this.transport.request(path, jsonRequest("POST", payload));
  }

  deleteTeam(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/teams/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  saveEstablishment(id: string, payload: JsonObject): Promise<ApiResponse> {
    const path = id ? `/admin/establishments/${encodePathSegment(id)}` : "/admin/establishments";
    return this.transport.request(path, jsonRequest("POST", payload));
  }

  deleteEstablishment(id: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/establishments/${encodePathSegment(id)}`, jsonRequest("DELETE"));
  }

  autocompleteAddress(query: string, signal?: AbortSignal): Promise<ApiResponse> {
    return this.transport.request(`/admin/address/autocomplete?${query}`, signal ? { signal } : {});
  }

  getAddressDetails(query: string): Promise<ApiResponse> {
    return this.transport.request(`/admin/address/details?${query}`);
  }

  getCpuBenchmarkStats(): Promise<ApiResponse> {
    return this.transport.request("/admin/cpu-benchmarks");
  }

  importCpuBenchmarks(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/cpu-benchmarks/import", jsonRequest("POST", payload));
  }

  refreshCpuReleaseDates(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/cpu-benchmarks/refresh-release-dates", {
      ...jsonRequest("POST", payload),
      timeoutMs: CPU_REFERENCE_REQUEST_TIMEOUT_MS,
    });
  }

  syncCpuBenchmarks(payload: JsonObject): Promise<ApiResponse> {
    return this.transport.request("/admin/cpu-benchmarks/sync", {
      ...jsonRequest("POST", payload),
      retries: EDGE_DEPLOYMENT_RETRIES,
      retryDelayMs: EDGE_DEPLOYMENT_RETRY_DELAY_MS,
    });
  }
}
