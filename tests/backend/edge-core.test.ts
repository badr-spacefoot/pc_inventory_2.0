import { describe, expect, it } from "vitest";

import {
  normalizeScanPayload,
  safeExternalUrl,
  titleCase,
  validateEmail,
} from "../../supabase/functions/inventory-api/core/input";
import { canPerformAction, normalizedRole } from "../../supabase/functions/inventory-api/core/permissions";
import { createResponseHelpers } from "../../supabase/functions/inventory-api/core/responses";

describe("inventory API core", () => {
  it("normalizes legacy collector payloads without changing the contract", () => {
    expect(
      normalizeScanPayload(
        {
          pcName: "LAPTOP-01",
          os: "Windows 11",
          ram: "16 GB",
          mac: "aa:bb:cc:dd:ee:ff",
          hardwareIdentity: { productName: "Latitude 7450", biosSerialNumber: "ABC123" },
        },
        () => "2026-07-10T12:00:00.000Z",
      ),
    ).toMatchObject({
      hostname: "LAPTOP-01",
      osVersion: "Windows 11",
      model: "Latitude 7450",
      serviceTag: "ABC123",
      ramTotalGb: 16,
      macAddress: "AA-BB-CC-DD-EE-FF",
      collectedAt: "2026-07-10T12:00:00.000Z",
    });
  });

  it("validates and normalizes external input", () => {
    expect(validateEmail("user@spacefoot.com", ["spacefoot.com"])).toBe("");
    expect(validateEmail("user@example.com", ["spacefoot.com"])).toContain("Domaine email non autorise");
    expect(safeExternalUrl("javascript:alert(1)")).toBe("");
    expect(titleCase("jÉRÉMY roche")).toBe("Jérémy Roche");
  });

  it("keeps role permissions centralized", () => {
    expect(normalizedRole("read_only")).toBe("READ_ONLY");
    expect(normalizedRole("unexpected")).toBe("VIEWER");
    expect(canPerformAction({ id: "1", username: "admin", displayName: "Admin", role: "ADMIN" }, "DEVICE_DELETE")).toBe(
      true,
    );
    expect(
      canPerformAction({ id: "2", username: "viewer", displayName: "Viewer", role: "VIEWER" }, "DEVICE_DELETE"),
    ).toBe(false);
  });

  it("applies the configured CORS policy consistently", async () => {
    const responses = createResponseHelpers(["https://app.example"]);
    const request = new Request("https://api.example/devices", {
      headers: { origin: "https://app.example" },
    });
    const response = responses.json(request, { ok: true });

    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
