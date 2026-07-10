import { describe, expect, it } from "vitest";

import {
  assignmentPeriodsFromLegacyHistory,
  cleanImportedText,
  groupHistoryEvents,
  historyGroupLabel,
  mergeSameUserAssignmentPeriods,
} from "../../frontend/src/features/history/history-model";

describe("history model", () => {
  it("repairs known imported encoding artifacts", () => {
    expect(cleanImportedText("JÃ©rÃ´me Â· Paris")).toBe("Jérôme · Paris");
  });

  it("groups collector changes from the same minute and keeps admin notes separate", () => {
    const events = [
      {
        id: "1",
        event_type: "HARDWARE_CHANGED",
        field_name: "ram_total_gb",
        changed_at: "2026-07-10T12:00:05Z",
        changed_by: "collector",
        source: "COLLECTOR",
      },
      {
        id: "2",
        event_type: "OS_CHANGED",
        field_name: "os_name",
        changed_at: "2026-07-10T12:00:45Z",
        changed_by: "collector",
        source: "COLLECTOR",
      },
      {
        id: "3",
        event_type: "MANUAL_EDIT",
        changed_at: "2026-07-10T12:00:50Z",
        changed_by: "admin",
        source: "manual-note",
      },
    ];

    const groups = groupHistoryEvents(events);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.events).toHaveLength(2);
    expect(historyGroupLabel(groups[0]?.events || [])).toBe("COLLECTOR_UPDATE");
    expect(historyGroupLabel(groups[1]?.events || [])).toBe("MANUAL_EDIT");
  });

  it("merges adjacent periods for the same user instead of creating duplicate cards", () => {
    const periods = mergeSameUserAssignmentPeriods([
      {
        user_email: "arthur@spacefoot.com",
        user_name: "Arthur Pavillard",
        started_at: "2026-01-01T00:00:00Z",
        ended_at: "2026-06-01T00:00:00Z",
      },
      {
        user_email: "arthur@spacefoot.com",
        user_name: "Arthur Pavillard",
        started_at: "2026-06-01T00:00:00Z",
        ended_at: null,
      },
    ]);

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ started_at: "2026-01-01T00:00:00Z", ended_at: null });
  });

  it("closes the final imported assignment when the device moves to stock", () => {
    const history = [
      {
        id: "legacy",
        field_name: "legacy_google_sheets_history",
        event_type: "IMPORT_UPDATE",
        changed_at: "2025-12-01T10:00:00Z",
        changed_by: "codex",
        new_value: JSON.stringify({ firstName: "Alice", lastName: "Martin", team: "Sales", establishment: "Paris" }),
      },
      {
        id: "stock",
        field_name: "status",
        event_type: "STATUS_CHANGED",
        changed_at: "2026-07-01T10:00:00Z",
        changed_by: "admin",
        new_value: "stock",
      },
    ];

    const periods = assignmentPeriodsFromLegacyHistory(history, [], "Imported history");

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      user_name: "Alice Martin",
      ended_at: "2026-07-01T10:00:00Z",
      unassigned_by: "admin",
    });
  });
});
