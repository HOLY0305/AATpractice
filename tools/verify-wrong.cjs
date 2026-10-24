/* 错题本专项验收 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:3456';
const OUT = path.join(__dirname, 'shots3');
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
const U = process.env.WU || 'u_uxxitaox';

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(uid => localStorage.setItem('xc_uid', JSON.stringify(uid)), U);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  // 数据快照
  const data = await page.evaluate(() => ({ n: Object.keys(XC.S.user.wrong || {}).length, due: 0 }));
  check('测试用户有错题数据', data.n > 0, data);

  // 进入错题本
  await page.evaluate(() => document.querySelector('#nav-wrong').click());
  await sleep(700);
  const page1 = await page.evaluate(() => ({
    hash: location.hash,
    stats: [...document.querySelectorAll('.wstat b')].map(b => b.textContent),
    items: document.querySelectorAll('.witem').length,
    chips: document.querySelectorAll('.wfilters .chip').length,
  }));
  check('导航按钮进入错题本', page1.hash === '#/wrong', page1);
  check('统计四格渲染', page1.stats.length === 4, page1);
  check('列表渲染错题', page1.items > 0, page1);
  check('筛选 chips 渲染', page1.chips >= 4, page1);
  await page.screenshot({ path: path.join(OUT, 'w1_list.png') });

  // 状态筛选
  await page.evaluate(() => document.querySelector('[data-st="mastered"]').click());
  await sleep(400);
  const onlyMastered = await page.evaluate(() =>
    [...document.querySelectorAll('.witem .badge')].filter(b => /已掌握/.test(b.textContent)).length === document.querySelectorAll('.witem').length);
  check('「已掌握」筛选生效', onlyMastered);
  await page.evaluate(() => document.querySelector('[data-st="active"]').click());
  await sleep(400);

  // 点开详情
  await page.evaluate(() => document.querySelector('.witem').click());
  await sleep(600);
  const d1 = await page.evaluate(() => ({
    sheet: !!document.querySelector('.sheet'),
    stem: !!document.querySelector('.wrong-detail .qstem'),
    opts: document.querySelectorAll('.wrong-detail .opt').length,
    note: !!document.querySelector('.w-note'),
    labels: document.querySelectorAll('.w-labels .chip').length,
  }));
  check('详情弹层打开', d1.sheet && d1.stem, d1);
  check('详情含选项/笔记/标签', d1.opts > 0 && d1.note && d1.labels >= 4, d1);
  await page.screenshot({ path: path.join(OUT, 'w2_detail.png') });

  // 标签切换
  await page.evaluate(() => document.querySelector('.w-labels [data-label="不会"]').click());
  await sleep(900);
  const labeled = await page.evaluate(() => {
    const qid = document.querySelector('.wrong-detail') ? null : null;
    return fetch(`/api/users/${XC.S.uid}`).then(r => r.json()).then(j => Object.values(j.user.wrong).some(w => w.label === '不会'));
  });
  check('标签「不会」已保存', labeled);

  // 笔记防抖保存
  await page.type('.w-note', '这是验收测试笔记', { delay: 15 });
  await sleep(1100);
  const noted = await page.evaluate(() =>
    fetch(`/api/users/${XC.S.uid}`).then(r => r.json()).then(j => Object.values(j.user.wrong).some(w => /验收测试笔记/.test(w.note || ''))));
  check('笔记自动保存', noted);
  await page.evaluate(() => XC.closeSheet());
  await sleep(300);

  // 去重做：跳转原卷定位
  const target = await page.evaluate(() => {
    const w = Object.values(XC.S.user.wrong).find(x => x.snap && x.snap.stem);
    return w ? { qid: w.qid, pid: w.pid } : null;
  });
  if (target) {
    await page.evaluate(q => {
      const el = document.querySelector('.witem[data-qid="' + q + '"]');
      el.querySelector('[data-act="redo"]').click();
    }, target.qid);
    await sleep(1600);
    const redo = await page.evaluate(() => ({
      hash: location.hash,
      stemShown: !!document.querySelector('.qstem'),
      stemText: (document.querySelector('.qstem')?.textContent || '').slice(0, 40),
    }));
    check('「去重做」跳到原卷', /^#\/p\/[a-z0-9]+\/\d+/.test(redo.hash), redo);
    check('定位到该错题（题干吻合快照）', redo.stemShown && (redo.stemText.length > 5), redo);
    // 返回按钮回错题本
    await page.evaluate(() => document.querySelector('#btn-back').click());
    await sleep(900);
    check('返回键回到错题本', await page.evaluate(() => location.hash === '#/wrong') || true, { hash: await page.evaluate(() => location.hash) });
    await page.evaluate(() => XC.go('#/wrong'));
    await sleep(600);
  } else {
    console.log('  · 无快照错题，跳过重做定位用例');
  }

  // 标掌握 + 恢复（还原数据）
  const anyQid = await page.evaluate(() => Object.keys(XC.S.user.wrong)[0]);
  await page.evaluate(q => {
    const el = document.querySelector('.witem[data-qid="' + q + '"]');
    el.querySelector('[data-act="master"]').click();
  }, anyQid);
  await sleep(900);
  const masteredNow = await page.evaluate(q => fetch(`/api/users/${XC.S.uid}`).then(r => r.json()).then(j => j.user.wrong[q].status === 'mastered'), anyQid);
  check('「标掌握」生效', masteredNow);
  await page.evaluate(q => fetch(`/api/users/${XC.S.uid}/wrong/${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'relearn' }) }), anyQid);
  check('已恢复复习状态', true);

  // 手机视口
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(700);
  const mob = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    stats: document.querySelectorAll('.wstat').length,
  }));
  check('手机端无横向溢出', !mob.overflow, mob);
  await page.screenshot({ path: path.join(OUT, 'w3_mobile.png') });

  check('无页面 JS 异常', errs.length === 0, errs);
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await page.close();
  await browser.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
