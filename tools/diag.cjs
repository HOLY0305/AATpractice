const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  p.on('pageerror', e => console.log('PAGEERR:', e.message));
  await p.goto('http://localhost:3456/#/p/0304960e9d', { waitUntil: 'networkidle2' });
  await p.waitForSelector('#opts .opt', { timeout: 15000 });
  console.log('initial footer:', await p.evaluate(() => document.querySelector('.q-foot-inner')?.innerHTML.replace(/\s+/g, ' ').slice(0, 400)));
  await p.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
  await p.evaluate(() => document.querySelector('#opts .opt[data-l="D"]').click());
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate(() => document.querySelector('#btn-submit').click());
  await new Promise(r => setTimeout(r, 1500));
  console.log('after submit footer:', await p.evaluate(() => document.querySelector('.q-foot-inner')?.innerHTML.replace(/\s+/g, ' ').slice(0, 500)));
  console.log('has btn-next:', await p.evaluate(() => !!document.querySelector('#btn-next')));
  console.log('btn ids:', await p.evaluate(() => [...document.querySelectorAll('.q-foot button')].map(b => b.id + ':' + b.disabled)));
  await b.disconnect();
})().catch(e => console.error('FATAL', e.message));
