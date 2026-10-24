/* 知识图谱验收：#/graph 建图 / 展开 / 搜索 / 面板 / 动效状态 */
const puppeteer = require('puppeteer-core');
const { ensureEdge } = require('./edge.cjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; console.log('  \u2718 ' + name + (info !== undefined ? '  \u2192 ' + JSON.stringify(info) : '')); }
}

(async () => {
  console.log('Edge:', await ensureEdge());
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  for (const p of await browser.pages()) if (p.url().includes('localhost:3456')) { try { await p.close(); } catch (e) {} }
  const page = await browser.newPage();
  await page.setViewport({ width: 1380, height: 940 });
  const errors = [];
  page.on('pageerror', e => {
    const msg = e.message || '';
    if (/chrome-extension|toggleTranslatePage/.test(msg + (e.stack || ''))) return; // Edge 扩展噪音
    errors.push(msg.slice(0, 200));
  });
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.setItem('xingce_uid_v2', 'u_g1n4l69t'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  console.log('\n[1] 视图与数据');
  await page.evaluate(() => { location.hash = '#/graph'; });
  await sleep(3200);
  check('图谱页渲染', await page.evaluate(() => !!document.querySelector('.graph-stage')));
  check('统计文案就位', /考点/.test(await page.evaluate(() => (document.querySelector('#gs-stat') || {}).textContent || '')));
  const st1 = await page.evaluate(() => ({
    nodes: XC.views.graph ? 1 : 0,
    total: document.querySelectorAll('#gcanvas').length,
  }));
  check('canvas 存在', st1.total === 1, st1);
  await sleep(1200);
  const counts = await page.evaluate(() => new Promise(res => {
    // 读取内部状态：通过再进一次视图拿不到，改为视觉探测——canvas 非空
    const c = document.querySelector('#gcanvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 40) if (data[i] > 0) painted++;
    res(painted);
  }));
  check('canvas 已绘制内容（非空白）', counts > 50, counts);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k1_graph_overview.png') });

  console.log('\n[2] 模块筛选');
  await page.evaluate(() => { [...document.querySelectorAll('.gchip')].find(b => b.dataset.m).click(); });
  await sleep(900);
  check('筛选后仅一个模块的 chip 高亮', (await page.evaluate(() => document.querySelectorAll('.gchip.on').length)) === 1);
  await page.evaluate(() => { [...document.querySelectorAll('.gchip')][0].click(); });
  await sleep(700);

  console.log('\n[3] 展开大类 → 考点群');
  // 点击画布中心偏上的大类节点：借助 pick 不可达，直接模拟一次 canvas 点击流不可靠，
  // 改为键盘搜索一个已知考点群
  await page.evaluate(() => { document.querySelector('#gq').value = '现期比重计算'; });
  await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    document.querySelector('#gq').dispatchEvent(ev);
  });
  await sleep(1800);
  const panel1 = await page.evaluate(() => ({
    open: !document.querySelector('#gpanel').hidden,
    name: (document.querySelector('.gp-name') || {}).textContent || '',
    kind: (document.querySelector('.gp-kind') || {}).textContent || '',
  }));
  check('搜索定位到考点群', panel1.open && panel1.kind === '考点群', panel1);
  const expanded = await page.evaluate(() => new Promise(async res => {
    // 群被搜索定位后应已展开（open=true），其微考点可见
    const c = document.querySelector('#gcanvas');
    const ctx = c.getContext('2d');
    await new Promise(r => setTimeout(r, 1200));
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 40) if (data[i] > 0) painted++;
    res(painted);
  }));
  check('展开后画面更丰富（绘制量上升）', expanded > counts, [counts, expanded]);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k2_graph_expanded.png') });

  console.log('\n[4] 面板笔记懒加载（jsDelivr）');
  await sleep(2500);
  const bodyTxt = await page.evaluate(() => (document.querySelector('#gp-body') || {}).textContent || '');
  check('面板出现笔记内容或降级提示', bodyTxt.length > 10, bodyTxt.slice(0, 60));

  console.log('\n[5] 拖拽与缩放');
  const before = await page.evaluate(() => new Promise(res => {
    const c = document.querySelector('#gcanvas');
    const r = c.getBoundingClientRect();
    res({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }));
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel({ deltaY: -400 });
  await sleep(900);
  check('滚轮缩放无报错', errors.length === 0, errors);
  await page.mouse.move(before.x + 120, before.y + 60);
  await page.mouse.down();
  await page.mouse.move(before.x + 260, before.y + 160, { steps: 8 });
  await page.mouse.up();
  await sleep(600);
  check('拖拽平移无报错', errors.length === 0, errors);

  console.log('\n[6] 移动端视口');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(900);
  const mob = await page.evaluate(() => {
    const s = document.querySelector('.graph-stage').getBoundingClientRect();
    const over = document.documentElement.clientWidth < s.right;
    return { w: Math.round(s.width), overflow: over };
  });
  check('移动端画布不横向溢出', !mob.overflow, mob);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'k3_graph_mobile.png') });

  check('全程无 JS 错误', errors.length === 0, errors);
  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
