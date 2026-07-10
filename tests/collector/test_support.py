from pathlib import Path
import tempfile
import unittest

from collectors.desktop_collector.support import (
    compact_number,
    downloads_dirs,
    is_newer_version,
    launch_prefill_from_args,
    normalize_api_url,
    version_label,
)
from collectors.desktop_collector.platform_integration import desktop_exec_quote


class CollectorSupportTests(unittest.TestCase):
    def test_normalizes_supabase_project_url_to_edge_function(self) -> None:
        self.assertEqual(
            normalize_api_url("oletfrcaptvardmdwacy.supabase.co/anything"),
            "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api",
        )

    def test_preserves_non_supabase_api_path(self) -> None:
        self.assertEqual(
            normalize_api_url("http://127.0.0.1:54321/inventory-api/"),
            "http://127.0.0.1:54321/inventory-api",
        )

    def test_compares_collector_versions_numerically(self) -> None:
        self.assertTrue(is_newer_version("collector-v0.1.48", "0.1.9"))
        self.assertFalse(is_newer_version("v0.1.48", "0.1.48"))
        self.assertEqual(version_label("collector-v0.1.48"), "0.1.48")

    def test_formats_numbers_without_trailing_zeroes(self) -> None:
        self.assertEqual(compact_number(1024.0), "1024")
        self.assertEqual(compact_number(1.50, 2), "1.5")

    def test_quotes_linux_desktop_exec_paths(self) -> None:
        self.assertEqual(
            desktop_exec_quote('/home/user/Collector "stable"'),
            '"/home/user/Collector \\"stable\\""',
        )

    def test_discovers_localized_download_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            home = Path(temporary_directory)
            config_directory = home / ".config"
            config_directory.mkdir()
            custom_downloads = home / "Mes fichiers"
            (config_directory / "user-dirs.dirs").write_text(
                'XDG_DOWNLOAD_DIR="$HOME/Mes fichiers"\n',
                encoding="utf-8",
            )
            self.assertEqual(downloads_dirs(home)[0], custom_downloads)

    def test_parses_prefill_from_custom_protocol(self) -> None:
        launch_url = (
            "spacefoot-collector://open?prefillCode=abc123&"
            "apiUrl=http%3A%2F%2F127.0.0.1%3A54321%2Finventory-api"
        )
        self.assertEqual(
            launch_prefill_from_args(["collector", launch_url]),
            {
                "prefillCode": "abc123",
                "apiUrl": "http://127.0.0.1:54321/inventory-api",
                "launchUrl": launch_url,
            },
        )

    def test_parses_windows_launch_url_argument(self) -> None:
        launch_url = "spacefoot-collector://open?code=windows-prefill"
        parsed = launch_prefill_from_args(
            ["collector.exe", f'/launchUrl="{launch_url}"']
        )
        self.assertEqual(parsed["prefillCode"], "windows-prefill")


if __name__ == "__main__":
    unittest.main()
