export type CollectorPlatform = "windows" | "macos" | "linux" | "unknown";

export interface CollectorAsset {
  fileName?: string;
  version?: string;
}

export function buildCollectorLaunchUrl(prefillCode: string, apiBaseUrl: string): string {
  if (!prefillCode) return "";
  const api = new URL(apiBaseUrl);
  if (
    api.username ||
    api.password ||
    api.hash ||
    (api.protocol !== "https:" &&
      !(api.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname)))
  ) {
    throw new Error("Invalid collector API URL");
  }
  const params = new URLSearchParams({ prefillCode, apiUrl: api.href.replace(/\/$/, "") });
  return `spacefoot-collector://collect?${params}`;
}

export async function launchCollectorWithPrefill(
  platform: CollectorPlatform,
  actions: {
    downloadPrefillFile: (options: { silent: boolean; revokeDelayMs: number }) => unknown;
    waitForDownload: (milliseconds: number) => Promise<void>;
    openCollector: () => void;
  },
): Promise<void> {
  if (platform === "windows" || platform === "macos") {
    actions.downloadPrefillFile({ silent: true, revokeDelayMs: 5000 });
    await actions.waitForDownload(450);
  }
  actions.openCollector();
}

interface NavigatorSnapshot {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
}

export function detectClientPlatform(navigatorSnapshot: NavigatorSnapshot): CollectorPlatform {
  const platform = navigatorSnapshot.userAgentData?.platform || navigatorSnapshot.platform || "";
  const userAgent = navigatorSnapshot.userAgent || "";
  const text = `${platform} ${userAgent}`.toLowerCase();
  if (text.includes("win")) return "windows";
  if (text.includes("mac")) return "macos";
  if (text.includes("linux") || text.includes("x11")) return "linux";
  return "unknown";
}

export function platformLabel(platform: string): string {
  return { windows: "Windows", macos: "macOS", linux: "Linux" }[platform] || "";
}

export function downloadLabel(platform: string, translate: (value: string) => string): string {
  if (platform === "windows") return translate("Télécharger le collecteur Windows");
  if (platform === "macos") return translate("Télécharger le collecteur macOS");
  if (platform === "linux") return translate("Télécharger le collecteur Linux");
  return translate("Télécharger le collecteur");
}

export function ubuntuInstallCommand(asset?: CollectorAsset | null): string {
  const fileName = safeAssetFileName(asset?.fileName, ".deb", "spacefoot-it-collector-linux.deb");
  return [
    'downloads="$(xdg-user-dir DOWNLOAD 2>/dev/null || echo "$HOME/Téléchargements")"',
    'cd "$downloads" || cd "$HOME/Downloads"',
    `sudo apt install ./${fileName}`,
  ].join("\n");
}

export function macosInstallCommand(asset?: CollectorAsset | null): string {
  const fileName = safeAssetFileName(asset?.fileName, ".app.zip", "spacefoot-it-collector-macos.app.zip");
  const candidateVersion = String(asset?.version || "").replace(/^collector-v/i, "");
  const version = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/.test(candidateVersion) ? candidateVersion : "";
  const appName = version ? `spacefoot-it-collector-macos-${version}.app` : fileName.replace(/\.zip$/i, "");
  return [
    `app="$HOME/Applications/${appName}"`,
    `if [ ! -d "$app" ]; then app="$HOME/Downloads/${appName}"; fi`,
    `if [ ! -d "$app" ]; then app="$HOME/Téléchargements/${appName}"; fi`,
    'if [ ! -d "$app" ]; then app="/Applications/spacefoot-it-collector-macos.app"; fi',
    'if [ ! -d "$app" ]; then app="$HOME/Downloads/spacefoot-it-collector-macos.app"; fi',
    'if [ ! -d "$app" ]; then app="$HOME/Téléchargements/spacefoot-it-collector-macos.app"; fi',
    'if [ ! -d "$app" ]; then echo "Application Parcéo introuvable. Décompressez le téléchargement puis relancez cette commande."; exit 1; fi',
    'codesign --verify --deep --strict "$app" || exit 1',
    'spctl --assess --type execute "$app" || exit 1',
    'open "$app"',
  ].join("\n");
}

function safeAssetFileName(value: unknown, suffix: string, fallback: string): string {
  const candidate = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(candidate) && candidate.endsWith(suffix) ? candidate : fallback;
}

export function osIconSvg(platform: string): string {
  if (platform === "windows") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><rect x="13" y="13" width="8" height="8" rx="1"></rect></svg>`;
  }
  if (platform === "macos") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.6 13.1c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.2-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6 0 0-2.7-1-2.7-3.7ZM15.5 6.2c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.7-1.3Z"></path></svg>`;
  }
  if (platform === "linux") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-2.4 0-4 2-4 5.2 0 1.2-.4 2.2-1.1 3.3L4.4 15c-.9 1.6-.2 3.6 1.5 4.3 1 .4 2.1.2 2.9-.4.8.7 2 1.1 3.2 1.1s2.4-.4 3.2-1.1c.8.6 1.9.8 2.9.4 1.7-.7 2.4-2.7 1.5-4.3l-2.5-4.5C16.4 9.4 16 8.4 16 7.2 16 4 14.4 2 12 2Zm-1.4 6.1c-.5 0-.9-.5-.9-1.1s.4-1.1.9-1.1.9.5.9 1.1-.4 1.1-.9 1.1Zm2.8 0c-.5 0-.9-.5-.9-1.1s.4-1.1.9-1.1.9.5.9 1.1-.4 1.1-.9 1.1Z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M8 22h8M12 18v4"></path></svg>`;
}
