/* 从 GitHub 文件树（tree.json）构建 xingce-web/app/data/knowledge.json + materials.json + qidmap.json
 * 层级：模块 → 大类（MOC 笔记）→ 考点群（按名称前缀聚类）→ 微考点（逐题粒度）
 * 真题计数：10-真题/<模块>/<大类>/*.md 的路径统计
 * 树源查找顺序：XC_TREE 环境变量 → tools/vendor/tree.json（tools/fetch-bank.cjs 下载）
 *              → ../vendor/tree.json（旧位置）→ 自动从 GitHub Trees API 拉取
 * 运行：node tools/build-knowledge.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TREE = process.env.XC_TREE
  || path.join(ROOT, 'tools', 'vendor', 'tree.json')
  || path.join(ROOT, '..', 'vendor', 'tree.json');
const TREE_URL = 'https://api.github.com/repos/ERRRC/kaogongzhentizhengliu/git/trees/main?recursive=1';
const OUT = path.join(ROOT, 'app', 'data', 'knowledge.json');

function loadTree() {
  if (fs.existsSync(TREE)) return JSON.parse(fs.readFileSync(TREE, 'utf8'));
  console.log('本地无 tree.json，从 GitHub Trees API 拉取（curl）…');
  fs.mkdirSync(path.dirname(TREE), { recursive: true });
  const { execSync } = require('child_process');
  execSync(`curl -sL -H "User-Agent: xingce-web" -H "Accept: application/vnd.github+json" -o "${TREE}" "${TREE_URL}"`,
    { stdio: 'inherit' });
  const j = JSON.parse(fs.readFileSync(TREE, 'utf8'));
  if (!j.tree) throw new Error('tree.json 内容异常（GitHub API 限流？稍后再试）');
  return j;
}

const t = loadTree();
const paths = t.tree.filter(x => x.type === 'blob').map(x => x.path);

/* ---------- 考点解析 ---------- */
const pointFiles = paths.filter(p => /^20-考点\/[^/]+\/[^/]+\/[^/]+\.md$/.test(p));
const qFiles = paths.filter(p => /^10-真题\//.test(p));
const moduleOverviews = {};
paths.filter(p => /^20-考点\/[^/]+\/00-总览\.md$/.test(p))
  .forEach(p => { moduleOverviews[p.split('/')[1]] = p; });

const baseName = name => {
  // 「一般增长率比较（增速最快）」→「一般增长率比较」；「A计算＋B匹配」→「A计算」
  const m = name.split(/[（(＋+]/)[0].trim();
  return m.length >= 3 && m.length < name.length ? m : name;
};

const modules = {};
for (const p of pointFiles) {
  const [, mod, cat, file] = p.split('/');
  modules[mod] = modules[mod] || { _cats: {} };
  modules[mod]._cats[cat] = modules[mod]._cats[cat] || [];
  modules[mod]._cats[cat].push({
    name: file.replace(/\.md$/, ''),
    path: p,
  });
}

/* 真题计数：10-真题/<模块>/<大类>/… */
const qByCat = {};
for (const p of qFiles) {
  const s = p.split('/');
  if (s.length >= 4) {
    const key = s[1] + '/' + s[2];
    qByCat[key] = (qByCat[key] || 0) + 1;
  }
}

const out = {
  generatedAt: Date.now(),
  source: 'ERRRC/kaogongzhentizhengliu',
  note: '层级来自仓库文件树；考点群为名称前缀聚类；真题计数按 10-真题 路径统计。',
  stats: { points: pointFiles.length, questions: qFiles.length, cats: 0 },
  modules: Object.keys(modules).map(mod => {
    const cats = Object.keys(modules[mod]._cats).map(cat => {
      const pts = modules[mod]._cats[cat];
      // 名称前缀聚类 → 考点群
      const groups = {};
      for (const p of pts) {
        const g = baseName(p.name);
        (groups[g] = groups[g] || { name: g, points: [] }).points.push(p);
      }
      const groupList = Object.values(groups)
        .sort((a, b) => b.points.length - a.points.length)
        .map(g => ({
          name: g.name,
          n: g.points.length,
          points: g.points.sort((a, b) => a.name.localeCompare(b.name, 'zh')),
        }));
      return {
        id: mod + '/' + cat,
        name: cat,
        q: qByCat[mod + '/' + cat] || 0,
        groups: groupList,
      };
    }).sort((a, b) => b.q - a.q);
    return {
      id: mod,
      name: mod,
      overview: moduleOverviews[mod] || null,
      q: qByCat[mod] || cats.reduce((s, c) => s + c.q, 0),
      cats,
    };
  }),
};

const catCount = out.modules.reduce((s, m) => s + m.cats.length, 0);
out.stats.cats = catCount;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const nGroups = out.modules.reduce((s, m) => s + m.cats.reduce((x, c) => x + c.groups.length, 0), 0);
console.log('knowledge.json 写入完成:',
  out.modules.length, '个模块 /',
  out.stats.cats, '个大类 /', nGroups, '个考点群 /', out.stats.points, '个微考点 /', out.stats.questions, '道真题');console.log('大小:', Math.round(fs.statSync(OUT).size / 1024), 'KB');

/* ---------- 材料清单（15-材料/资料分析/*.md） ---------- */
const APP_DATA = path.join(ROOT, 'app', 'data');
const matFiles = paths.filter(p => /^15-材料\/资料分析\/[^/]+\.md$/.test(p));
const materials = {
  generatedAt: Date.now(),
  source: 'ERRRC/kaogongzhentizhengliu',
  count: matFiles.length,
  items: matFiles.map(p => {
    const base = p.split('/').pop().replace(/\.md$/, '');
    const m = base.match(/^(\d+)\s+(.*)$/);
    return { mid: m ? m[1] : '', title: m ? m[2] : base, path: p };
  }).sort((a, b) => a.mid.localeCompare(b.mid)),
};
fs.writeFileSync(path.join(APP_DATA, 'materials.json'), JSON.stringify(materials));
console.log('materials.json 写入完成:', materials.count, '篇材料 /',
  Math.round(fs.statSync(path.join(APP_DATA, 'materials.json')).size / 1024), 'KB');

/* ---------- qid 索引（本站题库 qid → 试卷#题号，用于考点跳转练习） ---------- */
const PAPERS_DIR = path.join(APP_DATA, 'papers');
const qidmap = {};
let qn = 0;
if (fs.existsSync(PAPERS_DIR)) {
  for (const f of fs.readdirSync(PAPERS_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(PAPERS_DIR, f), 'utf8'));
      let idx = 0;
      for (const g of (j.groups || [])) {
        for (const q of (g.questions || [])) {
          if (q.qid) qidmap[String(q.qid)] = j.id + '|' + idx;
          idx++; qn++;
        }
      }
    } catch (e) { /* skip bad file */ }
  }
}
fs.writeFileSync(path.join(APP_DATA, 'qidmap.json'), JSON.stringify(qidmap));
console.log('qidmap.json 写入完成:', Object.keys(qidmap).length, '/', qn, '题 /',
  Math.round(fs.statSync(path.join(APP_DATA, 'qidmap.json')).size / 1024), 'KB');

/* ---------- 仓库真题 qid 与本站题库的重合率 ---------- */
const vaultQids = qFiles
  .map(p => p.split('/').pop().match(/^(\d+)/))
  .filter(Boolean).map(m => m[1]);
const hit = vaultQids.filter(q => qidmap[q]).length;
console.log('考点仓库真题 qid:', vaultQids.length, '其中本站可练:', hit,
  '(' + (vaultQids.length ? Math.round(hit / vaultQids.length * 100) : 0) + '%)');
