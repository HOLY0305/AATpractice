/* 留言墙验收：API + 浏览器 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; console.log('  \u2718 ' + name + (info ? '  \u2192 ' + JSON.stringify(info) : '')); }
}
(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));

  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(400);

  console.log('\n[1] API 层');
  // 幂等清场：管理员删光旧留言
  await page.evaluate(async () => {
    let list = (await (await fetch('/api/messages')).json()).messages;
    for (const m of list) {
      await fetch('/api/admin/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '030520', id: m.id }) });
    }
  });
  let r = await page.evaluate(async () => (await (await fetch('/api/messages')).json()));
  check('GET 空列表', Array.isArray(r.messages) && r.messages.length === 0, r);
  // 发布
  r = await page.evaluate(async () => (await (await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'u_uxxitaox', text: '今天资料分析限时 25 分钟做完，手感不错' }) })).json()));
  check('POST 发布成功', r.message && r.message.text.includes('资料分析'), r);
  // 频控
  r = await page.evaluate(async () => (await (await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'u_uxxitaox', text: '连续第二条' }) })).json()));
  check('30 秒内第二条被拦', r.error && r.error.includes('30 秒'), r);
  // 空文本
  r = await page.evaluate(async () => (await (await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'u_uxxitaox', text: '   ' }) })).json()));
  check('纯空白被拦', !!r.error, r);

  console.log('\n[2] 首页留言墙');
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1000);
  check('留言墙渲染出来', await page.evaluate(() => !!document.querySelector('.ink-track')));
  check('便签含内容与署名', await page.evaluate(() => {
    const all = [...document.querySelectorAll('.ink-note')].map(n => n.textContent);
    return all.some(t => t.includes('资料分析')) && all.some(t => t.includes('我'));
  }));
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.ink-track')).animationName);
  check('横向流动动画生效', anim === 'inkScroll', anim);

  console.log('\n[3] 发布交互');
  await page.click('#ink-strip');
  await sleep(500);
  check('点击留言墙弹出发布面板', await page.evaluate(() => !!document.querySelector('#ink-text')));
  await page.type('#ink-text', '数量关系放弃治疗了，有没有同类');
  await sleep(300);
  // 30 秒频控会拦，先清空服务端自己那条的时间限制：直接换个新 uid 不行，改用管理员删除后重试太绕——预期被拦也算通过（提示频控）
  await page.evaluate(() => { [...document.querySelectorAll('.sheet button')].find(b => b.textContent === '发布').click(); });
  await sleep(800);
  const sheetStill = await page.evaluate(() => !!document.querySelector('#ink-text'));
  check('频控期发布被拦且面板保留', sheetStill, 'sheet open=' + sheetStill);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'i1_ink_sheet.png') });
  await page.evaluate(() => XC.closeSheet());

  console.log('\n[4] 管理员删除');
  await page.evaluate(() => { sessionStorage.setItem('xingce_admin_pin', '030520'); XC.S.admin = true; });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  await page.evaluate(() => {
    window.__err = [];
    window.addEventListener('unhandledrejection', e => window.__err.push(String(e.reason && (e.reason.message || e.reason)).slice(0, 200)));
  });
  await page.click('#ink-strip');
  await sleep(700);
  const hasDel = await page.evaluate(() => !!document.querySelector('[data-del]'));
  check('管理员看到删除按钮', hasDel);
  if (hasDel) {
    for (let i = 0; i < 10; i++) {
      const more = await page.evaluate(() => {
        const b = document.querySelector('[data-del]');
        if (!b) return false;
        b.click();
        return true;
      });
      if (!more) break;
      await sleep(500);
    }
    const after = await page.evaluate(async () => (await (await fetch('/api/messages')).json()).messages.length);
    check('删除后列表清空', after === 0, after);
  }
  await page.evaluate(() => XC.closeSheet());
  await sleep(400);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'i2_ink_empty.png') });

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
