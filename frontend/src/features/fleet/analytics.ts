import {
  cpuScoreBucket,
  deviceAge,
  deviceStatusRank,
  estimatedValue,
  fleetAgeSummary,
  normalizeManufacturer,
  normalizeOsInfo,
  valueBucket,
  type ValuationDevice,
} from "../../domain/inventory";

export type FleetAgeSignal = "recent" | "aging" | "old";
export type FleetRiskReason = "status" | "stale" | "storage" | "os" | "cpu" | "age";
export type FleetSort = "last_seen" | "status" | "manufacturer" | "hostname";

export interface FleetDevice extends ValuationDevice {
  id?: string;
  hostname?: string;
  serial_number?: string;
  service_tag?: string;
  mac_address?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  team_name?: string;
  team_abbreviation?: string;
  establishment_name?: string;
  establishment_abbreviation?: string;
  manufacturer?: string;
  model?: string;
  os_name?: string;
  os_version?: string;
  status?: string;
  last_seen_at?: string;
  ram_total_gb?: number | string | null;
  storage_free_gb?: number | string | null;
  cpu_benchmark_score?: number | string | null;
  hardware_age_score?: number | string | null;
  replacement_priority?: number | string | null;
  obsolescence_index?: number | string | null;
}

export interface FleetFilters {
  search?: string;
  team?: string;
  establishment?: string;
  os?: string;
  model?: string;
  manufacturer?: string;
  status?: string;
  age?: FleetAgeSignal | "";
  cpuScore?: "low" | "medium" | "high" | "";
  value?: "low" | "medium" | "high" | "";
}

export interface FleetEvaluationContext {
  staleDays: number;
  nowMs?: number;
  currentYear?: number;
}

export interface FleetStatRow {
  label: string;
  value: number;
  percent: number;
}

export interface FleetHealthSnapshot {
  score: number;
  level: "ok" | "warning" | "critical";
  stale: number;
  lowStorage: number;
  windows10: number;
  lowCpu: number;
  replace: number;
  signal: Record<FleetAgeSignal, number>;
}

export interface FleetKpiSnapshot {
  total: number;
  actionable: number;
  active: number;
  replace: number;
  stale: number;
  lowStorage: number;
  windows10: number;
  value: number;
  averageAge: number | null;
  devicesWithAge: number;
  olderThanFour: number;
}

export interface ReplacementCandidate {
  device: FleetDevice;
  score: number;
  reasonCodes: FleetRiskReason[];
}

export interface FleetValuationSnapshot {
  total: number;
  average: number;
  replaceValue: number;
  byLocation: FleetStatRow[];
}

const DETACHED_STATUSES = new Set(["retired", "stock"]);
const NON_ACTIONABLE_STATUSES = new Set(["retired", "stock", "lost"]);
const DAY_MS = 86_400_000;

