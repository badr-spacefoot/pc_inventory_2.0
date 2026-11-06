"""Self-update workflow for the desktop collector."""

from __future__ import annotations

import os
import platform
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
import zipfile
from pathlib import Path
from tkinter import messagebox

try:
    from .config import UPDATE_PUBLIC_KEY
    from .update_security import verify_manifest, verify_download, verify_windows_publisher, extract_app_archive, release_asset, release_version
except ImportError:
    from config import UPDATE_PUBLIC_KEY
    from update_security import verify_manifest, verify_download, verify_windows_publisher, extract_app_archive, release_asset, release_version

try:
    from .config import (
        COLLECTOR_RELEASES_URL,
        COLLECTOR_VERSION,
        MACOS_APP_BUNDLE_PREFIX,
    )
    from .support import (
        api_error_message,
        download_file,
        fetch_json_url,
        is_newer_version,
        normalize_api_url,
    )
except ImportError:  # Supports direct execution and PyInstaller entry points.
    from config import (
        COLLECTOR_RELEASES_URL,
        COLLECTOR_VERSION,
        MACOS_APP_BUNDLE_PREFIX,
    )
    from support import (
        api_error_message,
        download_file,
        fetch_json_url,
        is_newer_version,
        normalize_api_url,
    )


class CollectorUpdateMixin:
    """Coordinates native collector updates for Windows, Linux, and macOS."""

    def check_update_then_load_prefill(self) -> None:
        if not UPDATE_PUBLIC_KEY or not self.auto_update.get() or platform.system() not in {
            "Windows",
            "Linux",
            "Darwin",
        }:
            self.load_prefill()
            return
        self.status.set(self.t("Checking collector version..."))
        threading.Thread(
            target=self._check_update_then_load_prefill_background,
            daemon=True,
        ).start()

    def _check_update_then_load_prefill_background(self) -> None:
        update_directory = None
        handed_off = False
        try:
            if not UPDATE_PUBLIC_KEY:
                self.after(0, self.load_prefill)
                return
            manifest = verify_manifest(fetch_json_url(COLLECTOR_RELEASES_URL, timeout=8), UPDATE_PUBLIC_KEY)
            latest = str(manifest.get("latestVersion") or "")
            platform_key = {
                "Windows": "windows",
                "Linux": "linux",
                "Darwin": "macos",
            }.get(platform.system(), "")
            release_version(latest)
            if not is_newer_version(latest, COLLECTOR_VERSION):
                self.after(0, self.load_prefill)
                return
            asset = release_asset(manifest, platform_key)
            # Keep the directory alive until the installer has consumed the package.
            update_directory = Path(tempfile.mkdtemp(prefix="spacefoot-update-"))
            installer_path = update_directory / asset["fileName"]
            self.after(
                0,
                lambda: self.status.set(self.t("Downloading collector update...")),
            )
            download_file(asset["downloadUrl"], installer_path, timeout=120, max_bytes=asset["size"])
            verify_download(installer_path, asset)
            if platform_key == "windows":
                verify_windows_publisher(installer_path, str(asset.get("publisherThumbprint") or ""))
            if platform_key == "linux":
                self.after(
                    0,
                    lambda: self.install_linux_update_and_relaunch(
                        installer_path,
                        latest,
                    ),
                )
            elif platform_key == "macos":
                self.after(
                    0,
                    lambda: self.install_macos_update_and_relaunch(
                        installer_path,
                        latest,
                    ),
                )
            else:
                self.after(0, lambda: self.install_update_and_relaunch(installer_path))
            handed_off = True
        except Exception:
            self.after(
                0,
                lambda: self.status.set(
                    self.t("Update check failed. Loading current collector.")
                ),
            )
            self.after(700, self.load_prefill)
        finally:
            if update_directory is not None and not handed_off:
                shutil.rmtree(update_directory)

    def launch_url_for_reopen(self) -> str:
        if self.launch_prefill_url:
            return self.launch_prefill_url
        params = urllib.parse.urlencode(
            {
                "prefillCode": self.prefill_code.get().strip(),
                "apiUrl": normalize_api_url(self.api_url.get()),
            }
        )
        return f"spacefoot-collector://collect?{params}"

    def linux_update_command(self, installer_path: Path) -> str:
        return f"sudo apt install -y {shlex.quote(str(installer_path))}"

    def linux_executable(self, name: str) -> str:
        found = shutil.which(name)
        if found:
            return found
        for directory in (
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/snap/bin",
            "/var/lib/flatpak/exports/bin",
        ):
            candidate = Path(directory) / name
            if candidate.exists():
                return str(candidate)
        return ""

    def linux_process_env(self) -> dict:
        env = os.environ.copy()
        default_path = (
            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
        )
        env["PATH"] = (
            f"{env.get('PATH')}:{default_path}" if env.get("PATH") else default_path
        )
        return env

    def launch_linux_update_terminal(self, installer_path: Path) -> bool:
        script_path = installer_path.parent / "spacefoot-it-collector-update.sh"
        script = "\n".join(
            [
                "#!/bin/sh",
                "echo 'Installing Spacefoot IT Collector update...'",
                'sudo apt install -y "$1"',
                "status=$?",
                'if [ "$status" -ne 0 ]; then',
                "  echo",
                "  echo 'Update failed. Please keep this terminal open and copy the error for IT support.'",
                "  echo 'Command:'",
                '  echo "sudo apt install -y $1"',
                "  read -r _",
                '  exit "$status"',
                "fi",
                "echo",
                "echo 'Update installed. The collector will reopen automatically.'",
                "sleep 4",
                "",
            ]
        )
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        shell_command = (
            f"sh {shlex.quote(str(script_path))} {shlex.quote(str(installer_path))}"
        )
        terminal_commands = [
            ["gnome-terminal", "--wait", "--", "bash", "-lc", shell_command],
            ["gnome-terminal", "--", "bash", "-lc", shell_command],
            ["ptyxis", "--wait", "--", "bash", "-lc", shell_command],
            ["kgx", "--wait", "--", "bash", "-lc", shell_command],
            ["x-terminal-emulator", "-e", "bash", "-lc", shell_command],
            ["konsole", "-e", "bash", "-lc", shell_command],
            ["xfce4-terminal", "-e", f"bash -lc {shlex.quote(shell_command)}"],
            ["mate-terminal", "--wait", "--", "bash", "-lc", shell_command],
            ["tilix", "-e", "bash", "-lc", shell_command],
            ["alacritty", "-e", "bash", "-lc", shell_command],
            ["kitty", "bash", "-lc", shell_command],
            ["xterm", "-e", "bash", "-lc", shell_command],
        ]
        env = self.linux_process_env()
        for command in terminal_commands:
            executable = self.linux_executable(command[0])
            if not executable:
                continue
            command = [executable, *command[1:]]
            try:
                process = subprocess.Popen(command, env=env)
                time.sleep(0.8)
                status = process.poll()
                if status is None or status == 0:
                    return True
            except Exception:
                continue
        return False

    def installed_linux_collector_version(self) -> str:
        try:
            result = subprocess.run(
                ["dpkg-query", "-W", "-f=${Version}", "spacefoot-it-collector"],
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            return result.stdout.strip() if result.returncode == 0 else ""
        except Exception:
            return ""

    def wait_for_linux_update_and_relaunch(
        self,
        expected_version: str,
        launch_url: str,
        deadline: float,
    ) -> None:
        installed = self.installed_linux_collector_version()
        if (
            installed
            and is_newer_version(installed, COLLECTOR_VERSION)
            and not is_newer_version(expected_version, installed)
        ):
            executable = Path("/opt/spacefoot-it-collector/spacefoot-it-collector")
            try:
                xdg_open = self.linux_executable("xdg-open")
                subprocess.Popen(
                    [str(executable), launch_url]
                    if executable.exists()
                    else [xdg_open or "xdg-open", launch_url],
                    env=self.linux_process_env(),
                )
            except Exception:
                pass
            self.destroy()
            return
        if time.time() < deadline:
            self.status.set(
                self.t("Waiting for Ubuntu to finish installing the update...")
            )
            self.after(
                2000,
                lambda: self.wait_for_linux_update_and_relaunch(
                    expected_version,
                    launch_url,
                    deadline,
                ),
            )
            return
        self.status.set(self.t("Update did not finish. Loading current collector."))
        self.after(1000, self.load_prefill)

    def install_linux_update_and_relaunch(
        self,
        installer_path: Path,
        latest_version: str,
    ) -> None:
        self.status.set(
            self.t("Installing update. The collector will reopen automatically.")
        )
        launch_url = self.launch_url_for_reopen()
        messagebox.showinfo(
            self.t("Collector update ready"),
            self.t(
                "A new collector version has been downloaded. Ubuntu will now ask for your password in a terminal to install the update. The collector will reopen automatically with the prefilled profile."
            ),
        )
        try:
            if self.launch_linux_update_terminal(installer_path):
                self.status.set(
                    self.t("Waiting for Ubuntu to finish installing the update...")
                )
                self.after(
                    2000,
                    lambda: self.wait_for_linux_update_and_relaunch(
                        latest_version,
                        launch_url,
                        time.time() + 180,
                    ),
                )
                return
            command = self.linux_update_command(installer_path)
            messagebox.showwarning(
                self.t("Collector update ready"),
                f"{self.t('Unable to open a terminal for the update. Run this command, then reopen the collector from the web page:')}\n\n{command}",
            )
            self.after(1000, self.load_prefill)
        except Exception as exc:
            self.status.set(api_error_message(exc))
            self.after(1000, self.load_prefill)

    def macos_target_app_path(self, latest_version: str) -> Path:
        version = release_version(latest_version)
        return Path.home() / "Applications" / f"{MACOS_APP_BUNDLE_PREFIX}-{version}.app"

    def install_macos_update_and_relaunch(
        self,
        installer_path: Path,
        latest_version: str,
    ) -> None:
        self.status.set(
            self.t("Installing update. The collector will reopen automatically.")
        )
        launch_url = self.launch_url_for_reopen()
        messagebox.showinfo(
            self.t("Collector update ready"),
            self.t(
                "A new collector version has been downloaded. macOS will install it in your Applications folder and reopen it automatically with the prefilled profile."
            ),
        )
        try:
            with tempfile.TemporaryDirectory(
                prefix="spacefoot-collector-macos-"
            ) as temp_dir:
                extract_dir = Path(temp_dir)
                with zipfile.ZipFile(installer_path) as archive:
                    extract_app_archive(archive, extract_dir)
                apps = sorted(
                    extract_dir.rglob("*.app"),
                    key=lambda path: len(path.parts),
                )
                if not apps:
                    raise RuntimeError(
                        "No macOS app bundle was found in the update archive."
                    )
                source_app = apps[0]
                subprocess.run(["codesign", "--verify", "--deep", "--strict", str(source_app)], check=True, timeout=30)
                subprocess.run(["spctl", "--assess", "--type", "execute", str(source_app)], check=True, timeout=30)
                target_app = self.macos_target_app_path(latest_version)
                target_app.parent.mkdir(parents=True, exist_ok=True)
                if target_app.exists():
                    shutil.rmtree(target_app)
                shutil.copytree(source_app, target_app, symlinks=True)
            lsregister = Path(
                "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
            )
            if lsregister.exists():
                subprocess.run(
                    [str(lsregister), "-f", str(target_app)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                )
            subprocess.Popen(["open", "-n", str(target_app), "--args", launch_url])
            self.after(900, self.destroy)
        except Exception as exc:
            self.status.set(api_error_message(exc))
            messagebox.showwarning(
                self.t("Collector update ready"),
                f"{self.t('Unable to install the macOS update automatically. Open the downloaded file, then reopen the collector from the web page:')}\n\n{installer_path}",
            )
            self.after(1000, self.load_prefill)

    def install_update_and_relaunch(self, installer_path: Path) -> None:
        self.status.set(
            self.t("Installing update. The collector will reopen automatically.")
        )
        messagebox.showinfo(
            self.t("Collector update ready"),
            self.t(
                "A new collector version has been downloaded. Windows will now ask for permission to run the installer. Click Yes or Run. The collector will reopen automatically with the prefilled profile."
            ),
        )
        prefill_code = self.prefill_code.get().strip()
        try:
            subprocess.Popen(
                [
                    str(installer_path),
                    "/SP-",
                    "/SILENT",
                    "/NORESTART",
                    "/CLOSEAPPLICATIONS",
                    "/LaunchAfterInstall=1",
                    f"/PrefillCode={prefill_code}",
                    f"/LaunchUrl={self.launch_url_for_reopen()}",
                ]
            )
            self.after(800, self.destroy)
        except Exception as exc:
            self.status.set(api_error_message(exc))
            self.after(1000, self.load_prefill)
