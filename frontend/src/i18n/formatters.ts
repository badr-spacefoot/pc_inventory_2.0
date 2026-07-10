import type { DeviceAssignmentBreakdown } from "../features/organization/statistics";

export type SupportedLanguage = "fr" | "en";

function numberFormatter(language: SupportedLanguage, maximumFractionDigits = 0): Intl.NumberFormat {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits });
}

function countLabel(count: number, singular: string, plural: string, language: SupportedLanguage): string {
  return `${numberFormatter(language).format(count)} ${count === 1 ? singular : plural}`;
}

export function formatAgeYears(age: number | null, language: SupportedLanguage): string {
  if (age === null || !Number.isFinite(age)) return "-";
  const value = numberFormatter(language, 1).format(age);
  if (language === "fr") return `${value} ${age === 1 ? "an" : "ans"}`;
  return `${value} ${age === 1 ? "year" : "years"}`;
}

export function formatAgePopulation(count: number, language: SupportedLanguage): string {
  if (language === "fr") {
    return `${countLabel(count, "poste", "postes", language)} avec des données d’âge disponibles`;
  }
  return `${countLabel(count, "device", "devices", language)} with usable age data`;
}

export function formatDeviceAssignmentBreakdown(
  breakdown: DeviceAssignmentBreakdown,
  language: SupportedLanguage,
): string {
  if (language === "fr") {
    return `${countLabel(breakdown.total, "poste", "postes", language)} : ${countLabel(
      breakdown.assigned,
      "attribué",
      "attribués",
      language,
    )}, ${numberFormatter(language).format(breakdown.stock)} en stock, ${countLabel(
      breakdown.unassigned,
      "non attribué",
      "non attribués",
      language,
    )}`;
  }
  return `${countLabel(breakdown.total, "device", "devices", language)}: ${countLabel(
    breakdown.assigned,
    "assigned",
    "assigned",
    language,
  )}, ${numberFormatter(language).format(breakdown.stock)} in stock, ${countLabel(
    breakdown.unassigned,
    "unassigned",
    "unassigned",
    language,
  )}`;
}

export function formatCurrentlyAssignedUsers(count: number, language: SupportedLanguage): string {
  if (language === "fr") {
    return `${countLabel(count, "utilisateur", "utilisateurs", language)} actuellement attribué${count === 1 ? "" : "s"}`;
  }
  return countLabel(count, "currently assigned user", "currently assigned users", language);
}
