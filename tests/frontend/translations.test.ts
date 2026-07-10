import { describe, expect, it } from "vitest";

import appSource from "../../frontend/app.js?raw";
import htmlSource from "../../frontend/index.html?raw";
import translationsSource from "../../frontend/src/i18n/translations.ts?raw";
import {
  englishTranslations,
  frenchNotificationTranslations,
  normalizeTranslationKey,
} from "../../frontend/src/i18n/translations";

describe("translation dictionaries", () => {
  it("keeps every French notification key available in English", () => {
    for (const key of Object.keys(frenchNotificationTranslations)) {
      expect(englishTranslations[key as keyof typeof englishTranslations]).toBeTruthy();
    }
  });

  it("does not contain empty translation values", () => {
    expect(Object.values(englishTranslations).every(Boolean)).toBe(true);
    expect(Object.values(frenchNotificationTranslations).every(Boolean)).toBe(true);
  });

  it("normalizes multiline and repeated whitespace before dictionary lookup", () => {
    expect(
      normalizeTranslationKey("  Met à jour les références processeur,\n    puis actualise les indicateurs. "),
    ).toBe("Met à jour les références processeur, puis actualise les indicateurs.");
  });

  it("contains an English translation for every literal translation or toast call", () => {
    const keys = [...appSource.matchAll(/(?:translate|toast)\(\s*(["'])(.*?)\1(?:\s*,[^)]*)?\s*\)/g)].map(
      (match) => match[2] || "",
    );
    const translations: Record<string, string> = englishTranslations;
    const missing = [...new Set(keys.filter((key) => key && !translations[key]))].sort();
    expect(missing).toEqual([]);
  });

  it("contains translations for static labels rendered by JavaScript templates", () => {
    const labels = [...appSource.matchAll(/<[a-z][^>]*>\s*([^<>{}\n]+?)\s*<\/[a-z][^>]*>/gi)]
      .map((match) => (match[1] || "").replace(/\s+/g, " ").trim())
      .filter((label) => label && !label.includes("${"));
    const translations: Record<string, string> = englishTranslations;
    const languageNeutral = new Set([
      "Admin",
      "CPU",
      "GPU",
      "OS",
      "IP",
      "RAM",
      "CSV",
      "Windows",
      "macOS",
      "Linux",
      "Ubuntu",
      "EUR",
      "INFO",
      "SUCCESS",
      "WARNING",
      "ERROR",
      "Hostname",
      "Email",
      "Role",
      "Note",
      "Latitude",
      "Longitude",
      "system",
      "&#8593;",
      "&#8595;",
      "&#8942;&#8942;",
      "&rsaquo;",
      "/100",
    ]);
    const missing = [...new Set(labels.filter((label) => !languageNeutral.has(label) && !translations[label]))].sort();
    expect(missing).toEqual([]);
  });

  it("contains translations for literal labels passed to translated Fleet components", () => {
    const keys = [...appSource.matchAll(/renderFleetStatList\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)].flatMap((match) => [
      match[1] || "",
      match[2] || "",
    ]);
    const translations: Record<string, string> = englishTranslations;
    const missing = [...new Set(keys.filter((key) => key && !translations[key]))].sort();
    expect(missing).toEqual([]);
  });

  it("contains an English translation for every translatable static HTML label", () => {
    const withoutScripts = htmlSource.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    const textLabels = [...withoutScripts.matchAll(/>([^<>]+)</g)].map((match) => match[1] || "");
    const attributeLabels = [...withoutScripts.matchAll(/\b(?:placeholder|title|aria-label)="([^"]+)"/g)].map(
      (match) => match[1] || "",
    );
    const labels = [...textLabels, ...attributeLabels]
      .map((label) =>
        label
          .replace(/&amp;/g, "&")
          .replace(/&ccedil;/g, "ç")
          .replace(/&#x[0-9a-f]+;/gi, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((label) => label && !/^(?:--(?::--)?|\*|\+|−|FR|EN)$/u.test(label));
    const translations: Record<string, string> = englishTranslations;
    const languageNeutral = new Set([
      "Admin",
      "CPU",
      "GPU",
      "OS",
      "IP",
      "RAM",
      "CSV",
      "Windows",
      "macOS",
      "Linux",
      "Ubuntu",
      "INFO",
      "SUCCESS",
      "WARNING",
      "ERROR",
      "EUR",
      "Spacefoot",
      "Collector",
      "Dashboard",
      "Latitude",
      "Longitude",
      "Lifestyle",
      "Running",
      "Football",
      "Golf",
      "0",
      "0 / 6",
      "2.3522",
      "48.8566",
      "ADMIN",
      "MANAGER",
      "VIEWER",
      "READ_ONLY",
      "admin",
      "English",
      "Français",
      "France",
      "Hostname",
      "Email",
      "Role",
      "Note",
      "Spacefoot IT Inventory",
      "SAV, RH, IT...",
      "ML, FS, BDG...",
    ]);
    const missing = [...new Set(labels.filter((label) => !languageNeutral.has(label) && !translations[label]))].sort();
    expect(missing).toEqual([]);
  });

  it("keeps required product terminology complete in both languages", () => {
    const required = {
      "À surveiller": "Monitor",
      "Par équipe": "By team",
      "Postes à remplacer en priorité": "High-priority replacement devices",
      "Par établissement": "By location",
      "Par système d’exploitation": "By operating system",
      "Postes disposant de données sur le processeur et l’âge": "Devices with usable CPU and age data",
      "Aucun poste sélectionné": "No device selected",
      "Étiquette du service": "Service tag",
      "Mettre à jour": "Update",
      "Année du modèle": "Model year",
      "Prix d’achat réel": "Actual purchase price",
      "Observations du marché": "Market observations",
      "Numéro de série": "Serial number",
      "Génération du processeur": "CPU generation",
      "Fabricant / Modèle": "Manufacturer / model",
      "Enrichir et recalculer le parc": "Enrich and recalculate fleet",
      Notifications: "Notifications",
      "Non lue": "Unread",
      "Marquer comme lue": "Mark as read",
      "Voir toutes les notifications": "View all notifications",
      "Aucune nouvelle notification": "No new notifications",
      "Récent / à surveiller / ancien": "Recent / monitor / old",
      "Principaux établissements": "Top locations",
      "Score d’âge": "Age score",
      Lien: "Link",
      "prénom.nom@spacefoot.com": "firstname.lastname@spacefoot.com",
      Occasion: "Used",
      Neuf: "New",
      "Pour pièces détachées/ne fonctionne pas": "For parts or not working",
      "État correct": "Acceptable",
      "Très bon état": "Very good",
      Reconditionné: "Refurbished",
    } as const;
    for (const [french, english] of Object.entries(required)) {
      expect(englishTranslations[french as keyof typeof englishTranslations]).toBe(english);
    }
  });

  it("does not expose mojibake or replacement characters in visible frontend sources", () => {
    const sources = [htmlSource, appSource, translationsSource];
    for (const source of sources) {
      expect(source).not.toMatch(/(?:Ã.|Â[ €£°]|â[€™œ“”]|�|s\?lection)/u);
    }
  });
});
