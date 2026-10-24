/* 本轮验收：① 管理员入口（导航盾牌 + 我的→进入） ② AI 悬浮球拖动 ③ 模型列表拉取 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

function httpGet(url, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
async function ensureEdge() {
  try { await httpGet('http://127.0.0.1:9222/json/version'); return 'already'; }
  catch (e) { /* 需要启动 */ }
  const exe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const args = ['--headless=new', '--remote-debugging-port=9222',
    '--user-data-dir=' + path.join(__dirname, 'uds-fix'),
    '--disable-features=WebContentsForceDark', '--no-first-run', '--window-size=1280,900'];
  const child = spawn(exe, args, { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400));
    try { await httpGet('http://127.0.0.1:9222/json/version'); return 'spawned-' + child.pid; }
    catch (e) { /* 继续等 */ }
  }
  throw new Error('Edge CDP 启动失败');
}
const BASE = 'http://localhost:3456';
const OUT = path.join(__dirname, 'shots5');
fs.mkdirSync(OUT, { recursive: true });
const LOGF = path.join(OUT, 'run.txt');
fs.writeFileSync(LOGF, '');
const _log = console.log.bind(console);
console.log = (...a) => { _log(...a); fs.appendFileSync(LOGF, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; console.log('  \u2718 ' + name + (info ? '  \u2192 ' + JSON.stringify(info) : '')); }
}
const PIN = '8888';
const U = process.env.WU || 'u_uxxitaox';

(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 160)));

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(uid => localStorage.setItem('xc_uid', JSON.stringify(uid)), U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);

  /* ---------- 1. 管理员入口 ---------- */
  console.log('\n[1] 管理员入口');
  check('顶部导航有盾牌按钮 #nav-admin', await page.$('#nav-admin') !== null);
  await page.click('#nav-admin');
  await sleep(500);
  check('点击盾牌进入 #/admin', await page.evaluate(() => location.hash === '#/admin'));
  check('未解锁时显示 PIN 锁屏', await page.evaluate(() => !!document.querySelector('#pin')));
  await page.screenshot({ path: path.join(OUT, 'a1_admin_lock.png') });

  // 解锁后盾牌高亮
  await page.evaluate(pin => sessionStorage.setItem('xingce_admin_pin', pin), PIN);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  check('解锁后管理页正常渲染（有 #tabs）', await page.evaluate(() => !!document.querySelector('#tabs')));
  check('解锁后盾牌高亮 nav-admin-on', await page.evaluate(() => document.querySelector('#nav-admin').classList.contains('nav-admin-on')));

  // 我的页：进入按钮直达 #/admin
  await page.goto(BASE + '/#/me', { waitUntil: 'networkidle2' });
  await sleep(500);
  check('「我的」有管理界面行', await page.evaluate(() => {
    const el = [...document.querySelectorAll('.field-label')].find(x => x.textContent === '管理界面');
    return !!el;
  }));
  await page.click('#btn-admin-in');
  await sleep(500);
  check('点「进入」直达 #/admin', await page.evaluate(() => location.hash === '#/admin'));
  await page.screenshot({ path: path.join(OUT, 'a2_admin_overview.png') });

  /* ---------- 2. AI 悬浮球拖动 ---------- */
  console.log('\n[2] AI 悬浮球拖动');
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle2' });
  await sleep(400);
  // 进一张卷子让 fab 出现
  await page.evaluate(() => { const p = document.querySelector('.paper'); if (p) p.click(); });
  await sleep(900);
  const fabVisible = await page.evaluate(() => { const f = document.querySelector('#ai-fab'); return f && !f.hidden; });
  check('答题页 AI 悬浮球可见', fabVisible);
  if (fabVisible) {
    // 拖动：从当前位置移动 (+180, -120)
    const before = await page.evaluate(() => {
      const f = document.querySelector('#ai-fab');
      const r = f.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 60, before.y - 40, { steps: 4 });
    await page.mouse.move(before.x + 180, before.y - 120, { steps: 6 });
    await page.mouse.up();
    await sleep(200);
    const after = await page.evaluate(() => {
      const f = document.querySelector('#ai-fab');
      const r = f.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: f.className, ls: localStorage.getItem('xingce_ai_fab_v1') };
    });
    const exL = Math.min(Math.max(4, before.x - 43.5 + 180), 1280 - 87 - 4); // 右缘应被钳制
    const exT = Math.min(Math.max(4, before.y - 20.5 - 120), 900 - 41 - 4);
    check('拖动后位置改变（含边界钳制）', Math.abs(after.x - 43.5 - exL) < 8 && Math.abs(after.y - 20.5 - exT) < 8, { before, after, exL, exT });
    check('拖动后加了 dragged 类', /dragged/.test(after.cls), after.cls);
    check('位置已持久化到 localStorage', !!after.ls && after.ls.includes('left'), after.ls);
    // 刷新后位置恢复
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(800);
    const restored = await page.evaluate(() => {
      const f = document.querySelector('#ai-fab');
      if (!f || f.hidden) return null;
      const r = f.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: f.className };
    });
    if (restored) {
      check('刷新后悬浮球位置恢复', Math.abs(restored.x - after.x) < 10 && Math.abs(restored.y - after.y) < 10, { restored, after });
      check('刷新后仍有 dragged 类', /dragged/.test(restored.cls));
    } else check('刷新后悬浮球位置恢复', false, 'fab hidden');
    await page.screenshot({ path: path.join(OUT, 'b1_fab_dragged.png') });

    // 点击（不移动）应展开面板
    const pos = await page.evaluate(() => {
      const r = document.querySelector('#ai-fab').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(pos.x, pos.y);
    await sleep(400);
    check('单击悬浮球展开面板', await page.evaluate(() => !document.querySelector('#ai-panel').hidden));
    // 点关闭收成球
    await page.click('#ai-close');
    await sleep(300);
    check('点 × 收起为悬浮球', await page.evaluate(() => document.querySelector('#ai-panel').hidden));
    await page.screenshot({ path: path.join(OUT, 'b2_fab_collapsed.png') });
  }

  /* ---------- 3. 模型列表拉取 ---------- */
  console.log('\n[3] 模型列表拉取');
  // 管理后台 AI 页（上面已解锁）
  await page.goto(BASE + '/#/admin', { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'ai').click(); });
  await sleep(400);
  check('AI 页有「获取模型列表」按钮', await page.evaluate(() => !!document.querySelector('#btn-fetch-models')));
  await page.click('#btn-fetch-models');
  await sleep(2500);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#model-chips [data-m]')].map(b => b.dataset.m));
  check('点按钮后出现模型 chips', chips.length > 0, chips);
  if (chips.length) {
    await page.evaluate(() => { document.querySelector('#model-chips [data-m]').click(); });
    const filled = await page.evaluate(() => document.querySelector('#ai-model').value);
    check('点 chip 自动填入模型名', filled === chips[0], { filled, expect: chips[0] });
  }
  await page.screenshot({ path: path.join(OUT, 'c1_admin_models.png') });

  // 我的页自定义 AI 也应有按钮（切到 custom）
  await page.goto(BASE + '/#/me', { waitUntil: 'networkidle2' });
  await sleep(400);
  await page.evaluate(() => { document.querySelector('#ai-seg button[data-v="custom"]').click(); });
  await sleep(400);
  check('「我的」自定义 AI 有获取模型列表按钮', await page.evaluate(() => !!document.querySelector('#btn-ai-models')));
  await page.screenshot({ path: path.join(OUT, 'c2_me_models.png') });

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
