/* ============================================================
 * 考点库（合并版）—— #/kb（#/graph 也路由到这里）
 * 三个标签：思维导图（XC.mountGraph 画布）
 *          考点体系（模块→大类→考点群→微考点 卡片浏览）
 *          材料精读（15-材料/资料分析 717 篇，含材料原文渲染）
 * 面包屑可逐层回跳；状态实时同步到 hash（返回/刷新/深链都能还原）。
 * 关联真题支持「连做」：做题页出现连做浮条，按考点顺序刷题。
 * 笔记正文从 jsDelivr CDN 懒取；真题经 qidmap.json 直达练习。
 * ============================================================ */
XC.views.kb = function (app, initialTab) {
  const CDN = 'https://cdn.jsdelivr.net/gh/ERRRC/kaogongzhentizhengliu@main/';
  let graphApi = null;

  app.innerHTML = `
  <div class="kb-page as-graph" id="kbpage">
    <div class="graph-head">
      <div>
        <h1 class="graph-title shiny-text">考点库</h1>
        <p class="graph-sub">思维导图 · 考点卡片 · 材料精读 · 关联真题连做 —— 数据源自 <a href="https://github.com/ERRRC/kaogongzhentizhengliu" target="_blank" rel="noopener">考公脑库</a></p>
      </div>
      <div class="graph-tools">
        <div class="graph-search" id="kbsearch">
          ${XC.icon('spark').replace('<svg', '<svg class="gs-icon"')}
          <input id="kbq" placeholder="搜索考点 / 考点群…（回车定位）" autocomplete="off">
        </div>
      </div>
    </div>
    <div class="kb-tabs">
      <button class="gchip" data-tab="graph" style="--c:#2b3550">思维导图</button>
      <button class="gchip" data-tab="kp" style="--c:#5460d6">考点体系</button>
      <button class="gchip" data-tab="mat" style="--c:#0e8a80">材料精读</button>
      <div class="kb-crumb" id="kbcrumb"></div>
    </div>
    <div class="kb-body" id="kbbody"><div class="kb-loading"><div class="graph-orbit"><i></i><i></i><i></i></div><span>正在整理考点…</span></div></div>
  </div>`;

  const page = XC.$('#kbpage', app);
  const body = XC.$('#kbbody', app);
  const crumb = XC.$('#kbcrumb', app);
  let DATA = null, DATA_P = null, MATS = null, MATS_P = null, QMAP = null;
  const st = { tab: 'graph', cat: null, group: null, point: null, mat: null, q: '' };

  /* ---------- 深链解析（#/kb?tab=kp&cat=&group=&point=&mat=） ---------- */
  (function parseHash() {
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if (qi < 0) { st.tab = initialTab || 'graph'; return; }
    const p = new URLSearchParams(h.slice(qi + 1));
    const t = p.get('tab');
    if (t === 'kp' || t === 'mat' || t === 'graph') st.tab = t;
    else if (p.get('mat')) st.tab = 'mat';
    else if (p.get('cat') || p.get('group') || p.get('point')) st.tab = 'kp';
    else st.tab = initialTab || 'graph';
    if (p.get('cat')) st.cat = p.get('cat');
    if (p.get('group')) st.group = p.get('group');
    if (p.get('point')) st.point = p.get('point');
    if (p.get('mat')) st.mat = p.get('mat');
  })();

  /* ---------- 状态 → hash（replaceState，不产生历史记录） ----------
     这样「去练习 → 返回」能精确回到离开时的考点位置 */
  function syncHash() {
    const p = new URLSearchParams();
    if (st.tab === 'graph') { /* 默认视图，hash 保持干净 */ }
    else {
      p.set('tab', st.tab);
      if (st.tab === 'kp') {
        if (st.cat) p.set('cat', st.cat);
        if (st.group) p.set('group', st.group);
        if (st.point) p.set('point', st.point);
      }
      if (st.tab === 'mat' && st.mat) p.set('mat', st.mat);
    }
    const qs = p.toString();
    history.replaceState(null, '', '#/kb' + (qs ? '?' + qs : ''));
  }

  /* ---------- 数据加载 ---------- */
  function loadKnowledge() {
    if (DATA) return Promise.resolve(DATA);
    if (!DATA_P) DATA_P = XC.api.get('/data/knowledge.json').then(j => { DATA = j; return j; });
    return DATA_P;
  }
  function loadMats() {
    if (MATS) return Promise.resolve(MATS);
    if (!MATS_P) MATS_P = XC.api.get('/data/materials.json').then(j => { MATS = j; return j; });
    return MATS_P;
  }
  function loadQmap() {
    if (QMAP) return Promise.resolve(QMAP);
    return XC.api.get('/data/qidmap.json').then(j => { QMAP = j; return j; }).catch(() => { QMAP = {}; return QMAP; });
  }

  /* ---------- 连做队列（paper.js 的答题页浮条消费） ---------- */
  function startQueue(title, items, targetQid) {
    const list = [];
    for (const it of items) { const loc = QMAP[String(it.qid)]; if (loc) list.push(loc); }
    const hit = targetQid && QMAP[String(targetQid)];
    if (list.length < 2) {                       // 只有 0/1 题可做，不设队列
      sessionStorage.removeItem('xc-kbqueue');
      if (hit || list.length) XC.go('#/p/' + (hit || list[0]).replace('|', '/'));
      else XC.toast('本站题库暂无这些题', 'bad');
      return;
    }
    sessionStorage.setItem('xc-kbqueue', JSON.stringify({ title, list }));
    XC.go('#/p/' + (hit || list[0]).replace('|', '/'));
  }
  /* 真题列表区块：返回 HTML，并绑定「去练习 / 连做」 */
  function qBlock(items, title) {
    const wrap = XC.h('<div><div class="kb-qactions">'
      + (items.some(it => QMAP[String(it.qid)])
        ? `<button class="btn btn-primary btn-sm" data-qa="1">连做 ${items.filter(it => QMAP[String(it.qid)]).length} 道关联题 ›</button><span class="kb-qhint">做题页顶部会出现「考点连做」条，按顺序刷完本考点</span>`
        : '')
      + `</div><div class="kb-qlist">${
        items.map(it => {
          const hit = QMAP[String(it.qid)];
          const tag = XC.esc((it.info || '').split('—')[0].trim() || it.info || '');
          return `<div class="kb-qrow"><div class="t"><span class="kb-qid">${XC.esc(it.qid)}</span> ${tag}</div>${hit
          ? `<button class="btn btn-soft btn-sm" data-qid="${XC.esc(it.qid)}">去练习 ›</button>`
          : '<span class="kb-miss">本站题库暂无此题</span>'}</div>`;
        }).join('') || '<div class="gp-note">本考点暂未收录真题。</div>'
      }</div></div>`);
    const qa = wrap.querySelector('[data-qa]');
    if (qa) qa.onclick = () => startQueue(title, items, null);
    wrap.querySelectorAll('[data-qid]').forEach(b => {
      b.onclick = () => startQueue(title, items, b.dataset.qid);
    });
    return wrap;
  }

  /* ---------- 笔记抓取 ---------- */
  const noteCache = new Map();
  async function fetchNote(path) {
    if (noteCache.has(path)) return noteCache.get(path);
    const url = CDN + path.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const md = await r.text();
    noteCache.set(path, md);
    return md;
  }
  const stripFM = md => md.replace(/^---[\s\S]*?---/, '');
  function mdToHtml(md) {
    return XC.esc(md)
      .replace(/^#+ .*/gm, m => '<div class="gp-h">' + m.replace(/^#+ /, '') + '</div>')
      .replace(/^&gt; ?(.*)$/gm, '<div class="kb-quote">$1</div>')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, label) =>
        label ? `<span class="gp-link">${XC.esc(label)}</span>` : `<span class="gp-link">[[ ${XC.esc(p.split('/').pop())} ]]</span>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '<div style="height:10px"></div>')
      .replace(/\n/g, '<br>');
  }
  function section(md, name) {
    const m = md.match(new RegExp('#+\\s*' + name + '[\\s\\S]*?(?=\\n#+ |$)'));
    return m ? m[0] : '';
  }
  /* 从笔记里提取 [[10-真题/…|qid]] 关联真题行 */
  function extractQs(md) {
    const qSec = md.match(/#+\s*(?:关联)?真题[^\n]*\n([\s\S]*?)(?=\n#|\n---|$)/);
    const src = qSec ? qSec[1] : md;
    return [...src.matchAll(/\[\[10-真题\/[^\]|]+\|(\d+)[^\]]*\]\]\s*([^\n]*)/g)]
      .map(m => ({ qid: m[1], info: m[2].trim() }));
  }
  /* 材料原文的裸 HTML：消毒 + 图片相对路径 → CDN 绝对路径 */
  function sanitizeHtml(src, basePath) {
    const d = document.createElement('div');
    d.innerHTML = src;
    d.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(e => e.remove());
    d.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) el.removeAttribute(a.name);
        if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      });
    });
    d.querySelectorAll('img').forEach(img => {
      const s = img.getAttribute('src') || '';
      const out = [];
      for (const seg of s.split('/')) {
        if (seg === '..') out.pop();
        else if (seg && seg !== '.') out.push(seg);
      }
      if (out.length) img.src = CDN + out.map(encodeURIComponent).join('/');
      img.removeAttribute('width'); img.removeAttribute('height');
      img.setAttribute('loading', 'lazy');
    });
    return d.innerHTML;
  }

  /* ---------- 面包屑（修复：go 状态需编码，否则属性被 JSON 引号截断无法点击） ---------- */
  function renderCrumb(items) {
    crumb.innerHTML = items.map(it =>
      it.go ? `<button class="kb-crumb-item" data-crumb="${encodeURIComponent(JSON.stringify(it.go))}">${XC.esc(it.name)}</button>`
        : `<span class="kb-crumb-cur">${XC.esc(it.name)}</span>`
    ).join('<span class="kb-crumb-sep">/</span>');
    crumb.querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => {
      Object.assign(st, JSON.parse(decodeURIComponent(b.dataset.crumb)));
      render();
    });
  }

  /* ---------- 标签切换 ---------- */
  function setTab(t) {
    if (st.tab === t && (t !== 'graph' || graphApi)) return;
    destroyGraph();
    st.tab = t;
    app.querySelectorAll('.kb-tabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
    st.q = ''; XC.$('#kbq', app).value = '';
    render();
  }
  function destroyGraph() {
    if (graphApi) { graphApi.destroy(); graphApi = null; }
  }

  function render() {
    syncHash();
    if (st.tab === 'graph') return renderGraph();
    destroyGraph();
    page.classList.remove('as-graph');
    if (st.tab === 'mat') return renderMats();
    if (!DATA) {
      body.innerHTML = '<div class="kb-loading"><div class="graph-orbit"><i></i><i></i><i></i></div><span>正在整理考点…</span></div>';
      return loadKnowledge().then(render).catch(() => {
        body.innerHTML = '<div class="empty"><span class="big">考点数据缺失</span>请先运行 tools/build-knowledge.cjs</div>';
      });
    }
    renderKp();
  }

  /* ---------- 标签 1：思维导图 ---------- */
  function renderGraph() {
    page.classList.add('as-graph');
    renderCrumb([{ name: '思维导图' }]);
    body.innerHTML = '<div class="graph-stage" id="gstage"></div>';
    graphApi = XC.mountGraph(XC.$('#gstage', app));
  }

  /* ---------- 标签 2：考点体系 ---------- */
  const modColorSafe = cat => (cat.id || '').startsWith('判断推理') ? '#5460d6' : '#0e8a80';

  function renderKp() {
    const mod = DATA.modules.find(m => st.cat && st.cat.startsWith(m.id + '/'));
    const cat = mod && mod.cats.find(c => c.id === st.cat);
    /* 深链还原：cat+group+point 齐全时直接打开微考点详情 */
    if (st.cat && st.group && st.point) {
      const grp = cat && cat.groups.find(g => g.name === st.group);
      const pt = grp && grp.points.find(p => p.name === st.point);
      if (grp && pt) return openPoint(cat, grp, pt);
      st.point = null;
    }
    const side = `<aside class="kb-side">
      ${DATA.modules.map(m => `
        <div class="kb-mod" style="--c:${m.color || '#5460d6'}">
          <div class="kb-mod-name">${XC.esc(m.name)}<span>${XC.n(m.q)} 题</span></div>
          ${(m.cats || []).map(c => `<button class="kb-cat-btn ${c.id === st.cat ? 'on' : ''}" data-cat="${XC.esc(c.id)}">
            <span>${XC.esc(c.name)}</span><b>${XC.n(c.q)}</b></button>`).join('')}
        </div>`).join('')}
    </aside>`;
    let content = '';
    if (!cat) {
      renderCrumb([{ name: '考点体系' }]);
      content = `<div class="kb-grid">${DATA.modules.flatMap(m => m.cats.map(c => `
        <button class="kb-card kb-card-cat" data-cat="${XC.esc(c.id)}" style="--c:${m.color || '#5460d6'}">
          <div class="kb-card-k">大类</div>
          <div class="kb-card-name">${XC.esc(c.name)}</div>
          <div class="kb-card-meta">${XC.n(c.q)} 道真题 · ${(c.groups || []).length} 个考点群</div>
        </button>`)).join('')}</div>`;
    } else {
      const grps = (cat.groups || []).filter(g => !st.q || g.name.toLowerCase().includes(st.q) || (g.points || []).some(p => p.name.toLowerCase().includes(st.q)));
      const grp = st.group && cat.groups.find(g => g.name === st.group);
      renderCrumb([
        { name: '考点体系', go: { tab: 'kp', cat: null, group: null, point: null } },
        ...(grp ? [{ name: cat.name, go: { tab: 'kp', cat: st.cat, group: null, point: null } }, { name: grp.name }]
               : [{ name: cat.name }]),
      ]);
      if (grp) {
        const pts = (grp.points || []).filter(p => !st.q || p.name.toLowerCase().includes(st.q));
        content = `<div class="kb-points">${pts.map((p, i) => `
          <button class="kb-card kb-card-point" data-pt="${i}" style="--c:${modColorSafe(cat)}">
            <div class="kb-card-name">${XC.esc(p.name)}</div>
            <div class="kb-card-meta">微考点 · 点开看笔记与真题</div>
          </button>`).join('') || '<div class="empty"><span class="big">没有匹配的考点</span></div>'}</div>`;
      } else {
        content = `<div class="kb-grid">${grps.map(g => `
          <button class="kb-card" data-g="${XC.esc(g.name)}" style="--c:${modColorSafe(cat)}">
            <div class="kb-card-k">考点群</div>
            <div class="kb-card-name">${XC.esc(g.name)}</div>
            <div class="kb-card-meta">${g.points.length} 个微考点 · 如「${XC.esc((g.points[0] || {}).name || '')}」</div>
          </button>`).join('') || '<div class="empty"><span class="big">没有匹配的考点群</span></div>'}</div>`;
      }
    }
    body.innerHTML = side + `<div class="kb-main">${content}</div>`;
    bindKp();
  }

  /* 微考点详情（含笔记 + 关联真题连做） */
  async function openPoint(cat, grp, p) {
    st.cat = cat.id; st.group = grp.name; st.point = p.name;
    syncHash();
    const color = modColorSafe(cat);
    renderCrumb([
      { name: '考点体系', go: { tab: 'kp', cat: null, group: null, point: null } },
      { name: cat.name, go: { tab: 'kp', cat: st.cat, group: null, point: null } },
      { name: grp.name, go: { tab: 'kp', cat: st.cat, group: grp.name, point: null } },
      { name: p.name },
    ]);
    body.innerHTML = `<div class="kb-main"><div class="kb-note" style="--c:${color}">
      <div class="gp-kind" style="color:${color}">微考点</div>
      <h2 class="gp-name">${XC.esc(p.name)}</h2>
      <div class="kb-note-body" id="kbnote"><div class="gp-loading">正在取笔记…</div></div>
    </div></div>`;
    const box = XC.$('#kbnote', app);
    try {
      const md = stripFM(await fetchNote(p.path));
      await loadQmap();
      const stance = section(md, '核心立场');
      const items = extractQs(md);
      box.innerHTML = (stance ? mdToHtml(stance) : '<div class="gp-note">笔记要点为空。</div>')
        + `<div class="gp-h">关联真题（${items.length}）</div>`;
      box.appendChild(qBlock(items, p.name));
    } catch (e) {
      box.innerHTML = '<div class="gp-note">笔记加载失败（网络原因），稍后再试。</div>';
    }
  }

  function bindKp() {
    body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      st.cat = b.dataset.cat; st.group = null; st.point = null; st.q = '';
      XC.$('#kbq', app).value = '';
      render();
    });
    body.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      st.group = b.dataset.g; st.point = null; render();
    });
    body.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => {
      const cat = DATA.modules.flatMap(m => m.cats).find(c => c.id === st.cat);
      const grp = cat.groups.find(g => g.name === st.group);
      const pts = grp.points.filter(p => !st.q || p.name.toLowerCase().includes(st.q));
      openPoint(cat, grp, pts[+b.dataset.pt]);
    });
  }

  /* ---------- 标签 3：材料精读 ---------- */
  function renderMats() {
    renderCrumb([{ name: '材料精读' }]);
    if (!MATS) {
      body.innerHTML = '<div class="kb-loading"><div class="graph-orbit"><i></i><i></i><i></i></div><span>正在载入材料清单…</span></div>';
      return loadMats().then(renderMats).catch(() => {
        body.innerHTML = '<div class="empty"><span class="big">材料清单缺失</span>请先运行 tools/build-knowledge.cjs</div>';
      });
    }
    const q = st.q.toLowerCase();
    const list = MATS.items.filter(m => !q || m.title.toLowerCase().includes(q) || m.mid.includes(q));
    /* 深链还原：#/kb?tab=mat&mat=<mid> */
    if (st.mat) {
      const m = list.find(x => x.mid === st.mat) || MATS.items.find(x => x.mid === st.mat);
      if (m) return openMat(m);
      st.mat = null;
    }
    body.innerHTML = `<div class="kb-main"><div class="kb-mat-note">材料笔记是资料分析的「读题训练场」：每篇拆解时间口径、单位换算、结构陷阱与阅读陷阱，并附可读的材料原文与关联真题，共 ${XC.n(MATS.count)} 篇。</div>
      <div class="kb-grid">${list.slice(0, 120).map(m => `
        <button class="kb-card" data-mat="${m.mid}" style="--c:#0e8a80">
          <div class="kb-card-k"># ${m.mid}</div>
          <div class="kb-card-name">${XC.esc(m.title)}</div>
          <div class="kb-card-meta">统计材料 · 点开精读</div>
        </button>`).join('') || '<div class="empty"><span class="big">没有匹配的材料</span></div>'}</div>
      ${list.length > 120 ? `<div class="kb-more">仅显示前 120 篇，请用搜索缩小范围（共 ${XC.n(list.length)} 篇）</div>` : ''}</div>`;
    body.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => openMat(list.find(m => m.mid === b.dataset.mat)));
  }

  async function openMat(m) {
    st.tab = 'mat'; st.mat = m.mid;
    syncHash();
    renderCrumb([
      { name: '材料精读', go: { tab: 'mat', mat: null } },
      { name: m.title },
    ]);
    body.innerHTML = `<div class="kb-main"><div class="kb-note" style="--c:#0e8a80">
      <div class="gp-kind" style="color:#0e8a80">材料 · #${m.mid}</div>
      <h2 class="gp-name">${XC.esc(m.title)}</h2>
      <div class="kb-note-body" id="kbnote"><div class="gp-loading">正在取材料笔记…</div></div>
    </div></div>`;
    const box = XC.$('#kbnote', app);
    try {
      const raw = await fetchNote(m.path);
      const md = stripFM(raw);
      await loadQmap();
      /* 拆出「材料原文」段（裸 HTML），单独真渲染 */
      const iOrig = md.search(/^#{2,3}\s*材料原文\s*$/m);
      let notePart = iOrig >= 0 ? md.slice(0, iOrig) : md;
      notePart = notePart.replace(/^#[^\n]*\n/, '')                 // 重复的标题
                         .replace(/^[\s>]*关联\s*\d+\s*道小题\s*$/gm, '') // frontmatter 引用行
                         .replace(/^>.*$/gm, '')
                         .replace(/^#+\s*(?:关联)?真题[\s\S]*?(?=\n#|\n---|$)/m, ''); // 真题区单独渲染
      const origHtml = iOrig >= 0
        ? sanitizeHtml(md.slice(iOrig).replace(/^#{2,3}\s*材料原文\s*$/m, ''), m.path)
        : '';
      const items = extractQs(md);
      box.innerHTML = `
        ${origHtml ? `<div class="kb-mat-orig"><div class="gp-h">材料原文</div><div class="material-html">${origHtml}</div></div>` : ''}
        ${mdToHtml(notePart)}
        <div class="gp-h">关联真题（${items.length}）</div>`;
      box.appendChild(qBlock(items, m.title));
    } catch (e) {
      box.innerHTML = '<div class="gp-note">材料笔记加载失败（网络原因），稍后再试。</div>';
    }
  }

  /* ---------- 事件 ---------- */
  body.addEventListener('click', e => {
    const t = e.target.closest('[data-crumb]');
    if (t) return;   // 面包屑有自己的 handler
  });

  /* 标签切换 */
  app.querySelectorAll('.kb-tabs [data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  /* 搜索：导图标签 → 定位；卡片/材料 → 过滤 */
  XC.$('#kbq', app).addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const q = e.target.value.trim();
    st.q = q.toLowerCase();
    if (st.tab === 'graph') {
      if (graphApi) graphApi.locate(st.q);
      return;
    }
    if (st.tab === 'kp' && !st.cat && st.q && DATA) {
      // 全局搜群 / 微考点：跳到第一个命中
      outer:
      for (const m of DATA.modules) for (const c of m.cats) for (const g of c.groups) {
        if (g.name.toLowerCase().includes(st.q)) { st.cat = c.id; st.group = g.name; break outer; }
        for (const p of g.points) if (p.name.toLowerCase().includes(st.q)) { st.cat = c.id; st.group = g.name; break outer; }
      }
    }
    render();
  });

  /* ---------- 启动 ---------- */
  app.querySelectorAll('.kb-tabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === st.tab));
  render();
};
