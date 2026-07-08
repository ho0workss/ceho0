/* 종목 추천 대시보드 — vanilla JS, 외부 의존성 없음 */
(function () {
  'use strict';
  const RECO = window.RECO;
  const SIM = window.SIM_RESULTS || {};

  const HORIZONS = {
    day:   { label: '당일',   color: 'var(--series-1)' },
    week:  { label: '1주일',  color: 'var(--series-2)' },
    month: { label: '1개월',  color: 'var(--series-5)' },
    long:  { label: '장기',   color: 'var(--series-4)' },
  };
  const RISKS = {
    low:      { label: '리스크 낮음',    color: 'var(--status-good)' },
    mid:      { label: '리스크 중간',    color: 'var(--status-warning)' },
    high:     { label: '리스크 높음',    color: 'var(--status-serious)' },
    veryhigh: { label: '리스크 매우높음', color: 'var(--status-critical)' },
  };
  const MARKETS = { US: '미국', KR: '한국' };
  const KIND_X = {
    day:   { unit: '30분', axis: ['개장', '장중', '마감'], tip: i => `개장 후 ${i * 30}분` },
    week:  { unit: '거래일', axis: ['D0', 'D+2', 'D+5'], tip: i => `D+${i}`, stepLabel: s => `D+${s}` },
    month: { unit: '거래일', axis: ['D0', 'D+10', 'D+21'], tip: i => `D+${i}`, stepLabel: s => `D+${s}` },
    long:  { unit: '개월', axis: ['0', '6개월', '12개월'], tip: i => `${Math.round(i / 21)}개월 후`, stepLabel: s => `${Math.round(s / 21)}개월` },
  };

  const state = { view: 'reco', horizon: 'all', market: 'all', risk: 'all', divOnly: false, batch: 0 };

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
  function pct(v, signed = true) {
    const s = signed && v > 0 ? '+' : '';
    return s + v.toFixed(1) + '%';
  }
  function pctCls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
  function batchPicks() { return RECO.batches[state.batch].picks; }
  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // ───────── 카드 목록 ─────────
  function filteredPicks() {
    return batchPicks().filter(p =>
      (state.horizon === 'all' || p.horizon === state.horizon) &&
      (state.market === 'all' || p.market === state.market) &&
      (state.risk === 'all' || p.risk === state.risk) &&
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

  function renderCards() {
    const grid = $('#cards');
    grid.textContent = '';
    const picks = filteredPicks();
    $('#count').textContent = `${picks.length}개 종목`;
    for (const p of picks) {
      const sim = SIM[p.simId];
      const card = el('article', 'card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${p.name} 상세 보기`);

      const chips = el('div', 'chiprow');
      chips.appendChild(chip(HORIZONS[p.horizon].label, HORIZONS[p.horizon].color));
      chips.appendChild(chip(MARKETS[p.market]));
      chips.appendChild(chip(RISKS[p.risk].label, RISKS[p.risk].color));
      card.appendChild(chips);

      const tl = el('div', 'titleline');
      tl.appendChild(el('span', 'tk', p.ticker));
      tl.appendChild(el('span', 'nm', p.name));
      tl.appendChild(el('span', 'price', money(p.refPrice, p.currency)));
      card.appendChild(tl);

      const plan = el('div', 'plan');
      const b = el('div'); b.appendChild(el('b', null, '매수 ')); b.appendChild(document.createTextNode(`${money(p.buy.low, p.currency)}–${money(p.buy.high, p.currency)} · ${p.buy.windowKst}`));
      const s = el('div'); s.appendChild(el('b', null, '매도 ')); s.appendChild(document.createTextNode(`${money(p.sell.low, p.currency)}–${money(p.sell.high, p.currency)} · ${p.sell.windowKst}`));
      plan.appendChild(b); plan.appendChild(s);
      card.appendChild(plan);

      const stats = el('div', 'statrow');
      const s1 = el('div', 'stat');
      s1.appendChild(el('span', 'lb', '기본 시나리오'));
      s1.appendChild(el('span', 'vl ' + pctCls(p.expectedReturn.base), pct(p.expectedReturn.base)));
      stats.appendChild(s1);
      if (sim) {
        const s2 = el('div', 'stat');
        s2.appendChild(el('span', 'lb', '시뮬레이션 이익확률'));
        s2.appendChild(el('span', 'vl', sim.final.pProfit.toFixed(0) + '%'));
        stats.appendChild(s2);
      }
      stats.appendChild(sparkline(sim));
      card.appendChild(stats);
      card.appendChild(el('div', 'more', '상세 · 시뮬레이션 · 세금 →'));

      card.addEventListener('click', () => openModal(p));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p); } });
      grid.appendChild(card);
    }
    if (!picks.length) {
      const empty = el('p', 'hist-note', '조건에 맞는 종목이 없습니다. 필터를 조정해 보세요.');
      grid.appendChild(empty);
    }
  }

  // ───────── 팬 차트 (시뮬레이션 백분위 밴드) ─────────
  function fanChart(sim, pick) {
    const box = el('div', 'chartbox');
    const head = el('div', 'chead');
    head.appendChild(el('span', 'ctitle', '시뮬레이션 수익률 경로 (20,000회)'));
    head.appendChild(el('span', 'csub', 'GBM 몬테카를로 · 백분위 밴드'));
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

    // y 그리드 + 눈금 (solid hairline)
    const step = niceStep((y1 - y0) / 5);
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      const yy = yAt(v);
      svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'var(--grid)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: L - 7, y: yy + 3.5, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
      t.textContent = (v > 0 ? '+' : '') + v.toFixed(0) + '%';
      svg.appendChild(t);
    }
    // 0% 기준선
    if (y0 < 0 && y1 > 0) svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yAt(0), y2: yAt(0), stroke: 'var(--baseline)', 'stroke-width': 1 }));

    // 밴드
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
    // 끝점 마커 + 선택적 직접 라벨(중앙값 종점)
    const li = n - 1;
    svg.appendChild(svgEl('circle', { cx: xAt(li), cy: yAt(bands.p50[li]), r: 4, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    const endLb = svgEl('text', { x: xAt(li) - 6, y: yAt(bands.p50[li]) - 8, 'text-anchor': 'end', fill: 'var(--text-primary)', 'font-size': 11, 'font-weight': 650 });
    endLb.textContent = '중앙값 ' + pct(bands.p50[li]);
    svg.appendChild(endLb);

    // x축 라벨
    const kx = KIND_X[pick.horizon];
    const axisPts = [0, Math.floor((n - 1) / 2), n - 1];
    kx.axis.forEach((lab, i) => {
      const t = svgEl('text', { x: xAt(axisPts[i]), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', fill: 'var(--text-muted)', 'font-size': 10 });
      t.textContent = lab;
      svg.appendChild(t);
    });

    // 크로스헤어 + 툴팁
    const cross = svgEl('line', { y1: T, y2: T + ph, stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden' });
    svg.appendChild(cross);
    const overlay = svgEl('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(overlay);
    const tip = el('div', 'viztip');
    box.appendChild(tip);

    const ROWS = [
      ['95백분위', 'p95'], ['75백분위', 'p75'], ['중앙값', 'p50'], ['25백분위', 'p25'], ['5백분위', 'p5'],
    ];
    function showIdx(i) {
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', xAt(i)); cross.setAttribute('x2', xAt(i));
      cross.setAttribute('visibility', 'visible');
      tip.textContent = '';
      tip.appendChild(el('div', 'tx', KIND_X[pick.horizon].tip(bands.steps[i])));
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
    let curIdx = n - 1;
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

    // 범례 (3계열 — 항상 표시)
    const legend = el('div', 'legend');
    const mkLi = (kind, color, opacity, text) => {
      const li = el('span', 'li');
      const key = el('span', kind === 'line' ? 'keyline' : 'keyrect');
      if (kind === 'line') key.style.borderTopColor = color;
      else { key.style.background = color; key.style.opacity = opacity; }
      li.appendChild(key); li.appendChild(document.createTextNode(text));
      return li;
    };
    legend.appendChild(mkLi('line', 'var(--series-1)', 1, '중앙값'));
    legend.appendChild(mkLi('rect', 'var(--series-1)', 0.35, '25–75 백분위'));
    legend.appendChild(mkLi('rect', 'var(--series-1)', 0.15, '5–95 백분위'));

    // 표 전환 (테이블 뷰 트윈)
    const tbl = el('table', 'plain');
    tbl.style.display = 'none';
    const thead = el('thead'); const hr = el('tr');
    ['시점', '5%', '25%', '중앙값', '75%', '95%'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    for (let i = 0; i < n; i++) {
      const tr = el('tr');
      tr.appendChild(el('td', null, kx.stepLabel ? kx.stepLabel(bands.steps[i]) : kx.tip(bands.steps[i])));
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

  // ───────── 히스토그램 (최종 수익률 분포) ─────────
  function histChart(sim) {
    const box = el('div', 'chartbox');
    const head = el('div', 'chead');
    head.appendChild(el('span', 'ctitle', '보유기간 종료 시 수익률 분포'));
    head.appendChild(el('span', 'csub', '이익/손실 구간'));
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
    // y 그리드 (확률 %)
    const stepP = niceStep((maxC / total * 100) / 3);
    for (let p = stepP; p <= maxC / total * 100; p += stepP) {
      const yy = yAt(p / 100 * total);
      svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'var(--grid)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: L - 6, y: yy + 3.5, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
      t.textContent = p.toFixed(0) + '%';
      svg.appendChild(t);
    }
    // 막대 (다이버징: 손실 red / 이익 blue / 0 포함 빈 neutral)
    const tip = el('div', 'viztip');
    box.appendChild(tip);
    let peakIdx = counts.indexOf(maxC);
    for (let i = 0; i < nB; i++) {
      const b0 = lo + i * binW, b1 = b0 + binW, c = counts[i];
      const x = xAt(b0) + 1, w = Math.max(1, xAt(b1) - xAt(b0) - 2); // 2px surface gap
      const y = yAt(c), h = T + ph - y;
      const fill = (b0 < 0 && b1 > 0) ? 'var(--div-neutral)' : (b1 <= 0 ? 'var(--series-6)' : 'var(--series-1)');
      const r = Math.min(3, w / 2, h);
      const d = h <= 0.5 ? '' :
        `M${x} ${T + ph} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${T + ph} Z`;
      if (d) svg.appendChild(svgEl('path', { d, fill, 'data-bar': i }));
      // 히트 타깃: 전체 높이 투명 rect
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
      // 선택적 직접 라벨: 최빈 구간만
      if (i === peakIdx) {
        const t = svgEl('text', { x: xAt(b0) + (xAt(b1) - xAt(b0)) / 2, y: y - 5, 'text-anchor': 'middle', fill: 'var(--text-secondary)', 'font-size': 10, 'font-weight': 650 });
        t.textContent = (c / total * 100).toFixed(1) + '%';
        svg.appendChild(t);
      }
    }
    // 0% 세로 기준선 + 축
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
      const li = el('span', 'li');
      const key = el('span', 'keyrect'); key.style.background = color;
      li.appendChild(key); li.appendChild(document.createTextNode(text));
      return li;
    };
    legend.appendChild(mkLi('var(--series-1)', '이익 구간'));
    legend.appendChild(mkLi('var(--series-6)', '손실 구간'));

    // 표 트윈
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
    const shares = Math.floor(amountKrw / unitKrw);
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
    const amountIn = mk('투자금액 (원)', 10000000, 100000);
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
      if (cls) { const sp = el('span', cls, v); td.appendChild(sp); } else td.textContent = v;
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
        divPerShareYr: pick.dividend ? (pick.dividend.frequency === '분기' && pick.dividend.perShare < pick.refPrice * 0.01 ? pick.dividend.perShare * 4 : pick.dividend.perShare * (pick.dividend.frequency === '분기' ? 4 : 1)) : 0,
      });
      out.textContent = '';
      const tb = el('tbody');
      row(tb, '매수 가능 주수', r.shares.toLocaleString('ko-KR') + '주');
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

    const head = el('div', 'mhead');
    const hwrap = el('div');
    const chips = el('div', 'chiprow');
    chips.appendChild(chip(HORIZONS[p.horizon].label, HORIZONS[p.horizon].color));
    chips.appendChild(chip(MARKETS[p.market] + ' · ' + p.exchange));
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

    m.appendChild(el('p', 'summary', p.rationale.summary));

    // 스탯 타일
    const tiles = el('div', 'tiles');
    const tile = (lb, vl, cls, note) => {
      const t = el('div', 'tile');
      t.appendChild(el('div', 'lb', lb));
      t.appendChild(el('div', 'vl ' + (cls || ''), vl));
      if (note) t.appendChild(el('div', 'note', note));
      return t;
    };
    tiles.appendChild(tile('기본 시나리오 수익률', pct(p.expectedReturn.base), pctCls(p.expectedReturn.base), '목표가 도달 시'));
    if (sim) {
      tiles.appendChild(tile('시뮬레이션 이익확률', sim.final.pProfit.toFixed(0) + '%', '', '보유기간 종료 기준'));
      tiles.appendChild(tile('목표가 도달확률', sim.final.pHitTarget.toFixed(0) + '%', '', '기간 내 1회 이상'));
      tiles.appendChild(tile('손절가 도달확률', sim.final.pHitStop.toFixed(0) + '%', '', '기간 내 1회 이상'));
    }
    m.appendChild(tiles);

    // 매매 계획
    section(m, '매매 계획 (시기 · 가격)');
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
      tr2.appendChild(el('td', null, '매도 (목표)'));
      tr2.appendChild(el('td', null, p.sell.window));
      tr2.appendChild(el('td', null, p.sell.windowKst));
      tr2.appendChild(el('td', 'num', `${money(p.sell.low, p.currency)} ~ ${money(p.sell.high, p.currency)}`));
      tb.appendChild(tr2);
      const tr3 = el('tr');
      tr3.appendChild(el('td', null, '손절'));
      const sc = el('td', null, '도달 즉시 (자동 주문 권장)');
      sc.colSpan = 2;
      tr3.appendChild(sc);
      tr3.appendChild(el('td', 'num', money(p.sell.stop, p.currency)));
      tb.appendChild(tr3);
      plan.appendChild(tb);
    }
    m.appendChild(plan);
    const planNotes = el('ul', 'pts');
    planNotes.appendChild(el('li', null, '매수: ' + p.buy.note));
    planNotes.appendChild(el('li', null, '매도: ' + p.sell.note));
    planNotes.style.marginTop = '0.5rem';
    m.appendChild(planNotes);

    // 시나리오 (예측 변수 반영)
    section(m, '시나리오별 전망 (예측 변수 반영)');
    const sc = el('table', 'plain');
    {
      const thead = el('thead'); const hr = el('tr');
      ['시나리오', '확률', '예상가', '수익률', '설명'].forEach((h, i) => hr.appendChild(el('th', i === 1 || i === 2 || i === 3 ? 'num' : null, h)));
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

    // 시뮬레이션 차트
    if (sim) {
      section(m, '몬테카를로 시뮬레이션');
      m.appendChild(fanChart(sim, p));
      const spacer = el('div'); spacer.style.height = '0.6rem'; m.appendChild(spacer);
      m.appendChild(histChart(sim));
      const simNote = el('p', 'summary', `경로 ${sim.paths.toLocaleString()}개 · 중앙값 ${pct(sim.final.median)} · 90% 신뢰구간 ${pct(sim.final.p5)} ~ ${pct(sim.final.p95)}. 과거 변동성 기반 확률 모형이며 미래 수익 보장이 아닙니다.`);
      m.appendChild(simNote);
    }

    // 판단 근거
    section(m, '판단 근거 — 뉴스');
    const ulN = el('ul', 'pts'); p.rationale.news.forEach(t => ulN.appendChild(el('li', null, t))); m.appendChild(ulN);
    section(m, '판단 근거 — 차트(기술적)');
    const ulT = el('ul', 'pts'); p.rationale.technical.forEach(t => ulT.appendChild(el('li', null, t))); m.appendChild(ulT);
    section(m, '판단 근거 — 펀더멘털');
    const ulF = el('ul', 'pts'); p.rationale.fundamental.forEach(t => ulF.appendChild(el('li', null, t))); m.appendChild(ulF);

    // 예측 변수(리스크)
    section(m, '예측 변수 · 리스크 요인');
    const ulR = el('ul', 'pts'); p.riskFactors.forEach(t => ulR.appendChild(el('li', null, t))); m.appendChild(ulR);

    // 배당
    section(m, '배당 정보');
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
      m.appendChild(el('p', 'summary', d.note + (p.market === 'US' ? ' — 미국 배당은 15% 원천징수 후 입금됩니다.' : ' — 국내 배당은 15.4% 원천징수 후 입금됩니다.')));
    } else {
      m.appendChild(el('p', 'summary', '무배당 종목입니다.'));
    }

    // 세금 계산기
    section(m, '세후 실수령 계산기 (한국 기준)');
    m.appendChild(taxCalcBlock(p));

    m.appendChild(el('p', 'summary', '⚠️ ' + RECO.meta.disclaimer));

    back.classList.add('open');
    document.body.style.overflow = 'hidden';
    back.scrollTop = 0;
  }

  // ───────── 히스토리 ─────────
  function renderHistory() {
    const wrap = $('#history');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'hist-note',
      '추천이 생성될 때마다 배치 단위로 이 저장소(data.js)에 자동 기록되어 보존됩니다. 과거 배치는 수정되지 않으며, 아래에서 언제든 다시 열람할 수 있습니다.'));
    RECO.batches.forEach((b, i) => {
      const box = el('div', 'batch');
      box.appendChild(el('div', 'bt', b.title));
      box.appendChild(el('div', 'bd', `생성 시각 ${b.generatedAt} · ${b.picks.length}개 종목`));
      box.appendChild(el('div', 'bs', b.marketSnapshot));
      const summary = el('div', 'bs');
      const names = b.picks.map(p => `${p.name}(${p.ticker})`).join(', ');
      summary.textContent = '종목: ' + names;
      box.appendChild(summary);
      const openBtn = el('button', 'bopen', '이 배치의 추천 보기 →');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => {
        state.batch = i; state.view = 'reco';
        state.horizon = 'all'; state.market = 'all'; state.risk = 'all'; state.divOnly = false;
        renderAll();
        window.scrollTo({ top: 0 });
      });
      box.appendChild(openBtn);
      wrap.appendChild(box);
    });
  }

  // ───────── 세금 가이드 ─────────
  function renderTax() {
    const wrap = $('#tax');
    wrap.textContent = '';
    const rules = [
      ['미국주식 양도소득세', '연간 해외주식 양도차익 합산 250만원 공제 후 22% (지방소득세 포함). 다음 해 5월 자진 신고·납부.'],
      ['미국주식 배당', '미국에서 15% 원천징수. 국내 추가 원천징수 없음(금융소득 2,000만원 이하 기준).'],
      ['국내 상장주식 양도 (소액주주 장내)', '양도소득세 없음. 매도 시 증권거래세 0.15% (2026년 코스피 기준).'],
      ['국내 배당', '15.4% (소득세 14% + 지방소득세 1.4%) 원천징수.'],
      ['금융소득 종합과세', '이자+배당 연 2,000만원 초과분은 종합소득에 합산 과세 — 고배당 대량 보유 시 유의.'],
    ];
    const tbl = el('table', 'plain');
    const thead = el('thead'); const hr = el('tr');
    ['구분', '내용'].forEach(h => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = el('tbody');
    rules.forEach(([k, v]) => { const tr = el('tr'); tr.appendChild(el('td', null, k)); tr.appendChild(el('td', null, v)); tb.appendChild(tr); });
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    wrap.appendChild(el('p', 'hist-note', '각 종목 카드를 열면 해당 종목의 매수·목표가가 채워진 세후 실수령 계산기를 바로 사용할 수 있습니다. 세법은 변경될 수 있으며, 실제 신고 시 세무 전문가와 상담하세요.'));
  }

  // ───────── 뷰/필터 이벤트 ─────────
  function renderAll() {
    document.querySelectorAll('.viewtabs button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    $('#view-reco').style.display = state.view === 'reco' ? '' : 'none';
    $('#history').style.display = state.view === 'history' ? '' : 'none';
    $('#tax').style.display = state.view === 'tax' ? '' : 'none';
    if (state.view === 'reco') {
      document.querySelectorAll('#hseg button').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.h === state.horizon)));
      $('#batchchip').textContent = RECO.batches[state.batch].title;
      renderCards();
    }
    if (state.view === 'history') renderHistory();
    if (state.view === 'tax') renderTax();
  }

  document.querySelectorAll('.viewtabs button').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; renderAll(); }));
  document.querySelectorAll('#hseg button').forEach(b =>
    b.addEventListener('click', () => { state.horizon = b.dataset.h; renderAll(); }));
  $('#market').addEventListener('change', e => { state.market = e.target.value; renderAll(); });
  $('#risk').addEventListener('change', e => { state.risk = e.target.value; renderAll(); });
  $('#divonly').addEventListener('change', e => { state.divOnly = e.target.checked; renderAll(); });

  // 헤더 메타
  $('#asof').textContent = `최신 배치: ${RECO.batches[0].generatedAt} 생성 · 기준가는 2026-07-06~07 종가`;
  $('#disclaimer').textContent = '⚠️ ' + RECO.meta.disclaimer;

  renderAll();
})();
