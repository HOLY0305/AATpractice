/* 验收 G2：思维导图 v2 + 考点卡片库 + 真题直达练习 */
'use strict';
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require(require('path').join(__dirname, 'edge.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 200) : ''); }
}

(async () => {
  await ensureEdge();
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  const errors = [];
  page.on('pageerror', e => {
    const sig = (e.stack || e.message || String(e));
    if (sig.includes('chrome-extension') || sig.includes('toggleTranslatePage') || sig.includes('inject.js')) return;
    errors.push(sig.slice(0, 300));
  });

  console.log('\n[1] 思维导图 #/graph');
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.setItem('xingce_uid_v2', 'u_g1n4l69t'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  await page.evaluate(() => { location.hash = '#/graph'; });
  await sleep(2600);
  check('导图加载且画布有内容', await page.evaluate(() => {
    const c = document.querySelector('#gcanvas');
    if (!c) return false;
    const b = c.getContext('2d');
    const d = b.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;
    return n > 40;
  }));
  const btns = await page.evaluate(() => ({ hint: !!document.querySelector('.graph-hint'), zoom: document.querySelectorAll('.gz-btn').length }));
  check('固定视图提示 + 缩放按钮就位', btns.hint && btns.zoom === 3, btns);

  // 取必在 Top 榜内的群与微考点：真题数最多的大类的第一大群
  const top = await page.evaluate(async () => {
    const k = await (await fetch('/data/knowledge.json')).json();
    const cat = k.modules.flatMap(m => m.cats).sort((a, b) => (b.groups || []).length - (a.groups || []).length)[0];
    const g = cat.groups[0];   // groups 已按规模排序 → 必在 Top22
    return { group: g.name, point: g.points[0].name, catId: cat.id };
  });
  await page.evaluate(name => { document.querySelector('#gq').value = name; document.querySelector('#gq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, top.group);
  await sleep(2200);
  check('搜索定位展开考点群（无报错）', errors.length === 0, errors);
  // 展开的群上搜微考点
  await page.evaluate(name => { const i = document.querySelector('#gq'); if (i) { i.value = name; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } }, top.point);
  await sleep(2600);
  const panel = await page.evaluate(() => ({
    open: !!document.querySelector('#gpanel:not([hidden])'),
    hasPractice: !!document.querySelector('.gp-practice'),
    text: (document.querySelector('#gpanel') || {}).textContent || '',
  }));
  check('微考点面板打开', panel.open, panel.text.slice(0, 80));
  check('面板含「去练习」直达按钮（qid 命中题库）', panel.hasPractice, panel.text.slice(0, 120));

  if (panel.hasPractice) {
    const loc = await page.evaluate(() => document.querySelector('.gp-practice').dataset.loc);
    await page.evaluate(() => document.querySelector('.gp-practice').click());
    await sleep(2500);
    const paperOk = await page.evaluate(loc2 => location.hash === '#/p/' + loc2 && !!document.querySelector('.qcard'), loc);
    check('跳转到答题页并加载试卷（#/p/' + loc + '）', paperOk);
    const qidShown = await page.evaluate(() => document.body.textContent.includes('qid'));
    check('答题页题目渲染', qidShown !== undefined);
  }

  console.log('\n[2] 考点卡片库 #/kb');
  await page.goto('http://localhost:3456/#/kb', { waitUntil: 'networkidle2' });
  await sleep(1800);
  let kb = await page.evaluate(() => ({
    side: document.querySelectorAll('.kb-cat-btn').length,
    cards: document.querySelectorAll('.kb-card').length,
    tab: document.querySelector('.kb-tabs .on') && document.querySelector('.kb-tabs .on').textContent,
  }));
  check('侧栏 12 个大类 + 大类卡片网格', kb.side === 12 && kb.cards >= 12, kb);
  check('面包屑显示「考点体系」', await page.evaluate(() => ((document.querySelector('#kbcrumb') || {}).textContent || '').includes('考点体系')));

  // 进入第一个大类
  await page.evaluate(() => document.querySelector('.kb-cat-btn').click());
  await sleep(700);
  kb = await page.evaluate(() => ({ cards: document.querySelectorAll('.kb-card').length, name: document.querySelector('.kb-crumb-cur') && document.querySelector('.kb-crumb-cur').textContent }));
  check('大类 → 考点群卡片（≥10 张）', kb.cards >= 10, kb);
  check('面包屑进入大类', kb.name && kb.name !== '考点体系', kb.name);

  // 进入第一个考点群
  await page.evaluate(() => document.querySelector('.kb-card').click());
  await sleep(700);
  kb = await page.evaluate(() => ({ cards: document.querySelectorAll('.kb-card-point').length }));
  check('考点群 → 微考点卡片', kb.cards >= 1, kb);

  // 打开一个微考点笔记
  await page.evaluate(() => document.querySelector('.kb-card-point').click());
  await sleep(6000);
  kb = await page.evaluate(() => ({
    note: (document.querySelector('.kb-note-body') || {}).textContent || '',
    practice: document.querySelectorAll('.kb-qrow [data-go]').length,
  }));
  check('微考点笔记渲染（核心立场）', kb.note.length > 60, kb.note.slice(0, 80));
  check('关联真题列表带「去练习」', kb.practice >= 1, kb.practice);

  if (kb.practice) {
    await page.evaluate(() => document.querySelector('.kb-qrow [data-go]').click());
    await sleep(2500);
    check('卡片库真题直达答题页', await page.evaluate(() => location.hash.startsWith('#/p/')));
  }

  console.log('\n[3] 材料精读');
  await page.goto('http://localhost:3456/#/kb?mat=1', { waitUntil: 'networkidle2' });
  await sleep(2200);
  kb = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-mat]').length, note: (document.querySelector('.kb-mat-note') || {}).textContent || '' }));
  check('材料卡片网格（120 张展示）', kb.cards === 120, kb.cards);
  check('材料说明文案', kb.note.includes('读题训练场'), kb.note.slice(0, 60));
  await page.evaluate(() => document.querySelector('[data-mat]').click());
  await sleep(6000);
  kb = await page.evaluate(() => (document.querySelector('.kb-note-body') || {}).textContent || '');
  check('材料笔记全文渲染（结构拆解/陷阱）', kb.length > 200 && (kb.includes('陷阱') || kb.includes('拆解')), kb.slice(0, 80));

  console.log('\n[4] 移动端导图可用性');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:3456/#/graph', { waitUntil: 'networkidle2' });
  await sleep(2400);
  const mob = await page.evaluate(() => {
    const st = document.querySelector('#gstage').getBoundingClientRect();
    return { w: st.width, h: st.height, hint: !!document.querySelector('.graph-hint') };
  });
  check('小屏画布铺满且无横向溢出', mob.w <= 391 && mob.h > 300, mob);

  check('全程无页面错误', errors.length === 0, errors);
  await page.setViewport({ width: 1360, height: 900 });
  await page.goto('http://localhost:3456/#/graph', { waitUntil: 'networkidle2' });
  await sleep(2600);
  await page.screenshot({ path: 'tools/shots5/n1_mindmap.png' });
  await page.evaluate(() => { document.querySelector('#gq').value = '现期比重计算'; document.querySelector('#gq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
  await sleep(2400);
  await page.screenshot({ path: 'tools/shots5/n2_mindmap_focus.png' });
  await page.goto('http://localhost:3456/#/kb', { waitUntil: 'networkidle2' });
  await sleep(1800);
  await page.screenshot({ path: 'tools/shots5/n3_kb_home.png' });

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  await browser.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
