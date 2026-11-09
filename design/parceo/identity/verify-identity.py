"""Verify the delivered identity assets. Requires Pillow; no edits to images."""
from pathlib import Path
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent


def main():
    pngs = list(ROOT.rglob('*.png'))
    for file in pngs:
        with Image.open(file) as image:
            image.verify()
    ico_sizes = sorted(w for w, h in Image.open(ROOT / 'collector/parceo-collector.ico').ico.sizes() if w == h)
    assert ico_sizes == [16, 24, 32, 48, 64, 128, 256]
    favicon_sizes = sorted(w for w, h in Image.open(ROOT / 'web/favicon.ico').ico.sizes() if w == h)
    assert favicon_sizes == [16, 32, 48]
    with Image.open(ROOT / 'collector/parceo-collector.icns') as image:
        mac_sizes = sorted({size[0]*size[2] for size in image.info['sizes']})
        image.load()
    assert mac_sizes == [16, 32, 64, 128, 256, 512, 1024]
    reference = Image.open(ROOT / 'previews/approved-symbol-reference.png').convert('RGBA')
    actual = Image.open(ROOT / 'logos/png/parceo-symbol-color-512.png').convert('RGBA')
    difference = ImageChops.difference(reference, actual)
    assert not any(band.getbbox() for band in difference.split()), 'Final symbol differs from approved C drawing'
    mask = Image.open(ROOT / 'web/maskable-512.png').convert('RGB')
    radius = max(((x-256)**2 + (y-256)**2)**.5 for y in range(512) for x in range(512) if mask.getpixel((x, y)) != (11,110,88))
    assert radius < 204.8
    audit = json.loads((ROOT / 'sources/svg-audit.json').read_text(encoding='utf-8-sig'))
    warnings = [finding for result in audit for finding in result['findings'] if finding['level'] in ('WARN', 'FAIL')]
    assert not warnings, warnings
    font_color = json.loads((ROOT / 'sources/color-and-font-checks.json').read_text(encoding='utf-8'))
    render = json.loads((ROOT / 'sources/render-checks.json').read_text(encoding='utf-8'))
    assert not render['uiErrors'] and not render['externalRequests']
    assert render['mobile']['viewport'] == render['mobile']['content']
    pdf_pages = {file.name: len(re.findall(rb'/Type /Page\b', file.read_bytes())) for file in ROOT.rglob('*.pdf')}
    assert pdf_pages == {'guide-parceo.pdf': 3, 'parceo-identity.pdf': 1}, pdf_pages
    ns = '{http://www.w3.org/2000/svg}'
    for folder in ('logos', 'collector', 'web'):
        for file in (ROOT / folder).glob('*.svg'):
            tree = ET.parse(file).getroot()
            assert tree.find(ns + 'title') is not None, file
            assert not any(tree.iter(ns + 'text')), file
            assert not any(tree.iter(ns + 'image')), file
    assert not list((ROOT / 'logos/png').glob('*1792.png')), 'Legacy wordmarks left in current kit'
    old_zip = ROOT.parents[2] / 'dist/parceo-identite-v1.0.zip'
    old_hash = hashlib.sha256(old_zip.read_bytes()).hexdigest()
    assert old_hash == 'c6ca0c10456dedf5f943dae5e5cbe138126e6c914ee9479f69b2dcae121ca411'
    summary = {
        'brand': 'Parcéo', 'version': '2.0', 'date': '2026-11-09', 'direction': 'C — Sillage, selected by the user',
        'approvedSymbolRasterMatchesFinalNormalSymbolExactly': True,
        'vectorMastersAudited': len(audit), 'svgWarningsOrFailures': warnings,
        'pngFilesDecodedAndVerified': len(pngs), 'logoVariants': len(list((ROOT / 'logos').glob('*.svg'))),
        'colorPairChecksPassed': sum(check['pass'] for check in font_color['contrastPairs']),
        'fontFamiliesWithFrenchGlyphCoverageChecked': len(font_color['fonts']),
        'faviconIcoSizes': favicon_sizes, 'collectorIcoSizes': ico_sizes, 'collectorIcnsPixelSizes': mac_sizes,
        'maskableIcon': {'canvasPx': 512, 'maximumPaintedSymbolRadiusPx': round(radius, 1), 'safeRadiusPx': 204.8, 'passed': True},
        'pdfPages': pdf_pages, 'browser': render,
        'visualInspection': ['Color identity board, desktop', 'Native collector icon and 16px favicon', 'Updated symbol size/reverse/mirror tests', 'Print guide layouts', 'Six-context presentation board'],
        'nativeOperatingSystemAcceptanceTested': False, 'printProofPerformed': False, 'trademarkClearancePerformed': False,
        'firstKitArchiveSha256': old_hash, 'applicationChanged': False, 'productionChanged': False, 'dnsChanged': False,
    }
    (ROOT / 'sources/validation-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Verified {len(audit)} SVGs, {len(pngs)} PNGs, ICO/ICNS sizes, 3-page guide and 1-page poster.')
    print('Approved C silhouette: exact pixel match. Maskable radius:', round(radius, 1), '/ 204.8. Version 1 archive unchanged.')


if __name__ == '__main__':
    main()
