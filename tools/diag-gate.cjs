const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', m => console.log('[console]', m.text().slice(0, 120)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('xc_uid'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1200);
  const d = await page.evaluate(() => ({
    hash: location.hash,
    appHtml: document.querySelector('#app').innerHTML.slice(0, 200),
    booted: window.XC && XC.S ? XC.S.booted : null,
    uid: window.XC && XC.S ? XC.S.uid : null,
    users: window.XC && XC.S && XC.S.users ? XC.S.users.length : null,
  }));
  console.log(JSON.stringify(d, null, 2));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
