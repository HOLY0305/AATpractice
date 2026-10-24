/* 本轮验收：① 注册/登录门 ② 密码可选 ③ 开关渲染 ④ 概览对齐 ⑤ 模型列表告警 ⑥ 管理员按用户进入 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots5');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; console.log('  \u2718 ' + name + (info ? '  \u2192 ' + JSON.stringify(info) : '')); }
}
const PIN = '030520';
const MAIN_U = 'u_uxxitaox';

(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  // 关掉历史遗留的旧标签页（旧 JS 会在存储事件后把 uid 写回去，干扰身份门测试）
  for (const p of await browser.pages()) {
    if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 160)));

  /* ---------- 1. 身份门：无身份 → 注册 ---------- */
  console.log('\n[1] 注册 / 登录门');
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(uid => localStorage.setItem('xingce_uid_v2', uid), MAIN_U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);
  check('有身份时正常进入（无 gate）', await page.evaluate(() => !!document.querySelector('#nav-me')));

  await page.evaluate(() => localStorage.removeItem('xingce_uid_v2'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  check('清掉身份后出现注册/登录页', await page.evaluate(() => !!document.querySelector('.gate-card')));
  await page.screenshot({ path: path.join(OUT, 'e1_gate.png') });

  // 注册新用户（带密码）
  await page.type('#g-name', '验收小明');
  await page.type('#g-pass', '1234');
  await page.click('#g-go');
  await sleep(900);
  check('新昵称+密码注册成功并进入', await page.evaluate(() => !!document.querySelector('#nav-me')));
  const newUser = await page.evaluate(() => ({ name: window.XC.S.user.name, uid: window.XC.S.uid, hasPass: window.XC.S.user.hasPass }));
  check('身份是「验收小明」且 hasPass=true', newUser.name === '验收小明' && newUser.hasPass === true, newUser);
  await page.screenshot({ path: path.join(OUT, 'e2_registered.png') });

  /* ---------- 2. 密码登录 / 错误密码 ---------- */
  console.log('\n[2] 密码登录');
  await page.evaluate(() => localStorage.removeItem('xingce_uid_v2'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.type('#g-name', '验收小明');
  await page.click('#g-go');
  await sleep(700);
  check('设了密码却不填 → 被拦下', await page.evaluate(() => !!document.querySelector('.gate-card')));
  await page.type('#g-pass', '9999');
  await page.click('#g-go');
  await sleep(700);
  check('密码错误 → 仍被拦下', await page.evaluate(() => !!document.querySelector('.gate-card')));
  await page.evaluate(() => { document.querySelector('#g-pass').value = ''; });
  await page.type('#g-pass', '1234');
  await page.click('#g-go');
  await sleep(900);
  check('正确密码 → 进入', await page.evaluate(() => !!document.querySelector('#nav-me')));

  /* ---------- 3. 我的：设置/清除密码入口 ---------- */
  console.log('\n[3] 密码管理入口');
  await page.goto('http://localhost:3456/#/me', { waitUntil: 'networkidle2' });
  await sleep(500);
  check('「我的」有修改密码入口', await page.evaluate(() => {
    const el = [...document.querySelectorAll('.field-label')].find(x => x.textContent.includes('密码'));
    return !!el;
  }));

  /* ---------- 4. 开关渲染（主用户） ---------- */
  console.log('\n[4] 开关渲染');
  await page.evaluate(u => localStorage.setItem('xingce_uid_v2', u), MAIN_U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(pin => { sessionStorage.setItem('xingce_admin_pin', pin); window.XC.S.admin = true; }, PIN);
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'ai').click(); });
  await sleep(300);
  const sw = await page.evaluate(() => {
    const lab = document.querySelector('#sw-ctx').closest('label');
    const r = lab.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check('开关尺寸 44×26（不再塌成小点）', Math.abs(sw.w - 44) < 1 && Math.abs(sw.h - 26) < 1, sw);
  await page.click('#sw-ctx');
  await sleep(400);
  const swOn = await page.evaluate(() => {
    const track = document.querySelector('#sw-ctx').nextElementSibling;
    return getComputedStyle(track).backgroundColor;
  });
  check('点击后轨道变靛蓝色', swOn === 'rgb(47, 79, 125)', swOn);
  await page.screenshot({ path: path.join(OUT, 'f1_switch_on.png'), clip: { x: 0, y: 130, width: 1080, height: 400 } });

  /* ---------- 5. 概览对齐 ---------- */
  console.log('\n[5] 概览对齐');
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'overview').click(); });
  await sleep(300);
  const kv = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.kv')].map(c => c.getBoundingClientRect());
    const tabs = document.querySelector('#tabs').getBoundingClientRect();
    return { first: cards[0].x, lastRight: cards[cards.length - 1].right, tabsRight: tabs.right, n: cards.length };
  });
  check('概览四格与标签页右缘对齐（auto-fit）', Math.abs(kv.lastRight - kv.tabsRight) < 4, kv);
  await page.screenshot({ path: path.join(OUT, 'f2_overview_align.png') });

  /* ---------- 6. 模型列表 + 告警 ---------- */
  console.log('\n[6] 模型列表');
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'ai').click(); });
  await sleep(300);
  await page.click('#btn-fetch-models');
  await sleep(2500);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#model-chips [data-m]')].map(b => b.dataset.m));
  check('能拉到模型列表', chips.length > 0, chips);

  /* ---------- 7. 管理员按用户进入 ---------- */
  console.log('\n[7] 用户管理');
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'users').click(); });
  await sleep(300);
  const users = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-enter]').length,
    names: [...document.querySelectorAll('[data-enter]')].map(b => b.closest('.list-row').querySelector('.t').textContent.trim()),
  }));
  check('用户列表含主用户与验收小明', users.names.some(n => n.includes('验收小明')) && users.names.some(n => n.includes('我')), users);
  check('主用户行显示「当前」而非「进入」', await page.evaluate(() => {
    const btn = document.querySelector('[data-enter="' + 'u_uxxitaox' + '"]');
    return btn && btn.textContent.trim() === '当前';
  }));
  // 点「进入」切到验收小明（按行内名字精确定位，避免命中其它测试账号）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-enter]')].find(b => {
      const row = b.closest('.list-row');
      return row && row.querySelector('.t').textContent.includes('验收小明');
    });
    btn.click();
  });
  await sleep(900);
  check('点「进入」切换到验收小明身份', await page.evaluate(() => window.XC.S.user.name === '验收小明'));
  // 切回主用户，清理测试账号
  await page.evaluate(u => localStorage.setItem('xingce_uid_v2', u), MAIN_U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  await page.goto('http://localhost:3456/#/admin', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.dataset.t === 'users').click(); });
  await sleep(300);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-rmuser]')].find(b => b.closest('.list-row').querySelector('.t').textContent.includes('验收小明'));
    if (btn) btn.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const del = [...document.querySelectorAll('.sheet .btn-danger, .sheet-actions .btn-danger')].find(b => /删除/.test(b.textContent));
    if (del) del.click();
  });
  await sleep(1000);
  const gone = await page.evaluate(async () => {
    // 以服务端数据为准（本机列表可能正在重渲染）
    try {
      const b = await (await fetch('/api/bootstrap')).json();
      return !b.users.some(u => u.name.includes('验收小明'));
    } catch (e) { return false; }
  });
  check('测试账号已删除', gone);
  // 恢复主用户
  await page.evaluate(u => localStorage.setItem('xingce_uid_v2', u), MAIN_U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(600);

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
