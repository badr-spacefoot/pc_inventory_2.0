import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/badre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('.');
const site=await mkdtemp(join(tmpdir(),'parc-csp-smoke-'));
const result={syntheticOnly:true,errors:[],violations:[],mockedExternal:[]};
const caddy=await readFile(join(root,'deploy/vps/Caddyfile.static'),'utf8');
const csp=caddy.match(/Content-Security-Policy "([^"]+)"/)[1];
execFileSync(process.execPath,[join(root,'scripts/package-site.mjs'),site],{env:{...process.env,IT_INVENTORY_API_URL:'https://parc-api.piqa.fr/functions/v1/inventory-api',IT_INVENTORY_SCRIPT_URL:'https://parc.piqa.fr/scripts/collect-windows.ps1'},stdio:'pipe'});
const server=createServer(async(req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/+/, '') || 'index.html';
  const path=resolve(site,relative);
  if(!path.startsWith(site)) {res.writeHead(403);return res.end();}
  try {const content=await readFile(path);res.setHeader('Content-Security-Policy',csp);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(content);}catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
    if(url.origin==='https://parc.piqa.fr') {
      const path=resolve(site,url.pathname.replace(/^\/+/, '')||'index.html');
      if(!path.startsWith(site))return route.abort();
      try{return route.fulfill({body:await readFile(path),headers:{'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(path)]||'text/plain'}});}catch{return route.fulfill({status:404,body:'not found'});}
    }
    result.mockedExternal.push(url.origin);
    if(url.origin==='https://parc-api.piqa.fr') return route.fulfill({contentType:'application/json',body:'{"teams":[],"establishments":[],"users":[]}'});
    if(url.origin==='https://parc.piqa.fr') return route.fulfill({contentType:'text/plain',body:'# fixture'});
    if(url.origin==='https://api.open-meteo.com') return route.fulfill({contentType:'application/json',body:'{"current":{}}'});
    if(['https://www.openstreetmap.org','https://www.google.com'].includes(url.origin)) return route.fulfill({contentType:'text/html',body:'<html><body>Mock map</body></html>'});
    return route.abort();
  });
  await context.addInitScript(()=>{window.auditViolations=[];document.addEventListener('securitypolicyviolation',event=>window.auditViolations.push({directive:event.violatedDirective,blocked:event.blockedURI}));});
  const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
  await page.goto('https://parc.piqa.fr',{waitUntil:'networkidle'});
  result.boot=await page.evaluate(()=>({core:!!window.SpacefootCore,api:window.SpacefootCore.config.apiBaseUrl,script:window.SpacefootCore.config.scriptUrl,hasApp:typeof renderDevices==='function'}));
  await page.evaluate(()=>{
    state.currentAdmin={role:'ADMIN',id:'synthetic'};
    document.querySelector('#admin-dashboard').classList.remove('is-hidden');setMainView('admin',{updateUrl:false});setAdminView('organization',{updateUrl:false});
    const form=document.querySelector('#establishment-form');form.elements.latitude.value='48.85';form.elements.longitude.value='2.35';
    renderEstablishmentMap();
    const iframe=document.querySelector('#establishment-map iframe');if(iframe)iframe.loading='eager';
  });
  await page.waitForLoadState('networkidle');
  result.violations=await page.evaluate(()=>window.auditViolations);
  assert.equal(result.boot.core,true);assert.equal(result.boot.hasApp,true);
  assert.equal(result.boot.api,'https://parc-api.piqa.fr/functions/v1/inventory-api');
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.violations,[]);
  result.passed=true;
}catch(error){result.fatal=error.stack;process.exitCode=1;}
finally{
  if(browser)await browser.close();await new Promise(done=>server.close(done));
  if(!site.startsWith(join(tmpdir(),'parc-csp-smoke-')))throw new Error('Unexpected cleanup path');
  await rm(site,{recursive:true,force:true});
  result.mockedExternal=[...new Set(result.mockedExternal)];
  await writeFile(process.env.SPACEFOOT_CSP_RESULT || join(root,'docs/audit-2026-09-15/packaged-csp-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
