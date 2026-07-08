/* 주식 배움터 — vanilla JS, 외부 의존성 없음 */
(function () {
  'use strict';
  const RECO = window.RECO;
  const SIM = window.SIM_RESULTS || {};
  const EASY = window.EASY || {};
  const GLOSSARY = window.GLOSSARY || [];
  const LESSONS = window.LESSONS || [];
  const CHECKLIST = window.CHECKLIST || [];
  const FAQ = window.FAQ || [];

  const HORIZONS = {
    day:   { label: '당일',   color: 'var(--series-1)', easy: '하루 안에 사고팔기' },
    week:  { label: '1주일',  color: 'var(--series-2)', easy: '일주일쯤 갖고 있기' },
    month: { label: '1개월',  color: 'var(--series-5)', easy: '한 달쯤 갖고 있기' },
    long:  { label: '장기',   color: 'var(--series-4)', easy: '1년 이상 푹 기다리기' },
  };
  const LEVELS = {
    ok:  { label: '🟢 초보 OK',  cls: 'lvl-ok' },
    mid: { label: '🟡 조심조심', cls: 'lvl-mid' },
    pro: { label: '🔴 전문가용', cls: 'lvl-pro' },
  };
  const RISKS = {
    low: { label: '리스크 낮음', color: 'var(--status-good)' },
    mid: { label: '리스크 중간', color: 'var(--status-warning)' },
    high: { label: '리스크 높음', color: 'var(--status-serious)' },
    veryhigh: { label: '리스크 매우높음', color: 'var(--status-critical)' },
  };
  const MARKETS = { US: '🇺🇸 미국', KR: '🇰🇷 한국' };
  const KIND_X = {
    day:   { axis: ['개장', '장중', '마감'], tip: i => `개장 후 ${i * 30}분`, stepLabel: s => `+${s * 30}분` },
    week:  { axis: ['D0', 'D+2', 'D+5'], tip: i => `D+${i}`, stepLabel: s => `D+${s}` },
    month: { axis: ['D0', 'D+10', 'D+21'], tip: i => `D+${i}`, stepLabel: s => `D+${s}` },
    long:  { axis: ['0', '6개월', '12개월'], tip: i => `${Math.round(i / 21)}개월 후`, stepLabel: s => `${Math.round(s / 21)}개월` },
  };
  const VIEWS = ['home', 'reco', 'sure', 'practice', 'learn', 'history', 'tax'];
  const MENU_DESC = {
    home: '오늘의 요약과 시작 가이드',
    reco: '기간별 추천 종목과 매매 계획',
    sure: '확실함 최우선 — 무위험 금리 자산과 장기 지수 적립 (확실, 안전, 보장)',
    practice: '가상 돈으로 계획 세우기 연습',
    learn: '주식 기초 · 체크리스트 · 용어사전 · FAQ',
    history: '지난 추천 기록 보관함',
    tax: '세금 규칙과 실수령 계산',
  };
  const MENU_LABEL = { home: '🏠 홈', reco: '📋 추천 종목', sure: '🔒 확실 수익', practice: '🎮 연습하기', learn: '📚 배우기', history: '🗂️ 히스토리', tax: '🧾 세금 계산' };

  const state = {
    view: 'home', horizon: 'all', market: 'all', level: 'all', divOnly: false, batch: 0,
    easy: localStorage.getItem('easymode') !== '0',
  };

  // ───────── 유틸 ─────────
  const $ = sel => document.querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function money(v, cur) {
    if (cur === 'KRW') return v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '원';
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function krw(v) { return Math.round(v).toLocaleString('ko-KR') + '원'; }
  function pct(v, signed = true) { return (signed && v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function pctCls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
  function batchPicks() { return RECO.batches[state.batch].picks; }
  function pickLevel(p) { return (EASY[p.id] && EASY[p.id].level) || 'mid'; }
  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // ───────── 용어 팝오버 ─────────
  const TERMS = GLOSSARY.slice().sort((a, b) => b.term.length - a.term.length);
  const popover = $('#popover');
  function showPopover(anchor, term, easyText) {
    popover.textContent = '';
    popover.appendChild(el('div', 'pt', '📖 ' + term));
    popover.appendChild(el('div', null, easyText));
    popover.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 6;
    let left = r.left + window.scrollX;
    popover.style.top = top + 'px';
    popover.style.left = '0px';
    const pw = popover.offsetWidth;
    if (left + pw > window.scrollX + document.documentElement.clientWidth - 8)
      left = window.scrollX + document.documentElement.clientWidth - pw - 8;
    popover.style.left = Math.max(8, left) + 'px';
  }
  function hidePopover() { popover.style.display = 'none'; }
  document.addEventListener('click', e => {
    const t = e.target.closest('.term');
    if (t) { showPopover(t, t.dataset.term, t.dataset.easy); e.stopPropagation(); return; }
    if (!e.target.closest('.popover')) hidePopover();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hidePopover();
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('term')) {
      e.preventDefault();
      const t = document.activeElement;
      showPopover(t, t.dataset.term, t.dataset.easy);
    }
  });

  // 텍스트에 용어 밑줄 달기 (쉬운말 모드) — 블록당 용어별 1회
  function linkTerms(text) {
    if (!state.easy) return document.createTextNode(text);
    const frag = document.createDocumentFragment();
    const used = new Set();
    let rest = text;
    while (rest.length) {
      let bestIdx = -1, bestTerm = null;
      for (const g of TERMS) {
        if (used.has(g.term)) continue;
        const idx = rest.indexOf(g.term);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && g.term.length > bestTerm.term.length))) {
          bestIdx = idx; bestTerm = g;
        }
      }
      if (bestIdx === -1) { frag.appendChild(document.createTextNode(rest)); break; }
      if (bestIdx > 0) frag.appendChild(document.createTextNode(rest.slice(0, bestIdx)));
      const span = el('span', 'term', bestTerm.term);
      span.tabIndex = 0;
      span.setAttribute('role', 'button');
      span.dataset.term = bestTerm.term;
      span.dataset.easy = bestTerm.easy;
      frag.appendChild(span);
      used.add(bestTerm.term);
      rest = rest.slice(bestIdx + bestTerm.term.length);
    }
    return frag;
  }
  function liTerms(text) { const li = el('li'); li.appendChild(linkTerms(text)); return li; }

  // ───────── 카드 목록 ─────────
  function filteredPicks() {
    return batchPicks().filter(p =>
      (state.horizon === 'all' || p.horizon === state.horizon) &&
      (state.market === 'all' || p.market === state.market) &&
      (state.level === 'all' || pickLevel(p) === state.level) &&
      (!state.divOnly || (p.dividend && p.dividend.yieldPct >= 0.3))
    );
  }
  function chipDot(color) { const d = el('span', 'dot'); d.style.background = color; return d; }
  function chip(text, color) {
    const c = el('span', 'chip');
    if (color) c.appendChild(chipDot(color));
    c.appendChild(document.createTextNode(text));
    return c;
  }
  function levelBadge(p) {
    const lv = LEVELS[pickLevel(p)];
    return el('span', 'lvl ' + lv.cls, lv.label);
  }

  function sparkline(sim) {
    const W = 92, H = 30, m = 3;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark', 'aria-hidden': 'true' });
    if (!sim) return svg;
    const ys = sim.bands.p50;
    const lo = Math.min(...ys, 0), hi = Math.max(...ys, 0.01);
    const x = i => m + (W - 2 * m) * (i / (ys.length - 1));
    const y = v => H - m - (H - 2 * m) * ((v - lo) / (hi - lo));
    const d = ys.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: 'var(--baseline)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const last = ys.length - 1;
    svg.appendChild(svgEl('circle', { cx: x(last).toFixed(1), cy: y(ys[last]).toFixed(1), r: 3.5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    return svg;
  }

  function pickCard(p) {
    const sim = SIM[p.simId];
    const easy = EASY[p.id];
    const card = el('article', 'card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${p.name} 상세 보기`);

    const chips = el('div', 'chiprow');
    chips.appendChild(chip(HORIZONS[p.horizon].label, HORIZONS[p.horizon].color));
    chips.appendChild(chip(MARKETS[p.market]));
    chips.appendChild(levelBadge(p));
    card.appendChild(chips);

    const tl = el('div', 'titleline');
    tl.appendChild(el('span', 'tk', p.ticker));
    tl.appendChild(el('span', 'nm', p.name));
    tl.appendChild(el('span', 'price', money(p.refPrice, p.currency)));
    card.appendChild(tl);

    if (state.easy && easy) card.appendChild(el('div', 'easyline', '💡 ' + easy.company));

    const plan = el('div', 'plan');
    const b = el('div'); b.appendChild(el('b', null, '사기 ')); b.appendChild(document.createTextNode(`${money(p.buy.low, p.currency)}–${money(p.buy.high, p.currency)} · ${p.buy.windowKst}`));
    const s = el('div'); s.appendChild(el('b', null, '팔기 ')); s.appendChild(document.createTextNode(`${money(p.sell.low, p.currency)}–${money(p.sell.high, p.currency)} · ${p.sell.windowKst}`));
    plan.appendChild(b); plan.appendChild(s);
    card.appendChild(plan);

    const stats = el('div', 'statrow');
    const s1 = el('div', 'stat');
    s1.appendChild(el('span', 'lb', '잘 되면'));
    s1.appendChild(el('span', 'vl ' + pctCls(p.expectedReturn.base), pct(p.expectedReturn.base)));
    stats.appendChild(s1);
    if (sim) {
      const s2 = el('div', 'stat');
      s2.appendChild(el('span', 'lb', '이익 확률'));
      s2.appendChild(el('span', 'vl', sim.final.pProfit.toFixed(0) + '%'));
      stats.appendChild(s2);
    }
    stats.appendChild(sparkline(sim));
    card.appendChild(stats);
    card.appendChild(el('div', 'more', '왜 추천? · 시뮬레이션 · 세금 →'));

    card.addEventListener('click', () => openModal(p));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p); } });
    return card;
  }

  function renderCards() {
    const grid = $('#cards');
    grid.textContent = '';
    const picks = filteredPicks();
    $('#count').textContent = `${picks.length}개 종목`;
    picks.forEach(p => grid.appendChild(pickCard(p)));
    if (!picks.length) grid.appendChild(el('p', 'hist-note', '조건에 맞는 종목이 없어요. 필터를 바꿔 보세요.'));
  }

  // ───────── 홈 ─────────
  function renderHome() {
    const wrap = $('#view-home');
    wrap.textContent = '';
    const batch = RECO.batches[0];

    const hero = el('div', 'hero');
    const stormy = /급락|쇼크|하락/.test(batch.title + batch.marketSnapshot);
    hero.appendChild(el('div', 'weather', stormy ? '오늘의 시장 날씨: 🌧️ → 🌤️ 소나기 뒤 갬을 기다려요' : '오늘의 시장 날씨: ☀️ 대체로 맑음'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms(state.easy
      ? '어제 반도체 회사들(삼성전자 등)의 주가가 비를 맞은 것처럼 뚝 떨어졌어요. 이럴 때는 "너무 많이 떨어진 좋은 회사"를 싸게 살 기회가 생기기도 해요. 아래 추천들이 바로 그 기회를 노려요.'
      : batch.marketSnapshot));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    wrap.appendChild(el('h2', 'homesec', '🚀 처음이라면 이 순서대로!'));
    const steps = el('div', 'steps');
    const stepDefs = [
      ['1단계', '📚 배우기', '주식이 뭔지 5분 만에 알아봐요', 'learn'],
      ['2단계', '📋 추천 보기', '🟢 초보 OK 종목부터 살펴봐요', 'reco'],
      ['3단계', '🎮 연습하기', '가상 돈으로 계획을 세워 봐요', 'practice'],
    ];
    for (const [sn, st, sd, view] of stepDefs) {
      const c = el('div', 'step-card');
      c.tabIndex = 0; c.setAttribute('role', 'button');
      c.appendChild(el('div', 'sn', sn));
      c.appendChild(el('div', 'st', st));
      c.appendChild(el('div', 'sd', sd));
      const go = () => { if (view === 'reco') state.level = view === 'reco' && state.easy ? 'ok' : state.level; state.view = view; renderAll(); window.scrollTo({ top: 0 }); };
      c.addEventListener('click', go);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      steps.appendChild(c);
    }
    wrap.appendChild(steps);

    wrap.appendChild(el('h2', 'homesec', '⭐ 오늘의 추천 TOP 3 (초보 눈높이 순)'));
    const order = { ok: 0, mid: 1, pro: 2 };
    const top3 = batchPicks().slice().sort((a, b) => {
      const d = order[pickLevel(a)] - order[pickLevel(b)];
      if (d) return d;
      return (SIM[b.simId]?.final.pProfit || 0) - (SIM[a.simId]?.final.pProfit || 0);
    }).slice(0, 3);
    const grid = el('div', 'grid');
    top3.forEach(p => grid.appendChild(pickCard(p)));
    wrap.appendChild(grid);

    const btnRow = el('div');
    btnRow.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.9rem';
    const all = el('button', 'iconbtn', '추천 12개 전부 보기 →');
    all.type = 'button';
    all.addEventListener('click', () => { state.view = 'reco'; state.level = 'all'; renderAll(); window.scrollTo({ top: 0 }); });
    btnRow.appendChild(all);
    const sureBtn = el('button', 'iconbtn', '🔒 잃기 싫다면? 확실 수익부터 →');
    sureBtn.type = 'button';
    sureBtn.addEventListener('click', () => { state.view = 'sure'; renderAll(); window.scrollTo({ top: 0 }); });
    btnRow.appendChild(sureBtn);
    wrap.appendChild(btnRow);

    wrap.appendChild(el('h2', 'homesec', '✅ 사기 전 체크리스트'));
    const ul = el('ul', 'pts');
    CHECKLIST.slice(0, 4).forEach(t => ul.appendChild(liTerms(t)));
    wrap.appendChild(ul);
    const moreChk = el('button', 'iconbtn', '전체 체크리스트 보기 →');
    moreChk.type = 'button';
    moreChk.style.marginTop = '0.6rem';
    moreChk.addEventListener('click', () => { state.view = 'learn'; renderAll(); window.scrollTo({ top: 0 }); });
    wrap.appendChild(moreChk);
  }

  // ───────── 팬 차트 ─────────
  function fanChart(sim, pick) {
    const box = el('div', 'chartbox');
    const head = el('div', 'chead');
    head.appendChild(el('span', 'ctitle', '미래 2만 번 실험 결과 (수익률 경로)'));
    head.appendChild(el('span', 'csub', '몬테카를로 · 백분위 밴드'));
    const tgl = el('button', 'tglbtn', '표로 보기');
    tgl.type = 'button';
    head.appendChild(tgl);
    box.appendChild(head);

    const W = 640, H = 270, L = 48, R = 18, T = 16, B = 32;
    const pw = W - L - R, ph = H - T - B;
    const bands = sim.bands, n = bands.steps.length, maxStep = bands.steps[n - 1];
    const yLo = Math.min(...bands.p5, 0), yHi = Math.max(...bands.p95, 0);
    const pad = (yHi - yLo) * 0.08;
    const y0 = yLo - pad, y1 = yHi + pad;
    const xAt = i => L + pw * (bands.steps[i] / maxStep);
    const yAt = v => T + ph * (1 - (v - y0) / (y1 - y0));

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0', 'aria-label': '시뮬레이션 수익률 백분위 밴드 차트. 화살표 키로 시점 이동.' });
    const step = niceStep((y1 - y0) / 5);
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      const yy = yAt(v);
      svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'var(--grid)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: L - 7, y: yy + 3.5, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
      t.textContent = (v > 0 ? '+' : '') + v.toFixed(0) + '%';
      svg.appendChild(t);
    }
    if (y0 < 0 && y1 > 0) svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yAt(0), y2: yAt(0), stroke: 'var(--baseline)', 'stroke-width': 1 }));

    const area = (loArr, hiArr) => {
      let d = '';
      for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(hiArr[i]).toFixed(1);
      for (let i = n - 1; i >= 0; i--) d += 'L' + xAt(i).toFixed(1) + ' ' + yAt(loArr[i]).toFixed(1);
      return d + 'Z';
    };
    svg.appendChild(svgEl('path', { d: area(bands.p5, bands.p95), fill: 'var(--series-1)', 'fill-opacity': 0.08 }));
    svg.appendChild(svgEl('path', { d: area(bands.p25, bands.p75), fill: 'var(--series-1)', 'fill-opacity': 0.16 }));
    const med = bands.p50.map((v, i) => (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1)).join(' ');
    svg.appendChild(svgEl('path', { d: med, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const li = n - 1;
    svg.appendChild(svgEl('circle', { cx: xAt(li), cy: yAt(bands.p50[li]), r: 4, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    const endLb = svgEl('text', { x: xAt(li) - 6, y: yAt(bands.p50[li]) - 8, 'text-anchor': 'end', fill: 'var(--text-primary)', 'font-size': 11, 'font-weight': 650 });
    endLb.textContent = '중앙값 ' + pct(bands.p50[li]);
    svg.appendChild(endLb);

    const kx = KIND_X[pick.horizon];
    const axisPts = [0, Math.floor((n - 1) / 2), n - 1];
    kx.axis.forEach((lab, i) => {
      const t = svgEl('text', { x: xAt(axisPts[i]), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', fill: 'var(--text-muted)', 'font-size': 10 });
      t.textContent = lab;
      svg.appendChild(t);
    });

    const cross = svgEl('line', { y1: T, y2: T + ph, stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden' });
    svg.appendChild(cross);
    const overlay = svgEl('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(overlay);
    const tip = el('div', 'viztip');
    box.appendChild(tip);

    const ROWS = [['95백분위', 'p95'], ['75백분위', 'p75'], ['중앙값', 'p50'], ['25백분위', 'p25'], ['5백분위', 'p5']];
    let curIdx = n - 1;
    function showIdx(i) {
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', xAt(i)); cross.setAttribute('x2', xAt(i));
      cross.setAttribute('visibility', 'visible');
      tip.textContent = '';
      tip.appendChild(el('div', 'tx', kx.tip(bands.steps[i])));
      for (const [label, key] of ROWS) {
        const row = el('div', 'row');
        const k = el('span', 'k'); k.style.borderTopColor = 'var(--series-1)';
        if (key !== 'p50') k.style.opacity = key === 'p25' || key === 'p75' ? 0.5 : 0.25;
        row.appendChild(k);
        row.appendChild(el('span', 'v', pct(bands[key][i])));
        row.appendChild(el('span', 'l', label));
        tip.appendChild(row);
      }
      tip.style.display = 'block';
      const bw = box.clientWidth, scale = bw / W;
      const px = xAt(i) * scale;
      tip.style.left = Math.min(bw - tip.offsetWidth - 6, Math.max(6, px + 12)) + 'px';
      tip.style.top = '3rem';
      curIdx = i;
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; }
    overlay.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) * (W / r.width);
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(xAt(i) - fx); if (d < bd) { bd = d; best = i; } }
      showIdx(best);
    });
    overlay.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => showIdx(curIdx));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); showIdx(curIdx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); showIdx(curIdx + 1); }
    });

    const legend = el('div', 'legend');
    const mkLi = (kind, color, opacity, text) => {
      const liEl = el('span', 'li');
      const key = el('span', kind === 'line' ? 'keyline' : 'keyrect');
      if (kind === 'line') key.style.borderTopColor = color;
      else { key.style.background = color; key.style.opacity = opacity; }
      liEl.appendChild(key); liEl.appendChild(document.createTextNode(text));
      return liEl;
    };
    legend.appendChild(mkLi('line', 'var(--series-1)', 1, '중앙값 (가운데 결과)'));
    legend.appendChild(mkLi('rect', 'var(--series-1)', 0.35, '25–75 백분위 (절반이 이 안)'));
    legend.appendChild(mkLi('rect', 'var(--series-1)', 0.15, '5–95 백분위 (거의 다 이 안)'));

    const tbl = el('table', 'plain');
    tbl.style.display = 'none';
    const thead = el('thead'); const hr = el('tr');
    ['시점', '5%', '25%', '중앙값', '75%', '95%'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    for (let i = 0; i < n; i++) {
      const tr = el('tr');
      tr.appendChild(el('td', null, kx.stepLabel(bands.steps[i])));
      ['p5', 'p25', 'p50', 'p75', 'p95'].forEach(k => tr.appendChild(el('td', 'num', pct(bands[k][i]))));
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    box.appendChild(svg); box.appendChild(legend); box.appendChild(tbl);
    tgl.addEventListener('click', () => {
      const showTbl = tbl.style.display === 'none';
      tbl.style.display = showTbl ? '' : 'none';
      svg.style.display = showTbl ? 'none' : '';
      legend.style.display = showTbl ? 'none' : '';
      tgl.textContent = showTbl ? '차트로 보기' : '표로 보기';
      hide();
    });
    return box;
  }

  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }

  // ───────── 히스토그램 ─────────
  function histChart(sim) {
    const box = el('div', 'chartbox');
    const head = el('div', 'chead');
    head.appendChild(el('span', 'ctitle', '끝났을 때 결과 분포'));
    head.appendChild(el('span', 'csub', '파랑=이익 · 빨강=손실'));
    const tgl = el('button', 'tglbtn', '표로 보기'); tgl.type = 'button';
    head.appendChild(tgl);
    box.appendChild(head);

    const W = 640, H = 200, L = 44, R = 14, T = 12, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const { lo, hi, counts } = sim.hist;
    const nB = counts.length, binW = (hi - lo) / nB;
    const total = sim.paths;
    const maxC = Math.max(...counts);
    const xAt = v => L + pw * ((v - lo) / (hi - lo));
    const yAt = c => T + ph * (1 - c / maxC);

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '최종 수익률 히스토그램' });
    const stepP = niceStep((maxC / total * 100) / 3);
    for (let p = stepP; p <= maxC / total * 100; p += stepP) {
      const yy = yAt(p / 100 * total);
      svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'var(--grid)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: L - 6, y: yy + 3.5, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
      t.textContent = p.toFixed(0) + '%';
      svg.appendChild(t);
    }
    const tip = el('div', 'viztip');
    box.appendChild(tip);
    const peakIdx = counts.indexOf(maxC);
    for (let i = 0; i < nB; i++) {
      const b0 = lo + i * binW, b1 = b0 + binW, c = counts[i];
      const x = xAt(b0) + 1, w = Math.max(1, xAt(b1) - xAt(b0) - 2);
      const y = yAt(c), h = T + ph - y;
      const fill = (b0 < 0 && b1 > 0) ? 'var(--div-neutral)' : (b1 <= 0 ? 'var(--series-6)' : 'var(--series-1)');
      const r = Math.min(3, w / 2, h);
      const d = h <= 0.5 ? '' :
        `M${x} ${T + ph} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${T + ph} Z`;
      if (d) svg.appendChild(svgEl('path', { d, fill, 'data-bar': i }));
      const hit = svgEl('rect', { x: xAt(b0), y: T, width: xAt(b1) - xAt(b0), height: ph, fill: 'transparent', tabindex: '0', role: 'img', 'aria-label': `${b0.toFixed(1)}%부터 ${b1.toFixed(1)}% 구간, 확률 ${(c / total * 100).toFixed(1)}%` });
      const show = () => {
        const bar = svg.querySelector(`[data-bar="${i}"]`);
        if (bar) bar.setAttribute('fill-opacity', '0.8');
        tip.textContent = '';
        tip.appendChild(el('div', 'tx', `${(c / total * 100).toFixed(1)}%`));
        const row = el('div', 'row');
        const k = el('span', 'k'); k.style.borderTopColor = fill;
        row.appendChild(k);
        row.appendChild(el('span', 'l', `${b0.toFixed(1)}% ~ ${b1.toFixed(1)}%`));
        tip.appendChild(row);
        tip.style.display = 'block';
        const bw = box.clientWidth, scale = bw / W;
        tip.style.left = Math.min(bw - tip.offsetWidth - 6, Math.max(6, xAt(b0) * scale)) + 'px';
        tip.style.top = '2.6rem';
      };
      const hideT = () => {
        const bar = svg.querySelector(`[data-bar="${i}"]`);
        if (bar) bar.removeAttribute('fill-opacity');
        tip.style.display = 'none';
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', hideT);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hideT);
      svg.appendChild(hit);
      if (i === peakIdx) {
        const t = svgEl('text', { x: xAt(b0) + (xAt(b1) - xAt(b0)) / 2, y: y - 5, 'text-anchor': 'middle', fill: 'var(--text-secondary)', 'font-size': 10, 'font-weight': 650 });
        t.textContent = (c / total * 100).toFixed(1) + '%';
        svg.appendChild(t);
      }
    }
    if (lo < 0 && hi > 0) svg.appendChild(svgEl('line', { x1: xAt(0), x2: xAt(0), y1: T, y2: T + ph, stroke: 'var(--baseline)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: T + ph, y2: T + ph, stroke: 'var(--baseline)', 'stroke-width': 1 }));
    [lo, 0, hi].forEach((v, i) => {
      if (i === 1 && (lo >= 0 || hi <= 0)) return;
      const t = svgEl('text', { x: xAt(v), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
      t.textContent = (v > 0 ? '+' : '') + v.toFixed(0) + '%';
      svg.appendChild(t);
    });

    const legend = el('div', 'legend');
    const mkLi = (color, text) => {
      const liEl = el('span', 'li');
      const key = el('span', 'keyrect'); key.style.background = color;
      liEl.appendChild(key); liEl.appendChild(document.createTextNode(text));
      return liEl;
    };
    legend.appendChild(mkLi('var(--series-1)', '이익 구간'));
    legend.appendChild(mkLi('var(--series-6)', '손실 구간'));

    const tbl = el('table', 'plain'); tbl.style.display = 'none';
    const thead = el('thead'); const hr = el('tr');
    ['수익률 구간', '확률'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    for (let i = 0; i < nB; i++) {
      if (!counts[i]) continue;
      const b0 = lo + i * binW, b1 = b0 + binW;
      const tr = el('tr');
      tr.appendChild(el('td', null, `${b0.toFixed(1)}% ~ ${b1.toFixed(1)}%`));
      tr.appendChild(el('td', 'num', (counts[i] / total * 100).toFixed(1) + '%'));
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    box.appendChild(svg); box.appendChild(legend); box.appendChild(tbl);
    tgl.addEventListener('click', () => {
      const showTbl = tbl.style.display === 'none';
      tbl.style.display = showTbl ? '' : 'none';
      svg.style.display = showTbl ? 'none' : '';
      legend.style.display = showTbl ? 'none' : '';
      tgl.textContent = showTbl ? '차트로 보기' : '표로 보기';
    });
    return box;
  }

  // ───────── 세금 계산 ─────────
  function taxCompute({ market, amountKrw, fx, buyP, sellP, divPerShareYr }) {
    const unitKrw = market === 'US' ? buyP * fx : buyP;
    const shares = unitKrw > 0 ? Math.floor(amountKrw / unitKrw) : 0;
    const investedKrw = shares * unitKrw;
    const sellKrw = market === 'US' ? shares * sellP * fx : shares * sellP;
    const gainKrw = sellKrw - investedKrw;
    let tax = 0, taxLabel = '';
    if (market === 'US') {
      tax = Math.max(0, gainKrw - 2500000) * 0.22;
      taxLabel = '양도소득세 22% (연 250만원 공제 후)';
    } else {
      tax = sellKrw * 0.0015;
      taxLabel = '증권거래세 0.15% (매도금액 기준)';
    }
    const divGrossKrw = market === 'US' ? shares * divPerShareYr * fx : shares * divPerShareYr;
    const divNetKrw = divGrossKrw * (market === 'US' ? 0.85 : 0.846);
    const netKrw = sellKrw - tax;
    return { shares, investedKrw, sellKrw, gainKrw, tax, taxLabel, divGrossKrw, divNetKrw, netKrw,
      netRet: investedKrw ? (netKrw - investedKrw) / investedKrw * 100 : 0 };
  }
  function annualDividend(pick) {
    if (!pick.dividend) return 0;
    const d = pick.dividend;
    return d.frequency === '분기' && d.perShare * 4 / pick.refPrice < 0.2 ? d.perShare * 4 : d.perShare;
  }

  function taxCalcBlock(pick) {
    const box = el('div', 'calc');
    const inrow = el('div', 'inrow');
    const mk = (labelText, value, stepAttr) => {
      const lab = el('label'); lab.appendChild(el('span', null, labelText));
      const inp = el('input'); inp.type = 'number'; inp.value = value; inp.min = 0;
      if (stepAttr) inp.step = stepAttr;
      lab.appendChild(inp); inrow.appendChild(lab);
      return inp;
    };
    const amountIn = mk('투자금액 (원)', 1000000, 100000);
    const buyIn = mk(`매수가 (${pick.currency === 'KRW' ? '원' : '$'})`, (pick.buy.low + pick.buy.high) / 2, pick.currency === 'KRW' ? 1000 : 0.01);
    const sellIn = mk(`매도가 (${pick.currency === 'KRW' ? '원' : '$'})`, (pick.sell.low + pick.sell.high) / 2, pick.currency === 'KRW' ? 1000 : 0.01);
    let fxIn = null;
    if (pick.market === 'US') fxIn = mk('환율 (원/$)', RECO.meta.fxUsdKrw, 0.1);
    box.appendChild(inrow);

    const out = el('table', 'plain');
    box.appendChild(out);
    box.appendChild(el('p', 'note', RECO.meta.taxNote + (pick.market === 'US' ? ' ※ 250만원 공제는 연간 해외주식 양도차익 전체 합산 기준의 단순 계산입니다.' : '')));

    function row(tb, k, v, cls) {
      const tr = el('tr');
      tr.appendChild(el('td', null, k));
      const td = el('td', 'num');
      if (cls) td.appendChild(el('span', cls, v)); else td.textContent = v;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    function recalc() {
      const r = taxCompute({
        market: pick.market,
        amountKrw: +amountIn.value || 0,
        fx: fxIn ? (+fxIn.value || RECO.meta.fxUsdKrw) : 1,
        buyP: +buyIn.value || 0,
        sellP: +sellIn.value || 0,
        divPerShareYr: annualDividend(pick),
      });
      out.textContent = '';
      const tb = el('tbody');
      row(tb, '살 수 있는 주식 수', r.shares.toLocaleString('ko-KR') + '주');
      row(tb, '실제 쓰는 돈', krw(r.investedKrw));
      row(tb, '팔았을 때 받는 돈 (목표가 기준)', krw(r.sellKrw));
      row(tb, '번 돈 (세금 떼기 전)', krw(r.gainKrw), pctCls(r.gainKrw));
      row(tb, r.taxLabel, '-' + krw(r.tax));
      row(tb, '1년 배당 (세금 떼기 전)', r.divGrossKrw > 0 ? krw(r.divGrossKrw) : '배당 없음');
      if (r.divGrossKrw > 0) row(tb, '1년 배당 실제 수령 (세금 뗀 후)', krw(r.divNetKrw), 'pos');
      row(tb, '팔고 실제 받는 돈 (세금 뗀 후)', krw(r.netKrw));
      row(tb, '진짜 수익률 (배당 제외)', pct(r.netRet), pctCls(r.netRet));
      out.appendChild(tb);
    }
    [amountIn, buyIn, sellIn, fxIn].forEach(i => i && i.addEventListener('input', recalc));
    recalc();
    return box;
  }

  // ───────── 상세 모달 ─────────
  const back = $('#modal-back');
  function closeModal() { back.classList.remove('open'); back.querySelector('.modal').textContent = ''; document.body.style.overflow = ''; }
  back.addEventListener('click', e => { if (e.target === back) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && back.classList.contains('open')) closeModal(); });

  function section(parent, title) { parent.appendChild(el('h3', null, title)); }

  function openModal(p) {
    const m = back.querySelector('.modal');
    m.textContent = '';
    const sim = SIM[p.simId];
    const easy = EASY[p.id];

    const head = el('div', 'mhead');
    const hwrap = el('div');
    const chips = el('div', 'chiprow');
    chips.appendChild(chip(HORIZONS[p.horizon].label + ' · ' + HORIZONS[p.horizon].easy, HORIZONS[p.horizon].color));
    chips.appendChild(chip(MARKETS[p.market] + ' · ' + p.exchange));
    chips.appendChild(levelBadge(p));
    chips.appendChild(chip(RISKS[p.risk].label, RISKS[p.risk].color));
    hwrap.appendChild(chips);
    const h2 = el('h2', null, `${p.name} `);
    h2.appendChild(el('span', 'nm', p.ticker));
    hwrap.appendChild(h2);
    hwrap.appendChild(el('div', 'sub', `기준가 ${money(p.refPrice, p.currency)} — ${p.refPriceAsOf}`));
    head.appendChild(hwrap);
    const closeBtn = el('button', 'close', '✕');
    closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.addEventListener('click', closeModal);
    head.appendChild(closeBtn);
    m.appendChild(head);

    if (state.easy && easy) {
      const eb = el('div', 'easybox');
      eb.style.marginTop = '0.8rem';
      eb.appendChild(el('div', 'eb-t', '💡 어떤 회사예요?'));
      eb.appendChild(el('div', null, easy.company));
      eb.appendChild(el('div', 'eb-t', '🤔 왜 추천해요? (3줄 요약)'));
      const olw = el('ol');
      easy.why.forEach(w => olw.appendChild(el('li', null, w)));
      eb.appendChild(olw);
      eb.appendChild(el('div', 'eb-t', '🗓️ 작전은요?'));
      eb.appendChild(el('div', null, easy.plan));
      eb.appendChild(el('div', 'eb-t', LEVELS[pickLevel(p)].label + ' — 왜냐면'));
      eb.appendChild(el('div', null, easy.levelWhy));
      const tts = ['eb-t'];
      m.appendChild(eb);
      void tts;
    }

    const sm = el('p', 'summary');
    sm.appendChild(linkTerms(p.rationale.summary));
    m.appendChild(sm);

    const tiles = el('div', 'tiles');
    const tile = (lb, vl, cls, note) => {
      const t = el('div', 'tile');
      t.appendChild(el('div', 'lb', lb));
      t.appendChild(el('div', 'vl ' + (cls || ''), vl));
      if (note) t.appendChild(el('div', 'note', note));
      return t;
    };
    tiles.appendChild(tile('잘 되면 (기본 시나리오)', pct(p.expectedReturn.base), pctCls(p.expectedReturn.base), '목표가 도달 시'));
    if (sim) {
      tiles.appendChild(tile('이익 볼 확률', sim.final.pProfit.toFixed(0) + '%', '', '2만 번 실험 기준'));
      tiles.appendChild(tile('목표가 도달확률', sim.final.pHitTarget.toFixed(0) + '%', '', '기간 내 1회 이상'));
      tiles.appendChild(tile('손절가 도달확률', sim.final.pHitStop.toFixed(0) + '%', '', '기간 내 1회 이상'));
    }
    m.appendChild(tiles);

    section(m, '🗓️ 매매 계획 (언제 · 얼마에)');
    const plan = el('table', 'plain');
    {
      const thead = el('thead'); const hr = el('tr');
      ['구분', '시기 (현지시간)', '한국시간', '가격'].forEach(h => hr.appendChild(el('th', null, h)));
      thead.appendChild(hr); plan.appendChild(thead);
      const tb = el('tbody');
      const tr1 = el('tr');
      tr1.appendChild(el('td', null, '매수 (사기)'));
      tr1.appendChild(el('td', null, p.buy.window));
      tr1.appendChild(el('td', null, p.buy.windowKst));
      tr1.appendChild(el('td', 'num', `${money(p.buy.low, p.currency)} ~ ${money(p.buy.high, p.currency)}`));
      tb.appendChild(tr1);
      const tr2 = el('tr');
      tr2.appendChild(el('td', null, '매도 (팔기)'));
      tr2.appendChild(el('td', null, p.sell.window));
      tr2.appendChild(el('td', null, p.sell.windowKst));
      tr2.appendChild(el('td', 'num', `${money(p.sell.low, p.currency)} ~ ${money(p.sell.high, p.currency)}`));
      tb.appendChild(tr2);
      const tr3 = el('tr');
      tr3.appendChild(el('td', null, '손절 (안전벨트)'));
      const scd = el('td', null, '이 가격에 닿으면 바로 (자동 주문 권장)');
      scd.colSpan = 2;
      tr3.appendChild(scd);
      tr3.appendChild(el('td', 'num', money(p.sell.stop, p.currency)));
      tb.appendChild(tr3);
      plan.appendChild(tb);
    }
    m.appendChild(plan);
    const planNotes = el('ul', 'pts');
    planNotes.appendChild(liTerms('매수: ' + p.buy.note));
    planNotes.appendChild(liTerms('매도: ' + p.sell.note));
    planNotes.style.marginTop = '0.5rem';
    m.appendChild(planNotes);

    section(m, '🔮 시나리오별 전망 (이렇게 될 수도, 저렇게 될 수도)');
    const sc = el('table', 'plain');
    {
      const thead = el('thead'); const hr = el('tr');
      ['시나리오', '확률', '예상가', '수익률', '설명'].forEach((h, i) => hr.appendChild(el('th', i >= 1 && i <= 3 ? 'num' : null, h)));
      thead.appendChild(hr); sc.appendChild(thead);
      const tb = el('tbody');
      for (const s of p.scenarios) {
        const tr = el('tr');
        tr.appendChild(el('td', null, s.name));
        tr.appendChild(el('td', 'num', s.prob + '%'));
        tr.appendChild(el('td', 'num', money(s.price, p.currency)));
        const td = el('td', 'num'); td.appendChild(el('span', pctCls(s.ret), pct(s.ret))); tr.appendChild(td);
        tr.appendChild(el('td', null, s.desc));
        tb.appendChild(tr);
      }
      sc.appendChild(tb);
    }
    m.appendChild(sc);

    if (sim) {
      section(m, '🎲 미래를 2만 번 실험해 봤어요 (몬테카를로 시뮬레이션)');
      if (state.easy) {
        const ep = el('p', 'summary');
        ep.appendChild(linkTerms('컴퓨터로 이 주식의 미래를 2만 번 미리 살아 봤어요. 아래 차트의 파란 띠가 넓을수록 결과가 들쑥날쑥하다는 뜻이에요. 이익확률이 51%라면 100번 중 49번은 잃는다는 뜻 — 절대 "확실히 번다"가 아니에요!'));
        m.appendChild(ep);
      }
      m.appendChild(fanChart(sim, p));
      const spacer = el('div'); spacer.style.height = '0.6rem'; m.appendChild(spacer);
      m.appendChild(histChart(sim));
      const simNote = el('p', 'summary', `경로 ${sim.paths.toLocaleString()}개 · 중앙값 ${pct(sim.final.median)} · 90% 신뢰구간 ${pct(sim.final.p5)} ~ ${pct(sim.final.p95)}.`);
      m.appendChild(simNote);
    }

    section(m, '📰 왜 추천해요? — 뉴스');
    const ulN = el('ul', 'pts'); p.rationale.news.forEach(t => ulN.appendChild(liTerms(t))); m.appendChild(ulN);
    section(m, '📉 왜 추천해요? — 차트(가격 움직임)');
    const ulT = el('ul', 'pts'); p.rationale.technical.forEach(t => ulT.appendChild(liTerms(t))); m.appendChild(ulT);
    section(m, '🏢 왜 추천해요? — 회사 실력(펀더멘털)');
    const ulF = el('ul', 'pts'); p.rationale.fundamental.forEach(t => ulF.appendChild(liTerms(t))); m.appendChild(ulF);

    section(m, '⚠️ 조심할 것들 (예측 변수)');
    const ulR = el('ul', 'pts'); p.riskFactors.forEach(t => ulR.appendChild(liTerms(t))); m.appendChild(ulR);

    section(m, '🎁 배당 (회사가 주는 용돈)');
    if (p.dividend) {
      const d = p.dividend;
      const dt = el('table', 'plain');
      const tb = el('tbody');
      const row = (k, v) => { const tr = el('tr'); tr.appendChild(el('td', null, k)); tr.appendChild(el('td', 'num', v)); tb.appendChild(tr); };
      row('1주당 배당금', money(d.perShare, d.currency) + ` (${d.frequency})`);
      row('배당 일정', d.schedule);
      row('배당수익률 (연)', d.yieldPct + '%');
      row('다음 배당', d.next);
      dt.appendChild(tb);
      m.appendChild(dt);
      const dn = el('p', 'summary');
      dn.appendChild(linkTerms(d.note + (p.market === 'US' ? ' — 미국 배당은 15% 원천징수 후 입금됩니다.' : ' — 국내 배당은 15.4% 원천징수 후 입금됩니다.')));
      m.appendChild(dn);
    } else {
      m.appendChild(el('p', 'summary', '이 회사는 배당을 주지 않아요. 주가가 오르는 것으로만 돈을 벌 수 있어요.'));
    }

    section(m, '🧾 실제로 얼마 받아요? (세후 계산기)');
    m.appendChild(taxCalcBlock(p));

    m.appendChild(el('p', 'summary', '⚠️ ' + RECO.meta.disclaimer));

    back.classList.add('open');
    document.body.style.overflow = 'hidden';
    back.scrollTop = 0;
  }

  // ───────── 확실 수익 ─────────
  function renderSure() {
    const wrap = $('#view-sure');
    wrap.textContent = '';

    const hero = el('div', 'hero');
    hero.appendChild(el('div', 'weather', '🔒 "확실한 이익"의 진실부터 알려 드릴게요'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms('세상의 철칙: 확실할수록 수익은 낮고, 수익이 높을수록 위험해요. 이 시소를 깨고 "확실한 고수익"을 준다는 사람은 100% 사기꾼이에요. 이 페이지는 그 철칙 안에서 진짜로 확실한 것부터 순서대로 보여 줘요.'));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    const tierNote = {
      1: '시뮬레이션 2만 번 중 2만 번 모두 이익 — 미국/한국 정부 신용에 기대는, 진짜 "확실"에 가장 가까운 자산이에요. 대신 수익률은 은행이자 수준(연 2~4%)이에요.',
      2: '1년만 보면 이길 확률이 60~80%지만, 역사상 15~20년 이상 갖고 있으면 진 적이 없어요. "시간"이 확실함을 만들어요. 매달 같은 금액 적립이 정석!',
    };
    [1, 2].forEach(tier => {
      wrap.appendChild(el('h2', 'homesec', tier === 1 ? '1단계 🔒 사실상 확정 (P(이익) 100%)' : '2단계 ⏳ 시간이 만드는 확실함 (장기 적립)'));
      const note = el('p', 'viewdesc');
      note.appendChild(linkTerms(tierNote[tier]));
      wrap.appendChild(note);
      const grid = el('div', 'grid');
      RECO.sureItems.filter(s => s.tier === tier).forEach(s => grid.appendChild(pickCard(s)));
      wrap.appendChild(grid);
    });

    // S&P 500 역사 승률 표
    wrap.appendChild(el('h2', 'homesec', '📜 증거: S&P 500을 N년 갖고 있으면? (1928년~ 역사 통계)'));
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['보유 기간', '이익 본 비율', '최악의 경우', '한 줄 설명'].forEach(h => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    RECO.sureStats.forEach(s => {
      const tr = el('tr');
      tr.appendChild(el('td', null, s.period));
      const wr = el('td', 'num');
      wr.appendChild(el('span', s.winRate === '100%' ? 'pos' : '', s.winRate));
      tr.appendChild(wr);
      tr.appendChild(el('td', 'num', s.worst));
      tr.appendChild(el('td', null, s.note));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    wrap.appendChild(tbl);

    const warn = el('div', 'easybox');
    warn.style.marginTop = '1rem';
    warn.appendChild(el('div', 'eb-t', '🚨 꼭 기억하세요'));
    warn.appendChild(el('div', null, '"과거에 항상 그랬다"는 것이지 "미래를 보장한다"는 뜻은 아니에요. 그리고 개별 주식(삼성전자, 엔비디아 등)에는 이 표가 적용되지 않아요 — 개별 회사는 망할 수도 있으니까요. 더 높은 수익을 노리는 확률 기반 추천은 📋 추천 종목 탭에 있어요.'));
    wrap.appendChild(warn);

    const cta = el('button', 'iconbtn', '📋 확률 기반 추천 보러 가기 →');
    cta.type = 'button';
    cta.style.marginTop = '0.8rem';
    cta.addEventListener('click', () => { state.view = 'reco'; renderAll(); window.scrollTo({ top: 0 }); });
    wrap.appendChild(cta);
  }

  // ───────── 연습하기 (가상 계획) ─────────
  function loadBasket() {
    try { return JSON.parse(localStorage.getItem('basket-v1')) || { budget: 3000000, items: [] }; }
    catch { return { budget: 3000000, items: [] }; }
  }
  function saveBasket(b) { localStorage.setItem('basket-v1', JSON.stringify(b)); }

  function renderPractice() {
    const wrap = $('#view-practice');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'viewdesc', '진짜 돈 없이 계획을 세워 보는 연습장이에요. 예산을 정하고 종목을 담으면, 계획대로 됐을 때와 잘 안 됐을 때 결과를 미리 보여 줘요. (내 브라우저에만 저장돼요)'));
    const basket = loadBasket();
    const fx = RECO.meta.fxUsdKrw;
    const picks = RECO.sureItems.concat(batchPicks());

    const grid = el('div', 'pgrid');

    // 왼쪽: 장바구니
    const left = el('div', 'basket');
    left.appendChild(el('h3', null, '🧺 내 연습 장바구니'));
    const budRow = el('div', 'brow');
    budRow.appendChild(el('span', 'bnm', '가상 예산'));
    const budIn = el('input'); budIn.type = 'number'; budIn.value = basket.budget; budIn.min = 10000; budIn.step = 100000;
    budRow.appendChild(budIn);
    budRow.appendChild(el('span', null, '원'));
    left.appendChild(budRow);

    const itemsBox = el('div');
    left.appendChild(itemsBox);

    const addRow = el('div', 'addrow');
    const sel = el('select');
    picks.forEach(p => {
      const o = el('option', null, `${LEVELS[pickLevel(p)].label.slice(0, 2)} ${p.name} (${p.ticker})`);
      o.value = p.id;
      sel.appendChild(o);
    });
    const addBtn = el('button', null, '+ 담기');
    addBtn.type = 'button';
    addRow.appendChild(sel); addRow.appendChild(addBtn);
    left.appendChild(addRow);

    // 오른쪽: 결과
    const right = el('div', 'basket');
    right.appendChild(el('h3', null, '🔭 계획대로 되면 이렇게 돼요'));
    const outBox = el('div');
    right.appendChild(outBox);

    function findPick(id) { return picks.find(p => p.id === id); }

    function computeRow(item) {
      const p = findPick(item.pickId);
      if (!p) return null;
      const buyP = (p.buy.low + p.buy.high) / 2;
      const unit = p.currency === 'USD' ? buyP * fx : buyP;
      // 미국주식은 소수점(0.01주) 매매 기준, 한국주식은 1주 단위
      const shares = unit > 0
        ? (p.currency === 'USD' ? Math.floor(item.amount / unit * 100) / 100 : Math.floor(item.amount / unit))
        : 0;
      const invested = shares * unit;
      const val = ret => invested * (1 + ret / 100);
      const bull = p.scenarios[0], base = p.scenarios[1], bear = p.scenarios[2];
      return { p, unit, shares, invested, bull: val(bull.ret), base: val(base.ret), bear: val(bear.ret) };
    }

    function renderItems() {
      itemsBox.textContent = '';
      basket.items.forEach((item, idx) => {
        const p = findPick(item.pickId);
        if (!p) return;
        const row = el('div', 'brow');
        row.appendChild(el('span', 'bnm', `${p.name}`));
        const amt = el('input'); amt.type = 'number'; amt.value = item.amount; amt.min = 0; amt.step = 50000;
        amt.addEventListener('input', () => { item.amount = +amt.value || 0; saveBasket(basket); renderOut(); });
        row.appendChild(amt);
        row.appendChild(el('span', null, '원'));
        const rm = el('button', 'brm', '빼기');
        rm.type = 'button';
        rm.addEventListener('click', () => { basket.items.splice(idx, 1); saveBasket(basket); renderItems(); renderOut(); });
        row.appendChild(rm);
        itemsBox.appendChild(row);
      });
      if (!basket.items.length) itemsBox.appendChild(el('p', 'viewdesc', '아직 비어 있어요. 아래에서 종목을 담아 보세요!'));
    }

    function renderOut() {
      outBox.textContent = '';
      const rows = basket.items.map(computeRow).filter(Boolean);
      const totalAmt = basket.items.reduce((s, i) => s + (+i.amount || 0), 0);
      const over = totalAmt > (+budIn.value || 0);
      if (over) {
        const warn = el('p', 'viewdesc', `⚠️ 예산(${krw(+budIn.value || 0)})보다 ${krw(totalAmt - (+budIn.value || 0))} 더 담았어요! 금액을 줄여 보세요.`);
        warn.style.color = 'var(--status-critical)';
        outBox.appendChild(warn);
      }
      if (!rows.length) { outBox.appendChild(el('p', 'viewdesc', '종목을 담으면 결과가 여기 나타나요.')); return; }
      const tbl = el('table', 'plain');
      const thead = el('thead'); const hr = el('tr');
      ['종목', '살 수 있는 수', '😊 잘 되면', '🙂 보통', '😰 잘 안 되면'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
      thead.appendChild(hr); tbl.appendChild(thead);
      const tb = el('tbody');
      let tInv = 0, tBull = 0, tBase = 0, tBear = 0;
      for (const r of rows) {
        tInv += r.invested; tBull += r.bull; tBase += r.base; tBear += r.bear;
        const tr = el('tr');
        if (r.shares === 0) {
          tr.appendChild(el('td', null, r.p.name));
          const td = el('td', null, `이 돈으론 1주를 못 사요 (1주 ≈ ${krw(r.unit)}) — 금액을 올려 보세요`);
          td.colSpan = 4;
          td.style.color = 'var(--text-muted)';
          tr.appendChild(td);
          tb.appendChild(tr);
          continue;
        }
        tr.appendChild(el('td', 'num', r.shares.toLocaleString('ko-KR') + '주'));
        tr.insertBefore(el('td', null, r.p.name), tr.firstChild);
        [['bull', r.bull], ['base', r.base], ['bear', r.bear]].forEach(([, v]) => {
          const td = el('td', 'num');
          td.appendChild(el('span', pctCls(v - r.invested), krw(v)));
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      }
      const trT = el('tr');
      trT.appendChild(el('td', null, '합계 (넣은 돈 ' + krw(tInv) + ')'));
      trT.appendChild(el('td', 'num', ''));
      [tBull, tBase, tBear].forEach(v => {
        const td = el('td', 'num');
        const diff = v - tInv;
        td.appendChild(el('span', pctCls(diff), krw(v) + ' (' + (diff >= 0 ? '+' : '') + krw(diff).replace('원', '') + '원)'));
        trT.appendChild(td);
      });
      tb.appendChild(trT);
      tbl.appendChild(tb);
      outBox.appendChild(tbl);
      outBox.appendChild(el('p', 'note', '시나리오 수익률(낙관/기본/비관)을 그대로 적용한 단순 계산이에요. 미국주식은 소수점(0.01주) 매매 기준. 세금·수수료·환율 변화는 뺐어요. 진짜 미래는 아무도 몰라요!'));
    }

    budIn.addEventListener('input', () => { basket.budget = +budIn.value || 0; saveBasket(basket); renderOut(); });
    addBtn.addEventListener('click', () => {
      basket.items.push({ pickId: sel.value, amount: 500000 });
      saveBasket(basket);
      renderItems(); renderOut();
    });

    renderItems(); renderOut();
    grid.appendChild(left); grid.appendChild(right);
    wrap.appendChild(grid);
  }

  // ───────── 배우기 ─────────
  function renderLearn() {
    const wrap = $('#view-learn');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'viewdesc', '5분이면 충분해요. 위에서부터 차례로 읽어 보세요!'));

    wrap.appendChild(el('h2', 'homesec', '📖 주식 기초 8강'));
    LESSONS.forEach((ls, i) => {
      const d = el('details', 'lesson');
      d.id = 'lesson-' + i;
      const s = el('summary', null, `${ls.icon} ${i + 1}강. ${ls.title}`);
      d.appendChild(s);
      const body = el('div', 'lb');
      body.appendChild(linkTerms(ls.body));
      d.appendChild(body);
      wrap.appendChild(d);
    });

    wrap.appendChild(el('h2', 'homesec', '✅ 사기 전 체크리스트 (7가지)'));
    const ol = el('ol', 'pts');
    ol.style.paddingLeft = '1.3rem';
    CHECKLIST.forEach(t => ol.appendChild(liTerms(t)));
    wrap.appendChild(ol);

    wrap.appendChild(el('h2', 'homesec', '❓ 자주 묻는 질문'));
    FAQ.forEach((f, i) => {
      const d = el('details', 'lesson');
      d.id = 'faq-' + i;
      d.appendChild(el('summary', null, 'Q. ' + f.q));
      const body = el('div', 'lb');
      body.appendChild(linkTerms('A. ' + f.a));
      d.appendChild(body);
      wrap.appendChild(d);
    });

    wrap.appendChild(el('h2', 'homesec', '📚 용어사전 (누르지 않아도 다 보여요)'));
    const gg = el('div', 'gloss-grid');
    GLOSSARY.forEach((g, i) => {
      const c = el('div', 'gloss');
      c.id = 'gloss-' + i;
      c.appendChild(el('b', null, g.term));
      c.appendChild(el('span', null, g.easy));
      gg.appendChild(c);
    });
    wrap.appendChild(gg);
  }

  // ───────── 히스토리 ─────────
  function renderHistory() {
    const wrap = $('#view-history');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'hist-note',
      '추천이 새로 만들어질 때마다 여기에 자동으로 기록돼요. 과거 기록은 바뀌지 않아서, 나중에 "그때 추천이 맞았나?" 하고 확인해 볼 수 있어요.'));
    RECO.batches.forEach((b, i) => {
      const box = el('div', 'batch');
      box.appendChild(el('div', 'bt', b.title));
      box.appendChild(el('div', 'bd', `생성 시각 ${b.generatedAt} · ${b.picks.length}개 종목`));
      box.appendChild(el('div', 'bs', b.marketSnapshot));
      const summary = el('div', 'bs');
      summary.textContent = '종목: ' + b.picks.map(p => `${p.name}(${p.ticker})`).join(', ');
      box.appendChild(summary);
      const openBtn = el('button', 'bopen', '이 배치의 추천 보기 →');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => {
        state.batch = i; state.view = 'reco';
        state.horizon = 'all'; state.market = 'all'; state.level = 'all'; state.divOnly = false;
        renderAll();
        window.scrollTo({ top: 0 });
      });
      box.appendChild(openBtn);
      wrap.appendChild(box);
    });
  }

  // ───────── 세금 가이드 ─────────
  function renderTax() {
    const wrap = $('#view-tax');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'viewdesc', '주식으로 번 돈에는 세금이 붙어요. 규칙을 알면 실제로 받는 돈을 정확히 알 수 있어요.'));
    const rules = [
      ['미국주식 양도소득세', '1년 동안 번 돈에서 250만원을 뺀 나머지의 22%. 다음 해 5월에 신고해요.'],
      ['미국주식 배당', '미국에서 15%를 미리 떼고 줘요. 보통 한국에서 추가로 내지 않아요.'],
      ['한국주식 팔 때', '번 돈에 세금 없음(소액주주 기준)! 대신 팔 때 금액의 0.15%를 증권거래세로 내요.'],
      ['한국주식 배당', '15.4%를 미리 떼고 줘요.'],
      ['주의', '이자+배당이 1년에 2,000만원을 넘으면 세금 계산이 복잡해져요(종합과세). 그 정도가 되면 세무사와 상담!'],
    ];
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['구분', '내용'].forEach(h => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    rules.forEach(([k, v]) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, k));
      const td = el('td'); td.appendChild(linkTerms(v)); tr.appendChild(td);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    wrap.appendChild(el('p', 'hist-note', '각 종목 카드를 열면 그 종목의 가격이 미리 채워진 계산기를 쓸 수 있어요. 세법은 바뀔 수 있어요 — 실제 신고는 어른(세무 전문가)과 함께!'));
  }

  // ───────── 새 추천 받기 ─────────
  function openRefreshModal() {
    const m = back.querySelector('.modal');
    m.textContent = '';
    const head = el('div', 'mhead');
    const hwrap = el('div');
    hwrap.appendChild(el('h2', null, '🔄 새 추천 받기'));
    hwrap.appendChild(el('div', 'sub', '최신 뉴스와 가격으로 추천 12종목을 다시 만들어 드려요. 이전 추천은 히스토리에 그대로 보관돼요.'));
    head.appendChild(hwrap);
    const closeBtn = el('button', 'close', '✕');
    closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.addEventListener('click', closeModal);
    head.appendChild(closeBtn);
    m.appendChild(head);

    const mkCard = (title, lines, action) => {
      const c = el('div', 'easybox');
      c.style.marginTop = '0.9rem';
      c.appendChild(el('div', 'eb-t', title));
      lines.forEach(t => c.appendChild(el('div', null, t)));
      if (action) c.appendChild(action);
      return c;
    };

    // 방법 1: 버튼 한 번으로 바로 접수 (로그인 불필요)
    const form = el('div');
    form.style.marginTop = '0.55rem';
    const ta = el('textarea');
    ta.placeholder = '원하는 조건이 있으면 적어 주세요 (선택) — 예: 배당주 위주로, 미국 주식만, 안전한 것만';
    ta.maxLength = 500;
    ta.rows = 2;
    ta.style.cssText = 'width:100%;font:inherit;font-size:0.86rem;padding:0.5rem 0.6rem;border:1px solid var(--border);border-radius:9px;background:var(--page);color:var(--text-primary);resize:vertical';
    form.appendChild(ta);
    const sendBtn = el('button', 'iconbtn', '🚀 지금 요청 보내기 (클릭 한 번이면 끝)');
    sendBtn.type = 'button';
    sendBtn.style.marginTop = '0.45rem';
    const status = el('p');
    status.style.cssText = 'margin-top:0.45rem;font-size:0.82rem;font-weight:600';
    form.appendChild(sendBtn);
    form.appendChild(status);
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      status.style.color = 'var(--text-secondary)';
      status.textContent = '보내는 중…';
      try {
        const res = await fetch('https://ztjivtiuhxwazsajukto.supabase.co/rest/v1/rpc/request_refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'sb_publishable_3xmYkBmX60wVPDjdmns1Ng_LyvLThQH',
            Authorization: 'Bearer sb_publishable_3xmYkBmX60wVPDjdmns1Ng_LyvLThQH',
          },
          body: JSON.stringify({ p_note: ta.value || '' }),
        });
        const r = await res.json();
        if (r && r.ok) {
          status.style.color = 'var(--delta-good)';
          status.textContent = `✅ 접수 완료 (요청 #${r.id})! 매시 30분마다 자동 확인해서 처리해요 — 보통 1시간 안에 새 추천이 이 사이트에 반영돼요.`;
          ta.value = '';
        } else if (r && r.reason === 'too_many_recent') {
          status.style.color = 'var(--status-critical)';
          status.textContent = '⏳ 방금 요청이 몰렸어요. 10분 뒤에 다시 눌러 주세요.';
          sendBtn.disabled = false;
        } else if (r && r.reason === 'queue_full') {
          status.style.color = 'var(--status-critical)';
          status.textContent = '⏳ 대기 중인 요청이 이미 많아요. 다음 처리 후 다시 시도해 주세요.';
          sendBtn.disabled = false;
        } else {
          throw new Error('unexpected');
        }
      } catch {
        status.style.color = 'var(--status-critical)';
        status.textContent = '⚠️ 전송에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
        sendBtn.disabled = false;
      }
    });
    m.appendChild(mkCard('🖱️ 버튼 한 번으로 바로 요청 (로그인 필요 없음)', [
      '아래 버튼만 누르면 요청이 바로 접수돼요. 회원가입도 로그인도 필요 없어요.',
    ], form));

    // 방법 2: 자동
    m.appendChild(mkCard('🤖 가만히 있어도 자동으로', [
      '평일 아침 8시(한국시간)마다 자동으로 새 추천이 만들어져요.',
      '미국장이 끝나고 한국장이 열리기 전이라, 아침에 보면 항상 최신이에요.',
    ]));

    // 방법 3: 채팅
    m.appendChild(mkCard('💬 가장 빠른 방법', [
      '이 사이트를 만든 Claude 세션에 "추천 갱신해줘"라고 보내면 몇 분 안에 반영돼요.',
    ]));

    m.appendChild(el('p', 'summary', '⚠️ 어떤 방법이든 이전 추천은 지워지지 않고 히스토리에 남아요.'));

    back.classList.add('open');
    document.body.style.overflow = 'hidden';
    back.scrollTop = 0;
  }
  $('#refreshbtn').addEventListener('click', openRefreshModal);

  // ───────── 검색 ─────────
  const searchBack = $('#search-back');
  const searchInput = $('#searchinput');
  const searchResults = $('#searchresults');
  function openSearch() { searchBack.classList.add('open'); searchInput.value = ''; runSearch(''); searchInput.focus(); document.body.style.overflow = 'hidden'; }
  function closeSearch() { searchBack.classList.remove('open'); document.body.style.overflow = ''; }
  $('#searchbtn').addEventListener('click', openSearch);
  searchBack.addEventListener('click', e => { if (e.target === searchBack) closeSearch(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && searchBack.classList.contains('open')) closeSearch();
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); }
  });

  function searchIndex() {
    const idx = [];
    VIEWS.forEach(v => idx.push({ kind: '메뉴', label: MENU_LABEL[v], desc: MENU_DESC[v], go: () => { state.view = v; renderAll(); } }));
    idx.push({ kind: '기능', label: '🔄 새 추천 받기', desc: '최신 데이터로 추천 다시 만들기 (갱신, 새로고침)', go: openRefreshModal });
    batchPicks().concat(RECO.sureItems).forEach(p => idx.push({
      kind: '종목', label: `${p.name} ${p.ticker}`, desc: (EASY[p.id] ? EASY[p.id].company : p.rationale.summary).slice(0, 40),
      go: () => openModal(p),
    }));
    GLOSSARY.forEach((g, i) => idx.push({
      kind: '용어', label: g.term, desc: g.easy.slice(0, 40),
      go: () => {
        state.view = 'learn'; renderAll();
        const t = document.getElementById('gloss-' + i);
        if (t) { t.scrollIntoView({ block: 'center' }); t.style.outline = '2px solid var(--accent)'; setTimeout(() => { t.style.outline = ''; }, 1600); }
      },
    }));
    LESSONS.forEach((ls, i) => idx.push({
      kind: '배우기', label: `${ls.icon} ${ls.title}`, desc: ls.body.slice(0, 40),
      go: () => {
        state.view = 'learn'; renderAll();
        const d = document.getElementById('lesson-' + i);
        if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
      },
    }));
    FAQ.forEach((f, i) => idx.push({
      kind: 'FAQ', label: f.q, desc: f.a.slice(0, 40),
      go: () => {
        state.view = 'learn'; renderAll();
        const d = document.getElementById('faq-' + i);
        if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
      },
    }));
    return idx;
  }
  function runSearch(q) {
    searchResults.textContent = '';
    const idx = searchIndex();
    const qq = q.trim().toLowerCase();
    const hits = qq
      ? idx.filter(e => (e.label + ' ' + e.desc + ' ' + e.kind).toLowerCase().includes(qq))
      : idx.filter(e => e.kind === '메뉴');
    hits.slice(0, 20).forEach(e => {
      const btn = el('button', 'sres');
      btn.type = 'button';
      btn.appendChild(el('span', 'sk', e.kind));
      btn.appendChild(el('span', null, e.label));
      btn.appendChild(el('span', 'sd', e.desc));
      btn.addEventListener('click', () => { closeSearch(); e.go(); window.scrollTo({ top: 0 }); });
      searchResults.appendChild(btn);
    });
    if (!hits.length) searchResults.appendChild(el('p', 'viewdesc', '검색 결과가 없어요. 다른 말로 찾아보세요!'));
  }
  searchInput.addEventListener('input', () => runSearch(searchInput.value));

  // ───────── 뷰 전환 ─────────
  function renderAll() {
    document.querySelectorAll('.viewtabs button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    VIEWS.forEach(v => { $('#view-' + v).style.display = state.view === v ? '' : 'none'; });
    if (state.view === 'home') renderHome();
    if (state.view === 'sure') renderSure();
    if (state.view === 'reco') {
      document.querySelectorAll('#hseg button').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.h === state.horizon)));
      $('#market').value = state.market;
      $('#level').value = state.level;
      $('#batchchip').textContent = RECO.batches[state.batch].title;
      renderCards();
    }
    if (state.view === 'practice') renderPractice();
    if (state.view === 'learn') renderLearn();
    if (state.view === 'history') renderHistory();
    if (state.view === 'tax') renderTax();
  }

  document.querySelectorAll('.viewtabs button').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; renderAll(); }));
  document.querySelectorAll('#hseg button').forEach(b =>
    b.addEventListener('click', () => { state.horizon = b.dataset.h; renderAll(); }));
  $('#market').addEventListener('change', e => { state.market = e.target.value; renderAll(); });
  $('#level').addEventListener('change', e => { state.level = e.target.value; renderAll(); });
  $('#divonly').addEventListener('change', e => { state.divOnly = e.target.checked; renderAll(); });

  const easyChk = $('#easymode');
  easyChk.checked = state.easy;
  easyChk.addEventListener('change', () => {
    state.easy = easyChk.checked;
    localStorage.setItem('easymode', state.easy ? '1' : '0');
    renderAll();
  });

  $('#asof').textContent = `최신 추천: ${RECO.batches[0].generatedAt}` +
    (RECO.batches[0].pricesAsOf ? ` · ${RECO.batches[0].pricesAsOf}` : '');
  $('#disclaimer').textContent = '⚠️ ' + RECO.meta.disclaimer + ' 미성년자는 보호자와 함께 계좌를 만들 수 있으며, 실제 투자 전 "연습하기"로 충분히 연습하는 것을 권장합니다.';

  renderAll();
})();
