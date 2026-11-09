import { describe, expect, it } from "vitest";

import {
  detectClientPlatform,
  downloadLabel,
  macosInstallCommand,
  osIconSvg,
  platformLabel,
  ubuntuInstallCommand,
} from "../../frontend/src/features/collector/platform";

describe("collector platform helpers", () => {
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
