/* 一键拉取上游数据（零依赖，仅 Windows 用 PowerShell 解压）
 * 1. 题库：ERRRC/xingcezhenti（2016–2026 行测真题 Markdown）→ data/xingcezhenti/
 * 2. 考点树：ERRRC/kaogongzhentizhengliu 的 git 文件树 → tools/vendor/tree.json
 *    （只取路径清单用于构建 knowledge.json / materials.json，不下载 290MB 笔记正文）
 * 运行：node tools/fetch-bank.cjs
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'data', 'xingcezhenti');
const BANK_ZIP = path.join(ROOT, 'data', 'xingcezhenti.zip');
const BANK_ZIP_URL = process.env.XC_ZIP_URL || 'https://codeload.github.com/ERRRC/xingcezhenti/zip/refs/heads/main';
const TREE_URL = 'https://api.github.com/repos/ERRRC/kaogongzhentizhengliu/git/trees/main?recursive=1';
const TREE_OUT = path.join(ROOT, 'tools', 'vendor', 'tree.json');

const log = s => console.log('  ' + s);

function download(url, dest, headers) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects) => {
      if (redirects > 5) return reject(new Error('重定向过多'));
      https.get(u, { headers: headers || {} }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + u)); }
        const total = +(res.headers['content-length'] || 0);
        let done = 0, lastPct = -1;
        const out = fs.createWriteStream(dest);
        res.on('data', c => {
          done += c.length;
          if (total) {
            const pct = Math.floor(done / total * 100);
            if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; process.stdout.write(`\r  下载 ${pct}%  (${Math.round(done / 1048576)}MB)`); }
          }
        });
        res.pipe(out);
        out.on('finish', () => { if (total) process.stdout.write('\n'); resolve(); });
        out.on('error', reject);
      }).on('error', reject);
    };
    get(url, 0);
  });
}

async function fetchBank() {
  // 判定：目录已存在且题库 README 在 → 跳过
  if (fs.existsSync(path.join(BANK_DIR, 'README.md'))) {
    log('题库已存在：data/xingcezhenti（如需重新下载请先删除该目录）');
    return;
  }
  fs.mkdirSync(path.dirname(BANK_ZIP), { recursive: true });
  log('下载题库 ERRRC/xingcezhenti（约 260MB，视网速几分钟）…');
  await download(BANK_ZIP_URL, BANK_ZIP);
  log('解压中（PowerShell Expand-Archive）…');
  const extractDir = path.join(ROOT, 'data', '_bank_extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath "${BANK_ZIP}" -DestinationPath "${extractDir}" -Force`],
    { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('解压失败，可手动解压 ' + BANK_ZIP + ' 后把内容放到 ' + BANK_DIR);
  // zip 根目录形如 xingcezhenti-main/，拍平到 data/xingcezhenti
  const inner = fs.readdirSync(extractDir).map(n => path.join(extractDir, n))
    .find(p => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'README.md')));
  if (!inner) throw new Error('解压结果异常：找不到题库根目录');
  fs.rmSync(BANK_DIR, { recursive: true, force: true });
  fs.renameSync(inner, BANK_DIR);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(BANK_ZIP, { force: true });   // 释放空间（zip 已不需要）
  log('题库就绪：data/xingcezhenti');
}

async function fetchTree() {
  if (fs.existsSync(TREE_OUT)) { log('考点树已存在：tools/vendor/tree.json'); return; }
  log('拉取考点库文件树（kaogongzhentizhengliu · 仅路径清单）…');
  await download(TREE_URL, TREE_OUT, { 'User-Agent': 'xingce-web', 'Accept': 'application/vnd.github+json' });
  const j = JSON.parse(fs.readFileSync(TREE_OUT, 'utf8'));
  if (!j.tree) throw new Error('tree.json 内容异常（GitHub API 限流？稍后再试或手动下载）');
  log('考点树就绪：tools/vendor/tree.json（' + j.tree.length + ' 条路径）');
}

(async () => {
  console.log('== 上游数据拉取 ==');
  try { await fetchBank(); } catch (e) { console.error('题库拉取失败：' + e.message); process.exitCode = 1; }
  try { await fetchTree(); } catch (e) { console.error('考点树拉取失败：' + e.message); process.exitCode = 1; }
  console.log('完成。接下来运行：node tools/build.mjs && node tools/build-knowledge.cjs（或双击 重建数据.bat）');
})();
