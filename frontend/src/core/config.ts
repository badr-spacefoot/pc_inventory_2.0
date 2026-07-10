import type { InventoryConfig, RuntimeConfiguration } from "./types";

const DEFAULT_API_URL = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api";
const DEFAULT_SCRIPT_URL = "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1";

function finiteNumber(value: string | number | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createInventoryConfig(runtime: RuntimeConfiguration): InventoryConfig {
  return Object.freeze({
    apiBaseUrl: runtime.IT_INVENTORY_API_URL || DEFAULT_API_URL,
    scriptUrl: runtime.IT_INVENTORY_SCRIPT_URL || DEFAULT_SCRIPT_URL,
    collectorReleaseConfigUrl: runtime.IT_INVENTORY_COLLECTOR_RELEASES_URL || "./collector-releases.json",
    staleDays: finiteNumber(runtime.IT_INVENTORY_STALE_DAYS, 30),
    weatherLatitude: finiteNumber(runtime.IT_INVENTORY_WEATHER_LATITUDE, 48.8932),
    weatherLongitude: finiteNumber(runtime.IT_INVENTORY_WEATHER_LONGITUDE, 2.2879),
    weatherLocationLabel: runtime.IT_INVENTORY_WEATHER_LOCATION || "Levallois-Perret",
  });
}
