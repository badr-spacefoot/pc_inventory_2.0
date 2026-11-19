import { describe, expect, it } from "vitest";
import {
  assignmentActivity,
  assignmentPeriodsForMonth,
  parseAssignmentActivityFilter,
  type AssignmentPeriod,
} from "../../supabase/functions/inventory-api/domain/assignment-activity.ts";

function period(id: string, device: string, user: string, started: string, source = "COLLECTOR"): AssignmentPeriod {
  return { id, device_id: device, user_id: user, source, started_at: started, created_at: started };
}

describe("assignment activity", () => {
  it("uses backfilled holders as history and counts real changes and first assignments in Paris time", () => {
    const periods = [
      period("1", "older-device", "first", "2025-09-01T12:00:00Z", "SYSTEM"),
      period("2", "older-device", "second", "2025-12-31T23:20:00Z", "MANUAL_ADMIN"),
      period("3", "older-device", "second", "2026-01-15T11:00:00Z"),
      period("4", "new-device", "first", "2026-02-01T09:00:00Z"),
      period("5", "new-device", "second", "2026-02-16T09:00:00Z"),
      period("6", "new-device", "third", "2026-02-22T09:00:00Z"),
      period("7", "other-device", "first", "2025-11-01T09:00:00Z"),
      period("8", "future-device", "first", "2026-05-01T09:00:00Z"),
    ];
    const result = assignmentActivity(periods.reverse(), new Date("2026-03-01T09:00:00Z"));
    expect(result.currentYear).toBe(2026);
    expect(result.currentMonth).toBe(3);
    expect(result.years.map(({ year }) => year)).toEqual([2025, 2026]);
    const lastYear = result.years[0]!;
    const thisYear = result.years[1]!;
    expect(lastYear).toMatchObject({ estimatedResets: 0, firstSetups: 1, distinctDevices: 1 });
    expect(thisYear).toMatchObject({ estimatedResets: 3, firstSetups: 1, distinctDevices: 2 });
    expect(thisYear.months.slice(0, 3)).toEqual([
      { month: 1, estimatedResets: 1, firstSetups: 0 },
      { month: 2, estimatedResets: 2, firstSetups: 1 },
      { month: 3, estimatedResets: 0, firstSetups: 0 },
    ]);
  });

  it("retains the current date even when there is no eligible history", () => {
    expect(assignmentActivity([], new Date("2026-12-31T23:00:00Z"))).toEqual({
      currentYear: 2027,
      currentMonth: 1,
      years: [],
    });
  });

  it("returns the exact assignments behind a bar, most recent first", () => {
    const now = new Date("2026-03-01T09:00:00Z");
    const periods = [
      period("1", "backfilled", "a", "2025-09-01T12:00:00Z", "SYSTEM"),
      period("2", "backfilled", "b", "2026-01-31T23:20:00Z"),
      period("3", "backfilled", "b", "2026-02-14T09:00:00Z", "MANUAL_ADMIN"),
      period("4", "new", "a", "2026-02-12T09:00:00Z"),
      period("5", "backfilled", "c", "2026-02-28T21:58:00Z"),
      period("6", "backfilled", "a", "2026-02-28T23:45:00Z", "MANUAL_ADMIN"),
    ];
    const resets = assignmentPeriodsForMonth(periods, now, { year: 2026, month: 2, category: "resets" });
    const setups = assignmentPeriodsForMonth(periods, now, { year: 2026, month: 2, category: "setups" });
    expect(resets.map((event) => event.id)).toEqual(["5", "2"]);
    expect(setups.map((event) => event.id)).toEqual(["4"]);
    expect(assignmentActivity(periods, now).years[0]!.months[1]).toEqual({
      month: 2,
      estimatedResets: resets.length,
      firstSetups: setups.length,
    });
  });

  it("rejects incomplete or invalid detail filters", () => {
    for (const query of [
      "",
      "year=2026&month=0&category=resets",
      "year=2026&month=13&category=resets",
      "year=2026&month=11&category=all",
      "year=2026e0&month=11&category=setups",
    ]) {
      expect(parseAssignmentActivityFilter(new URLSearchParams(query))).toBeNull();
    }
    expect(parseAssignmentActivityFilter(new URLSearchParams("year=2026&month=11&category=setups"))).toEqual({
      year: 2026,
      month: 11,
      category: "setups",
    });
  });
});
