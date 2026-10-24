/* README 补拍：积分商城 + 管理员后台 */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const { ensureEdge } = require(path.join(__dirname, 'edge.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:3456';

(async () => {
  await ensureEdge();
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 860, deviceScaleFactor: 2 });

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.setItem('xingce_uid_v2', 'u_g1n4l69t');
    sessionStorage.setItem('xingce_admin_pin', '8888');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  // 积分商城
  await page.goto(BASE + '/#/shop', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '08-shop.png') });
  console.log('📸 08-shop');

  // 管理员后台（总览）
  await page.goto(BASE + '/#/admin', { waitUntil: 'networkidle2' });
  await sleep(1800);
  await page.screenshot({ path: path.join(OUT, '09-admin.png') });
  console.log('📸 09-admin');

  await page.close().catch(() => {});
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
