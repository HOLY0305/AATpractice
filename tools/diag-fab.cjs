/* 诊断：fab 上是什么元素 + 合成 pointer 事件是否触发 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3456/#/', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.evaluate(() => { const p = document.querySelector('.paper'); if (p) p.click(); });
  await sleep(1000);
  const diag = await page.evaluate(() => {
    const f = document.querySelector('#ai-fab');
    if (!f) return { err: 'no fab' };
    const r = f.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    // 合成 pointer 事件测试 handler
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, clientX: cx, clientY: cy, isPrimary: true };
    f.dispatchEvent(new PointerEvent('pointerdown', opts));
    f.dispatchEvent(new PointerEvent('pointerup', opts));
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      hit: el ? (el.id || el.className || el.tagName) : 'null',
      hitIsFab: el === f || (el && f.contains(el)),
      panelHiddenAfterSynthClick: document.querySelector('#ai-panel').hidden,
      fabHidden: f.hidden,
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  // 真实鼠标点击
  await page.mouse.click(diag.rect.x + diag.rect.w / 2, diag.rect.y + diag.rect.h / 2);
  await sleep(400);
  console.log('after real click, panel hidden =', await page.evaluate(() => document.querySelector('#ai-panel').hidden));
  await page.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
