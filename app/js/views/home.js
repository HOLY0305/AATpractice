/* 首页：概览 + 筛选 + 试卷列表 */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  let shown = 40;
  const PAGE = 40;

  XC.views.home = async function (app) {
    const idx = await XC.loadIndex();
    const o = XC.overall();
    const u = XC.S.user;
    const years = [...new Set(idx.map(p => p.year))].filter(Boolean).sort((a, b) => b.localeCompare(a));
    const regions = [...new Set(idx.map(p => p.region))].filter(Boolean).sort();

    const d = new Date();
    const dateLine = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    const goal = XC.S.config.points.dailyGoal || 0;
    const todayPct = goal ? Math.min(100, Math.round(o.today / goal * 100)) : 0;

    const last = XC.lastPaper();
    let resumeHtml = '';
    if (last) {
      const item = idx.find(p => p.id === last.pid);
      if (item) {
        const st = XC.paperStats(item.id, item.count);
        const pct = XC.pct(st.done, item.count);
        resumeHtml = `<div class="resume" id="resume">
          ${XC.ring(pct)}
          <div class="body">
            <div class="lbl">继续上次 · 已完成 ${st.done}/${item.count}</div>
            <div class="ttl">${XC.esc(item.paper)}</div>
          </div>
          <span class="go">${XC.icon('right')}</span>
        </div>`;
      }
    }

    app.innerHTML = `
    <section class="hero">
      <div class="kicker">${dateLine}　·　行测真题库</div>
      <h1>刷一道，<em>进一步</em></h1>
      <p>${idx.reduce((s, p) => s + p.count, 0).toLocaleString('zh-CN')} 道真题，按卷分模块。作答即时判分，逐题积累积分。</p>
    </section>

    <div class="ink-wall" id="ink-wall"></div>

    <div class="stats-grid">
      <div class="stat accent"><div class="k">今日已完成</div><div class="v">${o.today}<small>/ ${goal} 题</small></div></div>
      <div class="stat"><div class="k">总正确率</div><div class="v">${o.acc}<small>%</small></div></div>
      <div class="stat"><div class="k">连续练习</div><div class="v">${o.streak}<small>天</small></div></div>
      <div class="stat bad"><div class="k">错题待复习</div><div class="v">${o.wrong}<small>题</small></div></div>
    </div>
    ${goal ? `<div style="margin:10px 2px 0"><div class="bar"><i style="width:${todayPct}%"></i></div>
      <div class="tiny-note" style="padding-top:6px">今日目标 ${goal} 题 · 已完成 ${o.today} 题${todayPct >= 100 ? '，奖励已入账' : ''}</div></div>` : ''}
    ${resumeHtml}

    <div class="filters">
      <div class="mod-tabs" id="mod-tabs">
        <button class="mod-tab on" data-m="">全部模块</button>
        ${Object.entries(XC.MODULES).map(([k, v]) => `<button class="mod-tab" data-m="${k}">${v}</button>`).join('')}
      </div>
      <div class="filter-row">
        <select class="select" id="f-year"><option value="">全部年份</option>${years.map(y => `<option>${XC.esc(y)}</option>`).join('')}</select>
        <select class="select" id="f-region"><option value="">全部地区</option>${regions.map(r => `<option>${XC.esc(r)}</option>`).join('')}</select>
        <input class="input search" id="f-q" placeholder="搜索试卷名…">
      </div>
    </div>

    <div class="list-meta"><span id="count-label"></span><span class="spacer"></span><span>广东卷置顶 · 其余按题库顺序</span></div>
    <div class="papers" id="papers"></div>
    <div class="load-more" id="load-more"></div>
    <p class="tiny-note">题库来源：开源项目 ERRRC/xingcezhenti（515 套卷 / 58890 题），图片与解析均为本地文件，离线可用。</p>`;

    const state = { mod: '', year: '', region: '', q: '' };

    function filtered() {
      const kw = state.q.trim().toLowerCase();
      const list = idx.filter(p =>
        (!state.mod || p.module === state.mod) &&
        (!state.year || p.year === state.year) &&
        (!state.region || p.region === state.region) &&
        (!kw || (p.paper || '').toLowerCase().includes(kw))
      );
      // 广东卷、国考卷置顶（仅无筛选时生效）；按模块分组，组内 广东 > 国考 > 其它
      if (!state.mod && !state.year && !state.region && !kw) {
        const pri = r => (r === '广东' ? 2 : r === '国考' ? 1 : 0);
        list.sort((a, b) =>
          a.module === b.module
            ? pri(b.region) - pri(a.region)
            : (a.module < b.module ? -1 : 1));
      }
      return list;
    }

    function paint(reset) {
      if (reset) shown = PAGE;
      const items = filtered();
      const slice = items.slice(0, shown);
      XC.$('#count-label').textContent = `共 ${items.length} 份卷-模块`;
      const box = XC.$('#papers');
      if (!items.length) {
        box.innerHTML = '<div class="empty"><span class="big">没有匹配的试卷</span>换个筛选条件试试</div>';
        XC.$('#load-more').innerHTML = '';
        return;
      }
      box.innerHTML = slice.map(p => {
        const st = XC.paperStats(p.id, p.count);
        const pct = XC.pct(st.done, p.count);
        return `<div class="paper ${st.done ? 'done' : ''}" data-id="${p.id}">
          <span class="badge badge-${p.module}">${XC.MODULES[p.module] || p.moduleName}</span>
          <div class="body">
            <div class="ttl">${XC.esc(p.paper)}</div>
            <div class="sub"><span>${XC.esc(p.year)}</span><span>${XC.esc(p.region || '')}</span><span>${p.count} 题</span>
              ${st.done ? `<span style="color:var(--ok)">对 ${st.right} · 错 ${st.wrong}</span>` : ''}</div>
          </div>
          <div class="score">${st.done ? `<b>${pct}%</b>已答 ${st.done}` : '未开始'}</div>
          <div class="bar-mini"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('');
      XC.$$('.paper', box).forEach(el => el.onclick = () => XC.go('#/p/' + el.dataset.id));
      XC.$('#load-more').innerHTML = items.length > shown
        ? `<button class="btn btn-ghost btn-block" id="btn-more">加载更多（还有 ${items.length - shown} 份）</button>` : '';
      const more = XC.$('#btn-more');
      if (more) more.onclick = () => { shown += PAGE; paint(false); };
    }

    XC.$$('.mod-tab').forEach(b => b.onclick = () => {
      XC.$$('.mod-tab').forEach(x => x.classList.toggle('on', x === b));
      state.mod = b.dataset.m;
      paint(true);
    });
    XC.$('#f-year').onchange = e => { state.year = e.target.value; paint(true); };
    XC.$('#f-region').onchange = e => { state.region = e.target.value; paint(true); };
    let timer;
    XC.$('#f-q').oninput = e => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value; paint(true); }, 180);
    };
    const resume = XC.$('#resume');
    if (resume && last) resume.onclick = () => XC.go('#/p/' + last.pid);

    /* ---------- 留言墙（全员共享） ---------- */
    function relTime(ts) {
      const dt = Date.now() - ts;
      if (dt < 60 * 1000) return '刚刚';
      if (dt < 3600 * 1000) return Math.floor(dt / 60000) + ' 分钟前';
      const d = new Date(ts), now = new Date();
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
      if (dt < 86400 * 1000) return '昨天 ' + hm;
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    function noteHtml(m, i) {
      const today = new Date(m.ts).toDateString() === new Date().toDateString();
      const tilt = ((i * 37) % 5) - 2; // -2° ~ 2° 固定伪随机
      return `<div class="ink-note ${today ? 'today' : ''}" style="--tilt:${tilt}deg" data-mid="${m.id}">
        ${today ? '<i class="ink-dot"></i>' : ''}
        ${m.img ? `<img class="ink-thumb" src="${m.img}" alt="">` : ''}
        <div class="txt">${XC.esc(m.text)}</div>
        <div class="who">${XC.esc(m.name)} · ${relTime(m.ts)}</div>
      </div>`;
    }
    async function paintInk() {
      const wall = XC.$('#ink-wall');
      if (!wall) return;
      let msgs = [];
      try { msgs = (await XC.api.get('/api/messages')).messages || []; } catch (e) { }
      msgs = msgs.slice(-60);
      const todayN = msgs.filter(m => new Date(m.ts).toDateString() === new Date().toDateString()).length;
      if (!msgs.length) {
        wall.innerHTML = `<div class="ink-wall-head"><b>今日墨迹</b><span class="tiny-note">还没有人留过言，来写下第一笔吧</span></div>
          <button class="btn btn-soft btn-sm" id="btn-ink">✎ 留一笔</button>`;
      } else {
        // 复制 4 份做无缝横向滚动
        const set = msgs.map((m, i) => noteHtml(m, i)).join('');
        wall.innerHTML = `<div class="ink-wall-head"><b>今日墨迹</b>
            <span class="tiny-note">今日 ${todayN} 笔 · 共 ${msgs.length} 笔 · 点便签看详情</span></div>
          <div class="ink-strip" id="ink-strip">
            <div class="ink-track">${set}${set}${set}${set}</div>
          </div>
          <button class="btn btn-soft btn-sm ink-btn" id="btn-ink">✎ 留一笔</button>`;
      }
      // 点便签 → 详情；点空白/按钮 → 发布
      wall.querySelectorAll('.ink-note').forEach(el => {
        el.onclick = ev => { ev.stopPropagation(); inkDetail(el.dataset.mid, msgs); };
      });
      const strip = XC.$('#ink-strip');
      if (strip) strip.onclick = () => inkSheet();
      XC.$('#btn-ink').onclick = () => inkSheet();
    }
    // 删除权：管理员可删任意留言；作者只能删自己的
    const canDelMsg = m => XC.S.admin || m.uid === XC.S.uid;
    async function delMsg(m) {
      const ok = await XC.confirm('删除留言',
        `确定删除「${XC.esc(m.text.length > 18 ? m.text.slice(0, 18) + '…' : m.text)}」？删除后不可恢复。`,
        '删除', 'btn-danger');
      if (!ok) return false;
      try {
        await XC.api.post('/api/messages/del', { id: m.id, uid: XC.S.uid, pin: XC.pin() });
        XC.toast('已删除', 'ok');
        paintInk();
        return true;
      } catch (e) { XC.toast(e.message || '删除失败', 'bad'); return false; }
    }
    function inkDetail(mid, msgs) {
      const m = msgs.find(x => x.id === mid);
      if (!m) return;
      const actions = [{ label: '关闭', kind: 'btn-ghost' }];
      if (canDelMsg(m)) {
        actions.push({
          label: XC.S.admin && m.uid !== XC.S.uid ? '删除这条留言' : '删除我的留言',
          kind: 'btn-danger',
          close: false,
          onClick: async () => { if (await delMsg(m)) XC.closeSheet(); return true; },
        });
      }
      XC.sheet({
        title: `${XC.esc(m.name)} 的墨迹`,
        sub: relTime(m.ts),
        body: `<div style="font-size:15px;line-height:1.7">${XC.esc(m.text)}</div>
          ${m.img ? `<div style="margin-top:10px"><img src="${m.img}" style="max-width:100%;border-radius:10px;border:1px solid var(--line);cursor:zoom-in" alt="留言图片"></div>` : ''}`,
        actions,
      });
    }
    function inkSheet() {
      XC.sheet({
        title: '留一笔',
        sub: '写给所有一起刷题的人，60 字以内，可附一张图',
        body: `<textarea class="input" id="ink-text" maxlength="60" rows="3"
            placeholder="比如：今天数量关系全对，留念。" style="resize:none;width:100%"></textarea>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input type="file" id="ink-img" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <button class="btn btn-ghost btn-sm" id="btn-ink-img" type="button">📎 附图</button>
            <span class="tiny-note" id="ink-img-name" style="flex:1;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            <span class="tiny-note" id="ink-count" style="padding:0">0 / 60</span>
          </div>
          <div id="ink-preview" hidden style="margin-top:8px">
            <img id="ink-preview-img" style="max-height:140px;border-radius:8px;border:1px solid var(--line)" alt="">
          </div>
          <div class="ink-mine" id="ink-mine"></div>`,
        actions: [
          { label: '取消', kind: 'btn-ghost' },
          { label: '发布', kind: 'btn-primary' },
        ],
        onMount: panel => {
          const ta = XC.$('#ink-text', panel);
          let imgData = null;
          ta.oninput = () => { XC.$('#ink-count', panel).textContent = ta.value.length + ' / 60'; };
          const fileInput = XC.$('#ink-img', panel);
          XC.$('#btn-ink-img', panel).onclick = () => fileInput.click();
          fileInput.onchange = async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            if (!/^image\//.test(f.type)) { XC.toast('只能选图片文件', 'bad'); fileInput.value = ''; return; }
            const nameEl = XC.$('#ink-img-name', panel);
            nameEl.textContent = '处理中…';
            XC.$('#btn-ink-img', panel).disabled = true;
            try {
              if (f.size > 25 * 1024 * 1024) throw new Error('图片太大了（超过 25MB）');
              // 手机照片动辄 3–8MB，先压到 1600px / JPEG，上传秒完成，也不会撞服务端上限
              const r = await XC.compressImage(f, { max: 1600, quality: 0.82 });
              imgData = r.dataUrl;
              XC.$('#ink-preview', panel).hidden = false;
              XC.$('#ink-preview-img', panel).src = imgData;
              nameEl.textContent = `${f.name} · 已压缩到 ${r.kb}KB（${r.width}×${r.height}）`;
            } catch (e) {
              // 压缩失败时退回原图（3MB 以内仍可上传）
              if (f.size <= 3 * 1024 * 1024) {
                try {
                  imgData = await new Promise((res, rej) => {
                    const rd = new FileReader();
                    rd.onload = () => res(rd.result); rd.onerror = rej;
                    rd.readAsDataURL(f);
                  });
                  XC.$('#ink-preview', panel).hidden = false;
                  XC.$('#ink-preview-img', panel).src = imgData;
                  nameEl.textContent = f.name + ' · 使用原图';
                } catch (e2) {
                  imgData = null; nameEl.textContent = '';
                  XC.toast('这张图片读取失败，换一张试试', 'bad');
                }
              } else {
                imgData = null; nameEl.textContent = '';
                XC.toast(e.message || '图片处理失败', 'bad');
              }
              fileInput.value = '';
            } finally {
              XC.$('#btn-ink-img', panel).disabled = false;
            }
          };
          // sheet 里带出最近的留言；管理员可删任意留言
          XC.api.get('/api/messages').then(r => {
            const mine = XC.$('#ink-mine', panel);
            const list = (r.messages || []).slice(-30).reverse();
            if (!list.length) return;
            mine.innerHTML = '<div class="gh" style="margin-top:10px">最近的留言</div>' + list.map(m => `
              <div class="ink-row">${canDelMsg(m) ? `<button class="mini-btn" data-del="${m.id}" title="删除">删</button>` : ''}
                <span class="t">${XC.esc(m.text)}</span><span class="s">${XC.esc(m.name)} · ${relTime(m.ts)}</span></div>`).join('');
            mine.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
              const m = list.find(x => x.id === b.dataset.del);
              if (m) await delMsg(m);
              if (m) b.closest('.ink-row').remove();
            });
          }).catch(() => {});
          const pubBtn = XC.$('[data-i="1"]', panel);
          pubBtn.onclick = async () => {
            if (pubBtn.disabled) return;
            const text = ta.value.trim();
            if (!text) return XC.toast('写点什么再发布吧', 'bad');
            // 手机上键盘还开着时，第一次点按常常只用来收起键盘，这里主动失焦
            ta.blur();
            const label = pubBtn.textContent;
            pubBtn.disabled = true;
            pubBtn.textContent = '发布中…';
            try {
              await XC.api.post('/api/messages', { uid: XC.S.uid, text, img: imgData });
              XC.closeSheet();
              XC.toast('已留下墨迹', 'ok');
              paintInk();
            } catch (e) {
              XC.toast(e.message || '发布失败，检查一下网络', 'bad');
              pubBtn.disabled = false;
              pubBtn.textContent = label;
            }
          };
        },
      });
    }
    paintInk();

    paint(true);
  };
})(window.XC);
