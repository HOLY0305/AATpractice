/* 答题页：材料跟随 / 先答后看 / 即时判分 / 积分反馈 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  let st = null;
  let timerId = null;

  /* 多选支持 */
  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<img[^>]*>/g, '［图］');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* 把当前题目同步给 AI 悬浮窗（换题自动清空对话） */
  function syncAi(q, answered, entry, group, data) {
    if (!XC.aiSync) return;
    const allowCtx = !!(XC.S.config.ai && XC.S.config.ai.allowAnswerContext);
    XC.aiSync({
      qid: q.qid, pid: data.id,
      moduleName: XC.MODULES[data.module] || data.moduleName || '',
      tag: q.tag || '',
      material: group.material ? stripHtml(group.material).slice(0, 1200) : '',
      stem: stripHtml(q.stem),
      options: q.options.map(o => ({ letter: o.letter, text: stripHtml(o.html) })),
      answered: answered,
      answer: answered && allowCtx ? String(q.answer || q.answerText || '') : '',
      analysis: answered && allowCtx ? stripHtml(q.analysis) : '',
    });
  }

  /* ---- 多选支持 ----
     题库中「不定项/多选」题的答案形如 BC / ACD / ABCD（共 405 题，多集中在
     天津选调等综合知识卷）。这类题不能点一个选项就判分，必须多选后提交。 */
  function isMulti(q) {
    return !!(q.answer && String(q.answer).replace(/[^A-Z]/g, '').length > 1);
  }
  function normLet(s) {
    return String(s || '').replace(/[^A-Z]/g, '').split('').sort().join('');
  }
  function correctLetters(q) {
    const marked = q.options.filter(o => o.correct).map(o => o.letter).join('');
    return normLet(marked || q.answer || '');
  }

  XC.views.paper = async function (app, id, noParam) {
    clearInterval(timerId);
    app.innerHTML = `<div class="q-top"><button class="icon-btn" id="s-back">${XC.icon('back')}</button>
      <div class="ttl"><span class="skeleton" style="display:inline-block;width:180px;height:14px"></span></div></div>
      <div class="qcard"><div class="skeleton" style="height:18px;width:60%;margin-bottom:14px"></div>
      <div class="skeleton" style="height:14px;width:100%;margin-bottom:8px"></div>
      <div class="skeleton" style="height:14px;width:86%"></div></div>`;
    XC.$('#s-back').onclick = () => XC.go('#/');

    let data;
    try {
      data = await XC.api.get('/data/papers/' + id + '.json');
    } catch (e) {
      app.innerHTML = `<div class="empty"><span class="big">试卷加载失败</span>${XC.esc(e.message)}</div>`;
      return;
    }

    const flat = [];
    data.groups.forEach((g, gi) => g.questions.forEach((q, qi) => flat.push({ group: g, gi, q, qi })));
    if (!flat.length) {
      app.innerHTML = '<div class="empty"><span class="big">这份卷没有题目</span></div>';
      return;
    }

    const rec = XC.paperRec(id);
    let cur = 0;
    if (noParam != null && noParam >= 0 && noParam < flat.length) {
      cur = noParam;                       // 直达指定题号（错题本「去重做」用）
    } else {
      for (let i = 0; i < flat.length; i++) if (!(flat[i].q.qid in rec)) { cur = i; break; }
    }

    st = { data, flat, cur, busy: false, t0: Date.now(), navOpen: false, answeredThis: null, answeredDelta: 0, pick: [] };
    render();
  };

  function groupRange(gi) {
    let start = -1, end = -1;
    st.flat.forEach((it, i) => {
      if (it.gi === gi) { if (start < 0) start = i; end = i; }
    });
    return start === end ? `${start + 1}` : `${start + 1}–${end + 1}`;
  }

  function render() {
    const app = XC.$('#app');
    const { data, flat, cur } = st;
    const item = flat[cur];
    const q = item.q, group = item.group;
    const rec = XC.paperRec(data.id);
    const entry = rec[q.qid] || null;
    const answered = !!entry;
    const chosen = entry ? entry.l : null;
    const multi = isMulti(q);
    const picked = st.pick || [];
    const chosenSet = new Set(String(chosen || '').split(''));

    const navBtns = flat.map((it, i) => {
      const r = rec[it.q.qid];
      const cls = r ? (r.ok ? 'done-right' : 'done-wrong') : '';
      return `<button class="${cls}${i === cur ? ' cur' : ''}" data-i="${i}">${i + 1}</button>`;
    }).join('');

    const optsHtml = q.options.map(o => {
      let cls = '';
      if (answered) {
        if (o.correct) cls = multi && !chosenSet.has(o.letter) ? 'correct missed' : 'correct';
        else if (chosenSet.has(o.letter)) cls = 'wrong picked-wrong';
      } else if (multi && picked.indexOf(o.letter) >= 0) {
        cls = 'picked';
      }
      return `<div class="opt ${cls}" data-l="${o.letter}"><span class="letter">${o.letter}</span><div>${o.html || ''}</div></div>`;
    }).join('');

    let resultHtml = '';
    if (answered) {
      const ok = entry.ok;
      const na = !!entry.na;
      const gain = st.answeredThis === q.qid ? st.answeredDelta : 0;
      const mine = String(chosen || '').split('').join(' ');
      resultHtml = `<div class="result">
        <div class="verdict ${na ? 'neutral' : (ok ? 'ok' : 'bad')}">
          <span class="ic">${na ? XC.icon('info') : (ok ? XC.icon('check') : XC.icon('close'))}</span>
          ${na ? '源数据未收录答案，本题不计分' : (ok ? '回答正确' : (multi ? '回答错误 · 多选题需全部选对' : '回答错误'))}
          ${gain > 0 ? `<span class="gain">+${gain} 积分</span>` : ''}
        </div>
        <div class="ans-line">正确答案：<b>${XC.esc(q.answer || q.answerText || '—')}</b>
          ${!ok && chosen ? `　你的选择：<span class="mine">${XC.esc(mine)}</span>` : ''}
          ${entry.ms ? `　用时：${XC.ms(entry.ms)}` : ''}
        </div>
        <div class="analysis"><h4>官方解析</h4>${q.analysis || '<p>（源数据暂无解析）</p>'}</div>
      </div>`;
    }

    const materialHtml = group.material ? `
      <div class="material card" id="material">
        <div class="material-head" id="m-head">
          <span class="t">材料</span><span class="n">第 ${groupRange(item.gi)} 题共用</span>
          <span class="arr">${XC.icon('down')}</span>
        </div>
        <div class="material-body">${group.material}</div>
      </div>` : '';

    const isLast = cur === flat.length - 1;

    /* 考点连做队列（来自考点库 / 材料精读的「连做」入口） */
    let qb = null;
    try {
      const qq = JSON.parse(sessionStorage.getItem('xc-kbqueue') || 'null');
      if (qq && Array.isArray(qq.list)) {
        const k = qq.list.indexOf(data.id + '|' + cur);
        if (k >= 0) qb = { q: qq, k };
        if (qb) st.qb = qb; else st.qb = null;
      }
    } catch (e) { /* ignore */ }
    const qbHtml = qb ? `<div class="kbq-bar" id="kbqbar">
        <span class="kbq-dot"></span>
        <span class="t">考点连做 · ${XC.esc(qb.q.title)} · <b>${qb.k + 1}/${qb.q.list.length}</b></span>
        <button class="btn btn-soft btn-sm" id="kbq-prev" ${qb.k === 0 ? 'disabled' : ''}>上一题</button>
        <button class="btn btn-primary btn-sm" id="kbq-next" ${qb.k === qb.q.list.length - 1 ? 'disabled' : ''}>下一题</button>
        <button class="icon-btn" id="kbq-x" title="退出连做">✕</button>
      </div>` : '';

    app.innerHTML = `
      <div class="q-top">
        <button class="icon-btn" id="btn-back" title="返回">${XC.icon('back')}</button>
        <div class="ttl">${XC.esc(data.paper)}</div>
        <span class="counter">${cur + 1} / ${flat.length}</span>
        <button class="icon-btn" id="btn-nav" title="题号">${XC.icon('grid')}</button>
      </div>
      ${qbHtml}
      <div class="qnav-panel" id="qnav" ${st.navOpen ? '' : 'hidden'}>${navBtns}</div>
      ${materialHtml}
      <div class="qcard card">
        <div class="qhead">
          <span class="no">第 ${cur + 1} 题</span>
          ${multi ? '<span class="tag tag-multi">多选</span>' : ''}
          ${q.tag ? `<span class="tag">${XC.esc(q.tag)}</span>` : ''}
          ${answered ? '' : `<span class="timer" id="timer"><span class="d"></span><span id="timer-t">00:00</span></span>`}
          <span class="qid">${q.qid || ''}</span>
        </div>
        <div class="qstem">${q.stem || ''}</div>
        <div class="opts ${answered ? 'locked' : ''}" id="opts">${optsHtml}</div>
        <div id="result-zone">${resultHtml}</div>
      </div>
      <div class="q-foot"><div class="q-foot-inner">
        <button class="btn btn-ghost btn-icon" id="btn-prev" ${cur === 0 ? 'disabled' : ''} title="上一题">${XC.icon('back')}</button>
        ${q.options.length && !answered
        ? (multi
          ? `<div class="foot-mid"><button class="btn btn-primary" id="btn-submit" ${picked.length ? '' : 'disabled'}>提交答案${picked.length ? `（已选 ${picked.length} 项）` : ''}</button></div>`
          : '<div class="foot-mid hint">选择你认为正确的选项</div>')
        : `<button class="btn ${isLast ? 'btn-soft' : 'btn-primary'}" id="btn-next" ${isLast ? 'disabled' : ''}>${isLast ? '已是最后一题' : '下一题'}</button>`}
        <button class="btn btn-ghost btn-icon" id="btn-next2" ${isLast ? 'disabled' : ''} title="下一题">${XC.icon('right')}</button>
      </div></div>`;

    bind(q, answered, entry);
    syncAi(q, answered, entry, group, data);
    startTimer(answered);
    if (answered) {
      setTimeout(() => {
        const z = XC.$('#result-zone');
        if (z && z.getBoundingClientRect().bottom > innerHeight) z.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    }
  }

  function startTimer(answered) {
    clearInterval(timerId);
    const el = XC.$('#timer-t');
    if (answered || !el) return;
    const t0 = st.t0;
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  function bind(q, answered, entry) {
    const app = XC.$('#app');
    const { data, flat, cur } = st;

    XC.$('#btn-back').onclick = () => { if (history.length > 1) history.back(); else XC.go('#/'); };
    XC.$('#btn-nav').onclick = () => {
      const p = XC.$('#qnav');
      st.navOpen = p.hidden;
      p.hidden = !st.navOpen;
      if (st.navOpen) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    XC.$$('#qnav button').forEach(b => b.onclick = () => {
      st.cur = +b.dataset.i;
      st.navOpen = false;
      st.t0 = Date.now();
      st.answeredThis = null;
      st.pick = [];
      render();
      window.scrollTo({ top: 0 });
    });
    const prev = XC.$('#btn-prev');
    if (prev) prev.onclick = () => jump(-1);
    const next = XC.$('#btn-next');
    if (next) next.onclick = () => jump(1);
    const next2 = XC.$('#btn-next2');
    if (next2) next2.onclick = () => jump(1);

    const mh = XC.$('#m-head');
    if (mh) mh.onclick = () => XC.$('#material').classList.toggle('collapsed');

    /* 连做浮条交互：按考点队列跳题，而不是卷子顺序 */
    const qbS = st.qb;
    if (qbS) {
      const qgo = i => XC.go('#/p/' + qbS.q.list[i].replace('|', '/'));
      const qpv = XC.$('#kbq-prev', app);
      if (qpv) qpv.onclick = () => qgo(qbS.k - 1);
      const qnx = XC.$('#kbq-next', app);
      if (qnx) qnx.onclick = () => qgo(qbS.k + 1);
      const qx = XC.$('#kbq-x', app);
      if (qx) qx.onclick = () => { sessionStorage.removeItem('xc-kbqueue'); st.qb = null; render(); };
    }

    if (!answered && q.options.length) {
      const multi = isMulti(q);
      XC.$$('#opts .opt').forEach(el => el.onclick = () => {
        if (multi) togglePick(el.dataset.l); else choose(el.dataset.l);
      });
    }
    const sub = XC.$('#btn-submit');
    if (sub) sub.onclick = submitMulti;
  }

  /* 多选：点选只切换选中态，不改判 */
  function togglePick(letter) {
    const i = st.pick.indexOf(letter);
    if (i >= 0) st.pick.splice(i, 1); else st.pick.push(letter);
    const el = XC.$('#opts .opt[data-l="' + letter + '"]');
    if (el) el.classList.toggle('picked', i < 0);
    const sub = XC.$('#btn-submit');
    if (sub) {
      sub.disabled = st.pick.length === 0;
      sub.textContent = '提交答案' + (st.pick.length ? `（已选 ${st.pick.length} 项）` : '');
    }
  }

  function submitMulti() {
    if (!st.pick.length || st.busy) return;
    choose(st.pick.slice().sort().join(''));
  }

  function jump(d) {
    const n = st.cur + d;
    if (n < 0 || n >= st.flat.length) return;
    st.cur = n;
    st.t0 = Date.now();
    st.answeredThis = null;
    st.pick = [];
    st.navOpen = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function choose(letter) {
    if (st.busy) return;
    const { data, flat, cur } = st;
    const q = flat[cur].q;
    const cl = correctLetters(q);
    const na = !cl;                       // 源数据缺标准答案（4 题）
    const ok = !na && normLet(letter) === cl;
    const ms = Math.min(30 * 60 * 1000, Date.now() - st.t0);
    const before = XC.S.user.points.balance;

    st.busy = true;
    XC.$('#opts') && XC.$('#opts').classList.add('locked');
    try {
      // 答错时带上题目快照，错题本可离线复原
      const snap = ok ? null : {
        stem: q.stem, options: q.options.map(o => ({ letter: o.letter, html: o.html, correct: o.correct })),
        answer: q.answer, answerText: q.answerText, analysis: q.analysis, tag: q.tag,
      };
      const r = await XC.answer({
        pid: data.id, qid: q.qid, letter, ok, na, ms,
        module: data.module, tag: q.tag || '', snap,
      });
      st.answeredThis = q.qid;
      st.answeredDelta = r.points.delta;
      st.pick = [];
      st.t0 = Date.now();
      render();
      XC.renderNav();
      if (r.points.delta > 0) {
        XC.updateBalance(before);
        XC.floatGain('+' + r.points.delta, XC.$('#nav-points'));
      }
      if (r.points.bonus) {
        setTimeout(() => XC.toast(`达成今日 ${r.daily.goal} 题，额外 +${r.points.bonus} 积分`, 'ok'), 380);
      }
    } catch (e) {
      XC.toast('保存失败：' + e.message, 'bad');
      XC.$('#opts') && XC.$('#opts').classList.remove('locked');
    } finally {
      st.busy = false;
    }
  }

  /* 键盘快捷键 */
  document.addEventListener('keydown', e => {
    if (!st || location.hash.indexOf('#/p/') !== 0) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { jump(1); }
    else if (e.key === 'ArrowLeft') { jump(-1); }
    else if (/^[1-9]$/.test(e.key)) {
      const el = XC.$('#opts .opt[data-l="' + String.fromCharCode(64 + +e.key) + '"]');
      if (el && !XC.$('#opts').classList.contains('locked')) el.click();
    }
    else if (e.key === 'Enter') { submitMulti(); }
  });
})(window.XC);
