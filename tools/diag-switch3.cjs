const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(400);
  await page.evaluate(() => sessionStorage.setItem('xingce_admin_pin', '030520'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'ai').click(); });
  await sleep(300);
  // 真实点击开关
  await page.click('#sw-ctx');
  await sleep(400);
  const after = await page.evaluate(() => {
    const sw = document.querySelector('#sw-ctx');
    const track = sw.nextElementSibling;
    return { checked: sw.checked, bg: getComputedStyle(track).backgroundColor,
             knob: getComputedStyle(track, '::after').transform };
  });
  console.log('after real click:', JSON.stringify(after));
  await page.screenshot({ path: require('path').join(__dirname, 'shots5', 'd2_switch_on.png'), clip: { x: 0, y: 150, width: 1080, height: 380 } });
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
