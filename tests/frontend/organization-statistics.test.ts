import { describe, expect, it } from "vitest";

import {
  currentDevicesByLocation,
  organizationDeviceBreakdown,
} from "../../frontend/src/features/organization/statistics";

describe("organization statistics", () => {
  const devices = [
    { establishment_id: "paris", assigned_user_id: "user-1", status: "active" },
    { establishment_id: "paris", assigned_user_id: "user-1", status: "active" },
    { establishment_id: "paris", assigned_user_id: "user-2", status: "active" },
    { establishment_id: "paris", assigned_user_id: null, status: "stock" },
    { establishment_id: "paris", assigned_user_id: null, status: "active" },
    { establishment_id: "paris", assigned_user_id: "former", status: "retired" },
    { establishment_id: "paris", assigned_user_id: null, status: "lost" },
  ];

  it("distinguishes assigned, stock, and unassigned current devices", () => {
    expect(organizationDeviceBreakdown(devices, "establishment_id", "paris")).toEqual({
      total: 5,
      assigned: 3,
      stock: 1,
      unassigned: 1,
      userCount: 2,
    });
  });

  it("keeps stock in current location totals and excludes retired or lost devices", () => {
    expect(currentDevicesByLocation(devices)).toHaveLength(5);
  });

  it("matches imported assignments by organization name when the id is missing", () => {
    const result = organizationDeviceBreakdown(
      [
        { team_name: "Catalogue", assigned_user_id: "user-1", status: "active" },
        { team_name: "catalogue", status: "stock" },
        { team_name: "Commerciale", assigned_user_id: "user-2", status: "active" },
      ],
      "team_id",
      "team-catalogue",
      "Catalogue",
    );

    expect(result).toEqual({ total: 2, assigned: 1, stock: 1, unassigned: 0, userCount: 1 });
  });

  it("uses a resolved user identity when the raw assignment id is missing", () => {
    const result = organizationDeviceBreakdown(
      [
        { establishment_name: "Paris", email: "user@spacefoot.com", status: "active" },
        { establishment_name: "Paris", email: "USER@spacefoot.com", status: "active" },
        { establishment_name: "Paris", first_name: "Noémie", last_name: "Martin", status: "active" },
        { establishment_name: "Paris", email: "stock@spacefoot.com", status: "stock" },
      ],
      "establishment_id",
      "paris-id",
      "Paris",
    );

    expect(result).toEqual({ total: 4, assigned: 3, stock: 1, unassigned: 0, userCount: 2 });
  });
});
