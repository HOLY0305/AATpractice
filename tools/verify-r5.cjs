/* 第五轮验收：统计报告页 + 留言墙升级 */
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
  await page.setViewport({ width: 1280, height: 1400 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 150)));
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.evaluate(() => localStorage.setItem('xingce_uid_v2', 'u_uxxitaox'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(900);
  // 清场：管理员删光旧留言（保证带图检查针对本轮）
  await page.evaluate(async () => {
    const list = (await (await fetch('/api/messages')).json()).messages;
    for (const m of list) {
      await fetch('/api/admin/messages/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '030520', id: m.id }) });
    }
  });

  console.log('\n[1] 统计报告页');
  await page.evaluate(() => { document.querySelector('#nav-stats').click(); });
  await sleep(1200);
  check('路由与渲染（无 pageerror）', errors.length === 0, errors);
  check('四张图表卡片齐全', await page.evaluate(() => document.querySelectorAll('.chart-card').length === 4));
  check('模块正确率条形有数据', await page.evaluate(() => document.querySelectorAll('.sb-row').length > 0));
  check('用时直方图有柱子', await page.evaluate(() => document.querySelectorAll('.hist-bar').length === 8));
  const quad = await page.evaluate(() => ({ bubbles: document.querySelectorAll('.quad-bubble').length, labels: document.querySelectorAll('.quad-lbl').length }));
  check('四象限气泡与象限标签', quad.bubbles > 0 && quad.labels === 4, quad);
  check('日历热力图格子', await page.evaluate(() => document.querySelectorAll('.heat').length > 100));
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'j1_stats_top.png') });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(700);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'j2_stats_bottom.png') });

  console.log('\n[2] 留言墙：取消按钮 + 详情 + 附图');
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(900);
  // 空墙时点「留一笔」按钮
  await page.evaluate(() => document.querySelector('#btn-ink').click());
  await sleep(600);
  check('发布面板有「取消」键', await page.evaluate(() => {
    return [...document.querySelectorAll('.sheet button')].some(b => b.textContent === '取消');
  }));
  await page.type('#ink-text', '先写一半，不想发了');
  await page.evaluate(() => { [...document.querySelectorAll('.sheet button')].find(b => b.textContent === '取消').click(); });
  await sleep(400);
  check('点取消后面板关闭', await page.evaluate(() => !document.querySelector('.sheet')));
  // 带图发布
  await page.evaluate(() => document.querySelector('#btn-ink').click());
  await sleep(600);
  await page.evaluate(() => { document.querySelector('#ink-text').value = ''; });
  await page.type('#ink-text', '带图留言验收：今天对的题发了截图');
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8//8/AzGAiShVowoJAgCCTQMDzCTELgAAAABJRU5ErkJggg==';
  await page.evaluate(b64 => {
    const dt = new DataTransfer();
    const bin = atob(b64.split(',')[1]); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    dt.items.add(new File([arr], 't.png', { type: 'image/png' }));
    document.querySelector('#ink-img').files = dt.files;
    document.querySelector('#ink-img').dispatchEvent(new Event('change'));
  }, tinyPng);
  await sleep(500);
  check('图片预览出现', await page.evaluate(() => !document.querySelector('#ink-preview').hidden));
  await page.evaluate(() => { [...document.querySelectorAll('.sheet button')].find(b => b.textContent === '发布').click(); });
  await sleep(1200);
  const lastMsg = await page.evaluate(async () => {
    const l = (await (await fetch('/api/messages')).json()).messages;
    return l[l.length - 1];
  });
  check('留言带图发布成功（服务端落盘）', lastMsg && lastMsg.img && lastMsg.img.startsWith('/msgimg/'), lastMsg);
  check('图片可访问', lastMsg.img && await page.evaluate(u => fetch(u).then(r => r.status), lastMsg.img) === 200);
  // 点便签 → 详情含图
  await page.evaluate(() => document.querySelector('.ink-note').click());
  await sleep(600);
  check('点便签弹出详情面板', await page.evaluate(() => !!document.querySelector('.sheet')));
  check('详情面板显示图片', await page.evaluate(() => !!document.querySelector('.sheet img[src^="/msgimg/"]')));
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'j4_ink_img.png') });
  await page.evaluate(() => XC.closeSheet());
  await sleep(300);

  console.log('\n[3] 手机端留言墙（390px）');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:3456/#/', { waitUntil: 'networkidle2' });
  await sleep(1000);
  const mob = await page.evaluate(() => {
    const w = document.querySelector('#ink-wall');
    if (!w) return { exists: false };
    const r = w.getBoundingClientRect();
    return { exists: true, visible: r.width > 0 && r.height > 0, top: Math.round(r.top) };
  });
  check('手机端留言墙渲染且可见', mob.exists && mob.visible, mob);
  await page.screenshot({ path: path.join(__dirname, 'shots5', 'j5_mobile_wall.png') });

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  await page.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
