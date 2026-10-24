/* ============================================================
 * 知识思维导图引擎 —— XC.mountGraph(stage)（v3 可嵌入 + 可拖拽）
 * 由考点库（#/kb 的「思维导图」标签）挂载到画布容器中。
 * 数据：/data/knowledge.json（tools/build-knowledge.cjs 生成）
 * 结构：根 → 模块 → 大类 → 考点群 → 微考点，横向思维导图
 * 交互：拖拽平移（手动平移后不再自动回中，⤢ 恢复适配）
 *       滚轮 / 双指以光标为锚缩放 · 点大类逐层展开
 * 动效：弹簧位移（q弹回弹）、入场弹射、悬停分支高光、点击冲击波
 *   + 火花、连线上流光、Spotlight 光斑、环境浮尘
 * ============================================================ */
XC.mountGraph = function (stage) {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  stage.innerHTML = `
    <canvas id="gcanvas"></canvas>
    <div class="graph-hud">
      <div class="graph-legend" id="glegend"></div>
      <div class="graph-hud-btns">
        <button class="icon-btn gz-btn" id="gz-out" title="缩小">−</button>
        <button class="icon-btn gz-btn" id="gz-in" title="放大">＋</button>
        <button class="icon-btn gz-btn" id="gz-fit" title="适配全图">⤢</button>
      </div>
    </div>
    <div class="graph-hint">拖动平移 · 滚轮缩放 · 点大类逐层展开 · ⤢ 回到全图</div>
    <div class="graph-loading" id="gload"><div class="graph-orbit"><i></i><i></i><i></i></div><span>正在铺开知识导图…</span></div>
    <aside class="graph-panel" id="gpanel" hidden></aside>`;

  const canvas = XC.$('#gcanvas', stage);
  const ctx = canvas.getContext('2d');

  /* ---------- 主题色 ---------- */
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let THEME = {};
  const readTheme = () => {
    THEME = {
      ink: css('--ink') || '#243b53',
      ink2: css('--ink-2') || '#486581',
      ink3: css('--ink-3') || '#829ab1',
      dark: document.documentElement.dataset.theme === 'dark',
      surface: THEME.dark ? '#1d2940' : '#ffffff',
    };
  };

  /* ---------- 配色（高级感：靛 / 青 / 墨 / 金） ---------- */
  const C = {
    root: '#2b3550', indigo: '#5460d6', teal: '#0e8a80', gold: '#c9962e',
  };
  const MOD_COLOR = { '判断推理': C.indigo, '资料分析': C.teal };
  const modColor = name => MOD_COLOR[name] || C.indigo;

  /* ---------- 数据 ---------- */
  let DATA = null, QMAP = null;
  const nodes = [];
  let root = null;
  let hover = null, selected = null;
  const ripples = [], sparkles = [], dust = [];
  let mouseX = -1e4, mouseY = -1e4, inside = false;
  const cam = { cx: 0, cy: 0, s: 1, tcx: 0, tcy: 0, ts: 1 };
  let DPR = 1;
  let userPanned = false;      // 手动拖过之后不再自动回中

  /* ---------- 建树 ---------- */
  function mkNode(n) {
    n.open = n.open === true; n.pop = REDUCED ? 1 : 0;
    n.x = n.tx = 0; n.y = n.ty = 0; n.vx = 0; n.vy = 0;
    n._h = 0; n.w = 80;
    nodes.push(n);
    return n;
  }
  function buildTree(data) {
    root = mkNode({
      id: '__root', name: '行测考点', kind: 'root', color: C.root,
      open: true, bornDelay: 0,
    });
    data.modules.forEach((m, mi) => {
      const color = modColor(m.name);
      const mn = mkNode({
        id: 'm:' + m.id, name: m.name, kind: 'module', color,
        q: m.q, m: m, open: true, parent: root, bornDelay: 140 + mi * 130,
      });
      root.children = root.children || []; root.children.push(mn);
      (m.cats || []).forEach((c, ci) => {
        const cn = mkNode({
          id: 'c:' + c.id, name: c.name, kind: 'cat', color,
          q: c.q, catData: c, parent: mn, bornDelay: 300 + ci * 80,
        });
        mn.children = mn.children || []; mn.children.push(cn);
        // 考点群（默认收起；按规模取前 N，其余汇总跳卡片库）
        const CAP = 22;
        const sorted = (c.groups || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0));
        cn._groups = []; cn._rest = [];
        sorted.forEach((g, gi) => {
          const gn = mkNode({
            id: 'g:' + c.id + '/' + g.name, name: g.name, kind: 'group',
            color, q: g.n, groupData: g, parent: cn, hidden: true,
          });
          (gi < CAP ? cn._groups : cn._rest).push(gn);
        });
        if (cn._rest.length) {
          cn._more = mkNode({
            id: 'cm:' + c.id, name: `还有 ${cn._rest.length} 群 → 卡片库`, kind: 'cat-more',
            color, parent: cn, hidden: true, catId: c.id, catName: (m.name + ' / ' + c.name),
          });
        }
      });
    });
    layout();
    // 初始位置：从根节点弹出
    nodes.forEach(n => { n.x = root.tx; n.y = root.ty; });
  }

  /* ---------- 布局（整理树：横向，逐列向右） ---------- */
  const ROW = { root: 58, module: 46, cat: 38, group: 30, 'cat-more': 30, point: 27, 'point-more': 27 };
  const GAP = { root: 0, module: 10, cat: 7, group: 5, 'cat-more': 5, point: 4, 'point-more': 4 };
  const COLX = { root: 0, module: 250, cat: 530, 'cat-more': 530, group: 880, 'point-more': 1230, point: 1230 };
  const FONT = { root: '600 16px', module: '600 14px', cat: '500 13px', group: '500 12px', 'cat-more': '500 11.5px', point: '400 11.5px', 'point-more': '400 11.5px' };
  const PADX = { root: 20, module: 16, cat: 13, group: 11, 'cat-more': 11, point: 10, 'point-more': 10 };

  function chipName(n) {
    const max = n.kind === 'root' ? 10 : n.kind === 'module' ? 8 : n.kind === 'cat' ? 10 : 16;
    return n.name.length > max + 2 ? n.name.slice(0, max) + '…' : n.name;
  }
  function visibleKids(n) {
    if (n.kind === 'cat') return (n._groups || []).concat(n._more || []);
    return n.children || (n._points || []);
  }
  function measureChip(n) {
    ctx.font = FONT[n.kind] + ' "Noto Sans SC",sans-serif';
    let w = ctx.measureText(chipName(n)).width + PADX[n.kind] * 2;
    if (n.kind === 'group' || n.kind === 'cat') w += 34;   // 计数徽标
    if (n.kind === 'cat' || n.kind === 'group') w += 14;   // 展开箭头
    n.w = Math.min(300, Math.max(ROW[n.kind], w));
  }
  function layout() {
    // 测宽
    for (const n of nodes) if (!n.hidden) measureChip(n);
    // 自底向上累计高度
    const hOf = n => {
      const kids = n.open && !n.hidden ? visibleKids(n).filter(k => !k.hidden) : [];
      n._kids = kids;
      const base = ROW[n.kind] + GAP[n.kind];
      if (!kids.length) { n._h = base; return base; }
      let sum = 0;
      kids.forEach(k => { sum += hOf(k); });
      sum += (kids.length - 1) * 4;
      n._h = Math.max(base, sum);
      return n._h;
    };
    hOf(root);
    // 自上而下放 x/y
    const place = (n, x, top) => {
      n.tx = x; n.ty = top + n._h / 2;
      const kids = n._kids || [];
      if (!kids.length) return;
      const sum = kids.reduce((s, k) => s + k._h, 0) + (kids.length - 1) * 4;
      let cy = top + (n._h - sum) / 2;
      const kx = COLX[kids[0].kind] !== undefined ? COLX[kids[0].kind] : x + 260;
      for (const k of kids) { place(k, kx, cy); cy += k._h + 4; }
    };
    place(root, COLX.root, 0);
  }

  /* ---------- 相机 ---------- */
  function fitBounds() {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const n of nodes) {
      if (n.hidden || n.pop <= 0 && n.born > performance.now()) continue;
      minX = Math.min(minX, n.tx); maxX = Math.max(maxX, n.tx + n.w);
      minY = Math.min(minY, n.ty - ROW[n.kind] / 2); maxY = Math.max(maxY, n.ty + ROW[n.kind] / 2);
    }
    if (minX > maxX) return;
    const w = canvas.width / DPR, h = canvas.height / DPR;
    const bw = maxX - minX + 90, bh = maxY - minY + 70;
    cam.tcx = (minX + maxX) / 2; cam.tcy = (minY + maxY) / 2;
    cam.ts = Math.max(.28, Math.min(1.35, Math.min(w / bw, h / bh)));
  }
  function flyCenter(x, y, s) {
    cam.tcx = x; cam.tcy = y;
    cam.ts = s || cam.ts;
  }
  // 以屏幕点 (px,py) 为锚缩放：光标下的内容保持不动
  function zoomAt(px, py, k) {
    const w = canvas.width / DPR, h = canvas.height / DPR;
    const ns = Math.max(.25, Math.min(3, cam.ts * k));
    if (ns === cam.ts) return;
    const wx = (px - w / 2) / cam.ts + cam.tcx;
    const wy = (py - h / 2) / cam.ts + cam.tcy;
    cam.ts = ns;
    cam.tcx = wx - (px - w / 2) / ns;
    cam.tcy = wy - (py - h / 2) / ns;
  }
  function tickCam() {
    cam.cx += (cam.tcx - cam.cx) * .09; cam.cy += (cam.tcy - cam.cy) * .09;
    cam.s += (cam.ts - cam.s) * .11;
  }
  const w2s = (x, y) => ({ x: (x - cam.cx) * cam.s + canvas.width / DPR / 2, y: (y - cam.cy) * cam.s + canvas.height / DPR / 2 });
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    canvas.width = Math.max(2, Math.round(r.width * DPR));
    canvas.height = Math.max(2, Math.round(r.height * DPR));
  }

  /* ---------- 物理（弹簧追目标） ---------- */
  function tick() {
    const K = REDUCED ? 1 : .085, D = REDUCED ? 0 : .74;
    for (const n of nodes) {
      if (n.hidden) continue;
      n.vx += (n.tx - n.x) * K; n.vy += (n.ty - n.y) * K;
      n.vx *= D; n.vy *= D;
      n.x += n.vx; n.y += n.vy;
      if (n.pop < 1 && performance.now() >= (n.born || 0)) n.pop = Math.min(1, n.pop + .075);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.r += r.v; r.v *= .96; r.a *= .94;
      if (r.a < .02) ripples.splice(i, 1);
    }
  }

  /* ---------- 高亮集合（悬停：祖先链 + 已展开子树） ---------- */
  function litSet() {
    const src = hover || selected;
    if (!src) return null;
    const set = new Set();
    let p = src;
    while (p) { set.add(p.id); p = p.parent; }
    const walk = n => { set.add(n.id); (n._kids || []).forEach(walk); };
    walk(src);
    return set;
  }

  /* ---------- 渲染 ---------- */
  function easeBack(t) { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function hexA(hex, a) {
    hex = (hex || '#888').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const v = parseInt(hex, 16);
    return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  let flowT = 0;

  function draw() {
    const w = canvas.width / DPR, h = canvas.height / DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (inside && !REDUCED) {
      const g = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 280);
      g.addColorStop(0, THEME.dark ? 'rgba(160,190,255,.07)' : 'rgba(47,79,125,.055)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    drawDust(w, h);

    // 进入世界坐标（相机：内容居中 + 缩放）
    ctx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (w / 2 - cam.cx * cam.s), DPR * (h / 2 - cam.cy * cam.s));

    const lit = litSet();
    const visible = nodes.filter(n => !n.hidden);

    // 连线（父右缘 → 子左缘 贝塞尔）
    flowT += .012;
    for (const n of visible) {
      for (const k of (n._kids || [])) {
        const x1 = n.x + n.w, y1 = n.y, x2 = k.x, y2 = k.y;
        const mx = (x1 + x2) / 2;
        const isLit = lit && lit.has(n.id) && lit.has(k.id);
        const dim = lit && !isLit;
        const base = n.kind === 'root' ? '84,98,150' : hexToRgb(n.color);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        ctx.strokeStyle = `rgba(${base},${dim ? .05 : isLit ? .55 : .2})`;
        ctx.lineWidth = (isLit ? 1.9 : 1.25) * Math.min(1.5, Math.max(.7, cam.s));
        ctx.stroke();
        if (isLit && !REDUCED) {
          const tt = (flowT + ((n.name.length + k.name.length) % 9) / 9) % 1;
          const bx = (1 - tt) ** 3 * x1 + 3 * (1 - tt) ** 2 * tt * mx + 3 * (1 - tt) * tt * tt * mx + tt ** 3 * x2;
          const by = (1 - tt) ** 3 * y1 + 3 * (1 - tt) ** 2 * tt * y1 + 3 * (1 - tt) * tt * tt * y2 + tt ** 3 * y2;
          ctx.beginPath(); ctx.arc(bx, by, 2, 0, 7);
          ctx.fillStyle = n.color; ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1;
        }
      }
    }

    // 冲击波
    for (const r of ripples) {
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7);
      ctx.strokeStyle = r.color; ctx.globalAlpha = r.a; ctx.lineWidth = 2.2;
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // 节点芯片
    ctx.textBaseline = 'middle';
    for (const n of visible) {
      if (n.pop <= 0) continue;
      const scale = easeBack(Math.min(1, n.pop));
      const isLit = !lit || lit.has(n.id);
      const hh = ROW[n.kind] * .8 * scale;
      const x = n.x + (n.w - n.w * scale) / 2, y = n.y - hh / 2;
      const hot = n === hover || n === selected;

      if (hot && !REDUCED) { ctx.shadowColor = hexA(n.color, .5); ctx.shadowBlur = 22; }
      const CH = THEME.dark;
      if (n.kind === 'root' || n.kind === 'module') {
        // 实心渐变
        const grad = ctx.createLinearGradient(x, y, x + n.w, y + hh);
        grad.addColorStop(0, n.kind === 'root' ? C.root : n.color);
        grad.addColorStop(1, n.kind === 'root' ? '#3d4a6e' : shiftColor(n.color, -18));
        ctx.fillStyle = grad;
        rr(x, y, n.w * scale, hh, hh / 2); ctx.fill();
      } else {
        ctx.fillStyle = CH ? 'rgba(30,42,68,.92)' : 'rgba(255,255,255,.96)';
        rr(x, y, n.w * scale, hh, hh / 2); ctx.fill();
        ctx.lineWidth = hot ? 2 : 1.2;
        ctx.strokeStyle = hexA(n.color, isLit ? (hot ? .95 : .8) : .38);
        if (n.kind === 'point') ctx.setLineDash([4, 3]);
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.shadowBlur = 0;

      // 文本
      ctx.font = FONT[n.kind] + ' "Noto Sans SC",sans-serif';
      ctx.textAlign = 'left';
      if (n.kind === 'root' || n.kind === 'module') ctx.fillStyle = '#fff';
      else ctx.fillStyle = isLit ? (CH ? '#dde5f2' : THEME.ink) : hexA(CH ? '#9db0cc' : THEME.ink2, .55);
      const tx0 = x + PADX[n.kind];
      ctx.fillText(chipName(n), tx0, n.y, Math.max(30, n.w * scale - PADX[n.kind] * 2 - badgeW(n)));

      // 计数徽标 / 展开箭头
      if (n.kind === 'group' || n.kind === 'cat') {
        const bw = 30, bx = x + n.w * scale - bw - 8;
        ctx.font = '500 10px "Noto Sans SC",sans-serif';
        ctx.fillStyle = hexA(n.color, isLit ? .16 : .08);
        rr(bx, n.y - 8, bw, 16, 8); ctx.fill();
        ctx.fillStyle = hexA(n.color, isLit ? .95 : .5);
        ctx.textAlign = 'center';
        ctx.fillText(n.open ? '−' : XC.n(n.q != null ? n.q : (n.groupData ? n.groupData.points.length : '')), bx + bw / 2, n.y + .5);
        // 展开箭头
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = hexA(n.color, isLit ? .7 : .35);
        ctx.fillText(n.open ? '▾' : '▸', bx - 8, n.y + .5);
        ctx.textAlign = 'left';
      }
    }

    // Click Spark
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx; s.y += s.vy; s.vx *= .92; s.vy *= .92; s.a *= .9;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, 7);
      ctx.fillStyle = s.color; ctx.globalAlpha = s.a; ctx.fill(); ctx.globalAlpha = 1;
      if (s.a < .03) sparkles.splice(i, 1);
    }
  }
  function badgeW(n) { return (n.kind === 'group' || n.kind === 'cat') ? 52 : 0; }
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const v = parseInt(hex, 16);
    return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`;
  }
  function shiftColor(hex, amt) {
    const v = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (v >> 16 & 255) + amt));
    const g = Math.max(0, Math.min(255, (v >> 8 & 255) + amt));
    const b = Math.max(0, Math.min(255, (v & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }
  function drawDust(w, h) {
    if (REDUCED) return;
    while (dust.length < 40) dust.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .4, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .14 });
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = THEME.dark ? 'rgba(170,195,235,.12)' : 'rgba(47,79,125,.09)';
    for (const d of dust) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < -8) d.x = w + 8; if (d.x > w + 8) d.x = -8;
      if (d.y < -8) d.y = h + 8; if (d.y > h + 8) d.y = -8;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 交互（拖拽平移 + 以光标为锚缩放） ---------- */
  function pick(px, py) {
    const w = canvas.width / DPR, h = canvas.height / DPR;
    const wx = (px - w / 2) / cam.s + cam.cx, wy = (py - h / 2) / cam.s + cam.cy;
    let best = null, bd = 1e9;
    for (const n of nodes) {
      if (n.hidden) continue;
      const hh = ROW[n.kind] * .55 + 5;
      if (wx >= n.x - 4 && wx <= n.x + n.w + 4 && Math.abs(wy - n.y) <= hh) {
        const d = Math.hypot(wx - (n.x + n.w / 2), wy - n.y);
        if (d < bd) { best = n; bd = d; }
      }
    }
    return best;
  }
  function burst(n) {
    ripples.push({ x: n.x + n.w / 2, y: n.y, r: 10, v: 3.2, a: .5, color: hexA(n.color, 1) });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      sparkles.push({ x: n.x + n.w / 2, y: n.y, vx: Math.cos(a) * (1.5 + Math.random() * 2), vy: Math.sin(a) * (1.5 + Math.random() * 2), a: .8, color: n.color });
    }
  }
  let downP = null;          // 按下位置（判定 click vs drag）
  let dragging = false;      // 正在拖拽平移
  let panPrev = null;        // 上一帧指针位置
  const pts = new Map();
  let pinch0 = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, rel(e));
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.ts };
      dragging = false;
      return;
    }
    downP = rel(e);
    dragging = false;
  });
  canvas.addEventListener('pointermove', e => {
    const p = rel(e);
    mouseX = p.x; mouseY = p.y; inside = true;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 4) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch0.d);
      pinch0.d = d;
      return;
    }
    // 单指 / 单鼠标：超过阈值进入拖拽平移
    if (downP && pts.size === 1) {
      if (!dragging && Math.hypot(p.x - downP.x, p.y - downP.y) > 6) {
        dragging = true; panPrev = downP;
        userPanned = true; t0 = 0;                 // 手动接管，停掉入场自动适配
        hover = null;
        canvas.style.cursor = 'grabbing';
      }
      if (dragging) {
        cam.cx -= (p.x - panPrev.x) / cam.s;
        cam.cy -= (p.y - panPrev.y) / cam.s;
        cam.tcx = cam.cx; cam.tcy = cam.cy;        // 1:1 跟手
        panPrev = p;
        return;
      }
    }
    const hit = pick(p.x, p.y);
    if (hit !== hover) { hover = hit; canvas.style.cursor = hit ? 'pointer' : 'grab'; }
  });
  canvas.addEventListener('pointerup', e => {
    const p = rel(e);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (dragging) {
      dragging = false; downP = null; panPrev = null;
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      return;                                      // 拖拽结束不触发点击
    }
    if (downP && Math.hypot(p.x - downP.x, p.y - downP.y) < 6) {
      const hit = pick(p.x, p.y);
      if (hit) activate(hit);
    }
    downP = null;
  });
  canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch0 = null; downP = null; dragging = false; });
  canvas.addEventListener('pointerleave', () => { inside = false; hover = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = rel(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * .0012));
  }, { passive: false });
  function rel(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  XC.$('#gz-in', stage).onclick = () => zoomAt(canvas.width / DPR / 2, canvas.height / DPR / 2, 1.25);
  XC.$('#gz-out', stage).onclick = () => zoomAt(canvas.width / DPR / 2, canvas.height / DPR / 2, 1 / 1.25);
  XC.$('#gz-fit', stage).onclick = () => { userPanned = false; fitBounds(); };

  /* ---------- 激活 ---------- */
  function toggle(n) {
    if (n.kind === 'group' && !n._points) ensurePoints(n);
    n.open = !n.open;
    const kids = visibleKids(n);
    if (n.open) {
      kids.forEach((k, i) => {
        k.hidden = false;
        k.pop = 0;
        k.born = performance.now() + (REDUCED ? 0 : Math.min(i * 22, 550));
        k.x = n.x + n.w * .3; k.y = n.y; k.vx = 2.2; k.vy = 0;
      });
    } else {
      kids.forEach(k => { k.hidden = true; if (k.open) toggle(k); });
    }
    layout();
    if (n.open && !userPanned) fitBounds();
  }
  function ensurePoints(gn) {
    if (gn._points) return;
    gn._points = [];
    const list = (gn.groupData && gn.groupData.points) || [];
    const CAP = 14;
    list.slice(0, CAP).forEach(p => {
      gn._points.push(mkNode({
        id: 'p:' + p.path, name: p.name, kind: 'point', color: gn.color,
        pointData: p, parent: gn, hidden: true,
      }));
    });
    if (list.length > CAP) {
      gn._points.push(mkNode({
        id: 'pm:' + gn.id, name: `其余 ${list.length - CAP} 个 → 卡片库`, kind: 'point-more',
        color: gn.color, parent: gn, hidden: true,
        groupId: gn.id.replace(/^g:/, ''),
      }));
    }
  }

  function activate(n) {
    burst(n);
    if (n.kind === 'root') { userPanned = false; fitBounds(); return; }
    if (n.kind === 'cat' || n.kind === 'group' || n.kind === 'module') {
      toggle(n);
      selected = n;
      return;
    }
    if (n.kind === 'cat-more') { XC.go('#/kb?tab=kp&cat=' + encodeURIComponent(n.catId)); return; }
    if (n.kind === 'point-more') { XC.go('#/kb?tab=kp&group=' + encodeURIComponent(n.groupId)); return; }
    if (n.kind === 'point') { selected = n; showPanel(n); return; }
  }
  function deselect() { selected = null; XC.$('#gpanel', stage).hidden = true; }

  /* ---------- 详情面板（微考点笔记 + 真题连做） ---------- */
  async function loadQmap() {
    if (QMAP) return QMAP;
    try { QMAP = await XC.api.get('/data/qidmap.json'); } catch (e) { QMAP = {}; }
    return QMAP;
  }
  function setQueue(title, rows, targetQid) {
    const list = rows.map(r => QMAP[String(r.qid)]).filter(Boolean);
    const hit = targetQid && QMAP[String(targetQid)];
    if (list.length < 2) {                        // 只有 1 题可做，不设队列
      sessionStorage.removeItem('xc-kbqueue');
      if (hit || list.length) XC.go('#/p/' + (hit || list[0]).replace('|', '/'));
      else XC.toast('本站题库暂无此题', 'bad');
      return;
    }
    sessionStorage.setItem('xc-kbqueue', JSON.stringify({ title, list }));
    XC.go('#/p/' + (hit || list[0]).replace('|', '/'));
  }
  async function showPanel(n) {
    const pn = XC.$('#gpanel', stage);
    pn.hidden = false;
    pn.classList.remove('on'); void pn.offsetWidth; pn.classList.add('on');
    pn.innerHTML = `
      <button class="icon-btn gp-close" id="gp-close">${XC.icon('close')}</button>
      <div class="gp-kind" style="color:${n.color}">考点</div>
      <h2 class="gp-name">${XC.esc(n.name)}</h2>
      <div class="gp-meta">来自 <b>考公脑库</b> · 逐题粒度微考点</div>
      <div class="gp-body" id="gp-body"><div class="gp-loading">正在取笔记要点…</div></div>`;
    XC.$('#gp-close', stage).onclick = deselect;
    const body = XC.$('#gp-body', stage);
    try {
      const url = 'https://cdn.jsdelivr.net/gh/ERRRC/kaogongzhentizhengliu@main/' + n.pointData.path.split('/').map(encodeURIComponent).join('/');
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      let md = await r.text();
      md = md.replace(/^---[\s\S]*?---/, '');
      await loadQmap();
      // 核心立场 + 真题列表
      const stance = md.match(/#+\s*核心立场[\s\S]*?(?=\n#+ |$)/);
      const qSec = md.match(/#+\s*真题[^\n]*\n([\s\S]*?)(?=\n#+ |$)/);
      let qHtml = '';
      const rows = qSec
        ? [...qSec[1].matchAll(/\[\[10-真题\/[^\]|]+\|(\d+)[^\]]*\]\]\s*([^\n]*)/g)]
            .map(m => ({ qid: m[1], info: m[2].trim() }))
        : [];
      if (rows.length) {
        qHtml = `<div class="gp-h">关联真题</div>` + rows.map(r => {
          const hit = QMAP[String(r.qid)];
          return `<div class="gp-qrow"><div class="t">${XC.esc(r.info.split('—')[0].trim() || r.info)}</div>${hit
            ? `<button class="btn btn-soft btn-sm gp-practice" data-qid="${XC.esc(r.qid)}">去练习 ›</button>`
            : '<span class="gp-note">暂无此题</span>'}</div>`;
        }).join('');
      }
      body.innerHTML = (stance ? mdToHtml(stance[0].slice(0, 700)) : '<div class="gp-note">笔记要点为空。</div>')
        + qHtml
        + `<button class="btn btn-ghost btn-sm gp-kb" style="margin-top:10px">在卡片库中查看 ›</button>`;
      // 卡片库深链：cat + group + point 一路带到微考点详情
      let kbLink = '#/kb?tab=kp';
      try {
        const gn = n.parent, cn = gn && gn.parent;
        const catId = cn && (cn.catData ? cn.catData.id : String(cn.id).replace(/^c:/, ''));
        if (gn && gn.groupData && catId) {
          kbLink = '#/kb?tab=kp&cat=' + encodeURIComponent(catId)
            + '&group=' + encodeURIComponent(gn.groupData.name)
            + '&point=' + encodeURIComponent(n.pointData.name);
        }
      } catch (e) { /* 兜底只带 cat */ }
      body.querySelector('.gp-kb').onclick = () => XC.go(kbLink);
      body.querySelectorAll('.gp-practice').forEach(b => {
        b.onclick = () => setQueue(n.name, rows, b.dataset.qid);
      });
    } catch (err) {
      body.innerHTML = '<div class="gp-note">笔记要点加载失败（网络原因），不影响导图浏览。</div>';
    }
  }
  function mdToHtml(md) {
    return XC.esc(md)
      .replace(/^#+ .*/gm, m => '<div class="gp-h">' + m.replace(/^#+ /, '') + '</div>')
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '<span class="gp-link">[[ $1 ]]</span>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '<div style="height:8px"></div>')
      .replace(/\n/g, '<br>');
  }

  /* ---------- 搜索定位（供外部搜索框调用） ---------- */
  function locate(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return;
    // 在全部数据里找：先微考点（更精确），再考点群
    let found = null;
    outer:
    for (const m of DATA.modules) for (const c of m.cats) for (const g of c.groups) {
      for (const p of g.points) if (p.name.toLowerCase().includes(q)) { found = { cat: c, group: g, point: p }; break outer; }
    }
    if (!found) {
      outer2:
      for (const m of DATA.modules) for (const c of m.cats) for (const g of c.groups) {
        if (g.name.toLowerCase().includes(q)) { found = { cat: c, group: g, point: null }; break outer2; }
      }
    }
    if (!found) return XC.toast('没找到相关考点', 'bad');
    // 展开祖先链
    const catId = 'c:' + found.cat.id;
    const cn = nodes.find(n => n.id === catId);
    if (cn && !cn.open) toggle(cn);
    const gn = nodes.find(n => n.id === 'g:' + found.cat.id + '/' + found.group.name);
    if (!gn || gn.hidden) {
      // 超出 Top22 的群：导图不铺开，转到卡片库
      XC.go('#/kb?tab=kp&cat=' + encodeURIComponent(found.cat.id) + '&group=' + encodeURIComponent(found.group.name));
      XC.toast('「' + found.group.name + '」在卡片库中打开', 'ok');
      return;
    }
    if (found.point && !gn.open) toggle(gn);
    const pn = found.point ? nodes.find(n => n.id === 'p:' + found.point.path) : null;
    const target = pn || gn;
    userPanned = false;
    fitBounds();
    setTimeout(() => flyCenter(target.tx + target.w / 2, target.ty, Math.max(cam.ts, .9)), 60);
    selected = target; burst(target);
    if (pn) showPanel(pn);
    else if (found.point) showPanel({ kind: 'point', name: found.point.name, color: gn.color, pointData: found.point });  // 超出 Top14 也能看笔记
    else XC.toast('已定位：' + target.name, 'ok');
  }

  /* ---------- 主循环 ---------- */
  let raf = 0, running = true, t0 = 0;
  function loop() {
    if (!running) return;
    if (!document.body.contains(canvas)) { running = false; return; }
    tick(); tickCam(); draw();
    if (t0 && !userPanned && performance.now() - t0 < 2400) fitBounds();   // 入场期间持续适配（拖动即停）
    raf = requestAnimationFrame(loop);
  }

  /* ---------- 启动 ---------- */
  (async () => {
    readTheme();
    try {
      DATA = await XC.api.get('/data/knowledge.json');
    } catch (e) {
      XC.$('#gload', stage).innerHTML = '<span>图谱数据缺失：请先运行 tools/build-knowledge.cjs</span>';
      return;
    }
    XC.$('#glegend', stage).innerHTML = DATA.modules.map(m =>
      `<span class="gl-item"><i style="background:${modColor(m.name)}"></i>${m.name} · ${XC.n(m.q)} 题</span>`).join('');
    resize();
    buildTree(DATA);
    fitBounds();
    cam.cx = cam.tcx; cam.cy = cam.tcy; cam.s = cam.ts;   // 首帧直接就位
    setTimeout(() => { const l = XC.$('#gload', stage); if (l) { l.style.opacity = 0; setTimeout(() => l.remove(), 550); } }, 300);
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  })();

  /* ---------- 生命周期 ---------- */
  const ac = new AbortController();
  const onResize = () => { resize(); if (!userPanned) fitBounds(); };
  addEventListener('resize', onResize, { signal: ac.signal });
  const themeObs = new MutationObserver(() => { readTheme(); THEME.surface = THEME.dark ? '#1d2940' : '#ffffff'; });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    locate,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ac.abort();
      themeObs.disconnect();
      stage.innerHTML = '';
    },
  };
};
