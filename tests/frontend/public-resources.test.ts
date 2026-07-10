import { describe, expect, it, vi } from "vitest";

import { PublicResourceService } from "../../frontend/src/services/public-resources";

describe("PublicResourceService", () => {
  it("retries a transient read failure", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("collector script", { status: 200 }));
    const service = new PublicResourceService(fetchImplementation);

    await expect(service.getText("https://example.com/collector.ps1")).resolves.toBe("collector script");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("normalizes the Open-Meteo response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("temperature_unit")).toBe("celsius");
      return new Response(
        JSON.stringify({
          current: {
            temperature_2m: 21.4,
            weather_code: 2,
            is_day: 1,
            time: "2026-07-10T13:00",
          },
        }),
        { status: 200 },
      );
    });
    const service = new PublicResourceService(fetchImplementation);

    await expect(service.getWeather({ latitude: 48.89, longitude: 2.29, temperatureUnit: "celsius" })).resolves.toEqual(
      {
        temperature: 21.4,
        weatherCode: 2,
        isDay: true,
        collectedAt: "2026-07-10T13:00",
      },
    );
  });
});
