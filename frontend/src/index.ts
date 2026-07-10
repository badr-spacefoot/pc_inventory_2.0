import { createInventoryConfig } from "./core/config";
import { queryElement, queryElements, requireElement } from "./core/dom";
import { ApiClient, ApiError } from "./core/http/api-client";
import { createInitialState, storageKeys } from "./core/state";
import type { AppState, InventoryConfig, RuntimeConfiguration } from "./core/types";
import * as dates from "./domain/dates";
import * as inventory from "./domain/inventory";
import * as fleet from "./features/fleet/analytics";
import * as collector from "./features/collector/platform";
import * as enrichment from "./features/enrichment/workflow";
import * as invoices from "./features/invoices/warranty";
import * as notifications from "./features/notifications/model";
import * as history from "./features/history/history-model";
import * as organization from "./features/organization/statistics";
import { localizeErrorMessage } from "./i18n/errors";
import { englishTranslations, frenchNotificationTranslations, normalizeTranslationKey } from "./i18n/translations";
import * as formatters from "./i18n/formatters";
import { InventoryApi } from "./services/inventory-api";
import { PublicResourceService } from "./services/public-resources";

export interface SpacefootCore {
  config: InventoryConfig;
  constants: {
    collectorInstallStateKey: string;
    collectorDownloadStateKey: string;
    enrichmentWorkflowStateKey: string;
    enrichmentBatchSize: number;
  };
  createInitialState: () => AppState;
  createApiClient: (getAuthToken: () => string) => ApiClient;
  createInventoryApi: (client: ApiClient) => InventoryApi;
  createPublicResourceService: () => PublicResourceService;
  queryElement: typeof queryElement;
  queryElements: typeof queryElements;
  requireElement: typeof requireElement;
  ApiError: typeof ApiError;
  translations: {
    english: typeof englishTranslations;
    frenchNotifications: typeof frenchNotificationTranslations;
    normalizeKey: typeof normalizeTranslationKey;
    localizeError: typeof localizeErrorMessage;
  };
  domain: {
    dates: typeof dates;
    collector: typeof collector;
    enrichment: typeof enrichment;
    fleet: typeof fleet;
    invoices: typeof invoices;
    notifications: typeof notifications;
    history: typeof history;
    inventory: typeof inventory;
    organization: typeof organization;
    formatters: typeof formatters;
  };
}

declare global {
  interface Window extends RuntimeConfiguration {
    SpacefootCore: SpacefootCore;
  }
}

const config = createInventoryConfig(window);

window.SpacefootCore = Object.freeze({
  config,
  constants: Object.freeze({
    collectorInstallStateKey: storageKeys.collectorInstallState,
    collectorDownloadStateKey: storageKeys.collectorDownloadState,
    enrichmentWorkflowStateKey: storageKeys.enrichmentWorkflowState,
    enrichmentBatchSize: 10,
  }),
  createInitialState: () => createInitialState(window.localStorage),
  createApiClient: (getAuthToken: () => string) => new ApiClient({ baseUrl: config.apiBaseUrl, getAuthToken }),
  createInventoryApi: (client: ApiClient) => new InventoryApi(client),
  createPublicResourceService: () => new PublicResourceService(),
  queryElement,
  queryElements,
  requireElement,
  ApiError,
  translations: Object.freeze({
    english: Object.freeze(englishTranslations),
    frenchNotifications: Object.freeze(frenchNotificationTranslations),
    normalizeKey: normalizeTranslationKey,
    localizeError: localizeErrorMessage,
  }),
  domain: Object.freeze({
    dates: Object.freeze(dates),
    collector: Object.freeze(collector),
    enrichment: Object.freeze(enrichment),
    fleet: Object.freeze(fleet),
    invoices: Object.freeze(invoices),
    notifications: Object.freeze(notifications),
    history: Object.freeze(history),
    inventory: Object.freeze(inventory),
    organization: Object.freeze(organization),
    formatters: Object.freeze(formatters),
  }),
});