function normalizeText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function finiteNumber(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function evaluationYear(context: FleetEvaluationContext): number {
  return context.currentYear ?? new Date(context.nowMs ?? Date.now()).getFullYear();
}

export function isDetachedInventoryStatus(status: unknown): boolean {
  return DETACHED_STATUSES.has(String(status || ""));
}

export function activeTeamName(device: FleetDevice): string {
  return isDetachedInventoryStatus(device.status) ? "" : String(device.team_name || "");
}

export function normalizedDeviceOsFamily(device: FleetDevice): string {
  return normalizeOsInfo([device.os_name, device.os_version].filter(Boolean).join(" ")).osFamily;
}

export function getFleetSearchText(device: FleetDevice): string {
  return [
    device.hostname,
    device.serial_number,
    device.mac_address,
    device.first_name,
    device.last_name,
    device.email,
    activeTeamName(device),
    device.team_abbreviation,
    device.establishment_name,
    device.establishment_abbreviation,
    device.model,
    device.manufacturer,
    device.os_name,
    device.os_version,
  ]
    .map(normalizeText)
    .join(" ");
}

export function daysSince(value: unknown, nowMs = Date.now()): number {
  if (!value) return 9999;
  const timestamp = new Date(String(value)).getTime();
  if (!Number.isFinite(timestamp)) return 9999;
  return Math.floor((nowMs - timestamp) / DAY_MS);
}

export function deviceCpuScore(device: FleetDevice): number {
  return finiteNumber(device.cpu_benchmark_score || device.cpu_score);
}

export function isActionableDevice(device: FleetDevice): boolean {
  return !NON_ACTIONABLE_STATUSES.has(String(device.status || ""));
}

export function isLowStorageDevice(device: FleetDevice): boolean {
  const free = finiteNumber(device.storage_free_gb);
  return free > 0 && free < 30;
}

export function isStaleDevice(device: FleetDevice, context: FleetEvaluationContext): boolean {
  return isActionableDevice(device) && daysSince(device.last_seen_at, context.nowMs) > context.staleDays;
}

export function isWindows10Device(device: FleetDevice): boolean {
  return normalizedDeviceOsFamily(device) === "Windows 10";
}

export function ageSignalScore(device: FleetDevice, context: FleetEvaluationContext): number {
  let score = finiteNumber(device.hardware_age_score);
  const age = deviceAge(device, evaluationYear(context));
  const ram = finiteNumber(device.ram_total_gb);
  const cpuScore = deviceCpuScore(device);
  if (age !== null) {
    if (age >= 6) {
      if (ram > 0 && ram < 8) score = Math.max(score, 85);
      else if (ram > 0 && ram < 16) score = Math.max(score, 75);
      else if (cpuScore > 0 && cpuScore < 8000) score = Math.max(score, 75);
      else score = Math.max(score, 55);
    } else if (age >= 4) {
      if (ram > 0 && ram < 8) score = Math.max(score, 65);
      else if (ram > 0 && ram < 16) score = Math.max(score, 55);
      else score = Math.max(score, 35);
    }
  }
  return score;
}

export function isReplacementSignal(device: FleetDevice, context: FleetEvaluationContext): boolean {
  const priority = finiteNumber(device.replacement_priority || device.obsolescence_index);
  return (
    isActionableDevice(device) &&
    (device.status === "replace" || ageSignalScore(device, context) >= 75 || priority >= 70)
  );
}

export function ageBucket(device: FleetDevice, context: FleetEvaluationContext): FleetAgeSignal {
  if (isReplacementSignal(device, context)) return "old";
  const score = ageSignalScore(device, context);
  if (score >= 75) return "old";
  if (score >= 45) return "aging";
  return "recent";
}

export function activeFleetDevices(items: readonly FleetDevice[]): FleetDevice[] {
  return items.filter(isActionableDevice);
}

export function filterFleetDevices(
  devices: readonly FleetDevice[],
  filters: FleetFilters,
  sortBy: FleetSort,
  context: FleetEvaluationContext,
  locale: string,
): FleetDevice[] {
  const search = normalizeText(filters.search);
  return devices
    .filter((device) => {
      if (search && !getFleetSearchText(device).includes(search)) return false;
      if (filters.team && activeTeamName(device) !== filters.team) return false;
      if (filters.establishment && device.establishment_name !== filters.establishment) return false;
      if (filters.os && normalizedDeviceOsFamily(device) !== filters.os) return false;
      if (filters.model && device.model !== filters.model) return false;
      if (
        filters.manufacturer &&
        normalizeManufacturer(device.manufacturer, device.model).manufacturerName !== filters.manufacturer
      ) {
        return false;
      }
      if (filters.status && device.status !== filters.status) return false;
      if (filters.age) {
        if (isDetachedInventoryStatus(device.status) && !filters.status) return false;
        if (ageBucket(device, context) !== filters.age) return false;
      }
      if (filters.cpuScore && cpuScoreBucket(device) !== filters.cpuScore) return false;
      if (filters.value && valueBucket(device) !== filters.value) return false;
      return true;
    })
    .sort((left, right) => {
      const statusOrder = deviceStatusRank(left.status) - deviceStatusRank(right.status);
      if (statusOrder !== 0) return statusOrder;
      if (sortBy === "manufacturer") {
        return normalizeManufacturer(left.manufacturer, left.model).manufacturerName.localeCompare(
          normalizeManufacturer(right.manufacturer, right.model).manufacturerName,
          locale,
        );
      }
      if (sortBy === "hostname") {
        return String(left.hostname || "").localeCompare(String(right.hostname || ""), locale);
      }
      return new Date(right.last_seen_at || 0).getTime() - new Date(left.last_seen_at || 0).getTime();
    });
}

export function riskScoreForDevice(device: FleetDevice, context: FleetEvaluationContext): number {
  let score = 0;
  if (device.status === "replace") score += 40;
  if (isStaleDevice(device, context)) {
    score += Math.min(30, Math.round(daysSince(device.last_seen_at, context.nowMs) / 2));
  }
  if (isLowStorageDevice(device)) score += 18;
  if (isWindows10Device(device)) score += 14;
  const cpuScore = deviceCpuScore(device);
  if (cpuScore > 0 && cpuScore < 7000) score += 24;
  else if (cpuScore > 0 && cpuScore < 10_000) score += 10;
  const age = deviceAge(device, evaluationYear(context));
  if (age !== null && age >= 6) score += 20;
  else if (age !== null && age >= 4) score += 10;
  score = Math.max(score, Math.round(finiteNumber(device.replacement_priority || device.obsolescence_index)));
  return Math.min(100, score);
}

export function riskReasonCodes(device: FleetDevice, context: FleetEvaluationContext): FleetRiskReason[] {
  const reasons: FleetRiskReason[] = [];
  if (device.status === "replace") reasons.push("status");
  if (isStaleDevice(device, context)) reasons.push("stale");
  if (isLowStorageDevice(device)) reasons.push("storage");
  if (isWindows10Device(device)) reasons.push("os");
  const cpuScore = deviceCpuScore(device);
  if (cpuScore > 0 && cpuScore < 7000) reasons.push("cpu");
  const age = deviceAge(device, evaluationYear(context));
  if (age !== null && age >= 5) reasons.push("age");
  return reasons;
}

export function replacementCandidates(
  items: readonly FleetDevice[],
  context: FleetEvaluationContext,
  limit = 8,
): ReplacementCandidate[] {
  return activeFleetDevices(items)
    .map((device) => ({
      device,
      score: riskScoreForDevice(device, context),
      reasonCodes: riskReasonCodes(device, context),
    }))
    .filter((item) => item.score >= 35 || item.reasonCodes.length > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        daysSince(right.device.last_seen_at, context.nowMs) - daysSince(left.device.last_seen_at, context.nowMs),
    )
    .slice(0, limit);
}

function groupCounts<T>(
  items: readonly T[],
  getter: (item: T) => string,
  fallbackLabel: string,
): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getter(item).trim() || fallbackLabel;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function countStats<T>(
  items: readonly T[],
  getter: (item: T) => string,
  fallbackLabel: string,
  limit = 6,
): FleetStatRow[] {
  const total = Math.max(1, items.length);
  return Object.entries(groupCounts(items, getter, fallbackLabel))
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value, percent: (value / total) * 100 }));
}

