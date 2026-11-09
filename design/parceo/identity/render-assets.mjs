// Render original SVG masters without AI raster generation or image editing.
// Set PLAYWRIGHT_MODULE to a file: URL when using an existing tool runtime.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage();
const blocked = [];
await context.route(/^https?:\/\//, route => {
  blocked.push(route.request().url());
  return route.abort();
});
const outputs = [];
async function render(source, output, width, height = width) {
  const raw = await readFile(path.join(root, source), 'utf8');
  const svg = raw.replace('<svg ', `<svg width="${width}" height="${height}" `);
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
  const target = path.join(root, output);
  await mkdir(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, omitBackground: true });
  outputs.push({ file: output, width, height, source });
}
try {
  for (const size of [16, 32, 48]) await render('web/favicon.svg', `web/favicon-${size}.png`, size);
  for (const size of [180, 192, 512]) await render('web/app-icon.svg', `web/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png`, size);
  await render('web/maskable-icon.svg', 'web/maskable-512.png', 512);
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await render('collector/parceo-collector.svg', `collector/parceo-collector-${size}.png`, size);
    if ([16, 32, 48, 64, 128, 256, 512, 1024].includes(size)) await render('collector/parceo-collector-square.svg', `collector/parceo-collector-square-${size}.png`, size);
  }
  for (const variant of ['color', 'ink', 'white', 'dark', 'black']) {
    await render(`logos/parceo-horizontal-${variant}.svg`, `logos/png/parceo-horizontal-${variant}-1246.png`, 1246, 512);
    await render(`logos/parceo-symbol-${variant}.svg`, `logos/png/parceo-symbol-${variant}-512.png`, 512);
  }
  await render('logos/parceo-stacked-color.svg', 'logos/png/parceo-stacked-color-1120.png', 1120, 1024);
  const uiErrors = [];
  page.on('pageerror', error => uiErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.goto(pathToFileURL(path.join(root, 'previews/identity-board.html')).href);
  await page.evaluate(async () => {
    await document.fonts.load('600 32px Manrope', 'Parcéo À affecter');
    await document.fonts.load('400 16px "IBM Plex Mono"', 'PC-0048 €');
    await document.fonts.ready;
  });
  const fonts = await page.evaluate(() => [...document.fonts].map(f => ({ family: f.family, status: f.status })));
  const images = await page.locator('img').evaluateAll(images => images.map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })));
  if (images.some(i => !i.loaded) || fonts.some(f => f.status !== 'loaded')) throw new Error('Missing board font/image');
  await page.screenshot({ path: path.join(root, 'previews/parceo-identity.png'), fullPage: true });
  const boardHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.pdf({ path: path.join(root, 'previews/parceo-identity.pdf'), width: '1280px', height: `${boardHeight}px`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'previews/parceo-identity-mobile.png'), fullPage: true });
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  if (mobile.content > mobile.viewport) throw new Error('Mobile board overflows');
  await page.goto(pathToFileURL(path.join(root, 'guide.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(root, 'guide-parceo.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await page.setViewportSize({ width: 701, height: 1032 });
  await page.emulateMedia({ media: 'print' });
  for (let i = 0; i < await page.locator('.page').count(); i++) {
    await page.locator('.page').nth(i).screenshot({ path: path.join(root, `previews/guide-page-${String(i + 1).padStart(2, '0')}.png`) });
  }
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const deckPath = path.join(root, 'previews/skill-presentation.html');
  const deck = (await readFile(deckPath, 'utf8')).replaceAll('https://parceo.com', 'https://parceo.piqa.fr');
  await writeFile(deckPath, deck);
  await page.goto(pathToFileURL(deckPath).href);
  await page.addStyleTag({ content: 'body{background:#fff}.slide{margin:0;box-shadow:none;min-height:800px}' });
  for (let i = 0; i < await page.locator('.slide').count(); i++) {
    await page.locator('.slide').nth(i).screenshot({ path: path.join(root, `previews/skill-slides/slide-${String(i + 1).padStart(2, '0')}.png`) });
  }
  if (uiErrors.length || blocked.length) throw new Error(JSON.stringify({ uiErrors, blocked }));
  await writeFile(path.join(root, 'sources/render-checks.json'), JSON.stringify({ renderer: 'Chromium via Playwright', generatedFromNativeSvg: true, externalRequests: blocked, uiErrors, boardFonts: fonts, boardImagesLoaded: images.length, mobile, outputs }, null, 2) + '\n');
  console.log(`Rendered ${outputs.length} PNG assets, board previews and PDFs; fonts/images loaded, no external requests, no mobile overflow.`);
} finally {
  await browser.close();
}
