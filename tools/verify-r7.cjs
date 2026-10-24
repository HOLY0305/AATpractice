/* 第七轮验收：跨设备同步（昵称精确匹配 / 同步码 / 静默刷新 / 账号合并）+ 手机端发图 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; console.log('  \u2718 ' + name + (info ? '  \u2192 ' + JSON.stringify(info) : '')); }
}
const post = (page, url, body) => page.evaluate(async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, url, body);

(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);

  console.log('\n[1] 昵称精确匹配 + 同步码');
  const created = await post(page, '/api/auth', { name: '验收同步甲' });
  const uid = created.json.user.id;
  check('新建账号成功', created.status === 200 && created.json.created === true, created);
  const dup = await post(page, '/api/auth', { name: '验收同步甲' });
  check('完全相同的昵称不新建账号', dup.json && dup.json.user.id === uid && dup.json.created === false, dup.json);
  const spaced = await post(page, '/api/auth', { name: '验收 同步甲' });
  check('中间多一个空格 = 另一个账号（不再归一化）', spaced.json && spaced.json.created === true && spaced.json.user.id !== uid, spaced.json);
  const upperCase = await post(page, '/api/auth', { name: 'CcTest' });
  const lowerCase = await post(page, '/api/auth', { name: 'cctest' });
  check('大小写不同 = 两个账号（不再归一化）',
    upperCase.json && lowerCase.json && upperCase.json.user.id !== lowerCase.json.user.id, [upperCase.json && upperCase.json.created, lowerCase.json && lowerCase.json.created]);
  const byCode = await post(page, '/api/auth', { code: uid });
  check('同步码可直接登录', byCode.json && byCode.json.user.id === uid, byCode.json);
  const badCode = await post(page, '/api/auth', { code: 'u_notexist' });
  check('错误同步码返回 404', badCode.status === 404, badCode.status);

  console.log('\n[2] 跨设备记录同步');
  // 设备 A：刷一道题（模拟）
  const ans = await post(page, `/api/users/${uid}/answer`, { pid: 'p_sync_test', qid: 'q1', ok: true, ms: 21000, module: '03', tag: '同步测试' });
  check('设备 A 答题写入服务器', ans.status === 200, ans);
  // 设备 B：全新浏览器（清空 localStorage）→ 用同步码登录
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 1000 });
  await pageB.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await pageB.evaluate(() => localStorage.clear());
  await pageB.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  check('新设备先落到登录门', await pageB.evaluate(() => !!document.querySelector('#g-code')));
  await pageB.evaluate(() => document.querySelector('#g-toggle').click());
  await sleep(300);
  await pageB.evaluate(code => {
    document.querySelector('#g-code').value = code;
    document.querySelector('#g-go').click();
  }, uid);
  await sleep(1400);
  const stateB = await pageB.evaluate(() => ({
    uid: XC.S.uid,
    answered: XC.S.user.stats.answered || 0,
    papers: Object.keys(XC.S.user.papers || {}).length,
    hasGate: !!document.querySelector('#g-go'),
  }));
  check('新设备用同步码进入同一账号', stateB.uid === uid && !stateB.hasGate, stateB);
  check('设备 B 看到设备 A 的答题记录', stateB.answered >= 1 && stateB.papers >= 1, stateB);

  console.log('\n[3] 我的页：同步码 / 立即同步 / 退出登录');
  await pageB.evaluate(() => { location.hash = '#/me'; });
  await sleep(900);
  const me = await pageB.evaluate(() => ({
    code: (document.querySelector('#sync-code') || {}).value,
    copy: !!document.querySelector('#btn-copy-code'),
    sync: !!document.querySelector('#btn-sync-now'),
    out: !!document.querySelector('#btn-logout'),
    text: document.body.innerText.includes('账号与同步'),
  }));
  check('「我的」显示账号与同步区', me.text, me);
  check('同步码为当前账号 id', me.code === uid, me.code);
  check('有复制 / 立即同步 / 退出登录', me.copy && me.sync && me.out, me);
  // 设备 A 再答一题，设备 B 点「立即同步」应看到新数据
  await post(page, `/api/users/${uid}/answer`, { pid: 'p_sync_test', qid: 'q2', ok: false, ms: 30000, module: '03', tag: '同步测试' });
  await pageB.evaluate(() => document.querySelector('#btn-sync-now').click());
  await sleep(1200);
  const synced = await pageB.evaluate(() => XC.S.user.stats.answered || 0);
  check('「立即同步」拉到新记录', synced >= 2, synced);
  // 静默同步：切后台再回来（visibilitychange）
  await post(page, `/api/users/${uid}/answer`, { pid: 'p_sync_test', qid: 'q3', ok: true, ms: 18000, module: '03', tag: '同步测试' });
  await pageB.evaluate(() => { location.hash = '#/'; });
  await sleep(600);
  await pageB.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(1300);
  const autoSync = await pageB.evaluate(() => XC.S.user.stats.answered || 0);
  check('切回页面自动静默同步', autoSync >= 3, autoSync);

  console.log('\n[4] 手机端发图（压缩 + 发布反馈）');
  await pageB.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pageB.goto('http://localhost:3456/#/', { waitUntil: 'networkidle2' });
  await sleep(1000);
  // 清掉已有留言，保证本轮只验一条
  await pageB.evaluate(async () => {
    const list = (await (await fetch('/api/messages')).json()).messages;
    for (const m of list) await fetch('/api/admin/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '030520', id: m.id }) });
  });
  await pageB.evaluate(() => document.querySelector('#btn-ink').click());
  await sleep(600);
  await pageB.evaluate(() => { document.querySelector('#ink-text').value = '手机大图压缩验收'; });
  const bigKB = await pageB.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const g = c.getContext('2d');
    for (let i = 0; i < 9000; i++) { g.fillStyle = 'hsl(' + (i % 360) + ',70%,' + (30 + i % 50) + '%)'; g.fillRect(Math.random() * 2400, Math.random() * 1800, 26, 26); }
    const url = c.toDataURL('image/jpeg', 0.92);
    const bin = atob(url.split(',')[1]); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([arr], 'big.jpg', { type: 'image/jpeg' }));
    const inp = document.querySelector('#ink-img'); inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
    return Math.round(bin.length / 1024);
  });
  await sleep(1600);
  const cmp = await pageB.evaluate(() => ({
    hidden: document.querySelector('#ink-preview').hidden,
    w: document.querySelector('#ink-preview-img').naturalWidth || 0,
    name: document.querySelector('#ink-img-name').textContent,
    srcLen: (document.querySelector('#ink-preview-img').src || '').length,
  }));
  check('大图（' + bigKB + 'KB）能预览', cmp.hidden === false && cmp.w > 0, cmp);
  check('预览已缩到 1600px 以内', cmp.w <= 1600, cmp.w);
  check('显示压缩后体积', /已压缩到/.test(cmp.name), cmp.name);
  check('压缩后 dataURL 明显变小', cmp.srcLen < 700 * 1024, Math.round(cmp.srcLen / 1024) + 'KB(base64)');
  await pageB.screenshot({ path: path.join(__dirname, 'shots5', 'm2_mobile_compressed.png') });
  // 点击与读取放在同一 tick：handler 在首个 await 前会同步置为「发布中…」
  const busy = await pageB.evaluate(() => {
    const hit = () => [...document.querySelectorAll('.sheet-actions button')].find(x => /发布/.test(x.textContent));
    hit().click();
    const b = hit();
    return b ? b.textContent.trim() : '(gone)';
  });
  await sleep(1800);
  const after = await pageB.evaluate(() => ({ open: !!document.querySelector('.sheet'), toast: (document.querySelector('.toast') || {}).textContent || '' }));
  check('点发布有「发布中…」即时反馈', /发布中/.test(busy), busy);
  check('发布成功（面板关闭 + 提示）', !after.open && after.toast.includes('墨迹'), after);
  const msg = await pageB.evaluate(async () => (await (await fetch('/api/messages')).json()).messages.slice(-1)[0]);
  check('图片已落盘为 /msgimg/', msg && /^\/msgimg\//.test(msg.img || ''), msg);
  const imgKB = await pageB.evaluate(async u => {
    const b = await (await fetch(u)).blob();
    return Math.round(b.size / 1024);
  }, msg.img);
  check('落盘图片体积已缩小（<400KB）', imgKB < 400, imgKB + 'KB');

  console.log('\n[5] 账号合并（处理重复昵称）');
  const a = await post(pageB, '/api/auth', { name: '验收合并A' });
  const b = await post(pageB, '/api/auth', { name: '验收合并B' });
  await post(pageB, `/api/users/${a.json.user.id}/answer`, { pid: 'p_m1', qid: 'x1', ok: true, ms: 10000, module: '03', tag: 'm' });
  await post(pageB, `/api/users/${b.json.user.id}/answer`, { pid: 'p_m2', qid: 'y1', ok: true, ms: 12000, module: '03', tag: 'm' });
  const merged = await post(pageB, '/api/admin/users/merge', { pin: '030520', from: b.json.user.id, to: a.json.user.id });
  check('合并接口返回成功', merged.status === 200 && merged.json.ok, merged);
  const afterMerge = await pageB.evaluate(async id => (await (await fetch('/api/users/' + id)).json()).user, a.json.user.id);
  check('目标账号拿到两边记录', Object.keys(afterMerge.papers || {}).length === 2, Object.keys(afterMerge.papers || {}));
  const srcGone = await pageB.evaluate(async id => (await fetch('/api/users/' + id)).status, b.json.user.id);
  check('源账号已删除', srcGone === 404, srcGone);
  // 收尾：删掉本轮临时账号
  const temps = [uid, a.json.user.id,
    spaced.json && spaced.json.user.id, upperCase.json && upperCase.json.user.id, lowerCase.json && lowerCase.json.user.id].filter(Boolean);
  for (const id of temps) await pageB.evaluate(async i => fetch('/api/users/' + i, { method: 'DELETE' }), id);
  check('全程无 JS 错误', errors.length === 0, errors);

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await pageB.close(); await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
