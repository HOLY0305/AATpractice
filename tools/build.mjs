// 行测真题网站 - 构建脚本：Markdown 题库 -> 结构化 JSON
// 用法: node tools/build.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.XC_SRC || path.join(ROOT, 'data', 'xingcezhenti');
const OUT = process.env.XC_OUT || path.join(ROOT, 'app', 'data');
const IMG_PREFIX = '/img/';

const MODULE_DIRS = ['01-政治理论', '02-常识判断', '03-言语理解与表达', '04-数量关系', '05-判断推理', '06-资料分析'];

const stats = { files: 0, papers: 0, questions: 0, groups: 0, anomalies: [] };

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\S+):\s*"?(.*?)"?\s*$/);
      if (kv) meta[kv[1].trim()] = kv[2].trim();
    }
    text = text.slice(m[0].length);
  }
  return { meta, body: text };
}

// 行内 markdown 轻量转换：保留已有 HTML，仅处理 **粗体**
function inlineMd(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function fixImgSrc(s) {
  return s.replace(/src="\.\.\/90-图片\//g, `src="${IMG_PREFIX}`).replace(/src='\.\.\/90-图片\//g, `src="${IMG_PREFIX}`);
}

function cleanContent(s) {
  s = s.replace(/[\u3000\s]*✅[\u3000\s]*$/g, ''); // 去掉正确项标记
  s = s.replace(/\s+$/, '');
  return inlineMd(fixImgSrc(s));
}

// 把纯文本段落（无 <p>）包成段落
function toParagraphHtml(s) {
  if (/<p[ >]/i.test(s)) return s;
  return s.split(/\n{2,}/).map(p => `<p>${inlineMd(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function parseQuestionBlock(header, content, anomalies, ctx) {
  const q = { no: null, qid: null, tag: '', stem: '', options: [], answer: '', answerText: '', analysis: '' };
  const hm = header.match(/第\s*([\d一二三四五六七八九十百]+)\s*题/);
  if (hm) q.no = hm[1];
  const qm = header.match(/qid\s*(\d+)/);
  if (qm) q.qid = qm[1];
  const tm = header.match(/·\s*([^<\]]+?)\s*<\/sub>/);
  if (tm) q.tag = tm[1].trim();

  // 答案行
  const ansM = content.match(/\*\*答案\*\*[：:]\s*(.+)/);
  if (ansM) {
    const letters = ansM[1].match(/[A-H]/g);
    if (letters && ansM[1].replace(/[^A-Za-z\u4e00-\u9fff、,，\s～~.．]/g, '').replace(/[\s,，、]+/g, '').match(/^[A-H]+$/i)) {
      q.answer = letters.join('');
    } else {
      q.answerText = ansM[1].trim();
    }
  }

  // 解析
  const aIdx = content.search(/\*\*官方解析\*\*/);
  if (aIdx >= 0) {
    q.analysis = toParagraphHtml(fixImgSrc(content.slice(aIdx + 7).replace(/^\s*/, '')).trim());
    content = content.slice(0, aIdx);
  }
  // 剔除答案行（避免泄漏进选项）
  content = content.replace(/\*\*答案\*\*[：:][^\n]*/g, '');

  // 选项
  const optRe = /^[-*]\s*\*\*([A-H])\*\*[.．、:：]?\s*/;
  const lines = content.split(/\r?\n/);
  let stemLines = [];
  let curOpt = null;
  for (const line of lines) {
    const om = line.match(optRe);
    if (om) {
      if (curOpt) q.options.push(curOpt);
      curOpt = { letter: om[1], html: '', correct: /✅/.test(line) };
      let rest = line.slice(om[0].length);
      curOpt.html += cleanContent(rest);
    } else if (curOpt) {
      curOpt.html += '<br>' + cleanContent(line.trim());
    } else {
      stemLines.push(line);
    }
  }
  if (curOpt) q.options.push(curOpt);
  q.stem = toParagraphHtml(fixImgSrc(stemLines.join('\n').trim()));
  q.stem = q.stem.replace(/<p>\s*<\/p>/g, '');

  // 判断题：源数据用 "（选项）[]" 占位，答案 A=正确 / B=错误
  if (q.options.length === 0 && /（选项）\[\]/.test(content)) {
    q.stem = q.stem.replace(/<p>\s*（选项）\[\]\s*<\/p>/g, '').replace(/（选项）\[\]/g, '');
    q.judge = true;
    q.options = [
      { letter: 'A', html: '正确', correct: q.answer === 'A' },
      { letter: 'B', html: '错误', correct: q.answer === 'B' },
    ];
  }

  // ✅ 与答案行互相校验
  const marked = q.options.filter(o => o.correct).map(o => o.letter).join('');
  if (marked && q.answer && marked !== q.answer) {
    anomalies.push(`${ctx}: qid=${q.qid} 标记${marked}/答案${q.answer} 不一致`);
    // 以 ✅ 标记为准（官方题库导出时即标在选项上）
  }
  if (!marked && q.answer) {
    for (const l of q.answer) { const o = q.options.find(x => x.letter === l); if (o) o.correct = true; }
  }
  if (!marked && !q.answer && !q.answerText) {
    q.answerText = q.answerText || '源数据缺失答案';
    anomalies.push(`${ctx}: qid=${q.qid} 无答案`);
  }
  return q;
}

// 逐行状态机解析：材料组 (## 材料 N) 与题目 (## 第 N 题 / ### 第 N 题)
function parseModuleFile(relPath, fullText) {
  const { meta, body } = parseFrontmatter(fullText);
  const lines = body.split(/\r?\n/);
  const groups = [];
  let curGroup = null;      // { materialLines: [], questions: [] }
  let curQ = null;          // { header, lines }
  let preamble = [];        // 文件头（标题、> 摘要），丢弃

  const flushQ = () => {
    if (!curQ) return;
    const text = curQ.lines.join('\n').replace(/\n?-{3,}\s*$/g, '');
    const q = parseQuestionBlock(curQ.header, text, stats.anomalies, relPath);
    curGroup.questions.push(q);
    curQ = null;
  };
  const flushGroup = () => {
    flushQ();
    if (!curGroup) return;
    const materialHtml = curGroup.materialLines.join('\n').trim()
      ? toParagraphHtml(fixImgSrc(curGroup.materialLines.join('\n').trim())).replace(/<p>\s*<\/p>/g, '')
      : '';
    if (curGroup.questions.length === 0 && !materialHtml) { curGroup = null; return; }
    if (curGroup.isMaterial && curGroup.questions.length === 0) {
      stats.anomalies.push(`${relPath}: 材料组无题目`);
    }
    stats.groups++;
    stats.questions += curGroup.questions.length;
    groups.push({ material: materialHtml, questions: curGroup.questions });
    curGroup = null;
  };

  for (const line of lines) {
    if (/^##\s*材料/.test(line)) {           // 新材料组
      flushGroup();
      curGroup = { isMaterial: true, materialLines: [], questions: [] };
      continue;
    }
    if (/^#{2,3}\s*第\s*[0-9一二三四五六七八九十百]+\s*题/.test(line)) {  // 新题目
      if (!curGroup) curGroup = { isMaterial: false, materialLines: [], questions: [] };
      flushQ();
      curQ = { header: line, lines: [] };
      continue;
    }
    if (curQ) curQ.lines.push(line);
    else if (curGroup) curGroup.materialLines.push(line);
    else preamble.push(line);
  }
  flushGroup();
  return { meta, groups };
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'papers'), { recursive: true });
  const index = [];
  for (const dir of MODULE_DIRS) {
    const d = path.join(SRC, dir);
    if (!fs.existsSync(d)) { console.error('缺少模块目录: ' + dir); continue; }
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.md') || /^README/i.test(f)) continue;
      const full = path.join(d, f);
      const relPath = dir + '/' + f;
      const text = fs.readFileSync(full, 'utf-8');
      stats.files++;
      let parsed;
      try { parsed = parseModuleFile(relPath, text); } catch (e) {
        stats.anomalies.push(`${relPath}: 解析异常 ${e.message}`);
        continue;
      }
      const id = crypto.createHash('md5').update(relPath, 'utf8').digest('hex').slice(0, 10);
      const modCode = dir.slice(0, 2);
      const data = {
        id, module: modCode, moduleName: dir.slice(3),
        paper: parsed.meta['试卷'] || f.replace(/\.md$/, ''),
        region: parsed.meta['地区'] || '', year: parsed.meta['年份'] || '',
        count: parsed.groups.reduce((s, g) => s + g.questions.length, 0),
        groups: parsed.groups,
      };
      if (!data.count) { stats.anomalies.push(`${relPath}: 0 题`); continue; }
      fs.writeFileSync(path.join(OUT, 'papers', id + '.json'), JSON.stringify(data));
      index.push({ id, module: data.module, moduleName: data.moduleName, paper: data.paper, region: data.region, year: data.year, count: data.count });
      stats.papers++;
    }
  }
  index.sort((a, b) => (b.year - a.year) || a.paper.localeCompare(b.paper) || a.module.localeCompare(b.module));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(OUT, 'anomalies.json'), JSON.stringify(stats.anomalies, null, 2));
  console.log(`构建完成: ${stats.files} 个源文件 -> ${stats.papers} 份卷-模块, ${stats.questions} 题, ${stats.groups} 个材料组`);
  console.log(`异常 ${stats.anomalies.length} 条, 见 app/data/anomalies.json`);
}

main();
