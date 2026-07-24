from pathlib import Path
import unittest

from collectors.desktop_collector.diagnostics import default_log_path


class CollectorDiagnosticsTests(unittest.TestCase):
    def test_uses_macos_library_logs_directory(self) -> None:
        home = Path("/Users/example")

        self.assertEqual(
            default_log_path("Darwin", home),
            home
            / "Library"
            / "Logs"
            / "Spacefoot IT Collector"
            / "collector.log",
        )

    def test_uses_platform_specific_non_macos_directories(self) -> None:
        home = Path("/home/example")

        self.assertEqual(
            default_log_path("Linux", home),
            home
            / ".local"
            / "state"
            / "spacefoot-it-collector"
            / "collector.log",
        )


if __name__ == "__main__":
    unittest.main()
