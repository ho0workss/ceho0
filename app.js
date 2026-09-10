/* 마켓 인사이트 — v4.0 전면 리뉴얼
 * 원칙: ① 모든 수치는 확률(보장 아님) ② 성적 전부 공개 ③ 처음 온 사람이 3분 안에 이해
 * 데이터 계약: window.RECO(data.js) · window.SIM_RESULTS(data/sim.js) ·
 *              window.STRATEGY(data/strategy.js) · window.EASY 등(content.js)
 */
(function () {
  'use strict';

  // ───────── 데이터 ─────────
  const RECO = window.RECO || { batches: [], outcomes: { records: {} }, events: [] };
  const EASY = window.EASY || {};
  const STRAT = window.STRATEGY || null;
  let SIM = {};
  try { SIM = JSON.parse(window.SIM_RESULTS || '{}'); } catch (e) { SIM = {}; }
  const batch = (RECO.batches && RECO.batches[0]) || { picks: [], title: '', marketSnapshot: '' };
  const records = (RECO.outcomes && RECO.outcomes.records) || {};

  // ───────── 유틸 ─────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function frag(...nodes) { const f = document.createDocumentFragment(); nodes.forEach(n => n && f.appendChild(n)); return f; }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 프라이빗 모드 등 */ } },
  };
  const HORIZON = { day: '당일', week: '1주', month: '1개월', long: '장기(1년+)' };
  const RISK = {
    low: { cls: 'risk-low', label: '🛡️ 안심' },
    mid: { cls: 'risk-mid', label: '⚖️ 중간' },
    high: { cls: 'risk-high', label: '🔥 출렁' },
  };
  function riskOf(p) { return RISK[p.risk] || RISK.mid; }
  function simOf(p) { const s = SIM[p.simId]; return s && s.final ? s.final : null; }
  function baseName(p) { return String(p.name || p.ticker).replace(/\s*\([^)]*\)\s*$/, ''); }
  function fmtPrice(p, v) {
    if (v === undefined || v === null) return '-';
    if (p.currency === 'KRW') return Math.round(v).toLocaleString('ko-KR') + '원';
    return '$' + (+v).toFixed(2);
  }
  function pctFrom(p, v) {
    if (!p.refPrice || v === undefined || v === null) return null;
    return (v / p.refPrice - 1) * 100;
  }
  function signPct(x, digits) {
    if (x === null || x === undefined || isNaN(x)) return '-';
    const d = digits === undefined ? 1 : digits;
    return (x > 0 ? '+' : '') + x.toFixed(d) + '%';
  }
  function easyOn() { return $('#easymode').checked; }

  // ───────── 성적 집계 ─────────
  function tally() {
    const t = {
      stock: { n: 0, win: 0, partial: 0, fail: 0, pending: 0 },
      parking: { n: 0, win: 0, fail: 0, pending: 0 },
    };
    Object.keys(records).forEach(k => {
      const st = records[k].status;
      const g = k.includes('-stk-') ? t.stock : t.parking;
      if (st === 'pending' || st === 'invalid') { g.pending++; return; }
      g.n++;
      if (st === 'success') g.win++;
      else if (st === 'partial') { g.win++; if (g.partial !== undefined) g.partial++; }
      else if (st === 'fail') g.fail++;
    });
    return t;
  }
  const TALLY = tally();

  // ───────── 탭 라우팅 ─────────
  const VIEWS = ['today', 'race', 'picks', 'records', 'help'];
  const renderers = {};
  const rendered = {};
  function showTab(name) {
    VIEWS.forEach(v => {
      const sec = $('#view-' + v);
      const on = v === name;
      sec.hidden = !on;
      if (on && !rendered[v]) { renderers[v](sec); rendered[v] = true; }
    });
    $$('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    window.scrollTo({ top: 0 });
  }
  function rerenderAll() {
    VIEWS.forEach(v => { if (rendered[v]) { const sec = $('#view-' + v); sec.textContent = ''; renderers[v](sec); } });
  }

  // ───────── 스탯 타일 ─────────
  function tile(label, value, sub, opts) {
    const t = el('div', 'tile');
    const lb = el('div', 't-label');
    if (opts && opts.swatch) { const s = el('span', 'swatch'); s.style.background = opts.swatch; lb.appendChild(s); }
    lb.appendChild(document.createTextNode(label));
    t.appendChild(lb);
    const v = el('div', 't-value');
    if (opts && opts.deltaClass) v.classList.add(opts.deltaClass);
    v.textContent = value;
    if (opts && opts.unit) v.appendChild(el('span', 'unit', ' ' + opts.unit));
    t.appendChild(v);
    if (sub) t.appendChild(el('div', 't-sub', sub));
    return t;
  }

  // ───────── 오늘 뷰 ─────────
  renderers.today = function (root) {
    // 1) 처음이세요? 온보딩 (닫으면 저장)
    if (store.get('onboardDismissed') !== '1') {
      const ob = el('div', 'card onboard');
      ob.appendChild(el('h2', null, '👋 처음이세요? 딱 3가지만 알면 돼요'));
      const steps = el('div', 'steps');
      const mk = (t, b) => { const s = el('div', 'step'); s.appendChild(el('b', null, t)); s.appendChild(document.createTextNode(b)); return s; };
      steps.appendChild(mk('① 초록(🛡️ 안심)부터 보세요', '파킹 카드는 은행 이자처럼 거의 확실하지만 수익이 아주 작아요(하루 +0.01% 수준). 빨강(🔥)은 크게 벌 수도, 크게 잃을 수도 있어요.'));
      steps.appendChild(mk('② 확률은 약속이 아니에요', '"이익확률 50%"는 동전 던지기라는 뜻이에요. 100%짜리 주식은 세상에 없고, 그렇다고 말하는 사람은 사기꾼이에요.'));
      steps.appendChild(mk('③ 두 가지 절대 규칙', '잃어도 괜찮은 돈으로만 하고, 카드에 적힌 손절가(안전벨트)를 반드시 지키세요.'));
      ob.appendChild(steps);
      const foot = el('div', 'foot');
      const learn = el('button', 'btn primary', '📚 5분 만에 기초 배우기');
      learn.addEventListener('click', () => showTab('help'));
      const dismiss = el('button', 'btn ghost', '알겠어요, 닫기');
      dismiss.addEventListener('click', () => { store.set('onboardDismissed', '1'); ob.remove(); });
      foot.appendChild(learn); foot.appendChild(dismiss);
      ob.appendChild(foot);
      root.appendChild(ob);
    }

    // 2) 오늘의 브리핑
    const brief = el('div', 'card banner info');
    brief.appendChild(el('h2', null, '📌 오늘의 브리핑'));
    brief.appendChild(el('div', null, batch.title || ''));
    const snap = String(batch.marketSnapshot || '');
    const firstBits = snap.split('★').filter(Boolean).slice(0, 2).map(s => s.trim());
    if (firstBits.length) {
      const d = el('details', 'acc'); d.style.marginTop = '0.6rem';
      d.appendChild(el('summary', null, '자세한 시장 이야기 읽기'));
      const body = el('div', 'acc-body');
      snap.split('★').filter(Boolean).forEach(s => { const pgh = el('p', null, '★ ' + s.trim()); pgh.style.marginBottom = '0.5rem'; body.appendChild(pgh); });
      d.appendChild(body);
      brief.appendChild(d);
    }
    root.appendChild(brief);

    // 3) vs S&P 500 미니 스코어보드
    if (STRAT && STRAT.race && STRAT.race.series.length) {
      const last = STRAT.race.series[STRAT.race.series.length - 1];
      const gap = last.strategy - last.spy;
      const c = el('div', 'card');
      const h = el('h2', null, '🏁 우리 전략 vs S&P 500');
      h.appendChild(el('span', 'hint', STRAT.race.start + ' 시작 · 매일 실측 갱신'));
      c.appendChild(h);
      const tiles = el('div', 'tiles');
      const css = getComputedStyle(document.body);
      tiles.appendChild(tile('전략 포트폴리오', last.strategy.toFixed(1), '시작=100', { swatch: css.getPropertyValue('--series-1') }));
      tiles.appendChild(tile('S&P 500', last.spy.toFixed(1), '시작=100', { swatch: css.getPropertyValue('--series-2') }));
      tiles.appendChild(tile('격차', signPct(gap, 1).replace('%', 'p'), gap === 0 ? '동률 — 레이스 시작!' : (gap > 0 ? '전략이 앞서는 중' : 'S&P 500이 앞서는 중'), { deltaClass: gap >= 0 ? 'delta-up' : 'delta-down' }));
      c.appendChild(tiles);
      const go = el('button', 'btn'); go.style.marginTop = '0.7rem'; go.textContent = '전략 자세히 보기 →';
      go.addEventListener('click', () => showTab('race'));
      c.appendChild(go);
      root.appendChild(c);
    }

    // 4) 오늘의 추천 요약 — 안심 / 도전 구분
    const dayPicks = batch.picks.filter(p => p.horizon === 'day');
    const safe = dayPicks.filter(p => p.assetClass === 'parking');
    const bold = dayPicks.filter(p => p.assetClass === 'stock');
    const today = el('div', 'card');
    const th = el('h2', null, '🗂️ 오늘의 추천 한눈에');
    th.appendChild(el('span', 'hint', '카드를 누르면 매매 계획까지 자세히'));
    today.appendChild(th);

    if (bold.length) {
      today.appendChild(el('div', 'muted', '📈 도전 — 실제 주식 (이익확률은 원래 반반 근처가 정직한 숫자예요)'));
      const g1 = el('div', 'grid'); g1.style.margin = '0.5rem 0 0.9rem';
      bold.forEach(p => g1.appendChild(pickCard(p)));
      today.appendChild(g1);
    }
    if (safe.length) {
      today.appendChild(el('div', 'muted', '🛡️ 안심 — 파킹 (거의 확실하지만 수익이 아주 작아요)'));
      const g2 = el('div', 'grid'); g2.style.marginTop = '0.5rem';
      safe.forEach(p => g2.appendChild(pickCard(p)));
      today.appendChild(g2);
    }
    const all = el('button', 'btn'); all.style.marginTop = '0.8rem';
    all.textContent = '1주·1개월·장기 추천까지 전부 보기 →';
    all.addEventListener('click', () => showTab('picks'));
    today.appendChild(all);
    root.appendChild(today);

    // 5) 정직 배너
    const hb = el('div', 'card banner');
    hb.appendChild(el('h2', null, '🤝 정직 코너'));
    const s = TALLY.stock, pk = TALLY.parking;
    const ul = el('ul'); ul.style.marginLeft = '1.1rem'; ul.style.fontSize = '0.86rem';
    const li1 = el('li'); li1.textContent = `실제 주식 당일 성적은 지금까지 ${s.n}번 중 ${s.win}번 이익 (${s.n ? Math.round(s.win / s.n * 1000) / 10 : 0}%) — 동전 던지기 수준이 하루 매매의 정직한 현실이에요.`;
    const li2 = el('li'); li2.textContent = `파킹은 ${pk.n}전 ${pk.win}승이지만 하루 수익이 +0.005~0.01%로 아주 작아요. 이길 확률이 높다는 것과 많이 번다는 것은 완전히 다른 이야기예요.`;
    const li3 = el('li'); li3.textContent = '확률이 높은 쪽은 1년 이상 길게 나눠 사는 쪽이에요 — 그래서 전략 포트폴리오의 중심도 장기예요.';
    ul.appendChild(li1); ul.appendChild(li2); ul.appendChild(li3);
    hb.appendChild(ul);
    const rec = el('button', 'btn'); rec.style.marginTop = '0.6rem'; rec.textContent = '전체 성적표 보기 →';
    rec.addEventListener('click', () => showTab('records'));
    hb.appendChild(rec);
    root.appendChild(hb);

    // 6) 다가오는 일정
    if (RECO.events && RECO.events.length) {
      const evc = el('div', 'card');
      evc.appendChild(el('h2', null, '📅 다가오는 일정'));
      RECO.events.forEach(e2 => {
        const row = el('div', 'ev');
        row.appendChild(el('span', 'd', e2.date.slice(5).replace('-', '/')));
        const body = el('div');
        const t = el('div'); t.appendChild(el('b', null, e2.title + ' '));
        t.appendChild(el('span', e2.impact === '높음' ? 'impact-high' : 'impact-mid', '영향 ' + e2.impact));
        body.appendChild(t);
        if (e2.note) body.appendChild(el('div', 'tiny', e2.note));
        row.appendChild(body);
        evc.appendChild(row);
      });
      root.appendChild(evc);
    }
  };

  // ───────── 추천 카드 ─────────
  function pickCard(p) {
    const f = simOf(p);
    const card = el('button', 'pick-card');
    card.type = 'button';
    const top = el('div', 'pc-top');
    const nm = el('div');
    nm.appendChild(el('div', 'pc-name', baseName(p)));
    nm.appendChild(el('div', 'pc-ticker', p.ticker + ' · ' + (p.market === 'KR' ? '🇰🇷 한국' : '🇺🇸 미국')));
    top.appendChild(nm);
    const bd = el('div', 'pc-badges');
    bd.appendChild(el('span', 'badge h', HORIZON[p.horizon] || p.horizon));
    const rk = riskOf(p);
    bd.appendChild(el('span', 'badge ' + rk.cls, rk.label));
    top.appendChild(bd);
    card.appendChild(top);

    const prob = f ? f.pProfit : null;
    const pr = el('div', 'probrow');
    pr.appendChild(el('span', 'p-big', prob === null ? '-' : prob.toFixed(1) + '%'));
    pr.appendChild(el('span', 'p-cap', p.assetClass === 'parking' ? '이익확률 (구조상 매우 높음)' : '이익확률 — 수익 크기와는 별개'));
    card.appendChild(pr);
    const bar = el('div', 'probbar' + (p.assetClass === 'parking' ? ' safe' : ''));
    const fill = el('i'); fill.style.width = Math.max(2, Math.min(100, prob || 0)) + '%';
    bar.appendChild(fill);
    card.appendChild(bar);

    const tgt = el('div', 'pc-tgt');
    const tPct = pctFrom(p, p.sell && p.sell.low);
    const sPct = pctFrom(p, p.sell && p.sell.stop);
    const t1 = el('span'); t1.appendChild(el('b', null, '목표 ')); t1.appendChild(document.createTextNode(signPct(tPct)));
    const t2 = el('span'); t2.appendChild(el('b', null, '손절 ')); t2.appendChild(document.createTextNode(signPct(sPct)));
    tgt.appendChild(t1); tgt.appendChild(t2);
    card.appendChild(tgt);

    const ez = EASY[p.id];
    if (ez && easyOn()) card.appendChild(el('div', 'pc-easy', ez.company));
    card.addEventListener('click', () => openPick(p));
    return card;
  }

  // ───────── 추천 전체 뷰 ─────────
  const pickFilter = { h: 'all', ac: 'all' };
  renderers.picks = function (root) {
    const intro = el('div', 'card banner info');
    intro.appendChild(el('h2', null, '📋 추천 전체'));
    intro.appendChild(el('div', 'muted', '기간(얼마나 들고 갈지)과 성격(안심/도전)으로 골라 보세요. 오래 들고 갈수록 이익확률이 올라가는 것이 보일 거예요.'));
    root.appendChild(intro);

    const chips = el('div', 'chips');
    chips.appendChild(el('span', 'lbl', '기간'));
    const hOpts = [['all', '전체'], ['day', '당일'], ['week', '1주'], ['month', '1개월'], ['long', '장기']];
    hOpts.forEach(([v, l]) => {
      const c = el('button', 'chip', l);
      c.setAttribute('aria-pressed', String(pickFilter.h === v));
      c.addEventListener('click', () => { pickFilter.h = v; refresh(); });
      c.dataset.k = 'h'; c.dataset.v = v;
      chips.appendChild(c);
    });
    chips.appendChild(el('span', 'lbl', '· 성격'));
    const aOpts = [['all', '모두'], ['stock', '📈 도전(주식)'], ['parking', '🛡️ 안심(파킹)']];
    aOpts.forEach(([v, l]) => {
      const c = el('button', 'chip', l);
      c.setAttribute('aria-pressed', String(pickFilter.ac === v));
      c.addEventListener('click', () => { pickFilter.ac = v; refresh(); });
      c.dataset.k = 'ac'; c.dataset.v = v;
      chips.appendChild(c);
    });
    root.appendChild(chips);

    const grid = el('div', 'grid');
    root.appendChild(grid);
    const empty = el('p', 'muted', '조건에 맞는 추천이 없어요.');
    empty.style.display = 'none';
    root.appendChild(empty);

    function refresh() {
      $$('.chip', chips).forEach(c => c.setAttribute('aria-pressed', String(pickFilter[c.dataset.k] === c.dataset.v)));
      grid.textContent = '';
      const list = batch.picks.filter(p =>
        (pickFilter.h === 'all' || p.horizon === pickFilter.h) &&
        (pickFilter.ac === 'all' || p.assetClass === pickFilter.ac));
      list.forEach(p => grid.appendChild(pickCard(p)));
      empty.style.display = list.length ? 'none' : '';
    }
    refresh();

    const note = el('p', 'tiny');
    note.style.marginTop = '0.8rem';
    note.textContent = '기준: ' + (batch.pricesAsOf || '').split('.')[0] + '. 주문 전 반드시 현재 가격을 확인하세요.';
    root.appendChild(note);
  };

  // ───────── vs S&P 500 뷰 ─────────
  renderers.race = function (root) {
    if (!STRAT) { root.appendChild(el('p', 'muted', '전략 데이터를 불러오지 못했어요.')); return; }
    const css = getComputedStyle(document.body);
    const C1 = css.getPropertyValue('--series-1').trim();
    const C2 = css.getPropertyValue('--series-2').trim();

    // 목표 선언 + 정직 프레임
    const head = el('div', 'card banner info');
    head.appendChild(el('h2', null, '🏁 목표: S&P 500 이기기 — 그리고 그 성적을 매일 공개하기'));
    const pgh = el('p'); pgh.style.fontSize = '0.88rem';
    pgh.textContent = 'S&P 500은 "미국 주식을 그냥 다 사서 오래 들고 있기"라는 최강의 기본기예요. 우리는 이걸 이기는 것을 목표로 포트폴리오를 짰고, 정말 이기고 있는지 아래에서 매일 실제 지수로 확인해요. 확실한 건 하나: 이긴다는 보장은 세상 어디에도 없어요.';
    head.appendChild(pgh);
    root.appendChild(head);

    // 레이스 스코어보드 + 차트
    const raceCard = el('div', 'card');
    const rh = el('h2', null, '실시간 레이스');
    rh.appendChild(el('span', 'hint', STRAT.race.start + ' 시작 · 둘 다 100에서 출발 · 매일 아침 실측 갱신'));
    raceCard.appendChild(rh);
    const series = STRAT.race.series || [];
    const last = series[series.length - 1] || { strategy: 100, spy: 100 };
    const gap = last.strategy - last.spy;
    const tl = el('div', 'tiles');
    tl.appendChild(tile('전략 포트폴리오', last.strategy.toFixed(1), null, { swatch: C1 }));
    tl.appendChild(tile('S&P 500', last.spy.toFixed(1), null, { swatch: C2 }));
    tl.appendChild(tile('격차', signPct(gap, 1).replace('%', 'p'), gap === 0 ? '동률' : (gap > 0 ? '전략 우세' : '벤치마크 우세'), { deltaClass: gap >= 0 ? 'delta-up' : 'delta-down' }));
    raceCard.appendChild(tl);

    const legend = el('div', 'race-legend');
    const l1 = el('span'); const s1 = el('span', 'swatch'); s1.style.background = C1; l1.appendChild(s1); l1.appendChild(document.createTextNode('전략 포트폴리오'));
    const l2 = el('span'); const s2 = el('span', 'swatch'); s2.style.background = C2; l2.appendChild(s2); l2.appendChild(document.createTextNode('S&P 500'));
    legend.appendChild(l1); legend.appendChild(l2);
    legend.style.marginTop = '0.7rem';
    raceCard.appendChild(legend);

    if (series.length >= 2) {
      raceCard.appendChild(buildRaceChart(series, C1, C2));
    } else {
      const wait = el('div', 'banner good card');
      wait.style.marginBottom = '0';
      wait.appendChild(el('b', null, '🚦 오늘이 레이스 첫날이에요!'));
      wait.appendChild(el('div', 'muted', '내일 아침부터 실제 지수가 한 점씩 찍히면서 선이 그려져요. 며칠 뒤에 다시 와서 누가 앞서는지 확인해 보세요.'));
      raceCard.appendChild(wait);
    }
    // 표로 보기
    const tblBtn = el('button', 'btn'); tblBtn.style.marginTop = '0.7rem'; tblBtn.textContent = '📄 표로 보기';
    const tblWrap = el('div'); tblWrap.hidden = true;
    tblBtn.addEventListener('click', () => { tblWrap.hidden = !tblWrap.hidden; tblBtn.textContent = tblWrap.hidden ? '📄 표로 보기' : '📄 표 닫기'; });
    const tbl = el('table', 'dtable');
    const thead = el('thead'); const trh = el('tr');
    ['날짜', '전략', 'S&P 500', '격차'].forEach(h2 => trh.appendChild(el('th', null, h2)));
    thead.appendChild(trh); tbl.appendChild(thead);
    const tb = el('tbody');
    series.forEach(pt => {
      const tr = el('tr');
      tr.appendChild(el('td', null, pt.date));
      tr.appendChild(el('td', null, pt.strategy.toFixed(1)));
      tr.appendChild(el('td', null, pt.spy.toFixed(1)));
      const g = pt.strategy - pt.spy;
      const td = el('td', null, signPct(g, 1).replace('%', 'p'));
      td.className = g >= 0 ? 'delta-up' : 'delta-down';
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    tblWrap.appendChild(tbl);
    raceCard.appendChild(tblBtn);
    raceCard.appendChild(tblWrap);
    root.appendChild(raceCard);

    // 이길 확률 (가정 켬/끔 병기)
    const prob = el('div', 'card');
    prob.appendChild(el('h2', null, '🎲 이길 확률은 얼마나 될까요? (몬테카를로 20,000 경로)'));
    const pb = el('div', 'pbeat');
    const mk = (title, v, d) => {
      const b = el('div', 'pb');
      b.appendChild(el('div', 'muted', title));
      b.appendChild(el('div', 'n', v + '%'));
      b.appendChild(el('div', 'd', d));
      return b;
    };
    const y = STRAT.sim.h1y, q = STRAT.sim.h3m;
    pb.appendChild(mk('1년 뒤 S&P 500을 이길 확률', y.withAlpha.pBeat.toFixed(1), '팩터 프리미엄 가정을 반영한 값 — 중앙 초과수익 ' + signPct(y.withAlpha.excessMedian) + 'p'));
    pb.appendChild(mk('같은 확률, 가정을 전부 끄면', y.noAlpha.pBeat.toFixed(1), '프리미엄이 실현되지 않으면 이 정도 — 이 차이가 "보장이 아닌 이유"예요'));
    pb.appendChild(mk('3개월 기준', q.withAlpha.pBeat.toFixed(1), '짧을수록 운의 비중이 커져요 (가정 끄면 ' + q.noAlpha.pBeat.toFixed(1) + '%)'));
    prob.appendChild(pb);
    const hp = el('p', 'tiny'); hp.style.marginTop = '0.6rem';
    hp.textContent = '읽는 법: 지수를 이기는 건 원래 어렵습니다. 51%는 "동전 던지기보다 아주 조금 유리하게 설계했다"는 뜻이고, 그 조금이 모멘텀·배당 같은 팩터 프리미엄이 앞으로도 실현된다는 가정에 걸려 있어요. 1년 예상 수익 중앙값: 전략 ' + signPct(y.withAlpha.portMedian) + ' vs S&P 500 ' + signPct(y.withAlpha.spyMedian) + ' · 나쁜 해(하위 5%)는 둘 다 ' + signPct(y.withAlpha.portP5) + ' 근처까지 빠질 수 있어요.';
    prob.appendChild(hp);
    root.appendChild(prob);

    // 포트폴리오 구성
    const comp = el('div', 'card');
    comp.appendChild(el('h2', null, '🧺 무엇을 얼마나 담았나요?'));
    (STRAT.sleeves || []).forEach(sv => {
      const row = el('div', 'wrow');
      const nm = el('div'); nm.appendChild(el('b', null, sv.name));
      nm.appendChild(el('div', 'tiny', '시장 민감도 β ' + sv.beta + ' · 변동성 연 ' + sv.vol + '%' + (sv.alphaAssumption ? ' · 프리미엄 가정 +' + sv.alphaAssumption + '%p' : '')));
      row.appendChild(nm);
      const bar = el('div', 'wbar'); const fi = el('i'); fi.style.width = sv.weight + '%'; bar.appendChild(fi);
      row.appendChild(bar);
      row.appendChild(el('div', 'wpct', sv.weight + '%'));
      comp.appendChild(row);
    });
    comp.appendChild(el('p', 'tiny', STRAT.rebalance + ' · 매일의 추천 카드(당일~장기)는 이 뼈대 위에서 위성 부분을 고르는 참고안이에요.'));
    root.appendChild(comp);

    // 왜 이렇게 짰나요 + 가정 공개
    const why = el('div', 'card');
    why.appendChild(el('h2', null, '🧠 왜 이렇게 짰나요?'));
    const wl = el('ul'); wl.style.cssText = 'margin-left:1.1rem;font-size:0.87rem';
    [
      '코어 45% — 이기려는 상대(S&P 500)를 절반 가까이 그대로 담아요. 크게 뒤처질 위험부터 줄이는 것이 출발점이에요.',
      '성장 위성 30% — AI 대형주 3~5종 분산. 시장보다 민감(β1.35)하고, 학계가 오래 관찰해 온 모멘텀 프리미엄(+2%p 가정)에 기대요.',
      '방어 위성 15% — 배당·저변동주. 하락장에서 덜 빠져서 전체의 출렁임을 줄여 줘요.',
      '파킹 10% — 조정장이 오면 싸게 살 실탄이자, 어떤 날에도 이자가 붙는 안전판이에요.',
      '분기 리밸런싱 — 오른 것을 조금 팔고 내린 것을 조금 사는 것을 기계적으로 반복해요. 감정을 빼는 장치예요.',
    ].forEach(t => wl.appendChild(el('li', null, t)));
    why.appendChild(wl);
    const acc = el('details', 'acc'); acc.style.marginTop = '0.6rem';
    acc.appendChild(el('summary', null, '📜 정직한 가정 전부 보기'));
    const ab = el('div', 'acc-body');
    const al = el('ul'); al.style.marginLeft = '1.1rem';
    (STRAT.assumptions || []).forEach(a => al.appendChild(el('li', null, a)));
    ab.appendChild(al);
    acc.appendChild(ab);
    why.appendChild(acc);
    root.appendChild(why);
  };

  // ───────── 레이스 차트 (SVG) ─────────
  function buildRaceChart(series, C1, C2) {
    const W = 720, H = 300, M = { l: 46, r: 96, t: 14, b: 28 };
    const iw = W - M.l - M.r, ih = H - M.t - M.b;
    const xs = i => M.l + (series.length === 1 ? iw / 2 : i / (series.length - 1) * iw);
    let lo = Infinity, hi = -Infinity;
    series.forEach(p => { lo = Math.min(lo, p.strategy, p.spy); hi = Math.max(hi, p.strategy, p.spy); });
    const pad = Math.max(0.6, (hi - lo) * 0.15);
    lo -= pad; hi += pad;
    const ys = v => M.t + (1 - (v - lo) / (hi - lo)) * ih;

    const wrap = el('div', 'race-wrap');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'race-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '전략 포트폴리오와 S&P 500의 지수 비교 선그래프 (표로 보기 버튼으로 수치 확인 가능)');
    const sv = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k])); return n; };
    const css = getComputedStyle(document.body);
    const GRID = css.getPropertyValue('--grid').trim();
    const TXT = css.getPropertyValue('--text-muted').trim();

    // 그리드 + y라벨 (4틱, 은은하게)
    for (let k = 0; k <= 3; k++) {
      const v = lo + (hi - lo) * k / 3;
      const yy = ys(v);
      svg.appendChild(sv('line', { x1: M.l, x2: W - M.r, y1: yy, y2: yy, stroke: GRID, 'stroke-width': 1 }));
      const t = sv('text', { x: M.l - 7, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: TXT });
      t.textContent = v.toFixed(1);
      svg.appendChild(t);
    }
    // x라벨 (처음/끝)
    const xt = (i, anchor) => { const t = sv('text', { x: xs(i), y: H - 8, 'text-anchor': anchor, 'font-size': 11, fill: TXT }); t.textContent = series[i].date.slice(5); return t; };
    svg.appendChild(xt(0, 'start'));
    if (series.length > 1) svg.appendChild(xt(series.length - 1, 'end'));

    // 100 기준선
    if (lo < 100 && hi > 100) {
      svg.appendChild(sv('line', { x1: M.l, x2: W - M.r, y1: ys(100), y2: ys(100), stroke: css.getPropertyValue('--baseline').trim(), 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    }
    // 시리즈 (2px 라인 + 끝점 + 직접 라벨)
    const mkPath = (key, color) => {
      const d = series.map((p, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(p[key]).toFixed(1)).join(' ');
      svg.appendChild(sv('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const li = series.length - 1;
      svg.appendChild(sv('circle', { cx: xs(li), cy: ys(series[li][key]), r: 3.5, fill: color }));
      const lab = sv('text', { x: xs(li) + 9, y: ys(series[li][key]) + 4, 'font-size': 11, 'font-weight': 700, fill: css.getPropertyValue('--text-secondary').trim() });
      lab.textContent = (key === 'strategy' ? '전략 ' : 'S&P ') + series[li][key].toFixed(1);
      svg.appendChild(lab);
      const sw = sv('rect', { x: xs(li) + 9, y: ys(series[li][key]) + 8, width: 14, height: 3, rx: 1.5, fill: color });
      svg.appendChild(sw);
    };
    // 라벨 충돌 회피: 값이 가까우면 한쪽을 위/아래로 — 단순화: strategy 라벨을 위로 6px 이동
    mkPath('spy', C2);
    mkPath('strategy', C1);

    // 크로스헤어 + 툴팁
    const cross = sv('line', { x1: 0, x2: 0, y1: M.t, y2: H - M.b, stroke: TXT, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
    svg.appendChild(cross);
    const dot1 = sv('circle', { r: 4, fill: C1, opacity: 0 });
    const dot2 = sv('circle', { r: 4, fill: C2, opacity: 0 });
    svg.appendChild(dot1); svg.appendChild(dot2);
    const hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(hit);
    const tip = el('div', 'race-tip');
    wrap.appendChild(svg);
    wrap.appendChild(tip);

    function onMove(clientX) {
      const r = svg.getBoundingClientRect();
      const px = (clientX - r.left) / r.width * W;
      let idx = Math.round((px - M.l) / (iw || 1) * (series.length - 1));
      idx = Math.max(0, Math.min(series.length - 1, idx));
      const p = series[idx];
      const x = xs(idx);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 0.6);
      dot1.setAttribute('cx', x); dot1.setAttribute('cy', ys(p.strategy)); dot1.setAttribute('opacity', 1);
      dot2.setAttribute('cx', x); dot2.setAttribute('cy', ys(p.spy)); dot2.setAttribute('opacity', 1);
      tip.style.display = 'block';
      tip.textContent = '';
      tip.appendChild(el('b', null, p.date));
      const g = p.strategy - p.spy;
      const lines = [
        '전략 ' + p.strategy.toFixed(1),
        'S&P 500 ' + p.spy.toFixed(1),
        '격차 ' + signPct(g, 1).replace('%', 'p'),
      ];
      lines.forEach(t => tip.appendChild(el('div', null, t)));
      const leftPx = x / W * r.width;
      tip.style.left = Math.min(r.width - 130, Math.max(0, leftPx + 10)) + 'px';
      tip.style.top = '18px';
    }
    function onLeave() {
      cross.setAttribute('opacity', 0); dot1.setAttribute('opacity', 0); dot2.setAttribute('opacity', 0);
      tip.style.display = 'none';
    }
    hit.addEventListener('mousemove', e => onMove(e.clientX));
    hit.addEventListener('mouseleave', onLeave);
    hit.addEventListener('touchstart', e => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
    hit.addEventListener('touchmove', e => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
    hit.addEventListener('touchend', onLeave);
    return wrap;
  }

  // ───────── 성적표 뷰 ─────────
  renderers.records = function (root) {
    const s = TALLY.stock, pk = TALLY.parking;
    const head = el('div', 'card');
    head.appendChild(el('h2', null, '📊 성적표 — 전부 공개합니다'));
    head.appendChild(el('p', 'muted', '틀린 것도 지우지 않아요. 왜 틀렸는지가 다음 추천을 좋게 만드는 재료거든요.'));
    const tl = el('div', 'tiles'); tl.style.marginTop = '0.7rem';
    const wr = s.n ? (s.win / s.n * 100) : 0;
    tl.appendChild(tile('📈 실제 주식(당일)', s.win + '승 ' + s.fail + '패', '적중률 ' + wr.toFixed(1) + '% (부분성공 ' + s.partial + ' 포함) — 반반이 현실'));
    tl.appendChild(tile('🛡️ 파킹', pk.win + '승 ' + pk.fail + '패', '거의 항상 이기지만 수익은 하루 +0.005~0.01%'));
    tl.appendChild(tile('진행 중/보류', String(s.pending + pk.pending) + '건', '가격이 확정되면 채점해요'));
    head.appendChild(tl);
    root.appendChild(head);

    const list = el('div', 'card');
    const lh = el('h2', null, '최근 채점 기록');
    lh.appendChild(el('span', 'hint', '항목을 누르면 자세한 이유'));
    list.appendChild(lh);
    const STL = { success: '성공', partial: '부분', fail: '실패', pending: '보류', invalid: '무효' };
    const keys = Object.keys(records);
    let shown = 0;
    const container = el('div');
    list.appendChild(container);
    function renderSome(n) {
      const until = Math.min(keys.length, shown + n);
      for (; shown < until; shown++) {
        const k = keys[shown];
        const r = records[k];
        const item = el('div', 'rec-item');
        const h2 = el('div', 'rec-head');
        h2.appendChild(el('span', 'st ' + r.status, STL[r.status] || r.status));
        const tt = el('div');
        tt.appendChild(el('div', null, r.title));
        tt.appendChild(el('div', 'tiny', k + ' · ' + (r.checkedAt || '')));
        h2.appendChild(tt);
        const det = el('div', 'rec-detail', r.detail || '');
        det.hidden = true;
        h2.addEventListener('click', () => { det.hidden = !det.hidden; });
        item.appendChild(h2);
        item.appendChild(det);
        container.appendChild(item);
      }
      more.style.display = shown >= keys.length ? 'none' : '';
    }
    const more = el('button', 'btn', '더 보기');
    more.addEventListener('click', () => renderSome(20));
    list.appendChild(more);
    renderSome(15);
    root.appendChild(list);

    // 배운 것들
    if (RECO.lessons && RECO.lessons.length) {
      const ls = el('div', 'card');
      ls.appendChild(el('h2', null, '🧪 실패에서 배운 것 (최근 5개)'));
      RECO.lessons.slice(0, 5).forEach(le => {
        const d = el('details', 'acc');
        d.appendChild(el('summary', null, (le.date ? le.date + ' — ' : '') + (le.title || '')));
        d.appendChild(el('div', 'acc-body', le.text || ''));
        ls.appendChild(d);
      });
      ls.appendChild(el('p', 'tiny', '총 ' + RECO.lessons.length + '개의 교훈이 추천 규칙에 반영되어 있어요.'));
      root.appendChild(ls);
    }
  };

  // ───────── 배우기 뷰 ─────────
  renderers.help = function (root) {
    const L = window.LESSONS || [], G = window.GLOSSARY || [], C = window.CHECKLIST || [], F = window.FAQ || [];
    if (L.length) {
      const c = el('div', 'card');
      c.appendChild(el('h2', null, '📚 5분 기초'));
      L.forEach(le => {
        const row = el('div', 'lesson'); row.style.marginBottom = '0.8rem';
        row.appendChild(el('div', 'ic', le.icon || '📘'));
        const b = el('div');
        b.appendChild(el('b', null, le.title));
        b.appendChild(el('div', 'muted', le.body));
        row.appendChild(b);
        c.appendChild(row);
      });
      root.appendChild(c);
    }
    if (C.length) {
      const c = el('div', 'card banner');
      c.appendChild(el('h2', null, '✅ 사기 전 체크리스트'));
      const ul = el('ul', 'check');
      C.forEach(t => ul.appendChild(el('li', null, t)));
      c.appendChild(ul);
      root.appendChild(c);
    }
    if (F.length) {
      const c = el('div', 'card');
      c.appendChild(el('h2', null, '❓ 자주 묻는 질문'));
      F.forEach(f => {
        const d = el('details', 'acc');
        d.appendChild(el('summary', null, f.q));
        d.appendChild(el('div', 'acc-body', f.a));
        c.appendChild(d);
      });
      root.appendChild(c);
    }
    if (G.length) {
      const c = el('div', 'card');
      c.appendChild(el('h2', null, '📖 용어 사전 (쉬운 말)'));
      const dl = el('dl', 'gloss');
      G.forEach(g => { dl.appendChild(el('dt', null, g.term)); dl.appendChild(el('dd', null, g.easy)); });
      c.appendChild(dl);
      root.appendChild(c);
    }
  };

  // ───────── 모달 공통 ─────────
  const back = $('#backdrop');
  function openModal() {
    back.hidden = false;
    document.body.style.overflow = 'hidden';
    back.scrollTop = 0;
  }
  function closeModal() {
    back.hidden = true;
    document.body.style.overflow = '';
  }
  back.addEventListener('click', e => { if (e.target === back) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !back.hidden) closeModal(); });
  function modalHead(m, title, sub) {
    const head = el('div', 'mhead');
    const w = el('div');
    w.appendChild(el('h2', null, title));
    if (sub) w.appendChild(el('div', 'sub', sub));
    head.appendChild(w);
    const x = el('button', 'mclose', '✕');
    x.type = 'button'; x.setAttribute('aria-label', '닫기');
    x.addEventListener('click', closeModal);
    head.appendChild(x);
    m.appendChild(head);
  }

  // ───────── 픽 상세 모달 ─────────
  function openPick(p) {
    const m = $('.modal', back);
    m.textContent = '';
    const rk = riskOf(p);
    modalHead(m, (p.assetClass === 'parking' ? '🛡️ ' : '📈 ') + baseName(p),
      p.ticker + ' · ' + (p.market === 'KR' ? '🇰🇷 한국' : '🇺🇸 미국') + ' · ' + (HORIZON[p.horizon] || '') + ' · ' + rk.label);

    const ez = EASY[p.id];
    if (ez) {
      const box = el('div', 'easybox'); box.style.marginTop = '0.8rem';
      box.appendChild(el('div', 'eb-t', '🧒 쉬운 설명'));
      box.appendChild(el('div', null, ez.company));
      if (ez.why && ez.why.length) {
        const ul = el('ul');
        ez.why.forEach(w => ul.appendChild(el('li', null, w)));
        box.appendChild(ul);
      }
      if (ez.plan) { const d = el('div'); d.style.marginTop = '0.3rem'; d.appendChild(el('b', null, '작전: ')); d.appendChild(document.createTextNode(ez.plan)); box.appendChild(d); }
      if (ez.levelWhy) box.appendChild(el('div', 'tiny', '난이도 이유: ' + ez.levelWhy));
      m.appendChild(box);
    }

    const f = simOf(p);
    if (f) {
      const sec = el('div', 'msec');
      sec.appendChild(el('h3', null, '🎲 시뮬레이션 확률 (20,000 경로)'));
      const tl = el('div', 'tiles');
      tl.appendChild(tile('이익확률', f.pProfit.toFixed(1) + '%', '수익 크기와는 별개예요'));
      tl.appendChild(tile('목표 도달', f.pHitTarget.toFixed(1) + '%', '목표가를 건드릴 확률'));
      tl.appendChild(tile('손절 확률', f.pHitStop.toFixed(1) + '%', '안전벨트가 작동할 확률'));
      sec.appendChild(tl);
      m.appendChild(sec);
    }

    const plan = el('div', 'msec');
    plan.appendChild(el('h3', null, '🗺️ 매매 계획'));
    const kv = el('div', 'kv');
    const add = (k, v) => { kv.appendChild(el('div', 'k', k)); kv.appendChild(el('div', null, v)); };
    add('기준가', fmtPrice(p, p.refPrice) + ' (' + (p.refPriceAsOf || '').split('—')[0].trim() + ')');
    if (p.buy) {
      add('언제·어떻게 사나', (p.buy.windowKst || p.buy.window || '') + (p.buy.note ? ' — ' + p.buy.note : ''));
    }
    if (p.sell) {
      const tPct = pctFrom(p, p.sell.low);
      add('팔 목표', fmtPrice(p, p.sell.low) + ' (' + signPct(tPct) + ')' + (p.sell.high ? ' ~ ' + fmtPrice(p, p.sell.high) : ''));
      const sPct = pctFrom(p, p.sell.stop);
      add('손절(안전벨트)', fmtPrice(p, p.sell.stop) + ' (' + signPct(sPct) + ') — 여기 오면 꼭 팔기');
      if (p.sell.note) add('참고', p.sell.note);
    }
    plan.appendChild(kv);
    m.appendChild(plan);

    if (p.scenarios && p.scenarios.length) {
      const sec = el('div', 'msec');
      sec.appendChild(el('h3', null, '🔮 일어날 수 있는 일들'));
      p.scenarios.forEach(sc => {
        const row = el('div', 'scen');
        row.appendChild(el('div', 'nm', sc.name + ' ' + sc.prob + '%'));
        const bar = el('div', 'probbar'); const fi = el('i'); fi.style.width = Math.min(100, sc.prob) + '%';
        if (sc.name.includes('손절')) fi.style.background = 'var(--series-6)';
        bar.appendChild(fi);
        row.appendChild(bar);
        row.appendChild(el('div', 'tiny', signPct(sc.ret) ));
        sec.appendChild(row);
        if (sc.desc) { const d = el('div', 'tiny', '· ' + sc.desc); d.style.margin = '-0.2rem 0 0.35rem'; sec.appendChild(d); }
      });
      m.appendChild(sec);
    }

    if (p.rationale) {
      const sec = el('div', 'msec');
      sec.appendChild(el('h3', null, '💡 왜 추천했나요'));
      if (p.rationale.summary) sec.appendChild(el('p', 'muted', p.rationale.summary));
      if (p.rationale.news && p.rationale.news.length) {
        const ul = el('ul', 'risk-list');
        p.rationale.news.forEach(nw => ul.appendChild(el('li', null, nw)));
        sec.appendChild(ul);
      }
      m.appendChild(sec);
    }

    if (p.riskFactors && p.riskFactors.length) {
      const sec = el('div', 'msec');
      sec.appendChild(el('h3', null, '⚠️ 조심할 점'));
      const ul = el('ul', 'risk-list');
      p.riskFactors.forEach(r => ul.appendChild(el('li', null, r)));
      sec.appendChild(ul);
      m.appendChild(sec);
    }

    m.appendChild(el('p', 'tiny', '모든 수치는 확률 추정치이며 수익을 보장하지 않아요. 주문 전 현재 가격을 꼭 확인하세요.'));
    openModal();
  }

  // ───────── 새 추천 받기 ─────────
  const SUPA_URL = 'https://ztjivtiuhxwazsajukto.supabase.co/rest/v1/rpc';
  const SUPA_KEY = 'sb_publishable_3xmYkBmX60wVPDjdmns1Ng_LyvLThQH';
  function supaRpc(fn, body) {
    return fetch(SUPA_URL + '/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
      body: JSON.stringify(body || {}),
    }).then(r => r.json());
  }
  function fmtWhen(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      const kst = new Date(d.getTime() + 9 * 3600000);
      const pd = n => String(n).padStart(2, '0');
      return kst.getUTCFullYear() + '-' + pd(kst.getUTCMonth() + 1) + '-' + pd(kst.getUTCDate()) + ' ' + pd(kst.getUTCHours()) + ':' + pd(kst.getUTCMinutes()) + ' KST';
    } catch (e) { return String(iso); }
  }
  const REQ_META = {
    pending: '⏳ 접수됨 (대기 중)',
    processing: '⚙️ 처리 중',
    done: '✅ 갱신 완료',
    rejected: '⛔ 반려됨',
  };
  function openRefresh() {
    const m = $('.modal', back);
    m.textContent = '';
    modalHead(m, '🔄 새 추천 받기', '최신 뉴스와 가격으로 추천을 다시 만들어 드려요. 이전 추천은 히스토리에 그대로 남아요.');

    const statusBox = el('div', 'easybox'); statusBox.style.marginTop = '0.8rem';
    statusBox.appendChild(el('div', 'eb-t', '📡 갱신 상태'));
    const line1 = el('div', null, '불러오는 중…');
    const line2 = el('div'); line2.style.marginTop = '0.3rem';
    statusBox.appendChild(line1); statusBox.appendChild(line2);
    m.appendChild(statusBox);

    function paint(data) {
      line1.textContent = '사이트 최신 추천: ' + String(RECO.lastUpdated || '').split(' (')[0];
      line2.textContent = '';
      const myId = +(store.get('lastReqId') || 0) || null;
      if (myId && data && data.mine && data.mine.id === myId) {
        line2.appendChild(el('b', null, '내 요청 #' + myId + ': ' + (REQ_META[data.mine.status] || data.mine.status)));
        if (data.mine.status === 'done') line2.appendChild(el('div', 'tiny', '완료 ' + fmtWhen(data.mine.processed_at) + ' — 새로고침하면 반영된 추천이 보여요.'));
        else line2.appendChild(el('div', 'tiny', '매시 30분 자동 확인 때 처리돼요 (보통 1시간 이내).'));
      } else {
        line2.appendChild(el('div', 'tiny', myId ? '지난 요청은 처리 완료되었습니다.' : '아직 보낸 요청이 없어요.'));
      }
    }
    paint(null);
    supaRpc('refresh_status', { p_id: +(store.get('lastReqId') || 0) || null }).then(paint).catch(() => {
      line2.textContent = '(상태 서버에 연결하지 못했어요)';
    });

    const sec = el('div', 'msec');
    sec.appendChild(el('h3', null, '🖱️ 버튼 한 번이면 끝 (로그인 불필요)'));
    const ta = el('textarea', 'req');
    ta.placeholder = '원하는 조건이 있으면 적어 주세요 (선택) — 예: 배당주 위주로, 안전한 것만';
    ta.maxLength = 500; ta.rows = 2;
    sec.appendChild(ta);
    const send = el('button', 'btn primary', '🚀 지금 요청 보내기');
    send.style.marginTop = '0.45rem';
    const st = el('p', 'tiny'); st.style.marginTop = '0.4rem';
    sec.appendChild(send); sec.appendChild(st);
    send.addEventListener('click', async () => {
      send.disabled = true;
      st.textContent = '보내는 중…';
      try {
        const r = await supaRpc('request_refresh', { p_note: ta.value || '' });
        if (r && r.ok) {
          st.textContent = '✅ 접수 완료 (요청 #' + r.id + ') — 보통 1시간 안에 반영돼요.';
          store.set('lastReqId', String(r.id));
          ta.value = '';
          supaRpc('refresh_status', { p_id: r.id }).then(paint).catch(() => {});
        } else if (r && r.reason === 'too_many_recent') {
          st.textContent = '⏳ 방금 요청이 몰렸어요. 10분 뒤 다시 시도해 주세요.';
          send.disabled = false;
        } else if (r && r.reason === 'queue_full') {
          st.textContent = '⏳ 대기 요청이 많아요. 다음 처리 후 다시 시도해 주세요.';
          send.disabled = false;
        } else { throw new Error('unexpected'); }
      } catch (e) {
        st.textContent = '⚠️ 전송 실패 — 인터넷 연결을 확인하고 다시 시도해 주세요.';
        send.disabled = false;
      }
    });
    m.appendChild(sec);

    const auto = el('div', 'msec');
    auto.appendChild(el('h3', null, '🤖 가만히 있어도'));
    auto.appendChild(el('p', 'muted', '평일 아침 8시(한국시간)마다 자동으로 새 추천이 만들어지고, vs S&P 500 레이스도 실측으로 갱신돼요.'));
    m.appendChild(auto);
    openModal();
  }

  // ───────── 초기화 ─────────
  $('#asof').textContent = '🔄 최신 갱신: ' + String(RECO.lastUpdated || '').split(' (')[0];
  $('#refreshbtn').addEventListener('click', openRefresh);
  $('#easymode').addEventListener('change', rerenderAll);
  $$('#tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab('today');
})();
