/* 验收 G3：考点库合并版（导图拖拽 / 面包屑 / 深链还原 / 连做队列 / 材料原文渲染） */
'use strict';
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require(require('path').join(__dirname, 'edge.cjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 240) : ''); }
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

  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.setItem('xingce_uid_v2', 'u_g1n4l69t'); sessionStorage.removeItem('xc-kbqueue'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  console.log('\n[1] 合并版考点库：#/graph 与 #/kb 同页三标签');
  await page.evaluate(() => { location.hash = '#/graph'; });
  await sleep(2600);
  check('#/graph 路由到合并页（有标签栏）', await page.evaluate(() => !!document.querySelector('.kb-tabs [data-tab="kp"]')));
  check('导图画布有内容', await page.evaluate(() => {
    const c = document.querySelector('#gcanvas');
    if (!c) return false;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;
    return n > 40;
  }));
  check('导航合并为单入口（无 nav-graph）', await page.evaluate(() => !!document.querySelector('#nav-kb') && !document.querySelector('#nav-graph')));
  await page.evaluate(() => { document.querySelector('.kb-tabs [data-tab="kp"]').click(); });
  await sleep(700);
  check('切换到考点体系标签（左侧栏+卡片）', await page.evaluate(() => !!document.querySelector('.kb-side') && !!document.querySelector('.kb-card')));
  check('hash 同步 tab=kp', await page.evaluate(() => location.hash.startsWith('#/kb?tab=kp')), await page.evaluate(() => location.hash));

  console.log('\n[2] 导图可拖拽平移（画布像素变化）');
  await page.evaluate(() => { document.querySelector('.kb-tabs [data-tab="graph"]').click(); });
  await sleep(2600);
  const before = await page.evaluate(() => document.querySelector('#gcanvas').toDataURL().slice(0, 2000));
  await page.evaluate(() => {
    const c = document.querySelector('#gcanvas'), r = c.getBoundingClientRect();
    const opts = (x, y) => ({ bubbles: true, pointerId: 1, clientX: x, clientY: y, isPrimary: true });
    c.dispatchEvent(new PointerEvent('pointerdown', opts(r.width / 2, r.height / 2)));
    for (let i = 1; i <= 8; i++) c.dispatchEvent(new PointerEvent('pointermove', opts(r.width / 2 + i * 22, r.height / 2 + i * 8)));
    c.dispatchEvent(new PointerEvent('pointerup', opts(r.width / 2 + 176, r.height / 2 + 64)));
  });
  await sleep(700);
  const after = await page.evaluate(() => document.querySelector('#gcanvas').toDataURL().slice(0, 2000));
  check('拖拽后画面移动（未回中）', before !== after);

  console.log('\n[3] 面包屑逐层可点 + 深链还原微考点');
  await page.evaluate(() => {
    location.hash = '#/kb?tab=kp&cat=' + encodeURIComponent('判断推理/逻辑判断')
      + '&group=' + encodeURIComponent('加强论证-补充论据')
      + '&point=' + encodeURIComponent('加强论证-补充论据');
  });
  await sleep(3200);
  check('微考点详情打开（标题命中）', await page.evaluate(() =>
    document.querySelector('.gp-name') && document.querySelector('.gp-name').textContent.includes('加强论证')));
  const crumbs = await page.evaluate(() => ({
    n: document.querySelectorAll('.kb-crumb-item').length,
    hash: location.hash.includes('point='),
  }));
  check('面包屑有 3 个可点层级', crumbs.n === 3, crumbs);
  check('hash 带 point 深链', crumbs.hash);
  await page.evaluate(() => { document.querySelector('.kb-crumb-item').click(); });   // 点第一层 → 考点体系
  await sleep(700);
  check('点面包屑回到大类网格', await page.evaluate(() =>
    !!document.querySelector('.kb-card-cat') && !document.querySelector('.gp-name')));

  console.log('\n[4] 考点连做：入口 → 做题页浮条 → 队列跳题 → 退出');
  await page.evaluate(() => {
    location.hash = '#/kb?tab=kp&cat=' + encodeURIComponent('判断推理/逻辑判断')
      + '&group=' + encodeURIComponent('加强论证-补充论据')
      + '&point=' + encodeURIComponent('加强论证-补充论据');
  });
  await sleep(3600);
  const qa = await page.evaluate(() => ({
    btn: !!document.querySelector('[data-qa]'),
    rows: document.querySelectorAll('.kb-qrow').length,
    goBtns: document.querySelectorAll('[data-qid]').length,
  }));
  check('关联真题列表 + 连做按钮就位', qa.btn && qa.rows > 0 && qa.goBtns > 0, qa);
  await page.evaluate(() => { document.querySelector('[data-qa]').click(); });
  await sleep(3000);
  const q1 = await page.evaluate(() => ({
    hash: location.hash,
    bar: !!document.querySelector('.kbq-bar'),
    store: JSON.parse(sessionStorage.getItem('xc-kbqueue') || 'null'),
  }));
  check('进入做题页且浮条出现', q1.hash.startsWith('#/p/') && q1.bar, q1.hash);
  check('队列 ≥ 2 题', q1.store && q1.store.list.length >= 2, q1.store && q1.store.list.length);
  await page.evaluate(() => { document.querySelector('#kbq-next').click(); });
  await sleep(2600);
  const q2 = await page.evaluate(() => ({
    hash: location.hash,
    inQueue: (() => { try { const s = JSON.parse(sessionStorage.getItem('xc-kbqueue')); const loc = location.hash.slice(4).replace('/', '|'); return s.list.includes(loc); } catch (e) { return false; } })(),
    barText: (document.querySelector('.kbq-bar .t') || {}).textContent || '',
  }));
  check('「下一题」按队列跳到本考点下一道', q2.inQueue, q2);
  check('浮条进度推进为 2/N', /2\/\d+/.test(q2.barText), q2.barText);
  await page.evaluate(() => { document.querySelector('#kbq-x').click(); });
  await sleep(700);
  check('退出连做清空队列', await page.evaluate(() => sessionStorage.getItem('xc-kbqueue') === null));

  console.log('\n[5] 去练习 → 浏览器返回 → 精确回到微考点');
  await page.evaluate(() => { location.hash = '#/kb?tab=kp&cat=' + encodeURIComponent('判断推理/逻辑判断') + '&group=' + encodeURIComponent('加强论证-补充论据') + '&point=' + encodeURIComponent('加强论证-补充论据'); });
  await sleep(3400);
  await page.evaluate(() => { document.querySelector('[data-qid]').click(); });
  await sleep(2800);
  check('进入做题页', await page.evaluate(() => location.hash.startsWith('#/p/')));
  await page.goBack();
  await sleep(3200);
  const back = await page.evaluate(() => ({
    hash: location.hash,
    point: !!document.querySelector('.gp-name'),
    name: (document.querySelector('.gp-name') || {}).textContent || '',
  }));
  check('返回后还原到微考点详情（不再是最上层）', back.point && back.hash.includes('point=') && back.name.includes('加强论证'), back);
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(600);

  console.log('\n[6] 材料精读：原文真渲染 + 图片 CDN 化 + 关联真题');
  await page.evaluate(() => { location.hash = '#/kb?tab=mat&mat=180724'; });
  await sleep(4200);
  const mat = await page.evaluate(() => {
    const orig = document.querySelector('.kb-mat-orig');
    const img = document.querySelector('.material-html img');
    return {
      orig: !!orig,
      hasP: orig ? orig.querySelectorAll('p').length : 0,
      rawLeak: orig ? (orig.textContent || '').includes('<p>') : true,
      imgSrc: img ? img.src : '',
      imgLoaded: img ? (img.complete && img.naturalWidth > 50) : false,
      qrows: document.querySelectorAll('.kb-qrow').length,
      qa: !!document.querySelector('[data-qa]'),
      trap: (document.body.textContent || '').includes('阅读陷阱'),
    };
  });
  check('材料原文区块真渲染（无 <p> 字符泄漏）', mat.orig && mat.hasP >= 2 && !mat.rawLeak, mat);
  check('原文图片指向 jsDelivr 且加载成功', mat.imgSrc.includes('jsdelivr') && mat.imgSrc.includes('90-%E5%9B%BE%E7%89%87') && mat.imgLoaded, mat.imgSrc);
  check('笔记正文（阅读陷阱等小节）完整', mat.trap);
  check('关联真题 5 行 + 连做按钮', mat.qrows >= 5 && mat.qa, mat);

  console.log('\n[7] 导图面板「在卡片库中查看」深链');
  await page.evaluate(() => { location.hash = '#/graph'; });
  await sleep(2600);
  await page.evaluate(() => {
    const i = document.querySelector('#kbq');
    i.value = '加强论证-补充论据';
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });
  await sleep(3200);
  const panel = await page.evaluate(() => ({
    open: !!document.querySelector('#gpanel:not([hidden])'),
    kbBtn: !!document.querySelector('.gp-kb'),
  }));
  check('搜索定位打开考点面板', panel.open && panel.kbBtn, panel);
  await page.evaluate(() => { document.querySelector('.gp-kb').click(); });
  await sleep(3200);
  const kbBack = await page.evaluate(() => ({
    hash: location.hash,
    name: (document.querySelector('.gp-name') || {}).textContent || '',
    qrows: document.querySelectorAll('.kb-qrow').length,
  }));
  check('卡片库直接落到微考点（带 cat/group/point）', kbBack.name.includes('加强论证') && kbBack.hash.includes('point=') && kbBack.qrows > 0, kbBack);

  check('全程无页面错误', errors.length === 0, errors);

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
