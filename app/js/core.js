/* 核心工具层：DOM / API / 提示 / 弹层 / 主题 */
'use strict';
window.XC = window.XC || {};
(function (XC) {
  /* ---------- DOM ---------- */
  XC.$ = (s, el) => (el || document).querySelector(s);
  XC.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  XC.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  XC.h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  /* ---------- 图标（内联 SVG，随文字颜色） ---------- */
  const I = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.4"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.6H4z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.6H20z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L11 13M21 3l-6.5 18-3.5-8-8-3.5z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
  };
  XC.icon = n => I[n] || '';

  /* ---------- API ---------- */
  async function req(path, method, body, headers) {
    const opt = { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(path, opt);
    let j = null;
    try { j = await r.json(); } catch (e) { j = {}; }
    if (!r.ok) {
      const err = new Error(j.error || ('请求失败 ' + r.status));
      err.status = r.status; err.data = j;
      throw err;
    }
    return j;
  }
  XC.api = {
    get: p => req(p, 'GET'),
    post: (p, b, h) => req(p, 'POST', b, h),
    del: p => req(p, 'DELETE'),
  };

  /* ---------- 图片压缩（手机照片动辄 3–8MB，先缩到 1600px / JPEG） ---------- */
  XC.compressImage = function (file, opts) {
    const o = Object.assign({ max: 1600, quality: 0.82, mime: 'image/jpeg' }, opts || {});
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onerror = () => reject(new Error('图片读取失败'));
      rd.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('这张图片浏览器解不开（如 HEIC），换 JPG/PNG 试试'));
        img.onload = () => {
          try {
            let w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, o.max / Math.max(w, h));
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);   // 透明 PNG 转 JPEG 垫白底
            g.drawImage(img, 0, 0, w, h);
            let url = c.toDataURL(o.mime, o.quality);
            if (url.length > 700 * 1024) url = c.toDataURL(o.mime, 0.62);
            resolve({ dataUrl: url, width: w, height: h, kb: Math.round(url.length * 0.75 / 1024) });
          } catch (e) { reject(new Error('图片压缩失败')); }
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  };

  /* ---------- 提示 ---------- */
  XC.toast = function (msg, kind) {
    const wrap = XC.$('#toast-wrap');
    const el = XC.h(`<div class="toast ${kind || ''}"><span class="dot"></span><span>${XC.esc(msg)}</span></div>`);
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 280);
    }, 2200);
  };

  // 积分飘字（在某个元素上方）
  XC.floatGain = function (text, anchor) {
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, top: 120, width: 0 };
    const el = XC.h(`<div class="float-gain">${XC.esc(text)}</div>`);
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = r.top + 'px';
    el.style.transform = 'translateX(-50%)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  };

  /* ---------- 弹层 ---------- */
  const overlay = () => XC.$('#overlay');
  XC.closeSheet = function () {
    const o = overlay();
    o.hidden = true;
    o.innerHTML = '';
  };
  XC.sheet = function (opts) {
    const o = overlay();
    const actions = (opts.actions || []).map((a, i) =>
      `<button class="btn ${a.kind || 'btn-ghost'}" data-i="${i}">${XC.esc(a.label)}</button>`).join('');
    o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      ${opts.title ? `<h2>${XC.esc(opts.title)}</h2>` : ''}
      ${opts.sub ? `<p class="sub">${opts.sub}</p>` : ''}
      <div class="sheet-body">${opts.body || ''}</div>
      ${actions ? `<div class="sheet-actions">${actions}</div>` : ''}
    </div>`;
    o.hidden = false;
    const panel = XC.$('.sheet', o);
    (opts.actions || []).forEach((a, i) => {
      XC.$(`[data-i="${i}"]`, panel).onclick = async () => {
        if (a.onClick) {
          const keep = await a.onClick(panel);
          if (keep) return;
        }
        if (a.close !== false) XC.closeSheet();
      };
    });
    if (opts.onMount) opts.onMount(panel);
    return panel;
  };
  XC.confirm = function (title, sub, okLabel, kind) {
    return new Promise(resolve => {
      XC.sheet({
        title, sub,
        actions: [
          { label: '取消', kind: 'btn-ghost', onClick: () => resolve(false) },
          { label: okLabel || '确定', kind: kind || 'btn-primary', onClick: () => resolve(true) },
        ],
        onMount: p => { },
      });
    });
  };

  /* ---------- 主题 ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  XC.applyTheme = function (pref) {
    const resolved = pref === 'auto' ? (mq.matches ? 'dark' : 'light') : (pref === 'dark' ? 'dark' : 'light');
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#131210' : '#f3f0e8');
  };
  mq.addEventListener('change', () => {
    if (window.XC.S && XC.S.user) XC.applyTheme(XC.S.user.settings.theme || 'auto');
  });

  /* ---------- 格式化 ---------- */
  XC.n = n => (Math.round(n || 0)).toLocaleString('zh-CN');
  XC.pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  XC.ms = function (ms) {
    if (!ms || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + ' 秒';
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} 分 ${r} 秒` : `${m} 分`;
  };
  XC.dateStr = function (ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  XC.relTime = function (ts) {
    if (!ts) return '—';
    const d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 86400000 * 30) return Math.floor(d / 86400000) + ' 天前';
    return XC.dateStr(ts);
  };

  /* ---------- 环形进度 ---------- */
  XC.ring = function (pct, size) {
    const s = size || 46, r = (s - 6) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return `<div class="ring" style="width:${s}px;height:${s}px">
      <svg viewBox="0 0 ${s} ${s}"><circle class="track" cx="${s / 2}" cy="${s / 2}" r="${r}"/>
      <circle class="fill" cx="${s / 2}" cy="${s / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>
      <span class="pct">${pct}%</span></div>`;
  };

  /* ---------- 图片灯箱 ---------- */
  document.addEventListener('click', e => {
    const img = e.target.closest('.qstem img, .opt img, .analysis img, .material-body img, .sheet-body img');
    if (img) {
      const lb = XC.$('#lightbox');
      XC.$('#lightbox-img').src = img.src;
      lb.hidden = false;
      e.stopPropagation();
      return;
    }
    const lb = XC.$('#lightbox');
    if (lb && !lb.hidden) lb.hidden = true;
  });
})(window.XC);
