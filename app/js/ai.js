/* AI 助教：悬浮窗 + 多轮流式对话（换题自动清空记忆） */
'use strict';
(function (XC) {
  const S = { mounted: false, open: false, msgs: [], busy: false, info: null, abort: null };

  function resolvedMode() {
    const u = XC.S.user, cfg = XC.S.config;
    if (!u || !cfg || !cfg.ai) return 'off';
    return u.settings.aiMode === 'inherit' ? (cfg.ai.mode || 'builtin') : (u.settings.aiMode || 'inherit');
  }
  function canUse() { return resolvedMode() !== 'off'; }

  function mount() {
    if (S.mounted) return;
    S.mounted = true;
    document.body.insertAdjacentHTML('beforeend', `
      <button id="ai-fab" hidden title="AI 助教"><span class="fab-ic">${XC.icon('spark')}</span><span class="fab-t">问 AI</span></button>
      <div id="ai-panel" hidden role="dialog" aria-label="AI 助教">
        <div class="ai-head">
          <span class="ai-ttl">${XC.icon('spark')} AI 助教</span>
          <span class="ai-sub">只记得本题的对话</span>
          <button class="ai-hbtn" id="ai-clear" title="清空对话">${XC.icon('trash')}</button>
          <button class="ai-hbtn" id="ai-close" title="收起">${XC.icon('close')}</button>
        </div>
        <div class="ai-msgs" id="ai-msgs"></div>
        <div class="ai-quick" id="ai-quick"></div>
        <div class="ai-input">
          <textarea id="ai-text" rows="1" placeholder="问点什么，比如“这类题怎么做”"></textarea>
          <button class="ai-send" id="ai-send" title="发送">${XC.icon('send')}</button>
        </div>
      </div>`);
    const fab = XC.$('#ai-fab');
    restoreFabPos(fab);
    bindFabDrag(fab);
    XC.$('#ai-close').onclick = () => toggle(false);
    XC.$('#ai-clear').onclick = () => { if (!S.busy && S.msgs.length) { S.msgs = []; paintMsgs(); } };
    const ta = XC.$('#ai-text');
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(96, ta.scrollHeight) + 'px'; });
    XC.$('#ai-send').onclick = () => send();
  }

  function toggle(open) {
    S.open = open;
    XC.$('#ai-panel').hidden = !open;
    XC.$('#ai-fab').classList.toggle('active', open);
    if (open) {
      paintMsgs();
      setTimeout(() => XC.$('#ai-text').focus(), 60);
    }
  }

  /* ---------- 悬浮球拖动 ---------- */
  const FAB_POS_KEY = 'xingce_ai_fab_v1';
  function restoreFabPos(fab) {
    try {
      const p = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
      if (p && typeof p.left === 'number' && typeof p.top === 'number') {
        fab.classList.add('dragged');
        fab.style.left = clampFab(p.left, fab.offsetWidth || 96, innerWidth) + 'px';
        fab.style.top = clampFab(p.top, fab.offsetHeight || 44, innerHeight) + 'px';
      }
    } catch (e) { /* 忽略坏数据 */ }
  }
  function clampFab(v, size, total) { return Math.min(Math.max(4, v), Math.max(4, total - size - 4)); }
  function saveFabPos(fab) {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({
        left: parseFloat(fab.style.left) || 0,
        top: parseFloat(fab.style.top) || 0,
      }));
    } catch (e) { /* 隐私模式等 */ }
  }
  function bindFabDrag(fab) {
    let drag = null;
    fab.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = fab.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
      try { fab.setPointerCapture(e.pointerId); } catch (err) { /* 部分浏览器 */ }
    });
    fab.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return; // 小于 6px 视为点击
      drag.moved = true;
      fab.classList.add('dragged', 'dragging');
      fab.style.left = clampFab(drag.ox + dx, fab.offsetWidth, innerWidth) + 'px';
      fab.style.top = clampFab(drag.oy + dy, fab.offsetHeight, innerHeight) + 'px';
    });
    const end = e => {
      if (!drag) return;
      const wasDrag = drag.moved;
      fab.classList.remove('dragging');
      drag = null;
      if (wasDrag) { saveFabPos(fab); return; }
      toggle(true); // 未移动 → 当作点击展开
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', () => { fab.classList.remove('dragging'); drag = null; });
  }

  /* 快捷提问 */
  const QUICK = ['这道题的思路是什么？', '有什么快解技巧？', '我选错了，帮我分析', '这类题的常见陷阱？'];
  function paintQuick() {
    const box = XC.$('#ai-quick');
    box.innerHTML = QUICK.map(q => `<button class="ai-q" data-q="${XC.esc(q)}">${XC.esc(q)}</button>`).join('');
    box.querySelectorAll('.ai-q').forEach(b => b.onclick = () => { XC.$('#ai-text').value = b.dataset.q; send(); });
  }

  function bubble(role, text, streaming) {
    const el = document.createElement('div');
    el.className = 'ai-msg ' + role;
    const av = role === 'user'
      ? `<div class="ai-av me">${XC.esc(((XC.S.user.settings.title || XC.S.user.name) || '我').slice(0, 1))}</div>`
      : `<div class="ai-av">${XC.icon('spark')}</div>`;
    el.innerHTML = `${av}<div class="ai-bubble"></div>`;
    el.querySelector('.ai-bubble').textContent = text || '';
    if (streaming) el.querySelector('.ai-bubble').classList.add('streaming');
    XC.$('#ai-msgs').appendChild(el);
    scrollBottom();
    return el.querySelector('.ai-bubble');
  }
  function scrollBottom() {
    const m = XC.$('#ai-msgs');
    m.scrollTop = m.scrollHeight;
  }
  function paintMsgs() {
    const m = XC.$('#ai-msgs');
    m.innerHTML = '';
    if (!S.msgs.length) {
      m.innerHTML = `<div class="ai-empty">${XC.icon('spark')}<p>你好，我是行测助教。</p><p>可以问我这道题的思路、技巧或陷阱${S.info && S.info.answered ? '，你已作答，我可以对照解析讲解' : ''}。</p></div>`;
      paintQuick();
      return;
    }
    for (const x of S.msgs) bubble(x.role, x.content);
    XC.$('#ai-quick').innerHTML = '';
  }

  /* 换题同步：题目变了就清空对话（换题记忆清零） */
  XC.aiSync = function (info) {
    mount();
    const ok = canUse() && !!info.qid;
    XC.$('#ai-fab').hidden = !ok;
    if (!ok) { XC.$('#ai-panel').hidden = true; S.open = false; return; }
    if (!S.info || S.info.qid !== info.qid || S.info.pid !== info.pid) {
      S.msgs = [];                       // 换题清零
      if (S.abort) { try { S.abort.abort(); } catch (e) {} S.abort = null; S.busy = false; }
    }
    S.info = info;
    if (S.open) paintMsgs();
  };

  function buildContext() {
    const i = S.info || {};
    const ctx = { moduleName: i.moduleName, tag: i.tag, stem: i.stem, material: i.material, options: i.options };
    const allowCtx = !!(XC.S.config.ai && XC.S.config.ai.allowAnswerContext);
    if (i.answered && allowCtx) { ctx.answer = i.answer; ctx.analysis = i.analysis; }
    return ctx;
  }

  async function send() {
    if (S.busy) return;
    const ta = XC.$('#ai-text');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = ''; ta.style.height = 'auto';

    if (!S.msgs.length) XC.$('#ai-quick').innerHTML = '';
    S.msgs.push({ role: 'user', content: text });
    bubble('user', text);

    S.busy = true;
    const b = bubble('assistant', '', true);
    S.abort = new AbortController();
    let acc = '';
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', signal: S.abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: XC.S.uid, messages: S.msgs.slice(0, -1).concat([{ role: 'user', content: text }]), context: buildContext() }),
      });
      if (!res.ok) {
        let msg = '请求失败 ' + res.status;
        try { msg = (await res.json()).error || msg; } catch (e) {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            if (j.error) throw new Error(j.error);
            const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (piece) { acc += piece; b.textContent = acc; scrollBottom(); }
          } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
        }
      }
      if (!acc.trim()) throw new Error('模型没有返回内容');
      S.msgs.push({ role: 'assistant', content: acc });
    } catch (e) {
      if (e.name === 'AbortError') {
        if (acc) S.msgs.push({ role: 'assistant', content: acc });
        b.classList.remove('streaming');
      } else {
        b.textContent = '⚠ ' + e.message;
        b.closest('.ai-msg').classList.add('err');
      }
    } finally {
      b.classList.remove('streaming');
      S.busy = false;
      S.abort = null;
      scrollBottom();
    }
  }
})(window.XC);
