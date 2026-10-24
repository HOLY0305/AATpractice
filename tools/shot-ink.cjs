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
  await sleep(1200);
  const wall = await page.evaluate(() => {
    const w = document.querySelector('#ink-wall');
    return w ? w.getBoundingClientRect() : null;
  });
  await page.screenshot({ path: 'tools/shots5/i3_ink_wall.png', clip: { x: 0, y: 60, width: 1280, height: 420 } });
  // 手机宽度
  await page.setViewport({ width: 390, height: 844 });
  await sleep(800);
  await page.screenshot({ path: 'tools/shots5/i4_ink_mobile.png' });
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
