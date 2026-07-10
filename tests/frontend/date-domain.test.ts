import { describe, expect, it } from "vitest";

import { addMonthsToDateOnly, formatDateForInput, normalizeDateInputValue } from "../../frontend/src/domain/dates";

describe("date-only utilities", () => {
  it("accepts French display dates and emits ISO dates", () => {
    expect(normalizeDateInputValue("07/07/2026", "invalid")).toBe("2026-07-07");
    expect(formatDateForInput("2026-07-07")).toBe("07/07/2026");
  });

  it("clamps month-end warranty dates", () => {
    expect(addMonthsToDateOnly("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => normalizeDateInputValue("31/02/2026", "invalid")).toThrow("invalid");
  });
});
