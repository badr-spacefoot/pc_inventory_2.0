export interface OrganizationDevice {
  assigned_user_id?: string | null;
  email?: string | null;
  establishment_id?: string | null;
  establishment_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  status?: string | null;
}

export interface DeviceAssignmentBreakdown {
  total: number;
  assigned: number;
  stock: number;
  unassigned: number;
  userCount: number;
}

const EXCLUDED_CURRENT_STATUSES = new Set(["retired", "lost"]);

function assignedUserKey(device: OrganizationDevice): string {
  const id = String(device.assigned_user_id || "").trim();
  if (id) return id;
  const email = String(device.email || "")
    .trim()
    .toLocaleLowerCase();
  if (email) return `email:${email}`;
  const name = [device.first_name, device.last_name]
    .map((value) =>
      String(value || "")
        .trim()
        .toLocaleLowerCase(),
    )
    .filter(Boolean)
    .join(" ");
  return name ? `name:${name}` : "";
}

export function isCurrentOrganizationDevice(device: OrganizationDevice): boolean {
  return !EXCLUDED_CURRENT_STATUSES.has(String(device.status || ""));
}

export function organizationDeviceBreakdown(
  devices: readonly OrganizationDevice[],
  field: "establishment_id" | "team_id",
  organizationId: string,
  organizationName = "",
): DeviceAssignmentBreakdown {
  const nameField = field === "team_id" ? "team_name" : "establishment_name";
  const normalizedName = organizationName.trim().toLocaleLowerCase();
  const relevant = devices.filter(
    (device) =>
      isCurrentOrganizationDevice(device) &&
      (String(device[field] || "") === organizationId ||
        (normalizedName !== "" &&
          String(device[nameField] || "")
            .trim()
            .toLocaleLowerCase() === normalizedName)),
  );
  const stock = relevant.filter((device) => device.status === "stock").length;
  const assignedDevices = relevant.filter((device) => device.status !== "stock" && Boolean(assignedUserKey(device)));
  const assignedUsers = new Set(assignedDevices.map(assignedUserKey).filter(Boolean));
  return {
    total: relevant.length,
    assigned: assignedDevices.length,
    stock,
    unassigned: Math.max(0, relevant.length - assignedDevices.length - stock),
    userCount: assignedUsers.size,
  };
}

export function currentDevicesByLocation<T extends OrganizationDevice>(devices: readonly T[]): T[] {
  return devices.filter(isCurrentOrganizationDevice);
}
