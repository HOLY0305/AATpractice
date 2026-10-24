/* 积分商城 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  XC.views.shop = function (app) {
    const u = XC.S.user;
    const P = XC.S.config.points;
    const items = (XC.S.config.shop || []).filter(x => x.enabled);
    const reds = u.redemptions || [];

    app.innerHTML = `
    <div class="panel-hd">
      <button class="icon-btn back" id="s-back">${XC.icon('back')}</button>
      <h1>积分商城</h1>
      <span class="sub">答对得更多</span>
    </div>

    <div class="balance-card">
      <div>
        <div class="k">当前积分</div>
        <div class="v">${XC.n(u.points.balance)}<small>分</small></div>
      </div>
      <div class="side">
        <div>累计获得 ${XC.n(u.points.total)}</div>
        <div>已消费 ${XC.n(u.points.spent)}</div>
      </div>
    </div>

    <div class="group">
      <div class="gh">可兑换</div>
      <div class="shop-grid">
        ${items.map(it => {
      const afford = u.points.balance >= it.cost;
      const out = it.stock <= 0;
      return `<div class="goods ${out || !afford ? 'off' : ''}">
            <div class="glyph">${XC.esc(it.label || '礼')}</div>
            <div class="nm">${XC.esc(it.name)}</div>
            <div class="ds">${XC.esc(it.desc || '')}</div>
            <div class="ft"><span class="price">${it.cost}<small>分</small></span>
              <span class="stock">${out ? '已兑完' : '余 ' + it.stock}</span></div>
            <button class="btn btn-sm ${afford && !out ? 'btn-gold' : 'btn-soft'}" data-id="${it.id}" ${out || !afford ? 'disabled' : ''}>
              ${out ? '已兑完' : afford ? '兑换' : '差 ' + (it.cost - u.points.balance) + ' 分'}</button>
          </div>`;
    }).join('') || '<div class="empty">还没有上架商品</div>'}
      </div>
    </div>

    <div class="group">
      <div class="gh">怎样获得积分</div>
      <div class="card">
        <div class="field"><div class="field-label">首次答对</div><div class="field-ctl" style="color:var(--ok)">+${P.correct + P.firstSolve} 分</div></div>
        <div class="field"><div class="field-label">首次答错（也算完成）</div><div class="field-ctl" style="color:var(--ink-2)">+${P.wrong} 分</div></div>
        <div class="field"><div class="field-label">错题重做答对</div><div class="field-ctl" style="color:var(--ink-2)">+${P.redoCorrect} 分</div></div>
        <div class="field"><div class="field-label">完成每日 ${P.dailyGoal} 题</div><div class="field-ctl" style="color:var(--gold)">+${P.dailyGoalBonus} 分</div></div>
      </div>
    </div>

    <div class="group">
      <div class="gh">兑换记录</div>
      <div class="card">
        ${reds.length ? reds.map(r => `<div class="list-row">
          <div class="main"><div class="t">${XC.esc(r.name)}</div><div class="s">${XC.dateStr(r.t)}</div></div>
          <div class="v neg">-${r.cost}</div>
        </div>`).join('') : '<div class="empty" style="padding:28px 0">还没有兑换过东西</div>'}
      </div>
    </div>

    <p class="tiny-note">商品与价格由管理员在「管理 → 商城」中维护。兑换只在本机记账，实质奖励需要自己兑现。</p>`;

    XC.$('#s-back').onclick = () => XC.go('#/');

    XC.$$('.goods .btn[data-id]').forEach(b => b.onclick = () => {
      const it = items.find(x => x.id === b.dataset.id);
      if (!it) return;
      XC.sheet({
        title: '确认兑换',
        sub: `${it.name} · ${it.cost} 积分`,
        body: `<p style="font-size:13.5px;color:var(--ink-2);line-height:1.8;margin:0">
        兑换后将扣除 <b style="color:var(--gold)">${it.cost}</b> 积分，剩余 <b>${u.points.balance - it.cost}</b> 分。<br>
        ${XC.esc(it.desc || '')}</p>`,
        actions: [
          { label: '再想想', kind: 'btn-ghost' },
          {
            label: '确认兑换', kind: 'btn-gold', close: false, onClick: async p => {
              try {
                await XC.redeem(it.id);
                XC.closeSheet();
                XC.toast('兑换成功：' + it.name, 'ok');
                XC.renderNav();
                XC.views.shop(XC.$('#app'));
              } catch (e) {
                XC.toast(e.message, 'bad');
              }
              return true;
            },
          },
        ],
      });
    });
  };
})(window.XC);
