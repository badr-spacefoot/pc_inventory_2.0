export interface NotificationRecord {
  id: string;
  is_read?: boolean;
  created_at?: string | null;
}

export interface NotificationSnapshot<T extends NotificationRecord> {
  unreadCount: number;
  latestUnread: T[];
}

function notificationTimestamp(notification: NotificationRecord): number {
  const timestamp = new Date(notification.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function notificationSnapshot<T extends NotificationRecord>(
  notifications: readonly T[],
  limit = 5,
): NotificationSnapshot<T> {
  const unread = notifications.filter((notification) => !notification.is_read);
  return {
    unreadCount: unread.length,
    latestUnread: [...unread]
      .sort((left, right) => notificationTimestamp(right) - notificationTimestamp(left))
      .slice(0, Math.max(0, limit)),
  };
}

export function markNotificationRead<T extends NotificationRecord>(notifications: readonly T[], id: string): T[] {
  return notifications.map((notification) =>
    notification.id === id ? { ...notification, is_read: true } : { ...notification },
  );
}
