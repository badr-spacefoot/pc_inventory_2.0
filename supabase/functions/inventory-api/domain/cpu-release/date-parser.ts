import type { ReleasePeriod } from "./types.ts";

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function fullYear(value: string): number {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

export function parseReleasePeriod(
  rawValue: string,
  locale: "en-US" | "en-GB" = "en-US",
): ReleasePeriod {
  const raw = String(rawValue || "").trim();
  const value = raw.replace(/[’]/g, "'").replace(/\s+/g, " ");
  const unknown: ReleasePeriod = {
    periodStart: null,
    periodEnd: null,
    precision: "unknown",
    displayValue: raw || "Unknown",
    rawValue: raw,
  };
  if (!value) return unknown;

  const quarter = value.match(/^Q([1-4])\s*[' ]?\s*(\d{2}|\d{4})$/i);
  if (quarter?.[1] && quarter[2]) {
    const quarterNumber = Number(quarter[1]);
    const year = fullYear(quarter[2]);
    const startMonth = (quarterNumber - 1) * 3 + 1;
    return {
      periodStart: isoDate(year, startMonth, 1),
      periodEnd: isoDate(
        year,
        startMonth + 2,
        lastDayOfMonth(year, startMonth + 2),
      ),
      precision: "quarter",
      displayValue: `Q${quarterNumber} ${year}`,
      rawValue: raw,
    };
  }

  const half = value.match(/^(?:mid|mi)[- ]?(\d{4})$/i);
  if (half?.[1]) {
    const year = Number(half[1]);
    return {
      periodStart: isoDate(year, 4, 1),
      periodEnd: isoDate(year, 9, 30),
      precision: "half_year",
      displayValue: `Mid-${year}`,
      rawValue: raw,
    };
  }

  const numeric = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric?.[1] && numeric[2] && numeric[3]) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    const month = locale === "en-US" ? first : second;
    const day = locale === "en-US" ? second : first;
    const date = isoDate(year, month, day);
    return date
      ? {
        periodStart: date,
        periodEnd: date,
        precision: "day",
        displayValue: date,
        rawValue: raw,
      }
      : unknown;
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso?.[1] && iso[2] && iso[3]) {
    const date = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date
      ? {
        periodStart: date,
        periodEnd: date,
        precision: "day",
        displayValue: date,
        rawValue: raw,
      }
      : unknown;
  }

  const monthNames: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  const written = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (written?.[1] && written[2] && written[3]) {
    const month = monthNames[written[1].toLowerCase()];
    const date = month
      ? isoDate(Number(written[3]), month, Number(written[2]))
      : null;
    return date
      ? {
        periodStart: date,
        periodEnd: date,
        precision: "day",
        displayValue: date,
        rawValue: raw,
      }
      : unknown;
  }

  const monthYear = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear?.[1] && monthYear[2]) {
    const month = monthNames[monthYear[1].toLowerCase()];
    const year = Number(monthYear[2]);
    if (month) {
      return {
        periodStart: isoDate(year, month, 1),
        periodEnd: isoDate(year, month, lastDayOfMonth(year, month)),
        precision: "month",
        displayValue: `${monthYear[1]} ${year}`,
        rawValue: raw,
      };
    }
  }

  const yearOnly = value.match(/^(19|20)\d{2}$/)?.[0];
  if (yearOnly) {
    const year = Number(yearOnly);
    return {
      periodStart: isoDate(year, 1, 1),
      periodEnd: isoDate(year, 12, 31),
      precision: "year",
      displayValue: String(year),
      rawValue: raw,
    };
  }
  return unknown;
}

export function releaseYear(period: ReleasePeriod): number | null {
  return period.periodStart ? Number(period.periodStart.slice(0, 4)) : null;
}

export function preferEffectivePeriod(
  availability: ReleasePeriod | null,
  launch: ReleasePeriod | null,
  announcement: ReleasePeriod | null,
): {
  period: ReleasePeriod;
  eventType:
    | "first_product_availability"
    | "launch"
    | "announcement"
    | "unknown";
} {
  if (availability?.periodStart) {
    return { period: availability, eventType: "first_product_availability" };
  }
  if (launch?.periodStart) return { period: launch, eventType: "launch" };
  if (announcement?.periodStart) {
    return { period: announcement, eventType: "announcement" };
  }
  return {
    period: parseReleasePeriod(""),
    eventType: "unknown",
  };
}
