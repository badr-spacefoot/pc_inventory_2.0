// Local, synthetic audit only. Usage: bundled node frontend-fixture.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/badre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const harnessDirectory = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.SPACEFOOT_AUDIT_OUTPUT || harnessDirectory;
const root = resolve(harnessDirectory, '../../frontend');
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const target = resolve(root, relative);
    if (!target.startsWith(root + '/') && !target.startsWith(root + '\\')) throw new Error('outside root');
    const data = await readFile(target);
    res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml'})[extname(target)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const result = {date: new Date().toISOString(), syntheticOnly: true, externalRequestsBlocked: [], errors: [], checks: {}};
let browser;
try {
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { result.externalRequestsBlocked.push(url.origin); return route.abort(); }
    if (url.pathname.startsWith('/__fixture_api')) return route.fulfill({contentType:'application/json', body:JSON.stringify({teams:[], establishments:[], users:[], devices:[]})});
    if (url.pathname === '/fixture-script.ps1') return route.fulfill({body:'# synthetic fixture'});
    return route.continue();
  });
  await context.addInitScript(({origin}) => {
    window.IT_INVENTORY_API_URL = `${origin}/__fixture_api`;
    window.IT_INVENTORY_SCRIPT_URL = `${origin}/fixture-script.ps1`;
  }, {origin});
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  await page.goto(origin, {waitUntil:'networkidle'});
  result.checks.bootstrap = await page.evaluate(() => ({hasCore:!!window.SpacefootCore, hasApp:typeof renderDetail === 'function', title:document.title}));
  await page.evaluate(() => {
    state.currentAdmin = {id:'fixture-admin', role:'ADMIN', displayName:'Synthetic audit'};
    state.adminToken = 'synthetic-only-never-sent';
    state.language='en';
    document.querySelector('#admin-login').classList.add('is-hidden');
    document.querySelector('#admin-dashboard').classList.remove('is-hidden');
    setMainView('admin', {updateUrl:false}); applyPermissions();
    window.fixtureDevice = (id, status='active') => ({id, hostname:`Fixture ${id}`, manufacturer:'Dell', model:'Latitude 5420', status, os_name:'Windows 11', os_version:'24H2', release_year:2021, estimated_launch_price:1000, resale_value:300, ram_total_gb:16, cpu_benchmark_score:11000, last_seen_at:'2026-09-15T09:00:00Z', invoices:[], priceHistory:[]});
    state.devices=[window.fixtureDevice('A'), window.fixtureDevice('B'), window.fixtureDevice('S','stock')];
    applyFilters();
  });
  result.checks.xssInertMarker = await page.evaluate(() => {
    renderDetail(window.fixtureDevice('A'), [{collected_at:'2026-09-15', os_name:'<b id="audit-inert-marker">AUDIT MARKER</b>', os_version:'safe'}], []);
    return {htmlInterpreted:!!document.querySelector('#audit-inert-marker'), markerTag:document.querySelector('#audit-inert-marker')?.tagName, executablePayloadUsed:false};
  });
  assert.equal(result.checks.xssInertMarker.htmlInterpreted, false, 'scan HTML must remain inert text');
  result.checks.selectionRace = await page.evaluate(async () => {
    const original = inventoryApi.getDevice;
    const pending = {};
    inventoryApi.getDevice = id => new Promise(done => pending[id]=done);
    try {
      const a = selectDevice('A'); const b = selectDevice('B');
      pending.B({device:window.fixtureDevice('B'), scans:[], history:[]}); await b;
      pending.A({device:window.fixtureDevice('A'), scans:[], history:[]}); await a;
      return {selectedId:state.selectedDeviceId, detailId:state.selectedDetail.id, title:document.querySelector('#detail-title').textContent};
    } finally { inventoryApi.getDevice=original; }
  });
  assert.equal(result.checks.selectionRace.selectedId, 'B');
  assert.equal(result.checks.selectionRace.detailId, 'B');
  assert.equal(result.checks.selectionRace.title, 'Fixture B');
  result.checks.stockValuation = await page.evaluate(() => {
    document.querySelector('#filter-status').value='stock'; applyFilters(); setAdminView('valuation',{updateUrl:false});
    return {filteredIds:state.filtered.map(d=>d.id), metrics:document.querySelector('#valuation-metrics').innerText, replacementCandidates:fleetDomain.replacementCandidates(state.filtered,fleetEvaluationContext()).length};
  });
  await page.screenshot({path:resolve(out,'fixture-stock-desktop.png'),fullPage:true});
  await page.evaluate(() => {document.querySelector('#filter-status').value=''; applyFilters(); setAdminView('fleet',{updateUrl:false});});
  result.checks.keyboardDeviceRows = await page.locator('#devices-table tr').evaluateAll(rows => rows.map(row=>({id:row.dataset.id,tabIndex:row.tabIndex,role:row.getAttribute('role'),focusableChildren:row.querySelectorAll('a[href],button,input,select,[tabindex="0"]').length})));
  assert.ok(result.checks.keyboardDeviceRows.every(row => row.focusableChildren > 0));
  await page.evaluate(() => {
    window.fixtureOriginalGet = inventoryApi.getDevice;
    inventoryApi.getDevice = async id => ({device:window.fixtureDevice(id), scans:[], history:[]});
  });
  await page.locator('#devices-table tr[data-id="A"] button').press('Enter');
  result.checks.keyboardOpen = await page.evaluate(() => ({selected:state.selectedDeviceId,detail:state.selectedDetail.id}));
  assert.deepEqual(result.checks.keyboardOpen,{selected:'A',detail:'A'});
  await page.evaluate(() => {inventoryApi.getDevice=window.fixtureOriginalGet;});
  assert.deepEqual(result.checks.stockValuation.filteredIds, ['S']);
  assert.equal(result.checks.stockValuation.replacementCandidates,0);
  assert.match(result.checks.stockValuation.metrics, /300/);
  result.checks.languageDraft = await page.evaluate(() => {
    renderDetail(window.fixtureDevice('B'),[],[]);
    document.querySelector('#history-note-form textarea').value='Unsubmitted audit note';
    applyLanguage('fr');
    return {value:document.querySelector('#history-note-form textarea').value};
  });
  assert.equal(result.checks.languageDraft.value,'Unsubmitted audit note');
  result.checks.dialogNames = await page.locator('dialog').evaluateAll(dialogs => dialogs.map(d=>({id:d.id,label:document.getElementById(d.getAttribute('aria-labelledby'))?.textContent})));
  assert.ok(result.checks.dialogNames.every(d=>d.label));
  await page.evaluate(() => {
    window.fixtureNotificationCalls={read:0,open:0};
    window.fixtureNotificationOriginals={mark:inventoryApi.markNotificationRead,open:openNotificationTarget,load:loadNotifications};
    inventoryApi.markNotificationRead=async()=>{window.fixtureNotificationCalls.read++;return {};};
    openNotificationTarget=async()=>{window.fixtureNotificationCalls.open++;};
    loadNotifications=async()=>{};
    const root=document.createElement('div');root.id='audit-notification-fixture';
    root.innerHTML='<article class="notification-item" tabindex="0" data-id="fixture"><button class="mark-notification-read" data-id="fixture">Read</button></article>';
    document.body.append(root);bindNotificationList(root);
  });
  await page.locator('#audit-notification-fixture button').press('Enter');
  result.checks.notificationKeyboard=await page.evaluate(()=>({...window.fixtureNotificationCalls}));
  assert.deepEqual(result.checks.notificationKeyboard,{read:1,open:0});
  await page.evaluate(()=>{
    inventoryApi.markNotificationRead=window.fixtureNotificationOriginals.mark;
    openNotificationTarget=window.fixtureNotificationOriginals.open;
    loadNotifications=window.fixtureNotificationOriginals.load;
    document.querySelector('#audit-notification-fixture').remove();
  });
  result.checks.logoutPurge = await page.evaluate(() => {
    state.rawAccessTokens={fixture:'private-token'};
    localStorage.setItem('it_inventory_admin_token','fake');
    clearAdminSession();
    const check={devices:state.devices.length,detail:state.selectedDetail,tokens:Object.keys(state.rawAccessTokens).length,storedToken:localStorage.getItem('it_inventory_admin_token'),rows:document.querySelector('#devices-table').children.length};
    state.currentAdmin={id:'fixture',role:'ADMIN'};state.adminToken='fake';
    document.querySelector('#admin-dashboard').classList.remove('is-hidden');
    state.devices=[window.fixtureDevice('A')];applyFilters();
    return check;
  });
  assert.deepEqual(result.checks.logoutPurge,{devices:0,detail:null,tokens:0,storedToken:null,rows:0});
  result.checks.overflow=[];
  for (const width of [1440,375]) {
    await page.setViewportSize({width,height:1000});
    result.checks.overflow.push(await page.evaluate(() => ({viewport:innerWidth, documentWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth, overflowing:document.documentElement.scrollWidth>innerWidth+1})));
    await page.screenshot({path:resolve(out,`fixture-fleet-${width}.png`),fullPage:true});
  }
  assert.ok(result.checks.overflow.every(view=>!view.overflowing));
  assert.deepEqual(result.errors,[]);
  result.assertionsPassed=true;
} catch(error) { result.fatal=error.stack; process.exitCode=1; }
finally {
  if(browser) await browser.close();
  await new Promise(done=>server.close(done));
  result.externalRequestsBlocked=[...new Set(result.externalRequestsBlocked)];
  await writeFile(resolve(out,'frontend-fixture-results.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
