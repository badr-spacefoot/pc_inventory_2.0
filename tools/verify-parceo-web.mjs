// Exercise the actual app with synthetic data and local assets; no production requests.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.PARCEO_SITE_ROOT || 'frontend');
const out = resolve(process.env.PARCEO_VERIFY_OUTPUT || 'docs/operations/2026-11-09-sillage-integration');
await mkdir(out, { recursive: true });
const caddy = await readFile('deploy/vps/Caddyfile.static', 'utf8');
const csp = caddy.match(/Content-Security-Policy "([^"]+)"/)[1];
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = resolve(root, relative);
    assert.ok(target.startsWith(root + sep));
    response.setHeader('Content-Security-Policy', csp);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' })[extname(target)] || 'application/json');
    if (relative === 'config.js') { response.end('/* Synthetic local verification uses the init configuration. */'); return; }
    if (relative.startsWith('__fixture_api')) { response.end(JSON.stringify({ teams: [], establishments: [], users: [], devices: [], notifications: [], jobs: [] })); return; }
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const result = { syntheticOnly: true, productionRequests: 0, errors: [], cspViolations: [], blockedExternalOrigins: [], views: [], contrasts: [] };
let browser;
function contrast(a, b) {
  const luminance = value => { const v = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return v[0]*.2126+v[1]*.7152+v[2]*.0722; };
  const [low, high] = [luminance(a), luminance(b)].sort((a,b) => a-b); return (high+.05)/(low+.05);
}
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    result.blockedExternalOrigins.push(url.origin);
    return route.abort();
  });
  await context.addInitScript(origin => {
    window.IT_INVENTORY_API_URL = origin + '/__fixture_api';
    window.IT_INVENTORY_SCRIPT_URL = origin + '/scripts/collect-windows.ps1';
    localStorage.setItem('it_inventory_theme_preference', 'light');
    localStorage.setItem('it_inventory_language', 'fr');
    window.__brandCsp = [];
    document.addEventListener('securitypolicyviolation', event => window.__brandCsp.push({ directive: event.violatedDirective, uri: event.blockedURI }));
  }, origin);
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.load('400 16px Manrope'); await document.fonts.load('400 14px "IBM Plex Mono"'); await document.fonts.ready; });
  assert.match(await page.title(), /Parcéo/);
  result.fonts = await page.evaluate(() => [...document.fonts].map(font => ({ family: font.family, status: font.status })));
  assert.ok(result.fonts.every(font => font.status === 'loaded'));
  async function snapshot(name, theme, width = 1440) {
    await page.setViewportSize({ width, height: 1050 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.waitForTimeout(230);
    const view = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, logo: [...document.querySelectorAll('.brand-lockup img')].filter(image => getComputedStyle(image).display !== 'none').map(image => ({ file: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 })) }));
    assert.ok(view.content <= view.viewport + 1, `${name} overflows at ${width}: ${view.content}`);
    assert.equal(view.logo.length, 1);
    assert.ok(view.logo[0].loaded);
    assert.match(view.logo[0].file, new RegExp(theme === 'dark' ? 'logo-dark' : 'logo-light'));
    const colors = await page.locator('button.primary:visible, a.primary:visible').first().evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor })).catch(() => null);
    if (colors) { const ratio = contrast(colors.foreground, colors.background); assert.ok(ratio >= 4.5, `${name} primary contrast ${ratio}`); result.contrasts.push({ name, theme, ratio: +ratio.toFixed(2) }); }
    await page.screenshot({ path: resolve(out, `${name}-${theme}-${width}.png`), fullPage: true });
    result.views.push({ name, theme, ...view });
  }
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) await snapshot('collection', theme, width);
  await page.evaluate(() => {
    state.currentAdmin = { id: 'fixture', role: 'ADMIN', displayName: 'Recette Parcéo' };
    state.adminToken = 'synthetic-only';
    document.querySelector('#admin-login').classList.add('is-hidden');
    document.querySelector('#admin-dashboard').classList.remove('is-hidden');
    setMainView('admin', { updateUrl: false }); applyPermissions();
    state.teams = [{ id: 'team-it', name: 'IT · Démonstration', color: '#0B6E58' }];
    state.establishments = [{ id: 'lab', name: 'Laboratoire', color: '#0B6E58' }];
    state.devices = ['stock', 'active', 'in_repair'].map((status, index) => ({ id: `demo-${index}`, hostname: `PC-DEMO-00${index+1}`, manufacturer: 'Dell', model: 'Latitude 5420', serial_number: `DEMO000${index}`, status, os_name: 'Windows 11', os_version: '24H2', release_year: 2021, estimated_launch_price: 1000, resale_value: 300, ram_total_gb: 16, cpu_benchmark_score: 11000, last_seen_at: new Date().toISOString(), invoices: [], priceHistory: [] }));
    applyFilters(); renderOrganization(); renderAdminUsers(); renderNotifications();
  });
  for (const theme of ['light', 'dark']) {
    for (const section of ['fleet', 'organization', 'valuation', 'access', 'users', 'pending', 'notifications']) {
      await page.evaluate(section => setAdminView(section, { updateUrl: false }), section);
      await snapshot(section, theme);
    }
    await page.evaluate(() => { setAdminView('fleet', { updateUrl: false }); renderDetail(state.devices[0], [], []); });
    await snapshot('device-detail', theme);
    await page.evaluate(() => { document.querySelector('#device-detail-modal')?.close(); });
    for (const section of ['fleet', 'valuation', 'access']) {
      await page.evaluate(section => setAdminView(section, { updateUrl: false }), section);
      await snapshot(section, theme, 390);
    }
  }
  // The manifest must resolve to the same app root on a custom domain and Pages subpath.
  const manifest = await (await page.request.get(origin + '/assets/brand/parceo/site.webmanifest')).json();
  result.manifestRoots = ['https://parceo.piqa.fr/', 'https://example.test/pc_inventory_2.0/'].map(base => ({ base, start: new URL(manifest.start_url, new URL('assets/brand/parceo/site.webmanifest', base)).href }));
  assert.ok(result.manifestRoots.every(item => item.base === item.start));
  result.cspViolations = await page.evaluate(() => window.__brandCsp);
  assert.deepEqual(result.cspViolations, []);
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) { result.fatal = error.stack; process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
  result.blockedExternalOrigins = [...new Set(result.blockedExternalOrigins)];
  await writeFile(resolve(out, 'web-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, views: result.views.length, fonts: result.fonts, errors: result.errors, cspViolations: result.cspViolations, fatal: result.fatal }));
}
