const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', m => console.log('[console]', m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(pin => sessionStorage.setItem('xingce_admin_pin', pin), '030520');
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(800);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'users').click(); });
  await sleep(300);
  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-enter]')].map(b => ({ id: b.dataset.enter, label: b.textContent.trim(), rowT: (b.closest('.list-row') || {}).textContent && b.closest('.list-row').querySelector('.t').textContent }));
    return { uid: XC.S.uid, btns, typeofSwitch: typeof XC.switchUser };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-enter]')].find(b => b.textContent.trim() === '进入');
    btn.click();
  });
  await sleep(1200);
  console.log('after click:', await page.evaluate(() => ({
    uid: XC.S.uid, user: XC.S.user && XC.S.user.name, hash: location.hash,
    ls: localStorage.getItem('xingce_uid_v2'),
  })));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
