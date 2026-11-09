"""Build original, font-independent Parcéo concept SVGs; no app changes."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parent

def svg(name, body, width=256, version="v1"):
    title = escape("Parcéo — " + name)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 256" '
            f'role="img" aria-labelledby="title"><title id="title">{title}</title>'
            f'<desc>Exploration {version}, formes originales dessinées en chemins.</desc>'
            f'<g fill="#111111">{body}</g></svg>\n')

def wordmark():
    # Original lowercase geometric drawing: p / a / r / c / é / o.
    return '''<path fill-rule="evenodd" d="M0 40H36C58 40 72 54 72 76C72 98 58 112 36 112H18V144H0ZM18 56V96H34C47 96 54 89 54 76C54 63 47 56 34 56Z"/>
<path fill-rule="evenodd" d="M120 38C141 38 156 53 156 75V110H138V102C132 109 125 112 115 112C96 112 84 97 84 76C84 54 98 38 120 38ZM120 54C108 54 102 63 102 76C102 89 108 96 120 96C132 96 138 88 138 75C138 62 132 54 120 54Z"/>
<path d="M174 110V40H192V50C198 42 206 38 218 38V56C200 55 192 64 192 80V110Z"/>
<path d="M294 48L283 61C277 56 272 54 266 54C253 54 246 62 246 75C246 89 253 96 266 96C273 96 279 93 284 88L295 101C287 108 278 112 265 112C242 112 228 97 228 75C228 53 243 38 265 38C277 38 287 42 294 48Z"/>
<path fill-rule="evenodd" d="M378 80H326C328 91 335 97 346 97C355 97 361 94 367 89L377 101C369 108 359 112 345 112C322 112 307 97 307 75C307 53 322 38 343 38C367 38 379 54 378 80ZM326 66H360C358 57 352 53 343 53C335 53 329 57 326 66Z"/>
<path d="M332 26L354 4H374L352 26Z"/>
<path fill-rule="evenodd" d="M427 38C450 38 465 53 465 75C465 97 450 112 427 112C404 112 389 97 389 75C389 53 404 38 427 38ZM427 54C414 54 407 62 407 75C407 89 414 96 427 96C440 96 447 89 447 75C447 62 440 54 427 54Z"/>'''

def repere(version):
    gap = 16 if version == "v1" else 24
    return ('''<path fill-rule="evenodd" d="M40 32H152C192 32 216 56 216 96C216 136 192 160 152 160H80V224H40ZM80 72V120H148C166 120 176 112 176 96C176 80 166 72 148 72Z"/>'''
            f'<path d="M{152 if version == "v1" else 176} {160 + gap}H216V224H{152 if version == "v1" else 176}Z"/>')

def passage(version):
    top, bottom = (96, 160) if version == "v1" else (88, 168)
    body = (f'<path d="M216 {top}H176V80C176 74 174 72 168 72H88C78 72 72 78 72 88V168C72 178 78 184 88 184H168C174 184 176 182 176 176V{bottom}H216V176C216 206 198 224 168 224H88C54 224 32 202 32 168V88C32 54 54 32 88 32H168C198 32 216 50 216 80Z"/>'
            '<path d="M176 112H216V144H176Z"/>')
    return body if version == "v1" else '<g transform="translate(4 0)">' + body + '</g>'

def accent(version):
    # A custom open e, plus a broad 45-degree acute accent.
    return '''<path fill-rule="evenodd" d="M224 144H76C82 174 100 192 130 192C151 192 170 184 185 168L211 193C191 214 163 226 129 226C72 226 36 190 36 134C36 79 73 42 128 42C190 42 225 80 224 144ZM76 112H184C178 88 159 76 129 76C102 76 84 88 76 112Z"/>
<path d="M106 24L146 -16H186L146 24Z"/>'''.replace('L146 -16H186', 'L138 -8H178') if version == "v1" else '''<g transform="translate(16 20) scale(0.84)"><path fill-rule="evenodd" d="M224 152H76C82 180 101 196 130 196C151 196 170 188 185 172L211 198C191 218 163 230 129 230C72 230 36 194 36 138C36 83 73 46 128 46C190 46 225 86 224 152ZM76 120H184C178 94 159 80 129 80C102 80 84 94 76 120Z"/>
<path d="M110 24L134 0H174L150 24Z"/></g>'''

if __name__ == "__main__":
    for version in ("v1", "v2"):
        for key, name, body in (
            ("a", "Le repère", repere(version)),
            ("b", "Le passage", passage(version)),
            ("c", "L’accent", accent(version)),
        ):
            (ROOT / f"concept-{key}-{version}.svg").write_text(svg(name, body, version=version), encoding="utf-8")
            lockup = f'<g transform="translate(0 8) scale(0.82)">{body}</g><g transform="translate(256 34) scale(1.28)">{wordmark()}</g>'
            (ROOT / f"concept-{key}-lockup-{version}.svg").write_text(svg(name, lockup, width=896, version=version), encoding="utf-8")
    (ROOT / "parceo-wordmark-study.svg").write_text(svg("Mot-symbole dessiné", f'<g transform="translate(16 24) scale(1.4)">{wordmark()}</g>', width=688), encoding="utf-8")
    print("Created 13 original SVG studies; no third-party font dependency.")
