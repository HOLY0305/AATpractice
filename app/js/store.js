/* 状态与数据层：用户、积分、答题、设置 */
'use strict';
(function (XC) {
  const UID_KEY = 'xingce_uid_v2';
  const PIN_KEY = 'xingce_admin_pin';

  XC.S = {
    config: null, users: [], uid: null, user: null,
    admin: false, index: null, booted: false,
  };

  /* ---------- 启动 ---------- */
  XC.boot = async function () {
    const b = await XC.api.get('/api/bootstrap');
    XC.S.config = b.config;
    XC.S.users = b.users;
    const uid = localStorage.getItem(UID_KEY);
    if (!uid || !b.users.some(u => u.id === uid)) {
      // 本机没有身份（或该用户已被删除）：交给注册/登录页处理，不再自动套用别人
      XC.S.uid = null;
      XC.S.user = null;
      XC.S.booted = true;
      return XC.S;
    }
    XC.S.uid = uid;
    await XC.loadUser(uid);
    XC.S.booted = true;
    XC.S.admin = !!sessionStorage.getItem(PIN_KEY);
    XC.applyTheme(themePref());
    return XC.S;
  };

  XC.setUid = function (id) {
    localStorage.setItem(UID_KEY, id);
    XC.S.uid = id;
  };

  XC.loadUser = async function (uid) {
    const r = await XC.api.get('/api/users/' + uid);
    XC.S.user = r.user;
    XC.S.user.hasPass = !!r.hasPass;
    XC.S.uid = uid;
    XC.S.lastSync = Date.now();
    if (r.config) XC.S.config = r.config;
    XC.applyTheme(themePref());
    return r.user;
  };

  /* 从服务器重新拉一次当前用户（多设备同步用） */
  XC.syncUser = async function () {
    if (!XC.S.uid) return null;
    return XC.loadUser(XC.S.uid);
  };

  /* 只清除本机身份，服务器记录保留 */
  XC.logout = function () {
    localStorage.removeItem(UID_KEY);
    sessionStorage.removeItem(PIN_KEY);
    XC.S.uid = null;
    XC.S.user = null;
    XC.S.admin = false;
    XC.S.lastSync = null;
  };

  function themePref() {
    return (XC.S.user && XC.S.user.settings && XC.S.user.settings.theme) || 'auto';
  }
  XC.themePref = themePref;

  XC.switchUser = async function (uid) {
    localStorage.setItem(UID_KEY, uid);
    await XC.loadUser(uid);
  };

  XC.createUser = async function (name) {
    const r = await XC.api.post('/api/users', { name });
    XC.S.users.push({ id: r.user.id, name: r.user.name });
    await XC.switchUser(r.user.id);
    return r.user;
  };

  /* ---------- 答题 ---------- */
  XC.answer = async function (payload) {
    const r = await XC.api.post('/api/users/' + XC.S.uid + '/answer', payload);
    const u = XC.S.user;
    if (!payload.snap) { /* 快照仅在答错时上层传入 */ }
    if (!u.papers[payload.pid]) u.papers[payload.pid] = {};
    u.papers[payload.pid][payload.qid] = r.record;
    u.points.balance = r.points.balance;
    if (r.points.delta > 0) u.points.total += r.points.delta;
    u.daily = { date: u.daily && u.daily.date, count: r.daily.count, bonusGiven: r.daily.bonusGiven };
    // 错题本本地镜像
    if (r.wrong && r.wrong.active) {
      if (!u.wrong[payload.qid]) {
        u.wrong[payload.qid] = { qid: payload.qid, pid: payload.pid, module: payload.module, tag: payload.tag, wrong: 0, tries: 0, streak: 0, status: 'new' };
      }
      Object.assign(u.wrong[payload.qid], {
        wrong: r.wrong.wrong, streak: r.wrong.streak, status: r.wrong.status,
        lastAt: r.record.t, lastWrongAt: payload.ok ? u.wrong[payload.qid].lastWrongAt : r.record.t,
        ms: payload.ms,
      });
      if (!payload.ok && payload.snap) u.wrong[payload.qid].snap = payload.snap;
    }
    // 统计
    if (r.record.n === 1) {
      u.stats.answered = (u.stats.answered || 0) + 1;
      if (payload.ok) u.stats.correct = (u.stats.correct || 0) + 1;
    }
    u.stats.ms = (u.stats.ms || 0) + (payload.ms || 0);
    return r;
  };

  /* ---------- 设置 ---------- */
  XC.saveSettings = async function (patch) {
    const r = await XC.api.post('/api/users/' + XC.S.uid + '/settings', { settings: patch });
    Object.assign(XC.S.user.settings, r.settings);
    if (r.name) {
      XC.S.user.name = r.name;
      const it = XC.S.users.find(u => u.id === XC.S.uid);
      if (it) it.name = r.name;
    }
    XC.applyTheme(themePref());
    return r;
  };

  /* ---------- 积分 / 商城 ---------- */
  XC.redeem = async function (itemId) {
    const r = await XC.api.post('/api/users/' + XC.S.uid + '/redeem', { itemId });
    XC.S.user.points.balance = r.points.balance;
    XC.S.user.points.spent = (XC.S.user.points.spent || 0) + (r.redemption ? r.redemption.cost : 0);
    if (r.shop) XC.S.config.shop = r.shop;
    if (r.redemption) XC.S.user.redemptions.unshift(r.redemption);
    return r;
  };

  XC.ledger = () => XC.api.get('/api/users/' + XC.S.uid + '/ledger');

  /* ---------- 管理员 ---------- */
  XC.pin = () => sessionStorage.getItem(PIN_KEY) || '';
  XC.adminAuth = async function (pin) {
    const r = await XC.api.post('/api/admin/auth', { pin });
    if (r.ok) { sessionStorage.setItem(PIN_KEY, pin); XC.S.admin = true; }
    return r.ok;
  };
  XC.adminOut = function () {
    sessionStorage.removeItem(PIN_KEY);
    XC.S.admin = false;
  };
  XC.admin = async function (path, body) {
    const r = await XC.api.post('/api/admin/' + path, Object.assign({ pin: XC.pin() }, body || {}));
    // 管理操作会改全局配置（商品/积分规则/AI），同步内存，避免商城页看到旧数据
    try {
      const b = await XC.api.get('/api/bootstrap');
      XC.S.config = b.config;
      XC.S.users = b.users;
    } catch (e) { /* 刷新失败不影响操作结果 */ }
    return r;
  };
  XC.adminGet = async function (path) {
    const r = await fetch('/api/admin/' + path, { headers: { 'x-admin-pin': XC.pin() } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '请求失败');
    return j;
  };

  /* ---------- 索引与统计 ---------- */
  XC.loadIndex = async function () {
    if (!XC.S.index) XC.S.index = await XC.api.get('/data/index.json');
    return XC.S.index;
  };

  XC.paperRec = pid => (XC.S.user && XC.S.user.papers[pid]) || {};

  XC.paperStats = function (pid, total) {
    const rec = XC.paperRec(pid);
    let right = 0, wrong = 0, ms = 0;
    for (const k in rec) {
      if (rec[k].ok) right++; else wrong++;
      ms += rec[k].ms || 0;
    }
    return { right, wrong, done: right + wrong, total: total || 0, ms };
  };

  XC.overall = function () {
    const u = XC.S.user;
    if (!u) return { answered: 0, correct: 0, acc: 0, wrong: 0, streak: 0, today: 0, ms: 0 };
    const days = Object.keys(u.stats.days || {}).sort();
    // 连续天数：从今天（或昨天）往回数
    const key = ts => {
      const d = new Date(ts), p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const set = new Set(days);
    let streak = 0, cursor = Date.now();
    if (!set.has(key(cursor))) cursor -= 86400000; // 今天还没做，从昨天算
    while (set.has(key(cursor))) { streak++; cursor -= 86400000; }
    const todayKey = key(Date.now());
    return {
      answered: u.stats.answered || 0,
      correct: u.stats.correct || 0,
      acc: u.stats.answered ? Math.round(u.stats.correct / u.stats.answered * 100) : 0,
      wrong: Object.keys(u.wrong || {}).length,
      streak,
      today: (u.stats.days || {})[todayKey] || 0,
      ms: u.stats.ms || 0,
    };
  };

  // 最近练习的试卷（从 papers 里挑更新时间最新的）
  XC.lastPaper = function () {
    const u = XC.S.user;
    if (!u) return null;
    let best = null;
    for (const pid in u.papers) {
      const rec = u.papers[pid];
      let latest = 0, done = 0;
      for (const q in rec) { const t = rec[q].t || 0; if (t > latest) latest = t; done++; }
      if (!best || latest > best.at) best = { pid, at: latest, done };
    }
    return best;
  };
})(window.XC);
