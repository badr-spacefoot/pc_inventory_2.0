"""Configure an explicitly manual build without weakening signed-update trust."""
import os
from pathlib import Path
import re

tag = os.environ["GITHUB_REF_NAME"]
match = re.fullmatch(r"collector-manual-v(\d+\.\d+\.\d+)", tag)
if not match:
    raise SystemExit("Manual builds require a collector-manual-v semantic tag")
path = Path("collectors/desktop_collector/config.py")
source = path.read_text(encoding="utf-8")
if 'UPDATE_PUBLIC_KEY = ""' not in source:
    raise SystemExit("Refusing to replace an existing update trust key")
source = re.sub(r'COLLECTOR_VERSION = "[^\"]+"', f'COLLECTOR_VERSION = "{match[1]}"', source)
source = re.sub(r'COLLECTOR_BUILD_CHANNEL = "[^\"]+"', 'COLLECTOR_BUILD_CHANNEL = "manual-unsigned"', source)
path.write_text(source, encoding="utf-8")
