"""Three original redesign studies; the first approved kit is preserved."""
from pathlib import Path
import html
import json
import re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
GREEN, INK, LIME = '#0B6E58', '#142D27', '#D6F279'
SHAPES = {
    'a': 'M40 32H160L224 96V104L160 168H96L40 224ZM96 72V128H144L176 96L152 72Z',
    'b': 'M40 32H144C194 32 224 62 224 108C224 154 194 184 144 184H88V224H40ZM176 76C166 66 156 62 144 62C116 62 100 80 100 108C100 136 116 154 144 154C158 154 170 148 180 138L160 118C156 122 150 126 144 126C132 126 124 120 124 108C124 96 132 90 144 90C150 90 156 94 160 98Z',
    'c': 'M56 224V92C56 52 84 28 128 28H152C192 28 220 56 220 96C220 136 192 164 152 164H116V128H148C171 128 184 116 184 96C184 76 171 64 148 64H128C104 64 92 76 92 96V188Z'
}
NAMES = {'a': 'Prisme', 'b': 'Jonction', 'c': 'Sillage'}

def svg(title, body, width=256, height=256):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title"><title id="title">{html.escape(title)}</title>{body}</svg>\n'

def path(shape, color):
    return f'<path fill="{color}" fill-rule="evenodd" d="{shape}"/>'

def outlined_word(text, weight):
    font = instantiateVariableFont(TTFont(ROOT.parent / 'identity/fonts/Manrope-Variable.ttf'), {'wght': weight}, inplace=False)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    position = 0
    for char in text:
        name = cmap[ord(char)]
        transform = (1, 0, 0, -1, position, 0)
        glyphs[name].draw(TransformPen(pen, transform))
        glyphs[name].draw(TransformPen(bounds, transform))
        position += glyphs[name].width
    x0, y0, x1, y1 = bounds.bounds
    scale = 110 / (y1-y0)
    commands = re.sub(r'-?\d+\.\d{3,}', lambda m: f'{float(m.group()):.2f}'.rstrip('0').rstrip('.'), pen.getCommands())
    return f'<g transform="translate({-x0*scale:.2f} {-y0*scale:.2f}) scale({scale:.6f})"><path d="{commands}"/></g>', (x1-x0)*scale

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for key, shape in SHAPES.items():
        word, width = outlined_word('PARCÉO' if key == 'a' else 'parcéo', 650 if key != 'c' else 600)
        for version in ('v1', 'v2'):
            drawing = shape
            if version == 'v2' and key == 'a':
                # Open the counter to avoid an overly heavy badge.
                drawing = drawing.replace('M96 72V128H144', 'M88 72V128H144')
            if version == 'v2' and key == 'b':
                # Replace the literal inner C (copyright-like) with a clean 45-degree gap.
                drawing = 'M40 32H152C194 32 224 60 224 100C224 140 194 168 152 168H112V128H148C171 128 184 118 184 100C184 82 171 72 148 72H88V104L40 152ZM40 184L88 136V224H40Z'
            if version == 'v2' and key == 'c':
                drawing = drawing.replace('H116V128', 'H120V128').replace('V188Z', 'V188L56 224Z')
            shift = (-10 if key == 'c' else -4) if version == 'v2' else 0
            for suffix, color in (('', GREEN), ('-black', '#111111'), ('-white', '#FFFFFF')):
                body = f'<g transform="translate({shift} 0)">{path(drawing, color)}</g>'
                (ROOT / f'concept-{key}-{version}{suffix}.svg').write_text(svg('Parcéo — '+NAMES[key], body), encoding='utf-8')
            lockup = f'<g transform="translate({shift} 8) scale(0.82)">{path(drawing, GREEN)}</g><g transform="translate(250 64)" fill="{INK}">{word}</g>'
            (ROOT / f'concept-{key}-lockup-{version}.svg').write_text(svg('Parcéo — '+NAMES[key], lockup, round(280+width)), encoding='utf-8')
    print('Built three redesign concepts, with two geometry passes and outlined wordmarks.')

if __name__ == '__main__':
    main()