export function averageStats<T>(
  items: readonly T[],
  groupGetter: (item: T) => string,
  valueGetter: (item: T) => unknown,
  fallbackLabel: string,
  limit = 6,
): FleetStatRow[] {
  const groups = new Map<string, { total: number; count: number }>();
  items.forEach((item) => {
    const value = finiteNumber(valueGetter(item));
    if (!value) return;
    const group = groupGetter(item).trim() || fallbackLabel;
    const current = groups.get(group) || { total: 0, count: 0 };
    current.total += value;
    current.count += 1;
    groups.set(group, current);
  });
  return [...groups.entries()]
    .map(([label, value]) => ({ label, value: Math.round((value.total / value.count) * 10) / 10, percent: 0 }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

export function sumStats<T>(
  items: readonly T[],
  groupGetter: (item: T) => string,
  valueGetter: (item: T) => unknown,
  fallbackLabel: string,
  limit = 6,
): FleetStatRow[] {
  const groups = new Map<string, number>();
  let total = 0;
  items.forEach((item) => {
    const value = finiteNumber(valueGetter(item));
    total += value;
    const group = groupGetter(item).trim() || fallbackLabel;
    groups.set(group, Math.round((groups.get(group) || 0) + value));
  });
  const safeTotal = Math.max(1, total);
  return [...groups.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value, percent: (value / safeTotal) * 100 }));
}

export function fleetKpiSnapshot(items: readonly FleetDevice[], context: FleetEvaluationContext): FleetKpiSnapshot {
  const actionableItems = activeFleetDevices(items);
  const ageSummary = fleetAgeSummary(items, evaluationYear(context));
  const value = actionableItems.reduce((sum, device) => sum + estimatedValue(device), 0);
  return {
    total: items.length,
    actionable: actionableItems.length,
    active: actionableItems.filter((device) => device.status === "active" || !device.status).length,
    replace: actionableItems.filter((device) => isReplacementSignal(device, context)).length,
    stale: actionableItems.filter((device) => isStaleDevice(device, context)).length,
    lowStorage: actionableItems.filter(isLowStorageDevice).length,
    windows10: actionableItems.filter(isWindows10Device).length,
    value,
    averageAge: ageSummary.averageAge,
    devicesWithAge: ageSummary.devicesWithAge,
    olderThanFour: ageSummary.olderThanFour,
  };
}

export function fleetHealthSnapshot(
  items: readonly FleetDevice[],
  context: FleetEvaluationContext,
): FleetHealthSnapshot {
  const actionableItems = activeFleetDevices(items);
  const total = Math.max(1, actionableItems.length);
  const stale = actionableItems.filter((device) => isStaleDevice(device, context)).length;
  const lowStorage = actionableItems.filter(isLowStorageDevice).length;
  const windows10 = actionableItems.filter(isWindows10Device).length;
  const lowCpu = actionableItems.filter((device) => {
    const score = deviceCpuScore(device);
    return score > 0 && score < 7000;
  }).length;
  const replace = actionableItems.filter((device) => isReplacementSignal(device, context)).length;
  const signalCounts = groupCounts(actionableItems, (device) => ageBucket(device, context), "recent");
  const penalty =
    (stale / total) * 22 +
    (lowStorage / total) * 16 +
    (windows10 / total) * 16 +
    (lowCpu / total) * 20 +
    (replace / total) * 26;
  const score = Math.max(0, Math.round(100 - penalty));
  return {
    score,
    level: score >= 78 ? "ok" : score >= 55 ? "warning" : "critical",
    stale,
    lowStorage,
    windows10,
    lowCpu,
    replace,
    signal: {
      recent: signalCounts.recent || 0,
      aging: signalCounts.aging || 0,
      old: signalCounts.old || 0,
    },
  };
}

export function fleetValuationSnapshot(
  items: readonly FleetDevice[],
  context: FleetEvaluationContext,
  fallbackLabel: string,
): FleetValuationSnapshot {
  const actionableItems = activeFleetDevices(items);
  const total = actionableItems.reduce((sum, device) => sum + estimatedValue(device), 0);
  const replaceItems = actionableItems.filter((device) => isReplacementSignal(device, context));
  return {
    total,
    average: actionableItems.length ? total / actionableItems.length : 0,
    replaceValue: replaceItems.reduce((sum, device) => sum + estimatedValue(device), 0),
    byLocation: sumStats(
      actionableItems,
      (device) => String(device.establishment_name || ""),
      estimatedValue,
      fallbackLabel,
      5,
    ),
  };
}
