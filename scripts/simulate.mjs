// Monte Carlo simulation for stock recommendation scenarios.
// 모델 버전:
//   v1 'gbm' — GBM + 정규분포 (2026-07-08 배치들. 재현성 보존을 위해 유지)
//   v2 't'   — GBM + Student-t(ν=4) fat-tail (2026-07-09 배치1 사후분석 반영:
//              정규분포가 -4~-7%급 하루 급변 확률을 과소평가 → 테슬라 당일 손절(7/8) 등
//              이벤트 리스크 구간에서 P(손절)이 낙관적으로 나오던 문제 보정)
// Deterministic seed so committed results are reproducible: node scripts/simulate.mjs > data/sim.json
//
// Output per pick:
//   bands: percentile bands (p5/p25/p50/p75/p95) of cumulative return (%) per step — fan chart용
//   final: { pProfit, pHitTarget, pHitStop, median, mean, p5, p25, p75, p95 } (%)
//   hist:  histogram of final returns (30 bins)

const TRADING_DAYS = 252;
const N_PATHS = 20000;

// ---- seeded RNG (mulberry32) + Box-Muller normal ----
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
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return u * m;
  };
}

// Student-t(ν=4) 분산 1로 표준화 — fat tail (첨도 ∞→실질 급첨) 충격 생성기
// t = Z / sqrt(W/ν), W = 카이제곱(ν) = ν개의 표준정규 제곱합. Var(t)=ν/(ν-2)=2 → /sqrt(2)
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

