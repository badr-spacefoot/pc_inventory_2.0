import { describe, expect, it } from "vitest";

import { markNotificationRead, notificationSnapshot } from "../../frontend/src/features/notifications/model";

describe("notification model", () => {
  const notifications = [
    { id: "read", is_read: true, created_at: "2026-07-10T12:00:00Z" },
    { id: "older", is_read: false, created_at: "2026-07-09T12:00:00Z" },
    { id: "latest", is_read: false, created_at: "2026-07-10T13:00:00Z" },
  ];

  it("counts unread notifications and returns only the latest unread items", () => {
    expect(notificationSnapshot(notifications, 1)).toEqual({
      unreadCount: 2,
      latestUnread: [notifications[2]],
    });
  });

  it("updates the unread count after marking one notification as read", () => {
    const updated = markNotificationRead(notifications, "latest");
    expect(notificationSnapshot(updated).unreadCount).toBe(1);
    expect(updated.find((item) => item.id === "latest")?.is_read).toBe(true);
    expect(notifications.find((item) => item.id === "latest")?.is_read).toBe(false);
  });
});
