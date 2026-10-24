const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(600);
  console.log('A. after goto:', await page.evaluate(() => ({
    ls: localStorage.getItem('xingce_uid_v2'),
    uid: XC.S.uid, user: XC.S.user && XC.S.user.name,
    gate: !!document.querySelector('.gate-card'), navMe: !!document.querySelector('#nav-me'),
  })));
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', JSON.stringify('u_uxxitaox')));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  console.log('B. after set+reload:', await page.evaluate(() => ({
    ls: localStorage.getItem('xingce_uid_v2'),
    uid: XC.S.uid, user: XC.S.user && XC.S.user.name,
    gate: !!document.querySelector('.gate-card'), navMe: !!document.querySelector('#nav-me'),
    users: XC.S.users.map(u => u.id + ':' + u.name),
  })));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
