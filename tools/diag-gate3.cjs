const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(400);
  const r = await page.evaluate(async () => {
    try {
      const a = await XC.api.post('/api/auth', { name: '诊断丙', pass: '' });
      XC.setUid(a.user.id);
      await XC.loadUser(a.user.id);
      XC.renderNav();
      return { step: 'ok', nav: !!document.querySelector('#nav-me') };
    } catch (e) { return { step: 'THROW', msg: String(e && e.message || e), stack: e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : '' }; }
  });
  console.log(JSON.stringify(r, null, 2));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
