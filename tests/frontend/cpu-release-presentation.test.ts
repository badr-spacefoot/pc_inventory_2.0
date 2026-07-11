import { describe, expect, it } from "vitest";
import { cpuReleasePresentation } from "../../frontend/src/features/cpu-release/presentation";

describe("CPU release presentation", () => {
  it("formats an official Intel quarter in both languages without inventing a day", () => {
    const input = {
      cpu_release_display: "Q3 2020",
      cpu_release_precision: "quarter",
      cpu_release_event_type: "launch",
      cpu_release_vendor: "intel",
      cpu_release_match_scope: "exact_name",
      cpu_release_is_official: true,
    };
    expect(cpuReleasePresentation(input, "en")).toEqual({
      value: "Q3 2020",
      summary: "Q3 2020 · Intel · Official · launch · quarter",
      approximate: true,
    });
    expect(cpuReleasePresentation(input, "fr").summary).toBe("T3 2020 · Intel · Officielle · lancement · trimestre");
  });

  it("labels family inheritance and heuristic fallbacks honestly", () => {
    expect(
      cpuReleasePresentation(
        {
          cpu_release_display: "24 October 2023",
          cpu_release_precision: "day",
          cpu_release_event_type: "announcement",
          cpu_release_vendor: "qualcomm",
          cpu_release_match_scope: "family",
          cpu_release_is_official: true,
        },
        "en",
      ).summary,
    ).toContain("Family-level match");
    expect(
      cpuReleasePresentation(
        {
          cpu_release_year: 2024,
          cpu_release_precision: "year",
          cpu_release_is_official: false,
        },
        "fr",
      ).summary,
    ).toBe("Estimée 2024 · Heuristique · date officielle indisponible");
  });

  it("formats exact dates for the selected language", () => {
    expect(
      cpuReleasePresentation(
        {
          cpu_release_display: "2023-05-03",
          cpu_release_precision: "day",
          cpu_release_event_type: "launch",
          cpu_release_vendor: "amd",
          cpu_release_is_official: true,
        },
        "en",
      ).value,
    ).toBe("3 May 2023");
    expect(
      cpuReleasePresentation(
        {
          cpu_release_display: "2023-05-03",
          cpu_release_precision: "day",
          cpu_release_event_type: "launch",
          cpu_release_vendor: "amd",
          cpu_release_is_official: true,
        },
        "fr",
      ).value,
    ).toBe("3 mai 2023");
  });

  it("renders unknown instead of a zero-year age", () => {
    expect(cpuReleasePresentation({}, "en")).toEqual({
      value: "Unknown",
      summary: "Unknown",
      approximate: false,
    });
  });
});
