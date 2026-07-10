import { describe, expect, it } from "vitest";

import { localizeErrorMessage } from "../../frontend/src/i18n/errors";

describe("localized API errors", () => {
  it("translates client timeouts into French", () => {
    expect(localizeErrorMessage("Request timed out", "fr")).toBe("La requête a dépassé le délai autorisé.");
  });

  it("keeps the English timeout message in English", () => {
    expect(localizeErrorMessage(new Error("Request timed out"), "en")).toBe("Request timed out.");
  });

  it("does not hide an unknown backend error", () => {
    expect(localizeErrorMessage("eBay quota exceeded", "fr")).toBe("eBay quota exceeded");
  });
});
