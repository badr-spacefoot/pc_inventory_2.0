from pathlib import PurePosixPath
import unittest

from collectors.desktop_collector.prefill import PrefillMixin
from collectors.desktop_collector.prefill_update import CollectorUpdateMixin
from collectors.desktop_collector.scan_presentation import ScanPresentationMixin


class Value:
    def __init__(self, value="") -> None:
        self.value = value

    def get(self):
        return self.value

    def set(self, value) -> None:
        self.value = value


class UpdateHarness(CollectorUpdateMixin):
    def __init__(self) -> None:
        self.launch_prefill_url = ""
        self.prefill_code = Value("prefill-123")
        self.api_url = Value("http://127.0.0.1:54321/inventory-api")


class PrefillHarness(PrefillMixin):
    def __init__(self) -> None:
        self.api_url = Value("")
        self.access_token = Value("")
        self.first_name = Value("")
        self.last_name = Value("")
        self.email = Value("")
        self.team = Value("")
        self.establishment = Value("")
        self.proposed_team = Value("")
        self.proposed_establishment = Value("")
        self.comment = Value("")
        self.language = Value("en")
        self.theme_preference = Value("system")
        self.theme_preference_explicit = True
        self.profile_visible = Value(True)
        self.connection_status = Value("")
        self.status = Value("")
        self.step_index = 1
        self.persisted = False
        self.rebuilt = False

    def profile_missing_fields(self):
        return []

    def persist_draft(self) -> None:
        self.persisted = True

    def _build_ui(self) -> None:
        self.rebuilt = True

    def t(self, text: str) -> str:
        return text


class ScanPresentationHarness(ScanPresentationMixin):
    def __init__(self, language="en") -> None:
        self.language = Value(language)

    def t(self, text: str) -> str:
        return {"usable": "utilisables", "free": "libres", "installed": "installés"}.get(text, text)


class CollectorWorkflowTests(unittest.TestCase):
    def test_builds_reopen_url_without_losing_local_api(self) -> None:
        url = UpdateHarness().launch_url_for_reopen()
        self.assertIn("prefillCode=prefill-123", url)
        self.assertIn("apiUrl=http%3A%2F%2F127.0.0.1", url)

    def test_builds_quoted_linux_update_command(self) -> None:
        command = UpdateHarness().linux_update_command(PurePosixPath("/tmp/spacefoot update.deb"))
        self.assertEqual(command, "sudo apt install -y '/tmp/spacefoot update.deb'")

    def test_formats_marketing_storage_capacity(self) -> None:
        presenter = ScanPresentationHarness("fr")
        self.assertEqual(presenter.marketed_storage_label(476.94), "512 Go")
        self.assertEqual(
            presenter.format_storage_summary(
                {"storageTotalGb": 476.94, "storageFreeGb": 200, "storageType": "SSD"}
            ),
            "512 Go SSD (477 Go utilisables) / 200 Go libres",
        )

    def test_formats_cpu_and_memory_details(self) -> None:
        presenter = ScanPresentationHarness()
        self.assertEqual(
            presenter.format_cpu_summary({"cpu": "Intel Core Ultra 9 288V", "cpuMaxClockGhz": 5.1}),
            "Intel Core Ultra 9 288V (5.10 GHz)",
        )
        self.assertEqual(
            presenter.format_memory_details(
                {
                    "memoryModules": [
                        {"capacityGb": 16, "memoryType": "LPDDR5", "speedMhz": 6400},
                        {"capacityGb": 16, "memoryType": "LPDDR5", "speedMhz": 6400},
                    ]
                }
            ),
            "16 GB + 16 GB · LPDDR5 · 6400 MHz · 2 modules",
        )

    def test_applies_prefill_to_profile_state(self) -> None:
        app = PrefillHarness()
        app.apply_prefill(
            {
                "apiUrl": "http://127.0.0.1:54321/inventory-api",
                "accessToken": "invite-token",
                "firstName": "Ada",
                "lastName": "Lovelace",
                "email": "ada@example.com",
                "team": "R&D",
                "establishment": "Paris",
                "language": "fr",
                "theme": "dark",
            }
        )

        self.assertEqual(app.first_name.get(), "Ada")
        self.assertEqual(app.email.get(), "ada@example.com")
        self.assertEqual(app.team.get(), "R&D")
        self.assertEqual(app.establishment.get(), "Paris")
        self.assertEqual(app.language.get(), "fr")
        self.assertEqual(app.theme_preference.get(), "dark")
        self.assertFalse(app.theme_preference_explicit)
        self.assertFalse(app.profile_visible.get())
        self.assertEqual(app.connection_status.get(), "Connection ready")
        self.assertTrue(app.persisted)
        self.assertTrue(app.rebuilt)


if __name__ == "__main__":
    unittest.main()
