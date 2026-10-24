const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const failures = [];
  page.on('requestfailed', r => failures.push(r.url().slice(0, 100)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  // 找一份国考卷点进去
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.row, .list-row, a, [data-pid]')].find(x => x.textContent.includes('国家公务员'));
    if (!el) return null;
    el.click();
    return el.textContent.trim().slice(0, 50);
  });
  await sleep(1500);
  const state = await page.evaluate(() => ({
    hash: location.hash,
    fail: document.body.textContent.includes('试卷加载失败'),
    hasQ: !!document.querySelector('.q, .question, [class*=stem]'),
    head: document.body.textContent.slice(0, 120).replace(/\s+/g, ' '),
  }));
  console.log('clicked:', opened);
  console.log('state:', JSON.stringify(state, null, 2));
  console.log('failed requests:', failures.length ? failures : '无');
  await page.screenshot({ path: 'tools/shots5/h1_guokao_paper.png' });
  await page.close(); process.exit(state.fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
