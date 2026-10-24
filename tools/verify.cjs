// 浏览器自动化验收：真实渲染 + 交互 + 截图
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:3456';
const OUT = path.join(__dirname, 'shots');
const ZL = process.env.ZL_ID;   // 资料分析卷
const TX = process.env.TX_ID;   // 判断推理卷
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = { checks: [], errors: [] };

function check(name, ok, detail) {
  results.checks.push({ name, ok: !!ok, detail });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''));
}

// 等待页面内图片加载完成（或超时）
async function waitImages(page) {
  try {
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('img')];
      return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, { timeout: 8000 });
    return true;
  } catch (e) { return false; }
}

async function openPaper(page, id) {
  await page.goto(BASE + '/#/p/' + id, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector('.qcard'), { timeout: 20000 });
  await wait(300);
}

// 在卷内找到第一道“含图片选项”的题
async function findImageQuestion(page, maxScan = 30) {
  await page.evaluate(() => document.querySelector('#btn-nav').click());
  await wait(200);
  const total = await page.evaluate(() => document.querySelectorAll('#qnav button').length);
  for (let i = 0; i < Math.min(total, maxScan); i++) {
    await page.evaluate(idx => document.querySelectorAll('#qnav button')[idx].click(), i);
    await wait(200);
    const has = await page.evaluate(() => document.querySelectorAll('.opt img, .qstem img').length > 0);
    if (has) {
      await waitImages(page);
      return await page.evaluate(() => ({
        qNo: document.querySelector('.qhead .no')?.textContent,
        stemImgs: [...document.querySelectorAll('.qstem img')].map(x => x.naturalWidth),
        optImgs: [...document.querySelectorAll('.opt img')].map(x => x.naturalWidth),
        options: document.querySelectorAll('.opt').length,
      }));
    }
  }
  return null;
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });

  // ================= PC =================
  const page = await browser.newPage();
  page.on('pageerror', e => results.errors.push('PC pageerror: ' + e.message));
  page.on('requestfailed', r => results.errors.push('PC reqfail: ' + r.url().slice(0, 100)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(500);
  const home = await page.evaluate(() => ({
    papers: document.querySelectorAll('.paper-item').length,
    years: document.querySelectorAll('#f-year option').length,
    mods: document.querySelectorAll('#f-mod option').length,
  }));
  check('首页渲染试卷列表', home.papers > 0, home);
  const lbInit = await page.evaluate(() => getComputedStyle(document.querySelector('#lightbox')).display);
  check('初始状态遮罩层隐藏（不挡页面）', lbInit === 'none', { display: lbInit });
  await page.screenshot({ path: path.join(OUT, '01_home_pc.png') });

  await page.select('#f-mod', '06');
  await wait(300);
  const onlyZi = await page.evaluate(() => [...document.querySelectorAll('.paper-item .badge')].every(b => b.textContent === '资料分析'));
  check('按模块筛选生效', onlyZi, await page.evaluate(() => document.querySelectorAll('.paper-item').length));
  await page.screenshot({ path: path.join(OUT, '02_home_filtered.png') });

  // ---- 资料分析卷：材料 + 判题 + 材料跟随 ----
  await openPaper(page, ZL);
  const q1 = await page.evaluate(() => ({
    hasMaterial: !!document.querySelector('.material'),
    materialLen: document.querySelector('.material-body')?.textContent.trim().length || 0,
    stemLen: document.querySelector('.qstem')?.textContent.trim().length || 0,
    options: document.querySelectorAll('.opt').length,
    resultShown: !!document.querySelector('.result'),
    leakedAnswer: [...document.querySelectorAll('.opt')].some(o => /^答案[：:]/.test(o.textContent.trim())),
  }));
  check('资料分析：材料与题干均渲染', q1.hasMaterial && q1.materialLen > 50 && q1.stemLen > 5, q1);
  check('作答前不显示答案/解析', !q1.resultShown && !q1.leakedAnswer);
  await page.screenshot({ path: path.join(OUT, '03_question_pc.png'), fullPage: true });

  // 点错一个选项
  const wrongIdx = await page.evaluate(() => [...document.querySelectorAll('.opt')].findIndex(el => !el.classList.contains('correct')));
  await page.evaluate(i => document.querySelectorAll('.opt')[i].click(), wrongIdx >= 0 ? wrongIdx : 1);
  await wait(400);
  const after = await page.evaluate(() => ({
    verdict: document.querySelector('.verdict')?.textContent,
    ans: document.querySelector('.ans-line')?.textContent.replace(/\s+/g, ' '),
    analysisLen: document.querySelector('.analysis')?.textContent.length || 0,
    correct: document.querySelectorAll('.opt.correct').length,
    wrong: document.querySelectorAll('.opt.wrong').length,
    nextBtn: !!document.querySelector('#btn-go-next'),
  }));
  check('作答后立即判题：正确项标绿、错选项标红、显示答案+解析',
    /正确|错误/.test(after.verdict || '') && after.correct === 1 && after.wrong === 1 && after.analysisLen > 10 && after.nextBtn, after);
  await page.screenshot({ path: path.join(OUT, '04_answered_pc.png'), fullPage: true });

  await page.evaluate(() => document.querySelector('#btn-go-next').click());
  await wait(500);
  const next = await page.evaluate(() => ({
    idx: document.querySelector('.count')?.textContent,
    material: !!document.querySelector('.material'),
    materialBodyVisible: document.querySelector('.material-body') ? getComputedStyle(document.querySelector('.material-body')).display !== 'none' : false,
    qNo: document.querySelector('.qhead .no')?.textContent,
    resultShown: !!document.querySelector('.result'),
    options: document.querySelectorAll('.opt').length,
  }));
  check('资料分析：下一题仍显示同一材料，答案收起', next.material && next.materialBodyVisible && !next.resultShown && next.options > 0, next);
  await page.screenshot({ path: path.join(OUT, '05_next_in_material_pc.png'), fullPage: true });

  // ---- 判断推理卷：图片题 + 放大 ----
  const g = await browser.newPage();
  g.on('pageerror', e => results.errors.push('TX pageerror: ' + e.message));
  g.on('requestfailed', r => results.errors.push('TX reqfail: ' + r.url().slice(0, 100)));
  await g.setViewport({ width: 1280, height: 900 });
  await openPaper(g, TX);
  const imgQ = await findImageQuestion(g);
  check('图形推理：题目/选项图片真实加载（naturalWidth>0）',
    !!imgQ && [...imgQ.stemImgs, ...imgQ.optImgs].every(w => w > 0), imgQ);
  await g.screenshot({ path: path.join(OUT, '11_tuxing_pc.png'), fullPage: true });

  if (imgQ) {
    await g.evaluate(() => document.querySelector('.opt img, .qstem img').click());
    await wait(300);
    const lb = await g.evaluate(() => ({ open: !document.querySelector('#lightbox').hidden, src: (document.querySelector('#lightbox-img').src || '').split('/').pop() }));
    check('PC 点击图片放大', lb.open, lb);
    await g.screenshot({ path: path.join(OUT, '06_lightbox.png') });
    await g.evaluate(() => document.querySelector('#lightbox').click());
    const closed = await g.evaluate(() => document.querySelector('#lightbox').hidden);
    check('灯箱可关闭', closed);
  }

  // ================= 手机 =================
  const m = await browser.newPage();
  m.on('pageerror', e => results.errors.push('MOBILE pageerror: ' + e.message));
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(400);
  const mHome = await m.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, sw: document.documentElement.scrollWidth }));
  check('手机首页无横向溢出', !mHome.overflow, mHome);
  await m.screenshot({ path: path.join(OUT, '07_home_mobile.png') });

  await openPaper(m, ZL);
  const mQ = await m.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    material: !!document.querySelector('.material'),
    bodyVisible: document.querySelector('.material-body') ? getComputedStyle(document.querySelector('.material-body')).display !== 'none' : false,
    options: document.querySelectorAll('.opt').length,
    optW: Math.round(document.querySelector('.opt')?.getBoundingClientRect().width || 0),
  }));
  check('手机刷题页无横向溢出，材料可见', !mQ.overflow && mQ.material && mQ.bodyVisible && mQ.options > 0, mQ);
  await m.screenshot({ path: path.join(OUT, '08_question_mobile.png'), fullPage: true });

  await m.evaluate(() => document.querySelectorAll('.opt')[0].click());
  await wait(400);
  const mAns = await m.evaluate(() => ({
    verdict: document.querySelector('.verdict')?.textContent,
    analysis: (document.querySelector('.analysis')?.textContent || '').length,
    hasNext: !!document.querySelector('#btn-go-next'),
    wrongMarked: document.querySelectorAll('.opt.wrong').length,
  }));
  check('手机作答后判题+解析+下一题按钮', /正确|错误/.test(mAns.verdict || '') && mAns.analysis > 10 && mAns.hasNext, mAns);
  await m.screenshot({ path: path.join(OUT, '09_answered_mobile.png'), fullPage: true });

  await m.evaluate(() => document.querySelector('#btn-go-next').click());
  await wait(500);
  const mNext = await m.evaluate(() => ({
    material: !!document.querySelector('.material'),
    bodyVisible: document.querySelector('.material-body') ? getComputedStyle(document.querySelector('.material-body')).display !== 'none' : false,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    qNo: document.querySelector('.qhead .no')?.textContent,
    collapsed: document.querySelector('.material')?.classList.contains('collapsed'),
  }));
  check('手机：同一材料下一题材料仍展开可见', mNext.material && mNext.bodyVisible && !mNext.collapsed && !mNext.overflow, mNext);
  await m.screenshot({ path: path.join(OUT, '10_next_mobile.png'), fullPage: true });

  // 手机图片放大（判断推理卷图片题）
  await openPaper(m, TX);
  const mImgQ = await findImageQuestion(m);
  if (mImgQ) {
    await m.evaluate(() => document.querySelector('.opt img, .qstem img').click());
    await wait(300);
    const mLb = await m.evaluate(() => !document.querySelector('#lightbox').hidden);
    check('手机点击图片放大', mLb, mImgQ);
    await m.screenshot({ path: path.join(OUT, '12_lightbox_mobile.png') });
    await m.evaluate(() => document.querySelector('#lightbox').click());
  } else {
    check('手机点击图片放大', false, '未找到含图题目');
  }

  // 进度持久化
  await m.reload({ waitUntil: 'networkidle2' });
  await wait(700);
  const persisted = await m.evaluate(() => {
    const raw = localStorage.getItem('xingce_progress_v1');
    if (!raw) return 0;
    const o = JSON.parse(raw);
    return Object.keys(o).length;
  });
  check('答题进度持久化到 localStorage', persisted > 0, { papers: persisted });

  console.log('\n=== 页面异常 ===');
  console.log(results.errors.length ? results.errors.slice(0, 10).join('\n') : '无');
  const pass = results.checks.filter(c => c.ok).length;
  console.log('\n通过: ' + pass + '/' + results.checks.length);
  await browser.disconnect();
  process.exit(pass === results.checks.length && results.errors.length === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
