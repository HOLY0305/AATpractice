// 行测真题网站 - 本地服务（零依赖，Node >= 18）
// 数据层：data/config.json（全局配置）+ data/users/*.json（每个用户一份）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 3456;
const DATA = path.join(ROOT, 'data');
const USERS_DIR = path.join(DATA, 'users');
const CONFIG_FILE = path.join(DATA, 'config.json');
const USER_INDEX = path.join(USERS_DIR, '_index.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

/* ================= 基础工具 ================= */
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}
function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
// 原子写：先写 .tmp 再 rename，避免断电/并发导致文件损坏
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function safeJoin(base, urlPath) {
  const p = path.normalize(path.join(base, urlPath));
  if (!p.startsWith(path.normalize(base))) return null;
  return p;
}
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function uid() { return 'u_' + Math.random().toString(36).slice(2, 10); }

/* ================= 默认配置 ================= */
const DEFAULT_CONFIG = {
  version: 1,
  adminPin: '8888',
  ai: {
    // mode: builtin=用内置 Key | custom=用用户自己的 Key | off=关闭
    mode: 'builtin',
    allowAnswerContext: false,   // 做题时是否把答案/解析发给 AI（默认不发，防剧透）
    maxTurns: 12,
    builtin: { baseUrl: 'mock', model: 'demo', apiKey: 'sk-mock-demo', label: '内置模型' },
  },
  points: {
    correct: 10,        // 首次答对
    wrong: 2,           // 首次答错（鼓励做题）
    firstSolve: 5,      // 首次就答对的额外奖励
    redoCorrect: 5,     // 之前错过、重做答对
    dailyGoal: 30,      // 每日目标题数
    dailyGoalBonus: 20, // 达成奖励
  },
  shop: [
    { id: 'sp_skip', name: '免做卡', desc: '跳过一道题，不计入正确率', cost: 120, stock: 9, label: '券', enabled: true },
    { id: 'sp_double', name: '双倍积分卡', desc: '接下来 30 分钟的答题积分翻倍', cost: 200, stock: 5, label: '倍', enabled: true },
    { id: 'sp_clear', name: '错题赦免券', desc: '把 5 道错题标记为已掌握', cost: 150, stock: 8, label: '赦', enabled: true },
    { id: 'sp_title', name: '自定义称号', desc: '在个人主页展示你的专属称号', cost: 80, stock: 99, label: '号', enabled: true },
    { id: 'sp_coffee', name: '一杯咖啡', desc: '找自己兑换一杯咖啡，学习也要有奖励', cost: 500, stock: 12, label: '咖', enabled: true },
  ],
};

const DEFAULT_USER_SETTINGS = {
  aiMode: 'inherit',   // inherit=跟随全局 | builtin | custom | off
  aiKey: '', aiBaseUrl: '', aiModel: '',
  theme: 'auto',
  title: '',
};

function normalizeConfig(c) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const out = Object.assign(base, c || {});
  out.ai = Object.assign(base.ai, (c && c.ai) || {});
  out.ai.builtin = Object.assign(base.ai.builtin, (c && c.ai && c.ai.builtin) || {});
  out.points = Object.assign(base.points, (c && c.points) || {});
  if (!Array.isArray(out.shop)) out.shop = base.shop;
  return out;
}
function loadConfig() {
  const c = normalizeConfig(readJson(CONFIG_FILE, null));
  if (!fs.existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, c);
  return c;
}
// 给前端看的配置：抹掉内置 Key，只告诉有没有配
function publicConfig(c) {
  const o = JSON.parse(JSON.stringify(c));
  const key = (o.ai.builtin.apiKey || '').trim();
  o.ai.builtin.apiKey = '';
  o.ai.builtin.hasKey = !!key;
  o.ai.builtin.keyHint = key ? key.slice(0, 4) + '••••' + key.slice(-4) : '';
  delete o.adminPin;
  o.hasPin = !!c.adminPin;
  return o;
}

