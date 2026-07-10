import { isDetachedInventoryStatus } from "../fleet/analytics";

export interface HistoryEvent {
  id?: string;
  event_type?: string;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  changed_at?: string;
  changed_by?: string;
  source?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface HistoryGroup {
  key: string;
  events: HistoryEvent[];
}

export interface AssignmentPeriod {
  user_id?: string | null;
  user_name?: string;
  user_email?: string;
  team_id?: string | null;
  team_name?: string;
  establishment_id?: string | null;
  establishment_name?: string;
  started_at?: string;
  ended_at?: string | null;
  assigned_by?: string;
  unassigned_by?: string;
  source?: string;
  reason?: string;
  [key: string]: unknown;
}

const COLLECTION_FIELDS = new Set([
  "hostname",
  "os_name",
  "os_version",
  "manufacturer",
  "model",
  "model_number",
  "service_tag",
  "serial_number",
  "cpu",
  "gpu",
  "ram_total_gb",
  "storage_total_gb",
  "storage_type",
  "windows_user",
]);
const ASSIGNMENT_FIELDS = new Set(["assigned_user_id", "team_id", "establishment_id", "owner_email", "status"]);
const COLLECTION_TYPES = new Set([
  "DEVICE_CREATED",
  "DEVICE_UPDATED",
  "DEVICE_RESET",
  "COLLECTOR_UPDATE",
  "IMPORT_UPDATE",
  "OS_CHANGED",
  "HARDWARE_CHANGED",
]);
const ASSIGNMENT_TYPES = new Set([
  "USER_ASSIGNED",
  "USER_REASSIGNED",
  "USER_REMOVED",
  "TEAM_CHANGED",
  "LOCATION_CHANGED",
  "STATUS_CHANGED",
  "DEVICE_RETIRED",
  "DEVICE_REACTIVATED",
]);
const IMPORTED_TEXT_REPLACEMENTS: Readonly<Record<string, string>> = {
  "�": "è",
  "ï¿½": "è",
  "Â·": "·",
  "Â ": " ",
  "Ã©": "é",
  "Ã¨": "è",
  Ãª: "ê",
  "Ã«": "ë",
  "Ã ": "à",
  "Ã¢": "â",
  "Ã§": "ç",
  "Ã®": "î",
  "Ã¯": "ï",
  "Ã´": "ô",
  "Ã¹": "ù",
  "Ã»": "û",
  "Ã‰": "É",
};

export function cleanImportedText(value: unknown): string {
  let text = String(value ?? "").trim();
  if (!text) return "";
  Object.entries(IMPORTED_TEXT_REPLACEMENTS).forEach(([bad, good]) => {
    text = text.replaceAll(bad, good);
  });
  return text;
}

export function parseHistoryJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(String(value));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function legacyAssignmentUser(data: Record<string, unknown> | null | undefined): string {
  return [data?.firstName, data?.lastName].map(cleanImportedText).filter(Boolean).join(" ");
}

function historyTimeBucket(value: unknown): number | string {
  const time = timestamp(value);
  return Number.isFinite(time) ? Math.floor(time / 60_000) : String(value || "");
}

function historyGroupFamily(event: HistoryEvent): string {
  if (event.field_name === "legacy_google_sheets_history" || event.event_type === "MANUAL_EDIT") {
    return `single:${event.id || event.changed_at || ""}`;
  }
  const source = String(event.source || "").toUpperCase();
  const type = String(event.event_type || "");
  const field = String(event.field_name || "");
  if (
    (source.includes("COLLECTOR") || source.includes("IMPORT")) &&
    (COLLECTION_TYPES.has(type) ||
      ASSIGNMENT_TYPES.has(type) ||
      COLLECTION_FIELDS.has(field) ||
      ASSIGNMENT_FIELDS.has(field))
  ) {
    return "collection";
  }
  if (ASSIGNMENT_TYPES.has(type) || ASSIGNMENT_FIELDS.has(field)) return "assignment";
  if (COLLECTION_TYPES.has(type) || COLLECTION_FIELDS.has(field)) return "hardware-system";
  if (type === "INVOICE_ADDED" || type === "INVOICE_DELETED" || field === "invoice") return "invoice";
  return `single:${event.id || `${type}:${field}:${event.changed_at}`}`;
}

function historyGroupKey(event: HistoryEvent): string {
  const family = historyGroupFamily(event);
  if (family.startsWith("single:")) return family;
  return [family, historyTimeBucket(event.changed_at), event.changed_by || "", event.source || ""].join("|");
}

export function groupHistoryEvents(history: readonly HistoryEvent[]): HistoryGroup[] {
  const groupedByKey = new Map<string, HistoryGroup>();
  history.forEach((event) => {
    const key = historyGroupKey(event);
    const existing = groupedByKey.get(key);
    if (existing) existing.events.push(event);
    else groupedByKey.set(key, { key, events: [event] });
  });
  return [...groupedByKey.values()];
}

export function historyGroupLabel(events: readonly HistoryEvent[]): string {
  const types = new Set(events.map((event) => event.event_type));
  if (events.some((event) => event.event_type === "MANUAL_EDIT")) return "MANUAL_EDIT";
  if (events.some((event) => ["DEVICE_RETIRED", "DEVICE_REACTIVATED"].includes(String(event.event_type)))) {
    return (
      events.find((event) => ["DEVICE_RETIRED", "DEVICE_REACTIVATED"].includes(String(event.event_type)))?.event_type ||
      "STATUS_CHANGED"
    );
  }
  if (
    events.some((event) =>
      [
        "USER_ASSIGNED",
        "USER_REASSIGNED",
        "USER_REMOVED",
        "TEAM_CHANGED",
        "LOCATION_CHANGED",
        "STATUS_CHANGED",
      ].includes(String(event.event_type)),
    )
  ) {
    return events.some((event) => event.event_type === "USER_REMOVED") ? "USER_REMOVED" : "USER_REASSIGNED";
  }
  if (
    events.some((event) =>
      ["HARDWARE_CHANGED", "OS_CHANGED", "DEVICE_RESET", "IMPORT_UPDATE", "DEVICE_UPDATED", "DEVICE_CREATED"].includes(
        String(event.event_type),
      ),
    )
  ) {
    return "COLLECTOR_UPDATE";
  }
  return types.size > 1 ? "GROUPED_UPDATE" : events[0]?.event_type || "";
}

function sameLegacyAssignment(left: AssignmentPeriod | undefined, right: AssignmentPeriod): boolean {
  return ["user_name", "team_name", "establishment_name"].every(
    (field) => cleanImportedText(left?.[field]).toLowerCase() === cleanImportedText(right[field]).toLowerCase(),
  );
}

function sameAssignmentPeriodUser(left: AssignmentPeriod, right: AssignmentPeriod): boolean {
  const leftId = cleanImportedText(left.user_id).toLowerCase();
  const rightId = cleanImportedText(right.user_id).toLowerCase();
  if (leftId && rightId && leftId === rightId) return true;
  const leftEmail = cleanImportedText(left.user_email).toLowerCase();
  const rightEmail = cleanImportedText(right.user_email).toLowerCase();
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;
  const leftName = cleanImportedText(left.user_name).toLowerCase();
  const rightName = cleanImportedText(right.user_name).toLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
}

function timestamp(value: unknown): number {
  const dateInput = typeof value === "string" ? value : Number(value || 0);
  return new Date(dateInput).getTime();
}

export function mergeSameUserAssignmentPeriods(periods: readonly AssignmentPeriod[]): AssignmentPeriod[] {
  const sorted = periods
    .filter(Boolean)
    .map((period) => ({ ...period }))
    .sort((left, right) => timestamp(left.started_at) - timestamp(right.started_at));
  const merged: AssignmentPeriod[] = [];
  sorted.forEach((period) => {
    const previous = merged.at(-1);
    if (previous && sameAssignmentPeriodUser(previous, period)) {
      const previousEnd = previous.ended_at ? timestamp(previous.ended_at) : Infinity;
      const periodEnd = period.ended_at ? timestamp(period.ended_at) : Infinity;
      previous.ended_at =
        previousEnd === Infinity || periodEnd === Infinity
          ? null
          : new Date(Math.max(previousEnd, periodEnd)).toISOString();
      previous.unassigned_by = previous.ended_at ? period.unassigned_by || previous.unassigned_by || "" : "";
      previous.team_id = period.team_id || previous.team_id || null;
      previous.team_name = period.team_name || previous.team_name || "";
      previous.establishment_id = period.establishment_id || previous.establishment_id || null;
      previous.establishment_name = period.establishment_name || previous.establishment_name || "";
      const source = period.source || previous.source;
      const reason = period.reason || previous.reason;
      if (source !== undefined) previous.source = source;
      if (reason !== undefined) previous.reason = reason;
      return;
    }
    merged.push(period);
  });
  return merged.sort((left, right) => timestamp(right.started_at) - timestamp(left.started_at));
}

function detachedStatusChangeEvent(history: readonly HistoryEvent[], afterTime: number): HistoryEvent | null {
  return (
    history
      .filter((event) => {
        if (event.field_name !== "status" || !event.changed_at) return false;
        return timestamp(event.changed_at) > afterTime && isDetachedInventoryStatus(cleanImportedText(event.new_value));
      })
      .slice()
      .sort((left, right) => timestamp(left.changed_at) - timestamp(right.changed_at))[0] || null
  );
}

function closedFallbackPeriodEndDate(periods: readonly AssignmentPeriod[], afterTime: number): string | null {
  return (
    periods
      .filter((period) => (period.ended_at ? timestamp(period.ended_at) : 0) > afterTime)
      .slice()
      .sort((left, right) => timestamp(left.ended_at) - timestamp(right.ended_at))[0]?.ended_at || null
  );
}

export function assignmentPeriodsFromLegacyHistory(
  history: readonly HistoryEvent[],
  fallbackPeriods: readonly AssignmentPeriod[],
  importedReason: string,
): AssignmentPeriod[] {
  const legacyEvents = history
    .filter(
      (event) =>
        event.field_name === "legacy_google_sheets_history" && Boolean(event.new_value) && Boolean(event.changed_at),
    )
    .map((event) => ({ event, data: parseHistoryJson(event.new_value) }))
    .filter(({ data }) => Boolean(legacyAssignmentUser(data)))
    .sort((left, right) => timestamp(left.event.changed_at) - timestamp(right.event.changed_at));

  if (legacyEvents.length === 0) return mergeSameUserAssignmentPeriods(fallbackPeriods);

  const periods: AssignmentPeriod[] = [];
  legacyEvents.forEach(({ event, data }) => {
    const period: AssignmentPeriod = {
      user_name: legacyAssignmentUser(data),
      user_email: "",
      team_name: cleanImportedText(data?.team),
      establishment_name: cleanImportedText(data?.establishment),
      started_at: String(event.changed_at || ""),
      ended_at: null,
      assigned_by: event.changed_by || "import",
      unassigned_by: "",
      source: "IMPORT",
      reason: importedReason,
    };
    const previous = periods.at(-1);
    if (sameLegacyAssignment(previous, period)) return;
    if (previous) {
      previous.ended_at = String(event.changed_at || "");
      previous.unassigned_by = event.changed_by || "import";
    }
    periods.push(period);
  });

  const lastLegacyDate = timestamp(periods.at(-1)?.started_at);
  const laterManualPeriods = fallbackPeriods
    .filter(
      (period) =>
        timestamp(period.started_at) > lastLegacyDate && String(period.source || "").toUpperCase() !== "SYSTEM",
    )
    .map((period) => ({ ...period }))
    .sort((left, right) => timestamp(right.started_at) - timestamp(left.started_at));

  const lastLegacyPeriod = periods.at(-1);
  if (laterManualPeriods.length > 0 && lastLegacyPeriod) {
    const firstManual = laterManualPeriods
      .slice()
      .sort((left, right) => timestamp(left.started_at) - timestamp(right.started_at))[0];
    if (firstManual) {
      lastLegacyPeriod.ended_at = firstManual.started_at || null;
      lastLegacyPeriod.unassigned_by = firstManual.assigned_by || "admin";
    }
  } else if (lastLegacyPeriod) {
    const detachEvent = detachedStatusChangeEvent(history, lastLegacyDate);
    const detachDate = detachEvent?.changed_at || closedFallbackPeriodEndDate(fallbackPeriods, lastLegacyDate);
    if (detachDate) {
      lastLegacyPeriod.ended_at = detachDate;
      lastLegacyPeriod.unassigned_by = detachEvent?.changed_by || "admin";
    }
  }

  return mergeSameUserAssignmentPeriods([...laterManualPeriods, ...periods.slice().reverse()]);
}
