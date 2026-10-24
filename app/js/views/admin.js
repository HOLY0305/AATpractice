/* 管理界面：概览 / AI / 积分规则 / 商城 / 用户 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};
  let tab = 'overview';
  let ov = null;

  XC.views.admin = async function (app) {
    if (!XC.S.admin) return renderLock(app);
    app.innerHTML = '<div class="empty">正在载入管理数据…</div>';
    try {
      ov = await XC.adminGet('overview');
    } catch (e) {
      return renderLock(app, e.message);
    }
    render(app);
  };

  function renderLock(app, err) {
    app.innerHTML = `
    <div class="panel-hd"><button class="icon-btn back" id="s-back">${XC.icon('back')}</button><h1>管理员</h1></div>
    <div class="card card-pad" style="margin-top:14px;text-align:center;padding:34px 22px">
      <div style="width:46px;height:46px;margin:0 auto 14px;border-radius:14px;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border:1px solid var(--gold)">
        ${XC.icon('shield')}</div>
      <div style="font-family:var(--font-serif);font-size:18px;margin-bottom:6px">需要管理员 PIN</div>
      <p style="font-size:13px;color:var(--ink-3);margin:0 0 18px">${err ? XC.esc(err) : '默认 8888，进入后可修改'}</p>
      <input class="input input-mono" id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="输入 PIN" style="text-align:center;max-width:200px;margin:0 auto">
      <button class="btn btn-primary btn-block" id="btn-pin" style="margin-top:14px">解锁</button>
    </div>`;
    XC.$('#s-back').onclick = () => XC.go('#/');
    const go = async () => {
      const ok = await XC.adminAuth(XC.$('#pin').value.trim());
      if (!ok) return XC.toast('PIN 错误', 'bad');
      XC.toast('已进入管理界面', 'ok');
      XC.views.admin(app);
      XC.renderNav();
    };
    XC.$('#btn-pin').onclick = go;
    XC.$('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
  }

  function render(app) {
    const cfg = ov.config;
    const P = cfg.points;
    app.innerHTML = `
    <div class="panel-hd">
      <button class="icon-btn back" id="s-back">${XC.icon('back')}</button>
      <h1>管理</h1>
      <span class="sub">${ov.users.length} 个用户</span>
    </div>

    <div class="admin-tabs">
      <div class="seg seg-block" id="tabs">
        <button data-t="overview" class="${tab === 'overview' ? 'on' : ''}">概览</button>
        <button data-t="ai" class="${tab === 'ai' ? 'on' : ''}">AI</button>
        <button data-t="points" class="${tab === 'points' ? 'on' : ''}">积分</button>
        <button data-t="shop" class="${tab === 'shop' ? 'on' : ''}">商城</button>
        <button data-t="msgs" class="${tab === 'msgs' ? 'on' : ''}">留言</button>
        <button data-t="users" class="${tab === 'users' ? 'on' : ''}">用户</button>
      </div>
    </div>
    <div id="pane"></div>`;

    XC.$('#s-back').onclick = () => XC.go('#/');
    XC.$$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(app); });

    const pane = XC.$('#pane');
    if (tab === 'overview') pane.innerHTML = paneOverview(cfg);
    else if (tab === 'ai') pane.innerHTML = paneAI(cfg);
    else if (tab === 'points') pane.innerHTML = panePoints(P);
    else if (tab === 'shop') pane.innerHTML = paneShop(cfg);
    else if (tab === 'msgs') pane.innerHTML = '<div class="empty">正在载入留言…</div>';
    else pane.innerHTML = paneUsers();

    (bind[tab] || (() => { }))(app, cfg);
  }

  /* ---------- 概览 ---------- */
  function paneOverview(cfg) {
    const totalQ = ov.users.reduce((s, u) => s + (u.answered || 0), 0);
    const totalPts = ov.users.reduce((s, u) => s + (u.balance || 0), 0);
    return `
    <div class="kv-grid">
      <div class="kv"><div class="k">用户数</div><div class="v">${ov.users.length}</div></div>
      <div class="kv"><div class="k">累计答题</div><div class="v">${XC.n(totalQ)}</div></div>
      <div class="kv"><div class="k">流通积分</div><div class="v" style="color:var(--gold)">${XC.n(totalPts)}</div></div>
      <div class="kv"><div class="k">商城商品</div><div class="v">${cfg.shop.length}</div></div>
    </div>

    <div class="card card-pad" style="margin-top:14px;padding:12px 16px">
      <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">常用功能在哪</div>
      <div style="font-size:13px;color:var(--ink-2);line-height:2">
        · 修改管理员 PIN → 本页下方「安全」<br>
        · 新增 / 编辑商品 → 「商城」页底部按钮<br>
        · 给用户加 / 扣积分 → 「用户」页每行的 ＋ 按钮<br>
        · 配置 AI（Key / 模式）→ 「AI」页
      </div>
    </div>

    <div class="group">
      <div class="gh">系统状态</div>
      <div class="card">
        <div class="field">
          <div><div class="field-label">内置 AI Key</div><div class="field-desc">${cfg.ai.builtin.hasKey ? '已配置 · ' + XC.esc(cfg.ai.builtin.keyHint) : '未配置，用户需自备 Key'}</div></div>
          <div class="field-ctl"><span class="tagline"><span class="${cfg.ai.builtin.hasKey ? 'dot-ok' : 'dot-off'}"></span>${cfg.ai.builtin.hasKey ? '就绪' : '空缺'}</span></div>
        </div>
        <div class="field">
          <div><div class="field-label">全局 AI 模式</div><div class="field-desc">用户可以单独覆盖这个设置</div></div>
          <div class="field-ctl"><span class="badge">${cfg.ai.mode}</span></div>
        </div>
        <div class="field">
          <div><div class="field-label">数据目录</div><div class="field-desc">data/config.json · data/users/</div></div>
          <div class="field-ctl"><button class="btn btn-ghost btn-sm" id="btn-open-hint">说明</button></div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="gh">安全</div>
      <div class="card">
        <div class="field field-col">
          <div class="field-label">修改管理员 PIN</div>
          <div class="field-desc">4–8 位数字。忘记后可直接编辑 data/config.json 里的 adminPin。</div>
          <div style="display:flex;gap:8px;margin-top:9px">
            <input class="input input-mono" id="new-pin" maxlength="8" inputmode="numeric" placeholder="新的 PIN">
            <button class="btn btn-primary" id="btn-save-pin" style="flex:0 0 auto">保存</button>
          </div>
        </div>
        <div class="field">
          <div><div class="field-label">退出管理员</div></div>
          <div class="field-ctl"><button class="btn btn-soft btn-sm" id="btn-admin-out">退出</button></div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- AI ---------- */
  function paneAI(cfg) {
    const ai = cfg.ai;
    return `
    <div class="group">
      <div class="gh">全局 AI 设置</div>
      <div class="card">
        <div class="field field-col">
          <div class="field-label">默认模式</div>
          <div class="seg seg-block" id="ai-mode" style="margin-top:8px">
            <button data-v="builtin" class="${ai.mode === 'builtin' ? 'on' : ''}">内置 Key</button>
            <button data-v="off" class="${ai.mode === 'off' ? 'on' : ''}">关闭</button>
          </div>
          <div class="field-desc" style="margin-top:8px">用户可在「我的 → AI」里选择用自己的 Key 或彻底关闭。</div>
        </div>
        <div class="field">
          <div><div class="field-label">允许把答案解析发给 AI</div><div class="field-desc">关闭时只发送题干与选项，避免做题前剧透</div></div>
          <div class="field-ctl"><label class="switch"><input type="checkbox" id="sw-ctx" ${ai.allowAnswerContext ? 'checked' : ''}><span class="track"></span></label></div>
        </div>
        <div class="field">
          <div><div class="field-label">单次对话最大轮数</div></div>
          <div class="field-ctl"><input class="input input-mono" id="ai-turns" type="number" min="2" max="40" value="${ai.maxTurns}" style="width:80px;text-align:center"></div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="gh">内置模型</div>
      <div class="card">
        <div class="field field-col">
          <div class="field-label">接口地址（OpenAI 兼容）</div>
          <input class="input input-mono" id="ai-base" value="${XC.esc(ai.builtin.baseUrl)}" placeholder="https://api.deepseek.com/v1">
          ${/^mock$/i.test(ai.builtin.baseUrl) ? '<div class="field-desc" style="color:var(--gold)">当前是「演示模式」：AI 用模拟回复，方便体验对话。填入真实接口地址（如 https://api.deepseek.com/v1）+ Key 即可切换为真实模型。</div>' : ''}
        </div>
        <div class="field field-col">
          <div class="field-label">模型名</div>
          <div style="display:flex;gap:8px;align-items:stretch">
            <input class="input input-mono" id="ai-model" value="${XC.esc(ai.builtin.model)}" placeholder="deepseek-chat" style="flex:1">
            <button class="btn btn-ghost" id="btn-fetch-models" style="flex:0 0 auto;padding:0 14px">获取模型列表</button>
          </div>
          <div class="model-chips" id="model-chips" style="margin-top:8px"></div>
          <div class="field-desc">模型名必须和接口方提供的一致（如 deepseek-chat）。点「获取模型列表」可从接口拉取可用名称，点名称自动填入。</div>
        </div>
        <div class="field field-col">
          <div class="field-label">API Key</div>
          <input class="input input-mono" id="ai-key" type="password" placeholder="${ai.builtin.hasKey ? '已配置 ' + XC.esc(ai.builtin.keyHint) + '，留空则不修改' : '尚未配置，粘贴 sk-... 保存'}">
          <div class="field-desc">Key 只写在 data/config.json，前端接口只返回掩码。填写后所有选择「内置」的用户都会使用它。</div>
        </div>
        <div class="field">
          <div class="field-desc">保存后立即写入配置文件。</div>
          <div class="field-ctl"><button class="btn btn-primary btn-sm" id="btn-save-ai">保存</button></div>
        </div>
      </div>
    </div>

    <p class="tiny-note">接口地址填 OpenAI 兼容的 Base URL（一般以 /v1 结尾）。遇到「模型名不存在」的报错，用「获取模型列表」拉取正确名称即可。</p>`;
  }

  /* ---------- 积分规则 ---------- */
  function panePoints(P) {
    const rows = [
      ['correct', '首次答对', '答对一道题的积分'],
      ['wrong', '首次答错', '鼓励做题，避免因怕错而不做'],
      ['firstSolve', '首解奖励', '第一次就答对的额外奖励'],
      ['redoCorrect', '错题重做答对', '同一题之前错过、这次做对'],
      ['dailyGoal', '每日目标题数', '达到后发放奖励'],
      ['dailyGoalBonus', '每日目标奖励', '当天首次达标时发放'],
    ];
    return `
    <div class="group">
      <div class="gh">积分规则</div>
      <div class="card">
        ${rows.map(([k, label, desc]) => `<div class="field field-col">
          <div class="field-label">${label}</div><div class="field-desc">${desc}</div>
          <input class="input input-mono" data-p="${k}" type="number" min="0" value="${P[k]}" style="max-width:140px;margin-top:8px">
        </div>`).join('')}
        <div class="field"><div class="field-desc">修改只影响之后的答题，不追溯历史积分。</div>
          <div class="field-ctl"><button class="btn btn-primary btn-sm" id="btn-save-points">保存规则</button></div></div>
      </div>
    </div>
    <p class="tiny-note">防刷分：同一道题重复作答不再计分；错题只有第一次改对时给分。</p>`;
  }

  /* ---------- 商城 ---------- */
  function paneShop(cfg) {
    return `
    <div class="group">
      <div class="gh">商品管理</div>
      <div class="card" style="padding:6px 18px">
        ${cfg.shop.map(it => `<div class="list-row">
          <div style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border:1px solid var(--gold);font-family:var(--font-serif)">${XC.esc(it.label || '礼')}</div>
          <div class="main"><div class="t">${XC.esc(it.name)} ${it.enabled ? '' : '<span class="badge">已下架</span>'}</div>
            <div class="s">${it.cost} 分 · 库存 ${it.stock}</div></div>
          <button class="icon-btn" data-edit="${it.id}" title="编辑">${XC.icon('edit')}</button>
          <button class="icon-btn" data-del="${it.id}" title="删除">${XC.icon('trash')}</button>
        </div>`).join('') || '<div class="empty" style="padding:26px 0">还没有商品</div>'}
      </div>
      <button class="btn btn-primary btn-block" id="btn-add-goods" style="margin-top:12px">${XC.icon('plus')} 新增商品</button>
    </div>
    <p class="tiny-note">商品是虚拟的，兑换只扣积分并生成记录；库存为全局值，所有用户共享。</p>`;
  }

  /* ---------- 用户 ---------- */
  function paneUsers() {
    return `
    <div class="group">
      <div class="gh">用户列表</div>
      <div class="card" style="padding:6px 18px">
        ${ov.users.map(u => `<div class="list-row">
          <div style="width:30px;height:30px;border-radius:99px;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--line);font-size:13px">${XC.esc((u.name || '?').slice(0, 1))}</div>
          <div class="main"><div class="t">${XC.esc(u.name)}${u.id === XC.S.uid ? ' <span class="badge">当前</span>' : ''}</div>
            <div class="s"><span style="font-family:var(--font-mono)">${XC.esc(u.id)}</span> · 答 ${u.answered || 0} 题 · 正确率 ${u.answered ? Math.round(u.correct / u.answered * 100) : 0}% · 错题 ${u.wrongCount || 0}</div></div>
          <span style="font-size:13px;color:var(--gold);font-variant-numeric:tabular-nums">${XC.n(u.balance)}</span>
          <button class="btn btn-ghost btn-sm" data-enter="${u.id}" title="用这个身份打开网站（当前浏览器切换过去）">${u.id === XC.S.uid ? '当前' : '进入'}</button>
          <button class="icon-btn" data-merge="${u.id}" title="合并到另一个账号（处理同一个人多打了空格产生的重复账号）">${XC.icon('grid')}</button>
          <button class="icon-btn" data-pts="${u.id}" title="调整积分">${XC.icon('plus')}</button>
          <button class="icon-btn" data-rmuser="${u.id}" title="删除用户">${XC.icon('trash')}</button>
        </div>`).join('')}
      </div>
    </div>
    <p class="tiny-note">同一个人的重复账号（昵称多了空格/大小写不同）用「网格」按钮合并：记录与积分并入，源账号删除并自动备份。</p>`;
  }

  /* ---------- 事件绑定 ---------- */
  const bind = {
    overview(app, cfg) {
      XC.$('#btn-open-hint').onclick = () => XC.sheet({
        title: '数据都在本机',
        sub: '想备份或迁移，直接拷这两个位置',
        body: `<div class="code-box">config.json  →  data/config.json
用户记录    →  data/users/*.json
题库        →  data/xingcezhenti/</div>
        <p class="tiny-note">管理界面没有服务端账号体系，PIN 只是防误触。因为服务只监听 127.0.0.1，局域网其他设备访问不到。</p>`,
        actions: [{ label: '知道了', kind: 'btn-primary' }],
      });
      XC.$('#btn-save-pin').onclick = async () => {
        const pin = XC.$('#new-pin').value.trim();
        if (!/^\d{4,8}$/.test(pin)) return XC.toast('PIN 需为 4–8 位数字', 'bad');
        await XC.admin('config', { patch: { adminPin: pin } });
        sessionStorage.setItem('xingce_admin_pin', pin);
        XC.toast('PIN 已更新', 'ok');
      };
      XC.$('#btn-admin-out').onclick = () => {
        XC.adminOut();
        XC.toast('已退出管理员');
        XC.go('#/');
      };
    },

    ai(app, cfg) {
      let mode = cfg.ai.mode;
      XC.$$('#ai-mode button').forEach(b => b.onclick = () => {
        mode = b.dataset.v;
        XC.$$('#ai-mode button').forEach(x => x.classList.toggle('on', x === b));
      });
      const ctx = XC.$('#sw-ctx');
      /* 拉取模型列表 */
      const chips = XC.$('#model-chips');
      const paintModels = ids => {
        chips.innerHTML = ids.map(m => `<button class="ai-q" data-m="${XC.esc(m)}" title="点击填入">${XC.esc(m)}</button>`).join('');
        chips.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
          XC.$('#ai-model').value = b.dataset.m;
          XC.toast('已填入模型名', 'ok');
        });
      };
      XC.$('#btn-fetch-models').onclick = async () => {
        const btn = XC.$('#btn-fetch-models');
        btn.disabled = true; btn.textContent = '拉取中…';
        try {
          const r = await XC.api.post('/api/ai/models', { uid: XC.S.uid, scope: 'builtin' });
          paintModels(r.models || []);
          const cur = XC.$('#ai-model').value.trim();
          if ((r.models || []).length && cur && !r.models.includes(cur)) XC.toast('当前模型名「' + cur + '」不在列表里，点一个名称替换它', 'bad');
          else if (!(r.models || []).length) XC.toast('接口没有返回模型', 'bad');
        } catch (e) {
          XC.toast(e.message || '拉取失败', 'bad');
        } finally {
          btn.disabled = false; btn.textContent = '获取模型列表';
        }
      };
      XC.$('#btn-save-ai').onclick = async () => {
        const patch = {
          ai: {
            mode,
            allowAnswerContext: ctx.checked,
            maxTurns: +XC.$('#ai-turns').value || 12,
            builtin: {
              baseUrl: XC.$('#ai-base').value.trim(),
              model: XC.$('#ai-model').value.trim(),
              apiKey: XC.$('#ai-key').value.trim(),
            },
          },
        };
        await XC.admin('config', { patch });
        XC.toast('AI 配置已保存', 'ok');
        XC.views.admin(XC.$('#app'));
      };
    },

    points(app) {
      XC.$('#btn-save-points').onclick = async () => {
        const p = {};
        XC.$$('input[data-p]').forEach(i => { p[i.dataset.p] = Math.max(0, +i.value || 0); });
        await XC.admin('config', { patch: { points: p } });
        XC.toast('积分规则已保存', 'ok');
        XC.views.admin(XC.$('#app'));
      };
    },

    shop(app, cfg) {
      XC.$$('[data-edit]').forEach(b => b.onclick = () => {
        const it = cfg.shop.find(x => x.id === b.dataset.edit);
        goodsForm('编辑商品', it, async data => {
          await XC.admin('shop', { action: 'update', item: Object.assign({ id: it.id }, data) });
          XC.toast('已保存', 'ok');
          XC.views.admin(XC.$('#app'));
        });
      });
      XC.$$('[data-del]').forEach(b => b.onclick = async () => {
        const it = cfg.shop.find(x => x.id === b.dataset.del);
        const ok = await XC.confirm('删除商品', `确定删除「${it.name}」？已兑换记录不受影响。`, '删除', 'btn-danger');
        if (!ok) return;
        await XC.admin('shop', { action: 'remove', item: { id: it.id } });
        XC.toast('已删除');
        XC.views.admin(XC.$('#app'));
      });
      XC.$('#btn-add-goods').onclick = () => {
        goodsForm('新增商品', { label: '礼', enabled: true, cost: 100, stock: 10 }, async data => {
          await XC.admin('shop', { action: 'add', item: data });
          XC.toast('已上架', 'ok');
          XC.views.admin(XC.$('#app'));
        });
      };
    },

    msgs(app) {
      let list = [];
      async function paint() {
        const pane = XC.$('#pane');
        try {
          list = (await (await fetch('/api/messages')).json()).messages || [];
        } catch (e) {
          pane.innerHTML = '<div class="empty">留言加载失败：' + XC.esc(e.message || '') + '</div>';
          return;
        }
        if (!list.length) {
          pane.innerHTML = '<div class="empty" style="padding:30px 0">还没有人留言</div>';
          return;
        }
        pane.innerHTML = `
        <div class="group">
          <div class="gh">留言墙（${list.length} 条）</div>
          <div class="card" style="padding:6px 18px">
            ${list.slice().reverse().map(m => {
              const d = new Date(m.ts);
              const hm = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              return `<div class="list-row">
                <div style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--line);font-size:13px;flex-shrink:0">${XC.esc((m.name || '?').slice(0, 1))}</div>
                <div class="main"><div class="t">${m.img ? '🖼 ' : ''}${XC.esc(m.text)}</div>
                  <div class="s">${XC.esc(m.name)} · ${hm}</div></div>
                <button class="icon-btn" data-mdel="${m.id}" title="删除留言">${XC.icon('trash')}</button>
              </div>`;
            }).join('')}
          </div>
        </div>
        <p class="tiny-note">点击垃圾桶删除留言，删除前会二次确认；首页留言墙里的作者也能删除自己的留言。</p>`;
        pane.querySelectorAll('[data-mdel]').forEach(b => b.onclick = async () => {
          const m = list.find(x => x.id === b.dataset.mdel);
          const ok = await XC.confirm('删除留言',
            `确定删除「${XC.esc(m.text.length > 18 ? m.text.slice(0, 18) + '…' : m.text)}」？删除后不可恢复。`,
            '删除', 'btn-danger');
          if (!ok) return;
          try {
            await XC.admin('messages/del', { id: m.id });
            XC.toast('已删除', 'ok');
            paint();
          } catch (e) { XC.toast(e.message || '删除失败', 'bad'); }
        });
      }
      paint();
    },

    users(app) {
      XC.$$('[data-enter]').forEach(b => b.onclick = async () => {
        if (b.dataset.enter === XC.S.uid) return;
        await XC.switchUser(b.dataset.enter);
        const nm = XC.S.user.name;
        XC.go('#/');
        XC.toast('已切换到「' + nm + '」的身份', 'ok');
      });
      XC.$$('[data-merge]').forEach(b => b.onclick = () => {
        const from = ov.users.find(x => x.id === b.dataset.merge);
        const others = ov.users.filter(x => x.id !== from.id);
        if (!others.length) return XC.toast('只有一个账号，没有可并入的目标', 'bad');
        XC.sheet({
          title: '合并账号',
          sub: `把「${from.name}」（${from.answered || 0} 题）并入另一个账号`,
          body: `<div style="max-height:240px;overflow:auto">
            ${others.map(o => `<div class="list-row" style="cursor:pointer" data-t="${o.id}">
              <div class="main"><div class="t">${XC.esc(o.name)}</div>
                <div class="s"><span style="font-family:var(--font-mono)">${XC.esc(o.id)}</span> · ${o.answered || 0} 题</div></div>
              <button class="btn btn-soft btn-sm">选它</button>
            </div>`).join('')}
          </div>
          <p class="tiny-note">合并后：两边的做题记录取并集、积分相加、错题本取并集，源账号删除并在 data/users 里留一份 .merged.bak.json 备份。</p>`,
          actions: [{ label: '取消', kind: 'btn-ghost' }],
          onMount: p => {
            p.querySelectorAll('[data-t]').forEach(row => row.onclick = async () => {
              const toId = row.dataset.t;
              const to = ov.users.find(x => x.id === toId);
              const ok = await XC.confirm('确认合并',
                `「${from.name}」的全部记录会并入「${to.name}」，源账号随后删除。`,
                '合并', 'btn-danger');
              if (!ok) return;
              try {
                await XC.admin('users/merge', { from: from.id, to: toId });
                XC.toast('已合并到「' + to.name + '」', 'ok');
                XC.closeSheet();
                XC.views.admin(XC.$('#app'));
              } catch (e) { XC.toast(e.message || '合并失败', 'bad'); }
            });
          },
        });
      });
      XC.$$('[data-pts]').forEach(b => b.onclick = () => {
        const u = ov.users.find(x => x.id === b.dataset.pts);
        XC.sheet({
          title: '调整积分',
          sub: `${u.name} · 当前 ${u.balance} 分`,
          body: `<div style="display:flex;gap:8px">
            <input class="input input-mono" id="adj" type="number" value="100" style="flex:1">
            <button class="btn btn-ghost" id="adj-neg" style="flex:0 0 auto">扣减</button>
            <button class="btn btn-primary" id="adj-pos" style="flex:0 0 auto">增加</button>
          </div>
          <p class="tiny-note">用于补偿测试、发放奖励或纠正错误。</p>`,
          actions: [{ label: '关闭', kind: 'btn-ghost' }],
          onMount: p => {
            const doAdj = async sign => {
              const v = Math.abs(+XC.$('#adj', p).value || 0) * sign;
              if (!v) return;
              await XC.admin('points', { uid: u.id, delta: v, reason: '管理员调整' });
              XC.closeSheet();
              XC.toast('已' + (sign > 0 ? '增加' : '扣减') + ' ' + Math.abs(v) + ' 分', 'ok');
              XC.views.admin(XC.$('#app'));
            };
            XC.$('#adj-pos', p).onclick = () => doAdj(1);
            XC.$('#adj-neg', p).onclick = () => doAdj(-1);
          },
        });
      });
      XC.$$('[data-rmuser]').forEach(b => b.onclick = async () => {
        const u = ov.users.find(x => x.id === b.dataset.rmuser);
        if (u.id === XC.S.uid) return XC.toast('不能删除当前正在使用的用户', 'bad');
        const ok = await XC.confirm('删除用户', `将删除「${u.name}」的全部记录，不可恢复。`, '删除', 'btn-danger');
        if (!ok) return;
        await XC.api.del('/api/users/' + u.id);
        XC.toast('已删除');
        XC.views.admin(XC.$('#app'));
      });
    },
  };

  /* 商品表单 */
  function goodsForm(title, it, onSubmit) {
    XC.sheet({
      title,
      body: `<div style="display:flex;flex-direction:column;gap:12px">
        <div><div class="field-label">名称</div><input class="input" id="g-name" value="${XC.esc(it.name || '')}" maxlength="20" style="margin-top:6px"></div>
        <div><div class="field-label">说明</div><input class="input" id="g-desc" value="${XC.esc(it.desc || '')}" maxlength="60" style="margin-top:6px"></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><div class="field-label">积分价格</div><input class="input input-mono" id="g-cost" type="number" min="0" value="${it.cost ?? 100}" style="margin-top:6px"></div>
          <div style="flex:1"><div class="field-label">库存</div><input class="input input-mono" id="g-stock" type="number" min="0" value="${it.stock ?? 10}" style="margin-top:6px"></div>
          <div style="flex:0 0 74px"><div class="field-label">图标字</div><input class="input" id="g-label" value="${XC.esc(it.label || '礼')}" maxlength="2" style="margin-top:6px;text-align:center"></div>
        </div>
        <div class="field" style="border:none;padding:0">
          <div class="field-label">上架</div>
          <div class="field-ctl"><label class="switch"><input type="checkbox" id="g-on" ${it.enabled !== false ? 'checked' : ''}><span class="track"></span></label></div>
        </div>
      </div>`,
      actions: [
        { label: '取消', kind: 'btn-ghost' },
        {
          label: '保存', kind: 'btn-primary', close: false, onClick: async p => {
            const name = XC.$('#g-name', p).value.trim();
            if (!name) { XC.toast('请填写名称', 'bad'); return true; }
            await onSubmit({
              name,
              desc: XC.$('#g-desc', p).value.trim(),
              cost: Math.max(0, +XC.$('#g-cost', p).value || 0),
              stock: Math.max(0, +XC.$('#g-stock', p).value || 0),
              label: XC.$('#g-label', p).value.trim() || '礼',
              enabled: XC.$('#g-on', p).checked,
            });
            XC.closeSheet();
            return true;
          },
        },
      ],
    });
  }
})(window.XC);