// ---- pick configs (prices as of 2026-07-07/08 close, see data.js sources) ----
// horizon: steps = number of simulation steps; dt = years per step
// day picks: 13 intraday half-hour steps across one 6.5h session
const PICKS = [
  // 당일
  { id: 'day-nvda',   s0: 195.55,  target: 198.0,   stop: 188.0,   annVol: 0.45, annDrift: 0.25, kind: 'day' },
  { id: 'day-samsung',s0: 296000,  target: 302000,  stop: 283000,  annVol: 0.35, annDrift: 0.20, kind: 'day' },
  { id: 'day-tsla',   s0: 402.90,  target: 412.0,   stop: 389.0,   annVol: 0.62, annDrift: 0.15, kind: 'day' },
  // 1주
  { id: 'week-tsm',   s0: 434.16,  target: 455.0,   stop: 415.0,   annVol: 0.40, annDrift: 0.22, kind: 'week' },
  { id: 'week-hynix', s0: 2870000, target: 2980000, stop: 2650000, annVol: 0.48, annDrift: 0.25, kind: 'week' },
  { id: 'week-tsla',  s0: 402.90,  target: 425.0,   stop: 382.0,   annVol: 0.62, annDrift: 0.15, kind: 'week' },
  // 1개월
  { id: 'month-msft', s0: 386.74,  target: 412.0,   stop: 362.0,   annVol: 0.27, annDrift: 0.18, kind: 'month' },
  { id: 'month-samsung', s0: 296000, target: 325000, stop: 272000, annVol: 0.35, annDrift: 0.20, kind: 'month' },
  { id: 'month-nvda', s0: 195.55,  target: 214.0,   stop: 178.0,   annVol: 0.45, annDrift: 0.25, kind: 'month' },
  // 장기 (12개월)
  { id: 'long-msft',  s0: 386.74,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long' },
  { id: 'long-ko',    s0: 82.04,   target: 92.0,    stop: 72.0,    annVol: 0.14, annDrift: 0.08, kind: 'long' },
  { id: 'long-samsung', s0: 296000, target: 420000, stop: 240000,  annVol: 0.35, annDrift: 0.20, kind: 'long' },
  // 확실성 등급 (표준 배치와 별도 — 뒤에 추가해 기존 seed 유지)
  { id: 'sure-sgov',  s0: 100.55,  target: 104.2,   stop: 99.5,    annVol: 0.006, annDrift: 0.036, kind: 'long' },
  { id: 'sure-kofr',  s0: 112000,  target: 114800,  stop: 111000,  annVol: 0.003, annDrift: 0.025, kind: 'long' },
  { id: 'sure-voo',   s0: 692,     target: 740,     stop: 585,     annVol: 0.16,  annDrift: 0.07,  kind: 'long' },
  { id: 'sure-k200',  s0: 103300,  target: 110000,  stop: 87000,   annVol: 0.20,  annDrift: 0.065, kind: 'long' },
  // ── 배치 2026-07-08-2 (사이트 갱신 요청 #3, 중동 리스크·3일 급락 반영) — 뒤에 추가해 기존 seed 유지 ──
  { id: 'b2-day-samsung', s0: 281500,  target: 287500,  stop: 268000,  annVol: 0.42, annDrift: 0.15, kind: 'day' },
  { id: 'b2-day-nvda',    s0: 196.93,  target: 200.5,   stop: 185.0,   annVol: 0.48, annDrift: 0.20, kind: 'day' },
  { id: 'b2-day-xom',     s0: 138.20,  target: 141.5,   stop: 135.0,   annVol: 0.28, annDrift: 0.20, kind: 'day' },
  { id: 'b2-week-tsm',    s0: 434.16,  target: 455.0,   stop: 405.0,   annVol: 0.45, annDrift: 0.20, kind: 'week' },
  { id: 'b2-week-ko',     s0: 82.04,   target: 85.5,    stop: 79.0,    annVol: 0.15, annDrift: 0.15, kind: 'week' },
  { id: 'b2-week-msft',   s0: 386.74,  target: 400.0,   stop: 370.0,   annVol: 0.28, annDrift: 0.15, kind: 'week' },
  { id: 'b2-month-samsung', s0: 281500, target: 315000, stop: 258000,  annVol: 0.38, annDrift: 0.20, kind: 'month' },
  { id: 'b2-month-nvda',  s0: 196.93,  target: 214.0,   stop: 176.0,   annVol: 0.46, annDrift: 0.25, kind: 'month' },
  { id: 'b2-month-hynix', s0: 2201000, target: 2450000, stop: 1950000, annVol: 0.55, annDrift: 0.25, kind: 'month' },
  { id: 'b2-long-msft',   s0: 386.74,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long' },
  { id: 'b2-long-ko',     s0: 82.04,   target: 92.0,    stop: 72.0,    annVol: 0.14, annDrift: 0.08, kind: 'long' },
  { id: 'b2-long-samsung', s0: 281500, target: 420000,  stop: 228000,  annVol: 0.36, annDrift: 0.20, kind: 'long' },
  // ── 배치 2026-07-09 (매일 아침 자동 갱신 1회차) — 뒤에 추가해 기존 seed 유지 ──
  { id: 'b3-day-samsung', s0: 277500,  target: 285000,  stop: 265000,  annVol: 0.45, annDrift: 0.20, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b3-day-hynix',   s0: 2076000, target: 2175000, stop: 1960000, annVol: 0.60, annDrift: 0.25, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b3-day-nvda',    s0: 196.93,  target: 201.5,   stop: 190.0,   annVol: 0.46, annDrift: 0.22, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b3-week-tsm',    s0: 434.16,  target: 458.0,   stop: 415.0,   annVol: 0.44, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b3-week-xom',    s0: 138.20,  target: 146.0,   stop: 134.0,   annVol: 0.30, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b3-week-ko',     s0: 82.04,   target: 85.5,    stop: 79.0,    annVol: 0.15, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b3-month-msft',  s0: 386.74,  target: 412.0,   stop: 362.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b3-month-samsung', s0: 277500, target: 315000, stop: 255000,  annVol: 0.40, annDrift: 0.22, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b3-month-nvda',  s0: 196.93,  target: 215.0,   stop: 178.0,   annVol: 0.46, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b3-long-msft',   s0: 386.74,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b3-long-ko',     s0: 82.04,   target: 92.0,    stop: 72.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  { id: 'b3-long-samsung', s0: 277500, target: 420000,  stop: 225000,  annVol: 0.36, annDrift: 0.20, kind: 'long', model: 't' },
  // ── 배치 2026-07-10 (사이트 갱신 요청 #4, SK하이닉스 ADR 상장일·중동 리스크 잔존) ──
  { id: 'b4-day-samsung', s0: 278500,  target: 282000,  stop: 272000,  annVol: 0.42, annDrift: 0.20, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b4-day-hynix',   s0: 2197000, target: 2250000, stop: 2080000, annVol: 0.60, annDrift: 0.22, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b4-day-nvda',    s0: 204.12,  target: 207.0,   stop: 199.0,   annVol: 0.45, annDrift: 0.22, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b4-week-tsm',    s0: 434.16,  target: 456.0,   stop: 415.0,   annVol: 0.44, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b4-week-ko',     s0: 84.35,   target: 87.0,    stop: 81.5,    annVol: 0.15, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b4-week-xom',    s0: 141.27,  target: 148.0,   stop: 137.0,   annVol: 0.30, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b4-month-msft',  s0: 382.29,  target: 410.0,   stop: 360.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b4-month-samsung', s0: 278500, target: 315000, stop: 255000,  annVol: 0.40, annDrift: 0.22, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b4-month-nvda',  s0: 204.12,  target: 224.0,   stop: 184.0,   annVol: 0.46, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b4-long-msft',   s0: 382.29,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b4-long-ko',     s0: 84.35,   target: 94.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  { id: 'b4-long-samsung', s0: 278500, target: 420000,  stop: 225000,  annVol: 0.36, annDrift: 0.20, kind: 'long', model: 't' },
  // ── 배치 2026-07-10-am (매일 아침 자동 갱신, 7/9 미 반도체 강세 마감 반영) ──
  { id: 'b5-day-hynix',   s0: 2197000, target: 2240000, stop: 2090000, annVol: 0.58, annDrift: 0.22, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b5-day-samsung', s0: 278500,  target: 282000,  stop: 272500,  annVol: 0.40, annDrift: 0.20, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b5-day-nvda',    s0: 204.12,  target: 207.0,   stop: 199.5,   annVol: 0.44, annDrift: 0.22, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b5-week-tsm',    s0: 434.16,  target: 456.0,   stop: 416.0,   annVol: 0.42, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b5-week-msft',   s0: 384.36,  target: 398.0,   stop: 370.0,   annVol: 0.27, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b5-week-ko',     s0: 84.35,   target: 87.0,    stop: 81.5,    annVol: 0.15, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b5-month-msft',  s0: 384.36,  target: 410.0,   stop: 360.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b5-month-samsung', s0: 278500, target: 315000, stop: 255000,  annVol: 0.40, annDrift: 0.22, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b5-month-nvda',  s0: 204.12,  target: 224.0,   stop: 184.0,   annVol: 0.46, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b5-long-msft',   s0: 384.36,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b5-long-ko',     s0: 84.35,   target: 94.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  { id: 'b5-long-samsung', s0: 278500, target: 420000,  stop: 225000,  annVol: 0.36, annDrift: 0.20, kind: 'long', model: 't' },
  // ── batch-2026-07-13 (7/10 종가 기준, 당일 전략은 7/13 월요일) ──
  // 레짐: 반도체 강세·VIX 16(안정)이나 오일/호르무즈 꼬리위험 잔존 → volX 1.2(당일·1주)/1.1(1개월)
  // v2.2: 매도 목표를 체결가 상대(+1% 내외)로 재설계 — 시가 상대 매수와 정합
  { id: 'b6-day-nvda',    s0: 210.96,  target: 213.5,   stop: 208.0,   annVol: 0.46, annDrift: 0.20, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b6-day-samsung', s0: 285000,  target: 288000,  stop: 281000,  annVol: 0.40, annDrift: 0.18, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b6-day-tsm',     s0: 434.11,  target: 439.0,   stop: 428.0,   annVol: 0.40, annDrift: 0.20, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b6-week-tsm',    s0: 434.11,  target: 452.0,   stop: 418.0,   annVol: 0.42, annDrift: 0.24, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b6-week-samsung',s0: 285000,  target: 300000,  stop: 273000,  annVol: 0.40, annDrift: 0.22, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b6-week-ko',     s0: 84.30,   target: 87.0,    stop: 81.5,    annVol: 0.15, annDrift: 0.12, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b6-month-nvda',  s0: 210.96,  target: 232.0,   stop: 190.0,   annVol: 0.46, annDrift: 0.24, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b6-month-msft',  s0: 385.35,  target: 415.0,   stop: 362.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b6-month-tsm',   s0: 434.11,  target: 478.0,   stop: 408.0,   annVol: 0.42, annDrift: 0.22, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b6-long-msft',   s0: 385.35,  target: 520.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b6-long-samsung',s0: 285000,  target: 430000,  stop: 228000,  annVol: 0.36, annDrift: 0.20, kind: 'long', model: 't' },
  { id: 'b6-long-ko',     s0: 84.30,   target: 96.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  // ── batch-2026-07-14 (7/13 종가 기준, 당일 전략은 7/14 화요일) ──
  // 레짐: 리스크오프(호르무즈 봉쇄→오일 급등, 코스피 -8.95% 서킷브레이커, 반도체 폭락) → volX 1.3(당일·1주)/1.2(1개월)
  // 당일 전략은 고베타 반도체 제외, 방어(KO)·에너지(XOM)·퀄리티(MSFT) 중심. 반도체는 워시아웃 후 주간·월간·장기 역발상만.
  { id: 'b7-day-xom',     s0: 139.41,  target: 141.5,   stop: 137.0,   annVol: 0.30, annDrift: 0.20, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b7-day-ko',      s0: 85.50,   target: 86.8,    stop: 84.0,    annVol: 0.15, annDrift: 0.15, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b7-day-msft',    s0: 379.0,   target: 383.0,   stop: 373.0,   annVol: 0.28, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b7-week-xom',    s0: 139.41,  target: 146.0,   stop: 133.0,   annVol: 0.32, annDrift: 0.25, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b7-week-msft',   s0: 379.0,   target: 396.0,   stop: 362.0,   annVol: 0.28, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b7-week-samsung',s0: 254500,  target: 275000,  stop: 235000,  annVol: 0.50, annDrift: 0.25, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b7-month-nvda',  s0: 203.57,  target: 226.0,   stop: 182.0,   annVol: 0.48, annDrift: 0.24, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b7-month-msft',  s0: 379.0,   target: 410.0,   stop: 356.0,   annVol: 0.28, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b7-month-samsung',s0: 254500, target: 290000,  stop: 228000,  annVol: 0.48, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b7-long-msft',   s0: 379.0,   target: 520.0,   stop: 320.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b7-long-samsung',s0: 254500,  target: 400000,  stop: 205000,  annVol: 0.38, annDrift: 0.22, kind: 'long', model: 't' },
  { id: 'b7-long-ko',     s0: 85.50,   target: 96.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  // ── batch-2026-07-15 (7/14 종가 기준, 당일 전략은 7/15 수요일) ──
  // 레짐: 부분 회복 — 6월 CPI 3.5%<3.8%(디스인플레), 반도체 반등(SMH +2.5%), 호르무즈 20% 수수료 철회로 오일 고점 이탈.
  // 단 이란 추가 타격으로 지정학 꼬리 잔존 → 리스크오프에서 중립~완만한 리스크온으로 전환, volX 1.2(당일·1주)/1.1(1개월).
  // 반도체 당일 전략 재편입(반등 모멘텀), 에너지(XOM) 헤지 유지.
  { id: 'b8-day-nvda',    s0: 209.0,   target: 211.5,   stop: 205.5,   annVol: 0.48, annDrift: 0.20, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b8-day-xom',     s0: 144.74,  target: 146.5,   stop: 142.0,   annVol: 0.32, annDrift: 0.18, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b8-day-samsung', s0: 260000,  target: 263000,  stop: 256000,  annVol: 0.48, annDrift: 0.18, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b8-week-tsm',    s0: 433.0,   target: 452.0,   stop: 415.0,   annVol: 0.42, annDrift: 0.24, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b8-week-samsung',s0: 260000,  target: 278000,  stop: 245000,  annVol: 0.48, annDrift: 0.24, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b8-week-xom',    s0: 144.74,  target: 151.0,   stop: 138.0,   annVol: 0.32, annDrift: 0.22, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b8-month-nvda',  s0: 209.0,   target: 230.0,   stop: 188.0,   annVol: 0.46, annDrift: 0.24, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b8-month-msft',  s0: 385.0,   target: 415.0,   stop: 362.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b8-month-samsung',s0: 260000, target: 295000,  stop: 232000,  annVol: 0.46, annDrift: 0.24, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b8-long-msft',   s0: 385.0,   target: 520.0,   stop: 325.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b8-long-samsung',s0: 260000,  target: 410000,  stop: 210000,  annVol: 0.38, annDrift: 0.22, kind: 'long', model: 't' },
  { id: 'b8-long-ko',     s0: 84.27,   target: 96.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
];

const KIND_STEPS = {
  day:   { steps: 13,  dtYears: (1 / TRADING_DAYS) / 13, sampleEvery: 1 },
  week:  { steps: 5,   dtYears: 1 / TRADING_DAYS,        sampleEvery: 1 },
  month: { steps: 21,  dtYears: 1 / TRADING_DAYS,        sampleEvery: 3 },
  long:  { steps: 252, dtYears: 1 / TRADING_DAYS,        sampleEvery: 21 },
};

function percentile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function simulate(pick, seed) {
  const { steps, dtYears, sampleEvery } = KIND_STEPS[pick.kind];
  const rand = mulberry32(seed);
  // v2: model === 't' 이면 fat-tail 충격, 아니면(v1 재현) 정규분포
  const normal = pick.model === 't' ? makeStudentT(rand, 4) : makeNormal(rand);
  // v2: volX = 레짐 변동성 승수 (이벤트/리스크오프 국면에서 실현 변동성이
  // 과거 변동성을 초과하는 현상 보정 — 배치1 테슬라 사후분석의 핵심 교훈)
  const vol = pick.annVol * (pick.volX || 1);
  const drift = (pick.annDrift - 0.5 * vol * vol) * dtYears;
  const diffusion = vol * Math.sqrt(dtYears);

  // sampled step indices for fan-chart bands (always include step 0 and last)
  const sampleIdx = [0];
  for (let s = sampleEvery; s < steps; s += sampleEvery) sampleIdx.push(s);
  if (sampleIdx[sampleIdx.length - 1] !== steps) sampleIdx.push(steps);

  const perStepReturns = sampleIdx.map(() => new Float64Array(N_PATHS));
  const finals = new Float64Array(N_PATHS);
  let hitTarget = 0, hitStop = 0, profit = 0;

  for (let p = 0; p < N_PATHS; p++) {
    let logS = Math.log(pick.s0);
    let hitT = false, hitS = false;
    let si = 1; // sampleIdx[0] is step 0 (return 0)
    perStepReturns[0][p] = 0;
    for (let step = 1; step <= steps; step++) {
      logS += drift + diffusion * normal();
      const price = Math.exp(logS);
      if (!hitT && !hitS) {
        if (price >= pick.target) hitT = true;
        else if (price <= pick.stop) hitS = true;
      }
      if (si < sampleIdx.length && sampleIdx[si] === step) {
        perStepReturns[si][p] = (price / pick.s0 - 1) * 100;
        si++;
      }
    }
    const fin = (Math.exp(logS) / pick.s0 - 1) * 100;
    finals[p] = fin;
    if (fin > 0) profit++;
    if (hitT) hitTarget++;
    if (hitS) hitStop++;
  }

  const bands = { steps: sampleIdx, p5: [], p25: [], p50: [], p75: [], p95: [] };
  for (let i = 0; i < sampleIdx.length; i++) {
    const arr = Array.from(perStepReturns[i]).sort((a, b) => a - b);
    bands.p5.push(+percentile(arr, 0.05).toFixed(2));
    bands.p25.push(+percentile(arr, 0.25).toFixed(2));
    bands.p50.push(+percentile(arr, 0.50).toFixed(2));
    bands.p75.push(+percentile(arr, 0.75).toFixed(2));
    bands.p95.push(+percentile(arr, 0.95).toFixed(2));
  }

  const sortedFinals = Array.from(finals).sort((a, b) => a - b);
  const mean = sortedFinals.reduce((s, v) => s + v, 0) / N_PATHS;

  // histogram: 30 bins across p1..p99
  const lo = percentile(sortedFinals, 0.01), hi = percentile(sortedFinals, 0.99);
  const nBins = 30, w = (hi - lo) / nBins;
  const hist = { lo: +lo.toFixed(2), hi: +hi.toFixed(2), counts: new Array(nBins).fill(0) };
  for (const v of sortedFinals) {
    if (v < lo || v > hi) continue;
    const b = Math.min(nBins - 1, Math.floor((v - lo) / w));
    hist.counts[b]++;
  }

  return {
    id: pick.id,
    paths: N_PATHS,
    bands,
    final: {
      pProfit: +(profit / N_PATHS * 100).toFixed(1),
      pHitTarget: +(hitTarget / N_PATHS * 100).toFixed(1),
      pHitStop: +(hitStop / N_PATHS * 100).toFixed(1),
      mean: +mean.toFixed(2),
      median: +percentile(sortedFinals, 0.5).toFixed(2),
      p5: +percentile(sortedFinals, 0.05).toFixed(2),
      p25: +percentile(sortedFinals, 0.25).toFixed(2),
      p75: +percentile(sortedFinals, 0.75).toFixed(2),
      p95: +percentile(sortedFinals, 0.95).toFixed(2),
    },
    hist,
  };
}

const results = {};
PICKS.forEach((pick, i) => { results[pick.id] = simulate(pick, 42 + i * 1000); });
console.log(JSON.stringify(results, null, 1));
