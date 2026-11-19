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

export interface AssignmentActivityFilter {
  year: number;
  month: number;
  category: "resets" | "setups";
}

export function parseAssignmentActivityFilter(
  params: URLSearchParams,
): AssignmentActivityFilter | null {
  const year = params.get("year") ?? "";
  const month = params.get("month") ?? "";
  const category = params.get("category");
  if (!/^[1-9]\d{3}$/.test(year) || !/^(?:[1-9]|1[0-2])$/.test(month)) {
    return null;
  }
  if (category !== "resets" && category !== "setups") return null;
  return { year: Number(year), month: Number(month), category };
}

function parisMonth(date: number) {
  const parts = parisMonthFormat.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function* assignmentInterventions(
  periods: readonly AssignmentPeriod[],
  now: Date,
) {
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

    yield {
      ...parisMonth(started),
      period,
      category: previousUser ? "resets" as const : "setups" as const,
    };
  }
}

export function assignmentPeriodsForMonth(
  periods: readonly AssignmentPeriod[],
  now: Date,
  filter: AssignmentActivityFilter,
) {
  return Array.from(assignmentInterventions(periods, now))
    .filter(({ year, month, category }) =>
      year === filter.year && month === filter.month &&
      category === filter.category
    )
    .map(({ period }) => period)
    .reverse();
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
  for (
    const { year, month, period, category } of assignmentInterventions(
      periods,
      now,
    )
  ) {
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
    const metric = category === "resets" ? "estimatedResets" : "firstSetups";
    summary[metric]++;
    summary.months[month - 1]![metric]++;
    summary.devices.add(period.device_id);
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
