// 전략 포트폴리오 vs S&P 500 — 몬테카를로 비교 시뮬레이션 (v4.0 전략 개편)
//
// 목표: "S&P 500 총수익을 이기는 것"을 명시적 벤치마크로 삼는 코어-위성 포트폴리오.
// 정직성 원칙: 초과수익은 보장이 아니라 '팩터 프리미엄 가정'에 걸린 확률이다.
//   - 가정을 켠 확률(pBeat)과 가정을 전부 끈 확률(pBeatNoAlpha)을 둘 다 계산해 공개한다.
//   - 같은 시장 충격(단일 팩터)을 포트폴리오와 벤치마크에 공유시켜 상대 성과를 재는 구조.
// 실측 검증: data/strategy.js 의 race 시리즈에 매일 실제 지수(시작=100)를 기록해
//   모형이 아닌 '실제로 이기고 있는지'를 대시보드에 공개한다.
//
// 실행: node scripts/strategy.mjs  → data/strategy.js 를 직접 갱신 (race 시리즈는 보존)

import { readFileSync, writeFileSync, existsSync } from 'fs';

const TRADING_DAYS = 252;
const N_PATHS = 20000;
const SEED = 777;

// ---- seeded RNG (mulberry32) + Box-Muller + Student-t(4) — simulate.mjs 와 동일 계열 ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0, s = 0;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return u * m;
  };
}
function makeStudentT(rand, nu = 4) {
  const normal = makeNormal(rand);
  const scale = Math.sqrt(nu / (nu - 2));
  return function () {
    const z = normal();
    let w = 0;
    for (let k = 0; k < nu; k++) { const n = normal(); w += n * n; }
    return (z / Math.sqrt(w / nu)) / scale;
  };
}

// ---- 포트폴리오 정의 (총수익 기준 가정 — 배당·이자 포함) ----
// 시장(S&P 500 TR): drift 9.5%/yr, vol 15%/yr — 장기 역사 평균대의 보수적 가정
const MKT = { drift: 0.095, vol: 0.15 };
// 슬리브: beta(시장 민감도) + alpha(팩터 프리미엄 '가정' — 보장 아님) + totalVol
const SLEEVES = [
  { key: 'core',    name: '코어 · S&P 500 인덱스', w: 0.45, beta: 1.0, alpha: 0.000, vol: 0.15 },
  { key: 'growth',  name: '성장 위성 · AI 대형주 3~5종 분산(모멘텀 틸트)', w: 0.30, beta: 1.35, alpha: 0.020, vol: 0.35 },
  { key: 'div',     name: '방어 위성 · 배당·저변동(KO·SCHD류)', w: 0.15, beta: 0.6, alpha: 0.015, vol: 0.16 },
  { key: 'parking', name: '파킹 · 초단기 국채(SGOV류) — 조정장 실탄', w: 0.10, beta: 0.0, alpha: 0.000, vol: 0.004 },
];
const PARKING_DRIFT = 0.037; // 파킹은 beta*시장이 아니라 자체 이자
const REBALANCE_EVERY = 63; // 분기 리밸런싱

function idioVol(s) {
  const sys = s.beta * MKT.vol;
  const v2 = s.vol * s.vol - sys * sys;
  return v2 > 0 ? Math.sqrt(v2) : 0;
}
function sleeveDrift(s, useAlpha) {
  if (s.key === 'parking') return PARKING_DRIFT;
  return s.beta * MKT.drift + (useAlpha ? s.alpha : 0);
}

