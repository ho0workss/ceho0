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
    day:   { label: '당일',   color: 'var(--series-1)', easy: '데이 트레이딩' },
    week:  { label: '1주일',  color: 'var(--series-2)', easy: '스윙 (단기 보유)' },
    month: { label: '1개월',  color: 'var(--series-5)', easy: '포지션 (중기 보유)' },
    long:  { label: '장기',   color: 'var(--series-4)', easy: '장기 투자 (1년 이상)' },
  };
  const LEVELS = {
    ok:  { label: '🟢 안정형',  cls: 'lvl-ok' },
    mid: { label: '🟡 중립형', cls: 'lvl-mid' },
    pro: { label: '🔴 공격형', cls: 'lvl-pro' },
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
  const VIEWS = ['home', 'plan', 'reco', 'sure', 'practice', 'learn', 'perf', 'history', 'tax', 'portfolio', 'journal'];
  const MENU_DESC = {
    home: '오늘의 시장 브리핑과 핵심 추천',
    reco: '기간별 추천 종목과 매매 계획',
    plan: '예산과 투자 성향만 정하면 주문서까지 자동 완성 (따라하기, 포트폴리오)',
    sure: '원금 보전형 금리 자산과 장기 분산 적립 (확실, 안전, 보장, 안정)',
    practice: '가상 예산으로 포트폴리오 결과 미리보기',
    learn: '투자 기초 · 체크리스트 · 용어사전 · FAQ',
    perf: '예측 vs 실제 — 적중/실패 전부 공개하는 채점표 (성과, 검증, 결과)',
    history: '지난 추천 기록 보관함',
    tax: '세금 규칙 · 평단가 · 목표가 · 복리 적립 계산기',
    portfolio: '보유 종목 평가 · 진단 · 배당 예측 · 리밸런싱 (내 주식, 보유, 수익률)',
    journal: '매매 기록과 복기 — 수익률을 올리는 습관 (일지, 기록)',
  };
  const MENU_LABEL = { home: '🏠 홈', plan: '🧭 실행 플랜', reco: '📋 추천 종목', sure: '🛡️ 안정 수익', practice: '🧮 시뮬레이터', learn: '📚 투자 가이드', perf: '📊 성과 검증', history: '🗂️ 히스토리', tax: '🧾 계산기', portfolio: '💼 내 포트폴리오', journal: '📓 매매 일지' };
  const OUTCOME_META = {
    success: { icon: '✅', label: '성공',   color: 'var(--status-good)' },
    partial: { icon: '🟡', label: '부분 성공', color: 'var(--status-warning)' },
    fail:    { icon: '❌', label: '실패(손절)', color: 'var(--status-critical)' },
    invalid: { icon: '➖', label: '무효(미진입)', color: 'var(--text-muted)' },
    pending: { icon: '⏳', label: '진행 중', color: 'var(--text-muted)' },
  };

  const state = {
    view: 'home', horizon: 'all', market: 'all', level: 'all', divOnly: false, batch: 0,
    easy: localStorage.getItem('easymode') === '1',
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
    chips.appendChild(levelBadge(p));
    card.appendChild(chips);

    const tl = el('div', 'titleline');
    tl.appendChild(el('span', 'tk', (p.market === 'US' ? '🇺🇸 ' : '🇰🇷 ') + p.ticker));
    tl.appendChild(el('span', 'nm', p.name));
    tl.appendChild(el('span', 'price', money(p.refPrice, p.currency)));
    card.appendChild(tl);

    if (state.easy && easy) card.appendChild(el('div', 'easyline', '💡 ' + easy.company));

    const rec = RECO.outcomes && RECO.outcomes.records && RECO.outcomes.records[p.id];
    if (rec && OUTCOME_META[rec.status]) {
      const om = OUTCOME_META[rec.status];
      const ob = el('div', 'easyline');
      ob.style.borderLeft = '3px solid ' + om.color;
      ob.textContent = `${om.icon} 결과: ${rec.title || om.label}`;
      card.appendChild(ob);
    }

    const plan = el('div', 'plan');
    const b = el('div'); b.appendChild(el('b', null, '매수 ')); b.appendChild(document.createTextNode(`${money(p.buy.low, p.currency)}–${money(p.buy.high, p.currency)} · ${p.buy.windowKst}`));
    const s = el('div'); s.appendChild(el('b', null, '매도 ')); s.appendChild(document.createTextNode(`${money(p.sell.low, p.currency)}–${money(p.sell.high, p.currency)} · ${p.sell.windowKst}`));
    plan.appendChild(b); plan.appendChild(s);
    card.appendChild(plan);

    const stats = el('div', 'statrow');
    const s1 = el('div', 'stat');
    s1.appendChild(el('span', 'lb', '기대수익률'));
    s1.appendChild(el('span', 'vl ' + pctCls(p.expectedReturn.base), pct(p.expectedReturn.base)));
    stats.appendChild(s1);
    if (sim) {
      const s2 = el('div', 'stat');
      s2.appendChild(el('span', 'lb', '이익 확률(시뮬)'));
      s2.appendChild(el('span', 'vl', sim.final.pProfit.toFixed(0) + '%'));
      stats.appendChild(s2);
    }
    stats.appendChild(sparkline(sim));
    card.appendChild(stats);

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
    if (!picks.length) grid.appendChild(el('p', 'hist-note', '조건에 맞는 종목이 없습니다. 필터를 조정해 보세요.'));
  }

  // ───────── 홈 ─────────
  function renderHome() {
    const wrap = $('#view-home');
    wrap.textContent = '';
    const batch = RECO.batches[0];

    const hero = el('div', 'hero');
    const stormy = /급락|쇼크|하락/.test(batch.title + batch.marketSnapshot);
    hero.appendChild(el('div', 'weather', stormy ? '시장 브리핑 · 리스크오프 국면 🌧️ — 변동성 확대 구간' : '시장 브리핑 · 리스크온 국면 ☀️'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms(state.easy
      ? '어제 반도체 회사들(삼성전자 등)의 주가가 비를 맞은 것처럼 뚝 떨어졌어요. 이럴 때는 "너무 많이 떨어진 좋은 회사"를 싸게 살 기회가 생기기도 해요. 아래 추천들이 바로 그 기회를 노려요.'
      : batch.marketSnapshot));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    wrap.appendChild(el('h2', 'homesec', '🚀 시작 가이드'));
    const steps = el('div', 'steps');
    const stepDefs = [
      ['STEP 1', '📚 투자 가이드', '기초 개념을 5분 안에 정리합니다', 'learn'],
      ['STEP 2', '🧭 실행 플랜', '예산만 입력하면 주문서까지 자동 완성', 'plan'],
      ['STEP 3', '🧮 시뮬레이터', '가상 예산으로 결과를 미리 확인합니다', 'practice'],
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

    wrap.appendChild(el('h2', 'homesec', '⭐ 오늘의 핵심 추천 TOP 3 (안정형 우선)'));
    const order = { ok: 0, mid: 1, pro: 2 };
    const seen = new Set();
    const top3 = batchPicks().slice().sort((a, b) => {
      const d = order[pickLevel(a)] - order[pickLevel(b)];
      if (d) return d;
      return (SIM[b.simId]?.final.pProfit || 0) - (SIM[a.simId]?.final.pProfit || 0);
    }).filter(p => !seen.has(p.ticker) && seen.add(p.ticker)).slice(0, 3);
    const grid = el('div', 'grid');
    top3.forEach(p => grid.appendChild(pickCard(p)));
    wrap.appendChild(grid);

    // 📅 다가오는 일정
    const today = new Date().toISOString().slice(0, 10);
    const future = (RECO.events || []).filter(e => e.date >= today).slice(0, 5);
    if (future.length) {
      wrap.appendChild(el('h2', 'homesec', '📅 다가오는 주요 일정'));
      const evTbl = el('table', 'plain');
      const evb = el('tbody');
      future.forEach(ev => {
        const dday = Math.round((new Date(ev.date) - new Date(today)) / 86400000);
        const tr = el('tr');
        const td1 = el('td');
        td1.style.whiteSpace = 'nowrap';
        td1.appendChild(el('b', null, dday === 0 ? '오늘' : `D-${dday}`));
        td1.appendChild(el('div', 'bd', ev.date.slice(5).replace('-', '/')));
        tr.appendChild(td1);
        const td2 = el('td');
        td2.appendChild(el('div', null, `${ev.kind === '실적' ? '📊' : ev.kind === '배당' ? '💰' : ev.kind === '금리' ? '🏦' : '🔔'} ${ev.title}`));
        td2.appendChild(el('div', 'bd', ev.note));
        tr.appendChild(td2);
        const td3 = el('td', null, '영향 ' + ev.impact);
        td3.style.whiteSpace = 'nowrap';
        tr.appendChild(td3);
        evb.appendChild(tr);
      });
      evTbl.appendChild(evb);
      wrap.appendChild(evTbl);
    }

    const btnRow = el('div');
    btnRow.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.9rem';
    const all = el('button', 'iconbtn', '추천 12종목 전체 보기 →');
    all.type = 'button';
    all.addEventListener('click', () => { state.view = 'reco'; state.level = 'all'; renderAll(); window.scrollTo({ top: 0 }); });
    btnRow.appendChild(all);
    const sureBtn = el('button', 'iconbtn', '🛡️ 원금 보전이 우선이라면 →');
    sureBtn.type = 'button';
    sureBtn.addEventListener('click', () => { state.view = 'sure'; renderAll(); window.scrollTo({ top: 0 }); });
    btnRow.appendChild(sureBtn);
    wrap.appendChild(btnRow);

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
      row(tb, '매수 가능 수량', r.shares.toLocaleString('ko-KR') + '주');
      row(tb, '실제 투입금액', krw(r.investedKrw));
      row(tb, '매도금액 (목표가 기준)', krw(r.sellKrw));
      row(tb, '매매차익 (세전)', krw(r.gainKrw), pctCls(r.gainKrw));
      row(tb, r.taxLabel, '-' + krw(r.tax));
      row(tb, '연간 배당 (세전)', r.divGrossKrw > 0 ? krw(r.divGrossKrw) : '해당 없음');
      if (r.divGrossKrw > 0) row(tb, '연간 배당 실수령 (세후)', krw(r.divNetKrw), 'pos');
      row(tb, '매도 실수령액 (세후)', krw(r.netKrw));
      row(tb, '세후 수익률 (배당 제외)', pct(r.netRet), pctCls(r.netRet));
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
      eb.appendChild(el('div', 'eb-t', '💡 기업 개요'));
      eb.appendChild(el('div', null, easy.company));
      eb.appendChild(el('div', 'eb-t', '🎯 핵심 투자 포인트'));
      const olw = el('ol');
      easy.why.forEach(w => olw.appendChild(el('li', null, w)));
      eb.appendChild(olw);
      eb.appendChild(el('div', 'eb-t', '🗓️ 실행 전략'));
      eb.appendChild(el('div', null, easy.plan));
      eb.appendChild(el('div', 'eb-t', LEVELS[pickLevel(p)].label + ' — 적합성 판단'));
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
    tiles.appendChild(tile('기대수익률 (기본 시나리오)', pct(p.expectedReturn.base), pctCls(p.expectedReturn.base), '목표가 도달 시'));
    if (sim) {
      tiles.appendChild(tile('이익 확률', sim.final.pProfit.toFixed(0) + '%', '', '시뮬레이션 2만 경로'));
      tiles.appendChild(tile('목표가 도달확률', sim.final.pHitTarget.toFixed(0) + '%', '', '기간 내 1회 이상'));
      tiles.appendChild(tile('손절가 도달확률', sim.final.pHitStop.toFixed(0) + '%', '', '기간 내 1회 이상'));
    }
    m.appendChild(tiles);

    section(m, '🗓️ 매매 계획 (시점 · 가격)');
    const plan = el('table', 'plain');
    {
      const thead = el('thead'); const hr = el('tr');
      ['구분', '시기 (현지시간)', '한국시간', '가격'].forEach(h => hr.appendChild(el('th', null, h)));
      thead.appendChild(hr); plan.appendChild(thead);
      const tb = el('tbody');
      const tr1 = el('tr');
      tr1.appendChild(el('td', null, '매수'));
      tr1.appendChild(el('td', null, p.buy.window));
      tr1.appendChild(el('td', null, p.buy.windowKst));
      tr1.appendChild(el('td', 'num', `${money(p.buy.low, p.currency)} ~ ${money(p.buy.high, p.currency)}`));
      tb.appendChild(tr1);
      const tr2 = el('tr');
      const sellLbl = el('td');
      sellLbl.appendChild(el('div', null, '매도 목표 (도달 시)'));
      if (sim) sellLbl.appendChild(el('div', 'bd', `도달확률 ${sim.final.pHitTarget.toFixed(0)}% — 예측이 아닌 조건`));
      tr2.appendChild(sellLbl);
      tr2.appendChild(el('td', null, p.sell.window));
      tr2.appendChild(el('td', null, p.sell.windowKst));
      tr2.appendChild(el('td', 'num', `${money(p.sell.low, p.currency)} ~ ${money(p.sell.high, p.currency)}`));
      tb.appendChild(tr2);
      const trM = el('tr');
      trM.appendChild(el('td', null, '미도달 시'));
      const mc = el('td', null, p.horizon === 'day'
        ? '장 마감 전 시장가 청산 (당일 전략은 포지션을 넘기지 않음)'
        : '기간 종료 시점에 재평가 — 논리 유효하면 연장, 훼손 시 정리');
      mc.colSpan = 2;
      trM.appendChild(mc);
      trM.appendChild(el('td', 'num', p.horizon === 'day' ? '마감가' : '재평가'));
      tb.appendChild(trM);
      const tr3 = el('tr');
      tr3.appendChild(el('td', null, '손절'));
      const scd = el('td', null, '도달 즉시 (자동 주문 권장)');
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

    section(m, '🔮 시나리오 분석');
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
      section(m, '🎲 몬테카를로 시뮬레이션 (20,000 경로)');
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

    // 상세 정보는 접이식으로 — 핵심(계획·시나리오·시뮬레이션)만 항상 표시
    const fold = (title, build, open) => {
      const d = el('details', 'lesson');
      d.style.marginTop = '0.9rem';
      if (open) d.open = true;
      d.appendChild(el('summary', null, title));
      const body = el('div', 'lb');
      build(body);
      d.appendChild(body);
      m.appendChild(d);
    };

    fold('📚 투자 근거 (뉴스 · 기술적 분석 · 펀더멘털)', body => {
      const sub = (t, arr) => {
        body.appendChild(el('div', 'eb-t', t));
        const ul = el('ul', 'pts');
        arr.forEach(x => ul.appendChild(liTerms(x)));
        body.appendChild(ul);
      };
      sub('📰 뉴스·이벤트', p.rationale.news);
      sub('📉 기술적 분석', p.rationale.technical);
      sub('🏢 펀더멘털', p.rationale.fundamental);
    });

    fold('⚠️ 리스크 요인 (예측 변수)', body => {
      const ul = el('ul', 'pts');
      p.riskFactors.forEach(t => ul.appendChild(liTerms(t)));
      body.appendChild(ul);
    });

    fold('💰 배당 정보', body => {
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
        body.appendChild(dt);
        const dn = el('p', 'summary');
        dn.appendChild(linkTerms(d.note + (p.market === 'US' ? ' — 미국 배당은 15% 원천징수 후 입금됩니다.' : ' — 국내 배당은 15.4% 원천징수 후 입금됩니다.')));
        body.appendChild(dn);
      } else {
        body.appendChild(el('p', 'summary', '무배당 종목입니다 — 수익은 시세차익으로만 발생합니다.'));
      }
    });

    fold('🧾 세후 실수령 계산기 (한국 세법 기준)', body => {
      body.appendChild(taxCalcBlock(p));
    });

    m.appendChild(el('p', 'summary', '⚠️ ' + RECO.meta.disclaimer));

    back.classList.add('open');
    document.body.style.overflow = 'hidden';
    back.scrollTop = 0;
  }

  // ───────── 실행 플랜 (따라하기 마법사) ─────────
  const PLAN_STYLES = {
    safe:     { label: '🟢 안정 우선', desc: '원금 보전이 최우선 — 대부분을 무위험 금리 자산에', alloc: { kofr: 0.5, sgov: 0.2, voo: 0.2, k200: 0.1, picks: 0 } },
    balanced: { label: '🟡 균형', desc: '안정 자산을 바탕에 깔고 성장 자산을 절반 가까이', alloc: { kofr: 0.3, sgov: 0.1, voo: 0.25, k200: 0.15, picks: 0.2 } },
    growth:   { label: '🔴 성장 추구', desc: '변동을 감수하고 기대수익을 높게 — 장기 전제', alloc: { kofr: 0.1, sgov: 0, voo: 0.3, k200: 0.2, picks: 0.4 } },
  };
  function loadPlan() {
    try { return JSON.parse(localStorage.getItem('plan-v1')) || { budget: 3000000, style: 'safe', checks: {} }; }
    catch { return { budget: 3000000, style: 'safe', checks: {} }; }
  }
  function savePlan(p) { localStorage.setItem('plan-v1', JSON.stringify(p)); }
  function sureById(id) { return RECO.sureItems.find(s => s.id === id); }

  function renderPlan() {
    const wrap = $('#view-plan');
    wrap.textContent = '';
    const plan = loadPlan();
    const fx = RECO.meta.fxUsdKrw;

    const hero = el('div', 'hero');
    hero.appendChild(el('div', 'weather', '🧭 실행 플랜 — 예산과 성향만 정하면 주문서까지 완성됩니다'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms('절차: ① 투자 가능 금액 입력 → ② 투자 성향 선택 → ③ 자동 생성된 주문서를 증권사 앱에 그대로 입력. 무위험 금리 자산 비중은 사실상 확정 수익이며, 주식 비중은 확률적 수익입니다 — 구성비로 그 균형을 조절합니다.'));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    // ① 예산
    wrap.appendChild(el('h2', 'homesec', '① 투자 가능 금액'));
    const budBox = el('div', 'calc');
    const inrow = el('div', 'inrow');
    const lab = el('label');
    lab.appendChild(el('span', null, '금액 (원) — 잃어도 생활에 지장 없는 돈만'));
    const budIn = el('input');
    budIn.type = 'number'; budIn.value = plan.budget; budIn.min = 100000; budIn.step = 100000;
    lab.appendChild(budIn);
    inrow.appendChild(lab);
    budBox.appendChild(inrow);
    wrap.appendChild(budBox);

    // ② 성향
    wrap.appendChild(el('h2', 'homesec', '② 투자 성향'));
    const styleRow = el('div', 'steps');
    Object.entries(PLAN_STYLES).forEach(([key, s]) => {
      const c = el('div', 'step-card');
      c.tabIndex = 0; c.setAttribute('role', 'button');
      if (plan.style === key) { c.style.borderColor = 'var(--accent)'; c.style.borderWidth = '2px'; }
      c.appendChild(el('div', 'sn', plan.style === key ? '✓ 선택됨' : '선택'));
      c.appendChild(el('div', 'st', s.label));
      c.appendChild(el('div', 'sd', s.desc));
      const go = () => { plan.style = key; savePlan(plan); renderPlan(); };
      c.addEventListener('click', go);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      styleRow.appendChild(c);
    });
    wrap.appendChild(styleRow);

    // ③ 주문서 생성
    wrap.appendChild(el('h2', 'homesec', '③ 주문서 (증권사 앱에 이대로 입력)'));
    const budget = Math.max(0, +budIn.value || plan.budget);
    const alloc = PLAN_STYLES[plan.style].alloc;

    const rows = [];
    const addSure = (id, weight, note) => {
      if (!weight) return;
      const s = sureById(id);
      if (!s) return;
      const amt = budget * weight;
      const unit = s.currency === 'USD' ? s.refPrice * fx : s.refPrice;
      const qty = s.currency === 'USD' ? Math.floor(amt / unit * 100) / 100 : Math.floor(amt / unit);
      rows.push({
        key: id, name: s.name, ticker: s.ticker, weight, amt, qty,
        how: `지정가 ${money(s.buy.low, s.currency)}~${money(s.buy.high, s.currency)}`,
        when: note || s.buy.windowKst,
        expect: SIM[s.simId] ? `연 ${pct(SIM[s.simId].final.median)} (중앙값)` : '-',
        sure: s.tier === 1,
        obj: s,
      });
    };
    addSure('sure-kofr', alloc.kofr, '아무 때나 (한국 장중)');
    addSure('sure-sgov', alloc.sgov, '아무 때나 (미국 장중)');
    addSure('sure-voo', alloc.voo, '매달 같은 날 정액 적립 권장');
    addSure('sure-k200', alloc.k200, '매달 같은 날 정액 적립 권장');

    if (alloc.picks > 0) {
      const order = { ok: 0, mid: 1, pro: 2 };
      const cands = batchPicks()
        .filter(p => (p.horizon === 'long' || p.horizon === 'month') && pickLevel(p) !== 'pro')
        .sort((a, b) => (order[pickLevel(a)] - order[pickLevel(b)]) || ((SIM[b.simId]?.final.pProfit || 0) - (SIM[a.simId]?.final.pProfit || 0)))
        .slice(0, 2);
      const each = alloc.picks / Math.max(1, cands.length);
      cands.forEach(p => {
        const amt = budget * each;
        const buyP = (p.buy.low + p.buy.high) / 2;
        const unit = p.currency === 'USD' ? buyP * fx : buyP;
        const qty = p.currency === 'USD' ? Math.floor(amt / unit * 100) / 100 : Math.floor(amt / unit);
        rows.push({
          key: p.id, name: p.name, ticker: p.ticker, weight: each, amt, qty,
          how: `지정가 ${money(p.buy.low, p.currency)}~${money(p.buy.high, p.currency)} 분할 매수`,
          when: p.buy.windowKst,
          expect: SIM[p.simId] ? `이익 확률 ${SIM[p.simId].final.pProfit.toFixed(0)}% · 기대 ${pct(p.expectedReturn.base)}` : '-',
          sure: false,
          obj: p,
        });
      });
    }

    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr2 = el('tr');
    ['완료', '자산', '배분', '금액', '수량', '주문 방법 · 시점', '예상'].forEach((h, i) => hr2.appendChild(el('th', i >= 2 && i <= 4 ? 'num' : null, h)));
    thead.appendChild(hr2); tbl.appendChild(thead);
    const tb = el('tbody');
    rows.forEach(r => {
      const tr = el('tr');
      const tdC = el('td');
      const chk = el('input');
      chk.type = 'checkbox';
      chk.checked = !!plan.checks[plan.style + ':' + r.key];
      chk.setAttribute('aria-label', r.name + ' 주문 완료');
      chk.addEventListener('change', () => { plan.checks[plan.style + ':' + r.key] = chk.checked; savePlan(plan); });
      tdC.appendChild(chk);
      tr.appendChild(tdC);
      const tdN = el('td');
      const nameBtn = el('button', 'bopen', r.name);
      nameBtn.type = 'button';
      nameBtn.style.fontSize = '0.86rem';
      nameBtn.addEventListener('click', () => openModal(r.obj));
      tdN.appendChild(nameBtn);
      tdN.appendChild(el('div', 'bd', r.ticker + (r.sure ? ' · 🛡️ 원금 보전형' : ' · 확률형')));
      tr.appendChild(tdN);
      tr.appendChild(el('td', 'num', Math.round(r.weight * 100) + '%'));
      tr.appendChild(el('td', 'num', krw(r.amt)));
      tr.appendChild(el('td', 'num', r.qty.toLocaleString('ko-KR') + '주'));
      const tdH = el('td');
      tdH.appendChild(el('div', null, r.how));
      tdH.appendChild(el('div', 'bd', r.when));
      tr.appendChild(tdH);
      tr.appendChild(el('td', null, r.expect));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const tblScroll = el('div');
    tblScroll.style.overflowX = 'auto';
    tblScroll.appendChild(tbl);
    wrap.appendChild(tblScroll);

    // 요약: 확정 vs 확률
    const surePart = rows.filter(r => r.sure).reduce((s, r) => s + r.weight, 0);
    const summ = el('div', 'easybox');
    summ.style.marginTop = '0.9rem';
    summ.appendChild(el('div', 'eb-t', '이 플랜의 정직한 요약'));
    summ.appendChild(el('div', null, `전체의 ${Math.round(surePart * 100)}%는 원금 보전형 금리 자산(사실상 확정, 연 2~4%)이고, 나머지 ${Math.round((1 - surePart) * 100)}%는 확률적 수익 자산입니다. 확정 비중이 높을수록 잃을 가능성은 낮아지고 기대수익도 낮아집니다 — 이 균형은 위의 투자 성향으로 조절하세요.`));
    wrap.appendChild(summ);

    // 실행 체크리스트
    wrap.appendChild(el('h2', 'homesec', '④ 실행 순서 (증권사 앱)'));
    const steps = [
      '증권사 앱을 열고 로그인합니다 (미성년자는 보호자 동반 계좌).',
      '위 표의 티커(예: 423160)를 검색합니다.',
      '"지정가" 주문을 선택하고, 표의 가격 범위 안의 값과 수량을 입력합니다.',
      '주문 후 위 표의 완료 체크박스에 표시합니다 (이 브라우저에 저장됩니다).',
      '적립 권장 자산(VOO·KODEX 200)은 매달 같은 날 같은 금액으로 반복합니다 — 자동 적립 설정이 있으면 활용하세요.',
      '📊 성과 검증 탭에서 추천의 실제 결과가 매일 채점되는 것을 확인하세요.',
    ];
    const ol = el('ol', 'pts');
    ol.style.paddingLeft = '1.3rem';
    steps.forEach(s => ol.appendChild(liTerms(s)));
    wrap.appendChild(ol);

    wrap.appendChild(el('p', 'hist-note', '⚠️ 이 플랜은 손실 가능성을 구조적으로 낮춘 구성이지 수익 보장이 아닙니다. 주식 비중은 단기적으로 마이너스가 될 수 있으며, "따라만 하면 반드시 번다"고 말하는 서비스는 신뢰하지 마세요. 확정에 가까운 것은 금리 자산뿐이고, 그 수익률은 연 2~4%입니다.'));

    budIn.addEventListener('change', () => { plan.budget = +budIn.value || 0; savePlan(plan); renderPlan(); });
  }

  // ───────── 확실 수익 ─────────
  function renderSure() {
    const wrap = $('#view-sure');
    wrap.textContent = '';

    const hero = el('div', 'hero');
    hero.appendChild(el('div', 'weather', '🛡️ 안정 수익 — "확실함"의 실제 시세부터'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms('금융의 기본 원리: 확실성과 수익률은 반비례합니다. 이 원리를 깨는 "확실한 고수익"은 존재하지 않으며, 그렇게 광고하는 상품은 예외 없이 사기입니다. 이 페이지는 확실성이 높은 순서로 자산을 정리합니다.'));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    const tierNote = {
      1: '시뮬레이션 20,000 경로 전부 이익 — 미국·한국 정부 신용에 기반한, 확실성이 가장 높은 자산군입니다. 기대수익률은 연 2~4% 수준입니다.',
      2: '1년 단위 승률은 60~80%지만, 역사상 15~20년 이상 보유 시 손실 사례가 없습니다. 보유 기간이 확실성을 만듭니다 — 매월 정액 적립(DCA)이 표준 전략입니다.',
    };
    [1, 2].forEach(tier => {
      wrap.appendChild(el('h2', 'homesec', tier === 1 ? 'Tier 1 · 원금 보전형 (시뮬 이익 확률 100%)' : 'Tier 2 · 장기 분산 적립 (시간 분산)'));
      const note = el('p', 'viewdesc');
      note.appendChild(linkTerms(tierNote[tier]));
      wrap.appendChild(note);
      const grid = el('div', 'grid');
      RECO.sureItems.filter(s => s.tier === tier).forEach(s => grid.appendChild(pickCard(s)));
      wrap.appendChild(grid);
    });

    // S&P 500 역사 승률 표
    wrap.appendChild(el('h2', 'homesec', '📜 근거: S&P 500 보유 기간별 역사 통계 (1928년~)'));
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['보유 기간', '플러스 비율', '최악의 사례', '해석'].forEach(h => hr.appendChild(el('th', null, h)));
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
    warn.appendChild(el('div', 'eb-t', '🚨 유의사항'));
    warn.appendChild(el('div', null, '과거 통계이지 미래 보장이 아닙니다. 또한 이 표는 지수(분산 포트폴리오)에만 해당하며, 개별 종목에는 적용되지 않습니다 — 개별 기업은 파산할 수 있습니다. 더 높은 기대수익을 추구하는 확률 기반 전략은 📋 추천 종목 탭을 참고하세요.'));
    wrap.appendChild(warn);

    const cta = el('button', 'iconbtn', '📋 확률 기반 추천 보기 →');
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
    wrap.appendChild(el('p', 'viewdesc', '가상 예산으로 포트폴리오를 구성하면 시나리오별(낙관·기본·보수) 평가금액을 미리 확인할 수 있습니다. 데이터는 이 브라우저에만 저장됩니다.'));
    const basket = loadBasket();
    const fx = RECO.meta.fxUsdKrw;
    const picks = RECO.sureItems.concat(batchPicks());

    const grid = el('div', 'pgrid');

    // 왼쪽: 장바구니
    const left = el('div', 'basket');
    left.appendChild(el('h3', null, '🧺 포트폴리오 구성'));
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
    const addBtn = el('button', null, '+ 추가');
    addBtn.type = 'button';
    addRow.appendChild(sel); addRow.appendChild(addBtn);
    left.appendChild(addRow);

    // 오른쪽: 결과
    const right = el('div', 'basket');
    right.appendChild(el('h3', null, '🔭 시나리오별 예상 평가금액'));
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
        const rm = el('button', 'brm', '제거');
        rm.type = 'button';
        rm.addEventListener('click', () => { basket.items.splice(idx, 1); saveBasket(basket); renderItems(); renderOut(); });
        row.appendChild(rm);
        itemsBox.appendChild(row);
      });
      if (!basket.items.length) itemsBox.appendChild(el('p', 'viewdesc', '아직 비어 있습니다. 아래에서 종목을 추가해 보세요.'));
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
      if (!rows.length) { outBox.appendChild(el('p', 'viewdesc', '종목을 추가하면 결과가 표시됩니다.')); return; }
      const tbl = el('table', 'plain');
      const thead = el('thead'); const hr = el('tr');
      ['종목', '수량', '낙관', '기본', '보수'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
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

  // ───────── 성과 검증 ─────────
  function findPickAnywhere(id) {
    for (const b of RECO.batches) {
      const p = b.picks.find(x => x.id === id);
      if (p) return { pick: p, batch: b };
    }
    return null;
  }
  function renderPerf() {
    const wrap = $('#view-perf');
    wrap.textContent = '';
    const oc = RECO.outcomes || { records: {} };

    const hero = el('div', 'hero');
    hero.appendChild(el('div', 'weather', '📊 예측 채점표 — 맞은 것도, 틀린 것도 전부 공개해요'));
    const wd = el('p', 'wdesc');
    wd.appendChild(linkTerms('세상에 예측을 다 맞히는 사람은 없어요. 중요한 건 ① 결과를 숨기지 않고 기록하고, ② 틀린 이유를 분석해서, ③ 다음 모델을 고치는 거예요. 이 페이지가 그 작업의 기록입니다. "실패 없음"을 자랑하는 서비스는 기록을 지우고 있는 거예요.'));
    hero.appendChild(wd);
    wrap.appendChild(hero);

    // 채점 요약 타일
    const recs = Object.entries(oc.records || {});
    const closed = recs.filter(([, r]) => ['success', 'partial', 'fail', 'invalid'].includes(r.status));
    const wins = closed.filter(([, r]) => r.status === 'success' || r.status === 'partial').length;
    const fails = closed.filter(([, r]) => r.status === 'fail').length;
    const tiles = el('div', 'tiles');
    const tile = (lb, vl, note) => {
      const t = el('div', 'tile');
      t.appendChild(el('div', 'lb', lb));
      t.appendChild(el('div', 'vl', vl));
      if (note) t.appendChild(el('div', 'note', note));
      return t;
    };
    tiles.appendChild(tile('채점 완료', closed.length + '건', '판정이 끝난 예측'));
    tiles.appendChild(tile('성공·부분성공', wins + '건', '목표 방향 적중'));
    tiles.appendChild(tile('실패(손절)', fails + '건', '숨기지 않아요'));
    tiles.appendChild(tile('진행 중', (recs.length - closed.length) + '건', '아직 기간이 안 끝남'));
    wrap.appendChild(tiles);

    // 채점표
    wrap.appendChild(el('h2', 'homesec', '📋 예측 vs 실제'));
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['종목 (배치)', '계획', '실제 결과', '판정'].forEach(h => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    for (const [id, r] of recs) {
      const found = findPickAnywhere(id);
      if (!found) continue;
      const { pick: p, batch: b } = found;
      const om = OUTCOME_META[r.status] || OUTCOME_META.pending;
      const tr = el('tr');
      const tdN = el('td');
      tdN.appendChild(el('div', null, `${p.name}`));
      tdN.appendChild(el('div', 'bd', `${p.ticker} · ${HORIZONS[p.horizon].label} · ${b.id.replace('batch-', '')}`));
      tr.appendChild(tdN);
      tr.appendChild(el('td', null, `${money(p.buy.low, p.currency)}~${money(p.buy.high, p.currency)} 매수 → ${money(p.sell.low, p.currency)}~${money(p.sell.high, p.currency)} 목표 (손절 ${money(p.sell.stop, p.currency)})`));
      const tdA = el('td');
      tdA.appendChild(linkTerms(r.detail || '-'));
      tr.appendChild(tdA);
      const tdJ = el('td');
      const jb = el('span', null, `${om.icon} ${r.title || om.label}`);
      jb.style.cssText = 'font-weight:700;color:' + om.color;
      tdJ.appendChild(jb);
      tr.appendChild(tdJ);
      tb.appendChild(tr);
    }
    if (!recs.length) {
      const tr = el('tr');
      const td = el('td', null, '아직 채점된 예측이 없어요. 각 배치의 보유 기간이 끝나면 자동으로 기록돼요.');
      td.colSpan = 4;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);

    // 교훈
    if (RECO.lessons && RECO.lessons.length) {
      wrap.appendChild(el('h2', 'homesec', '🧠 실패에서 배운 것 (교훈 → 모델 반영)'));
      RECO.lessons.forEach(ls => {
        const box = el('div', 'batch');
        box.appendChild(el('div', 'bt', ls.title));
        box.appendChild(el('div', 'bd', ls.date));
        const bs = el('div', 'bs');
        bs.appendChild(linkTerms(ls.text));
        box.appendChild(bs);
        wrap.appendChild(box);
      });
    }

    // 모델 개선 이력
    if (RECO.modelChangelog && RECO.modelChangelog.length) {
      wrap.appendChild(el('h2', 'homesec', '🔧 예측 모델 개선 이력'));
      const ct = el('table', 'plain');
      const cth = el('thead'); const chr = el('tr');
      ['버전', '날짜', '바뀐 것'].forEach(h => chr.appendChild(el('th', null, h)));
      cth.appendChild(chr); ct.appendChild(cth);
      const ctb = el('tbody');
      RECO.modelChangelog.forEach(c => {
        const tr = el('tr');
        tr.appendChild(el('td', null, c.version));
        tr.appendChild(el('td', null, c.date));
        const td = el('td');
        const ul = el('ul', 'pts');
        c.changes.forEach(ch => ul.appendChild(liTerms(ch)));
        td.appendChild(ul);
        tr.appendChild(td);
        ctb.appendChild(tr);
      });
      ct.appendChild(ctb);
      wrap.appendChild(ct);
    }

    wrap.appendChild(el('p', 'hist-note', '판정 기준: ✅ 성공 = 목표가 도달 · 🟡 부분 성공 = 이익 실현했으나 목표 미달 · ❌ 실패 = 손절가 도달 · ➖ 무효 = 갭 등으로 매수 범위 자체가 성립 안 함(포지션 없음) · ⏳ 진행 중 = 보유 기간 미종료. 채점은 매일 아침 자동 갱신 때 함께 업데이트돼요.'));
  }

  // ───────── 내 포트폴리오 ─────────
  function knownAssets() {
    const map = {};
    RECO.sureItems.forEach(s => {
      map[s.ticker] = { ticker: s.ticker, name: s.name, price: s.refPrice, currency: s.currency, sure: s.tier === 1, divYr: annualDividend(s), market: s.market };
    });
    batchPicks().forEach(p => {
      if (!map[p.ticker]) map[p.ticker] = { ticker: p.ticker, name: p.name.replace(/ \(.*\)$/, ''), price: p.refPrice, currency: p.currency, sure: false, divYr: annualDividend(p), market: p.market };
    });
    return map;
  }
  function loadPf() {
    try { return JSON.parse(localStorage.getItem('pf-v1')) || []; }
    catch { return []; }
  }
  function savePf(rows) { localStorage.setItem('pf-v1', JSON.stringify(rows)); }

  function renderPortfolio() {
    const wrap = $('#view-portfolio');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'viewdesc', '보유 종목을 입력하면 평가금액 · 손익 · 비중 · 진단 · 예상 배당을 계산합니다. 기준가는 최신 배치 기준이며(실시간 아님), 데이터는 이 브라우저에만 저장됩니다.'));
    const assets = knownAssets();
    const fx = RECO.meta.fxUsdKrw;
    const rows = loadPf();

    // 입력 폼
    const form = el('div', 'calc');
    const inrow = el('div', 'inrow');
    const sel = el('select');
    sel.style.cssText = 'font:inherit;font-size:0.84rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);color:var(--text-primary);max-width:240px';
    Object.values(assets).forEach(a => {
      const o = el('option', null, `${a.name} (${a.ticker})`);
      o.value = a.ticker;
      sel.appendChild(o);
    });
    const oCustom = el('option', null, '직접 입력 (목록에 없는 종목)');
    oCustom.value = '__custom__';
    sel.appendChild(oCustom);
    const mk = (ph, step) => {
      const i = el('input');
      i.type = 'number'; i.placeholder = ph; i.min = 0; if (step) i.step = step;
      i.style.width = '110px';
      return i;
    };
    const qtyIn = mk('수량', 0.01);
    const avgIn = mk('평단가', 0.01);
    const nameIn = el('input');
    nameIn.type = 'text'; nameIn.placeholder = '종목명 (직접 입력)'; nameIn.style.width = '150px'; nameIn.style.display = 'none';
    const priceIn = mk('현재가', 0.01); priceIn.style.display = 'none';
    const curSel = el('select');
    curSel.style.cssText = sel.style.cssText; curSel.style.display = 'none';
    ['KRW', 'USD'].forEach(c => { const o = el('option', null, c); o.value = c; curSel.appendChild(o); });
    sel.addEventListener('change', () => {
      const custom = sel.value === '__custom__';
      nameIn.style.display = priceIn.style.display = curSel.style.display = custom ? '' : 'none';
    });
    const addBtn = el('button', 'iconbtn', '+ 보유 종목 추가');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const qty = +qtyIn.value, avg = +avgIn.value;
      if (!qty || !avg) { alert('수량과 평단가를 입력하세요.'); return; }
      if (sel.value === '__custom__') {
        if (!nameIn.value || !+priceIn.value) { alert('종목명과 현재가를 입력하세요.'); return; }
        rows.push({ ticker: 'custom-' + Date.now(), name: nameIn.value.slice(0, 40), qty, avg, price: +priceIn.value, currency: curSel.value, custom: true });
      } else {
        rows.push({ ticker: sel.value, qty, avg });
      }
      savePf(rows); renderPortfolio();
    });
    [sel, qtyIn, avgIn, nameIn, priceIn, curSel, addBtn].forEach(x => inrow.appendChild(x));
    form.appendChild(inrow);
    form.appendChild(el('p', 'note', '수량 소수점 입력 가능 (미국주식 소수점 매매). 평단가·현재가는 해당 통화 기준.'));
    wrap.appendChild(form);

    if (!rows.length) {
      wrap.appendChild(el('p', 'hist-note', '아직 입력된 보유 종목이 없습니다. 위에서 추가해 보세요.'));
      return;
    }

    // 평가 계산
    const evald = rows.map((r, idx) => {
      const a = r.custom ? r : assets[r.ticker];
      if (!a) return null;
      const price = r.custom ? r.price : a.price;
      const currency = r.custom ? r.currency : a.currency;
      const toKrw = v => currency === 'USD' ? v * fx : v;
      const value = toKrw(price * r.qty);
      const cost = toKrw(r.avg * r.qty);
      return {
        idx, name: r.custom ? r.name : a.name, ticker: r.custom ? '직접 입력' : r.ticker,
        qty: r.qty, avg: r.avg, price, currency, value, cost,
        pnl: cost ? (value - cost) / cost * 100 : 0,
        sure: !r.custom && a.sure,
        divKrw: r.custom ? 0 : toKrw((a.divYr || 0) * r.qty) * (a.market === 'US' ? 0.85 : 0.846),
      };
    }).filter(Boolean);
    const total = evald.reduce((s, e) => s + e.value, 0);
    const totalCost = evald.reduce((s, e) => s + e.cost, 0);
    const totalDiv = evald.reduce((s, e) => s + e.divKrw, 0);
    const sureW = total ? evald.filter(e => e.sure).reduce((s, e) => s + e.value, 0) / total : 0;

    // 요약 타일
    const tiles = el('div', 'tiles');
    const tile = (lb, vl, cls, note) => {
      const t = el('div', 'tile');
      t.appendChild(el('div', 'lb', lb));
      t.appendChild(el('div', 'vl ' + (cls || ''), vl));
      if (note) t.appendChild(el('div', 'note', note));
      return t;
    };
    const totPnl = totalCost ? (total - totalCost) / totalCost * 100 : 0;
    tiles.appendChild(tile('총 평가금액', krw(total), '', '기준가 기준 (실시간 아님)'));
    tiles.appendChild(tile('총 손익', pct(totPnl), pctCls(totPnl), krw(total - totalCost)));
    tiles.appendChild(tile('예상 연 배당 (세후)', krw(totalDiv), totalDiv > 0 ? 'pos' : '', '월평균 ' + krw(totalDiv / 12)));
    tiles.appendChild(tile('원금 보전형 비중', Math.round(sureW * 100) + '%', '', '금리형 자산 기준'));
    wrap.appendChild(tiles);

    // 보유 목록
    wrap.appendChild(el('h2', 'homesec', '보유 종목'));
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['종목', '수량', '평단가', '기준가', '평가액', '손익', '비중', ''].forEach((h, i) => hr.appendChild(el('th', i >= 1 && i <= 6 ? 'num' : null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    evald.forEach(e => {
      const tr = el('tr');
      const tdN = el('td');
      tdN.appendChild(el('div', null, e.name));
      tdN.appendChild(el('div', 'bd', e.ticker));
      tr.appendChild(tdN);
      tr.appendChild(el('td', 'num', e.qty.toLocaleString('ko-KR') + '주'));
      tr.appendChild(el('td', 'num', money(e.avg, e.currency)));
      tr.appendChild(el('td', 'num', money(e.price, e.currency)));
      tr.appendChild(el('td', 'num', krw(e.value)));
      const tdP = el('td', 'num');
      tdP.appendChild(el('span', pctCls(e.pnl), pct(e.pnl)));
      if (Math.abs(e.pnl) > 80) tdP.appendChild(el('div', 'bd', '⚠️ 평단가 통화 확인'));
      tr.appendChild(tdP);
      const w = total ? e.value / total * 100 : 0;
      const tdW = el('td', 'num');
      tdW.appendChild(el('div', null, w.toFixed(0) + '%'));
      const bar = el('div');
      bar.style.cssText = 'height:6px;border-radius:3px;background:var(--series-1);margin-top:3px;width:' + Math.max(3, Math.min(100, w)) + '%';
      tdW.appendChild(bar);
      tr.appendChild(tdW);
      const tdD = el('td');
      const del = el('button', 'brm', '삭제');
      del.type = 'button';
      del.addEventListener('click', () => { rows.splice(e.idx, 1); savePf(rows); renderPortfolio(); });
      tdD.appendChild(del);
      tr.appendChild(tdD);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const scroll = el('div'); scroll.style.overflowX = 'auto'; scroll.appendChild(tbl);
    wrap.appendChild(scroll);

    // 진단
    wrap.appendChild(el('h2', 'homesec', '🩺 포트폴리오 진단'));
    const diags = [];
    const maxW = Math.max(...evald.map(e => total ? e.value / total : 0));
    const maxE = evald.find(e => total && e.value / total === maxW);
    if (maxW > 0.3) diags.push(`⚠️ 집중 위험: ${maxE.name} 비중이 ${Math.round(maxW * 100)}%입니다 — 한 종목 30% 이하를 권장합니다 (분산투자).`);
    else diags.push('✅ 종목 분산: 단일 종목 30% 초과 없음.');
    const usdW = total ? evald.filter(e => e.currency === 'USD').reduce((s, e) => s + e.value, 0) / total : 0;
    if (usdW > 0.85 || usdW < 0.15) diags.push(`⚠️ 통화 편중: 달러 자산 ${Math.round(usdW * 100)}% — 원화/달러 분산을 고려하세요 (환율 리스크).`);
    else diags.push(`✅ 통화 분산: 달러 ${Math.round(usdW * 100)}% / 원화 ${Math.round((1 - usdW) * 100)}%.`);
    const styleTargets = { safe: 0.7, balanced: 0.4, growth: 0.1 };
    const planStyle = loadPlan().style || 'safe';
    const target = styleTargets[planStyle];
    const gap = (target - sureW) * total;
    if (Math.abs(gap) > total * 0.1 && total > 0) {
      diags.push(gap > 0
        ? `🧭 리밸런싱 제안: 실행 플랜 성향(${PLAN_STYLES[planStyle].label})의 원금 보전형 목표 ${Math.round(target * 100)}% 대비 부족 — 약 ${krw(gap)}를 금리형 자산(KOFR·SGOV)으로 옮기는 것을 검토하세요.`
        : `🧭 리밸런싱 제안: 원금 보전형 비중이 목표(${Math.round(target * 100)}%)보다 높습니다 — 계획적이라면 문제 없습니다.`);
    } else if (total > 0) {
      diags.push(`✅ 배분 일치: 원금 보전형 비중이 실행 플랜 성향(${PLAN_STYLES[planStyle].label}) 목표와 ±10% 이내입니다.`);
    }
    const ulD = el('ul', 'pts');
    diags.forEach(d => ulD.appendChild(liTerms(d)));
    wrap.appendChild(ulD);
    wrap.appendChild(el('p', 'hist-note', '기준가는 추천 배치 생성 시점 가격입니다. 정확한 평가는 증권사 앱에서 확인하세요. 직접 입력 종목은 배당 계산에서 제외됩니다.'));
  }

  // ───────── 매매 일지 ─────────
  function loadJournal() {
    try { return JSON.parse(localStorage.getItem('journal-v1')) || []; }
    catch { return []; }
  }
  function saveJournal(rows) { localStorage.setItem('journal-v1', JSON.stringify(rows)); }

  function renderJournal() {
    const wrap = $('#view-journal');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'viewdesc', '매매를 기록하고 복기하는 습관은 수익률을 올리는 가장 검증된 방법입니다. "왜 샀는지"를 적어 두면, 팔 때 감정이 아니라 기록이 판단합니다. 데이터는 이 브라우저에만 저장됩니다.'));
    const rows = loadJournal();

    const form = el('div', 'calc');
    const inrow = el('div', 'inrow');
    const dateIn = el('input'); dateIn.type = 'date'; dateIn.value = new Date().toISOString().slice(0, 10);
    dateIn.style.cssText = 'font:inherit;font-size:0.86rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:8px;background:var(--page);color:var(--text-primary)';
    const tickIn = el('input'); tickIn.type = 'text'; tickIn.placeholder = '종목/티커'; tickIn.style.width = '120px';
    const sideSel = el('select');
    sideSel.style.cssText = dateIn.style.cssText;
    ['매수', '매도'].forEach(s => { const o = el('option', null, s); o.value = s; sideSel.appendChild(o); });
    const priceIn = el('input'); priceIn.type = 'number'; priceIn.placeholder = '가격'; priceIn.style.width = '110px';
    const qtyIn = el('input'); qtyIn.type = 'number'; qtyIn.placeholder = '수량'; qtyIn.style.width = '90px';
    const reasonIn = el('input'); reasonIn.type = 'text'; reasonIn.placeholder = '이유 (예: 실적 D-7 런업, 손절 규칙)'; reasonIn.style.cssText = 'flex:1;min-width:200px';
    const addBtn = el('button', 'iconbtn', '+ 기록');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      if (!tickIn.value) { alert('종목을 입력하세요.'); return; }
      rows.unshift({ date: dateIn.value, ticker: tickIn.value.slice(0, 20), side: sideSel.value, price: +priceIn.value || 0, qty: +qtyIn.value || 0, reason: reasonIn.value.slice(0, 200) });
      saveJournal(rows); renderJournal();
    });
    [dateIn, tickIn, sideSel, priceIn, qtyIn, reasonIn, addBtn].forEach(x => inrow.appendChild(x));
    form.appendChild(inrow);
    wrap.appendChild(form);

    if (!rows.length) {
      wrap.appendChild(el('p', 'hist-note', '아직 기록이 없습니다. 첫 매매(또는 시뮬레이터 연습)를 기록해 보세요.'));
      return;
    }
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['날짜', '종목', '구분', '가격', '수량', '이유', ''].forEach((h, i) => hr.appendChild(el('th', i === 3 || i === 4 ? 'num' : null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    rows.forEach((r, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, r.date));
      tr.appendChild(el('td', null, r.ticker));
      const tdS = el('td');
      tdS.appendChild(el('span', r.side === '매수' ? 'pos' : 'neg', r.side));
      tr.appendChild(tdS);
      tr.appendChild(el('td', 'num', r.price ? r.price.toLocaleString('ko-KR') : '-'));
      tr.appendChild(el('td', 'num', r.qty ? r.qty.toLocaleString('ko-KR') : '-'));
      const tdR = el('td');
      tdR.appendChild(document.createTextNode(r.reason || '-'));
      tr.appendChild(tdR);
      const tdD = el('td');
      const del = el('button', 'brm', '삭제');
      del.type = 'button';
      del.addEventListener('click', () => { rows.splice(i, 1); saveJournal(rows); renderJournal(); });
      tdD.appendChild(del);
      tr.appendChild(tdD);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const scroll = el('div'); scroll.style.overflowX = 'auto'; scroll.appendChild(tbl);
    wrap.appendChild(scroll);
  }

  // ───────── 히스토리 ─────────
  function renderHistory() {
    const wrap = $('#view-history');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'hist-note',
      '추천이 생성될 때마다 배치 단위로 자동 기록됩니다. 과거 기록은 수정되지 않으며, 📊 성과 검증 탭에서 실제 결과와 대조됩니다.'));
    RECO.batches.forEach((b, i) => {
      const box = el('div', 'batch');
      box.appendChild(el('div', 'bt', b.title));
      box.appendChild(el('div', 'bd', `생성 시각 ${b.generatedAt} · ${b.picks.length}개 종목`));
      box.appendChild(el('div', 'bs', b.marketSnapshot));
      const summary = el('div', 'bs');
      summary.textContent = '종목: ' + b.picks.map(p => `${p.name}(${p.ticker})`).join(', ');
      box.appendChild(summary);
      const openBtn = el('button', 'bopen', '이 배치의 추천 열람 →');
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
    wrap.appendChild(el('p', 'viewdesc', '한국 거주 개인투자자 기준 과세 규칙입니다. 규칙을 알면 실수령액을 정확히 계산할 수 있습니다.'));
    const rules = [
      ['미국주식 양도소득세', '연간 양도차익 합산 250만원 공제 후 22% (지방소득세 포함). 다음 해 5월 자진 신고·납부.'],
      ['미국주식 배당', '미국에서 15% 원천징수. 금융소득 2,000만원 이하면 국내 추가 과세 없음.'],
      ['국내주식 양도 (소액주주 장내)', '양도소득세 없음. 매도 시 증권거래세 0.15%.'],
      ['국내 배당', '15.4% (소득세 14% + 지방소득세 1.4%) 원천징수.'],
      ['금융소득 종합과세', '이자+배당 연 2,000만원 초과분은 종합소득에 합산 과세 — 초과 시 세무 전문가 상담 권장.'],
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
    wrap.appendChild(el('p', 'hist-note', '각 종목 카드를 열면 해당 종목 가격이 미리 입력된 세후 계산기를 사용할 수 있습니다. 세법은 개정될 수 있으므로 실제 신고 시 세무 전문가와 상담하세요.'));

    // ── 실전 계산기 3종 ──
    const mkCalc = (title, inputs, compute) => {
      wrap.appendChild(el('h2', 'homesec', title));
      const box = el('div', 'calc');
      const inrow = el('div', 'inrow');
      const els = inputs.map(([label, val, step]) => {
        const lab = el('label');
        lab.appendChild(el('span', null, label));
        const i = el('input');
        i.type = 'number'; i.value = val; i.min = 0; if (step) i.step = step;
        lab.appendChild(i);
        inrow.appendChild(lab);
        return i;
      });
      box.appendChild(inrow);
      const out = el('table', 'plain');
      box.appendChild(out);
      const recalc = () => {
        out.textContent = '';
        const tb = el('tbody');
        compute(els.map(i => +i.value || 0)).forEach(([k, v, cls]) => {
          const tr = el('tr');
          tr.appendChild(el('td', null, k));
          const td = el('td', 'num');
          if (cls) td.appendChild(el('span', cls, v)); else td.textContent = v;
          tr.appendChild(td);
          tb.appendChild(tr);
        });
        out.appendChild(tb);
      };
      els.forEach(i => i.addEventListener('input', recalc));
      recalc();
      wrap.appendChild(box);
    };

    mkCalc('🧮 평단가 계산기 (추가 매수 시)', [
      ['보유 수량', 10, 1], ['현재 평단가', 100000, 100], ['추가 수량', 10, 1], ['추가 매수가', 90000, 100],
    ], ([q1, a1, q2, a2]) => {
      const tq = q1 + q2;
      const avg = tq ? (q1 * a1 + q2 * a2) / tq : 0;
      return [
        ['새 평단가', Math.round(avg).toLocaleString('ko-KR')],
        ['총 수량', tq.toLocaleString('ko-KR') + '주'],
        ['총 투입금액', Math.round(q1 * a1 + q2 * a2).toLocaleString('ko-KR')],
        ['평단 변화', (avg - a1 >= 0 ? '+' : '') + Math.round(avg - a1).toLocaleString('ko-KR'), avg <= a1 ? 'pos' : 'neg'],
      ];
    });

    mkCalc('🎯 목표 매도가 계산기 (원하는 수익률 → 필요한 가격)', [
      ['평단가', 100000, 100], ['목표 수익률 (%)', 10, 0.5], ['수량', 10, 1],
    ], ([avg, tgt, qty]) => {
      const sellP = avg * (1 + tgt / 100);
      return [
        ['필요 매도가', Math.round(sellP).toLocaleString('ko-KR')],
        ['세전 차익', Math.round((sellP - avg) * qty).toLocaleString('ko-KR'), 'pos'],
        ['참고', '해외주식은 연 250만원 초과 차익에 22% 양도세'],
      ];
    });

    mkCalc('🌱 복리 적립 계산기 (매달 얼마씩 → n년 뒤)', [
      ['월 적립액 (원)', 300000, 10000], ['연 수익률 가정 (%)', 7, 0.5], ['기간 (년)', 10, 1],
    ], ([pm, ratePct, years]) => {
      const r = ratePct / 100 / 12;
      const n = Math.round(years * 12);
      const fv = r > 0 ? pm * ((Math.pow(1 + r, n) - 1) / r) : pm * n;
      const principal = pm * n;
      return [
        ['예상 평가금액', krw(fv)],
        ['총 납입 원금', krw(principal)],
        ['복리 수익', krw(fv - principal), 'pos'],
        ['참고', 'S&P 500 장기 연평균은 약 7~10%였으나 보장 아님'],
      ];
    });
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
    if (!hits.length) searchResults.appendChild(el('p', 'viewdesc', '검색 결과가 없습니다. 다른 키워드로 시도해 보세요.'));
  }
  searchInput.addEventListener('input', () => runSearch(searchInput.value));

  // ───────── 뷰 전환 ─────────
  const NAV_GROUPS = {
    home: ['home'],
    plan: ['plan'],
    reco: ['reco', 'sure'],
    records: ['perf', 'history', 'journal'],
    more: ['portfolio', 'practice', 'tax', 'learn'],
  };
  function navOf(view) {
    return Object.keys(NAV_GROUPS).find(k => NAV_GROUPS[k].includes(view)) || 'home';
  }
  function renderSubtabs() {
    const box = $('#subtabs');
    box.textContent = '';
    const group = NAV_GROUPS[navOf(state.view)];
    if (group.length < 2) return;
    const seg = el('div', 'seg');
    seg.style.cssText = 'display:inline-flex;margin-bottom:0.9rem;background:var(--surface-1);border:1px solid var(--border);border-radius:9px;padding:2px';
    group.forEach(v => {
      const b = el('button', null, MENU_LABEL[v]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.view === v));
      b.addEventListener('click', () => { state.view = v; renderAll(); });
      seg.appendChild(b);
    });
    box.appendChild(seg);
  }
  function renderAll() {
    document.querySelectorAll('.viewtabs button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.nav === navOf(state.view))));
    renderSubtabs();
    VIEWS.forEach(v => { $('#view-' + v).style.display = state.view === v ? '' : 'none'; });
    if (state.view === 'home') renderHome();
    if (state.view === 'plan') renderPlan();
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
    if (state.view === 'portfolio') renderPortfolio();
    if (state.view === 'journal') renderJournal();
    if (state.view === 'learn') renderLearn();
    if (state.view === 'perf') renderPerf();
    if (state.view === 'history') renderHistory();
    if (state.view === 'tax') renderTax();
  }

  document.querySelectorAll('.viewtabs button').forEach(b =>
    b.addEventListener('click', () => { state.view = NAV_GROUPS[b.dataset.nav][0]; renderAll(); }));
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
  $('#disclaimer').textContent = '⚠️ 본 서비스는 투자 자문이 아닌 정보 제공 도구이며, 모든 수치는 시뮬레이션 기반 확률 추정치로 수익을 보장하지 않습니다. 원금 손실이 가능하며 투자 판단과 책임은 본인에게 있습니다.';

  renderAll();
})();
