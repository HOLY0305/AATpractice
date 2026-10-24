/* 本轮验收：广东置顶 + 管理员三项 + AI 悬浮窗 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:3456';
const OUT = path.join(__dirname, 'shots4');
fs.mkdirSync(OUT, { recursive: true });
const LOGF = path.join(OUT, 'run.txt');
fs.writeFileSync(LOGF, '');
const _log = console.log.bind(console);
console.log = (...a) => { _log(...a); fs.appendFileSync(LOGF, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (info ? '  → ' + JSON.stringify(info) : '')); }
}
const PIN = '8888';
const U = process.env.WU || 'u_uxxitaox';

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 200)));

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(uid => localStorage.setItem('xc_uid', JSON.stringify(uid)), U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);

  /* ---------- 1. 广东置顶 ---------- */
  const gd = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.paper .ttl')].slice(0, 10).map(e => e.textContent);
    return t;
  });
  check('首页前几条都是广东卷', gd.length > 0 && gd.slice(0, 5).every(t => t.includes('广东')), gd);
  check('其他卷仍在（搜索可找到）', await page.evaluate(() => {
    const input = document.querySelector('#f-q');
    input.value = '安徽';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise(r => setTimeout(() => {
      const n = document.querySelectorAll('.paper').length;
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
      r(n > 0);
    }, 400));
  }));
  await page.screenshot({ path: path.join(OUT, 'a1_home_gd.png') });

  /* ---------- 2. 管理员：改 PIN ---------- */
  await page.goto(BASE + '/#/admin', { waitUntil: 'networkidle2' });
  await sleep(500);
  const authed = await page.evaluate(async pin => {
    const r = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    return (await r.json()).ok;
  }, PIN);
  check('默认 PIN 8888 可解锁', authed);
  await page.evaluate(pin => sessionStorage.setItem('xingce_admin_pin', pin), PIN);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);

  // 改 PIN 8888 -> 2468
  await page.evaluate(async (oldPin, newPin) => {
    const r = await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: oldPin, patch: { adminPin: newPin } }) });
    return r.status;
  }, PIN, '2468');
  const oldFail = await page.evaluate(async pin => {
    const r = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    return !(await r.json()).ok;
  }, '8888');
  const newOk = await page.evaluate(async pin => {
    const r = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    return (await r.json()).ok;
  }, '2468');
  check('旧 PIN 失效', oldFail);
  check('新 PIN 2468 生效', newOk);
  // 改回
  await page.evaluate(async (oldPin, newPin) => {
    await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: oldPin, patch: { adminPin: newPin } }) });
  }, '2468', PIN);
  const backOk = await page.evaluate(async pin => {
    const r = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    return (await r.json()).ok;
  }, PIN);
  check('已改回 8888', backOk, PIN);

  /* ---------- 3. 管理员：新增商品（走真实 UI 路径 XC.admin） ---------- */
  const before = await page.evaluate(() => fetch('/api/bootstrap').then(r => r.json()).then(j => j.config.shop.length));
  await page.evaluate(pin => XC.admin('shop', { action: 'add', item: { name: '验收临时商品', desc: '验收', cost: 1, stock: 1, label: '测', enabled: true } }), PIN);
  const after = await page.evaluate(() => XC.S.config.shop);
  check('新增商品成功', after.length === before + 1, { before, after: after.length });
  const tmpId = (after.find(x => x.name === '验收临时商品') || {}).id;
  // 商城页可见（SPA 内导航，验证内存配置已同步）
  await page.goto(BASE + '/#/shop', { waitUntil: 'networkidle2' });
  await sleep(600);
  const shopVisible = await page.evaluate(() => document.body.textContent.includes('验收临时商品'));
  check('新商品立即出现在商城页', shopVisible);
  // 清理
  await page.evaluate(async (pin, id) => {
    await fetch('/api/admin/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, action: 'remove', item: { id } }) });
  }, PIN, tmpId);
  check('临时商品已删除', await page.evaluate(() => fetch('/api/bootstrap').then(r => r.json()).then(j => !j.config.shop.some(x => x.name === '验收临时商品'))));

  /* ---------- 4. 管理员：调整积分 ---------- */
  const bal0 = await page.evaluate(uid => fetch('/api/users/' + uid).then(r => r.json()).then(j => j.user.points.balance), U);
  await page.evaluate(async (pin, uid) => {
    await fetch('/api/admin/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, uid, delta: 50, reason: '验收调整' }) });
  }, PIN, U);
  const bal1 = await page.evaluate(uid => fetch('/api/users/' + uid).then(r => r.json()).then(j => j.user.points.balance), U);
  check('调分 +50 生效', bal1 === bal0 + 50, { bal0, bal1 });
  await page.evaluate(async (pin, uid) => {
    await fetch('/api/admin/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, uid, delta: -50, reason: '验收还原' }) });
  }, PIN, U);
  check('已还原', await page.evaluate((uid, b) => fetch('/api/users/' + uid).then(r => r.json()).then(j => j.user.points.balance === b), U, bal0));

  /* ---------- 5. AI 悬浮窗 ---------- */
  // 先把测试用户的 AI 模式恢复为「跟随全局」（此前验收遗留 off），并刷新页面
  await page.evaluate(uid => fetch('/api/users/' + uid + '/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { aiMode: 'inherit' } }),
  }), U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);
  const tx = await page.evaluate(() => fetch('/data/index.json').then(r => r.json()).then(j => {
    const p = j.find(x => x.module === '05');
    return p.id;
  }));
  await page.goto(BASE + '/#/p/' + tx, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });
  await sleep(400);
  const fab = await page.evaluate(() => ({ visible: !document.querySelector('#ai-fab').hidden, txt: document.querySelector('#ai-fab').textContent }));
  check('答题页出现 AI 悬浮按钮', fab.visible, fab);

  await page.evaluate(() => document.querySelector('#ai-fab').click());
  await sleep(400);
  const panel = await page.evaluate(() => ({
    open: !document.querySelector('#ai-panel').hidden,
    empty: !!document.querySelector('.ai-empty'),
    quick: document.querySelectorAll('.ai-q').length,
  }));
  check('面板打开且显示欢迎语', panel.open && panel.empty, panel);
  check('快捷提问渲染', panel.quick >= 3, panel);

  // 发送（走 mock 流式）
  await page.type('#ai-text', '这道题的思路是什么？', { delay: 8 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ai-msg').length >= 2, { timeout: 15000 });
  const t0 = Date.now();
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.ai-msg.assistant .ai-bubble')].pop();
    return b && b.textContent.length > 30;
  }, { timeout: 15000 });
  const took = Date.now() - t0;
  const reply = await page.evaluate(() => [...document.querySelectorAll('.ai-msg.assistant .ai-bubble')].pop().textContent);
  check('流式回复到达（>30字）', reply.length > 30, { len: reply.length, ms: took });
  check('mock 回复包含演示标记', reply.includes('演示模式'), reply.slice(0, 50));
  await page.screenshot({ path: path.join(OUT, 'a2_ai_chat.png') });

  // 多轮：再问一句，历史保留
  await page.type('#ai-text', '再详细一点', { delay: 8 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ai-msg').length >= 4, { timeout: 15000 });
  const turns = await page.evaluate(() => document.querySelectorAll('.ai-msg').length);
  check('多轮对话累积', turns >= 4, { turns });

  // 服务端收到的 messages 是不是多轮（mock 无法验证，看 UI 即可）

  // 换题清空（用题号面板跳题，不依赖底部按钮状态）
  await page.evaluate(() => document.querySelector('#btn-nav').click());
  await sleep(350);
  await page.evaluate(() => document.querySelector('#qnav button[data-i="2"]').click());
  await sleep(500);
  const cleared = await page.evaluate(() => ({
    msgs: document.querySelectorAll('.ai-msg').length,
    empty: !!document.querySelector('.ai-empty'),
  }));
  check('换题后对话清空', cleared.msgs === 0 && cleared.empty, cleared);

  // 离开答题页隐藏 FAB
  await page.evaluate(() => XC.go('#/'));
  await sleep(600);
  const fabHidden = await page.evaluate(() => document.querySelector('#ai-fab').hidden);
  check('离开答题页 AI 按钮隐藏', fabHidden);

  /* ---------- 6. 手机视口 AI ---------- */
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE + '/#/p/' + tx, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });
  await sleep(300);
  await page.evaluate(() => document.querySelector('#ai-fab').click());
  await sleep(400);
  const mob = await page.evaluate(() => ({
    open: !document.querySelector('#ai-panel').hidden,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    w: document.querySelector('#ai-panel').getBoundingClientRect().width,
  }));
  check('手机端面板打开且不溢出', mob.open && !mob.overflow, mob);
  await page.type('#ai-text', '手机上测试');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ai-msg').length >= 2, { timeout: 15000 });
  check('手机端对话正常', true);
  await page.screenshot({ path: path.join(OUT, 'a3_ai_mobile.png') });

  check('无页面 JS 异常', errs.length === 0, errs);
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await page.close();
  await browser.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
