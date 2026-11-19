const parisMonthFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "numeric",
});

const countedSources = new Set(["COLLECTOR", "MANUAL_ADMIN"]);

export interface AssignmentPeriod {
  id: string;
  device_id: string;
  user_id: string | null;
  started_at: string;
  created_at: string;
  source: string;
}

function parisMonth(date: number) {
  const parts = parisMonthFormat.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function assignmentActivity(
  periods: readonly AssignmentPeriod[],
  now: Date,
) {
  const { year: currentYear, month: currentMonth } = parisMonth(now.getTime());
  const byYear = new Map<number, {
    year: number;
    estimatedResets: number;
    firstSetups: number;
    devices: Set<string>;
    months: { month: number; estimatedResets: number; firstSetups: number }[];
  }>();
  const previousUsers = new Map<string, string>();
  const timeline = periods
    .map((period) => ({
      period,
      started: Date.parse(period.started_at),
      created: Date.parse(period.created_at),
    }))
    .filter(({ started }) =>
      Number.isFinite(started) && started <= now.getTime()
    )
    .sort((a, b) =>
      a.started - b.started ||
      a.period.started_at.localeCompare(b.period.started_at) ||
      a.created - b.created ||
      a.period.created_at.localeCompare(b.period.created_at) ||
      a.period.id.localeCompare(b.period.id)
    );

  for (const { period, started } of timeline) {
    const { device_id, user_id, source } = period;
    if (!user_id) continue;
    const previousUser = previousUsers.get(device_id);
    previousUsers.set(device_id, user_id);
    if (!countedSources.has(source) || user_id === previousUser) continue;

    const { year, month } = parisMonth(started);
    let summary = byYear.get(year);
    if (!summary) {
      summary = {
        year,
        estimatedResets: 0,
        firstSetups: 0,
        devices: new Set(),
        months: Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          estimatedResets: 0,
          firstSetups: 0,
        })),
      };
      byYear.set(year, summary);
    }
    const category = previousUser ? "estimatedResets" : "firstSetups";
    summary[category]++;
    summary.months[month - 1]![category]++;
    summary.devices.add(device_id);
  }

  return {
    currentYear,
    currentMonth,
    years: [...byYear.values()].map(({ devices, ...summary }) => ({
      ...summary,
      distinctDevices: devices.size,
    })),
  };
}
