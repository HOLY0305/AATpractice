/* 共享：确保有 Edge CDP（沙箱会在 node 退出后杀掉子进程，所以每个脚本各自拉起） */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function httpGet(url, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function ensureEdge() {
  try { await httpGet('http://127.0.0.1:9222/json/version'); return 'already'; }
  catch (e) { /* 需要启动 */ }
  const exe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const args = ['--headless=new', '--remote-debugging-port=9222',
    '--user-data-dir=' + path.join(__dirname, 'uds-fix'),
    '--disable-features=WebContentsForceDark', '--no-first-run', '--window-size=1280,900'];
  const child = spawn(exe, args, { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400));
    try { await httpGet('http://127.0.0.1:9222/json/version'); return 'spawned-' + child.pid; }
    catch (e) { /* 继续等 */ }
  }
  throw new Error('Edge CDP 启动失败');
}

module.exports = { ensureEdge, httpGet };
