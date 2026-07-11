export type InterfaceLanguage = "fr" | "en";

export interface CpuReleasePresentationInput {
  cpu_release_display?: string | number | null;
  cpu_release_year?: string | number | null;
  cpu_release_precision?: string | null;
  cpu_release_event_type?: string | null;
  cpu_release_vendor?: string | null;
  cpu_release_source_type?: string | null;
  cpu_release_match_scope?: string | null;
  cpu_release_is_official?: boolean | null;
}

const labels = {
  fr: {
    unknown: "Inconnue",
    official: "Officielle",
    estimated: "Estimée",
    unavailable: "date officielle indisponible",
    heuristic: "Heuristique",
    family: "Correspondance famille",
    day: "jour exact",
    month: "mois",
    quarter: "trimestre",
    half_year: "semestre",
    year: "année",
    announcement: "annonce",
    launch: "lancement",
    first_product_availability: "première disponibilité",
    expected_availability: "disponibilité prévue",
  },
  en: {
    unknown: "Unknown",
    official: "Official",
    estimated: "Estimated",
    unavailable: "official date unavailable",
    heuristic: "Heuristic",
    family: "Family-level match",
    day: "exact day",
    month: "month",
    quarter: "quarter",
    half_year: "half-year",
    year: "year",
    announcement: "announcement",
    launch: "launch",
    first_product_availability: "first availability",
    expected_availability: "expected availability",
  },
} as const;

function localizedReleaseValue(value: string, language: InterfaceLanguage): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }
  if (language === "fr") return value.replace(/^Q([1-4])\s/i, "T$1 ");
  return value;
}

export function cpuReleasePresentation(
  input: CpuReleasePresentationInput,
  language: InterfaceLanguage,
): { value: string; summary: string; approximate: boolean } {
  const dictionary = labels[language];
  const rawValue = String(input.cpu_release_display || input.cpu_release_year || "").trim();
  if (!rawValue) {
    return { value: dictionary.unknown, summary: dictionary.unknown, approximate: false };
  }
  const value = localizedReleaseValue(rawValue, language);
  const precision = String(input.cpu_release_precision || "");
  const approximate = ["month", "quarter", "half_year", "year"].includes(precision);
  if (!input.cpu_release_is_official) {
    return {
      value,
      summary: `${dictionary.estimated} ${value} · ${dictionary.heuristic} · ${dictionary.unavailable}`,
      approximate,
    };
  }
  const vendor = String(input.cpu_release_vendor || input.cpu_release_source_type || "")
    .replace(/-.*/, "")
    .replace(/^./, (character) => character.toUpperCase());
  const event = dictionary[input.cpu_release_event_type as keyof typeof dictionary] || "";
  const precisionLabel = dictionary[precision as keyof typeof dictionary] || "";
  const family = input.cpu_release_match_scope === "family" ? dictionary.family : "";
  return {
    value,
    summary: [value, vendor, dictionary.official, family, event, precisionLabel].filter(Boolean).join(" · "),
    approximate,
  };
}
