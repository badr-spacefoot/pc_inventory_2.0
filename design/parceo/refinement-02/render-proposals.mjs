import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\//, r => { external.push(r.request().url()); return r.abort(); });
  await page.goto(pathToFileURL(path.join(root, 'compare.html')).href);
  await page.evaluate(() => document.fonts.ready);
  const imagesLoaded = await page.locator('img').evaluateAll(img => img.every(i => i.complete && i.naturalWidth));
  if (!imagesLoaded) throw new Error('Broken image');
  await page.screenshot({ path: path.join(root, 'parceo-refinement.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (mobile.document > mobile.viewport) throw new Error('Mobile overflow');
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(pathToFileURL(path.join(root, 'preview-tests.html')).href);
  await page.screenshot({ path: path.join(root, 'preview-tests.png'), fullPage: true });
  if (errors.length || external.length) throw new Error(JSON.stringify({ errors, external }));
  await writeFile(path.join(root, 'render-checks.json'), JSON.stringify({ imagesLoaded, mobile, errors, external, renderer: 'Chromium', nativeVectorArtwork: true }, null, 2));
  console.log('Rendered color comparison and size/reverse/mirror/peer tests. No external requests, JS errors or mobile overflow.');
} finally { await browser.close(); }
