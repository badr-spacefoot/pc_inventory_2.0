"""Stable configuration shared by the desktop collector modules."""

from pathlib import Path


DEFAULT_API_URL = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"
COLLECTOR_VERSION = "0.1.57-dev"
COLLECTOR_BUILD_CHANNEL = "source"
# Injected into packaged builds only after verifying against the signing key.
UPDATE_PUBLIC_KEY = ""
COLLECTOR_RELEASES_URL = (
    "https://github.com/badr-spacefoot/pc_inventory_2.0/releases/latest/download/collector-releases.signed.json"
)
MACOS_APP_BUNDLE_PREFIX = "spacefoot-it-collector-macos"
DRAFT_PATH = Path.home() / ".spacefoot_it_collector.json"
PREFILL_FILE_MAX_AGE_SECONDS = 24 * 60 * 60
