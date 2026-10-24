/* README 补拍：管理员后台（读取本机 config.json 的真实 PIN 解锁，PIN 不写入任何入库文件） */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { ensureEdge } = require(path.join(__dirname, 'edge.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:3456';
const PIN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8')).adminPin;

(async () => {
  await ensureEdge();
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 860, deviceScaleFactor: 2 });

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_g1n4l69t'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  // 走正规解锁：#/admin → 输 PIN → 解锁
  await page.goto(BASE + '/#/admin', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(pin => {
    const i = document.querySelector('#pin-input, input[type="password"]');
    if (i) {
      i.value = pin;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, PIN);
  const btn = await page.$('#pin-ok, .btn-primary');
  if (btn) await btn.click();
  await sleep(2000);
  // 切到用户标签（更有信息量）？保留总览即可
  await page.screenshot({ path: path.join(OUT, '09-admin.png') });
  console.log('📸 09-admin');

  await page.close().catch(() => {});
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
