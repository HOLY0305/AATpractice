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
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300), e.stack ? e.stack.split('\n')[1] : ''));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('xingce_uid_v2'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  console.log('gate visible:', await page.evaluate(() => !!document.querySelector('.gate-card')));
  await page.type('#g-name', '诊断乙');
  await page.type('#g-pass', 'abcd');
  await page.click('#g-go');
  await sleep(1200);
  const d = await page.evaluate(() => ({
    navHtml: (document.querySelector('#nav').innerHTML || '').slice(0, 150),
    hasNavMe: !!document.querySelector('#nav-me'),
    user: window.XC.S.user && window.XC.S.user.name,
    uid: window.XC.S.uid,
    hash: location.hash,
    appHead: document.querySelector('#app').innerHTML.slice(0, 80),
  }));
  console.log(JSON.stringify(d, null, 2));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
