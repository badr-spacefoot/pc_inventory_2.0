import { safeString } from "./input.ts";
import type { Action, AdminSession, Role } from "./types.ts";

export const rolePermissions: Readonly<Record<Role, readonly Action[]>> = Object
  .freeze({
    ADMIN: [
      "DEVICE_VIEW",
      "DEVICE_EDIT",
      "DEVICE_DELETE",
      "TEAM_MANAGE",
      "LOCATION_MANAGE",
      "TOKEN_MANAGE",
      "USER_MANAGE",
      "PENDING_CHANGE_APPROVE",
      "EXPORT_DATA",
      "VIEW_HISTORY",
      "VIEW_DASHBOARD",
      "NOTIFICATION_VIEW",
      "NOTIFICATION_MANAGE",
    ],
    MANAGER: [
      "DEVICE_VIEW",
      "DEVICE_EDIT",
      "TEAM_MANAGE",
      "LOCATION_MANAGE",
      "EXPORT_DATA",
      "VIEW_HISTORY",
      "VIEW_DASHBOARD",
      "NOTIFICATION_VIEW",
      "PENDING_CHANGE_APPROVE",
    ],
    VIEWER: [
      "DEVICE_VIEW",
      "VIEW_HISTORY",
      "VIEW_DASHBOARD",
      "NOTIFICATION_VIEW",
    ],
    READ_ONLY: [
      "DEVICE_VIEW",
      "VIEW_HISTORY",
      "VIEW_DASHBOARD",
      "NOTIFICATION_VIEW",
    ],
    COLLECTOR_USER: [],
  });

export function normalizedRole(role: unknown): Role {
  const value = safeString(role, 40).toUpperCase();
  if (value === "READ_ONLY") return "READ_ONLY";
  if (["ADMIN", "MANAGER", "VIEWER", "COLLECTOR_USER"].includes(value)) {
    return value as Role;
  }
  return "VIEWER";
}

export function canPerformAction(
  user: AdminSession | null,
  action: Action,
): boolean {
  if (!user) return false;
  return rolePermissions[user.role]?.includes(action) ?? false;
}
