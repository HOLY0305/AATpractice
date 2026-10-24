/* 多选题专项验收：点选不判分 → 提交才判分 → 判定/展示正确 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = 'http://localhost:3456';
const OUT = path.join(__dirname, 'shots2');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOGF = path.join(OUT, 'run.txt');
require('fs').writeFileSync(LOGF, '');
const _log = console.log.bind(console);
console.log = (...a) => { _log(...a); require('fs').appendFileSync(LOGF, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); };
let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (info ? '  → ' + JSON.stringify(info) : '')); }
}

const PID = process.env.MULTI_ID || '0304960e9d';

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  // 直接加载该卷（该卷未在历史测试中使用过，第 1 题为未作答状态）
  await page.goto(BASE + '/#/p/' + PID, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });

  // 第 1 题就是多选（答案 AD）
  const head = await page.evaluate(() => ({
    tag: document.querySelector('.qhead .tag-multi') ? document.querySelector('.qhead .tag-multi').textContent : null,
    btn: !!document.querySelector('#btn-submit'),
    hasResult: !!document.querySelector('.result'),
  }));
  check('多选题显示「多选」徽章', head.tag === '多选', head);
  check('底部是「提交答案」而非提示语', head.btn, head);
  check('未作答时不显示解析', !head.hasResult, head);

  // 点一个选项 → 不应判分
  await page.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
  await sleep(500);
  const s1 = await page.evaluate(() => ({
    picked: document.querySelectorAll('#opts .opt.picked').length,
    hasResult: !!document.querySelector('.result'),
    btnText: document.querySelector('#btn-submit')?.textContent || '',
    balance: document.querySelector('#nav-balance')?.textContent,
  }));
  check('点第一个选项只选中，不判分', s1.picked === 1 && !s1.hasResult, s1);
  check('按钮显示已选 1 项', /已选 1 项/.test(s1.btnText), s1);

  // 再点一个（正确项 D）
  await page.evaluate(() => document.querySelector('#opts .opt[data-l="D"]').click());
  await sleep(300);
  const s2 = await page.evaluate(() => ({
    picked: [...document.querySelectorAll('#opts .opt.picked')].map(e => e.dataset.l).sort().join(''),
    hasResult: !!document.querySelector('.result'),
    btnText: document.querySelector('#btn-submit')?.textContent || '',
  }));
  check('可继续多选（AD）', s2.picked === 'AD' && !s2.hasResult, s2);
  check('按钮显示已选 2 项', /已选 2 项/.test(s2.btnText), s2);

  // 取消再重选，验证 toggle
  await page.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
  await sleep(200);
  const s3 = await page.evaluate(() => [...document.querySelectorAll('#opts .opt.picked')].map(e => e.dataset.l).join(''));
  check('再次点击可取消选中', s3 === 'D', { picked: s3 });
  await page.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
  await sleep(200);

  // 提交 → 判定正确
  await page.screenshot({ path: path.join(OUT, 'multi_before_submit.png') });
  await page.evaluate(() => document.querySelector('#btn-submit').click());
  await page.waitForSelector('.result', { timeout: 10000 });
  await sleep(900);
  const r1 = await page.evaluate(() => ({
    verdict: document.querySelector('.verdict')?.className,
    text: document.querySelector('.verdict')?.textContent.trim(),
    ans: document.querySelector('.ans-line')?.textContent.trim(),
    correct: [...document.querySelectorAll('.opt.correct')].map(e => e.dataset.l).join(''),
    missed: document.querySelectorAll('.opt.missed').length,
    locked: !!document.querySelector('#opts.locked'),
  }));
  check('提交后判定正确', /ok/.test(r1.verdict) && /回答正确/.test(r1.text), r1);
  check('正确项全部标绿（AD）', r1.correct === 'AD', r1);
  check('无漏选标记', r1.missed === 0, r1);
  check('作答后锁定选项', r1.locked, r1);
  await page.screenshot({ path: path.join(OUT, 'multi_correct.png') });

  // 换一题（第 2 题）验证是新状态；再回第 1 题验证选中态已清空
  await page.evaluate(() => document.querySelector('#btn-next').click());
  await sleep(600);
  await page.evaluate(() => document.querySelector('#btn-prev').click());
  await sleep(600);
  const back = await page.evaluate(() => ({
    picked: document.querySelectorAll('#opts .opt.picked').length,
    hasResult: !!document.querySelector('.result'),
  }));
  check('回到已答题仍显示判定（不重开）', back.hasResult && back.picked === 0, back);

  // 部分正确的题：只选 A 提交 → 应判错并标出漏选 D
  await page.goto(BASE + '/#/p/' + PID, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });
  // 用题号面板跳到第 2 题（该题答案 ABD，可用「只选 A」构造漏选）
  await page.evaluate(() => document.querySelector('#btn-nav').click());
  await sleep(350);
  await page.evaluate(() => document.querySelector('#qnav button[data-i="1"]').click());
  await sleep(450);
  const q2 = await page.evaluate(() => ({
    multi: !!document.querySelector('.qhead .tag-multi'),
    idx: document.querySelector('.q-counter, .counter')?.textContent?.trim(),
    answered: !!document.querySelector('.result'),
  }));
  console.log('  第2题状态:', JSON.stringify(q2));
  if (q2.multi && !q2.answered) {
    await page.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
    await sleep(250);
    await page.evaluate(() => document.querySelector('#btn-submit').click());
    await page.waitForSelector('.result', { timeout: 10000 });
    await sleep(700);
    const r2 = await page.evaluate(() => ({
      verdict: document.querySelector('.verdict')?.className,
      missed: document.querySelectorAll('.opt.missed').length,
      text: document.querySelector('.ans-line')?.textContent.trim(),
    }));
    check('漏选被判错', /bad/.test(r2.verdict), r2);
    check('漏选正确项有「漏选」标记', r2.missed > 0, r2);
    await page.screenshot({ path: path.join(OUT, 'multi_partial.png') });
  } else {
    console.log('  · 第 2 题非多选，跳过漏选用例');
  }

  // 手机视口
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE + '/#/p/' + PID, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#opts .opt', { timeout: 15000 });
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    btn: !!document.querySelector('#btn-submit'),
  }));
  check('手机端无横向溢出', !mobile.overflow, mobile);
  check('手机端可见提交按钮', mobile.btn, mobile);
  await page.evaluate(() => document.querySelector('#opts .opt[data-l="A"]').click());
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'multi_mobile.png') });

  check('无页面 JS 异常', errs.length === 0, errs);
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await page.close();
  await browser.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); console.error(e.stack); process.exit(1); });
