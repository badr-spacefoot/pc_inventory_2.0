export type ThemePreference = "system" | "light" | "dark";
export type TimeFormatPreference = "auto" | "24h" | "12h";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type MainView = "collect" | "admin";
export type AdminView = "fleet" | "organization" | "valuation" | "access" | "users" | "pending" | "notifications";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface InventoryConfig {
  apiBaseUrl: string;
  scriptUrl: string;
  collectorReleaseConfigUrl: string;
  staleDays: number;
  weatherLatitude: number;
  weatherLongitude: number;
  weatherLocationLabel: string;
}

export interface RuntimeConfiguration {
  IT_INVENTORY_API_URL?: string;
  IT_INVENTORY_SCRIPT_URL?: string;
  IT_INVENTORY_COLLECTOR_RELEASES_URL?: string;
  IT_INVENTORY_STALE_DAYS?: string | number;
  IT_INVENTORY_WEATHER_LATITUDE?: string | number;
  IT_INVENTORY_WEATHER_LONGITUDE?: string | number;
  IT_INVENTORY_WEATHER_LOCATION?: string;
}

export interface AdminSession {
  id?: string;
  username?: string;
  displayName?: string;
  role?: string;
}

export interface DeviceSummary {
  id: string;
  hostname?: string;
  serial_number?: string;
  service_tag?: string;
  status?: string;
  assigned_user_id?: string | null;
  team_id?: string | null;
  establishment_id?: string | null;
  manufacturer?: string;
  model?: string;
  cpu?: string;
  gpu?: string;
  ram_total_gb?: number | null;
  storage_total_gb?: number | null;
  storage_free_gb?: number | null;
  last_seen_at?: string;
  [key: string]: JsonValue | undefined;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  abbreviation?: string | null;
  color?: string | null;
  active?: boolean;
  [key: string]: JsonValue | undefined;
}

export interface UserRecord {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  [key: string]: JsonValue | undefined;
}

export interface AppState {
  adminToken: string;
  currentAdmin: AdminSession | null;
  language: "fr" | "en";
  themePreference: ThemePreference;
  timeFormatPreference: TimeFormatPreference;
  temperatureUnit: TemperatureUnit;
  weather: JsonObject | null;
  devices: DeviceSummary[];
  filtered: DeviceSummary[];
  selectedDeviceId: string;
  selectedDetail: DeviceSummary | null;
  selectedScans: JsonObject[];
  selectedHistory: JsonObject[];
  activeDetailTab: string;
  accessTokens: JsonObject[];
  collectionInvites: JsonObject[];
  currentInviteCode: string;
  currentInvite: JsonObject | null;
  rawInviteUrls: Record<string, string>;
  rawAccessTokens: Record<string, string>;
  teams: OrganizationRecord[];
  establishments: OrganizationRecord[];
  users: UserRecord[];
  cpuBenchmarkStats: JsonObject | null;
  adminUsers: JsonObject[];
  adminUserInvites: JsonObject[];
  currentAdminUserInvite: JsonObject | null;
  rawAdminUserInviteUrls: Record<string, string>;
  notifications: JsonObject[];
  unreadNotifications: number;
  pendingChanges: JsonObject[];
  collectionDraft: JsonObject;
  scriptPreviewText: string;
  collectorReleases: JsonObject | null;
  detectedPlatform: string;
  prefillCode: string;
  prefillPayload: JsonObject | null;
  collectorLaunchUrl: string;
  collectorInstallState: JsonObject | null;
  collectorDownloadState: JsonObject | null;
  mapProvider: string;
  currentView: MainView;
  currentAdminView: AdminView;
}

export interface ApiClientConfiguration {
  baseUrl: string;
  getAuthToken?: () => string;
  fetcher?: typeof fetch;
  defaultTimeoutMs?: number;
  defaultRetries?: number;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}