function simulate(steps, useAlpha, seed) {
  const rand = mulberry32(seed);
  const tShock = makeStudentT(rand, 4);   // 시장 팩터: fat-tail
  const nShock = makeNormal(rand);        // 개별(idio) 충격: 정규
  const dt = 1 / TRADING_DAYS;
  const sq = Math.sqrt(dt);
  const iv = SLEEVES.map(idioVol);
  const dr = SLEEVES.map(s => sleeveDrift(s, useAlpha));

  let beat = 0;
  const excess = new Array(N_PATHS);
  const portFinal = new Array(N_PATHS);
  const spyFinal = new Array(N_PATHS);
  let portDDsum = 0, spyDDsum = 0;

  for (let p = 0; p < N_PATHS; p++) {
    let spy = 1;
    let sleeves = SLEEVES.map(s => s.w);
    let port = 1, portPeak = 1, portMaxDD = 0, spyPeak = 1, spyMaxDD = 0;
    for (let t = 1; t <= steps; t++) {
      const f = tShock() * MKT.vol * sq; // 공유 시장 충격
      const mret = (MKT.drift - 0.5 * MKT.vol * MKT.vol) * dt + f;
      spy *= Math.exp(mret);
      let total = 0;
      for (let i = 0; i < SLEEVES.length; i++) {
        const s = SLEEVES[i];
        const shock = s.beta * f + iv[i] * nShock() * sq;
        const r = (dr[i] - 0.5 * s.vol * s.vol) * dt + shock;
        sleeves[i] *= Math.exp(r);
        total += sleeves[i];
      }
      port = total;
      if (t % REBALANCE_EVERY === 0) {
        sleeves = SLEEVES.map(s => s.w * total); // 목표 비중으로 리밸런싱
      }
      if (port > portPeak) portPeak = port;
      const dd = 1 - port / portPeak;
      if (dd > portMaxDD) portMaxDD = dd;
      if (spy > spyPeak) spyPeak = spy;
      const sdd = 1 - spy / spyPeak;
      if (sdd > spyMaxDD) spyMaxDD = sdd;
    }
    if (port > spy) beat++;
    excess[p] = (port - spy) * 100;
    portFinal[p] = (port - 1) * 100;
    spyFinal[p] = (spy - 1) * 100;
    portDDsum += portMaxDD;
    spyDDsum += spyMaxDD;
  }
  excess.sort((a, b) => a - b);
  portFinal.sort((a, b) => a - b);
  spyFinal.sort((a, b) => a - b);
  const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  const r1 = x => +x.toFixed(1);
  return {
    pBeat: r1(beat / N_PATHS * 100),
    excessMedian: r1(pct(excess, 0.5)),
    excessP5: r1(pct(excess, 0.05)),
    excessP95: r1(pct(excess, 0.95)),
    portMedian: r1(pct(portFinal, 0.5)),
    portP5: r1(pct(portFinal, 0.05)),
    portP95: r1(pct(portFinal, 0.95)),
    spyMedian: r1(pct(spyFinal, 0.5)),
    spyP5: r1(pct(spyFinal, 0.05)),
    spyP95: r1(pct(spyFinal, 0.95)),
    portMaxDDavg: r1(portDDsum / N_PATHS * 100),
    spyMaxDDavg: r1(spyDDsum / N_PATHS * 100),
  };
}

// ---- race 시리즈 보존 (기존 data/strategy.js 에서 읽어와 유지) ----
const OUT = new URL('../data/strategy.js', import.meta.url).pathname;
let race = { start: '2026-09-10', base: 100, series: [{ date: '2026-09-10', strategy: 100, spy: 100 }] };
if (existsSync(OUT)) {
  try {
    const prev = readFileSync(OUT, 'utf8');
    const m = prev.match(/window\.STRATEGY = (\{[\s\S]*\});\s*$/);
    if (m) {
      const parsed = JSON.parse(m[1]);
      if (parsed.race && Array.isArray(parsed.race.series) && parsed.race.series.length) race = parsed.race;
    }
  } catch (e) { /* 첫 생성이거나 파싱 실패 — 초기 race 유지 */ }
}

const result = {
  version: 'v4.0',
  updatedAt: new Date().toISOString().slice(0, 10),
  goal: 'S&P 500 총수익(배당 포함)을 이기는 것을 명시적 목표로 하되, 그 확률을 가정과 함께 정직하게 공개한다',
  benchmark: 'S&P 500 총수익 (모형 가정: 연 +9.5%, 변동성 15%)',
  rebalance: '분기(약 63거래일)마다 목표 비중으로 리밸런싱',
  sleeves: SLEEVES.map(s => ({
    key: s.key, name: s.name, weight: +(s.w * 100).toFixed(0),
    beta: s.beta, alphaAssumption: +(s.alpha * 100).toFixed(1), vol: +(s.vol * 100).toFixed(0),
    drift: +(sleeveDrift(s, true) * 100).toFixed(1),
  })),
  assumptions: [
    '모든 수치는 몬테카를로(20,000 경로, Student-t(4) 시장 충격) 확률 추정치이며 수익을 보장하지 않습니다',
    '성장 위성 +2.0%p, 방어 위성 +1.5%p의 연간 팩터 프리미엄(모멘텀·저변동/배당)은 학계 장기 평균에 기댄 "가정"입니다 — 미래에 실현되지 않을 수 있습니다',
    '거래 비용·세금·환율은 반영하지 않았습니다 (실제 수익률은 이보다 낮아질 수 있습니다)',
    '가정을 전부 끈 pBeatNoAlpha 가 50%를 밑도는 것이 정직한 기준선입니다 — 프리미엄 실현 여부가 성패를 가릅니다',
  ],
  sim: {
    h3m: { withAlpha: simulate(63, true, SEED), noAlpha: simulate(63, false, SEED) },
    h1y: { withAlpha: simulate(TRADING_DAYS, true, SEED + 1000), noAlpha: simulate(TRADING_DAYS, false, SEED + 1000) },
  },
  race,
};

writeFileSync(OUT, 'window.STRATEGY = ' + JSON.stringify(result, null, 1) + ';\n');
console.log('data/strategy.js written.');
console.log('1y pBeat(가정 켬):', result.sim.h1y.withAlpha.pBeat, '% / pBeat(가정 끔):', result.sim.h1y.noAlpha.pBeat, '%');
console.log('race points:', race.series.length);
