const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);
  // 先造一条留言（绕过频控：直接改服务端文件？不行——用不同 uid。注册个临时用户来发）
  await page.evaluate(async () => {
    const a = await XC.api.post('/api/auth', { name: '墨迹测试员', pass: '' });
    await XC.api.post('/api/messages', { uid: a.user.id, text: '诊断留言一条' });
  });
  await sleep(300);
  await page.evaluate(() => { sessionStorage.setItem('xingce_admin_pin', '030520'); XC.S.admin = true; });
  await page.click('#ink-strip');
  await sleep(700);
  await page.evaluate(() => {
    window.__err = [];
    window.addEventListener('unhandledrejection', e => window.__err.push(String(e.reason && (e.reason.message || e.reason)).slice(0, 200)));
    const b = document.querySelector('[data-del]');
    console.log('del btn:', b && b.dataset.del, 'pin:', XC.pin(), 'admin:', XC.S.admin);
    if (b) b.click();
  });
  await sleep(1200);
  console.log('after:', await page.evaluate(() => ({
    errs: window.__err,
    count: null,
  })));
  const cnt = await page.evaluate(async () => (await (await fetch('/api/messages')).json()).messages.length);
  console.log('remaining:', cnt);
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
