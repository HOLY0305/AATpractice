const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', m => console.log('[console]', m.text().slice(0, 300)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('xingce_uid_v2'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  await page.evaluate(() => {
    const oRender = XC.renderNav, oToast = XC.toast, oRoute = XC.route;
    window.__trace = [];
    XC.renderNav = (...a) => { window.__trace.push('renderNav'); try { return oRender(...a); } catch (e) { window.__trace.push('renderNav THROW ' + e.message); throw e; } };
    XC.toast = (...a) => { window.__trace.push('toast:' + a.join('|')); try { return oToast(...a); } catch (e) { window.__trace.push('toast THROW ' + e.message); throw e; } };
    XC.route = (...a) => { window.__trace.push('route'); try { return oRoute(...a); } catch (e) { window.__trace.push('route THROW ' + e.message); throw e; } };
  });
  await page.type('#g-name', '诊断丁');
  await page.click('#g-go');
  await sleep(1500);
  const d = await page.evaluate(() => ({
    trace: window.__trace,
    hasNavMe: !!document.querySelector('#nav-me'),
    user: window.XC.S.user && window.XC.S.user.name,
    hash: location.hash,
    appHead: document.querySelector('#app').innerHTML.slice(0, 60),
  }));
  console.log(JSON.stringify(d, null, 2));
  await page.close(); process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
