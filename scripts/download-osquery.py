"""Download an audited, hash-pinned osquery artifact without installing it."""
import hashlib
from pathlib import Path
import sys
import urllib.request

ASSETS = {
    "windows": ("osquery-5.23.1.msi", "bb3adc9f32f257147855404d24bceebcd8baf6e65f4d4ca43e186f4a85fa6ed3", "msi"),
    "macos": ("osquery-5.23.1.pkg", "9f40cea0358759ab2ee871c577055657e3cc2c7cbe5c1247f764245941178aa6", "pkg"),
    "linux": ("osquery_5.23.1-1.linux_amd64.deb", "1431a9a6394657eba3cdd3476a462a6fe9721fc3664a70f23efcf7e37816787a", "deb"),
}


def main():
    name, expected, extension = ASSETS[sys.argv[1]]
    target = Path("installer-assets") / f"osquery.{extension}"
    target.parent.mkdir(exist_ok=True)
    request = urllib.request.Request(f"https://github.com/osquery/osquery/releases/download/5.23.1/{name}", headers={"User-Agent": "Spacefoot-build"})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as output:
        for block in iter(lambda: response.read(1024 * 1024), b""):
            digest.update(block)
            output.write(block)
    if digest.hexdigest() != expected:
        target.unlink()
        raise ValueError("osquery package checksum mismatch")


if __name__ == "__main__":
    main()
