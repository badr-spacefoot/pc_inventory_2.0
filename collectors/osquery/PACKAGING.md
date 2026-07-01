# One-app packaging target

Goal: users download/open one trusted Spacefoot collector and never run scripts manually.

## Windows

Target package:

- Signed setup executable built by Inno Setup.
- Installs Spacefoot Collector.
- Installs the official osquery MSI as an internal dependency when osquery is not already present.
- Adds no background remote-control agent.
- Runs collection only when the user opens the collector and confirms submission.

Runtime path:

```text
Spacefoot Collector -> bundled osqueryi -> review screen -> Supabase
```

Avoid:

- PyInstaller `--onefile`.
- Hidden PowerShell collection.
- Downloading code at runtime.
- Obfuscation or encoded commands.

## macOS

Target package:

- Signed and notarized `.pkg` or `.app`.
- Bundles osquery or checks for an MDM-installed osquery.
- Uses the same review-before-submit UX.

## Linux

Target package:

- `.deb` for managed Ubuntu/Debian fleets.
- Optional AppImage for manual tests.
- Uses `/usr/bin/osqueryi` or bundled equivalent.

## User experience

1. User opens Spacefoot Collector.
2. App loads the prefill file or invite code.
3. User clicks `Scan this computer`.
4. App runs osquery locally.
5. User reviews the collected data.
6. User clicks `Submit inventory`.

No terminal, no script execution, no browser download tricks.

## Current CI implementation

The GitHub Actions workflow `.github/workflows/build-collectors.yml` now builds Windows with PyInstaller `--onedir`, signs the collector executable, downloads an osquery Windows MSI, creates `Spacefoot-IT-Collector-<version>-Setup.exe` with Inno Setup, then signs the setup.

Manual test build:

1. Open the `Build collector apps` workflow in GitHub Actions.
2. Run it with `workflow_dispatch`.
3. Leave `osquery_msi_url` empty for automatic latest-release lookup.
4. If osquery changes its release asset names, re-run with a direct official osquery MSI URL in `osquery_msi_url`.

Tagged release:

```powershell
git tag collector-v0.1.0
git push origin collector-v0.1.0
```

The release job publishes `spacefoot-it-collector-windows-0.1.0-setup.exe` plus checksums. Use real `WINDOWS_CODESIGN_PFX_BASE64` and `WINDOWS_CODESIGN_PASSWORD` repository secrets before sending installers to clients; without them, CI creates an internal testing certificate only.

Local Windows smoke build:

```powershell
.\scripts\build-windows-installer.ps1 -Version "0.1.0-test"
```

Local prerequisites are Python, PyInstaller, Inno Setup 6 and the Windows SDK signing tools. Use `-SkipSign` only for a private packaging smoke test.