/* ================= 用户存储 ================= */
function hashPass(p) { return crypto.createHash('sha256').update('xingce::' + p).digest('hex'); }
// OpenAI 兼容地址规范化：没有 /v1 版本段时自动补上（api.deepseek.com → api.deepseek.com/v1）
function apiBase(b) {
  b = String(b || '').trim().replace(/\/+$/, '');
  if (!b || /^mock$/i.test(b)) return b;
  if (!/\/v\d+([/?#]|$)/i.test(b)) b += '/v1';
  return b;
}
function loadIndex() {
  let idx = readJson(USER_INDEX, null);
  if (!idx || !Array.isArray(idx.users)) {
    idx = { users: [], current: null };
    writeJson(USER_INDEX, idx);
  }
  return idx;
}
function newUser(name) {
  return {
    id: uid(),
    name: name || '新用户',
    role: 'user',
    createdAt: Date.now(),
    points: { balance: 0, total: 0, spent: 0 },
    settings: JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS)),
    papers: {},        // { paperId: { qid: { l, ok, t, ms, n } } }
    wrong: {},         // { qid: { qid, pid, module, tag, wrong, tries, streak, status, nextReview, lastAt, lastWrongAt, ms, label, note, snap } }
    ledger: [],        // 积分流水（新→旧）
    redemptions: [],
    stats: { answered: 0, correct: 0, ms: 0, days: {} },
    daily: { date: '', count: 0, bonusGiven: false },
  };
}
function userFile(id) { return path.join(USERS_DIR, id + '.json'); }
function loadUser(id) {
  if (!/^u_[a-z0-9]+$/i.test(id || '')) return null;
  return readJson(userFile(id), null);
}
function saveUser(u) { writeJson(userFile(u.id), u); }

// 首次运行：建一个默认用户，用户打开就能直接刷题
(function ensureDefaultUser() {
  fs.mkdirSync(USERS_DIR, { recursive: true });
  loadConfig();
  const idx = loadIndex();
  if (!idx.users.length) {
    const u = newUser('我');
    saveUser(u);
    idx.users.push({ id: u.id, name: u.name, createdAt: u.createdAt });
    writeJson(USER_INDEX, idx);
  }
})();

/* ================= 积分与错题逻辑 ================= */
function pushLedger(u, entry) {
  entry.balance = u.points.balance;
  u.ledger.unshift(entry);
  if (u.ledger.length > 400) u.ledger.length = 400;
}

// 间隔重复：连续答对次数 → 下次复习天数
const REVIEW_STEPS = [1, 3, 7, 15, 30];

function buildAiSystem(ctx) {
  const lines = [
    '你是一位耐心的中国公务员考试（行测）辅导老师。学生正在刷题，遇到疑问会向你提问。',
    '回答要求：讲清思路与方法，分步骤、简明扼要；常用技巧可给口诀；不要冗长客套；用中文。',
    '默认侧重引导思考；只有当学生明确想知道答案、且题目信息里带有答案时，才给出答案并解释。',
  ];
  if (ctx && ctx.stem) {
    lines.push('');
    lines.push('【学生正在看的题】');
    lines.push('模块：' + (ctx.moduleName || '') + (ctx.tag ? ' · 考点：' + ctx.tag : ''));
    if (ctx.material) lines.push('材料（节选）：' + String(ctx.material).slice(0, 1500));
    lines.push('题干：' + String(ctx.stem).slice(0, 2500));
    if (Array.isArray(ctx.options) && ctx.options.length) {
      lines.push('选项：');
      for (const o of ctx.options) lines.push(o.letter + '. ' + String(o.text || '').slice(0, 400));
    }
    if (ctx.answer) {
      lines.push('正确答案：' + ctx.answer);
      if (ctx.analysis) lines.push('官方解析：' + String(ctx.analysis).slice(0, 3000));
    } else {
      lines.push('（学生尚未作答，系统未提供答案——请引导思考，不要猜测或编造答案。）');
    }
  }
  return lines.join('\n');
}

function applyAnswer(u, cfg, p) {
  const pid = String(p.pid || ''), qid = String(p.qid || '');
  if (!pid || !qid) throw new Error('pid/qid 不能为空');
  const ok = !!p.ok, letter = p.letter || null, ms = Math.max(0, Math.min(30 * 60 * 1000, +p.ms || 0));
  const na = !!p.na; // 源数据缺标准答案：记作答但不判分、不计错题
  const now = Date.now();
  const P = cfg.points;

  if (!u.papers[pid]) u.papers[pid] = {};
  const prev = u.papers[pid][qid] || null;

  // ---- 积分 ----
  let delta = 0, reason = '';
  if (na) {
    delta = 0; reason = '';
  } else if (!prev) {
    if (ok) { delta = P.correct + (P.firstSolve || 0); reason = '首次答对'; }
    else { delta = P.wrong; reason = '完成作答'; }
  } else if (!prev.ok && ok) {
    delta = P.redoCorrect || 0; reason = '错题重做答对';
  } else {
    delta = 0; reason = '';
  }

  // ---- 每日目标 ----
  const today = dayKey(now);
  if (u.daily.date !== today) { u.daily = { date: today, count: 0, bonusGiven: false }; }
  if (!prev) u.daily.count++;
  let bonus = 0;
  if (!u.daily.bonusGiven && u.daily.count >= (P.dailyGoal || 0) && P.dailyGoal > 0) {
    bonus = P.dailyGoalBonus || 0;
    u.daily.bonusGiven = true;
    delta += bonus;
  }

  // ---- 记录 ----
  u.papers[pid][qid] = { l: letter, ok: na ? true : ok, t: now, ms, n: (prev ? (prev.n || 1) + 1 : 1) };
  if (na) u.papers[pid][qid].na = true;

  // ---- 统计 ----
  u.stats.answered = (u.stats.answered || 0) + (prev ? 0 : 1);
  const scored = !na;
  u.stats.correct = (u.stats.correct || 0) + (prev || !scored ? 0 : (ok ? 1 : 0));
  u.stats.ms = (u.stats.ms || 0) + ms;
  u.stats.days[today] = (u.stats.days[today] || 0) + 1;

  // ---- 错题本 ----
  let w = u.wrong[qid];
  if (!ok && !na) {
    if (!w) {
      w = u.wrong[qid] = {
        qid, pid, module: p.module || '', tag: p.tag || '',
        wrong: 0, tries: 0, streak: 0, status: 'new', label: '', note: '',
        nextReview: 0, lastAt: now, lastWrongAt: now, ms,
      };
    }
    w.wrong++; w.tries++; w.streak = 0; w.lastAt = now; w.lastWrongAt = now; w.ms = ms;
    w.status = w.wrong >= 2 ? 'review' : 'new';
    w.nextReview = now + REVIEW_STEPS[0] * 86400000;
    if (p.snap) w.snap = p.snap;
  } else if (w) {
    w.tries++; w.streak = (w.streak || 0) + 1; w.lastAt = now;
    if (w.streak >= 2) {
      w.status = 'mastered';
      w.nextReview = 0;
    } else {
      w.status = 'review';
      const step = REVIEW_STEPS[Math.min(w.streak, REVIEW_STEPS.length - 1)];
      w.nextReview = now + step * 86400000;
    }
  }

  // ---- 记账 ----
  u.points.balance += delta;
  if (delta > 0) {
    u.points.total += delta;
    if (reason) pushLedger(u, { t: now, type: 'answer', delta, reason, ref: qid, pid });
    if (bonus) pushLedger(u, { t: now, type: 'bonus', delta: bonus, reason: `完成今日 ${P.dailyGoal} 题` });
  }
  saveUser(u);

  return {
    record: u.papers[pid][qid],
    points: { delta, balance: u.points.balance, bonus },
    daily: { count: u.daily.count, goal: P.dailyGoal || 0, bonusGiven: u.daily.bonusGiven },
    wrong: w ? { active: true, wrong: w.wrong, streak: w.streak, status: w.status } : { active: false },
  };
}

/* ================= 请求分发 ================= */
function matchPath(p, pattern) {
  const a = p.split('/').filter(Boolean), b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i][0] === ':') params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (b[i] !== a[i]) return null;
  }
  return params;
}
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}
function adminOk(cfg, req, body) {
  const pin = (body && body.pin) || req.headers['x-admin-pin'] || '';
  return !!cfg.adminPin && String(pin) === String(cfg.adminPin);
}
// 昵称精确匹配：只去掉首尾空白，其余（空格 / 大小写 / 字符）一律按原样比较。
// 即「c c」与「cc」是两个不同账号；换设备请用同步码登录。
function findUserByName(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  const idx = loadIndex();
  const hit = idx.users.find(x => String(x.name || '').trim() === key) || null;
  if (!hit) return null;
  return loadUser(hit.id) ? hit : null;
}
function userBrief(u) {
  return {
    id: u.id, name: u.name, createdAt: u.createdAt,
    balance: u.points.balance, total: u.points.total, spent: u.points.spent,
    answered: u.stats.answered || 0, correct: u.stats.correct || 0,
    wrongCount: Object.keys(u.wrong || {}).length,
  };
}
function allUsers() {
  const idx = loadIndex();
  return idx.users.map(x => {
    const u = loadUser(x.id);
    return u ? userBrief(u) : { id: x.id, name: x.name, missing: true };
  });
}

