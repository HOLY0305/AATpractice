/* 诊断：管理后台 AI 页开关渲染 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => sessionStorage.setItem('xingce_admin_pin', '030520'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'ai').click(); });
  await sleep(300);
  const d = await page.evaluate(() => {
    const sw = document.querySelector('#sw-ctx');
    if (!sw) return { err: 'no #sw-ctx' };
    const label = sw.closest('label');
    const track = label.querySelector('.track');
    const lr = label.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    const cs = getComputedStyle(track);
    const field = sw.closest('.field');
    const fr = field.getBoundingClientRect();
    const card = sw.closest('.card');
    const cr = card.getBoundingClientRect();
    const before = getComputedStyle(track).background.slice(0, 60);
    // 模拟点击
    sw.checked = !sw.checked;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    const afterBg = getComputedStyle(track).background.slice(0, 60);
    return {
      labelRect: { x: lr.x, w: lr.width, h: lr.height },
      trackRect: { x: tr.x, w: tr.width, h: tr.height },
      trackBg: before, trackBgAfterToggle: afterBg,
      trackDisplay: cs.display, trackPos: cs.position,
      fieldW: fr.width, cardW: cr.width,
      labelRightGap: cr.right - lr.right,
      inputSibling: sw.nextElementSibling && sw.nextElementSibling.className,
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await page.screenshot({ path: require('path').join(__dirname, 'shots5', 'd1_switch_diag.png'), clip: { x: 0, y: 150, width: 1080, height: 420 } });
  await page.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
