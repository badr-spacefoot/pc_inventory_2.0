"""Stable configuration shared by the desktop collector modules."""

from pathlib import Path


DEFAULT_API_URL = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"
COLLECTOR_VERSION = "0.1.50"
COLLECTOR_BUILD_CHANNEL = "github-release"
COLLECTOR_RELEASES_URL = (
    "https://badr-spacefoot.github.io/pc_inventory_2.0/collector-releases.json"
)
MACOS_APP_BUNDLE_PREFIX = "spacefoot-it-collector-macos"
DRAFT_PATH = Path.home() / ".spacefoot_it_collector.json"
PREFILL_FILE_MAX_AGE_SECONDS = 24 * 60 * 60
