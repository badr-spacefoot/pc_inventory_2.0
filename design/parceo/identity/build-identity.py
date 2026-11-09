"""Rebuild the approved Parcéo vector identity. Requires fonttools==4.68.0.

No network, installation, repository mutation or application integration.
PNG/ICO/ICNS rendering is a separate step; see README.md.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parent
GREEN, INK, LIME, PAPER, WHITE = "#0B6E58", "#142D27", "#D6F279", "#F6F7F2", "#FFFFFF"
NORMAL = "M46 224V92C46 52 74 28 118 28H142C182 28 210 56 210 96C210 136 182 164 142 164H110V128H138C161 128 174 116 174 96C174 76 161 64 138 64H118C94 64 82 76 82 96V188L46 224Z"
REVERSE = "M46.55 222.67V92C46.55 52.34 74.34 28.55 118 28.55H142C181.66 28.55 209.45 56.34 209.45 96C209.45 135.66 181.66 163.45 142 163.45H110.55V128.55H138C161.34 128.55 174.55 116.34 174.55 96C174.55 75.66 161.34 63.45 138 63.45H118C93.66 63.45 81.45 75.66 81.45 96V187.77L46.55 222.67Z"
SMALL = "M3 14V6C3 3.5 4.5 2 7 2H9C11.5 2 13 3.5 13 6C13 8.5 11.5 10 9 10H7V8H9C10.25 8 11 7.25 11 6C11 4.75 10.25 4 9 4H7C5.75 4 5 4.75 5 6V12L3 14Z"
ET.register_namespace("", "http://www.w3.org/2000/svg")


def write(relative: str, content: str):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def drawing(title: str, body: str, width=256, height=256):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
            f'role="img" aria-labelledby="title"><title id="title">{html.escape(title)}</title>'
            f'{body}</svg>\n')


def symbol(color=GREEN, reverse=False, small=False):
    path = SMALL if small else REVERSE if reverse else NORMAL
    return f'<path fill="{color}" d="{path}"/>'


def wordmark(color=INK):
    # Preserve the approved Sillage wordmark, including its normalization transform.
    root = ET.parse(ROOT / "sources/wordmark-original.svg").getroot()
    group = root.find("{http://www.w3.org/2000/svg}g")
    assert group is not None
    normalized = group.find("{http://www.w3.org/2000/svg}g")
    assert normalized is not None
    tx, ty, scale = map(float, re.findall(r"-?\d+(?:\.\d+)?", normalized.get("transform", "")))
    pen = SVGPathPen(None)
    for element in normalized.iter("{http://www.w3.org/2000/svg}path"):
        parse_path(element.get("d"), TransformPen(pen, (scale, 0, 0, scale, tx, ty)))
    commands = re.sub(r"-?\d+\.\d{3,}", lambda match: f"{float(match.group()):.2f}".rstrip("0").rstrip("."), pen.getCommands())
    return f'<path fill="{color}" d="{commands}"/>'


def label(text: str, color=INK, size=24):
    """Outline labels using the bundled, unmodified SIL OFL mono font."""
    font = TTFont(ROOT / "fonts/IBMPlexMono-Regular.ttf")
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    position = 0
    pen = SVGPathPen(glyphs)
    for char in text:
        glyph = cmap[ord(char)]
        glyphs[glyph].draw(TransformPen(pen, (scale, 0, 0, -scale, position, 0)))
        position += font["hmtx"].metrics[glyph][0] * scale
    font.close()
    commands = re.sub(r"-?\d+\.\d{3,}", lambda match: f"{float(match.group()):.2f}".rstrip("0").rstrip("."), pen.getCommands())
    return f'<path fill="{color}" d="{commands}"/>'


def horizontal(fg, reverse=False, collector=False):
    body = (f'<g transform="translate(-1.8 8) scale(0.82)">{symbol(fg, reverse)}</g>'
            f'<g transform="translate(250 64)">{wordmark(WHITE if reverse else INK if fg == GREEN else fg)}</g>')
    if collector:
        body += f'<g transform="translate(251 238)">{label("COLLECTOR", WHITE if reverse else GREEN, 40)}</g>'
    return body


def stacked(fg, reverse=False):
    return (f'<g transform="translate(126.4 8) scale(1.2)">{symbol(fg, reverse)}</g>'
            f'<g transform="translate(65.6 340) scale(1.25)">{wordmark(WHITE if reverse else INK if fg == GREEN else fg)}</g>')


def tile(radius=56, maskable=False):
    scale, tx, ty = (0.70, 38.4, 34.4) if maskable else (0.84, 20.48, 16.48)
    return (f'<rect width="256" height="256" rx="{radius}" fill="{GREEN}"/>'
            f'<g transform="translate({tx} {ty}) scale({scale})">{symbol(WHITE, True)}</g>')


def contrast(fg, bg):
    def luminance(h):
        values = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * weight for v, weight in zip(rgb, (.2126, .7152, .0722)))
    a, b = sorted((luminance(fg), luminance(bg)))
    return (b + .05) / (a + .05)


def main():
    for folder in ("logos", "web", "collector", "previews", "sources"):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    for name, fg, reverse in (
        ("color", GREEN, False),
        ("ink", INK, False),
        ("black", "#000000", False),
        ("white", WHITE, True),
        ("dark", WHITE, True),
    ):
        write(f"logos/parceo-symbol-{name}.svg", drawing("Parcéo — Sillage symbole " + name, symbol(fg, reverse)))
        write(f"logos/parceo-horizontal-{name}.svg", drawing("Parcéo — Sillage horizontal " + name, horizontal(fg, reverse), 623))
        write(f"logos/parceo-stacked-{name}.svg", drawing("Parcéo — Sillage vertical " + name, stacked(fg, reverse), 560, 512))
    for name, fg in (("ink", INK), ("white", WHITE), ("green", GREEN), ("black", "#000000")):
        write(f"logos/parceo-wordmark-{name}.svg", drawing("Parcéo — Sillage mot-symbole " + name, f'<g transform="translate(28 25)">{wordmark(fg)}</g>', 400, 160))
    write("logos/parceo-symbol-small.svg", drawing("Parcéo — symbole petites tailles", symbol(GREEN, small=True), 16, 16))
    write("web/favicon.svg", drawing("Parcéo — Sillage", f'<rect width="16" height="16" rx="3" fill="{GREEN}"/>{symbol(WHITE, small=True)}', 16, 16))
    for name, radius, maskable in (("app-icon", 0, False), ("maskable-icon", 0, True)):
        write(f"web/{name}.svg", drawing("Parcéo — icône application", tile(radius, maskable)))
    write("collector/parceo-collector.svg", drawing("Parcéo Collector", tile()))
    write("collector/parceo-collector-square.svg", drawing("Parcéo Collector — fond carré", tile(0)))
    write("collector/parceo-collector-horizontal.svg", drawing("Parcéo Collector — Sillage", horizontal(GREEN, collector=True), 623, 288))
    write("collector/parceo-collector-horizontal-dark.svg", drawing("Parcéo Collector — Sillage fond sombre", horizontal(WHITE, True, True), 623, 288))
    manifest = {"id": "/", "name": "Parcéo", "short_name": "Parcéo", "description": "Gestion du parc informatique", "lang": "fr", "start_url": "/", "scope": "/", "display": "standalone", "theme_color": GREEN, "background_color": PAPER, "icons": [
        {"src": "./icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "./maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    write("web/site.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    write("web/head-snippet.html", f'''<!-- Copy the web/ files to /assets/brand/parceo/web/ on parceo.piqa.fr. -->
<link rel="icon" href="/assets/brand/parceo/web/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/assets/brand/parceo/web/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="/assets/brand/parceo/web/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/assets/brand/parceo/web/site.webmanifest">
<meta name="theme-color" content="{GREEN}">
''')
    colors = {"green": GREEN, "ink": INK, "lime": LIME, "paper": PAPER, "white": WHITE, "muted": "#53665D", "border": "#D9E3DC", "controlBorder": "#789184", "success": "#176B45", "warning": "#855000", "danger": "#B42336"}
    tokens = {"brand": "Parcéo", "domain": "parceo.piqa.fr", "version": "2.0", "date": "2026-11-09", "tagline": "Votre parc, clairement.", "colors": colors, "typography": {"interface": "Manrope", "interfaceWeights": [400, 500, 600, 700, 800], "technical": "IBM Plex Mono", "technicalWeight": 400, "logo": "Sillage symbol, approved C; Manrope 600 outlined wordmark; no runtime font dependency"}, "spacingUnitPx": 4, "controlRadiusPx": 8, "panelRadiusPx": 16}
    write("tokens.json", json.dumps(tokens, ensure_ascii=False, indent=2) + "\n")
    pairs = [("Texte principal / blanc", INK, WHITE, 4.5), ("Texte secondaire / blanc", colors["muted"], WHITE, 4.5), ("Action blanche / vert", WHITE, GREEN, 4.5), ("Lien vert / papier", GREEN, PAPER, 4.5), ("Repère citron / vert", LIME, GREEN, 3), ("Repère citron / encre", LIME, INK, 3), ("Texte encre / citron", INK, LIME, 4.5), ("Bordure interactive / blanc", colors["controlBorder"], WHITE, 3), ("Succès / blanc", colors["success"], WHITE, 4.5), ("Réparation / blanc", colors["warning"], WHITE, 4.5), ("Erreur / blanc", colors["danger"], WHITE, 4.5)]
    checks = [{"usage": name, "foreground": fg, "background": bg, "ratio": round(contrast(fg, bg), 2), "minimum": minimum, "pass": contrast(fg, bg) >= minimum} for name, fg, bg, minimum in pairs]
    assert all(p["pass"] for p in checks), checks
    font_checks = []
    for path in sorted((ROOT / "fonts").glob("*.ttf")):
        font = TTFont(path)
        chars = "Parcéo ÀÂÄÆÇÉÈÊËÎÏÔÖÙÛÜŸŒàâäæçéèêëîïôöùûüÿœ€0123456789"
        missing = "".join(c for c in chars if ord(c) not in font.getBestCmap())
        assert not missing, (path, missing)
        font_checks.append({"file": path.name, "missingFrenchGlyphs": missing, "variableAxes": [{"tag": a.axisTag, "minimum": a.minValue, "maximum": a.maxValue} for a in font["fvar"].axes] if "fvar" in font else []})
        font.close()
    write("sources/color-and-font-checks.json", json.dumps({"contrastPairs": checks, "limeOnWhiteRatio": round(contrast(LIME, WHITE), 2), "limeUsage": "Background or accent on green/ink; never small text on white", "fonts": font_checks}, ensure_ascii=False, indent=2) + "\n")
    spec = {"brand": "Parcéo", "tagline": "Votre parc, clairement.", "brief": "Inventaire, collecte, affectations, valorisation et réparations du matériel informatique.", "adjectives": ["Précis", "Clair", "Fiable", "Accessible"], "criteria": "Un signe lisible en petit, un nom français conservé, des fichiers utilisables dans l’application et le collecteur.", "industry": "software", "mockups": ["website", "favicon-tab", "app-icon", "readme", "sticker", "box"], "nav": ["Inventaire", "Valorisation", "Réparations"], "brand_color": GREEN, "tile_color": GREEN, "greyscale": False, "final": True, "label": "Identité retenue", "designer": "Parcéo · Piqa", "round": 3, "concepts": [{"name": "Sillage", "symbol": "../logos/parceo-symbol-color.svg", "lockup": "../logos/parceo-horizontal-color.svg", "stacked": "../logos/parceo-stacked-color.svg", "symbol_on_tile": "../logos/parceo-symbol-dark.svg", "symbol_on_dark": "../logos/parceo-symbol-dark.svg", "lockup_on_dark": "../logos/parceo-horizontal-dark.svg", "stacked_on_tile": "../logos/parceo-stacked-dark.svg", "idea": "Un parc organisé, chaque équipement identifié.", "rationale": ["Un P continu, une contreforme ouverte et une terminaison à 45 degrés.", "Le symbole reste monochrome ; le citron ponctue les surfaces de l’identité.", "Mot-symbole Manrope 600 vectorisé et icône dédiée aux petites tailles."]}], "recommendation": "Direction C — Sillage choisie par le client. Maquettes illustratives ; aucune application ni URL de production modifiée.", "next_steps": ["Utiliser les masters fournis plutôt que redessiner le logo.", "Conserver les licences des polices lors de la redistribution."]}
    write("previews/presentation-spec.json", json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {len(list((ROOT / 'logos').glob('*.svg')))} logo masters, web/collector SVGs, tokens, checks and presentation spec.")
    print("Contrast:", ", ".join(f"{p['ratio']}:1" for p in checks))


if __name__ == "__main__":
    main()

