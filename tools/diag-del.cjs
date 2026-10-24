const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 250)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300), e.stack ? e.stack.split('\n').slice(1,3).join(' | ') : ''));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { sessionStorage.setItem('xingce_admin_pin', '030520'); window.XC.S.admin = true; });
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(800);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'users').click(); });
  await sleep(300);
  await page.evaluate(() => {
    window.__err = [];
    window.addEventListener('unhandledrejection', e => window.__err.push(String(e.reason && (e.reason.message || JSON.stringify(e.reason))).slice(0, 300)));
    const btn = [...document.querySelectorAll('[data-rmuser]')].find(b => b.closest('.list-row').querySelector('.t').textContent.includes('验收小明'));
    console.log('rmuser btn found:', !!btn, btn && btn.dataset.rmuser);
    if (btn) btn.click();
  });
  await sleep(500);
  console.log('sheet open:', await page.evaluate(() => ({
    overlayHidden: document.querySelector('#overlay').hidden,
    sheetHtml: (document.querySelector('#overlay').innerHTML || '').slice(0, 300),
    errs: window.__err,
  })));
  await page.evaluate(() => {
    const del = [...document.querySelectorAll('.sheet .btn-danger, .sheet-actions .btn-danger')].find(b => /删除/.test(b.textContent));
    console.log('del btn found:', !!del);
    if (del) del.click();
  });
  await sleep(1200);
  console.log('after del:', await page.evaluate(() => ({
    gone: ![...document.querySelectorAll('.list-row .t')].some(t => t.textContent.includes('验收小明')),
    errs: window.__err,
  })));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
