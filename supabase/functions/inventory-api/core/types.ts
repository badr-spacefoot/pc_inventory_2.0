export type Json = Record<string, unknown>;

export type DeviceHistoryRow = {
  device_id: string;
  event_type: string;
  field_name?: string;
  old_value?: string | null;
  new_value?: string | null;
  changed_by: string;
  source: string;
  notes?: string;
  changed_at: string;
  related_user_id?: string | null;
  related_team_id?: string | null;
  related_establishment_id?: string | null;
};

export type Role =
  | "ADMIN"
  | "MANAGER"
  | "VIEWER"
  | "READ_ONLY"
  | "COLLECTOR_USER";

export type Action =
  | "DEVICE_VIEW"
  | "DEVICE_EDIT"
  | "DEVICE_DELETE"
  | "TEAM_MANAGE"
  | "LOCATION_MANAGE"
  | "TOKEN_MANAGE"
  | "USER_MANAGE"
  | "PENDING_CHANGE_APPROVE"
  | "EXPORT_DATA"
  | "VIEW_HISTORY"
  | "VIEW_DASHBOARD"
  | "NOTIFICATION_VIEW"
  | "NOTIFICATION_MANAGE";

export type AdminSession = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  legacy?: boolean;
};
