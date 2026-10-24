/* 应用入口：路由 + 顶部导航 */
'use strict';
(function (XC) {
  XC.MODULES = { '01': '政治理论', '02': '常识判断', '03': '言语理解与表达', '04': '数量关系', '05': '判断推理', '06': '资料分析' };

  XC.go = function (hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  };

  /* ---------- 顶部导航 ---------- */
  XC.renderNav = function () {
    const S = XC.S;
    const u = S.user;
    const nav = XC.$('#nav');
    if (!u) { nav.innerHTML = ''; return; }
    const roleTag = S.admin ? '管理员' : '用户';
    const initial = (u.settings.title || u.name || '我').slice(0, 1);
    nav.innerHTML = `<div class="nav-inner">
      <div class="brand" id="nav-brand">
        <div class="brand-mark">行</div>
        <div>
          <div class="brand-name">行测刷题</div>
        </div>
      </div>
      <span class="brand-sub">XINGCE · 真题库</span>
      <div class="nav-spacer"></div>
      <button class="chip-points" id="nav-points" title="积分商城">
        <span class="coin">分</span><span id="nav-balance">${XC.n(u.points.balance)}</span>
      </button>
      <button class="icon-btn" id="nav-shop" title="积分商城">${XC.icon('cart')}</button>
      <button class="icon-btn" id="nav-wrong" title="错题本">${XC.icon('book')}</button>
      <button class="icon-btn" id="nav-kb" title="考点库（导图 / 卡片 / 材料）">${XC.icon('grid')}</button>
      <button class="icon-btn" id="nav-stats" title="统计报告">${XC.icon('chart')}</button>
      <button class="icon-btn ${S.admin ? 'nav-admin-on' : ''}" id="nav-admin" title="${S.admin ? '管理界面' : '管理员入口'}">${XC.icon('shield')}</button>
      <button class="icon-btn" id="nav-theme" title="切换主题">${XC.icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
      <button class="avatar" id="nav-me" title="${roleTag}：${XC.esc(u.name)}">${XC.esc(initial)}</button>
    </div>`;
    XC.$('#nav-brand').onclick = () => XC.go('#/');
    XC.$('#nav-points').onclick = () => XC.go('#/shop');
    XC.$('#nav-shop').onclick = () => XC.go('#/shop');
    XC.$('#nav-wrong').onclick = () => XC.go('#/wrong');
    XC.$('#nav-kb').onclick = () => XC.go('#/kb');
    XC.$('#nav-stats').onclick = () => XC.go('#/stats');
    XC.$('#nav-admin').onclick = () => XC.go('#/admin');
    XC.$('#nav-me').onclick = () => XC.go('#/me');
    XC.$('#nav-theme').onclick = async () => {
      const cur = document.documentElement.dataset.theme;
      const next = cur === 'dark' ? 'light' : 'dark';
      await XC.saveSettings({ theme: next });
      XC.renderNav();
    };
  };

  // 只更新积分数字（答题后不整块重绘，避免闪烁）
  XC.updateBalance = function (from) {
    const el = XC.$('#nav-balance');
    if (!el) return;
    const to = XC.S.user.points.balance;
    const start = typeof from === 'number' ? from : to;
    if (start === to) { el.textContent = XC.n(to); return; }
    const t0 = performance.now(), dur = 520;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = XC.n(Math.round(start + (to - start) * e));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  };

  /* ---------- 注册 / 登录门（没有本机身份时） ---------- */
  XC.views.gate = function (app) {
    const hasUsers = XC.S.users && XC.S.users.length;
    app.innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <div class="gate-brand"><div class="brand-mark">行</div><div class="gate-ttl">行测刷题</div></div>
        <p class="gate-sub">用一个昵称标识你的身份：进度、错题本、积分都存在服务器上，多台设备登录同一身份即可同步。</p>
        <input class="input" id="g-name" maxlength="20" placeholder="昵称" autocomplete="off">
        <input class="input" id="g-pass" type="password" maxlength="32" placeholder="密码（可选）">
        <div class="gate-more">
          <button class="gate-toggle" id="g-toggle" type="button">换设备了？用同步码登录 ▾</button>
          <div id="g-code-box" hidden style="margin-top:8px">
            <input class="input input-mono" id="g-code" maxlength="16" placeholder="同步码，例如 u_m3hd25lc" autocomplete="off">
            <div class="gate-hint" style="padding-top:6px">同步码在「我的 → 账号与同步」里复制；昵称必须与注册时一字不差（多一个空格就是另一个账号）。</div>
          </div>
        </div>
        <div class="gate-hint">${hasUsers
        ? '新昵称会自动注册；已有昵称直接登录——对方设过密码就必须输入密码。'
        : '你是第一位用户，输入昵称即可开始；建议顺手设个密码。'}</div>
        <button class="btn btn-primary btn-block" id="g-go">进入</button>
      </div>
    </div>`;
    XC.$('#g-toggle').onclick = () => {
      const box = XC.$('#g-code-box');
      box.hidden = !box.hidden;
      XC.$('#g-toggle').textContent = box.hidden ? '换设备了？用同步码登录 ▾' : '收起同步码登录 ▴';
      if (!box.hidden) XC.$('#g-code').focus();
    };
    const go = async () => {
      const code = XC.$('#g-code').value.trim();
      const name = XC.$('#g-name').value.trim();
      const pass = XC.$('#g-pass').value;
      if (!code && !name) return XC.toast('请先输入昵称或同步码', 'bad');
      const btn = XC.$('#g-go');
      btn.disabled = true; btn.textContent = '进入中…';
      try {
        const r = await XC.api.post('/api/auth', code ? { code, pass } : { name, pass });
        XC.setUid(r.user.id);
        await XC.loadUser(r.user.id);
        XC.S.admin = !!XC.pin();
        XC.toast(r.created ? '欢迎，' + r.user.name + '！已为你创建新身份' : '欢迎回来，' + r.user.name, 'ok');
        XC.renderNav();
        location.hash = '#/';
        route();
      } catch (e) {
        XC.toast(e.message, 'bad');
        btn.disabled = false; btn.textContent = '进入';
      }
    };
    XC.$('#g-go').onclick = go;
    XC.$('#g-code').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
    XC.$('#g-pass').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
    XC.$('#g-name').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) XC.$('#g-pass').focus(); };
    setTimeout(() => { const el = XC.$('#g-name'); if (el && document.body.contains(el)) el.focus(); }, 60);
  };

  /* ---------- 路由 ---------- */
  function route() {
    const app = XC.$('#app');
    const h = location.hash || '#/';
    if (!XC.S.user) return XC.views.gate(app);   // 未进入：一律先过身份门
    if (XC.aiSync && !h.startsWith('#/p/')) XC.aiSync({ qid: null }); // 离开答题页收起 AI
    XC.renderNav();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    let m;
    if ((m = h.match(/^#\/p\/([a-z0-9]+)(?:\/(\d+))?/i))) return XC.views.paper(app, m[1], m[2] != null ? +m[2] : null);
    if (!h.startsWith('#/p/')) { try { sessionStorage.removeItem('xc-kbqueue'); } catch (e) { } }   // 离开做题页即清连做队列
    if (h.startsWith('#/wrong')) return XC.views.wrong(app);
    if (h.startsWith('#/graph')) return XC.views.kb(app, 'graph');   // 合并版考点库 · 默认导图
    if (h.startsWith('#/kb')) return XC.views.kb(app);
    if (h.startsWith('#/stats')) return XC.views.stats(app);
    if (h.startsWith('#/me')) return XC.views.settings(app);
    if (h.startsWith('#/shop')) return XC.views.shop(app);
    if (h.startsWith('#/admin')) return XC.views.admin(app);
    return XC.views.home(app);
  }
  XC.route = route;

  window.addEventListener('hashchange', route);

  /* ---------- 多设备同步：切回页面/窗口时静默拉取最新记录 ---------- */
  let syncing = false;
  async function quietSync() {
    if (syncing || !XC.S.uid || !XC.S.user) return;
    const h = location.hash || '#/';
    if (h.startsWith('#/p/')) return;          // 正在答题，别打断
    syncing = true;
    try {
      await XC.syncUser();
      XC.updateBalance();
      if (h === '#/' || h === '' || h.startsWith('#/stats')) route();  // 只读页直接重绘
    } catch (e) { /* 离线或服务未启动，忽略 */ }
    finally { syncing = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') quietSync();
  });
  let lastFocus = 0;
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - lastFocus < 15000) return;       // 15 秒内不重复拉
    lastFocus = now;
    quietSync();
  });

  /* ---------- 启动 ---------- */
  (async function main() {
    XC.$('#app').innerHTML = '<div class="empty"><span class="big">行测刷题</span>正在载入题库…</div>';
    try {
      await XC.boot();
    } catch (e) {
      XC.$('#app').innerHTML = `<div class="empty"><span class="big">启动失败</span>${XC.esc(e.message)}<br>请确认本地服务已启动（双击「启动网站.bat」）</div>`;
      return;
    }
    route();
  })();
})(window.XC);
