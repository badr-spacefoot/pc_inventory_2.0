import { readStoredJson, readStoredObject } from "./storage";
import type {
  AdminSession,
  AdminView,
  AppState,
  MainView,
  TemperatureUnit,
  ThemePreference,
  TimeFormatPreference,
} from "./types";

export const storageKeys = Object.freeze({
  adminToken: "it_inventory_admin_token",
  adminUser: "it_inventory_admin_user",
  language: "it_inventory_language",
  themePreference: "it_inventory_theme_preference",
  timeFormatPreference: "it_inventory_time_format",
  temperatureUnit: "it_inventory_temperature_unit",
  collectionDraft: "it_inventory_collection_draft",
  collectorInstallState: "it_inventory_collector_install_state",
  collectorDownloadState: "it_inventory_collector_download_state",
  enrichmentWorkflowState: "it_inventory_enrichment_workflow_state",
});

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && allowed.includes(value as T) ? (value as T) : fallback;
}

export function createInitialState(storage: Storage): AppState {
  return {
    adminToken: storage.getItem(storageKeys.adminToken) || "",
    currentAdmin: readStoredJson<AdminSession | null>(storage, storageKeys.adminUser, null),
    language: oneOf(storage.getItem(storageKeys.language), ["fr", "en"] as const, "fr"),
    themePreference: oneOf<ThemePreference>(
      storage.getItem(storageKeys.themePreference),
      ["system", "light", "dark"],
      "system",
    ),
    timeFormatPreference: oneOf<TimeFormatPreference>(
      storage.getItem(storageKeys.timeFormatPreference),
      ["auto", "24h", "12h"],
      "auto",
    ),
    temperatureUnit: oneOf<TemperatureUnit>(
      storage.getItem(storageKeys.temperatureUnit),
      ["celsius", "fahrenheit"],
      "celsius",
    ),
    weather: null,
    devices: [],
    filtered: [],
    selectedDeviceId: "",
    selectedDetail: null,
    selectedScans: [],
    selectedHistory: [],
    activeDetailTab: "overview",
    accessTokens: [],
    collectionInvites: [],
    currentInviteCode: "",
    currentInvite: null,
    rawInviteUrls: {},
    rawAccessTokens: {},
    teams: [],
    establishments: [],
    users: [],
    cpuBenchmarkStats: null,
    adminUsers: [],
    adminUserInvites: [],
    currentAdminUserInvite: null,
    rawAdminUserInviteUrls: {},
    notifications: [],
    unreadNotifications: 0,
    pendingChanges: [],
    collectionDraft: readStoredObject(storage, storageKeys.collectionDraft),
    scriptPreviewText: "",
    collectorReleases: null,
    detectedPlatform: "unknown",
    prefillCode: "",
    prefillPayload: null,
    collectorLaunchUrl: "",
    collectorInstallState: readStoredJson(storage, storageKeys.collectorInstallState, null),
    collectorDownloadState: readStoredJson(storage, storageKeys.collectorDownloadState, null),
    mapProvider: "openstreetmap",
    currentView: "collect" as MainView,
    currentAdminView: "fleet" as AdminView,
  };
}
