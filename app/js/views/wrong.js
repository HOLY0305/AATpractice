/* 错题本：统计 / 筛选 / 详情 / 重做 / 间隔重复状态 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  const STATUS = {
    new: { label: '新错题', cls: 'b-new' },
    review: { label: '复习中', cls: 'b-review' },
    mastered: { label: '已掌握', cls: 'b-mastered' },
  };
  const LABELS = ['粗心', '不会', '时间不够'];

  function stripTags(html, n) {
    const t = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  function dueList(wrong) {
    const now = Date.now();
    return Object.values(wrong).filter(w => w.status !== 'mastered' && (!w.nextReview || w.nextReview <= now));
  }

  function summary(w) {
    if (w.snap && w.snap.stem) return stripTags(w.snap.stem, 64);
    return (w.tag ? '【' + w.tag + '】' : '') + 'qid ' + w.qid;
  }

  XC.views.wrong = async function (app) {
    const u = XC.S.user;
    const wrong = u.wrong || {};
    const all = Object.values(wrong);
    const due = dueList(wrong).length;
    const mastered = all.filter(w => w.status === 'mastered').length;
    const week = all.filter(w => (w.lastWrongAt || w.lastAt || 0) > Date.now() - 7 * 86400000).length;
    // 各模块错题分布
    const byMod = {};
    all.forEach(w => { const k = w.module || '00'; byMod[k] = (byMod[k] || 0) + 1; });

    const st = XC.views.wrong._st || (XC.views.wrong._st = { mod: 'all', status: 'active' });

    function render() {
      let list = all.slice();
      if (st.mod !== 'all') list = list.filter(w => (w.module || '00') === st.mod);
      if (st.status === 'active') list = list.filter(w => w.status !== 'mastered');
      else if (st.status === 'mastered') list = list.filter(w => w.status === 'mastered');
      else if (st.status === 'due') list = list.filter(w => w.status !== 'mastered' && (!w.nextReview || w.nextReview <= Date.now()));
      // 越紧迫越靠前；已掌握沉底
      list.sort((a, b) => (a.status === 'mastered' ? 1 : 0) - (b.status === 'mastered' ? 1 : 0)
        || (a.nextReview || 0) - (b.nextReview || 0)
        || (b.lastWrongAt || 0) - (a.lastWrongAt || 0));

      const modChips = ['all', ...Object.keys(XC.MODULES)].map(k =>
        `<button class="chip ${st.mod === k ? 'on' : ''}" data-mod="${k}">${k === 'all' ? '全部' : XC.MODULES[k]}${k !== 'all' && byMod[k] ? ` · ${byMod[k]}` : ''}</button>`).join('');
      const stChips = [['active', '未掌握'], ['due', `待复习${due ? ' · ' + due : ''}`], ['mastered', '已掌握']]
        .map(([k, lb]) => `<button class="chip ${st.status === k ? 'on' : ''}" data-st="${k}">${lb}</button>`).join('');

      const items = list.map(w => {
        const s = STATUS[w.status] || STATUS.new;
        const dueTxt = w.status === 'mastered' ? '' : (!w.nextReview || w.nextReview <= Date.now() ? '今天该复习' : XC.dateStr(w.nextReview) + ' 复习');
        return `<div class="witem card" data-qid="${w.qid}">
          <div class="witem-top">
            <span class="badge ${s.cls}">${s.label}</span>
            ${w.module && XC.MODULES[w.module] ? `<span class="badge b-mod">${XC.MODULES[w.module]}</span>` : ''}
            ${w.tag ? `<span class="badge b-mod">${XC.esc(w.tag)}</span>` : ''}
            ${w.label ? `<span class="badge b-label">${XC.esc(w.label)}</span>` : ''}
            <span class="witem-meta">错 ${w.wrong || 1} 次</span>
          </div>
          <div class="witem-stem">${XC.esc(summary(w))}</div>
          <div class="witem-foot">
            <span class="due">${dueTxt}</span>
            <span class="sp"></span>
            <button class="mini-btn" data-act="redo" data-qid="${w.qid}">去重做</button>
            ${w.status !== 'mastered' ? `<button class="mini-btn" data-act="master" data-qid="${w.qid}">标掌握</button>` : ''}
          </div>
        </div>`;
      }).join('');

      app.innerHTML = `
        <div class="page-head">
          <h1>错题本</h1>
          <p class="sub">答错自动收录 · 连续两次答对自动归档为已掌握</p>
        </div>
        <div class="wrong-stats">
          <div class="wstat"><b>${all.length}</b><span>累计错题</span></div>
          <div class="wstat hot"><b>${due}</b><span>今天该复习</span></div>
          <div class="wstat"><b>${all.length - mastered}</b><span>未掌握</span></div>
          <div class="wstat"><b>${mastered}</b><span>已掌握</span></div>
        </div>
        <div class="wfilters">${modChips}</div>
        <div class="wfilters">${stChips}</div>
        ${week ? `<p class="wrong-week">近 7 天新增 <b>${week}</b> 题</p>` : ''}
        <div class="wlist">${items || '<div class="empty"><span class="big">这里空空如也</span>去刷几套卷，错题会自动出现在这里。</div>'}</div>`;

      bind();
    }

    function findQ(wrongItem) {
      // 在原卷中定位题目索引；无原卷数据时返回 null
      return XC.api.get('/data/papers/' + wrongItem.pid + '.json').then(d => {
        const flat = [];
        d.groups.forEach(g => g.questions.forEach(q => flat.push(q)));
        const i = flat.findIndex(q => String(q.qid) === String(wrongItem.qid));
        return i >= 0 ? { pid: wrongItem.pid, idx: i } : null;
      }).catch(() => null);
    }

    function detail(w) {
      const snap = w.snap || {};
      const optsHtml = (snap.options || []).map(o =>
        `<div class="opt ${o.correct ? 'correct' : ''}"><span class="letter">${o.letter}</span><div>${o.html || ''}</div></div>`).join('');
      const body = `
        <div class="wrong-detail">
          <div class="qstem">${snap.stem || '<p>（无快照，去原卷查看原题）</p>'}</div>
          <div class="opts locked">${optsHtml}</div>
          <div class="ans-line">正确答案：<b>${XC.esc(snap.answer || '—')}</b>　错 ${w.wrong || 1} 次 · 累计作答 ${w.tries || 1} 次 · ${XC.ms(w.ms)}</div>
          <div class="analysis"><h4>官方解析</h4>${snap.analysis || '<p>（无解析）</p>'}</div>
          <div class="w-labels">${LABELS.map(l => `<button class="chip ${w.label === l ? 'on' : ''}" data-label="${l}">${l}</button>`).join('')}<button class="chip ${!w.label ? 'on' : ''}" data-label="">清除</button></div>
          <textarea class="w-note" placeholder="写点笔记，比如踩的坑…">${XC.esc(w.note || '')}</textarea>
        </div>`;
      const panel = XC.sheet({
        title: '错题详情',
        body,
        actions: [
          { label: '删除记录', kind: 'btn-ghost', onClick: async () => {
              XC.closeSheet();
              if (await XC.confirm('删除这条错题记录？', '删除后统计也会相应减少', '删除', 'btn-danger')) {
                await XC.api.post(`/api/users/${XC.S.uid}/wrong/${w.qid}`, { action: 'delete' });
                await XC.loadUser(XC.S.uid);
                render();
              }
            } },
          { label: w.status === 'mastered' ? '重新复习' : '标为已掌握', kind: 'btn-soft', onClick: async () => {
              await XC.api.post(`/api/users/${XC.S.uid}/wrong/${w.qid}`, { action: w.status === 'mastered' ? 'relearn' : 'master' });
              await XC.loadUser(XC.S.uid);
              XC.closeSheet(); render();
            } },
          { label: '去重做', kind: 'btn-primary', onClick: async () => {
              const loc = await findQ(w);
              if (!loc) { XC.toast('原卷中未找到该题', 'bad'); return true; }
              XC.closeSheet();
              XC.go('#/p/' + loc.pid + '/' + loc.idx);
            } },
        ],
        onMount: p => {
          p.querySelectorAll('[data-label]').forEach(b => b.onclick = async () => {
            await XC.api.post(`/api/users/${XC.S.uid}/wrong/${w.qid}`, { action: 'label', value: b.dataset.label });
            await XC.loadUser(XC.S.uid); w = XC.S.user.wrong[w.qid] || w; render();
            p.querySelectorAll('[data-label]').forEach(x => x.classList.toggle('on', x === b));
          });
          const ta = p.querySelector('.w-note');
          let t = null;
          ta.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
            await XC.api.post(`/api/users/${XC.S.uid}/wrong/${w.qid}`, { action: 'note', value: ta.value });
          }, 600); };
        },
      });
      return panel;
    }

    function bind() {
      app.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { st.mod = b.dataset.mod; render(); });
      app.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { st.status = b.dataset.st; render(); });
      app.querySelectorAll('.witem').forEach(el => {
        el.onclick = e => {
          if (e.target.closest('button')) return;
          const w = XC.S.user.wrong[el.dataset.qid];
          if (w) detail(w);
        };
      });
      app.querySelectorAll('[data-act="redo"]').forEach(b => b.onclick = async () => {
        const w = XC.S.user.wrong[b.dataset.qid];
        const loc = await findQ(w);
        if (!loc) { XC.toast('原卷中未找到该题', 'bad'); return; }
        XC.go('#/p/' + loc.pid + '/' + loc.idx);
      });
      app.querySelectorAll('[data-act="master"]').forEach(b => b.onclick = async () => {
        await XC.api.post(`/api/users/${XC.S.uid}/wrong/${b.dataset.qid}`, { action: 'master' });
        await XC.loadUser(XC.S.uid);
        XC.toast('已标为掌握', 'ok');
        render();
      });
    }

    render();
  };
})(window.XC);
