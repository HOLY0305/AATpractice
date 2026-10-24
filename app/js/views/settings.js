/* 我的：身份、外观、AI、数据 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  XC.views.settings = function (app) {
    const u = XC.S.user;
    const cfg = XC.S.config;
    const s = u.settings;
    const st = XC.overall();
    const aiMode = s.aiMode || 'inherit';
    const effMode = aiMode === 'inherit' ? (cfg.ai.mode || 'builtin') : aiMode;
    const builtinReady = !!cfg.ai.builtin.hasKey;

    const aiStatus = effMode === 'off' ? '已关闭'
      : effMode === 'custom' ? (s.aiKey ? '使用你自己的 Key' : '尚未填写自己的 Key')
        : (builtinReady ? '使用内置 Key' : '内置 Key 未配置');

    app.innerHTML = `
    <div class="panel-hd">
      <button class="icon-btn back" id="s-back">${XC.icon('back')}</button>
      <h1>我的</h1>
      <span class="sub">${XC.S.admin ? '当前为管理员视角' : '普通用户'}</span>
    </div>

    <div class="role-card ${XC.S.admin ? 'admin' : ''}">
      <div class="av">${XC.esc((s.title || u.name || '我').slice(0, 1))}</div>
      <div style="flex:1;min-width:0">
        <div class="nm">${XC.esc(u.name)}${s.title ? ` <span class="badge" style="margin-left:4px">${XC.esc(s.title)}</span>` : ''}</div>
        <div class="rl">${XC.S.admin ? '管理员' : '用户'} · 累计 ${XC.n(st.answered)} 题 · 正确率 ${st.acc}%</div>
      </div>
      <button class="btn btn-soft btn-sm" id="btn-switch">切换</button>
    </div>

    <div class="group">
      <div class="gh">账号与同步</div>
      <div class="card">
        <div class="field field-col">
          <div class="field-label">你的同步码</div>
          <div style="display:flex;gap:8px;align-items:stretch;margin-top:8px">
            <input class="input input-mono" id="sync-code" value="${XC.esc(u.id)}" readonly
              style="flex:1;letter-spacing:1px;cursor:text">
            <button class="btn btn-soft" id="btn-copy-code" style="flex:0 0 auto;padding:0 14px">复制</button>
          </div>
          <div class="field-desc">在手机 / 另一个浏览器打开同一个网址，点「用同步码登录」填这个码，就能看到完全一样的记录。同步码永远唯一，不受昵称拼写影响；用昵称登录则必须与注册时一字不差。</div>
        </div>
        <div class="field">
          <div><div class="field-label">数据存在服务器</div><div class="field-desc">data/users/${XC.esc(u.id)}.json · 最近同步 ${u.lastSeenAt ? XC.esc(new Date(u.lastSeenAt).toLocaleString('zh-CN', { hour12: false })) : '刚刚'}</div></div>
          <div class="field-ctl"><button class="btn btn-ghost btn-sm" id="btn-sync-now">立即同步</button></div>
        </div>
        <div class="field">
          <div><div class="field-label">在这台设备上退出</div><div class="field-desc">只清除本机身份，服务器上的记录不会删除；下次用同步码或昵称重新进入即可</div></div>
          <div class="field-ctl"><button class="btn btn-soft btn-sm" id="btn-logout">退出登录</button></div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="gh">身份</div>
      <div class="card">
        <div class="field">
          <div><div class="field-label">当前用户</div><div class="field-desc">做题记录、错题、积分都存在服务器 data/users 目录，多设备登录同一身份自动同步</div></div>
          <div class="field-ctl"><button class="btn btn-ghost btn-sm" id="btn-users">管理</button></div>
        </div>
        <div class="field">
          <div><div class="field-label">管理界面</div><div class="field-desc">${XC.S.admin ? '已解锁，点击进入后台（概览 / AI / 积分 / 商城 / 用户）' : '改 PIN、配 AI、加商品、调积分都在这里，进入需输入 PIN（默认 8888）'}</div></div>
          <div class="field-ctl">${XC.S.admin ? `<button class="btn btn-ghost btn-sm" id="btn-admin-out" style="margin-right:6px">退出</button>` : ''}<button class="btn btn-soft btn-sm" id="btn-admin-in">进入</button></div>
        </div>
        <div class="field field-col">
          <div class="field-label">${u.hasPass ? '修改密码' : '设置密码（可选）'}</div>
          <div class="field-desc">防止别人用你的昵称进入。留空保存 = 清除密码。只存在本机数据文件里。</div>
          <div style="display:flex;gap:8px;align-items:stretch;margin-top:9px">
            <input class="input" id="in-pass" type="password" maxlength="32" placeholder="${u.hasPass ? '输入新密码' : '不填也能用，建议设置'}" style="flex:1">
            <button class="btn btn-soft" id="btn-pass" style="flex:0 0 auto;padding:0 16px">保存</button>
          </div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="gh">外观</div>
      <div class="card">
        <div class="field">
          <div><div class="field-label">主题</div></div>
          <div class="field-ctl">
            <div class="seg" id="theme-seg">
              <button data-v="auto" class="${s.theme === 'auto' ? 'on' : ''}">跟随系统</button>
              <button data-v="light" class="${s.theme === 'light' ? 'on' : ''}">浅色</button>
              <button data-v="dark" class="${s.theme === 'dark' ? 'on' : ''}">深色</button>
            </div>
          </div>
        </div>
        <div class="field">
          <div><div class="field-label">称号</div><div class="field-desc">显示在导航头像和个人页，可在商城兑换</div></div>
          <div class="field-ctl"><input class="input" id="in-title" maxlength="16" value="${XC.esc(s.title || '')}" placeholder="未设置" style="width:130px"></div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="gh">AI 解题助手</div>
      <div class="card">
        <div class="field">
          <div><div class="field-label">使用方式</div><div class="field-desc">当前：${aiStatus}</div></div>
          <div class="field-ctl"></div>
        </div>
        <div class="field field-col">
          <div class="seg seg-block" id="ai-seg">
            <button data-v="inherit" class="${aiMode === 'inherit' ? 'on' : ''}">跟随全局</button>
            <button data-v="builtin" class="${aiMode === 'builtin' ? 'on' : ''}">用内置</button>
            <button data-v="custom" class="${aiMode === 'custom' ? 'on' : ''}">自己的</button>
            <button data-v="off" class="${aiMode === 'off' ? 'on' : ''}">关闭</button>
          </div>
          <div class="field-desc" style="margin-top:8px">关闭后答题页不会出现 AI 悬浮按钮，也不产生任何请求。</div>
        </div>
        ${aiMode === 'custom' ? `
        <div class="field field-col">
          <div class="field-label">接口地址</div>
          <input class="input input-mono" id="ai-url" value="${XC.esc(s.aiBaseUrl || cfg.ai.builtin.baseUrl || '')}" placeholder="https://api.deepseek.com/v1">
        </div>
        <div class="field field-col">
          <div class="field-label">模型名</div>
          <div style="display:flex;gap:8px;align-items:stretch">
            <input class="input input-mono" id="ai-model" value="${XC.esc(s.aiModel || cfg.ai.builtin.model || '')}" placeholder="deepseek-chat" style="flex:1">
            <button class="btn btn-ghost" id="btn-ai-models" style="flex:0 0 auto;padding:0 14px">获取模型列表</button>
          </div>
          <div class="model-chips" id="ai-model-chips" style="margin-top:8px"></div>
          <div class="field-desc">模型名必须与接口方提供的一致。先填好接口地址和 Key，再点「获取模型列表」，点名称自动填入。</div>
        </div>
        <div class="field field-col">
          <div class="field-label">你的 API Key</div>
          <input class="input input-mono" id="ai-key" type="password" value="${XC.esc(s.aiKey || '')}" placeholder="sk-...">
          <div class="field-desc">只保存在本机用户文件里，不会上传到任何地方。使用你自己的 Key 时，内置 Key 完全不会被调用。</div>
        </div>
        <div class="field"><div class="field-desc">保存后立即生效，具体问答能力将在下一步接入。</div>
          <div class="field-ctl"><button class="btn btn-primary btn-sm" id="btn-ai-save">保存</button></div></div>` : ''}
      </div>
    </div>

    <div class="group">
      <div class="gh">积分与数据</div>
      <div class="card">
        <div class="field">
          <div><div class="field-label">积分余额</div><div class="field-desc">累计获得 ${XC.n(u.points.total)} · 已消费 ${XC.n(u.points.spent)}</div></div>
          <div class="field-ctl"><span style="font-size:18px;color:var(--gold);font-variant-numeric:tabular-nums">${XC.n(u.points.balance)}</span></div>
        </div>
        <div class="field">
          <div><div class="field-label">积分明细</div></div>
          <div class="field-ctl"><button class="btn btn-ghost btn-sm" id="btn-ledger">查看</button></div>
        </div>
        <div class="field">
          <div><div class="field-label">导出记录</div><div class="field-desc">把当前用户的所有数据导出为 JSON 备份</div></div>
          <div class="field-ctl"><button class="btn btn-ghost btn-sm" id="btn-export">导出</button></div>
        </div>
      </div>
    </div>

    <p class="tiny-note">数据保存在本机：data/users/&lt;用户&gt;.json；全局配置（含内置 Key）在 data/config.json。换电脑时把这几个文件拷走即可。</p>`;

    XC.$('#s-back').onclick = () => XC.go('#/');

    /* 主题 */
    XC.$$('#theme-seg button').forEach(b => b.onclick = async () => {
      await XC.saveSettings({ theme: b.dataset.v });
      XC.views.settings(app);
      XC.renderNav();
    });

    /* 称号 */
    const titleInput = XC.$('#in-title');
    titleInput.onchange = async () => {
      await XC.saveSettings({ title: titleInput.value });
      XC.renderNav();
      XC.toast('称号已更新', 'ok');
    };

    /* 身份 */
    XC.$('#btn-switch').onclick = () => userPicker();
    XC.$('#btn-users').onclick = () => userPicker();

    /* 同步码：复制（http 环境下没有 clipboard API，退回 execCommand） */
    XC.$('#btn-copy-code').onclick = async () => {
      const code = u.id;
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(code); ok = true; }
      } catch (e) { ok = false; }
      if (!ok) {
        const ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
      }
      XC.toast(ok ? '同步码已复制' : '复制失败，可长按输入框手动复制', ok ? 'ok' : 'bad');
    };

    /* 立即同步：从服务器拉最新数据 */
    XC.$('#btn-sync-now').onclick = async () => {
      const btn = XC.$('#btn-sync-now');
      btn.disabled = true; btn.textContent = '同步中…';
      try {
        await XC.syncUser();
        XC.toast('已同步到最新记录', 'ok');
        XC.views.settings(app);
        XC.renderNav();
      } catch (e) {
        XC.toast(e.message || '同步失败', 'bad');
        btn.disabled = false; btn.textContent = '立即同步';
      }
    };

    /* 退出登录：只清本机身份 */
    XC.$('#btn-logout').onclick = async () => {
      const ok = await XC.confirm('退出登录', '这台设备会回到登录页，服务器上的记录仍然保留。', '退出', 'btn-danger');
      if (!ok) return;
      XC.logout();
      XC.toast('已退出，换账号或重新登录吧');
      location.hash = '#/';
      location.reload();
    };

    const adminIn = XC.$('#btn-admin-in');
    if (adminIn) adminIn.onclick = () => XC.go('#/admin');
    const adminOut = XC.$('#btn-admin-out');
    if (adminOut) adminOut.onclick = () => {
      XC.adminOut();
      XC.toast('已退出管理员');
      XC.views.settings(app);
    };

    /* 密码（可选） */
    XC.$('#btn-pass').onclick = async () => {
      const v = XC.$('#in-pass').value;
      if (v && v.length < 4) return XC.toast('密码至少 4 位（或留空清除）', 'bad');
      const r = await XC.api.post('/api/users/' + XC.S.uid + '/pass', { pass: v });
      XC.S.user.hasPass = r.hasPass;
      XC.$('#in-pass').value = '';
      XC.toast(r.hasPass ? '密码已保存，下次其他浏览器进入需输密码' : '密码已清除', 'ok');
      XC.views.settings(app);
    };

    /* AI */
    XC.$$('#ai-seg button').forEach(b => b.onclick = async () => {
      await XC.saveSettings({ aiMode: b.dataset.v });
      XC.views.settings(app);
    });
    const aiSave = XC.$('#btn-ai-save');
    if (aiSave) aiSave.onclick = async () => {
      await XC.saveSettings({
        aiBaseUrl: XC.$('#ai-url').value.trim(),
        aiModel: XC.$('#ai-model').value.trim(),
        aiKey: XC.$('#ai-key').value.trim(),
      });
      XC.toast('AI 配置已保存', 'ok');
      XC.views.settings(app);
    };
    /* 拉取自己接口的模型列表 */
    const aiChips = XC.$('#ai-model-chips');
    if (aiChips) {
      const paint = ids => {
        aiChips.innerHTML = ids.map(m => `<button class="ai-q" data-m="${XC.esc(m)}" title="点击填入">${XC.esc(m)}</button>`).join('');
        aiChips.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
          XC.$('#ai-model').value = b.dataset.m;
          XC.toast('已填入模型名，记得点保存', 'ok');
        });
      };
      XC.$('#btn-ai-models').onclick = async () => {
        // 用当前输入框里的地址/Key 拉取（先临时保存，保证服务端拿到最新值）
        await XC.saveSettings({
          aiBaseUrl: XC.$('#ai-url').value.trim(),
          aiModel: XC.$('#ai-model').value.trim(),
          aiKey: XC.$('#ai-key').value.trim(),
        });
        const btn = XC.$('#btn-ai-models');
        btn.disabled = true; btn.textContent = '拉取中…';
        try {
          const r = await XC.api.post('/api/ai/models', { uid: XC.S.uid });
          paint(r.models || []);
          const cur = XC.$('#ai-model').value.trim();
          if ((r.models || []).length && cur && !r.models.includes(cur)) XC.toast('当前模型名「' + cur + '」不在列表里，点一个名称再保存', 'bad');
          else if (!(r.models || []).length) XC.toast('接口没有返回模型', 'bad');
        } catch (e) {
          XC.toast(e.message || '拉取失败', 'bad');
        } finally {
          btn.disabled = false; btn.textContent = '获取模型列表';
        }
      };
    }

    /* 积分明细 */
    XC.$('#btn-ledger').onclick = async () => {
      const r = await XC.ledger();
      const rows = (r.ledger || []).map(x => `<div class="list-row">
        <div class="main"><div class="t">${XC.esc(x.reason || '积分变动')}</div>
        <div class="s">${XC.dateStr(x.t)}${x.pid ? ' · ' + XC.esc(x.pid) : ''}</div></div>
        <div class="v ${x.delta > 0 ? 'pos' : 'neg'}">${x.delta > 0 ? '+' : ''}${x.delta}</div>
      </div>`).join('') || '<div class="empty">还没有积分记录，去做几道题吧</div>';
      XC.sheet({
        title: '积分明细', sub: `当前余额 ${XC.n(r.points.balance)}`,
        body: `<div class="list" style="max-height:50vh;overflow:auto">${rows}</div>`,
        actions: [{ label: '关闭', kind: 'btn-ghost' }],
      });
    };

    /* 导出 */
    XC.$('#btn-export').onclick = () => {
      const blob = new Blob([JSON.stringify(XC.S.user, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `xingce-${XC.S.user.name}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      XC.toast('已导出备份文件', 'ok');
    };
  };

  /* 用户选择 / 新建 */
  function userPicker() {
    const list = XC.S.users.map(u =>
      `<div class="list-row" data-uid="${u.id}" style="cursor:pointer;padding:12px 4px">
        <div style="width:30px;height:30px;border-radius:99px;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--line);font-size:13px">${XC.esc((u.name || '?').slice(0, 1))}</div>
        <div class="main"><div class="t">${XC.esc(u.name)}</div>
        <div class="s">${u.id === XC.S.uid ? '当前使用中' : '点击切换'}</div></div>
        ${u.id === XC.S.uid ? `<span class="badge">当前</span>` : ''}
      </div>`).join('');
    XC.sheet({
      title: '切换用户',
      sub: '每个用户有独立的进度、错题与积分，互不影响',
      body: `<div class="list">${list}</div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <input class="input" id="new-user-name" placeholder="新用户名字" maxlength="20">
          <button class="btn btn-primary" id="btn-new-user" style="flex:0 0 auto">新建</button>
        </div>`,
      actions: [{ label: '关闭', kind: 'btn-ghost' }],
      onMount: p => {
        XC.$$('.list-row[data-uid]', p).forEach(row => row.onclick = async () => {
          if (row.dataset.uid === XC.S.uid) return XC.closeSheet();
          await XC.switchUser(row.dataset.uid);
          XC.closeSheet();
          XC.toast('已切换用户');
          XC.views.settings(XC.$('#app'));
          XC.renderNav();
        });
        XC.$('#btn-new-user', p).onclick = async () => {
          const name = XC.$('#new-user-name', p).value.trim();
          if (!name) return XC.toast('请输入名字', 'bad');
          await XC.createUser(name);
          XC.closeSheet();
          XC.toast('已创建并切换', 'ok');
          XC.views.settings(XC.$('#app'));
          XC.renderNav();
        };
      },
    });
  }

  /* 管理员 PIN */
  function pinSheet() {
    XC.sheet({
      title: '进入管理员模式',
      sub: '默认 PIN 为 8888，可在管理界面内修改',
      body: `<input class="input input-mono" id="pin-input" type="password" inputmode="numeric" placeholder="4–8 位数字" maxlength="8">`,
      actions: [
        { label: '取消', kind: 'btn-ghost' },
        {
          label: '解锁', kind: 'btn-primary', close: false, onClick: async p => {
            const ok = await XC.adminAuth(XC.$('#pin-input', p).value.trim());
            if (!ok) { XC.toast('PIN 错误', 'bad'); return true; }
            XC.closeSheet();
            XC.toast('已进入管理员模式', 'ok');
            XC.views.settings(XC.$('#app'));
            XC.renderNav();
          },
        },
      ],
      onMount: p => setTimeout(() => XC.$('#pin-input', p).focus(), 80),
    });
  }
  XC.pinSheet = pinSheet;
})(window.XC);
