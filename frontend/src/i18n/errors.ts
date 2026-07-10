export type SupportedLanguage = "fr" | "en";

const TIMEOUT_PATTERNS = [/^request timed out\.?$/i, /^the operation (?:was )?aborted due to timeout\.?$/i];

export function localizeErrorMessage(error: unknown, language: SupportedLanguage): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim();

  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return language === "fr" ? "La requête a dépassé le délai autorisé." : "Request timed out.";
  }

  return normalized;
}
