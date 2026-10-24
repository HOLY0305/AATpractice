/* 第六轮验收：统计 Bento 面板 + 留言删除权限（作者可删自己的，管理员可删任意） */
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
  await page.setViewport({ width: 1440, height: 1500 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 150)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(400);
  await page.evaluate(() => { localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'); sessionStorage.removeItem('xingce_admin_pin'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);

  /* 清场：删光旧留言 */
  await page.evaluate(async () => {
    const list = (await (await fetch('/api/messages')).json()).messages;
    for (const m of list) {
      await fetch('/api/admin/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '030520', id: m.id }) });
    }
  });

  console.log('\n[1] 统计 Bento 面板');
  await page.evaluate(() => { document.querySelector('#nav-stats').click(); });
  await sleep(1600);
  check('路由与渲染（无 pageerror）', errors.length === 0, errors);
  check('四象限已移除（无 quad 元素）', await page.evaluate(() => document.querySelectorAll('[class*="quad"]').length === 0));
  const tiles = await page.evaluate(() => document.querySelectorAll('.b-tile').length);
  check('Bento 瓦片齐全（11 块）', tiles === 11, tiles);
  check('KPI 数字滚动完成（>0）', await page.evaluate(() => {
    const v = document.querySelector('.b-kpi .v span');
    return v && parseInt(v.textContent, 10) > 0;
  }));
  check('正确率环存在且有进度', await page.evaluate(() => {
    const fg = document.querySelector('.donut-fg');
    return fg && parseFloat(fg.style.strokeDashoffset) < parseFloat(fg.style.strokeDasharray);
  }));
  check('模块条形动画到位（宽度>0）', await page.evaluate(() => {
    const i = document.querySelector('.sb-bar i');
    return i && parseFloat(i.style.width) > 0;
  }));
  check('雷达图（有图或友好空态）', await page.evaluate(() =>
    document.querySelectorAll('.radar-poly').length === 1 ||
    [...document.querySelectorAll('.b-tile')].some(t => t.textContent.includes('数据还画不成雷达'))));
  check('玫瑰图花瓣 >= 1', await page.evaluate(() => document.querySelectorAll('.rose-sec').length >= 1));
  check('用时直方 8 桶', await page.evaluate(() => document.querySelectorAll('.hist-bar').length === 8));
  check('30 日趋势线与裁剪揭示', await page.evaluate(() => {
    const r = document.querySelector('#tclip rect');
    return !!document.querySelector('.trend-line') && r && parseFloat(r.style.width) > 100;
  }));
  check('学习日历格子', await page.evaluate(() => document.querySelectorAll('.heat').length > 100));
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k1_bento_top.png') });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(700);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k2_bento_bottom.png') });

  console.log('\n[2] 留言权限：作者可删自己的');
  await page.evaluate(async () => {
    await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'u_uxxitaox', text: '作者权限验收：这条我自己能删' }) });
  });
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(900);
  // 点自己的便签 → 详情应有 关闭 + 删除我的留言
  await page.evaluate(() => document.querySelector('.ink-note').click());
  await sleep(500);
  const btns = await page.evaluate(() => [...document.querySelectorAll('.sheet-actions button')].map(b => b.textContent));
  check('详情面板有「关闭」键', btns.includes('关闭'), btns);
  check('作者详情面板有删除键', btns.some(t => t.includes('删除')), btns);
  // 点删除 → 二次确认 → 确认
  await page.evaluate(() => { [...document.querySelectorAll('.sheet-actions button')].find(b => b.textContent.includes('删除')).click(); });
  await sleep(500);
  check('弹出二次确认', await page.evaluate(() => {
    const s = document.querySelector('.sheet h2');
    return s && s.textContent.includes('删除留言');
  }));
  await page.evaluate(() => { [...document.querySelectorAll('.sheet-actions button')].find(b => b.textContent === '删除').click(); });
  await sleep(700);
  const afterOwnDel = await page.evaluate(async () => (await (await fetch('/api/messages')).json()).messages.length);
  check('作者删除自己的留言成功', afterOwnDel === 0, afterOwnDel);

  console.log('\n[3] 留言权限：别人不能删');
  // 临时用户 C 发一条；临时用户 B 尝试删 → 403
  const userB = await page.evaluate(async () => {
    const r = await (await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '验收临时B' }) })).json();
    return r.user;
  });
  const msgC = await page.evaluate(async () => {
    const u = await (await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '验收临时C' }) })).json();
    const r = await (await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: u.user.id, text: 'C 的留言，B 你不能删' }) })).json();
    return r.message;
  });
  const code403 = await page.evaluate(async (mid, bid) => {
    const r = await fetch('/api/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mid, uid: bid }) });
    return r.status;
  }, msgC.id, userB.id);
  check('B 删 C 的留言被拒（403）', code403 === 403, code403);
  // B 视角：C 的便签详情无删除键
  await page.evaluate(uid => { localStorage.setItem('xingce_uid_v2', uid); }, userB.id);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  await page.evaluate(() => document.querySelector('.ink-note').click());
  await sleep(500);
  const btnsB = await page.evaluate(() => [...document.querySelectorAll('.sheet-actions button')].map(b => b.textContent));
  check('普通用户看别人留言只有「关闭」', btnsB.length === 1 && btnsB[0] === '关闭', btnsB);
  await page.evaluate(() => XC.closeSheet());
  await sleep(300);
  // B 自己发一条再删自己的 → 200
  const delSelf = await page.evaluate(async bid => {
    const p = await (await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: bid, text: 'B 自己的，可以删' }) })).json();
    const r = await fetch('/api/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.message.id, uid: bid }) });
    return r.status;
  }, userB.id);
  check('B 删自己的留言成功（200）', delSelf === 200, delSelf);

  console.log('\n[4] 管理员：留言管理页 + 删任意');
  await page.evaluate(() => { localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'); sessionStorage.setItem('xingce_admin_pin', '030520'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  await page.evaluate(() => { location.hash = '#/admin'; });
  await sleep(900);
  check('管理员页有「留言」标签', await page.evaluate(() =>
    [...document.querySelectorAll('#tabs button')].some(b => b.textContent === '留言')));
  await page.evaluate(() => { [...document.querySelectorAll('#tabs button')].find(b => b.textContent === '留言').click(); });
  await sleep(800);
  check('留言列表渲染', await page.evaluate(() => document.querySelectorAll('[data-mdel]').length >= 1));
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k3_admin_msgs.png') });
  const targetId = await page.evaluate(() => document.querySelector('[data-mdel]').dataset.mdel);
  await page.evaluate(() => document.querySelector('[data-mdel]').click());
  await sleep(500);
  check('管理员删除也有二次确认', await page.evaluate(() => !!document.querySelector('.sheet h2') && document.querySelector('.sheet h2').textContent.includes('删除留言')));
  await page.evaluate(() => { [...document.querySelectorAll('.sheet-actions button')].find(b => b.textContent === '删除').click(); });
  await sleep(800);
  const gone = await page.evaluate(async mid => !(await (await fetch('/api/messages')).json()).messages.some(m => m.id === mid), targetId);
  check('管理员删除成功', gone, targetId);

  /* 临时用户 B/C 留待管理员在「用户」页手动清理 */
  console.log('  · 临时用户 B/C 已留在用户列表，可在管理界面删除');

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