/* ================= 留言板（全员共享） ================= */
const MESSAGES_FILE = path.join(DATA, 'messages.json');
const MSG_IMG_DIR = path.join(DATA, 'messages-img');
function loadMessages() { const l = readJson(MESSAGES_FILE, []); return Array.isArray(l) ? l : []; }
function saveMessages(list) { writeJson(MESSAGES_FILE, list.slice(-120)); }
// dataURL 图片落盘：返回可直接访问的 /msgimg/ 路径；不合法返回 null
function saveMessageImg(dataUrl, msgId) {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 40 || buf.length > 6 * 1024 * 1024) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  fs.mkdirSync(MSG_IMG_DIR, { recursive: true });
  const file = `${msgId}.${ext}`;
  const tmp = path.join(MSG_IMG_DIR, file + '.tmp');
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, path.join(MSG_IMG_DIR, file));
  return '/msgimg/' + file;
}

async function handleApi(req, res, urlPath) {
  const cfg = loadConfig();
  const body = (req.method === 'POST' || req.method === 'DELETE') ? await readBody(req) : {};
  const m = req.method;
  let pa;

  /* ---- 启动数据 ---- */
  if (m === 'GET' && urlPath === '/api/bootstrap') {
    return json(res, 200, { config: publicConfig(cfg), users: allUsers() });
  }

  /* ---- 留言板 ---- */
  if (urlPath === '/api/messages' && m === 'GET') {
    return json(res, 200, { messages: loadMessages() });
  }
  if (urlPath === '/api/messages' && m === 'POST') {
    const u = loadUser(String(body.uid || ''));
    if (!u) return json(res, 404, { error: '用户不存在' });
    const text = String(body.text || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!text) return json(res, 400, { error: '写点什么再发布吧' });
    const list = loadMessages();
    const lastMine = [...list].reverse().find(x => x.uid === u.id);
    if (lastMine && Date.now() - lastMine.ts < 30 * 1000) {
      return json(res, 429, { error: '休息一下，30 秒后可以再留一笔' });
    }
    const msg = { id: 'm_' + Math.random().toString(36).slice(2, 10), uid: u.id, name: u.name, text, ts: Date.now() };
    const imgPath = saveMessageImg(body.img, msg.id);
    if (imgPath) msg.img = imgPath;
    list.push(msg);
    saveMessages(list);
    return json(res, 200, { message: msg });
  }
  if (m === 'POST' && urlPath === '/api/admin/messages/del' && adminOk(cfg, req, body)) {
    const list = loadMessages();
    const next = list.filter(x => x.id !== body.id);
    if (next.length === list.length) return json(res, 404, { error: '留言不存在' });
    saveMessages(next);
    return json(res, 200, { ok: true });
  }
  // 作者可删自己的留言；带有效 PIN 的管理员可删任意留言
  if (m === 'POST' && urlPath === '/api/messages/del') {
    const list = loadMessages();
    const msg = list.find(x => x.id === body.id);
    if (!msg) return json(res, 404, { error: '留言不存在' });
    const isAdmin = adminOk(cfg, req, body);
    const uid = String(body.uid || '');
    const isAuthor = !!uid && msg.uid === uid && !!loadUser(uid);
    if (!isAdmin && !isAuthor) return json(res, 403, { error: '只能删除自己留下的墨迹' });
    saveMessages(list.filter(x => x.id !== msg.id));
    return json(res, 200, { ok: true });
  }

  /* ---- 注册 / 登录：昵称（精确匹配）或同步码，密码可选 ---- */
  if (urlPath === '/api/auth' && m === 'POST') {
    const pass = String(body.pass || '');
    const code = String(body.code || '').trim();          // 同步码 = 用户 id
    const name = String(body.name || '').trim().slice(0, 20);
    if (!code && !name) return json(res, 400, { error: '请先输入昵称或同步码' });

    // ① 同步码登录：跨设备最稳，不依赖昵称拼写
    if (code) {
      const u = loadUser(code);
      if (!u) return json(res, 404, { error: '同步码不存在，检查一下有没有输全' });
      if (u.pass) {
        if (!pass) return json(res, 401, { error: '这个账号设了密码，请一并输入' });
        if (hashPass(pass) !== u.pass) return json(res, 401, { error: '密码不对，再试试' });
      }
      return json(res, 200, { ok: true, created: false, user: { id: u.id, name: u.name } });
    }

    // ② 昵称登录：按昵称原样精确匹配（多一个空格就是另一个账号）
    const idx = loadIndex();
    const hit = findUserByName(name);
    if (hit) {
      const u = loadUser(hit.id);
      if (u.pass) {
        if (!pass) return json(res, 401, { error: '「' + u.name + '」已设置密码，请输入密码登录' });
        if (hashPass(pass) !== u.pass) return json(res, 401, { error: '密码不对，再试试' });
      }
      return json(res, 200, { ok: true, created: false, user: { id: u.id, name: u.name } });
    }
    const u = newUser(name);
    if (pass) u.pass = hashPass(pass);
    saveUser(u);
    idx.users.push({ id: u.id, name: u.name, createdAt: u.createdAt });
    writeJson(USER_INDEX, idx);
    return json(res, 200, { ok: true, created: true, user: { id: u.id, name: u.name } });
  }

  /* ---- 用户 ---- */
  if (m === 'POST' && urlPath === '/api/users') {
    const name = String(body.name || '').trim().slice(0, 20) || '新用户';
    const u = newUser(name);
    saveUser(u);
    const idx = loadIndex();
    idx.users.push({ id: u.id, name: u.name, createdAt: u.createdAt });
    writeJson(USER_INDEX, idx);
    return json(res, 200, { ok: true, user: u });
  }
  if ((pa = matchPath(urlPath, '/api/users/:id'))) {
    if (m === 'GET') {
      const u = loadUser(pa.id);
      if (!u) return json(res, 404, { error: '用户不存在' });
      // 记录「最近一次被某台设备同步拉取」的时间（60 秒节流，避免频繁写盘）
      if (!u.lastSeenAt || Date.now() - u.lastSeenAt > 60 * 1000) {
        u.lastSeenAt = Date.now();
        saveUser(u);
      }
      const pub = Object.assign({}, u, { pass: undefined });  // 密码哈希不出服务端
      return json(res, 200, { user: pub, hasPass: !!u.pass, config: publicConfig(cfg) });
    }
    if (m === 'DELETE') {
      const u = loadUser(pa.id);
      if (!u) return json(res, 404, { error: '用户不存在' });
      try { fs.unlinkSync(userFile(pa.id)); } catch (e) {}
      const idx = loadIndex();
      idx.users = idx.users.filter(x => x.id !== pa.id);
      writeJson(USER_INDEX, idx);
      return json(res, 200, { ok: true });
    }
  }
  /* ---- 错题本操作 ---- */
  if ((pa = matchPath(urlPath, '/api/users/:id/pass')) && m === 'POST') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    const pass = String(body.pass || '');
    if (pass) u.pass = hashPass(pass); else delete u.pass;
    saveUser(u);
    return json(res, 200, { ok: true, hasPass: !!u.pass });
  }
  if ((pa = matchPath(urlPath, '/api/users/:id/wrong/:qid')) && m === 'POST') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    const w = (u.wrong || {})[pa.qid];
    if (!w) return json(res, 404, { error: '错题不存在' });
    const act = String(body.action || '');
    if (act === 'label' && ['粗心', '不会', '时间不够', ''].includes(body.value)) w.label = body.value;
    else if (act === 'note') w.note = String(body.value || '').slice(0, 2000);
    else if (act === 'master') { w.status = 'mastered'; w.streak = 2; w.nextReview = 0; }
    else if (act === 'relearn') { w.status = 'review'; w.streak = 0; w.nextReview = Date.now() + REVIEW_STEPS[0] * 86400000; }
    else if (act === 'delete') delete u.wrong[pa.qid];
    else return json(res, 400, { error: '未知操作' });
    w.lastAt = Date.now();
    saveUser(u);
    return json(res, 200, { ok: true, wrong: u.wrong[pa.qid] || null });
  }
  if ((pa = matchPath(urlPath, '/api/users/:id/answer')) && m === 'POST') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    try {
      return json(res, 200, applyAnswer(u, cfg, body));
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if ((pa = matchPath(urlPath, '/api/users/:id/settings')) && m === 'POST') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    const s = body.settings || {};
    if (typeof s.theme === 'string' && ['auto', 'light', 'dark'].includes(s.theme)) u.settings.theme = s.theme;
    if (typeof s.aiMode === 'string' && ['inherit', 'builtin', 'custom', 'off'].includes(s.aiMode)) u.settings.aiMode = s.aiMode;
    if (typeof s.aiKey === 'string') u.settings.aiKey = s.aiKey.trim().slice(0, 200);
    if (typeof s.aiBaseUrl === 'string') u.settings.aiBaseUrl = s.aiBaseUrl.trim().slice(0, 200);
    if (typeof s.aiModel === 'string') u.settings.aiModel = s.aiModel.trim().slice(0, 80);
    if (typeof s.title === 'string') u.settings.title = s.title.trim().slice(0, 16);
    if (typeof s.name === 'string' && s.name.trim()) {
      u.name = s.name.trim().slice(0, 20);
      const idx = loadIndex();
      const it = idx.users.find(x => x.id === u.id);
      if (it) { it.name = u.name; writeJson(USER_INDEX, idx); }
    }
    saveUser(u);
    return json(res, 200, { ok: true, settings: u.settings, name: u.name });
  }
  if ((pa = matchPath(urlPath, '/api/users/:id/redeem')) && m === 'POST') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    const item = (cfg.shop || []).find(x => x.id === body.itemId);
    if (!item || !item.enabled) return json(res, 400, { error: '商品不存在或已下架' });
    if (item.stock <= 0) return json(res, 400, { error: '库存不足' });
    if (u.points.balance < item.cost) return json(res, 400, { error: `积分不足，还差 ${item.cost - u.points.balance} 分` });
    u.points.balance -= item.cost;
    u.points.spent += item.cost;
    item.stock -= 1;
    writeJson(CONFIG_FILE, cfg);   // 库存是全局的
    const rec = { id: 'rd_' + Date.now().toString(36), itemId: item.id, name: item.name, cost: item.cost, t: Date.now(), status: 'pending' };
    u.redemptions.unshift(rec);
    pushLedger(u, { t: rec.t, type: 'redeem', delta: -item.cost, reason: '兑换 ' + item.name });
    saveUser(u);
    return json(res, 200, { ok: true, redemption: rec, points: { balance: u.points.balance }, shop: publicConfig(cfg).shop });
  }
  if ((pa = matchPath(urlPath, '/api/users/:id/ledger')) && m === 'GET') {
    const u = loadUser(pa.id);
    if (!u) return json(res, 404, { error: '用户不存在' });
    return json(res, 200, { ledger: u.ledger.slice(0, 100), points: u.points, redemptions: u.redemptions.slice(0, 50) });
  }

  /* ---- AI 问答（SSE 流式代理，Key 永不出服务端） ---- */
  if (urlPath === '/api/ai/chat' && m === 'POST') {
    const u = loadUser(String(body.uid || ''));
    if (!u) return json(res, 404, { error: '用户不存在' });
    const mode = u.settings.aiMode === 'inherit' ? (cfg.ai.mode || 'builtin') : (u.settings.aiMode || 'inherit');
    if (mode === 'off') return json(res, 403, { error: 'AI 功能已关闭（可在「我的 → AI」重新开启）' });

    let baseUrl, apiKey, model;
    if (mode === 'custom') {
      baseUrl = (u.settings.aiBaseUrl || '').trim();
      apiKey = (u.settings.aiKey || '').trim();
      model = (u.settings.aiModel || '').trim();
      if (!baseUrl || !apiKey) return json(res, 400, { error: '自定义 AI 还没配置完整（需要接口地址和 Key）' });
    } else {
      baseUrl = (cfg.ai.builtin.baseUrl || '').trim();
      apiKey = (cfg.ai.builtin.apiKey || '').trim();
      model = (cfg.ai.builtin.model || '').trim();
      if (!baseUrl || !apiKey) return json(res, 400, { error: '内置 AI 尚未配置 Key，请让管理员在后台配置，或改用自己的 Key' });
    }

    const ctx = body.context || {};
    const maxTurns = Math.max(2, Math.min(40, cfg.ai.maxTurns || 12));
    const hist = (Array.isArray(body.messages) ? body.messages : [])
      .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
      .slice(-maxTurns)
      .map(x => ({ role: x.role, content: x.content.slice(0, 8000) }));

    const messages = [{ role: 'system', content: buildAiSystem(ctx) }, ...hist];

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    try {
      if (/^mock$/i.test(baseUrl)) {
        // mock 模式：不外呼，返回演示文本（验收/体验用）
        const last = [...hist].reverse().find(x => x.role === 'user');
        const reply = '（演示模式）收到你的提问：「' + String(last ? last.content : '').slice(0, 60) + '」。\n\n'
          + '这是一段模拟回答，用于在没有配置真实 Key 时体验对话与流式输出。\n\n'
          + '解题建议：先读问题、圈出关键词，再回材料定位数据，最后估算排除。';
        for (const piece of reply.match(/[\s\S]{1,24}/g) || []) {
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: piece } }] }) + '\n\n');
          await new Promise(r => setTimeout(r, 90));
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      const up = await fetch(apiBase(baseUrl) + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.6 }),
      });
      if (!up.ok || !up.body) {
        const t = await up.text().catch(() => '');
        const src = mode === 'custom' ? '你自己的' : '内置';
        res.write('data: ' + JSON.stringify({ error: '模型接口返回 ' + up.status + '：' + t.slice(0, 400)
          + '　—　当前用的是' + src + '配置「' + (model || '未填写') + '」，可到 AI 设置里点「获取模型列表」选一个正确的名称。' }) + '\n\n');
        res.end();
        return;
      }
      for await (const chunk of up.body) res.write(Buffer.from(chunk));
      res.end();
    } catch (e) {
      try { res.write('data: ' + JSON.stringify({ error: '连接模型失败：' + e.message }) + '\n\n'); res.end(); } catch (_) {}
    }
    return;
  }

  /* ---- 拉取上游模型列表（OpenAI 兼容 /models），供前端点选模型名 ---- */
  if (urlPath === '/api/ai/models' && m === 'POST') {
    const u = loadUser(String(body.uid || ''));
    if (!u) return json(res, 404, { error: '用户不存在' });
    const mode = body.scope === 'builtin' ? 'builtin'
      : (u.settings.aiMode === 'inherit' ? (cfg.ai.mode || 'builtin') : (u.settings.aiMode || 'inherit'));
    let baseUrl, apiKey;
    if (mode === 'custom') {
      baseUrl = (u.settings.aiBaseUrl || '').trim();
      apiKey = (u.settings.aiKey || '').trim();
    } else {
      baseUrl = (cfg.ai.builtin.baseUrl || '').trim();
      apiKey = (cfg.ai.builtin.apiKey || '').trim();
    }
    if (/^mock$/i.test(baseUrl)) return json(res, 200, { models: ['demo（演示模式）'] });
    if (!baseUrl) return json(res, 400, { error: '请先填写接口地址' });
    try {
      const r = await fetch(apiBase(baseUrl) + '/models', {
        headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
      });
      const t = await r.text();
      if (!r.ok) return json(res, 400, { error: '拉取失败 ' + r.status + '：' + t.slice(0, 300) });
      let j;
      try { j = JSON.parse(t); } catch (e) { return json(res, 400, { error: '返回的不是 JSON：已自动补全 /v1 仍失败，请检查接口地址是否正确' }); }
      const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
      const ids = arr.map(x => x.id || x.name).filter(Boolean);
      if (!ids.length) return json(res, 400, { error: '接口没有返回任何模型，请检查接口地址' });
      return json(res, 200, { models: ids });
    } catch (e) {
      return json(res, 400, { error: '连接失败：' + e.message });
    }
  }

  /* ---- 管理员 PIN 校验（不需要先通过校验） ---- */
  if (urlPath === '/api/admin/auth' && m === 'POST') {
    return json(res, 200, { ok: adminOk(cfg, req, body) });
  }

  /* ---- 管理员 ---- */
  if (urlPath.startsWith('/api/admin/')) {
    if (!adminOk(cfg, req, body)) return json(res, 401, { error: 'PIN 错误' });

    if (urlPath === '/api/admin/overview' && m === 'GET') {
      const idx = loadIndex();
      return json(res, 200, { config: cfg, users: allUsers(), userCount: idx.users.length });
    }
    /* 合并两个账号（处理「同一个人换了昵称/多打了空格」导致的记录分裂） */
    if (urlPath === '/api/admin/users/merge' && m === 'POST') {
      const from = loadUser(String(body.from || ''));
      const to = loadUser(String(body.to || ''));
      if (!from || !to) return json(res, 404, { error: '账号不存在' });
      if (from.id === to.id) return json(res, 400, { error: '不能合并到自己' });

      // 做题记录：按 pid/qid 取并集，冲突时保留目标账号的
      from.papers = from.papers || {};
      to.papers = to.papers || {};
      Object.entries(from.papers).forEach(([pid, qs]) => {
        to.papers[pid] = to.papers[pid] || {};
        Object.entries(qs || {}).forEach(([qid, rec]) => {
          if (!to.papers[pid][qid]) to.papers[pid][qid] = rec;
        });
      });
      // 错题本
      to.wrong = to.wrong || {};
      Object.entries(from.wrong || {}).forEach(([qid, w]) => { if (!to.wrong[qid]) to.wrong[qid] = w; });
      // 积分
      if (from.points) {
        to.points.balance = (to.points.balance || 0) + (from.points.balance || 0);
        to.points.total = (to.points.total || 0) + (from.points.total || 0);
        to.points.spent = (to.points.spent || 0) + (from.points.spent || 0);
      }
      // 每日练习天数（取较大值）
      to.stats.days = to.stats.days || {};
      Object.entries((from.stats && from.stats.days) || {}).forEach(([k, v]) => {
        to.stats.days[k] = Math.max(to.stats.days[k] || 0, v || 0);
      });
      // 统计：题量/正确数/用时相加
      to.stats.answered = (to.stats.answered || 0) + ((from.stats && from.stats.answered) || 0);
      to.stats.correct = (to.stats.correct || 0) + ((from.stats && from.stats.correct) || 0);
      to.stats.ms = (to.stats.ms || 0) + ((from.stats && from.stats.ms) || 0);
      // 兑换记录
      if (Array.isArray(from.redemptions) && from.redemptions.length) {
        to.redemptions = (to.redemptions || []).concat(from.redemptions);
      }
      to.mergedFrom = (to.mergedFrom || []).concat([{ id: from.id, name: from.name, at: Date.now() }]);
      saveUser(to);

      // 备份源账号再删除
      try {
        fs.copyFileSync(userFile(from.id), path.join(DATA, 'users', from.id + '.merged.bak.json'));
        fs.unlinkSync(userFile(from.id));
      } catch (e) { }
      const idx = loadIndex();
      idx.users = idx.users.filter(x => x.id !== from.id);
      writeJson(USER_INDEX, idx);
      return json(res, 200, { ok: true, merged: { from: from.id, to: to.id } });
    }
    if (urlPath === '/api/admin/config' && m === 'POST') {
      const p = body.patch || {};
      if (p.ai) {
        if (typeof p.ai.mode === 'string') cfg.ai.mode = p.ai.mode;
        if (typeof p.ai.allowAnswerContext === 'boolean') cfg.ai.allowAnswerContext = p.ai.allowAnswerContext;
        if (typeof p.ai.maxTurns === 'number') cfg.ai.maxTurns = Math.max(2, Math.min(40, p.ai.maxTurns));
        if (p.ai.builtin) {
          const b = p.ai.builtin;
          if (typeof b.baseUrl === 'string') cfg.ai.builtin.baseUrl = b.baseUrl.trim();
          if (typeof b.model === 'string') cfg.ai.builtin.model = b.model.trim();
          if (typeof b.label === 'string') cfg.ai.builtin.label = b.label.trim();
          if (typeof b.apiKey === 'string' && b.apiKey.trim() !== '' && !/^•|^\*/.test(b.apiKey)) {
            cfg.ai.builtin.apiKey = b.apiKey.trim();
          }
        }
      }
      if (p.points) {
        for (const k of ['correct', 'wrong', 'firstSolve', 'redoCorrect', 'dailyGoal', 'dailyGoalBonus']) {
          if (typeof p.points[k] === 'number' && p.points[k] >= 0) cfg.points[k] = Math.round(p.points[k]);
        }
      }
      if (typeof p.adminPin === 'string' && /^\d{4,8}$/.test(p.adminPin)) cfg.adminPin = p.adminPin;
      writeJson(CONFIG_FILE, cfg);
      return json(res, 200, { ok: true, config: cfg });
    }
    if (urlPath === '/api/admin/shop' && m === 'POST') {
      const action = body.action, item = body.item || {};
      if (action === 'add') {
        cfg.shop.push({
          id: 'sp_' + Math.random().toString(36).slice(2, 8),
          name: String(item.name || '新商品').slice(0, 20),
          desc: String(item.desc || '').slice(0, 60),
          cost: Math.max(0, Math.round(+item.cost || 0)),
          stock: Math.max(0, Math.round(+item.stock || 0)),
          label: String(item.label || '礼').slice(0, 2),
          enabled: item.enabled !== false,
        });
      } else if (action === 'update') {
        const t = cfg.shop.find(x => x.id === item.id);
        if (!t) return json(res, 404, { error: '商品不存在' });
        for (const k of ['name', 'desc', 'label']) if (typeof item[k] === 'string') t[k] = item[k];
        if (typeof item.cost === 'number') t.cost = Math.max(0, Math.round(item.cost));
        if (typeof item.stock === 'number') t.stock = Math.max(0, Math.round(item.stock));
        if (typeof item.enabled === 'boolean') t.enabled = item.enabled;
      } else if (action === 'remove') {
        cfg.shop = cfg.shop.filter(x => x.id !== item.id);
      } else return json(res, 400, { error: '未知操作' });
      writeJson(CONFIG_FILE, cfg);
      return json(res, 200, { ok: true, shop: cfg.shop });
    }
    if (urlPath === '/api/admin/points' && m === 'POST') {
      const u = loadUser(body.uid);
      if (!u) return json(res, 404, { error: '用户不存在' });
      const delta = Math.round(+body.delta || 0);
      if (!delta) return json(res, 400, { error: '分值无效' });
      u.points.balance += delta;
      if (delta > 0) u.points.total += delta;
      else u.points.spent += -delta;
      pushLedger(u, { t: Date.now(), type: 'admin', delta, reason: body.reason || '管理员调整' });
      saveUser(u);
      return json(res, 200, { ok: true, points: u.points });
    }
    return json(res, 404, { error: '接口不存在' });
  }

  return json(res, 404, { error: '接口不存在' });
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (e) {
    // 任何单个请求的异常都不允许拖垮整个服务
    console.error('[request error]', req.url, e && e.message);
    try {
      if (!res.headersSent) json(res, 500, { error: '服务端错误' });
      else res.end();
    } catch (_) {}
  }
});

