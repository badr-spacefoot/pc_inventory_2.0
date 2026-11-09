"""Copy the approved Sillage identity into runtime assets and create native fonts.

Run with fonttools installed in an isolated design environment. Runtime needs no
fonttools or Pillow. Font files are bundled, never installed by this script.
"""
from pathlib import Path
import hashlib
import json
import shutil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design/parceo/identity"
TARGET = ROOT / "frontend/assets/brand/parceo"

def main():
    assert json.loads((SOURCE / "tokens.json").read_text(encoding="utf-8"))["version"] == "2.0"
    files = {
        "logos/parceo-horizontal-color.svg": "logo-light.svg",
        "logos/parceo-horizontal-white.svg": "logo-dark.svg",
        "logos/parceo-symbol-color.svg": "symbol.svg",
        "logos/png/parceo-horizontal-color-1246.png": "logo-light.png",
        "logos/png/parceo-horizontal-white-1246.png": "logo-dark.png",
        "collector/parceo-collector-64.png": "collector-64.png",
        "collector/parceo-collector-256.png": "collector-256.png",
        "collector/parceo-collector-1024.png": "collector-1024.png",
        "collector/parceo-collector-square-1024.png": "collector-square-1024.png",
        "collector/parceo-collector.ico": "collector.ico",
        "collector/parceo-collector.icns": "collector.icns",
        "fonts/Manrope-Variable.ttf": "fonts/Manrope-Variable.ttf",
        "fonts/Manrope-OFL.txt": "fonts/Manrope-OFL.txt",
        "fonts/IBMPlexMono-Regular.ttf": "fonts/IBMPlexMono-Regular.ttf",
        "fonts/IBMPlexMono-OFL.txt": "fonts/IBMPlexMono-OFL.txt",
    }
    for name in ["favicon.svg", "favicon.ico", "favicon-16.png", "favicon-32.png", "favicon-48.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png", "site.webmanifest"]:
        files[f"web/{name}"] = name
    for source, destination in files.items():
        target = TARGET / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / source, target)
    for weight, style in ((400, "Regular"), (700, "Bold")):
        font = instantiateVariableFont(TTFont(SOURCE / "fonts/Manrope-Variable.ttf"), {"wght": weight}, inplace=False)
        for record in font["name"].names:
            value = {1: "Manrope", 2: style, 4: f"Manrope {style}", 6: f"Manrope-{style}", 16: "Manrope", 17: style}.get(record.nameID)
            if value:
                font["name"].setName(value, record.nameID, record.platformID, record.platEncID, record.langID)
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0x60) | (0x20 if weight == 700 else 0x40)
        font["head"].macStyle = (font["head"].macStyle & ~1) | (1 if weight == 700 else 0)
        font.save(TARGET / f"fonts/Manrope-{style}.ttf")
        font.close()
    manifest = json.loads((TARGET / "site.webmanifest").read_text(encoding="utf-8"))
    manifest.update(id="../../../", start_url="../../../", scope="../../../")
    (TARGET / "site.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Keep existing runtime/build paths functional, including older packagers.
    for source, target in (("collector-1024.png", "app-icon.png"), ("collector.ico", "app-icon.ico"), ("collector.icns", "app-icon.icns"), ("favicon.svg", "favicon.svg")):
        shutil.copyfile(TARGET / source, TARGET.parent / target)
    records = [{"file": p.relative_to(TARGET).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(TARGET.rglob("*")) if p.is_file() and p.name != "brand-manifest.json"]
    (TARGET / "brand-manifest.json").write_text(json.dumps({"brand": "Parcéo", "identity": "Sillage", "version": "2.0", "nativeFonts": "Manrope variable source instantiated at 400/700, SIL OFL 1.1; names normalized for private OS font matching", "files": records}, indent=2) + "\n", encoding="utf-8")
    print(f"Synced {len(records)} brand assets; native static fonts built without system installation.")

if __name__ == "__main__":
    main()
