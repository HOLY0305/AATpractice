/* 统计报告页：Bento 数据面板 —— 正确率环 / 模块条形 / 能力雷达 / 用时直方 / 模块玫瑰 / 30日趋势 / 学习日历（纯 SVG，零依赖） */
'use strict';
(function (XC) {
  XC.views = XC.views || {};

  /* 数字滚动 */
  function countUp(el, to, dur, fmt) {
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = fmt(to * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  XC.views.stats = async function (app) {
    const idx = await XC.loadIndex();
    const u = XC.S.user;
    const idRow = {};
    idx.forEach(p => { idRow[p.id] = p; });

    /* ---------- 聚合 ---------- */
    const byMod = {};                 // module → {n, scored, ok, ms}
    const times = [];                 // 每题用时 ms
    let totalN = 0, totalOk = 0, totalWrong = 0, totalMs = 0;
    Object.entries(u.papers || {}).forEach(([pid, qs]) => {
      const row = idRow[pid];
      Object.values(qs).forEach(rec => {
        const mod = row ? row.module : '??';
        const b = byMod[mod] || (byMod[mod] = { n: 0, scored: 0, ok: 0, ms: 0 });
        b.n++; b.ms += (rec.ms || 0);
        totalN++; totalMs += (rec.ms || 0);
        if (rec.ok === true || rec.ok === false) {
          b.scored++;
          if (rec.ok) { b.ok++; totalOk++; } else { totalWrong++; }
        }
        if (rec.ms) times.push(rec.ms);
      });
    });
    const totalScored = totalOk + totalWrong;
    const overallAcc = totalScored ? Math.round(totalOk / totalScored * 100) : 0;
    const avgSec = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 100) / 10 : 0;
    const totalMin = Math.round(totalMs / 60000);
    const days = u.stats.days || {};
    const dayCount = Object.keys(days).length;

    const modRows = Object.entries(byMod)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, b]) => ({
        m, name: XC.MODULES[m] || m,
        n: b.n, scored: b.scored,
        accPct: b.scored ? Math.round(b.ok / b.scored * 100) : null,
        avgSec: b.n ? Math.round(b.ms / b.n / 100) / 10 : 0,
      }));

    /* ---------- 近 30 日趋势 ---------- */
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const trend = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(today); dt.setDate(today.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      trend.push({ key, n: days[key] || 0, lbl: `${dt.getMonth() + 1}/${dt.getDate()}` });
    }
    const trendMax = Math.max(4, ...trend.map(t => t.n));
    const trendHas = trend.some(t => t.n > 0);

    /* ---------- 1. 正确率环 ---------- */
    const RC = 2 * Math.PI * 74;
    const donutOffset = RC * (1 - overallAcc / 100);
    const donutSvg = `
      <svg viewBox="0 0 200 200" class="donut">
        <circle cx="100" cy="100" r="74" class="donut-bg"/>
        <circle cx="100" cy="100" r="74" class="donut-fg" transform="rotate(-90 100 100)"
          style="stroke-dasharray:${RC.toFixed(1)};stroke-dashoffset:${RC.toFixed(1)}" data-dash="${donutOffset.toFixed(1)}"/>
        <text x="100" y="98" text-anchor="middle" class="donut-num"><tspan data-count="${overallAcc}">0</tspan><tspan class="donut-pct">%</tspan></text>
        <text x="100" y="121" text-anchor="middle" class="donut-sub">总正确率</text>
      </svg>
      <div class="donut-legend">
        <span><i style="background:var(--accent)"></i>对 ${totalOk}</span>
        <span><i style="background:rgba(163,118,42,.45)"></i>错 ${totalWrong}</span>
        <span class="tiny-note">判分 ${totalScored} 题</span>
      </div>`;

    /* ---------- 2. 模块正确率条形 ---------- */
    const barsHtml = modRows.map(r => `
      <div class="sb-row">
        <span class="sb-name">${XC.esc(r.name)}</span>
        <div class="sb-bar"><i style="width:0%" data-w="${r.accPct || 0}%"></i></div>
        <span class="sb-val">${r.accPct === null ? '—' : r.accPct + '%'}<small>${r.scored ? ` ${r.scored} 题` : ` ${r.n} 题`}</small></span>
      </div>`).join('');

    /* ---------- 3. 模块能力雷达 ---------- */
    const radarPts = modRows.filter(r => r.scored >= 3);
    let radarSvg;
    if (radarPts.length >= 3) {
      const CX = 160, CY = 128, R = 92, N = radarPts.length;
      const ang = i => -Math.PI / 2 + i * 2 * Math.PI / N;
      const pt = (r, i) => `${(CX + r * Math.cos(ang(i))).toFixed(1)},${(CY + r * Math.sin(ang(i))).toFixed(1)}`;
      const rings = [0.25, 0.5, 0.75, 1].map(k =>
        `<polygon points="${radarPts.map((_, i) => pt(R * k, i)).join(' ')}" class="radar-ring"/>`).join('');
      const axes = radarPts.map((_, i) => `<line x1="${CX}" y1="${CY}" x2="${pt(R, i).split(',')[0]}" y2="${pt(R, i).split(',')[1]}" class="radar-axis"/>`).join('');
      const lbls = radarPts.map((r, i) => {
        const c = Math.cos(ang(i)), s = Math.sin(ang(i));
        const anchor = Math.abs(c) < .3 ? 'middle' : c > 0 ? 'start' : 'end';
        const x = CX + (R + 14) * c, y = CY + (R + 14) * s + 4;
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="chart-lbl">${XC.esc(r.name)}</text>`;
      }).join('');
      const polyPts = radarPts.map((r, i) => pt(R * (r.accPct || 0) / 100, i)).join(' ');
      const dots = radarPts.map((r, i) => {
        const [x, y] = pt(R * (r.accPct || 0) / 100, i).split(',');
        return `<circle cx="${x}" cy="${y}" r="3.4" class="radar-dot" style="animation-delay:${i * 90 + 400}ms"/>`;
      }).join('');
      radarSvg = `<svg viewBox="0 0 320 256" class="chart radar">
        ${rings}${axes}
        <polygon points="${polyPts}" class="radar-poly"/>
        ${dots}${lbls}
      </svg>`;
    } else {
      radarSvg = '<div class="empty" style="padding:26px 0"><span class="big">数据还画不成雷达</span>每个模块判分满 3 题就会亮起一角</div>';
    }

    /* ---------- 4. 用时分布直方 ---------- */
    const buckets = [
      { label: '<15s', lo: 0, hi: 15000 }, { label: '15-30s', lo: 15000, hi: 30000 },
      { label: '30-45s', lo: 30000, hi: 45000 }, { label: '45-60s', lo: 45000, hi: 60000 },
      { label: '1-1.5分', lo: 60000, hi: 90000 }, { label: '1.5-2分', lo: 90000, hi: 120000 },
      { label: '2-3分', lo: 120000, hi: 180000 }, { label: '>3分', lo: 180000, hi: Infinity },
    ];
    const counts = buckets.map(b => times.filter(t => t >= b.lo && t < b.hi).length);
    const srt = times.slice().sort((a, b) => a - b);
    const medianSec = srt.length ? Math.round(srt[Math.floor(srt.length / 2)] / 100) / 10 : 0;
    const maxC = Math.max(1, ...counts);
    const HW = 360, HH = 168, hpB = 26, hpT = 20;
    const bw = (HW - 16) / counts.length;
    const histSvg = times.length ? `<svg viewBox="0 0 ${HW} ${HH + hpB}" class="chart">
      ${counts.map((c, i) => {
        const h = Math.round((HH - hpT - 18) * c / maxC);
        const x = 8 + i * bw + 3, y = HH - h;
        return `<g>
          <rect x="${x}" y="${y}" width="${bw - 6}" height="${h}" rx="4" class="hist-bar" style="animation-delay:${i * 60}ms"/>
          <text x="${x + (bw - 6) / 2}" y="${y - 5}" text-anchor="middle" class="chart-num">${c || ''}</text>
          <text x="${x + (bw - 6) / 2}" y="${HH + 15}" text-anchor="middle" class="chart-lbl">${buckets[i].label}</text>
        </g>`;
      }).join('')}
    </svg>` : '<div class="empty" style="padding:26px 0"><span class="big">暂无用时数据</span></div>';

    /* ---------- 5. 模块题量玫瑰 ---------- */
    const PAL = ['rgba(47,79,125,.88)', 'rgba(163,118,42,.85)', 'rgba(109,141,184,.80)', 'rgba(196,154,78,.78)',
      'rgba(47,79,125,.55)', 'rgba(163,118,42,.55)', 'rgba(47,79,125,.35)', 'rgba(163,118,42,.35)'];
    const roseRows = modRows.filter(r => r.n > 0);
    let roseSvg;
    if (roseRows.length) {
      const CX = 160, CY = 128, RMAX = 92, RMIN = 26;
      const nMax = Math.max(...roseRows.map(r => r.n));
      const sector = (r1, a0, a1) => {
        const p = (r, a) => `${(CX + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `M${p(r1, a0)}A${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${p(r1, a1)}L${p(6, a1)}A6 6 0 ${large} 0 ${p(6, a0)}Z`;
      };
      const secs = roseRows.map((r, i) => {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / roseRows.length + 0.035;
        const a1 = -Math.PI / 2 + (i + 1) * 2 * Math.PI / roseRows.length - 0.035;
        const rad = RMIN + (RMAX - RMIN) * Math.sqrt(r.n / nMax);
        const mid = (a0 + a1) / 2;
        const lx = CX + (rad + 13) * Math.cos(mid), ly = CY + (rad + 13) * Math.sin(mid) + 4;
        return `<g class="rose-sec" style="animation-delay:${i * 90}ms">
          <path d="${sector(rad, a0, a1)}" fill="${PAL[i % PAL.length]}"><title>${XC.esc(r.name)} · ${r.n} 题</title></path>
          <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" class="chart-lbl">${r.n}</text>
        </g>`;
      }).join('');
      roseSvg = `<svg viewBox="0 0 320 256" class="chart rose">${secs}</svg>`;
    } else {
      roseSvg = '<div class="empty" style="padding:26px 0"><span class="big">还没有题量分布</span></div>';
    }

    /* ---------- 6. 近 30 日趋势面积 ---------- */
    let trendSvg;
    if (trendHas) {
      const TW = 620, TH = 150, tpL = 26, tpB = 22, tpT = 12;
      const iw = TW - tpL - 10, ih = TH - tpB - tpT;
      const px = i => tpL + i * iw / 29;
      const py = n => tpT + ih - ih * n / trendMax;
      const line = trend.map((t, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(t.n).toFixed(1)}`).join('');
      const area = line + `L${px(29).toFixed(1)} ${tpT + ih}L${px(0).toFixed(1)} ${tpT + ih}Z`;
      const lbls = trend.map((t, i) => (i % 7 === 0 || i === 29)
        ? `<text x="${px(i).toFixed(1)}" y="${TH - 4}" text-anchor="middle" class="chart-lbl">${t.lbl}</text>` : '').join('');
      const dots = trend.map((t, i) => t.n > 0
        ? `<circle cx="${px(i).toFixed(1)}" cy="${py(t.n).toFixed(1)}" r="2.6" class="trend-dot" style="animation-delay:${400 + i * 26}ms"/>` : '').join('');
      trendSvg = `<svg viewBox="0 0 ${TW} ${TH}" class="chart">
        <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(47,79,125,.30)"/><stop offset="1" stop-color="rgba(47,79,125,0)"/>
        </linearGradient>
        <clipPath id="tclip"><rect x="${tpL - 4}" y="0" width="0" height="${TH}" data-clipw="${iw + 14}"/></clipPath></defs>
        <line x1="${tpL}" y1="${tpT + ih}" x2="${TW - 8}" y2="${tpT + ih}" class="trend-base"/>
        <g clip-path="url(#tclip)">
          <path d="${area}" fill="url(#tg)" class="trend-area"/>
          <path d="${line}" class="trend-line" data-dash="0"/>
          ${dots}
        </g>${lbls}
      </svg>`;
    } else {
      trendSvg = '<div class="empty" style="padding:22px 0"><span class="big">最近 30 天还没有记录</span>练几题，这条线就活过来了</div>';
    }

    /* ---------- 7. 学习日历热力图 ---------- */
    const WEEKS = 26;
    const start = new Date(today); start.setDate(start.getDate() - (WEEKS * 7 - 1));
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1); // 从周一开始
    const maxDay = Math.max(1, ...Object.values(days));
    const lvl = n => n === 0 ? 0 : Math.min(4, Math.ceil(n / maxDay * 4));
    const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    let cells = '', monthTags = '', lastMonth = -1;
    const CW = 15, CH = 15, GAP = 3;
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
        if (dt > today) continue;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const n = days[key] || 0;
        if (d === 0 && dt.getMonth() !== lastMonth) { lastMonth = dt.getMonth(); monthTags += `<text x="${w * (CW + GAP)}" y="10" class="chart-lbl">${MONTHS[lastMonth]}</text>`; }
        cells += `<rect x="${w * (CW + GAP)}" y="${18 + d * (CH + GAP)}" width="${CW}" height="${CH}" rx="3"
          class="heat heat-${lvl(n)}" style="animation-delay:${w * 14 + d * 4}ms"><title>${dt.getMonth() + 1}月${dt.getDate()}日 · ${n} 题</title></rect>`;
      }
    }
    const calW = WEEKS * (CW + GAP), calH = 18 + 7 * (CH + GAP);
    const heatSvg = `<div class="heat-scroll"><svg viewBox="0 0 ${calW} ${calH + 4}" width="${calW}" class="chart">
      ${monthTags}${cells}</svg></div>
      <div class="heat-legend">少
        <i class="heat heat-0"></i><i class="heat heat-1"></i><i class="heat heat-2"></i><i class="heat heat-3"></i><i class="heat heat-4"></i> 多
        <span>最近 ${WEEKS} 周 · 共 ${dayCount} 天有记录</span></div>`;

    /* ---------- Bento 面板 ---------- */
    app.innerHTML = `
    <section class="hero">
      <div class="kicker">统计报告　·　${XC.esc(u.name)}</div>
      <h1>你的<em>练题画像</em></h1>
      <p>所有图表均由本机作答记录实时生成，不联网、不上传。</p>
    </section>

    <div class="bento">
      <div class="b-tile b3 b-kpi" style="animation-delay:0ms">
        <div class="k">累计作答</div><div class="v"><span data-count="${totalN}">0</span><small>题</small></div>
        <div class="mini">判分 ${totalScored} · 未判 ${totalN - totalScored}</div>
      </div>
      <div class="b-tile b3 b-kpi" style="animation-delay:60ms">
        <div class="k">总正确率</div><div class="v"><span data-count="${overallAcc}">0</span><small>%</small></div>
        <div class="mini">对 ${totalOk} · 错 ${totalWrong}</div>
      </div>
      <div class="b-tile b3 b-kpi" style="animation-delay:120ms">
        <div class="k">累计用时</div><div class="v"><span data-count="${totalMin}">0</span><small>分钟</small></div>
        <div class="mini">单题平均 ${avgSec}s</div>
      </div>
      <div class="b-tile b3 b-kpi" style="animation-delay:180ms">
        <div class="k">坚持天数</div><div class="v"><span data-count="${dayCount}">0</span><small>天</small></div>
        <div class="mini">单题中位 ${medianSec}s</div>
      </div>

      <div class="b-tile b4 b-r2" style="animation-delay:220ms">
        <div class="chart-title">正确率环<span>对错一目了然</span></div>
        ${totalScored ? donutSvg : '<div class="empty"><span class="big">还没有判分记录</span>做几道有标准答案的题吧</div>'}
      </div>
      <div class="b-tile b8" style="animation-delay:280ms">
        <div class="chart-title">模块正确率<span>只统计有标准答案的题</span></div>
        ${barsHtml || '<div class="empty"><span class="big">还没有作答记录</span>去刷几道题再来 Look 看板吧</div>'}
      </div>
      <div class="b-tile b8" style="animation-delay:340ms">
        <div class="chart-title">近 30 日练习趋势<span>每天做了多少题</span></div>
        ${trendSvg}
      </div>

      <div class="b-tile b4" style="animation-delay:400ms">
        <div class="chart-title">模块能力雷达<span>离满分的多边形</span></div>
        ${radarSvg}
      </div>
      <div class="b-tile b4" style="animation-delay:460ms">
        <div class="chart-title">模块题量玫瑰<span>花瓣越大刷得越多</span></div>
        ${roseSvg}
      </div>
      <div class="b-tile b4" style="animation-delay:520ms">
        <div class="chart-title">单题用时分布<span>平均 ${avgSec}s · 中位 ${medianSec}s</span></div>
        ${histSvg}
      </div>

      <div class="b-tile b12" style="animation-delay:580ms">
        <div class="chart-title">学习日历<span>颜色越深，当天练得越多</span></div>
        ${heatSvg}
      </div>
    </div>`;

    /* 触发入场动效：等首帧渲染完再落到目标值 */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w; });
      app.querySelectorAll('[data-dash]').forEach(el => { el.style.strokeDashoffset = el.dataset.dash; });
      app.querySelectorAll('[data-clipw]').forEach(el => { el.style.width = el.dataset.clipw + 'px'; });
      app.querySelectorAll('[data-count]').forEach(el => {
        countUp(el, parseFloat(el.dataset.count) || 0, 1200, v => Math.round(v).toString());
      });
    }));
  };
})(window.XC);
