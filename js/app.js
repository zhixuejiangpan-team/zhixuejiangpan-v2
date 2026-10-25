/* ============================================================
   智行江畔 V9.0 —— 主逻辑
   模块：滚动叙事 | 光标/视差/磁吸 | 侧边栏/设置 | 搜索×AI | 力导图(物理)
         | 地图 | 数字孪生 | 问卷(34/109) | 指南 | 彩蛋 | 数据/KB/学习/音效
   红线：AI 安全链路完整保留（AIService）；64 点位；zxsj66_ 键约定；
        全局唯一 RAF（仅 3D 查看器持有一个）；低端机降级。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 环境判定 ---------- */
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var FINE = false;
  try { FINE = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) {}
  var MOBILE = false;
  try { MOBILE = window.matchMedia && window.matchMedia('(max-width: 768px)').matches; } catch (e) {}
  var LOWEND = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

  function cssVar(name, fb) { var v = ''; try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {} return v || fb; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- Toast ---------- */
  var toastEl = document.createElement('div');
  toastEl.className = 'app-toast'; toastEl.hidden = true; document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600); }
  window.__toast = toast;

  /* ---------- 存储与投票 ---------- */
  var LS = { votes: 'zxsj66_votes', voted: 'zxsj66_voted', counts: 'zxsj66_counts', hist: 'zxsj66_hist' };
  var voteMap = load(LS.votes, {}), votedSet = load(LS.voted, []), countMap = load(LS.counts, {});
  function getVotes(id) { return voteMap[id] || 0; }
  function getCount(qid) { return countMap[qid] || 0; }
  function findSpot(id) {
    for (var i = 0; i < spots.length; i++) if (spots[i].id === id) return spots[i];
    for (var j = 0; j < surroundingSpots.length; j++) if (surroundingSpots[j].id === id) return surroundingSpots[j];
    return null;
  }
  function castVote(id) {
    if (votedSet.indexOf(id) !== -1) return false;
    votedSet.push(id); voteMap[id] = getVotes(id) + 1;
    save(LS.votes, voteMap); save(LS.voted, votedSet);
    document.dispatchEvent(new Event('votesUpdated'));
    return true;
  }
  function decryptB64(s) {
    try { var b = atob(s), bytes = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); return new TextDecoder('utf-8').decode(bytes); }
    catch (e) { return '（答案解析失败）'; }
  }
  function hitSensitiveKey(q) { q = q || ''; for (var i = 0; i < SENSITIVE_KEY.length; i++) if (q.indexOf(SENSITIVE_KEY[i]) !== -1) return true; return false; }
  function displayAnswer(item, query) { return item.isSensitive ? (hitSensitiveKey(query) ? decryptB64(item.answer) : '') : item.answer; }

  var TYPE_COLOR = { '食堂': '#E0953F', '商店': '#5E86D8', '医疗': '#46B27A', '教学楼': '#8A6FD1', '宿舍': '#B08A5E', '体育': '#3FA8B4', '行政': '#D65A72', '饭店': '#E0953F', '学院': '#5E86D8', '场馆': '#3FA8B4', '其他': '#7A6A55' };

  /* ================= 滚动叙事引擎 ================= */
  var SECTIONS = (window.NARRATIVE_CONFIG && window.NARRATIVE_CONFIG.sections) || ['ask', 'map', 'twin', 'guide'];
  var snap = document.getElementById('snap');
  var transit = document.getElementById('transit');
  var activeSec = 'ask';
  var pageLock = 0;

  function sectionEl(name) { return document.getElementById('sec-' + name); }
  function secIndex(name) { var i = SECTIONS.indexOf(name); return i === -1 ? 0 : i; }

  function playTransit() {
    if (RM || !transit) return;
    transit.classList.remove('play'); void transit.offsetWidth; transit.classList.add('play');
    setTimeout(function () { transit.classList.remove('play'); }, 600);
  }
  function goTo(name, animate) {
    var el = sectionEl(name);
    if (!el) return;
    try { el.scrollIntoView({ behavior: (animate === false || RM) ? 'auto' : 'smooth', block: 'start' }); }
    catch (e) { snap.scrollTop = el.offsetTop; }
  }
  function page(dir) {
    var i = Math.max(0, Math.min(SECTIONS.length - 1, secIndex(activeSec) + dir));
    var target = SECTIONS[i];
    if (target !== activeSec) playTransit();
    goTo(target);
    if (window.__sfx) window.__sfx.play('view');
  }
  window.goTo = goTo;
  window.page = page;

  /* 内部可滚动区判定（供滚轮分页优先让内层滚动） */
  function innerScrollable(el) {
    var n = el;
    while (n && n !== snap && n !== document.body && n !== document.documentElement) {
      var oy = getComputedStyle(n).overflowY;
      if (n.scrollHeight > n.clientHeight + 4 && (oy === 'auto' || oy === 'scroll')) return n;
      n = n.parentElement;
    }
    return null;
  }

  /* 滚轮分页（桌面） */
  if (FINE && !RM && snap) {
    snap.addEventListener('wheel', function (e) {
      if (MOBILE) return;
      /* 地图段 Ctrl+滚轮 = 缩放 */
      if (activeSec === 'map' && (e.ctrlKey || e.metaKey)) {
        if (window.MapModule && window.MapModule.getMap()) { e.preventDefault(); e.deltaY < 0 ? window.MapModule.getMap().zoomIn() : window.MapModule.getMap().zoomOut(); }
        return;
      }
      /* 内层滚动区优先 */
      var sc = innerScrollable(e.target);
      if (sc) {
        var down = e.deltaY > 0;
        var can = down ? (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4) : (sc.scrollTop > 4);
        if (can) return;
      }
      e.preventDefault();
      var now = Date.now();
      if (now < pageLock) return;
      pageLock = now + 850;
      page(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }
  /* 键盘翻页 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); page(1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); page(-1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(SECTIONS[0]); }
    else if (e.key === 'End') { e.preventDefault(); goTo(SECTIONS[SECTIONS.length - 1]); }
  });

  /* 段落激活检测 + 引擎挂起/恢复 */
  var secObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var name = en.target.getAttribute('data-sec');
      if (name === activeSec) return;
      activeSec = name;
      syncNav();
      onSectionChange(name);
    });
  }, { root: snap, threshold: 0.55 });
  SECTIONS.forEach(function (n) { var el = sectionEl(n); if (el) secObserver.observe(el); });

  function onSectionChange(name) {
    if (window.ShardArt) window.ShardArt.apply(name);   /* 碎片重组：每段一次多边形变形 */
    if (name === 'map') { MapModule.enter(); MapModule.onActive(true); if (window.ZXSJ.Scene) window.ZXSJ.Scene.setMapActive(true); }
    else { MapModule.onActive(false); if (window.ZXSJ.Scene) window.ZXSJ.Scene.setMapActive(false); }
    if (name === 'ask') GraphModule.ensure();
    if (name === 'twin') { TwinModule.enter(); if (window.ZXSJ.Scene) window.ZXSJ.Scene.setTwinActive(true); }
    else { TwinModule.leave(); if (window.ZXSJ.Scene) window.ZXSJ.Scene.setTwinActive(false); }
  }

  /* 侧边栏/圆点导航高亮 */
  function syncNav() {
    document.querySelectorAll('.snav[data-nav]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-nav') === activeSec); });
    if (window.__renderDotnav) window.__renderDotnav();
  }

  /* ================= 光标 / 视差 / 磁吸 ================= */
  var cursor = document.getElementById('cursor'), cursorDot = document.getElementById('cursorDot');
  var mouseX = innerWidth / 2, mouseY = innerHeight / 2;
  var cX = mouseX, cY = mouseY;
  if (FINE && cursor) {
    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX; mouseY = e.clientY;
      cursorDot.style.left = mouseX + 'px'; cursorDot.style.top = mouseY + 'px';
      var t = e.target && e.target.closest ? e.target.closest('a, button, .chip, .snav, .tab, input, .drawer-item, .hot-item, [data-loc], .theme-opt') : null;
      cursor.classList.toggle('is-link', !!t);
      /* 视差：背景形状按深度随鼠标偏移 */
      if (!RM) parallax(e.clientX, e.clientY);
    });
    document.addEventListener('mouseleave', function () { cursor.classList.add('is-hidden'); cursorDot.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { cursor.classList.remove('is-hidden'); cursorDot.classList.remove('is-hidden'); });
    (function cursorLoop() {
      cX += (mouseX - cX) * 0.18; cY += (mouseY - cY) * 0.18;
      cursor.style.left = cX + 'px'; cursor.style.top = cY + 'px';
      if (ScribbleBurst) ScribbleBurst.draw(performance.now());
      requestAnimationFrame(cursorLoop);
    })();
    /* 磁吸：悬停形变（按钮/贴纸） */
    document.addEventListener('mouseover', function (e) {
      var b = e.target.closest && e.target.closest('.btn, .chip, .snav, .tab, .theme-opt, .drawer-item, .hot-item');
      if (!b || b.__mag) return;
      b.__mag = 1;
      b.addEventListener('mousemove', function (ev) {
        if (RM) return;
        var r = b.getBoundingClientRect();
        var dx = (ev.clientX - r.left - r.width / 2) / (r.width / 2);
        var dy = (ev.clientY - r.top - r.height / 2) / (r.height / 2);
        b.style.transform = 'translate(' + (dx * 5).toFixed(1) + 'px,' + (dy * 5).toFixed(1) + 'px)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }
  function parallax(cx, cy) {
    var nx = cx / innerWidth - 0.5, ny = cy / innerHeight - 0.5;
    document.querySelectorAll('.bg-layer [data-depth]').forEach(function (el) {
      var d = parseFloat(el.getAttribute('data-depth')) || 0.5;
      el.style.transform = 'translate(' + (nx * 40 * d).toFixed(1) + 'px,' + (ny * 40 * d).toFixed(1) + 'px)';
    });
  }

  /* ================= 多边形碎片艺术（参考 species-in-pieces.com） =================
     CSS clip-path 三角形碎片层：每切换一段，全部碎片重排/变色/变透明，
     CSS transition 完成「碎片重组」变形——参考站点的 shard-shifting 技法。 */
  var ShardArt = (function () {
    var COUNT = 16, host = document.getElementById('bgShapes'), shards = [];
    var ACCENTS = ['--accent', '--accent-2', '--accent-3', '--accent-4'];
    function seeded(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h |= 0; h = h + 0x6D2B79F5 | 0; var t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function build() {
      if (!host) return;
      host.innerHTML = '';
      for (var i = 0; i < COUNT; i++) {
        var el = document.createElement('div');
        el.className = 'bg-shard';
        el.style.setProperty('--shard-i', i);
        host.appendChild(el);
        shards.push(el);
      }
      apply(activeSec);
    }
    function apply(section) {
      if (!shards.length) return;
      var rnd = seeded(section || 'ask');
      shards.forEach(function (el, i) {
        var p1 = [rnd() * 100, rnd() * 100], p2 = [p1[0] + 8 + rnd() * 22, p1[1] - 10 - rnd() * 16], p3 = [p1[0] - 6 + rnd() * 20, p1[1] + 8 + rnd() * 20];
        el.style.clipPath = 'polygon(' + p1[0].toFixed(1) + '% ' + p1[1].toFixed(1) + '%, ' + p2[0].toFixed(1) + '% ' + p2[1].toFixed(1) + '%, ' + p3[0].toFixed(1) + '% ' + p3[1].toFixed(1) + '%)';
        el.style.left = (rnd() * 100).toFixed(1) + '%';
        el.style.top = (rnd() * 100).toFixed(1) + '%';
        el.style.setProperty('--shard-c', 'var(' + ACCENTS[i % 4] + ')');
        el.style.opacity = (0.10 + rnd() * 0.16).toFixed(2);
        el.style.transform = 'rotate(' + Math.round(rnd() * 360) + 'deg)';
      });
    }
    document.addEventListener('zxsj66:theme-change', function () { /* 碎片颜色自动随 CSS 变量换肤 */ });
    build();
    return { apply: apply };
  })();
  window.ShardArt = ShardArt;

  /* ================= 涂鸦爆点（参考 2019.makemepulse.com） =================
     点击任意处喷出几笔彩色涂鸦短线/星星，500ms 淡出；画进光标 RAF。 */
  var ScribbleBurst = (function () {
    var cv = null, ctx = null, bursts = [];
    function ensure() {
      if (cv) return;
      cv = document.createElement('canvas');
      cv.className = 'scribble-burst';
      document.body.appendChild(cv);
      function size() { cv.width = innerWidth * 1; cv.height = innerHeight * 1; }
      size(); window.addEventListener('resize', size);
      ctx = cv.getContext('2d');
    }
    function spawn(x, y) {
      if (!FINE || RM) return;
      ensure();
      var acc = [cssVar('--accent', '#FF3B5C'), cssVar('--accent-2', '#2E6BFF'), cssVar('--accent-3', '#FFB000'), cssVar('--accent-4', '#12A36B')];
      var s = { x: x, y: y, t: performance.now(), parts: [] };
      var n = 6 + Math.floor(Math.random() * 4);
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 26;
        s.parts.push({
          type: Math.random() < 0.3 ? 'star' : 'stroke',
          x0: x, y0: y,
          x1: x + Math.cos(a) * r, y1: y + Math.sin(a) * r,
          c: acc[i % 4], rot: Math.random() * Math.PI
        });
      }
      bursts.push(s);
      if (bursts.length > 12) bursts.shift();
    }
    function draw(now) {
      if (!bursts.length) return;
      ensure();
      ctx.clearRect(0, 0, cv.width, cv.height);
      bursts = bursts.filter(function (b) { return now - b.t < 520; });
      bursts.forEach(function (b) {
        var k = (now - b.t) / 520, alpha = 1 - k;
        b.parts.forEach(function (p) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = p.c; ctx.fillStyle = p.c; ctx.lineWidth = 3; ctx.lineCap = 'round';
          var mx = p.x0 + (p.x1 - p.x0) * k, my = p.y0 + (p.y1 - p.y0) * k;
          if (p.type === 'star') {
            ctx.save(); ctx.translate(mx, my); ctx.rotate(p.rot + k * 2);
            ctx.beginPath();
            for (var s2 = 0; s2 < 8; s2++) { var rr = s2 % 2 ? 3 : 7; var aa = s2 / 8 * Math.PI * 2; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
            ctx.closePath(); ctx.fill(); ctx.restore();
          } else {
            ctx.beginPath();
            ctx.moveTo(p.x0 + (p.x1 - p.x0) * Math.max(0, k - 0.15) * 1.2, p.y0 + (p.y1 - p.y0) * Math.max(0, k - 0.15) * 1.2);
            ctx.quadraticCurveTo(p.x0 + (p.x1 - p.x0) * 0.5 + (Math.random() - 0.5) * 8, p.y0 + (p.y1 - p.y0) * 0.5 + (Math.random() - 0.5) * 8, mx, my);
            ctx.stroke();
          }
        });
      });
      ctx.globalAlpha = 1;
    }
    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.v3d-overlay, .amap-marker, .map-dot, input, textarea')) return;
      spawn(e.clientX, e.clientY);
    });
    return { draw: draw, spawn: spawn };
  })();
  window.ScribbleBurst = ScribbleBurst;

  /* ================= 可拖拽涂鸦贴纸（makemepulse 式物理玩具） ================= */
  var DoodleStickers = (function () {
    function init() {
      var hero = document.querySelector('.ask-hero');
      if (!hero || MOBILE || !FINE) return;
      var glyphs = ['☀️', '★', '〜', '⚡'];
      var anchors = [['6%', '16%', -8], ['88%', '10%', 9], ['10%', '58%', 5], ['90%', '62%', -6]];
      glyphs.forEach(function (g, i) {
        var el = document.createElement('div');
        el.className = 'sticker';
        el.textContent = g;
        el.style.left = anchors[i][0]; el.style.top = anchors[i][1];
        hero.appendChild(el);
        var ax = anchors[i][2], ay = 0, px = 0, py = 0, drag = false;
        el.addEventListener('pointerdown', function (e) {
          drag = true; el.setPointerCapture && el.setPointerCapture(e.pointerId);
          el.classList.add('dragging');
          var r = el.getBoundingClientRect();
          px = e.clientX - r.left - r.width / 2; py = e.clientY - r.top - r.height / 2;
          e.preventDefault();
        });
        el.addEventListener('pointermove', function (e) {
          if (!drag) return;
          el.style.transform = 'translate(' + (e.clientX - px - el.offsetLeft - el.offsetWidth / 2) + 'px,' + (e.clientY - py - el.offsetTop - el.offsetHeight / 2) + 'px) rotate(' + ax * 6 + 'deg) scale(1.25)';
        });
        el.addEventListener('pointerup', function () { drag = false; el.classList.remove('dragging'); el.style.transform = 'translate(0,0) rotate(' + ax + 'deg)'; });
        el.addEventListener('pointercancel', function () { drag = false; el.classList.remove('dragging'); el.style.transform = 'translate(0,0) rotate(' + ax + 'deg)'; });
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return {};
  })();

  /* ================= 侧边栏 + 设置抽屉 ================= */
  document.querySelectorAll('.snav[data-nav]').forEach(function (b) {
    b.addEventListener('click', function () { var n = b.getAttribute('data-nav'); if (n !== activeSec) playTransit(); goTo(n); });
  });
  var settingsPanel = document.getElementById('settingsPanel');
  var settingsBackdrop = document.getElementById('settingsBackdrop');
  function openSettings() { settingsPanel.hidden = false; settingsBackdrop.hidden = false; requestAnimationFrame(function () { settingsPanel.classList.add('open'); }); renderSettingsDynamic(); }
  function closeSettings() { settingsPanel.classList.remove('open'); setTimeout(function () { settingsPanel.hidden = true; settingsBackdrop.hidden = true; }, 300); }
  document.querySelectorAll('.snav[data-open="settings"]').forEach(function (b) { b.addEventListener('click', openSettings); });
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);

  /* ================= 搜索 × AI（安全链路保留） ================= */
  var searchInput = document.getElementById('searchInput');
  var suggestBox = document.getElementById('suggestBox');
  var resultBox = document.getElementById('resultList');
  var hotBox = document.getElementById('hotList');
  var histBox = document.getElementById('historyChips');
  var AI = window.AIService;

  function questionOf(qid) { var it = hotQuestions.find(function (x) { return x.id === qid; }); return it ? it.question : ''; }
  function getHist() { return load(LS.hist, []); }
  function pushHist(q) {
    if (q.trim() === '蛟湖') { searchInput.value = ''; suggestBox.hidden = true; if (window.EasterModule) window.EasterModule.open('search'); return; }
    var h = getHist().filter(function (x) { return x !== q; }); h.unshift(q); h = h.slice(0, 10);
    save(LS.hist, h); renderHist(); renderMineHist();
  }
  function renderHist() {
    var h = getHist();
    histBox.innerHTML = h.length ? h.map(function (x) { return '<button class="chip hist-chip">' + esc(x) + '</button>'; }).join('') + '<button class="chip hist-clear" id="histClear">清空</button>' : '<span class="empty-tip">暂无搜索历史</span>';
    histBox.querySelectorAll('.hist-chip').forEach(function (c) { c.addEventListener('click', function () { searchInput.value = c.textContent; runSearch(c.textContent); }); });
    var clr = document.getElementById('histClear');
    if (clr) clr.addEventListener('click', function () { save(LS.hist, []); renderHist(); renderMineHist(); });
  }
  function matchQuestions(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    return hotQuestions.filter(function (item) { var text = (item.question + ' ' + item.category + ' ' + item.tags.join(' ')).toLowerCase(); return q.split(/\s+/).every(function (w) { return text.indexOf(w) !== -1; }); });
  }
  function renderResults(list, q) {
    if (!list.length) { resultBox.innerHTML = '<p class="empty-tip">没有匹配的问题，换个关键词试试，比如"医保""学生证""食堂"。</p>'; return; }
    resultBox.innerHTML = list.map(function (item) {
      var masked = item.isSensitive && !displayAnswer(item, q);
      var summary = masked ? '该问题涉及隐私，请输入关键词（如"心理""压力"）查看' : esc(displayAnswer(item, q)).slice(0, 80) + (displayAnswer(item, q).length > 80 ? '…' : '');
      var crossTag = item.campusScope === 'cross' ? '<span class="cross-tag" title="涉及跨校区办事">🔀 跨校区</span>' : '';
      return '<div class="result-item card" data-qid="' + item.id + '">' +
        '<h4>' + crossTag + esc(item.question) + '</h4><p class="result-summary">' + summary + '</p>' +
        '<div class="result-foot"><span class="cat-badge">' + esc(item.category) + '</span><span class="result-count">🔥 ' + getCount(item.id) + '</span></div>' +
        '<div class="result-detail" hidden></div></div>';
    }).join('');
  }
  function runSearch(q) {
    q = (q || '').trim(); if (!q) return;
    if (q === '蛟湖') { pushHist(q); return; }
    pushHist(q);
    renderResults(matchQuestions(q), q);
    if (window.__renderRelatedCards) window.__renderRelatedCards(q);
  }
  searchInput.addEventListener('input', function () { if (window.__renderSuggest) window.__renderSuggest(); });
  suggestBox.addEventListener('click', function (e) { if (window.__suggestClick) window.__suggestClick(e); });
  document.getElementById('searchBtn').addEventListener('click', function () { runSearch(searchInput.value); });
  searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { suggestBox.hidden = true; runSearch(searchInput.value); } });

  resultBox.addEventListener('click', function (e) {
    var card = e.target.closest('.result-item'); if (!card) return;
    var qid = card.getAttribute('data-qid'); var detail = card.querySelector('.result-detail');
    var wfb = e.target.closest('[data-wfgoto]'); if (wfb) { if (window.__gotoWorkflow) window.__gotoWorkflow(wfb.getAttribute('data-wfgoto')); return; }
    var loc = e.target.closest('[data-loc]'); if (loc) { MapModule.locate(loc.getAttribute('data-loc')); return; }
    if (!detail.hidden) { detail.hidden = true; return; }
    var item = hotQuestions.find(function (x) { return x.id === qid; });
    var q = searchInput.value;
    countMap[qid] = getCount(qid) + 1; save(LS.counts, countMap);
    var full = item.isSensitive && !hitSensitiveKey(q) ? '该问题涉及隐私，请输入关键词（如"心理""压力""失眠"）后重新搜索查看完整答案。' : esc(displayAnswer(item, q));
    var spotsHtml = item.relatedSpotIds.map(function (sid) { var sp = findSpot(sid); return sp ? '<button class="chip spot-jump" data-loc="' + sid + '">📍 ' + esc(sp.name) + '</button>' : ''; }).join('');
    detail.innerHTML = '<p class="detail-answer">' + full + '</p>' + (spotsHtml ? '<div class="detail-spots">相关点位：' + spotsHtml + '</div>' : '') + (window.__wfLinkButton ? window.__wfLinkButton(qid) : '');
    detail.hidden = false;
    card.querySelector('.result-count').textContent = '🔥 ' + getCount(qid);
    renderHot(); GraphModule.refreshSizes();
  });
  function renderHot() {
    var top = hotQuestions.slice().sort(function (a, b) { return getCount(b.id) - getCount(a.id); }).slice(0, 10);
    hotBox.innerHTML = top.map(function (item, i) {
      return '<div class="hot-item" data-qid="' + item.id + '">' +
        '<span class="hot-rank r' + (i < 3 ? i + 1 : 0) + '">' + (i + 1) + '</span>' +
        (item.campusScope === 'cross' ? '<span class="cross-tag">🔀</span>' : '') +
        '<span class="hot-q">' + esc(item.question) + '</span><span class="hot-c">🔥' + getCount(item.id) + '</span></div>';
    }).join('');
  }
  hotBox.addEventListener('click', function (e) { var it = e.target.closest('.hot-item'); if (!it) return; searchInput.value = questionOf(it.getAttribute('data-qid')); runSearch(searchInput.value); });
  document.addEventListener('votesUpdated', function () { renderHot(); renderMineVotes(); });

  /* ---------- AI 回答卡片 ---------- */
  var aiCard = document.createElement('div'); aiCard.className = 'card ai-card'; aiCard.id = 'aiCard'; aiCard.hidden = true;
  function aiState(state, payload) {
    aiCard.hidden = false;
    if (state === 'loading') aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-loading">正在咨询 AI（DeepSeek，通常 <30 秒）…</p>';
    else if (state === 'unconfigured') aiCard.innerHTML = '<div class="ai-head">🤖 AI 未配置</div><p class="ai-text">请启动本地代理（<code>node server.js</code>）并把 js/config.js 的 AI_CONFIG.PROXY_URL 改为 <code>http://localhost:3001/ai</code>。本地知识库搜索不受影响。</p>';
    else if (state === 'blocked') aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-text ai-safe">你提到了让自己或他人受伤的内容，我们非常重视。请立即联系：①辅导员或班主任；②学校心理健康教育与咨询中心；③全国24小时心理援助热线 <b>12356</b>。你并不孤单。</p>';
    else if (state === 'fail') aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-text">AI 服务暂不可用，已为您展示本地结果。</p>';
    else if (state === 'success') {
      var answer = payload.answer || '', spots = payload.spots || [], campus = payload.campus;
      var lines = answer.split('\n'), long = lines.length > 3;
      var spotBtns = spots.map(function (sp) { return '<button class="chip ai-spot" data-loc="' + sp.id + '">📍 ' + esc(sp.name) + '</button>'; }).join('');
      if (!spots.length && campus) spotBtns = '<button class="chip ai-spot" data-campus="' + campus + '">查看' + esc(campus) + '全部点位</button>';
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答' + (payload.mid ? '<span class="ai-mid-tag">已启用安全回答模式</span>' : '') + '</div>' +
        '<div class="ai-text' + (long ? ' ai-fold' : '') + '" id="aiAnswerText">' + esc(answer).replace(/\n/g, '<br>') + '</div>' +
        (long ? '<button class="ai-expand" id="aiExpand">展开全部 ▾</button>' : '') +
        (spotBtns ? '<div class="ai-spot-row">' + spotBtns + '</div>' : '') +
        (payload.localEmpty ? '<p class="ai-note">本地知识库无匹配，已为您咨询 AI</p>' : '');
      var exp = document.getElementById('aiExpand');
      if (exp) exp.addEventListener('click', function () { var t = document.getElementById('aiAnswerText'); t.classList.toggle('ai-fold'); exp.textContent = t.classList.contains('ai-fold') ? '展开全部 ▾' : '收起 ▴'; });
      var txtEl = document.getElementById('aiAnswerText');
      if (txtEl && !RM && answer.length) {
        var full = answer, stepN = Math.max(1, Math.ceil(full.length / 40)), ti = 0;
        txtEl.innerHTML = '<span class="ai-caret"></span>';
        var typeTimer = setInterval(function () {
          ti += stepN;
          if (ti >= full.length) { clearInterval(typeTimer); txtEl.innerHTML = esc(full).replace(/\n/g, '<br>') + '<span class="ai-caret"></span>'; setTimeout(function () { var c = txtEl.querySelector('.ai-caret'); if (c) c.remove(); }, 200); }
          else txtEl.innerHTML = esc(full.slice(0, ti)).replace(/\n/g, '<br>') + '<span class="ai-caret"></span>';
        }, 12);
      }
    }
    var anchor = document.getElementById('relatedWrap') || resultBox;
    anchor.parentNode.insertBefore(aiCard, anchor);
  }
  aiCard.addEventListener('click', function (e) {
    var btn = e.target.closest('.ai-spot'); if (!btn) return;
    if (!navigator.onLine) { toast('网络连接不可用，无法加载地图'); return; }
    var spotId = btn.getAttribute('data-loc'), campus = btn.getAttribute('data-campus');
    if (spotId) {
      var isSur = !!(window.surroundingSpots || []).find(function (s) { return s.id === spotId; });
      var cb = document.getElementById(isSur ? 'layerSur' : 'layerCampus');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
      setTimeout(function () { MapModule.locate(spotId); }, isSur ? 350 : 120);
    } else if (campus) {
      var cb2 = document.getElementById('layerCampus'); if (cb2 && !cb2.checked) { cb2.checked = true; cb2.dispatchEvent(new Event('change')); }
      goTo('map'); setTimeout(function () { MapModule.centerCampus(campus); }, 250);
    }
  });
  var aiTimer = null, lastQuery = '';
  function scheduleAI() { clearTimeout(aiTimer); aiTimer = setTimeout(runAI, 500); }
  function runAI() {
    var q = (searchInput.value || '').trim();
    if (q.length < 2 || q === lastQuery) return;
    lastQuery = q;
    if (AI.hitHighRisk(q)) { aiState('blocked'); return; }
    var cfg = window.AI_CONFIG || {};
    if (!cfg.API_KEY && !cfg.PROXY_URL) { aiState('unconfigured'); return; }
    if (AI.rateLimited()) { toast('请求过于频繁，请稍后再试'); return; }
    aiState('loading');
    var mid = AI.hitMidRisk(q);
    AI.callAI(q).then(function (answer) {
      var matched = AI.parseSpotsFromAnswer(answer);
      var campus = matched.length ? null : AI.parseCampusFromAnswer(answer);
      var localEmpty = !resultBox.querySelector('.result-item');
      aiState('success', { answer: answer, spots: matched, campus: campus, localEmpty: localEmpty, mid: !!mid });
    }).catch(function () { aiState('fail'); });
  }
  new MutationObserver(function () { scheduleAI(); }).observe(resultBox, { childList: true, subtree: false });

  var ctxBar = document.getElementById('aiContextBar');
  function refreshBar() { ctxBar.hidden = !(AI.loadHistory().length); }
  document.getElementById('aiContextGo').addEventListener('click', function () { searchInput.placeholder = '继续上次的对话…'; searchInput.focus(); });
  document.getElementById('aiContextClear').addEventListener('click', function () { AI.clearHistory(); searchInput.placeholder = '输入你的问题，如：补办学生证 / 医保报销 / 食堂'; refreshBar(); toast('对话历史已清除'); });
  var _saveHist = AI.saveHistory; AI.saveHistory = function (h) { _saveHist(h); refreshBar(); };
  refreshBar();

  /* ================= 力导向图谱（物理交互） ================= */
  var GraphModule = (function () {
    var inited = false, degraded = false, svg, simulation, nodeSel, linkSel, nodeG;
    var W = 0, H = 460;
    var mousePos = null;

    function selectNodes() {
      var isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (!isMobile) return hotQuestions.slice();
      var cross = hotQuestions.filter(function (q) { return q.campusScope === 'cross'; });
      var rest = hotQuestions.filter(function (q) { return q.campusScope !== 'cross'; }).sort(function (a, b) { return getCount(b.id) - getCount(a.id); });
      return cross.length >= 30 ? cross.slice(0, 30) : cross.concat(rest.slice(0, Math.max(0, 30 - cross.length)));
    }
    function buildLinks(nodes) {
      var links = [];
      for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
        var shared = nodes[i].item.relatedSpotIds.some(function (id) { return nodes[j].item.relatedSpotIds.indexOf(id) !== -1; });
        if (shared) links.push({ source: nodes[i].id, target: nodes[j].id });
      }
      return links;
    }
    function radius(item) { return Math.min(26, 8 + Math.sqrt(getCount(item.id)) * 2.2); }
    function opacityOf(item) { if (item.campusScope === 'cross') return 1; var c = getCount(item.id); return c === 0 ? 0.45 : Math.min(1, 0.55 + c / 40); }
    function truncate(s) { return s.length > 9 ? s.slice(0, 9) + '…' : s; }

    function renderGraph() {
      var wrap = document.getElementById('graphWrap');
      W = wrap.clientWidth || 560; H = 460;
      wrap.innerHTML = '<svg id="graphSvg" width="100%" height="' + H + '"></svg><div id="graphCard" hidden></div>';
      var nodes = selectNodes().map(function (q) { return { id: q.id, item: q }; });
      var links = buildLinks(nodes);
      svg = d3.select('#graphSvg');
      var gRoot = svg.append('g');
      svg.call(d3.zoom().scaleExtent([0.5, 3]).on('zoom', function (ev) { gRoot.attr('transform', ev.transform); }));
      linkSel = gRoot.append('g').selectAll('line').data(links).enter().append('line').attr('stroke-width', 1);
      nodeG = gRoot.append('g').selectAll('g').data(nodes).enter().append('g').style('cursor', 'grab').on('click', function (ev, d) { showCard(d.item, ev); });
      nodeSel = nodeG.append('circle')
        .attr('r', function (d) { return radius(d.item); })
        .attr('fill', function (d) { return d.item.isSensitive ? cssVar('--ink-2', '#86868B') : cssVar('--accent', '#FF3B5C'); })
        .attr('stroke', function (d) { return d.item.campusScope === 'cross' ? cssVar('--accent-3', '#FFB000') : cssVar('--bg', '#FBF3E1'); })
        .attr('stroke-width', function (d) { return d.item.campusScope === 'cross' ? 3 : 1.5; })
        .attr('opacity', function (d) { return opacityOf(d.item); });
      nodeG.append('text').text(function (d) { return truncate(d.item.question); }).attr('font-size', 10).attr('dy', function (d) { return radius(d.item) + 12; }).attr('text-anchor', 'middle');

      simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-170))
        .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(90))
        .force('collide', d3.forceCollide(function (d) { return radius(d.item) + 14; }).strength(1))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('mouse', function (alpha) {
          if (!mousePos) return;
          nodes.forEach(function (n) {
            var dx = n.x - mousePos.x, dy = n.y - mousePos.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 120 && d > 0.01) { var f = (120 - d) / 120 * 26 * alpha; n.vx += dx / d * f; n.vy += dy / d * f; }
          });
        })
        .on('tick', function () {
          linkSel.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; }).attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
          nodeG.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        });

      /* 拖拽 + 碰撞回弹 */
      nodeG.call(d3.drag()
        .on('start', function (ev, d) { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function (ev, d) { d.fx = ev.x; d.fy = ev.y; })
        .on('end', function (ev, d) { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      /* 鼠标扰动：光标靠近推开节点 */
      svg.on('mousemove', function (ev) {
        var rect = document.getElementById('graphSvg').getBoundingClientRect();
        var t = d3.zoomTransform(gRoot.node());
        mousePos = { x: (ev.clientX - rect.left - t.x) / t.k, y: (ev.clientY - rect.top - t.y) / t.k };
      });
      svg.on('mouseleave', function () { mousePos = null; });

      var frames = 0, t0 = performance.now();
      function fpsProbe() { frames++; if (frames < 90) requestAnimationFrame(fpsProbe); else { var fps = frames / ((performance.now() - t0) / 1000); if (fps < 30 && !degraded) { degraded = true; renderList(); } } }
      requestAnimationFrame(fpsProbe);
    }
    function renderList() {
      var wrap = document.getElementById('graphWrap');
      var nodes = selectNodes();
      wrap.innerHTML = '<div class="graph-list"><p class="graph-note">检测到设备帧率较低，已切换为列表模式：</p>' + nodes.map(function (q) { return '<div class="graph-list-item" data-qid="' + q.id + '">' + (q.campusScope === 'cross' ? '🔀 ' : '') + esc(q.question) + '</div>'; }).join('') + '<div id="graphCard" hidden></div></div>';
      wrap.querySelectorAll('.graph-list-item').forEach(function (el) { el.addEventListener('click', function (ev) { var q = hotQuestions.find(function (x) { return x.id === el.getAttribute('data-qid'); }); showCard(q, { clientX: ev.clientX, clientY: ev.clientY }); }); });
    }
    function showCard(item, ev) {
      var card = document.getElementById('graphCard');
      var wrapRect = document.getElementById('graphWrap').getBoundingClientRect();
      var x = (ev.clientX || 0) - wrapRect.left + 12, y = (ev.clientY || 0) - wrapRect.top + 12;
      x = Math.min(x, wrapRect.width - 260); y = Math.min(y, wrapRect.height - 180);
      card.style.left = Math.max(4, x) + 'px'; card.style.top = Math.max(4, y) + 'px';
      var ans = item.isSensitive ? '该问题涉及隐私，请到搜索框输入关键词后查看。' : esc(displayAnswer(item, searchInput.value)).slice(0, 140) + '…';
      card.innerHTML = '<button class="card-x" id="cardX">✕</button><h5>' + (item.campusScope === 'cross' ? '🔀 ' : '') + esc(item.question) + '</h5><p>' + ans + '</p><div class="detail-spots">' + item.relatedSpotIds.map(function (sid) { var sp = findSpot(sid); return sp ? '<button class="chip" data-loc="' + sid + '">' + esc(sp.name) + '</button>' : ''; }).join('') + '</div>';
      card.hidden = false;
      card.querySelectorAll('[data-loc]').forEach(function (b) { b.addEventListener('click', function () { MapModule.locate(b.getAttribute('data-loc')); }); });
      document.getElementById('cardX').addEventListener('click', function () { card.hidden = true; });
    }
    return {
      ensure: function () {
        if (inited || typeof d3 === 'undefined') return;
        inited = true;
        try { if (window.matchMedia('(max-width: 768px)').matches && degraded) renderList(); else renderGraph(); }
        catch (err) { document.getElementById('graphWrap').innerHTML = '<p class="empty-tip">图谱渲染失败：' + esc(err.message) + '</p>'; }
      },
      refreshSizes: function () {
        if (!inited || degraded || !nodeSel) return;
        nodeSel.transition().duration(300).attr('r', function (d) { return radius(d.item); }).attr('opacity', function (d) { return opacityOf(d.item); });
      }
    };
  })();

  /* ================= 地图（高德 JS API 2.0 + Loca 2.0） ================= */
  var MapModule = (function () {
    var map = null, inited = false, campusMarkers = [], surMarkers = [], overlays = [];
    var state = { layerCampus: true, layerSur: false, walking: null };
    /* Loca 2.0：全局唯一 Container 仅挂主地图（孪生四小地图不挂 Loca） */
    var loca = null, locaReady = false, bands = {}, linkLayer = null;
    var bandTextures = {}, bandTimer = null, mapActive = false;
    var linkOn = load('zxsj66_linklayer_on', true);
    var bandColors = { green: cssVar('--twin-green', '#12A36B'), yellow: cssVar('--twin-yellow', '#FFB000'), red: cssVar('--twin-red', '#FF3B5C') };

    function hexToRgba(hex, a) {
      try {
        var h = String(hex).replace('#', '');
        var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
      } catch (e) { return 'rgba(200,200,200,' + a + ')'; }
    }
    /* 呼吸帧序列纹理：32 帧 128×128（与官方 breath_* 图同规格 4096×128） */
    function breathTexture(hex) {
      var FRAMES = 32, CELL = 128;
      try {
        var c = document.createElement('canvas');
        c.width = CELL * FRAMES; c.height = CELL;
        var ctx = c.getContext('2d');
        for (var f = 0; f < FRAMES; f++) {
          var t = f / FRAMES * Math.PI * 2;
          var r = CELL * (0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t)));
          var cx = f * CELL + CELL / 2, cy = CELL / 2;
          var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(0.4, hexToRgba(hex, 0.9));
          g.addColorStop(1, hexToRgba(hex, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
        return c.toDataURL('image/png');
      } catch (e) { return null; }
    }
    function crowdBand(level) { return level <= 60 ? 'green' : (level <= 85 ? 'yellow' : 'red'); }
    /* ScatterLayer 三色贴地呼吸点：60%/85% 阈值分带；呼吸频率随带内平均拥挤度 0.5–1.5Hz */
    function refreshBands() {
      if (!locaReady || !map || !state.layerCampus) return;
      var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      var groups = { green: [], yellow: [], red: [] };
      spots.forEach(function (sp) {
        var r = window.ZXSJ.DataSource.getCrowd(sp.id, nowMin);
        groups[crowdBand(r.level)].push(sp);
      });
      Object.keys(groups).forEach(function (b) {
        if (!bands[b]) return;
        var feats = groups[b].map(function (sp) {
          return { type: 'Feature', geometry: { type: 'Point', coordinates: [sp.lng, sp.lat] }, properties: { id: sp.id, name: sp.name } };
        });
        /* Loca 2.0 的 setSource 接收 GeoJSONSource 实例（原生 API 不直接吃裸 GeoJSON） */
        try {
          var src = new Loca.GeoJSONSource({ data: { type: 'FeatureCollection', features: feats } });
          bands[b].setSource(src);
        } catch (e) { try { console.warn('[loca] 呼吸点数据源失败：', e); } catch (err) {} }
        var mean = 50;
        if (groups[b].length) {
          var sum = 0;
          groups[b].forEach(function (sp) { sum += window.ZXSJ.DataSource.getCrowd(sp.id, nowMin).level; });
          mean = sum / groups[b].length;
        }
        var freq = 0.5 + Math.min(1, mean / 100) * 1.0;   /* 0.5Hz（空）→ 1.5Hz（满） */
        var style = { unit: 'px', size: [58, 58], color: bandColors[b], altitude: 0, borderWidth: 0 };
        if (bandTextures[b]) { style.texture = bandTextures[b]; style.animate = true; style.duration = Math.round(1000 / freq); }
        try { bands[b].setStyle(style); } catch (e) { try { console.warn('[loca] 呼吸点样式失败：', e); } catch (err) {} }
      });
    }
    /* LinkLayer 六条事务链（data.js LINK_EDGES，逐条着色 + 流动虚线） */
    function buildLinkLayer() {
      if (!window.LINK_EDGES || !window.LINK_EDGES.length) return;
      var feats = [];
      window.LINK_EDGES.forEach(function (edge) {
        var coords = [];
        edge.path.forEach(function (id) { var sp = findSpot(id); if (sp) coords.push([sp.lng, sp.lat]); });
        if (coords.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { id: edge.id, label: edge.label, color: edge.color } });
      });
      if (!feats.length) return;
      try {
        linkLayer = new Loca.LinkLayer({ zIndex: 114, visible: linkOn, zooms: [3, 20], opacity: 0.92 });
        linkLayer.setSource(new Loca.GeoJSONSource({ data: { type: 'FeatureCollection', features: feats } }));
        var ok = false;
        try {
          linkLayer.setStyle({
            unit: 'meter', width: 22, altitude: 0, borderWidth: 0,
            color: function (index, feature) { return feature.properties.color; },
            lineType: 'dash', dash: [3, 1.4],
            intervalColors: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.95)'],
            speed: 1600
          });
          ok = true;
        } catch (e1) {
          try {
            linkLayer.setStyle({ unit: 'meter', width: 20, altitude: 0, borderWidth: 0, color: function (index, feature) { return feature.properties.color; } });
            ok = true;
          } catch (e2) { ok = false; }
        }
        if (ok) loca.add(linkLayer);
        else { linkLayer = null; }
      } catch (e) { try { console.warn('[loca] 事务链图层失败：', e); } catch (err) {} linkLayer = null; }
    }
    function renderLinkLegend() {
      var el = document.getElementById('linkLegend');
      if (!el || !window.LINK_EDGES) return;
      el.innerHTML = '<span class="ll-title">六条事务链</span>' + window.LINK_EDGES.map(function (e2) { return '<span><i style="background:' + e2.color + '"></i>' + esc(e2.label) + '</span>'; }).join('');
      el.hidden = !linkOn;
    }
    function bindLinkToggle() {
      var cb = document.getElementById('linkLayerCb');
      if (!cb || cb.__lk) return;
      cb.__lk = 1;
      cb.checked = linkOn;
      cb.addEventListener('change', function (e) {
        linkOn = e.target.checked;
        save('zxsj66_linklayer_on', linkOn);
        if (linkLayer) { try { if (linkOn) linkLayer.show(); else linkLayer.hide(); } catch (err) {} }
        var lg = document.getElementById('linkLegend'); if (lg) lg.hidden = !linkOn;
      });
    }
    function initLoca() {
      if (typeof Loca === 'undefined' || !map) { locaReady = false; return false; }
      try {
        loca = new Loca.Container({ map: map });
        Object.keys(bandColors).forEach(function (b) { bandTextures[b] = breathTexture(bandColors[b]); });
        Object.keys(bandColors).forEach(function (b) {
          var layer = new Loca.ScatterLayer({ zIndex: 116, visible: true, zooms: [2, 20], opacity: 0.96 });
          layer.on && layer.on('click', function (arg1, arg2) {
            var f = (arg1 && arg1.properties) ? arg1 : (arg2 && arg2.feature);
            if (f && f.properties && f.properties.id) { var sp = findSpot(f.properties.id); if (sp) openPopup(sp); }
          });
          loca.add(layer);
          bands[b] = layer;
        });
        buildLinkLayer();
        loca.animate.start();
        locaReady = true;
        refreshBands();
        renderLinkLegend();
        bindLinkToggle();
        startBandTimer();
      } catch (e) {
        try { console.warn('[loca] 初始化失败，校园点位降级为普通标记：', e); } catch (err) {}
        try { if (loca && loca.destroy) loca.destroy(); } catch (err) {}
        loca = null; locaReady = false; bands = {};
      }
      return locaReady;
    }
    /* ViewControl 三段式镜头动画 900ms：俯冲 → 旋转扫视 → 落定（开场只播一次） */
    function playMapIntro() {
      var seen = false;
      try { seen = localStorage.getItem('zxsj66_mapintro') === '1'; } catch (e) {}
      if (seen) return;
      if (!loca || !loca.viewControl || RM) return;   /* 不能播则不消耗开场（下次进入再试） */
      try { localStorage.setItem('zxsj66_mapintro', '1'); } catch (e) {}
      var full = [
        { zoom: { value: 16.6, control: [[0, 12.8], [1, 16.6]], timing: [0, 0, 0.7, 1], duration: 300 },
          pitch: { value: 55, control: [[0, 0], [1, 55]], timing: [0, 0, 0.7, 1], duration: 300 } },
        { rotation: { value: 18, control: [[0, 0], [1, 18]], timing: [0, 0, 1, 1], duration: 300 } },
        { pitch: { value: 0, control: [[0, 55], [1, 0]], timing: [0.3, 0, 0.4, 1], duration: 300 },
          rotation: { value: 0, control: [[0, 18], [1, 0]], timing: [0.3, 0, 0.4, 1], duration: 300 },
          zoom: { value: 16, control: [[0, 16.6], [1, 16]], timing: [0.3, 0, 0.4, 1], duration: 300 } }
      ];
      var simple = [
        { zoom: { value: 16.5, duration: 300 }, pitch: { value: 55, duration: 300 } },
        { rotation: { value: 18, duration: 300 } },
        { zoom: { value: 16, duration: 300 }, pitch: { value: 0, duration: 300 }, rotation: { value: 0, duration: 300 } }
      ];
      try { loca.viewControl.addAnimates(full, function () {}); }
      catch (e) { try { loca.viewControl.addAnimates(simple, function () {}); } catch (e2) {} }
    }
    function startBandTimer() {
      if (bandTimer) return;
      bandTimer = setInterval(function () { if (mapActive && locaReady) refreshBands(); }, 30000);
    }
    window.addEventListener('zxsj66:import-data', function () { if (locaReady) refreshBands(); });

    function enter() {
      if (inited) return;
      var box = document.getElementById('mapBox');
      if (typeof AMap === 'undefined') {
        box.innerHTML = '<div class="map-placeholder"><h3>地图占位提示</h3><p>高德 Key 未配置或加载失败。请由团队申请「Web端(JS API)」Key 后填入 index.html，并将 <b>zhixuejiangpan-team.github.io</b> 主域名加入白名单。</p></div>';
        inited = true; return;
      }
      try { map = new AMap.Map('mapBox', { center: CAMPUS_CENTER['蛟桥园'], zoom: 16, viewMode: '3D', pitch: 0, scrollWheel: false, zoomEnable: true }); map.addControl(new AMap.Scale()); }
      catch (e) { box.innerHTML = '<div class="map-placeholder"><h3>地图初始化失败</h3><p>' + esc(e.message) + '</p></div>'; inited = true; return; }
      inited = true;
      syncMapTheme();
      initLoca();
      renderMarkers(); buildDrawer();
      if (locaReady) playMapIntro();
      bindLinkToggle();
    }
    /* 引擎挂起/恢复：地图段落激活时 Loca 渲染循环 start/pause */
    function onActive(on) {
      mapActive = on;
      if (loca && loca.animate) {
        try { if (on) loca.animate.start(); else loca.animate.pause(); } catch (e) {}
      }
      if (on && locaReady) refreshBands();
      syncGestureSupport();
    }
    /* 摄像头手势 → 地图导航：食指移动=平移，拇指-食指捏合=缩放（100ms 轮询） */
    var gestureTimer = null;
    function syncGestureSupport() {
      var on = !!(window.ZXSJ.Gestures && window.ZXSJ.Gestures.isEnabled());
      if (on && !gestureTimer) {
        var lastPinch = -1, lastPoint = null;
        gestureTimer = setInterval(function () {
          if (!map || !mapActive || !window.ZXSJ.Gestures.isEnabled()) return;
          var g = window.ZXSJ.Gestures.latest();
          if (!g || !g.active || g.palm) { lastPinch = -1; lastPoint = null; return; }
          if (lastPoint && g.point) {
            var dx = g.point.x - lastPoint.x, dy = g.point.y - lastPoint.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.003) { try { map.panBy(Math.round(-dx * 1100), Math.round(-dy * 1100)); } catch (e) {} }
          }
          if (g.point) lastPoint = g.point;
          if (lastPinch < 0) lastPinch = g.pinch;
          var dp = g.pinch - lastPinch;
          if (dp > 0.05) { try { map.zoomOut(); } catch (e) {} lastPinch = g.pinch; }
          else if (dp < -0.05) { try { map.zoomIn(); } catch (e) {} lastPinch = g.pinch; }
        }, 100);
      } else if (!on && gestureTimer) { clearInterval(gestureTimer); gestureTimer = null; }
    }
    /* 主题联动：霓虹主题主地图套用高德深色样式，其余主题用标准样式 */
    function syncMapTheme() {
      if (!map) return;
      var dark = document.documentElement.getAttribute('data-theme') === 'neon';
      try { map.setMapStyle(dark ? 'amap://styles/dark' : 'amap://styles/normal'); } catch (e) {}
    }
    function markerOf(sp) {
      var color = TYPE_COLOR[sp.type] || '#7A6A55';
      var html = '<div class="map-dot" style="background:' + color + '" title="' + esc(sp.name) + '"></div>';
      var m = new AMap.Marker({ position: [sp.lng, sp.lat], content: html, offset: new AMap.Pixel(-11, -11), title: sp.name });
      m.on('click', function () { openPopup(sp); });
      return m;
    }
    function renderMarkers() {
      if (!map) return;
      campusMarkers.concat(surMarkers).forEach(function (m) { m.setMap(null); });
      campusMarkers = []; surMarkers = [];
      /* 校园点位：普通 DivIcon 始终作为保底层（Loca 失败时地图也不空白），
         Loca 呼吸点叠加在其上（Loca 画布在 AMap 画布之上，天然覆盖） */
      if (state.layerCampus) {
        spots.forEach(function (sp) { var m = markerOf(sp); m.setMap(map); campusMarkers.push(m); });
        if (locaReady) refreshBands();
      }
      if (locaReady) {
        Object.keys(bands).forEach(function (b) {
          try { if (state.layerCampus) bands[b].show(); else bands[b].hide(); } catch (e) {}
        });
      }
      if (state.layerSur) surroundingSpots.forEach(function (sp) { var m = markerOf(sp); m.setMap(map); surMarkers.push(m); });
    }
    function openPopup(sp) {
      if (!map) return;
      var voted = votedSet.indexOf(sp.id) !== -1;
      var html = '<div class="pop-title">' + esc(sp.name) + '</div><div class="pop-meta">📍 ' + esc(sp.campus) + ' · ' + esc(sp.type) + ' · ⭐' + sp.rating.toFixed(1) + '</div><div class="pop-tags">' + sp.tags.map(function (t) { return '<span class="pop-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<button class="pop-vote' + (voted ? ' voted' : '') + '" data-voteid="' + sp.id + '">' + (voted ? '已支持(' + getVotes(sp.id) + ')' : '👍 支持(' + getVotes(sp.id) + ')') + '</button>';
      new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -10) }).open(map, [sp.lng, sp.lat]);
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pop-vote') : null; if (!btn) return;
      var id = btn.getAttribute('data-voteid');
      if (castVote(id)) { var sp = findSpot(id); if (sp && map) openPopup(sp); buildDrawer(); }
    });
    document.getElementById('layerCampus').addEventListener('change', function (e) { state.layerCampus = e.target.checked; renderMarkers(); });
    document.getElementById('layerSur').addEventListener('change', function (e) { state.layerSur = e.target.checked; renderMarkers(); });
    document.getElementById('twinEntry').addEventListener('click', function () { playTransit(); goTo('twin'); });

    function clearRoute() {
      overlays.forEach(function (o) { o.setMap && o.setMap(null); }); overlays = [];
      if (state.walking) { state.walking.clear(); state.walking = null; }
      document.getElementById('routePanel').hidden = true;
    }
    function loadWorkflow(wfId) {
      var wf = workflows.find(function (w) { return w.id === wfId; }); if (!wf || !map) return;
      clearRoute();
      var pts = []; wf.steps.forEach(function (st) { if (st.spotId) { var sp = findSpot(st.spotId); if (sp) pts.push(sp); } });
      pts.forEach(function (sp, i) {
        var m = new AMap.Marker({ position: [sp.lng, sp.lat], content: '<div class="route-num">' + (i + 1) + '</div>', offset: new AMap.Pixel(-13, -13), zIndex: 150 });
        m.setMap(map); overlays.push(m);
      });
      var walkSum = 0;
      if (pts.length > 1 && AMap.Walking) {
        var i = 0; state.walking = new AMap.Walking({ map: map, hideMarkers: true, autoFitView: false });
        function next() {
          if (i >= pts.length - 1) { showRoutePanel(wf, walkSum); return; }
          var a = pts[i], b = pts[i + 1]; i++;
          state.walking.search([a.lng, a.lat], [b.lng, b.lat], function (status, result) { if (status === 'complete' && result.routes && result.routes[0]) walkSum += Math.round(result.routes[0].time / 60); next(); });
        }
        next();
      } else showRoutePanel(wf, 0);
      if (pts.length) map.setFitView(overlays.concat());
    }
    function showRoutePanel(wf, walkSum) {
      var total = wf.estimatedMinutes + Math.round(walkSum);
      var prevCampus = null;
      var stepsHtml = wf.steps.map(function (st) {
        var cross = false;
        if (st.campus && st.campus.indexOf('🔀') !== -1) cross = true;
        if (prevCampus && st.campus && st.campus !== prevCampus && st.campus !== '自备材料' && prevCampus !== '自备材料') cross = true;
        if (st.campus && st.campus !== '自备材料') prevCampus = st.campus;
        return '<li>' + (cross ? '<span class="cross-tag">🔀</span>' : '') + '<b>' + esc(st.campus || '') + '</b> ' + esc(st.text) + '</li>';
      }).join('');
      var panel = document.getElementById('routePanel');
      panel.innerHTML = '<button class="card-x" id="routeClose">✕</button><h4>' + (wf.campusScope === 'cross' ? '🔀 ' : '') + esc(wf.title) + '</h4><p class="route-total">全程约 <b>' + total + '</b> 分钟（含步行 ' + Math.round(walkSum) + ' 分钟）</p><ol class="route-steps">' + stepsHtml + '</ol>';
      panel.hidden = false;
      document.getElementById('routeClose').addEventListener('click', function () { panel.hidden = true; });
    }
    function buildDrawer() {
      var list = document.getElementById('drawerList');
      var groups = ['蛟桥园', '麦庐园', '枫林园'];
      var DS = window.ZXSJ && window.ZXSJ.DataSource;
      list.innerHTML = groups.map(function (c) {
        return '<div class="drawer-group"><h5>' + c + '</h5>' + spots.filter(function (s) { return s.campus === c; }).map(function (s) {
          var dot = (DS && DS.hasUnreadDoc(s.id)) ? '<i class="doc-dot" data-doc="' + s.id + '"></i>' : '';
          return '<div class="drawer-item" data-loc="' + s.id + '"><span class="dot" style="background:' + (TYPE_COLOR[s.type] || '#666') + '"></span>' + esc(s.name) + dot + '<span class="drawer-votes">👍' + getVotes(s.id) + '</span></div>';
        }).join('') + '</div>';
      }).join('');
    }
    document.getElementById('drawerList').addEventListener('click', function (e) {
      var dd = e.target.closest('.doc-dot');
      if (dd && window.ZXSJ) { var f = window.ZXSJ.DataSource.getSpotFile(dd.getAttribute('data-doc')); if (f) { window.open(f.pdfUrl, '_blank', 'noopener'); window.ZXSJ.DataSource.markDocSeen(dd.getAttribute('data-doc')); dd.remove(); } return; }
      var it = e.target.closest('.drawer-item'); if (it) locate(it.getAttribute('data-loc'));
    });
    (function () {
      var drawer = document.getElementById('spotDrawer');
      document.getElementById('drawerHandle').addEventListener('click', function () { drawer.classList.toggle('full'); drawer.style.height = drawer.classList.contains('full') ? '82vh' : '180px'; });
    })();
    function locate(id) {
      var sp = findSpot(id); if (!sp) return;
      goTo('map');
      setTimeout(function () { if (!map) return; map.setCenter([sp.lng, sp.lat]); map.setZoom(17); openPopup(sp); }, 350);
    }
    return {
      enter: enter, locate: locate, loadWorkflow: loadWorkflow, clearRoute: clearRoute, buildDrawer: buildDrawer,
      centerCampus: function (c) { if (!map || !CAMPUS_CENTER[c]) return; map.setCenter(CAMPUS_CENTER[c]); map.setZoom(16); },
      getMap: function () { return map; },
      syncMapTheme: syncMapTheme,
      onActive: onActive,
      syncGestureSupport: syncGestureSupport,
      refreshBands: function () { if (locaReady) refreshBands(); },
      setDark: function () { if (!map) return; try { map.setMapStyle('amap://styles/dark'); } catch (e) {} }
    };
  })();

  /* ================= 数字孪生（段落版） ================= */
  var TwinModule = (function () {
    var listEl, cardsEl, clockEl, demoCb, segEl, segInd, wxEl;
    var demo = false, tier = 0, virtualT = 6 * 60 + 55;
    var rows = [], miniRegistry = [], cardIO = null, miniDocBound = false;
    var openFlag = false, timer = null, fadeTimer = null;
    var MINI_KEY_MAP = { '蛟桥北': 'jq_north', '蛟桥南': 'jq_south', '麦庐北': 'ml_north', '麦庐南': 'ml_south' };
    var LEVEL_TXT = { green: '畅通', yellow: '较拥挤', red: '拥挤' };
    var previewMin = null;

    function statusOf(sp, date, t) { var r = window.ZXSJ.DataSource.getCrowd(sp.id, Math.round(t * 60), date); return { p: r.level / 100, n: r.n, cap: r.cap, level: r.color, kind: r.kind, source: r.source }; }
    function predictOf(sp, date, t, aheadH) {
      var cur = window.ZXSJ.calculateCrowd(sp, Math.round(t * 60), date);
      var prev = window.ZXSJ.calculateCrowd(sp, Math.round((t - aheadH) * 60), date);
      if (window.ZXSJ.isClosed(cur.kind, t) || window.ZXSJ.isClosed(cur.kind, t + aheadH)) return { p: 0, n: 0, cap: cur.cap, level: 'green', kind: cur.kind, closed: true };
      var p = Math.max(0, Math.min(1, cur.p + (cur.p - prev.p)));
      return { p: p, n: Math.round(p * cur.cap), cap: cur.cap, level: p <= 0.6 ? 'green' : (p <= 0.85 ? 'yellow' : 'red'), kind: cur.kind, closed: false };
    }
    function adviceOf(p) { return (p <= 0.6 ? '现在去' : (p <= 0.85 ? '建议错峰' : '别去')) + '（模拟预测）'; }
    function levelColor(level) { return cssVar('--twin-' + level, level === 'green' ? '#12A36B' : level === 'yellow' ? '#FFB000' : '#FF3B5C'); }
    function fmtTime(min) { var h = Math.floor(min / 60) % 24, m = Math.floor(min % 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    function nowVirtual() { if (previewMin !== null) return previewMin; return demo ? virtualT : (new Date().getHours() * 60 + new Date().getMinutes()); }
    function isNightMin(mins) { return mins < 7 * 60 || mins >= 19 * 60; }

    function pickSpots() {
      return (window.spots || []).filter(function (s) { var t = s.type || '', n = s.name || '', tags = (s.tags || []).join(''); return t === '食堂' || /图书馆|图文/.test(n) || /快递/.test(n + tags) || t === '医疗' || t === '体育' || t === '场馆'; }).slice(0, 14);
    }
    function quadrant(sp) { return (sp.campus === '麦庐园' ? '麦庐' : '蛟桥') + (sp.area === '北区' ? '北' : '南'); }
    function modelKindOf(sp) {
      var t = sp.type || '', n = sp.name || '', tags = (sp.tags || []).join('');
      if (t === '食堂') return 'canteen';
      if (/图书馆|图文/.test(n)) return 'library';
      if (/快递/.test(n + tags)) return 'express';
      if (t === '医疗') return 'hospital';
      if (t === '体育' || t === '场馆' || /运动场|操场|球馆/.test(n)) return 'stadium';
      return 'fallback';
    }

    function buildDomRefs() {
      listEl = document.getElementById('twinList');
      cardsEl = document.getElementById('twinCards');
      clockEl = document.getElementById('twinClock');
      demoCb = document.getElementById('twinDemo');
      segEl = document.getElementById('twinSeg');
      segInd = document.getElementById('twinSegInd');
      wxEl = document.getElementById('twinWx');
      demoCb.checked = load('zxsj66_twin_demo', false); demo = demoCb.checked;
      demoCb.addEventListener('change', function () { demo = demoCb.checked; save('zxsj66_twin_demo', demo); tick(true); });
      bindTimeline();
      bindSeg();
      bindListClicks();
      bindCardsHover();
    }

    function bindTimeline() {
      var tl = document.getElementById('twinTl'), tlTime = document.getElementById('twinTlTime'), tlLabel = document.getElementById('twinTlLabel'), tlNow = document.getElementById('twinTlNow'), previewTag = document.getElementById('twinPreviewTag');
      var tlThrottle = 0;
      function realNowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
      function syncPreviewUI() {
        var on = previewMin !== null;
        segEl.style.display = on ? 'none' : ''; previewTag.hidden = !on; tlNow.hidden = !on;
        tlLabel.textContent = on ? '预览' : '实时'; tlLabel.classList.toggle('on', on);
        document.getElementById('sec-twin').classList.toggle('twin-preview', on);
      }
      tl.value = Math.max(360, Math.min(1380, realNowMin()));
      tl.addEventListener('input', function () {
        var v = +tl.value; tlTime.textContent = fmtTime(v);
        var now = Date.now(); if (now - tlThrottle < 100) return; tlThrottle = now;
        previewMin = v; syncPreviewUI(); tick(true);
      });
      tl.addEventListener('change', function () {
        var v = +tl.value;
        if (Math.abs(v - realNowMin()) <= 30) { previewMin = null; tl.value = Math.max(360, Math.min(1380, realNowMin())); }
        else previewMin = v;
        syncPreviewUI(); tick(true);
      });
      tlNow.addEventListener('click', function () { previewMin = null; tl.value = Math.max(360, Math.min(1380, realNowMin())); syncPreviewUI(); tick(true); });
    }
    function bindSeg() {
      segEl.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tier]'); if (!b) return;
        var nt = +b.getAttribute('data-tier'); if (nt === tier) return;
        tier = nt;
        segInd.style.transform = 'translateX(' + (nt / 30 * 100) + '%)';
        segEl.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', +x.getAttribute('data-tier') === tier); });
        if (RM) { tick(true); return; }
        document.getElementById('sec-twin').classList.add('twin-fading');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () { tick(true); document.getElementById('sec-twin').classList.remove('twin-fading'); }, 300);
      });
    }
    function bindListClicks() {
      listEl.addEventListener('click', function (e) {
        var dd = e.target.closest('.doc-dot');
        if (dd) { var DS = window.ZXSJ.DataSource, f = DS.getSpotFile(dd.getAttribute('data-doc')); if (f) { window.open(f.pdfUrl, '_blank', 'noopener'); DS.markDocSeen(dd.getAttribute('data-doc')); dd.remove(); } return; }
        var b3 = e.target.closest('.twin-3d'); if (b3) { var r3 = rows[+b3.getAttribute('data-i')]; if (r3) open3DForRow(r3, b3); return; }
        var btn = e.target.closest('.twin-askai'); if (!btn) return;
        var r = rows[+btn.getAttribute('data-i')]; if (!r) return;
        var prefix = demo ? '（模拟时刻 ' + fmtTime(virtualT) + '）' : '';
        var q = r.sp.name + '当前人数约 ' + r.last.n + ' 人，拥挤度 ' + Math.round(r.last.p * 100) + '%（' + LEVEL_TXT[r.last.level] + '）' + prefix + '，现在去合适吗？有什么建议？';
        goTo('ask');
        setTimeout(function () { if (window.__runSearchByVal) window.__runSearchByVal(q); }, 200);
      });
    }
    /* 校区卡片小地图（高德 JS API）：Marker 悬浮 tooltip */
    function bindCardsHover() {
      var tipEl = null;
      function tip() { if (tipEl) return tipEl; tipEl = document.createElement('div'); tipEl.className = 'twin-tip'; tipEl.hidden = true; document.body.appendChild(tipEl); return tipEl; }
      function show(r, x, y) { var t = tip(); var pd = predictOf(r.sp, new Date(), nowVirtual() / 60, 0.5); t.textContent = r.sp.name + ' · 当前 ' + Math.round(r.last.p * 100) + '% · 预计30分后 ' + Math.round(pd.p * 100) + '%'; t.hidden = false; t.style.left = Math.min(x + 14, innerWidth - 220) + 'px'; t.style.top = Math.max(8, y - 42) + 'px'; }
      function move(x, y) { if (tipEl && !tipEl.hidden) { tipEl.style.left = Math.min(x + 14, innerWidth - 220) + 'px'; tipEl.style.top = Math.max(8, y - 42) + 'px'; } }
      function hide() { if (tipEl) tipEl.hidden = true; }
      cardsEl.addEventListener('mouseover', function (e) {
        var t = e.target.closest && e.target.closest('.tmini'); if (!t) return;
        for (var i = 0; i < miniRegistry.length; i++) {
          var cs = miniRegistry[i]; if (cs.dead) continue;
          for (var j = 0; j < cs.refs.length; j++) {
            if (cs.refs[j].dotEl.parentNode === t) { if (FINE) show(cs.refs[j].row, e.clientX, e.clientY); return; }
          }
        }
      });
      cardsEl.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
      cardsEl.addEventListener('mouseout', function () { hide(); });
    }
    function buildList(spots) {
      var DS = window.ZXSJ.DataSource;
      listEl.innerHTML = spots.map(function (sp, i) {
        var docDot = (DS && DS.hasUnreadDoc(sp.id)) ? '<i class="doc-dot" data-doc="' + sp.id + '"></i>' : '';
        return '<div class="twin-row" data-i="' + i + '"><div class="twin-row-head"><b>' + esc(sp.name) + '</b>' + docDot + '<span class="twin-real" id="twinReal' + i + '" hidden>实测</span><span class="twin-kind">' + esc(sp.type || '') + '</span></div>' +
          '<div class="twin-nums"><span class="twin-n" id="twinN' + i + '">--</span><div class="twin-bar"><i id="twinBar' + i + '"></i></div></div>' +
          '<div class="twin-advice" id="twinAdv' + i + '" hidden></div>' +
          '<div class="twin-btns"><button class="twin-askai" data-i="' + i + '">问AI</button><button class="twin-3d off" data-i="' + i + '">3D</button></div></div>';
      }).join('');
      rows = spots.map(function (sp, i) {
        return { sp: sp, nEl: document.getElementById('twinN' + i), barEl: document.getElementById('twinBar' + i), advEl: document.getElementById('twinAdv' + i), realEl: document.getElementById('twinReal' + i), btn3d: null, last: { n: 0, p: 0, level: 'green' } };
      });
      rows.forEach(function (r, i) { r.btn3d = listEl.querySelector('.twin-3d[data-i="' + i + '"]'); });
      apply3dAvail();
    }
    function apply3dAvail() {
      var avail = !!(window.Twin3D && window.Twin3D.available());
      rows.forEach(function (r) { if (r.btn3d) { r.btn3d.classList.toggle('off', !avail); r.btn3d.title = avail ? '3D 查看' : '当前设备不支持 3D 查看'; } });
    }
    window.__setTwin3dAvail = apply3dAvail;

    function open3DForRow(r, anchorEl) {
      var kind = modelKindOf(r.sp);
      if (kind === 'fallback') { show3dTip(anchorEl); return; }
      if (!window.Twin3D || !window.Twin3D.available()) { toast('当前设备不支持 3D 查看'); return; }
      if (window.__sfx) window.__sfx.play('open3d');
      window.Twin3D.open({ name: r.sp.name, type: r.sp.type || '', kind: kind, id: r.sp.id, getState: function () { return r.last; } });
    }
    function show3dTip(anchorEl) {
      var tip = document.createElement('div'); tip.className = 'twin-3d-tip'; tip.textContent = '该点位暂无3D模型'; document.body.appendChild(tip);
      var rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
      tip.style.left = Math.min(Math.max(8, rect.left + rect.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(8, rect.top - tip.offsetHeight - 10) + 'px';
      setTimeout(function () { tip.classList.add('fade'); }, 1200); setTimeout(function () { tip.remove(); }, 1550);
    }

    /* 校区小地图（高德 JS API 2.0，四卡片懒加载，全部走 AMap 瓦片） */
    function setupCards() {
      cardsEl.hidden = false; destroyMiniMaps(true);
      if (!miniDocBound) {
        miniDocBound = true;
        document.addEventListener('click', function (ev) {
          var t = ev.target && ev.target.closest ? ev.target.closest('.tmini') : null; if (!t) return;
          for (var i = 0; i < miniRegistry.length; i++) { var cs = miniRegistry[i]; if (cs.dead) continue; for (var j = 0; j < cs.refs.length; j++) { if (cs.refs[j].dotEl.parentNode === t) { ev.stopPropagation(); open3DForRow(cs.refs[j].row, cs.refs[j].dotEl); return; } } }
        }, true);
      }
      cardIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.target._inView = !!en.isIntersecting; });
        var cards = cardsEl.children, allInView = true;
        for (var k = 0; k < cards.length; k++) if (!cards[k]._inView) { allInView = false; break; }
        var maxLive = allInView ? 4 : 2;
        entries.forEach(function (en) {
          var card = en.target, cs = card._cs;
          if (en.isIntersecting) {
            if (cs && cs.dead) cs = card._cs = null;
            if (!cs) {
              var live = miniRegistry.filter(function (x) { return !x.dead; });
              if (live.length >= maxLive) { var victim = live.filter(function (x) { return !x.card._inView; })[0]; if (victim) destroyCardMap(victim); else { card.classList.add('no-map'); return; } }
              initMiniMap(card);
            } else if (cs.hideTimer) { clearTimeout(cs.hideTimer); cs.hideTimer = null; }
          } else if (cs && !cs.dead && !cs.hideTimer) cs.hideTimer = setTimeout(function () { destroyCardMap(cs); }, 60000);
        });
      }, { threshold: 0.15 });
      Array.prototype.forEach.call(cardsEl.children, function (card) { cardIO.observe(card); });
    }
    function initMiniMap(card) {
      var q = card.getAttribute('data-q'); var cfg = (window.TWIN_MINI_MAP || {})[MINI_KEY_MAP[q]];
      var box = card.querySelector('.twin-cardmap');
      if (!cfg || typeof AMap === 'undefined' || !box) { card.classList.add('no-map'); return null; }
      var map;
      try {
        map = new AMap.Map(box, { center: cfg.center, zoom: cfg.zoom, viewMode: '2D', dragEnable: false, zoomEnable: false, doubleClickZoom: false, scrollWheel: false, touchZoom: false, keyboardEnable: false, resizeEnable: false, rotateEnable: false, pitchEnable: false, mapStyle: 'amap://styles/dark', features: LOWEND ? ['bg', 'road'] : ['bg', 'road', 'building'] });
      } catch (e) { card.classList.add('no-map'); return null; }
      var cs = { card: card, q: q, map: map, refs: [], dead: false, hideTimer: null };
      rows.filter(function (r) { return quadrant(r.sp) === q; }).forEach(function (r) {
        var dot = document.createElement('div'); dot.className = 'tmini';
        dot.innerHTML = '<i class="tmini-dot"></i><span class="tmini-label">' + esc(r.sp.name.slice(0, 6)) + '</span>';
        var dotEl = dot.querySelector('.tmini-dot');
        new AMap.Marker({ content: dot, position: [r.sp.lng, r.sp.lat], offset: new AMap.Pixel(-7, -7), map: map, zIndex: 120 });
        dot.addEventListener('click', function (ev) { ev.stopPropagation(); open3DForRow(r, dotEl); });
        cs.refs.push({ row: r, dotEl: dotEl });
      });
      miniRegistry.push(cs); card._cs = cs; card.classList.remove('no-map');
      return cs;
    }
    function destroyCardMap(cs) {
      if (!cs || cs.dead) return; cs.dead = true;
      if (cs.hideTimer) { clearTimeout(cs.hideTimer); cs.hideTimer = null; }
      cs.refs = [];
      try { cs.map.destroy(); } catch (e) {}
      var box = cs.card.querySelector('.twin-cardmap'); if (box) { box.innerHTML = ''; }
      cs.card.classList.add('no-map'); cs.card._cs = null;
      var i = miniRegistry.indexOf(cs); if (i !== -1) miniRegistry.splice(i, 1);
    }
    function destroyMiniMaps(keepIO) { miniRegistry.slice().forEach(destroyCardMap); if (!keepIO && cardIO) { cardIO.disconnect(); cardIO = null; } }
    function updateMiniDots() {
      for (var i = 0; i < miniRegistry.length; i++) { var cs = miniRegistry[i]; if (cs.dead) continue; for (var j = 0; j < cs.refs.length; j++) { var c = levelColor(cs.refs[j].row.last.level); cs.refs[j].dotEl.style.color = c; cs.refs[j].dotEl.style.background = 'radial-gradient(circle, ' + c + ' 0%, transparent 72%)'; } }
    }

    /* 雨/雪粒子已统一收编进 js/scene-fx.js 的单一 RAF（孪生卡片 + 主地图共用） */

    var lastClockTxt = '', clockFlashT = null;
    function tick(force) {
      if (!openFlag) return;
      var date = new Date();
      if (demo && previewMin === null) virtualT = (virtualT + 10) % (24 * 60);
      var mins = nowVirtual(); var t = mins / 60, timeTxt = fmtTime(mins);
      var clockTxt = previewMin !== null ? '预览 ' + timeTxt : (demo ? '模拟时刻 ' + timeTxt + ' · 600×' : ('实时 ' + timeTxt));
      if (clockTxt !== lastClockTxt) {
        lastClockTxt = clockTxt; clockEl.textContent = clockTxt;
        clockEl.classList.remove('tick'); void clockEl.offsetWidth; clockEl.classList.add('tick');
        clearTimeout(clockFlashT); clockFlashT = setTimeout(function () { clockEl.classList.remove('tick'); }, 120);
      }
      clockEl.classList.toggle('demo', demo || previewMin !== null);
      if (previewMin === null) { var tlT = document.getElementById('twinTlTime'); if (tlT) tlT.textContent = timeTxt; }
      window.__twinNight = isNightMin(mins) || (window.ZXSJ.Scene && window.ZXSJ.Scene.nightOverlay());
      document.getElementById('sec-twin').classList.toggle('twin-night', window.__twinNight);
      if (wxEl) {
        var Scene = window.ZXSJ.Scene;
        var wx = Scene ? Scene.weather() : window.ZXSJ.DataSource.getWeather();
        var sceneTag = Scene && Scene.get() !== 'live' ? ' · ' + Scene.label() + '（演示）' : '';
        wxEl.textContent = (wx.condition === 'rain' ? '🌧' : wx.condition === 'snow' ? '❄' : '☀') + ' ' + wx.temp + '°' + sceneTag;
      }
      var effTier = previewMin !== null ? 0 : tier;
      rows.forEach(function (r) {
        var st = statusOf(r.sp, date, t); r.last = st;
        if (r.realEl) r.realEl.hidden = st.source !== 'real';
        try { window.dispatchEvent(new CustomEvent('twin:status-update', { detail: { id: r.sp.id, crowdLevel: st.level, color: levelColor(st.level) } })); } catch (e) {}
        var prefix = demo ? '（模拟时刻 ' + timeTxt + '）' : (previewMin !== null ? '（预览 ' + timeTxt + '）' : '');
        if (effTier > 0) {
          var pd = predictOf(r.sp, date, t, effTier / 60);
          var predPct = Math.round(pd.p * 100);
          r.nEl.textContent = prefix + ' ' + st.n + ' 人 · ' + Math.round(st.p * 100) + '% → 预计 ' + predPct + '%';
          r.nEl.style.color = levelColor(pd.level); r.barEl.style.width = predPct + '%'; r.barEl.style.background = levelColor(pd.level);
          if (r.advEl) { r.advEl.hidden = false; r.advEl.textContent = '建议：' + (pd.closed ? '已闭馆（模拟预测）' : adviceOf(pd.p)); r.advEl.className = 'twin-advice ' + pd.level; }
        } else {
          r.nEl.textContent = prefix + ' ' + st.n + ' 人 · ' + Math.round(st.p * 100) + '%';
          r.nEl.style.color = levelColor(st.level); r.barEl.style.width = Math.round(st.p * 100) + '%'; r.barEl.style.background = levelColor(st.level);
          if (r.advEl) r.advEl.hidden = true;
        }
      });
      updateMiniDots();
    }
    function startTimer() { stopTimer(); timer = setInterval(function () { tick(); }, demo ? 1000 : 30000); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function enter() {
      if (openFlag) return;
      openFlag = true;
      if (!listEl) buildDomRefs();
      if (!rows.length) buildList(pickSpots());
      apply3dAvail();
      if (window.ZXSJ.DataSource.refreshWeather) window.ZXSJ.DataSource.refreshWeather().then(function () { if (openFlag) tick(true); });
      /* 全部地图统一走高德 JS API：四张校区卡片小地图懒加载 */
      setupCards(); cardsEl.classList.remove('twin-stagger'); void cardsEl.getBoundingClientRect(); cardsEl.classList.add('twin-stagger');
      tick(true); startTimer();
    }
    function leave() {
      if (!openFlag) return;
      openFlag = false; stopTimer();
      previewMin = null;
      if (segEl) segEl.style.display = '';
      var pt = document.getElementById('twinPreviewTag'); if (pt) pt.hidden = true;
      var tn = document.getElementById('twinTlNow'); if (tn) tn.hidden = true;
      var tl = document.getElementById('twinTl'); if (tl) { var d0 = new Date(); tl.value = Math.max(360, Math.min(1380, d0.getHours() * 60 + d0.getMinutes())); }
      var tlLab = document.getElementById('twinTlLabel'); if (tlLab) { tlLab.textContent = '实时'; tlLab.classList.remove('on'); }
      var sec = document.getElementById('sec-twin'); if (sec) sec.classList.remove('twin-preview', 'twin-night');
      window.__twinNight = false;
      destroyMiniMaps(false);
      if (cardsEl) { cardsEl.hidden = true; cardsEl.classList.remove('twin-stagger'); }
    }
    return { enter: enter, leave: leave, isOpen: function () { return openFlag; }, tick: tick };
  })();

  /* ================= 问卷（AI 模拟 109 为主 / 真实 34 数据源查找） ================= */
  (function initSurvey() {
    var panel = document.getElementById('surveyPanel'), body = document.getElementById('surveyBody');
    if (!panel || !body || typeof surveyData === 'undefined') return;
    var SD = surveyData, NREAL = SD.meta.nReal, NSIM = SD.meta.nSim, NTOT = SD.meta.nTotal;
    var view = load('zxsj66_survey_view', 'total');   /* 默认全量 109（AI 模拟为主） */
    function curN() { return view === 'total' ? NTOT : NREAL; }
    function countOf(op) { return view === 'total' ? op.real + op.sim : op.real; }

    /* 样本量大数字动效（reduced-motion 直接到位） */
    function countUp(el, to, ms) {
      if (RM) { el.textContent = to; return; }
      var t0 = performance.now(), from = 0;
      function step(now) {
        var k = Math.min(1, (now - t0) / ms);
        var e2 = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(from + (to - from) * e2);
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    body.innerHTML =
      '<p class="survey-note">' + esc(SD.meta.note) + '</p>' +
      /* 样本量主视觉：全量 109 大数字（AI 模拟为主，真实口径仅作溯源） */
      '<div class="survey-hero-nums">' +
      '<div class="shn shn--total"><b id="shnTotal">0</b><span>全量样本</span><i>' + esc(SD.meta.simBadge) + '</i></div>' +
      '<div class="shn shn--sim"><b id="shnSim">0</b><span>AI 模拟样本</span></div>' +
      '<div class="shn shn--real"><b id="shnReal">0</b><span>真实样本</span></div>' +
      '</div>' +
      '<div class="survey-toolbar">' +
      '<div class="survey-view-toggle" id="surveyToggle"><button data-v="total"' + (view === 'total' ? ' class="on"' : '') + '>全量 ' + NTOT + '（AI 模拟为主）</button><button data-v="real"' + (view === 'real' ? ' class="on"' : '') + '>真实 ' + NREAL + '</button></div>' +
      '<span class="survey-badge sim" id="surveySimBadge"' + (view === 'total' ? '' : ' hidden') + '>' + esc(SD.meta.simBadge) + '</span></div>' +
      /* 痛点排行榜（sq2，自定义 HTML 动画条形） */
      '<div class="survey-hero-chart"><h4>🏆 开学痛点排行榜（全量 ' + NTOT + '）</h4><div class="shc-bars" id="shcBars"></div></div>' +
      '<div class="survey-grid">' + SD.questions.map(function (q) {
        var topIdx = 0; q.options.forEach(function (op, i) { if (countOf(op) > countOf(q.options[topIdx])) topIdx = i; });
        return '<div class="survey-item"><span class="survey-top-tag">🔥 ' + esc(q.options[topIdx].label.slice(0, 6)) + '</span><h4>' + esc(q.q) + '</h4>' +
          (q.note ? '<p class="survey-item-note">' + esc(q.note) + '</p>' : '') +
          '<div class="survey-chart" id="chart-' + q.id + '"></div></div>';
      }).join('') + '</div>' +
      '<div class="survey-insight">💡 ' + NREAL + ' 人中 <b>' + SD.questions[2].options[0].real + ' 人（' + (SD.questions[2].options[0].real / NREAL * 100).toFixed(1) + '%）</b> 不知道各部门办公室在哪、电话多少（sq2/sq3 双佐证）——这正是"智行江畔"立项的第一依据。</div>' +
      '<div class="survey-openended" id="soPanel"><div class="so-header" id="soHeader"><span>' + esc(SD.openEnded.q) + '</span><span id="soArrow">▸</span></div><div class="so-body" id="soBody" hidden><p class="empty-tip">原始回答请在问卷平台查看。</p><p class="survey-item-note">' + esc(SD.openEnded.note) + '</p></div></div>' +
      /* 数据源查找：真实样本 34 份明细（放在最后，仅作口径溯源） */
      '<div class="survey-real-src" id="surveyRealSrc">' +
      '<div class="srs-head" id="srsHead"><span>📁 数据源查找 · 真实样本 ' + NREAL + ' 份明细</span><span class="srs-arrow" id="srsArrow">▸</span></div>' +
      '<div class="srs-body" id="srsBody" hidden>' + SD.questions.map(function (q) {
        return '<div class="srs-q"><b>' + esc(q.q) + '</b>' + q.options.map(function (op) {
          return '<div class="srs-row"><span>' + esc(op.label) + '</span><i style="width:' + Math.round(op.real / NREAL * 100) + '%"></i><em>' + op.real + '/' + NREAL + '</em></div>';
        }).join('') + '</div>';
      }).join('') + '</div></div>';
    countUp(document.getElementById('shnTotal'), NTOT, 900);
    countUp(document.getElementById('shnSim'), NSIM, 1100);
    countUp(document.getElementById('shnReal'), NREAL, 1300);

    /* 痛点排行榜：按全量 109 排序的动画条形 */
    function renderHeroChart() {
      var host = document.getElementById('shcBars'); if (!host) return;
      var q = SD.questions[1];
      var rows = q.options.map(function (op) { return { label: op.label, v: op.real + op.sim, sim: op.sim, real: op.real }; })
        .sort(function (a, b) { return b.v - a.v; });
      var max = Math.max.apply(null, rows.map(function (r) { return r.v; }));
      host.innerHTML = rows.map(function (r, i) {
        var w = Math.round(r.v / max * 100);
        return '<div class="shc-row"><span class="shc-rank r' + (i < 3 ? i + 1 : 0) + '">' + (i + 1) + '</span>' +
          '<span class="shc-label">' + esc(r.label) + '</span>' +
          '<span class="shc-track"><i class="shc-bar" data-w="' + w + '"></i></span>' +
          '<b class="shc-num">' + r.v + '</b></div>';
      }).join('');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          host.querySelectorAll('.shc-bar').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; });
        });
      });
    }

    var charts = [];
    function pct(c) { return (c / curN() * 100).toFixed(1) + '%'; }
    function renderCharts() {
      if (typeof echarts === 'undefined') return;
      var ACC = cssVar('--accent', '#FF3B5C'), ACC2 = cssVar('--accent-2', '#2E6BFF'), TXT = cssVar('--ink', '#26221B');
      charts.forEach(function (c) { c.dispose(); }); charts = [];
      var PAL = [ACC, ACC2, cssVar('--accent-3', '#FFB000'), cssVar('--accent-4', '#12A36B'), cssVar('--twin-yellow', '#FFB000'), cssVar('--twin-green', '#12A36B'), '#8A6FD1', '#3FA8B4'];
      SD.questions.forEach(function (q) {
        var el = document.getElementById('chart-' + q.id); if (!el) return;
        var topIdx = 0; q.options.forEach(function (op, i) { if (countOf(op) > countOf(q.options[topIdx])) topIdx = i; });
        var fmt = function (i) { var c = countOf(q.options[i]); return q.options[i].label + '：' + c + '/' + curN() + ' · ' + pct(c); };
        var chart = echarts.init(el);
        var data = q.options.map(function (op, i) { return { name: op.label, value: countOf(op), itemStyle: { color: PAL[i % PAL.length], borderRadius: [0, 8, 8, 0] } }; });
        if (q.chart === 'pie') {
          chart.setOption({
            animationDuration: 800, animationEasing: 'cubicOut',
            tooltip: { trigger: 'item', formatter: function (p) { return fmt(p.dataIndex); } },
            legend: { bottom: 0, textStyle: { fontSize: 10, color: TXT }, itemWidth: 10, itemHeight: 10 },
            series: [{
              type: 'pie', radius: ['34%', '58%'], center: ['50%', '44%'],
              itemStyle: { borderColor: cssVar('--bg', '#FBF3E1'), borderWidth: 2 },
              label: { fontSize: 9, color: TXT, formatter: function (p) { return p.name + '\n' + pct(countOf(q.options[p.dataIndex])); } },
              emphasis: { label: { fontSize: 11, fontWeight: 'bold' }, itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.2)' } },
              data: data
            }]
          });
        } else {
          chart.setOption({
            animationDuration: 800, animationEasing: 'cubicOut',
            tooltip: { trigger: 'item', formatter: function (p) { return fmt(p.dataIndex); } },
            grid: { left: 8, right: 92, top: 8, bottom: 8, containLabel: true },
            xAxis: { type: 'value', minInterval: 1, axisLabel: { color: TXT }, splitLine: { lineStyle: { color: cssVar('--twin-grid', 'rgba(0,0,0,0.1)') } } },
            yAxis: { type: 'category', inverse: true, data: q.options.map(function (o) { return o.label; }), axisLabel: { fontSize: 10, color: TXT } },
            series: [{
              type: 'bar', barWidth: 14,
              label: { show: true, position: 'right', fontSize: 10, color: TXT, formatter: function (p) { return p.value + '/' + curN(); } },
              emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' } },
              data: data
            }]
          });
        }
        charts.push(chart);
      });
    }
    document.getElementById('surveyToggle').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      view = b.getAttribute('data-v'); save('zxsj66_survey_view', view);
      document.querySelectorAll('#surveyToggle button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === view); });
      document.getElementById('surveySimBadge').hidden = view !== 'total';
      renderCharts();
    });
    document.getElementById('surveyHeader').addEventListener('click', function () { var open = panel.classList.toggle('open'); document.getElementById('surveyArrow').textContent = open ? '▾' : '▸'; if (open) setTimeout(renderCharts, 60); });
    document.getElementById('srsHead').addEventListener('click', function () { var b = document.getElementById('srsBody'); b.hidden = !b.hidden; document.getElementById('srsArrow').textContent = b.hidden ? '▸' : '▾'; });
    renderHeroChart();
    if (panel.classList.contains('open')) setTimeout(renderCharts, 80);
    document.getElementById('soHeader').addEventListener('click', function () { var b = document.getElementById('soBody'); b.hidden = !b.hidden; document.getElementById('soArrow').textContent = b.hidden ? '▸' : '▾'; });
  })();

  /* ================= 指南 ================= */
  (function initGuide() {
    var allFlows = workflows.concat(window.extraWorkflows || []);
    document.getElementById('guideFlows').innerHTML = allFlows.map(function (wf) {
      var prevCampus = null;
      var steps = wf.steps.map(function (st, i) {
        var cross = false;
        if (st.campus && st.campus.indexOf('🔀') !== -1) cross = true;
        if (prevCampus && st.campus && st.campus !== prevCampus && st.campus !== '自备材料' && prevCampus !== '自备材料') cross = true;
        if (st.campus && st.campus !== '自备材料') prevCampus = st.campus;
        return '<li>' + (cross ? '<span class="cross-tag">🔀</span>' : '') + '<span class="step-no">' + (i + 1) + '</span>' + esc(st.text) + '<span class="step-min">' + (st.minutes || 0) + '分钟</span></li>';
      }).join('');
      return '<div class="card flow-card" data-wf="' + wf.id + '"><h3>' + (wf.campusScope === 'cross' ? '🔀 ' : '') + esc(wf.title) + '</h3><p class="flow-total">预计全程 <b>' + wf.estimatedMinutes + '</b> 分钟 · 共 ' + wf.steps.length + ' 步</p><ol class="flow-steps">' + steps + '</ol><button class="btn btn-primary flow-map-btn" data-wf="' + wf.id + '">在地图中查看</button></div>';
    }).join('');
    document.getElementById('guideFlows').addEventListener('click', function (e) {
      var btn = e.target.closest('.flow-map-btn'); if (!btn) return;
      goTo('map'); setTimeout(function () { MapModule.loadWorkflow(btn.getAttribute('data-wf')); }, 300);
    });
    document.getElementById('guideCalendar').innerHTML = '<h3 class="cal-title">' + esc(calendarData.term) + ' 校历关键节点</h3><div class="cal-timeline">' + calendarData.nodes.map(function (n) { return '<div class="cal-node"><span class="cal-date">' + esc(n.date) + '</span><div class="cal-body"><b>' + esc(n.title) + '</b><p>' + esc(n.desc) + '</p></div></div>'; }).join('') + '</div>';
    function medCard(m, idx) { return '<div class="card med-card" data-idx="' + idx + '"><h4 class="med-q">Q：' + esc(m.q) + '<span class="med-arrow">▾</span></h4><p class="med-a">' + esc(m.a) + '</p></div>'; }
    var stopOffset = (window.insuranceGuide || []).length;
    document.getElementById('guideMedical').innerHTML = (window.insuranceGuide || []).map(function (m, i) { return medCard(m, i); }).join('') + '<h3 class="med-stop-title">🎓 毕业生停保专区</h3>' + (window.insuranceStopGuide || []).map(function (m, i) { return medCard(m, stopOffset + i); }).join('');
    document.getElementById('guideMedical').addEventListener('click', function (e) { var h = e.target.closest('.med-q'); if (h) h.parentNode.classList.toggle('collapsed'); });
    document.querySelectorAll('#sec-guide .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#sec-guide .tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('#sec-guide .tab-panel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active'); document.getElementById('tab-' + t.getAttribute('data-tab')).classList.add('active');
        if (window.__applyGuideFilter) window.__applyGuideFilter();
      });
    });
  })();

  /* ================= 搜索×指南融合 ================= */
  (function fusion() {
    var dice = (window.AIService && window.AIService._dice) || function (a, b) { return a === b ? 1 : 0; };
    var allFlows = (window.workflows || []).concat(window.extraWorkflows || []);
    var allMeds = (window.insuranceGuide || []).map(function (m, i) { return { q: m.q, a: m.a, idx: i, stop: false }; }).concat((window.insuranceStopGuide || []).map(function (m, i) { return { q: m.q, a: m.a, idx: i, stop: true }; }));
    function longestCommon(a, b) { var m = a.length, n = b.length, prev = new Array(n + 1).fill(0), cur, best = 0; for (var i = 1; i <= m; i++) { cur = new Array(n + 1).fill(0); for (var j = 1; j <= n; j++) { if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; } } prev = cur; } return best; }
    function isDupOfWorkflow(question) {
      for (var i = 0; i < allFlows.length; i++) { var t = allFlows[i].title; var core = t.replace(/[（(].*?[)）]/g, ''); if (question.indexOf(t) !== -1 || t.indexOf(question) !== -1 || question.indexOf(core) !== -1 || core.indexOf(question) !== -1) return true; if (dice(question, t) > 0.6 || dice(question, core) > 0.6) return true; var short = Math.min(question.length, core.length); if (short >= 4 && longestCommon(question, core) / short >= 0.6) return true; }
      return false;
    }
    function matchFlows(q) { return allFlows.filter(function (w) { if (w.title.indexOf(q) !== -1) return true; return w.steps.some(function (st) { return st.text && st.text.indexOf(q) !== -1; }); }); }
    function matchMeds(q) { return allMeds.filter(function (m) { return m.q.indexOf(q) !== -1 || m.a.indexOf(q) !== -1; }); }
    function activateGuideTab(name) {
      document.querySelectorAll('#sec-guide .tab').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === name); });
      document.querySelectorAll('#sec-guide .tab-panel').forEach(function (x) { x.classList.toggle('active', x.id === 'tab-' + name); });
      if (window.__applyGuideFilter) window.__applyGuideFilter();
    }
    function flash(el) { if (!el) return; el.classList.remove('highlight-flash'); void el.offsetWidth; el.classList.add('highlight-flash'); setTimeout(function () { el.classList.remove('highlight-flash'); }, 1500); }
    window.__gotoWorkflow = function (wfId) { goTo('guide'); activateGuideTab('flows'); setTimeout(function () { var card = document.querySelector('#guideFlows .flow-card[data-wf="' + wfId + '"]'); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(card); } }, 350); };
    window.__gotoMedical = function (idx) { goTo('guide'); activateGuideTab('medical'); setTimeout(function () { var card = document.querySelector('#guideMedical .med-card[data-idx="' + idx + '"]'); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(card); } }, 350); };
    window.__renderSuggest = function () {
      var q = searchInput.value.trim(); if (!q) { suggestBox.hidden = true; return; }
      var hots = (window.hotQuestions || []).filter(function (h) { return !isDupOfWorkflow(h.question) && (h.question.indexOf(q) !== -1 || h.category.indexOf(q) !== -1 || h.tags.join(' ').indexOf(q) !== -1); }).slice(0, 5);
      var flows = matchFlows(q).slice(0, 4), meds = matchMeds(q).slice(0, 4);
      if (!hots.length && !flows.length && !meds.length) { suggestBox.hidden = true; return; }
      var html = '';
      if (hots.length) html += '<div class="suggest-group"><div class="suggest-group-title">🔍 高频问题</div>' + hots.map(function (h) { return '<div class="suggest-item" data-type="hot" data-qid="' + h.id + '">' + (h.campusScope === 'cross' ? '🔀 ' : '') + esc(h.question) + '</div>'; }).join('') + '</div>';
      if (flows.length) html += '<div class="suggest-group"><div class="suggest-group-title">📋 办事流程</div>' + flows.map(function (w) { return '<div class="suggest-item" data-type="flow" data-wf="' + w.id + '">' + (w.campusScope === 'cross' ? '🔀 ' : '') + esc(w.title) + '<span class="suggest-cat">约' + w.estimatedMinutes + '分钟</span></div>'; }).join('') + '</div>';
      if (meds.length) html += '<div class="suggest-group"><div class="suggest-group-title">💊 医保指南</div>' + meds.map(function (m) { return '<div class="suggest-item" data-type="med" data-idx="' + m.idx + '">📋 ' + esc(m.q) + (m.stop ? '<span class="suggest-cat">停保</span>' : '') + '</div>'; }).join('') + '</div>';
      suggestBox.innerHTML = html; suggestBox.hidden = false;
    };
    window.__suggestClick = function (e) {
      var it = e.target.closest('.suggest-item'); if (!it) return;
      var type = it.getAttribute('data-type'); suggestBox.hidden = true;
      if (type === 'hot') { var qid = it.getAttribute('data-qid'); var item = (window.hotQuestions || []).find(function (x) { return x.id === qid; }); if (item) searchInput.value = item.question; window.__runSearchByVal(item ? item.question : ''); }
      else if (type === 'flow') window.__gotoWorkflow(it.getAttribute('data-wf'));
      else if (type === 'med') window.__gotoMedical(it.getAttribute('data-idx'));
    };
    window.__runSearchByVal = function (v) { searchInput.value = v; document.getElementById('searchBtn').click(); };
    window.__renderRelatedCards = function (q) {
      var old = document.getElementById('relatedWrap'); if (old) old.parentNode.removeChild(old);
      var flows = matchFlows(q).slice(0, 2), meds = matchMeds(q).slice(0, 2);
      if (!flows.length && !meds.length) return;
      var wrap = document.createElement('div'); wrap.id = 'relatedWrap';
      wrap.innerHTML = flows.map(function (w) { return '<div class="card related-card related-flow"><div class="related-head">📋 相关办事流程</div><div class="related-body"><b>' + (w.campusScope === 'cross' ? '🔀 ' : '') + esc(w.title) + '</b><span class="related-meta">预计全程 ' + w.estimatedMinutes + ' 分钟 · ' + w.steps.length + ' 步</span></div><button class="btn btn-primary related-btn" data-wf="' + w.id + '">查看详情</button></div>'; }).join('') + meds.map(function (m) { return '<div class="card related-card related-med"><div class="related-head">💊 相关医保政策' + (m.stop ? '<span class="suggest-cat">停保</span>' : '') + '</div><div class="related-body"><b>Q：' + esc(m.q) + '</b><p class="related-snippet">' + esc(m.a.slice(0, 80)) + '…</p></div><button class="btn btn-primary related-btn" data-idx="' + m.idx + '">查看完整指南</button></div>'; }).join('');
      resultBox.parentNode.insertBefore(wrap, resultBox);
      wrap.addEventListener('click', function (e) { var b = e.target.closest('.related-btn'); if (!b) return; if (b.getAttribute('data-wf')) window.__gotoWorkflow(b.getAttribute('data-wf')); else window.__gotoMedical(b.getAttribute('data-idx')); });
    };
    var guideKw = '';
    window.__applyGuideFilter = function () {
      var activeTab = document.querySelector('#sec-guide .tab.active');
      var tabName = activeTab ? activeTab.getAttribute('data-tab') : 'flows';
      if (tabName === 'calendar') return;
      var scope = tabName === 'flows' ? '#guideFlows .flow-card' : '#guideMedical .med-card';
      var cards = document.querySelectorAll(scope);
      cards.forEach(function (c) { var hit = !guideKw || c.textContent.indexOf(guideKw) !== -1; c.style.display = hit ? '' : 'none'; });
    };
    var input = document.getElementById('guideSearch'), clearBtn = document.getElementById('guideSearchClear');
    input.addEventListener('input', function () { guideKw = input.value.trim(); clearBtn.hidden = !guideKw; window.__applyGuideFilter(); });
    clearBtn.addEventListener('click', function () { input.value = ''; guideKw = ''; clearBtn.hidden = true; window.__applyGuideFilter(); });
    var WORKFLOW_LINK = { q7: 'wf-card', q8: 'wf-loss', q9: 'wf-score', q11: 'wf-fuxiu', q14: 'wf-card', q33: 'wf-visitor' };
    window.__wfLinkButton = function (qid) { var wfId = WORKFLOW_LINK[qid]; if (!wfId) return ''; var wf = allFlows.find(function (w) { return w.id === wfId; }); if (!wf) return ''; return '<div class="detail-wflink"><button class="btn btn-ghost related-btn" data-wfgoto="' + wfId + '">📋 查看完整办事流程：' + esc(wf.title) + '</button></div>'; };
  })();

  /* ================= 彩蛋 ================= */
  var EasterModule = (function () {
    var overlay = document.createElement('div');
    overlay.id = 'easterOverlay'; overlay.hidden = true;
    overlay.innerHTML = '<div class="easter-card"><button class="card-x" id="easterClose">✕</button><div class="easter-emoji">🌊</div><h3>蛟湖彩蛋</h3><p>你发现了藏在"智行江畔"里的小秘密——蛟湖，江财人心里的那片湖。</p><p class="easter-tip">据说在这里许下新学期愿望的人，期末都不会挂科。</p><p class="easter-sign">—— 智行江畔团队 敬上</p></div>';
    document.body.appendChild(overlay);
    function open(source) { overlay.hidden = false; try { localStorage.setItem('zxsj66_easter', JSON.stringify({ opened: true, source: source || 'logo', ts: Date.now() })); } catch (e) {} }
    function close() { overlay.hidden = true; }
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.id === 'easterClose') close(); });
    var clicks = 0, timer = null;
    var logo = document.querySelector('.sidebar-brand');
    if (logo) { logo.style.cursor = 'pointer'; logo.addEventListener('click', function () { clicks++; clearTimeout(timer); timer = setTimeout(function () { clicks = 0; }, 6000); if (clicks >= 5) { clicks = 0; open('logo5x'); } }); }
    return { open: open, close: close };
  })();
  window.EasterModule = EasterModule;

  /* ================= 我的 / KB / 数据 / 学习 / 音效 ================= */
  function renderMineVotes() {
    var box = document.getElementById('mineVotes');
    if (!votedSet.length) { box.innerHTML = '<p class="empty-tip">还没有支持过任何点位，去地图点一点～</p>'; return; }
    box.innerHTML = votedSet.map(function (id) { var sp = findSpot(id); return sp ? '<div class="mine-row"><b>' + esc(sp.name) + '</b><span>👍 ' + getVotes(id) + ' · ' + esc(sp.campus) + '</span></div>' : ''; }).join('');
  }
  function renderMineHist() {
    var box = document.getElementById('mineHist'); var h = getHist();
    box.innerHTML = h.length ? h.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') : '<span class="empty-tip">暂无搜索历史</span>';
  }
  document.getElementById('mineTeam').textContent = (window.TEAM_NAME || '智行江畔团队') + ' · 江财校园生活智能助手：搜得到答案，看得见路径。';
  document.getElementById('mineVer').textContent = '版本号 ' + (window.SITE_VERSION || 'V9.0');

  /* KB 成长 */
  var KB_KEY = 'zxsj66_aikb', PEND_KEY = 'zxsj66_pending';
  function kbList() { return load(KB_KEY, []); }
  function kbSeed() {
    if (window.KB_DEMO_MODE === false) return;
    try { if (localStorage.getItem(KB_KEY) !== null) return; } catch (e) {}
    var KB_SEED_IDS = ['q15', 'q16', 'q20', 'q7', 'q17', 'q19', 'q21', 'q12', 'q2', 'q8'];
    var hq = window.hotQuestions || [], DAY = 86400000, now = Date.now(), list = [];
    var daysAgo = [6, 6, 5, 4, 4, 3, 2, 2, 1, 0], hitSeed = [3, 0, 2, 1, 0, 1, 2, 0, 1, 4];
    KB_SEED_IDS.forEach(function (id, i) { var q = null; for (var j = 0; j < hq.length; j++) if (hq[j].id === id) q = hq[j]; if (!q) return; list.push({ q: q.question, a: q.answer, ts: now - daysAgo[i] * DAY - (i % 5) * 3600000, hits: hitSeed[i], src: '演示种子' }); });
    save(KB_KEY, list); try { localStorage.setItem('zxsj66_kb_demo', '1'); } catch (e) {}
    save(PEND_KEY, { '四级报名什么时候截止？': 1, '奖学金评定标准是什么？': 2 });
  }
  kbSeed();
  function renderKbGrowth() {
    var countEl = document.getElementById('kbCount'); if (!countEl) return;
    var list = kbList(), pend = load(PEND_KEY, {});
    var hits = 0, today = new Date(); today.setHours(0, 0, 0, 0);
    var days = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (it) { hits += (it.hits || 0); var d = it.ts ? new Date(it.ts) : new Date(); var idx = 6 - Math.round((today - new Date(d.setHours(0, 0, 0, 0))) / 86400000); if (idx >= 0 && idx < 7) days[idx]++; });
    countEl.textContent = list.length;
    document.getElementById('kbHits').textContent = hits;
    document.getElementById('kbPend').textContent = Object.keys(pend).length;
    var demoFlag = false; try { demoFlag = localStorage.getItem('zxsj66_kb_demo') === '1'; } catch (e) {}
    document.getElementById('kbBadge').hidden = !(window.KB_DEMO_MODE !== false && demoFlag);
    var max = Math.max.apply(null, days.concat([1]));
    var labels = []; for (var i = 0; i < 7; i++) { var d2 = new Date(today.getTime() - (6 - i) * 86400000); labels.push((d2.getMonth() + 1) + '/' + d2.getDate()); }
    document.getElementById('kbChart').innerHTML = days.map(function (n, i) { return '<div class="kb-col" title="' + labels[i] + ' 新增 ' + n + ' 条"><span class="kb-col-n">' + n + '</span><i style="height:' + Math.round(n / max * 100) + '%"></i><span class="kb-col-d">' + (i === 6 ? '今' : labels[i].split('/')[1]) + '</span></div>'; }).join('');
  }
  renderKbGrowth();
  function kbFind(q) { var list = kbList(); for (var i = 0; i < list.length; i++) if (list[i].q === q || (window.AIService._dice(list[i].q, q) > 0.85)) return list[i]; return null; }
  function kbSave(q, a) { if (window.AIService.hitHighRisk(q)) return; if (a.indexOf('该问题涉及专业医疗') !== -1) return; var list = kbList(), hit = null; for (var i = 0; i < list.length; i++) if (list[i].q === q) hit = list[i]; if (hit) { hit.a = a; hit.ts = Date.now(); } else list.push({ q: q, a: a, ts: Date.now(), hits: 0 }); save(KB_KEY, list.slice(-50)); renderKbGrowth(); }
  function kbTouch(q) { var list = kbList(); for (var i = 0; i < list.length; i++) if (list[i].q === q) { list[i].hits = (list[i].hits || 0) + 1; save(KB_KEY, list); renderKbGrowth(); return; } }
  function pendMiss(q) { var map = load(PEND_KEY, {}); map[q] = (map[q] || 0) + 1; save(PEND_KEY, map); return map[q]; }
  (function wrapAI() {
    if (!window.AIService || !window.AIService.callAI) return;
    var _call = window.AIService.callAI;
    window.AIService.callAI = function (q) {
      var kb = kbFind(q);
      if (kb) { kbTouch(kb.q); return Promise.resolve(kb.a + '\n\n——📚 本地知识沉淀（已命中 ' + ((kb.hits || 0) + 1) + ' 次，优先复用）'); }
      var missCount = pendMiss(q);
      return _call(q).then(function (ans) { kbSave(q, ans); if (missCount >= 3) ans = '（该问题已记录，将尽快补充进本地知识库）\n' + ans; return ans; });
    };
  })();

  /* 学习资源彩蛋 */
  var STUDY_GROUPS = ['高数', '英语', '编程', '社区'];
  function renderStudy() {
    document.getElementById('studyBody').innerHTML = STUDY_GROUPS.map(function (t) {
      var items = (window.studyResources || []).filter(function (r) { return r.type === t; }); if (!items.length) return '';
      return '<div class="study-group"><h5>' + t + '</h5>' + items.map(function (r) { return '<a class="study-item" href="' + esc(r.url) + '" target="_blank" rel="noopener"><b>' + esc(r.title) + '</b><span>' + esc(r.description) + '</span></a>'; }).join('') + '</div>';
    }).join('');
  }
  document.getElementById('studyHeader').addEventListener('click', function () { var open = document.getElementById('studyPanel').classList.toggle('open'); document.getElementById('studyArrow').textContent = open ? '▾' : '▸'; if (open) renderStudy(); });

  /* 数据管理 */
  function dataPanelInit() {
    var head = document.getElementById('dataHeader'), body = document.getElementById('dataBody');
    if (!head || !body || !window.ZXSJ) return;
    var DS = window.ZXSJ.DataSource;
    var arrow = document.getElementById('dataArrow'), realStatus = document.getElementById('realStatus'), realClear = document.getElementById('realClear'), wxStatus = document.getElementById('weatherStatus'), soundToggle = document.getElementById('soundToggle');
    function refresh() {
      var n = DS.realCount(); realStatus.textContent = n ? ('已导入 ' + n + ' 条实测数据') : '未导入（当前为模拟数据）'; realClear.hidden = !n;
      var cfg = window.WEATHER_CONFIG || {}; var w = DS.getWeather(); var wText = { sunny: '晴天', rain: '雨天', snow: '雪天' }[w.condition] || w.condition;
      wxStatus.textContent = cfg.KEY ? ('已配置 · 当前 ' + wText + ' ' + w.temp + '°') : ('未配置 Key（默认晴天）· 当前按' + wText + '展示');
      soundToggle.checked = !Sfx.muted();
    }
    head.addEventListener('click', function () { var show = body.hidden; body.hidden = !show; arrow.textContent = show ? '▾' : '▸'; if (show) refresh(); });
    document.getElementById('realImport').addEventListener('click', function () { document.getElementById('realFile').click(); });
    document.getElementById('realFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { try { var r = DS.importRealData(JSON.parse(rd.result)); toast(r.ok ? ('已导入 ' + r.count + ' 条实测数据') : ('导入失败：' + r.err)); } catch (err) { toast('导入失败：JSON 解析错误'); } refresh(); e.target.value = ''; };
      rd.readAsText(f);
    });
    realClear.addEventListener('click', function () { DS.clearRealData(); toast('已清除实测数据，恢复模拟数据源'); refresh(); });
    soundToggle.addEventListener('change', function () { Sfx.setMuted(!soundToggle.checked); toast(soundToggle.checked ? '交互音效已开启' : '交互音效已静音'); if (soundToggle.checked) Sfx.play('click'); });
  }
  dataPanelInit();

  /* 微音效 */
  var Sfx = (function () {
    var ctx = null;
    function muted() { try { return localStorage.getItem('zxsj66_mute') !== '0'; } catch (e) { return true; } }
    function ac() { if (muted()) return null; if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    function tone(freq, ms, swell) {
      var c = ac(); if (!c) return;
      try { var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = freq; var t0 = c.currentTime, vol = 0.08, dur = ms / 1000; if (swell) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); } else { g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); } o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02); } catch (e) {}
    }
    return { play: function (k) { if (k === 'view') tone(220, 50); else if (k === 'open3d') tone(110, 200, 1); else tone(440, 30); }, muted: muted, setMuted: function (m) { try { localStorage.setItem('zxsj66_mute', m ? '1' : '0'); } catch (e) {} } };
  })();
  window.__sfx = Sfx;

  /* 摄像头手势开关（设置抽屉内） */
  function gestureToggleInit() {
    var toggle = document.getElementById('gestureToggle'); if (!toggle) return;
    toggle.checked = !!(window.ZXSJ.Gestures && window.ZXSJ.Gestures.isEnabled());
    toggle.addEventListener('change', function () {
      if (toggle.checked) { if (!(window.ZXSJ.Gestures && window.ZXSJ.Gestures.enable())) toggle.checked = false; }
      else if (window.ZXSJ.Gestures) window.ZXSJ.Gestures.disable();
      syncGestureButtons();
    });
  }
  function syncGestureButtons() {
    var on = !!(window.ZXSJ.Gestures && window.ZXSJ.Gestures.isEnabled());
    var b1 = document.getElementById('gestureTwinBtn'), b2 = document.getElementById('gestureMapBtn');
    if (b1) { b1.hidden = MOBILE || !(window.ZXSJ.Gestures && window.ZXSJ.Gestures.supported()); b1.classList.toggle('on', on); b1.textContent = on ? '✋ 手势开' : '✋ 手势控制'; }
    if (b2) { b2.hidden = MOBILE || !(window.ZXSJ.Gestures && window.ZXSJ.Gestures.supported()); b2.classList.toggle('on', on); b2.textContent = on ? '✋ 手势开' : '✋ 手势导航'; }
    if (MapModule && MapModule.syncGestureSupport) MapModule.syncGestureSupport();
  }
  var btnTwin = document.getElementById('gestureTwinBtn');
  if (btnTwin) btnTwin.addEventListener('click', function () { if (window.ZXSJ.Gestures) window.ZXSJ.Gestures.toggle(); syncGestureButtons(); toast(window.ZXSJ.Gestures.isEnabled() ? '手势控制已开启（在 3D 查看器内生效）' : '手势控制已关闭'); });
  var btnMap = document.getElementById('gestureMapBtn');
  if (btnMap) btnMap.addEventListener('click', function () { if (window.ZXSJ.Gestures) window.ZXSJ.Gestures.toggle(); syncGestureButtons(); toast(window.ZXSJ.Gestures.isEnabled() ? '手势控制已开启（捏合缩放 / 移动手指平移）' : '手势控制已关闭'); });
  gestureToggleInit(); syncGestureButtons();

  /* 设置抽屉动态内容渲染 */
  function renderSettingsDynamic() { renderMineVotes(); renderMineHist(); renderKbGrowth(); }

  /* 圆点导航 */
  (function dotnav() {
    var box = document.getElementById('dotNav');
    window.__renderDotnav = function () {
      box.innerHTML = SECTIONS.map(function (n) { return '<button data-dot="' + n + '"' + (n === activeSec ? ' class="on"' : '') + ' aria-label="' + n + '"></button>'; }).join('');
    };
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-dot]'); if (b) { playTransit(); goTo(b.getAttribute('data-dot')); } });
    window.__renderDotnav();
  })();

  /* ================= 启动 ================= */
  renderHist(); renderHot(); renderMineVotes(); renderMineHist(); GraphModule.ensure();
  (function greet() {
    var el = document.getElementById('searchGreet'); if (!el) return;
    var now = new Date(), dateStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    var text = null, saved = null;
    try { saved = JSON.parse(localStorage.getItem('zxsj71_greet')); } catch (e) {}
    if (saved && saved.date === dateStr && saved.text) text = saved.text;
    if (!text) { var h = now.getHours(); text = h < 12 ? '早上好，今天去哪栋楼？' : (h < 18 ? '下午好，食堂现在应该不挤' : '晚上好，图书馆还有位置吗？'); try { localStorage.setItem('zxsj71_greet', JSON.stringify({ date: dateStr, text: text })); } catch (e) {} }
    el.textContent = text;
  })();
  (function mapHead() { var el = document.getElementById('mapHeadSub'); if (el) el.textContent = ((window.spots || []).length) + ' 个实测坐标，三步走到任何办公室'; })();
  (function revealInit() {
    var els = document.querySelectorAll('.reveal'); if (!els.length) return;
    if (!('IntersectionObserver' in window) || RM) { els.forEach(function (e2) { e2.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: 0.06 });
    els.forEach(function (e2) { io.observe(e2); });
    /* 兜底：1.6s 后仍未触发的强制显现（防嵌套滚动容器内 IO 漏触发导致内容隐藏） */
    setTimeout(function () { els.forEach(function (e2) { e2.classList.add('in'); }); }, 1600);
  })();
  /* 主题切换时刷新图谱/孪生/地图样式（依赖 CSS 变量与高德样式） */
  document.addEventListener('zxsj66:theme-change', function () {
    if (TwinModule && TwinModule.isOpen()) TwinModule.tick(true);
    if (window.MapModule) window.MapModule.syncMapTheme();
  });
  /* 演示天气场景切换：孪生即时刷新（夜景滤镜 / 天气 chip / 3D 变暗） */
  document.addEventListener('zxsj66:scene-change', function () {
    if (TwinModule && TwinModule.isOpen()) TwinModule.tick(true);
  });

  syncNav();
  window.MapModule = MapModule;
  window.TwinModule = TwinModule;
})();
