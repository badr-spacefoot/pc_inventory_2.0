import { describe, expect, it } from "vitest";

import {
  buildCollectorLaunchUrl,
  detectClientPlatform,
  downloadLabel,
  launchCollectorWithPrefill,
  macosInstallCommand,
  osIconSvg,
  platformLabel,
  ubuntuInstallCommand,
} from "../../frontend/src/features/collector/platform";

describe("collector platform helpers", () => {
  it("builds launch links from the public HTTPS API used by the page", () => {
    const api = "https://project.supabase.co/functions/v1/inventory-api";
    const url = new URL(buildCollectorLaunchUrl("prefill+code&safe", api));
    expect(url.protocol).toBe("spacefoot-collector:");
    expect(url.searchParams.get("apiUrl")).toBe(api);
    expect(url.searchParams.get("prefillCode")).toBe("prefill+code&safe");
    expect(buildCollectorLaunchUrl("", api)).toBe("");
  });

  it("keeps non-local cleartext and credential-bearing API URLs out of launch links", () => {
    for (const api of [
      "http://project.supabase.co/inventory-api",
      "https://user:secret@example.com/api",
      "javascript:alert(1)",
    ]) {
      expect(() => buildCollectorLaunchUrl("fixture", api)).toThrow();
    }
    expect(
      new URL(buildCollectorLaunchUrl("fixture", "http://127.0.0.1:54321/inventory-api")).searchParams.get("apiUrl"),
    ).toBe("http://127.0.0.1:54321/inventory-api");
  });

  it.each(["windows", "macos"] as const)("keeps a prefill fallback before opening on %s", async (platform) => {
    const steps: string[] = [];
    let finishDownload!: () => void;
    const downloadReady = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const opening = launchCollectorWithPrefill(platform, {
      downloadPrefillFile: () => {
        steps.push("prefill-file");
      },
      waitForDownload: async () => {
        steps.push("download-started");
        await downloadReady;
      },
      openCollector: () => {
        steps.push("protocol");
      },
    });
    expect(steps).toEqual(["prefill-file", "download-started"]);
    finishDownload();
    await opening;
    expect(steps).toEqual(["prefill-file", "download-started", "protocol"]);
  });

  it.each([
    [{ platform: "Win32", userAgent: "" }, "windows"],
    [{ platform: "MacIntel", userAgent: "" }, "macos"],
    [{ platform: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }, "linux"],
    [{ platform: "Plan9", userAgent: "Spacefoot" }, "unknown"],
  ] as const)("detects supported client platforms", (snapshot, expected) => {
    expect(detectClientPlatform(snapshot)).toBe(expected);
  });

  it("keeps labels and icons stable", () => {
    expect(platformLabel("macos")).toBe("macOS");
    expect(downloadLabel("windows", (value) => value)).toBe("Télécharger le collecteur Windows");
    expect(osIconSvg("linux")).toContain("<svg");
  });

  it("builds install commands from release assets", () => {
    expect(ubuntuInstallCommand({ fileName: "collector-1.2.3.deb" })).toContain(
      "sudo apt install ./collector-1.2.3.deb",
    );
    const macosCommand = macosInstallCommand({ version: "collector-v1.2.3" });
    expect(macosCommand).toContain("spacefoot-it-collector-macos-1.2.3.app");
    expect(macosCommand).toContain("$HOME/Téléchargements");
    expect(macosCommand).toContain('codesign --verify --deep --strict "$app" || exit 1');
    expect(macosCommand).toContain('spctl --assess --type execute "$app" || exit 1');
    expect(macosCommand).not.toContain("xattr");
    expect(macosCommand).toContain("Application Parcéo introuvable");
  });

  it("does not interpolate shell syntax or paths from release metadata", () => {
    const malicious = { fileName: "../../$(touch /tmp/injected).deb", version: "1.2.3$(id)" };
    expect(ubuntuInstallCommand(malicious)).toContain("sudo apt install ./spacefoot-it-collector-linux.deb");
    const command = macosInstallCommand(malicious);
    expect(command).not.toContain("$(id)");
    expect(command).not.toContain("touch");
    expect(command).toContain("$HOME/Applications/spacefoot-it-collector-macos.app");
  });
});
