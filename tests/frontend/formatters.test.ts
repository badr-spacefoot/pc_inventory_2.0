import { describe, expect, it } from "vitest";

import {
  formatAgePopulation,
  formatAgeYears,
  formatCurrentlyAssignedUsers,
  formatDeviceAssignmentBreakdown,
} from "../../frontend/src/i18n/formatters";

describe("localized inventory formatters", () => {
  it("formats decimal ages and singular/plural forms in French", () => {
    expect(formatAgeYears(3.8, "fr")).toBe("3,8 ans");
    expect(formatAgeYears(1, "fr")).toBe("1 an");
    expect(formatAgePopulation(1, "fr")).toBe("1 poste avec des données d’âge disponibles");
    expect(formatAgePopulation(92, "fr")).toBe("92 postes avec des données d’âge disponibles");
  });

  it("formats decimal ages and singular/plural forms in English", () => {
    expect(formatAgeYears(3.8, "en")).toBe("3.8 years");
    expect(formatAgeYears(1, "en")).toBe("1 year");
    expect(formatAgePopulation(1, "en")).toBe("1 device with usable age data");
    expect(formatAgePopulation(92, "en")).toBe("92 devices with usable age data");
  });

  it("renders assignment breakdowns without inferring stock from a missing user", () => {
    const breakdown = { total: 12, assigned: 8, stock: 2, unassigned: 2, userCount: 7 };
    expect(formatDeviceAssignmentBreakdown(breakdown, "fr")).toBe(
      "12 postes : 8 attribués, 2 en stock, 2 non attribués",
    );
    expect(formatDeviceAssignmentBreakdown(breakdown, "en")).toBe("12 devices: 8 assigned, 2 in stock, 2 unassigned");
    expect(formatCurrentlyAssignedUsers(1, "fr")).toBe("1 utilisateur actuellement attribué");
    expect(formatCurrentlyAssignedUsers(0, "fr")).toBe("0 utilisateurs actuellement attribués");
    expect(formatCurrentlyAssignedUsers(2, "en")).toBe("2 currently assigned users");
  });
});
