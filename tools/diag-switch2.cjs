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
  const d = await page.evaluate(() => {
    const sw = document.querySelector('#sw-ctx');
    sw.checked = true;
    const matches = sw.matches(':checked');
    const track = sw.nextElementSibling;
    const ruleApplies = track.matches('.switch input:checked + .track');
    // 找出所有涉及 .track 背景的规则
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch (e) { continue; }
      for (const r of list) {
        if (r.selectorText && /track/.test(r.selectorText)) rules.push(r.selectorText + ' { ' + (r.style.background || r.style.cssText.slice(0,80)) + ' }');
      }
    }
    return { swChecked: sw.checked, matches, ruleApplies, trackBg: getComputedStyle(track).backgroundColor, rules };
  });
  console.log(JSON.stringify(d, null, 2));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