async function handleRequest(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // API
  if (urlPath.startsWith('/api/')) {
    try {
      await handleApi(req, res, urlPath);
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e.message || '服务端错误' });
    }
    return;
  }

  // 题库图片（/img/xxx -> data/xingcezhenti/90-图片/xxx）
  if (urlPath.startsWith('/img/')) {
    const file = safeJoin(path.join(DATA, 'xingcezhenti', '90-图片'), urlPath.slice(5));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, '图片不存在');
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  }

  // 留言图片（/msgimg/xxx -> data/messages-img/xxx）
  if (urlPath.startsWith('/msgimg/')) {
    const file = safeJoin(MSG_IMG_DIR, urlPath.slice(8));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, '图片不存在');
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  }

  // 题库数据（只允许 app/data 下的静态 JSON）
  if (urlPath.startsWith('/data/')) {
    const file = safeJoin(path.join(ROOT, 'app'), urlPath);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
    return send(res, 200, fs.readFileSync(file), MIME['.json']);
  }

  // 静态文件
  const file = safeJoin(path.join(ROOT, 'app'), urlPath);
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  }
  const fallback = path.join(ROOT, 'app', 'index.html');
  if (fs.existsSync(fallback)) return send(res, 200, fs.readFileSync(fallback), MIME['.html']);
  send(res, 404, 'Not Found');
}

// 进程级兜底：意外异常只记日志，不退出
process.on('uncaughtException', e => console.error('[uncaught]', e && e.message));
process.on('unhandledRejection', e => console.error('[unhandled]', e && (e.message || e)));

// 监听所有网卡：手机/平板在同一 Wi-Fi 下可通过局域网 IP 访问
server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address);
  console.log(`✅ 行测刷题网站已启动: http://localhost:${PORT}`);
  if (ips.length) console.log(`📱 手机/平板（同一 Wi-Fi）: http://${ips[0]}:${PORT}`);
  console.log(`   用户数据: ${USERS_DIR}`);
  console.log('   关闭此窗口即可停止网站。');
});
