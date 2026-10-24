/* README 配图：真机截图核心页面 → docs/screenshots/ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { ensureEdge } = require(path.join(__dirname, 'edge.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3456';
const UID = 'u_g1n4l69t';

(async () => {
  await ensureEdge();
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 860, deviceScaleFactor: 2 });
  page.on('pageerror', e => {
    const sig = (e.stack || e.message || String(e));
    if (sig.includes('chrome-extension') || sig.includes('inject.js')) return;
    console.log('[pageerror]', sig.slice(0, 160));
  });

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('📸', name);
  };

  // 登录态注入
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(u => { localStorage.setItem('xingce_uid_v2', u); }, UID);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1000);

  // 1 首页
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(1500);
  await shot('01-home');

  // 2 做题页（2026 国考地市级资料分析，带材料）
  await page.goto(BASE + '/#/p/7f0bf7221b/0', { waitUntil: 'networkidle2' });
  await sleep(1800);
  await shot('02-paper');

  // 3 数据面板
  await page.goto(BASE + '/#/stats', { waitUntil: 'networkidle2' });
  await sleep(2600);
  await shot('03-stats');

  // 4 考点体系
  await page.goto(BASE + '/#/kb?tab=kp', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await shot('04-kb-points');

  // 5 知识导图
  await page.goto(BASE + '/#/kb?tab=graph', { waitUntil: 'networkidle2' });
  await sleep(2800);
  await shot('05-graph');

  // 6 材料精读（第 1 篇详情）
  await page.goto(BASE + '/#/kb?tab=mat&mat=1', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await shot('06-material');

  // 7 错题本
  await page.goto(BASE + '/#/wrong', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await shot('07-wrong');

  await page.close().catch(() => {});
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
