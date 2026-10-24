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
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { sessionStorage.setItem('xingce_admin_pin', '030520'); window.XC.S.admin = true; });
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(800);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'users').click(); });
  await sleep(400);
  await page.screenshot({ path: 'tools/shots5/g1_users_enter.png' });
  await page.goto('http://localhost:3456/#/me', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.screenshot({ path: 'tools/shots5/g2_me_identity.png' });
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
