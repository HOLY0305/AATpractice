/* 第一阶段验收：数据层 + 积分 + 身份 + 商城 + 管理 + 新 UI */
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, 'shots1');
const BASE = 'http://127.0.0.1:3456';
const ROOT = path.resolve(__dirname, '..');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const errors = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + JSON.stringify(extra) : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitBalance(page, expected, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeout || 2500)) {
    const v = await page.evaluate(() => document.querySelector('#nav-balance')?.innerText);
    if (v === expected) return v;
    await sleep(100);
  }
  return await page.evaluate(() => document.querySelector('#nav-balance')?.innerText);
}

function readUser() {
  const dir = path.join(ROOT, 'data', 'users');
  const f = fs.readdirSync(dir).filter(x => /^u_.*\.json$/.test(x))[0];
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', r => { if (!r.url().includes('favicon')) errors.push('reqfail: ' + r.url().slice(-60)); });

  /* ---------------- 1. 首页 ---------------- */
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.paper', { timeout: 15000 });
  const home = await page.evaluate(() => ({
    papers: document.querySelectorAll('.paper').length,
    hero: document.querySelector('.hero h1')?.innerText,
    stats: [...document.querySelectorAll('.stat .v')].map(e => e.innerText),
    overlayHidden: document.querySelector('#overlay').hidden,
    lightboxHidden: document.querySelector('#lightbox').hidden,
    overlayStyle: getComputedStyle(document.querySelector('#overlay')).display,
    balance: document.querySelector('#nav-balance')?.innerText,
    modTabs: document.querySelectorAll('.mod-tab').length,
    toastZone: !!document.querySelector('#toast-wrap'),
  }));
  check('首页渲染试卷列表', home.papers > 0, { papers: home.papers });
  check('首页统计卡渲染', home.stats.length === 4, home.stats);
  check('初始无遮罩层覆盖页面', home.overlayHidden && home.lightboxHidden && home.overlayStyle === 'none', { overlayStyle: home.overlayStyle });
  check('顶部积分显示为 0', home.balance === '0', { balance: home.balance });
  check('模块筛选 7 项', home.modTabs === 7, { modTabs: home.modTabs });
  await page.screenshot({ path: path.join(OUT, '01_home.png'), fullPage: false });

  // 命中检测：屏幕中心点应是真实可交互元素，而非遮罩
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { tag: el.tagName, cls: el.className, inOverlay: !!el.closest('.overlay, .lightbox') };
  });
  check('屏幕中心点未被遮罩拦截', !hit.inOverlay, hit);

  /* ---------------- 2. 找测试卷 ---------------- */
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'index.json'), 'utf8'));
  const findPaper = (mod, need) => {
    for (const p of index.filter(x => x.module === mod)) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'papers', p.id + '.json'), 'utf8'));
        const flat = [];
        d.groups.forEach((g, gi) => g.questions.forEach((q, qi) => flat.push({ q, gi, mat: !!g.material })));
        if (need(flat)) return { meta: p, data: d, flat };
      } catch (e) { }
    }
    return null;
  };
  const tx = findPaper('05', flat => flat.length > 8 && flat.filter(f => /<img/.test(f.q.stem)).length >= 2);
  const zl = findPaper('06', flat => flat.filter(f => f.mat).length >= 4);
  check('找到含图片的图形推理卷', !!tx, tx && tx.meta.paper);
  check('找到含材料分组的资料分析卷', !!zl, zl && zl.meta.paper);

  /* ---------------- 3. 答题：答对 ---------------- */
  await page.goto(BASE + '/#/p/' + tx.meta.id, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });

  // 挑一道答案是单选字母的题，避免多选题造成误判
  const pickable = f => f.q.options.length >= 2 && f.q.options.some(o => o.letter === f.q.answer);
  const idx1 = tx.flat.findIndex(pickable);
  const idx2 = tx.flat.findIndex((f, i) => i > idx1 && pickable(f));
  const q1 = tx.flat[idx1].q;
  const q2 = tx.flat[idx2].q;

  async function gotoQ(i) {
    await page.evaluate(() => {
      const p = document.querySelector('#qnav');
      if (!p || p.hidden) document.querySelector('#btn-nav').click();
    });
    await sleep(250);
    await page.evaluate(i => document.querySelector(`#qnav button[data-i="${i}"]`).click(), i);
    await sleep(500);
  }
  if (idx1 !== 0) await gotoQ(idx1);
  await page.waitForSelector('#opts .opt', { timeout: 8000 });

  async function clickOpt(letter) {
    const box = await page.evaluate(l => {
      const el = document.querySelector(`#opts .opt[data-l="${l}"]`);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, letter);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);   // 真实坐标点击，可暴露遮罩问题
    return true;
  }

  const clicked1 = await clickOpt(q1.answer);
  await page.waitForSelector('.result', { timeout: 8000 });
  const r1 = await page.evaluate(() => ({
    verdict: document.querySelector('.verdict')?.innerText,
    okCls: document.querySelector('.verdict')?.classList.contains('ok'),
    analysis: (document.querySelector('.analysis')?.innerText || '').length,
    correctOpt: document.querySelectorAll('.opt.correct').length,
    balance: document.querySelector('#nav-balance')?.innerText,
    gain: document.querySelector('.verdict .gain')?.innerText,
  }));
  check('真实鼠标点击选项生效', clicked1);
  check('答对判定正确', r1.okCls && /回答正确/.test(r1.verdict || ''), r1.verdict);
  check('正确选项高亮', r1.correctOpt === 1);
  check('解析已展开', r1.analysis > 20, { len: r1.analysis });
  const bal1 = await waitBalance(page, '15');
  check('积分增加（10+5）', bal1 === '15', { balance: bal1, gain: r1.gain });
  await page.screenshot({ path: path.join(OUT, '02_correct.png') });

  /* ---------------- 4. 答题：答错 + 错题本 ---------------- */
  await gotoQ(idx2);
  const w2 = q2.options.map(o => o.letter).find(l => l !== q2.answer);
  await clickOpt(w2);
  await page.waitForSelector('.verdict.bad', { timeout: 8000 });
  const r2 = await page.evaluate(() => ({
    bad: document.querySelector('.verdict')?.classList.contains('bad'),
    wrongOpt: document.querySelectorAll('.opt.wrong').length,
    balance: document.querySelector('#nav-balance')?.innerText,
  }));
  check('答错判定正确', r2.bad);
  check('错选项标红', r2.wrongOpt === 1);
  const bal2 = await waitBalance(page, '17');
  check('答错也加分（+2）', bal2 === '17', { balance: bal2 });

  const uf = readUser();
  check('错题已写入用户文件', !!uf.wrong[q2.qid], { qid: q2.qid, wrong: uf.wrong[q2.qid]?.wrong });
  check('错题含题目快照（可离线复原）', !!(uf.wrong[q2.qid]?.snap?.stem), {
    hasSnap: !!uf.wrong[q2.qid]?.snap,
    ms: uf.wrong[q2.qid]?.ms,
  });
  check('记录了作答用时', typeof uf.papers[tx.meta.id][q2.qid].ms === 'number', { ms: uf.papers[tx.meta.id][q2.qid].ms });
  check('积分流水已记录', Array.isArray(uf.ledger) && uf.ledger.length >= 2, { entries: uf.ledger.length });
  await page.screenshot({ path: path.join(OUT, '03_wrong.png') });

  /* ---------------- 5. 图片灯箱 ---------------- */
  const imgIdx = tx.flat.findIndex(f => /<img/.test(f.q.stem));
  await page.evaluate(i => { document.querySelector('#btn-nav').click(); }, imgIdx);
  await sleep(300);
  await page.evaluate(i => { document.querySelector(`#qnav button[data-i="${i}"]`).click(); }, imgIdx);
  await sleep(600);
  const imgBox = await page.evaluate(() => {
    const im = document.querySelector('.qstem img');
    if (!im) return null;
    im.scrollIntoView({ block: 'center' });
    const r = im.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(24, r.height / 2), w: r.width };
  });
  if (imgBox) {
    await page.mouse.click(imgBox.x, imgBox.y);
    await sleep(350);
    const lb = await page.evaluate(() => ({ hidden: document.querySelector('#lightbox').hidden, src: (document.querySelector('#lightbox-img').src || '').slice(-30) }));
    check('点击题图打开灯箱', !lb.hidden && lb.src.length > 5, lb);
    await page.screenshot({ path: path.join(OUT, '04_lightbox.png') });
    await page.mouse.click(20, 20);
    await sleep(300);
    const closed = await page.evaluate(() => document.querySelector('#lightbox').hidden);
    check('点击空白关闭灯箱', closed);
  } else {
    check('点击题图打开灯箱', false, '未找到图片');
  }

  /* ---------------- 6. 资料分析材料跟随 ---------------- */
  await page.goto(BASE + '/#/p/' + zl.meta.id, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.material', { timeout: 15000 });
  const matLen = await page.evaluate(() => (document.querySelector('.material-body')?.innerText || '').length);
  check('资料分析显示材料卡', matLen > 30, { len: matLen });
  await page.screenshot({ path: path.join(OUT, '05_material.png') });

  // 答第 1 题 + 翻到下一题（同材料）
  const z1 = zl.flat[0].q;
  await page.evaluate(l => {
    const el = document.querySelector(`#opts .opt[data-l="${l}"]`);
    el.scrollIntoView({ block: 'center' }); el.click();
  }, z1.answer);
  await page.waitForSelector('.verdict', { timeout: 8000 });
  await page.evaluate(() => document.querySelector('#btn-next').click());
  await sleep(500);
  const mat2 = await page.evaluate(() => ({
    has: !!document.querySelector('.material'),
    len: (document.querySelector('.material-body')?.innerText || '').length,
    collapsed: document.querySelector('.material')?.classList.contains('collapsed'),
  }));
  check('下一题同材料仍然可见', mat2.has && mat2.len > 30 && !mat2.collapsed, mat2);

  /* ---------------- 7. 刷新后持久化 ---------------- */
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('.paper, #opts .opt', { timeout: 15000 });
  const persisted = await page.evaluate(() => ({
    balance: document.querySelector('#nav-balance')?.innerText,
    answered: document.querySelectorAll('#qnav .done-right, #qnav .done-wrong').length,
  }));
  check('刷新后积分持久化', persisted.balance === '32', persisted);
  await page.screenshot({ path: path.join(OUT, '06_persist.png') });

  /* ---------------- 8. 设置页 / 主题 ---------------- */
  await page.goto(BASE + '/#/me', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#theme-seg', { timeout: 10000 });
  const meInfo = await page.evaluate(() => ({
    role: document.querySelector('.role-card .nm')?.innerText,
    sections: document.querySelectorAll('.group').length,
  }));
  check('设置页渲染', meInfo.sections >= 4, meInfo);
  await page.screenshot({ path: path.join(OUT, '07_settings.png') });

  await page.evaluate(() => document.querySelector('#theme-seg button[data-v="dark"]').click());
  await sleep(700);
  const dark = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.body).backgroundColor,
    title: document.querySelector('.panel-hd h1')?.innerText,
  }));
  check('切换到深色主题生效', dark.theme === 'dark' && /rgb\(19, 18, 16\)/.test(dark.bg), dark);
  await page.screenshot({ path: path.join(OUT, '08_dark.png') });

  /* ---------------- 9. AI 设置三态 ---------------- */
  await page.goto(BASE + '/#/me', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#ai-seg', { timeout: 10000 });
  const aiBtns = await page.evaluate(() => [...document.querySelectorAll('#ai-seg button')].map(b => b.innerText));
  check('AI 有四种模式（内含关闭）', aiBtns.length === 4 && aiBtns.includes('关闭'), aiBtns);
  await page.evaluate(() => document.querySelector('#ai-seg button[data-v="custom"]').click());
  await sleep(600);
  const customFields = await page.evaluate(() => ({
    hasUrl: !!document.querySelector('#ai-url'),
    hasKey: !!document.querySelector('#ai-key'),
    hasModel: !!document.querySelector('#ai-model'),
  }));
  check('选择「自己的 Key」后出现填写项', customFields.hasUrl && customFields.hasKey && customFields.hasModel, customFields);
  await page.screenshot({ path: path.join(OUT, '09_ai_custom.png') });

  /* ---------------- 10. 商城 ---------------- */
  await page.goto(BASE + '/#/shop', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.goods', { timeout: 10000 });
  const shop = await page.evaluate(() => ({
    goods: document.querySelectorAll('.goods').length,
    balance: document.querySelector('.balance-card .v')?.innerText,
    disabled: document.querySelectorAll('.goods .btn[disabled]').length,
  }));
  check('商城渲染商品', shop.goods >= 4, shop);
  check('商城显示当前余额', /32/.test(shop.balance || ''), { balance: shop.balance });
  await page.screenshot({ path: path.join(OUT, '10_shop.png') });

  /* ---------------- 11. 管理员 ---------------- */
  await page.goto(BASE + '/#/admin', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#pin', { timeout: 10000 });
  await page.type('#pin', '1234');
  await page.evaluate(() => document.querySelector('#btn-pin').click());
  await sleep(800);
  const wrongPin = await page.evaluate(() => ({
    stillLocked: !!document.querySelector('#pin'),
    toast: document.querySelector('.toast')?.innerText?.trim(),
  }));
  check('错误 PIN 被拒绝', wrongPin.stillLocked, wrongPin);

  await page.evaluate(() => { document.querySelector('#pin').value = ''; });
  await page.type('#pin', '8888');
  await page.evaluate(() => document.querySelector('#btn-pin').click());
  await page.waitForSelector('#tabs', { timeout: 10000 });
  const adminOk = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#tabs button')].map(b => b.innerText),
    kv: document.querySelectorAll('.kv').length,
  }));
  check('正确 PIN 进入管理界面', adminOk.tabs.length === 5, adminOk);
  await page.screenshot({ path: path.join(OUT, '11_admin.png') });

  // 改积分规则
  await page.evaluate(() => document.querySelector('#tabs button[data-t="points"]').click());
  await sleep(400);
  await page.evaluate(() => { document.querySelector('input[data-p="correct"]').value = '20'; });
  await page.evaluate(() => document.querySelector('#btn-save-points').click());
  await sleep(900);
  const cfgFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  check('管理员修改积分规则已落盘', cfgFile.points.correct === 20, { correct: cfgFile.points.correct });
  await page.screenshot({ path: path.join(OUT, '12_admin_points.png') });

  // 新增商品
  await page.evaluate(() => document.querySelector('#tabs button[data-t="shop"]').click());
  await sleep(400);
  await page.evaluate(() => document.querySelector('#btn-add-goods').click());
  await sleep(400);
  await page.type('#g-name', '测试奖励');
  await page.evaluate(() => { document.querySelector('#g-cost').value = '5'; document.querySelector('#g-stock').value = '3'; });
  await page.evaluate(() => document.querySelector('.sheet-actions .btn-primary').click());
  await sleep(900);
  const shopFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  check('管理员新增商品成功', shopFile.shop.some(x => x.name === '测试奖励'), { count: shopFile.shop.length });

  // 设置内置 Key
  await page.evaluate(() => document.querySelector('#tabs button[data-t="ai"]').click());
  await sleep(400);
  await page.type('#ai-key', 'sk-verify-abcdefghijklmn');
  await page.evaluate(() => document.querySelector('#btn-save-ai').click());
  await sleep(900);
  const keyCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  check('管理员配置内置 Key 已落盘', /sk-verify/.test(keyCfg.ai.builtin.apiKey));

  const pub = await page.evaluate(async () => (await fetch('/api/bootstrap')).json());
  check('前端拿不到内置 Key 明文', pub.config.ai.builtin.apiKey === '' && pub.config.ai.builtin.hasKey === true, pub.config.ai.builtin);

  /* ---------------- 12. 新建用户 ---------------- */
  await page.goto(BASE + '/#/me', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#btn-switch', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#btn-switch').click());
  await sleep(400);
  await page.type('#new-user-name', '小明');
  await page.evaluate(() => document.querySelector('#btn-new-user').click());
  await sleep(1000);
  const switched = await page.evaluate(() => ({
    name: document.querySelector('.role-card .nm')?.innerText,
    balance: document.querySelector('#nav-balance')?.innerText,
  }));
  check('新建用户并切换成功', /小明/.test(switched.name || '') && switched.balance === '0', switched);
  const usersNow = fs.readdirSync(path.join(ROOT, 'data', 'users')).filter(x => /^u_.*\.json$/.test(x));
  check('每个用户一个独立文件', usersNow.length === 2, { files: usersNow });

  // 切回原用户，确认记录隔离
  await page.evaluate(() => document.querySelector('#btn-switch').click());
  await sleep(400);
  const rows = await page.$$eval('.list-row[data-uid]', els => els.map(e => e.dataset.uid));
  await page.evaluate(uid => document.querySelector(`.list-row[data-uid="${uid}"]`).click(), rows[0]);
  await sleep(900);
  const backBalance = await page.evaluate(() => document.querySelector('#nav-balance')?.innerText);
  check('切回原用户后积分恢复', backBalance === '32', { balance: backBalance });

  /* ---------------- 13. 手机视口 ---------------- */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/#/p/' + tx.meta.id, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });
  await sleep(500);
  const mob = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    optW: document.querySelector('.opt')?.getBoundingClientRect().width,
    navH: document.querySelector('#nav')?.getBoundingClientRect().height,
    footVisible: !!document.querySelector('.q-foot'),
  }));
  check('手机端无横向溢出', mob.overflow <= 0, { overflow: mob.overflow });
  check('手机端选项宽度合理', mob.optW > 300, { w: Math.round(mob.optW) });
  await page.screenshot({ path: path.join(OUT, '13_mobile_question.png') });

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await sleep(600);
  const mobHome = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('手机端首页无横向溢出', mobHome <= 0, { overflow: mobHome });
  await page.screenshot({ path: path.join(OUT, '14_mobile_home.png') });

  await page.goto(BASE + '/#/shop', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '15_mobile_shop.png') });

  /* ---------------- 汇总 ---------------- */
  const pass = results.filter(r => r.ok).length;
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  if (errors.length) {
    const uniq = [...new Set(errors)];
    console.log('页面错误 ' + uniq.length + ' 条:');
    uniq.slice(0, 10).forEach(e => console.log('  - ' + e));
  } else {
    console.log('无页面异常');
  }
  check('无 JS 页面异常', errors.length === 0, { errors: [...new Set(errors)].slice(0, 5) });
  await browser.disconnect();
})().catch(async e => {
  console.error('FATAL', e.message);
  process.exit(1);
});
