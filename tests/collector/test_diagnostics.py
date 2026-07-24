from pathlib import Path
import unittest

from collectors.desktop_collector.diagnostics import (
    default_log_path,
    is_stale_widget_error,
)


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

    def test_recognizes_callbacks_for_destroyed_tk_widgets(self) -> None:
        self.assertTrue(
            is_stale_widget_error(
                RuntimeError('bad window path name ".!frame.!label5"')
            )
        )
        self.assertTrue(
            is_stale_widget_error(
                RuntimeError('invalid command name ".!frame.!label5"')
            )
        )
        self.assertFalse(is_stale_widget_error(RuntimeError("API unavailable")))


if __name__ == "__main__":
    unittest.main()
