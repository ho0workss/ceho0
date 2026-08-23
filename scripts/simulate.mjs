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
  // ── batch-2026-07-16 (7/15 종가 기준, 당일 전략은 7/16 목요일 = TSMC 실적일) ──
  // 레짐: 리스크온이나 프로시클 프로스(froth) — 코스피 +6.24%(매수 사이드카), 삼성 +6.27%, SK하이닉스 +8.8%.
  // 단 미 반도체는 빅테크로 순환매(MSFT/AMZN/GOOGL +3%, Micron -8%). V자 급반등 되돌림 리스크 → volX 1.2(당일·1주)/1.1(1개월).
  // TSMC 7/16 실적일이라 TSM 당일 전략 제외(이벤트), 리더십(MSFT)·모멘텀(삼성·NVDA) 중심.
  { id: 'b9-day-msft',    s0: 396.0,   target: 400.0,   stop: 390.0,   annVol: 0.28, annDrift: 0.16, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b9-day-nvda',    s0: 212.50,  target: 215.0,   stop: 209.0,   annVol: 0.46, annDrift: 0.18, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b9-day-samsung', s0: 279500,  target: 282500,  stop: 275000,  annVol: 0.50, annDrift: 0.15, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b9-week-tsm',    s0: 430.0,   target: 452.0,   stop: 412.0,   annVol: 0.42, annDrift: 0.22, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b9-week-msft',   s0: 396.0,   target: 412.0,   stop: 380.0,   annVol: 0.28, annDrift: 0.18, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b9-week-samsung',s0: 279500,  target: 298000,  stop: 262000,  annVol: 0.50, annDrift: 0.20, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b9-month-nvda',  s0: 212.50,  target: 234.0,   stop: 191.0,   annVol: 0.46, annDrift: 0.22, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b9-month-msft',  s0: 396.0,   target: 424.0,   stop: 372.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b9-month-samsung',s0: 279500, target: 315000,  stop: 250000,  annVol: 0.46, annDrift: 0.22, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b9-long-msft',   s0: 396.0,   target: 530.0,   stop: 335.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b9-long-samsung',s0: 279500,  target: 430000,  stop: 225000,  annVol: 0.38, annDrift: 0.20, kind: 'long', model: 't' },
  { id: 'b9-long-ko',     s0: 84.00,   target: 96.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  // ── batch-2026-07-17 (7/16 종가 기준, 당일 전략은 7/17 금요일) ──
  // 레짐: 리스크오프 재점화 — 한국은행 기준금리 +25bp(2.75%, 2023년 1월 이후 첫 인상)로 코스피 -6.37% 베어마켓 진입,
  // TSMC 호실적에도 capex 상향($60~64B)으로 -4%·메모리 -7% 반도체 재매도. 주간 휨쏘(월 -9%·수 +6%·목 -6.4%).
  // → volX 1.3(당일·1주)/1.2(1개월), 당일 전략은 반도체·한국 제외 방어(KO)·에너지(XOM)·퀄리티(MSFT) 중심·소액.
  { id: 'b10-day-xom',    s0: 145.0,   target: 147.0,   stop: 142.5,   annVol: 0.32, annDrift: 0.18, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b10-day-ko',     s0: 84.50,   target: 85.8,    stop: 83.0,    annVol: 0.15, annDrift: 0.15, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b10-day-msft',   s0: 390.0,   target: 394.0,   stop: 384.0,   annVol: 0.28, annDrift: 0.10, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b10-week-xom',   s0: 145.0,   target: 152.0,   stop: 139.0,   annVol: 0.32, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b10-week-msft',  s0: 390.0,   target: 406.0,   stop: 373.0,   annVol: 0.28, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b10-week-tsm',   s0: 413.0,   target: 435.0,   stop: 396.0,   annVol: 0.44, annDrift: 0.24, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b10-month-nvda', s0: 207.0,   target: 228.0,   stop: 186.0,   annVol: 0.48, annDrift: 0.24, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b10-month-msft', s0: 390.0,   target: 418.0,   stop: 366.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b10-month-samsung',s0: 262000,target: 296000,  stop: 234000,  annVol: 0.50, annDrift: 0.22, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b10-long-msft',  s0: 390.0,   target: 525.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b10-long-samsung',s0: 262000, target: 410000,  stop: 210000,  annVol: 0.40, annDrift: 0.20, kind: 'long', model: 't' },
  { id: 'b10-long-ko',    s0: 84.50,   target: 96.0,    stop: 74.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  // ── batch-2026-07-20 (v3.0 고확률 모드 — 사용자 요청: 성공률 ≥90% 설계) ──
  // 설계 원리: 성공확률(목표 터치 확률)을 높이는 정직한 트레이드오프 =
  //   ① 목표 축소(변동성의 0.1~0.2σ) ② 손절 확대(비대칭 리스크 — 명시) ③ 저변동·양(+)드리프트 자산 ④ 파킹형 포함
  //   ⑤ 당일 주식은 구조적으로 90% 불가 → 파킹형 2 + 대조군 1(확률 명시)
  // 모든 목표/손절은 시뮬레이터(2만 경로, fat-tail)로 pHitTarget ≥ 90% 검증 후 확정.
  // 파킹형(SGOV/KOFR)의 단기(당일·1주) annVol은 일중 실현변동성 기준 재보정 —
  // 연 0.6%/0.3%는 수개월 금리변동 리스크이며, 하루~1주 NAV는 이자 적립으로 사실상 결정적(실측: 마이너스 일 없음)
  { id: 'b11-day-sgov',   s0: 100.55,  target: 100.56,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b11-day-kofr',   s0: 112000,  target: 112005,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b11-day-ko',     s0: 84.50,   target: 84.75,   stop: 81.0,    annVol: 0.15, annDrift: 0.15, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b11-week-sgov',  s0: 100.55,  target: 100.59,  stop: 99.8,    annVol: 0.002, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b11-week-ko',    s0: 84.50,   target: 84.75,   stop: 79.0,    annVol: 0.15, annDrift: 0.12, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b11-week-msft',  s0: 390.0,   target: 391.2,   stop: 360.0,   annVol: 0.28, annDrift: 0.15, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b11-month-kofr', s0: 112000,  target: 112110,  stop: 111000,  annVol: 0.003, annDrift: 0.025, kind: 'month', model: 't' },
  { id: 'b11-month-ko',   s0: 84.50,   target: 84.80,   stop: 76.0,    annVol: 0.15, annDrift: 0.10, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b11-month-msft', s0: 390.0,   target: 392.0,   stop: 340.0,   annVol: 0.27, annDrift: 0.15, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b11-long-sgov',  s0: 100.55,  target: 103.0,   stop: 98.5,    annVol: 0.006, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b11-long-ko',    s0: 84.50,   target: 86.6,    stop: 70.0,    annVol: 0.14, annDrift: 0.08, kind: 'long', model: 't' },
  { id: 'b11-long-msft',  s0: 390.0,   target: 404.0,   stop: 300.0,   annVol: 0.27, annDrift: 0.16, kind: 'long', model: 't' },
  // ── batch-2026-07-20-r (v3.1 멀티소스 리서치 — 뉴스·차트·여론·재무 4소스, 7/17 종가 기준, 당일은 7/20 월) ──
  // 레짐: 리스크오프 지속 — 7/17 S&P -1.0%·나스닥 -1.4%(AI capex 축소 우려 반도체 연쇄 매도), 에너지만 상승, KO -4%.
  // F&G 43(공포) → volX 1.3(당일·1주)/1.2(1개월). 당일은 에너지 1 + 파킹형 2.
  { id: 'b12-day-xom',    s0: 146.0,   target: 147.8,   stop: 143.5,   annVol: 0.32, annDrift: 0.20, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b12-day-kofr',   s0: 112000,  target: 112005,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b12-day-sgov',   s0: 100.55,  target: 100.56,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b12-week-msft',  s0: 395.0,   target: 405.0,   stop: 380.0,   annVol: 0.28, annDrift: 0.16, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b12-week-xom',   s0: 146.0,   target: 152.0,   stop: 140.0,   annVol: 0.32, annDrift: 0.22, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b12-week-ko',    s0: 81.0,    target: 83.4,    stop: 77.5,    annVol: 0.16, annDrift: 0.15, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b12-month-samsung', s0: 260000, target: 295000, stop: 233000, annVol: 0.50, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b12-month-nvda', s0: 200.0,   target: 222.0,   stop: 179.0,   annVol: 0.50, annDrift: 0.25, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b12-month-msft', s0: 395.0,   target: 420.0,   stop: 368.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b12-long-msft',  s0: 395.0,   target: 530.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b12-long-samsung', s0: 260000, target: 420000, stop: 208000,  annVol: 0.40, annDrift: 0.22, kind: 'long', model: 't' },
  { id: 'b12-long-nvda',  s0: 200.0,   target: 275.0,   stop: 148.0,   annVol: 0.45, annDrift: 0.25, kind: 'long', model: 't' },

  // -- batch-2026-07-21 (v3.2 high-probability precision calibration -- 7/20 close basis, day=7/21 Tue) --
  { id: 'b13-day-kofr',   s0: 112005,  target: 112011,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b13-day-sgov',   s0: 100.57,  target: 100.58,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b13-day-ko',     s0: 81.50,   target: 81.66,   stop: 78.00,   annVol: 0.15, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b13-week-sgov',  s0: 100.57,  target: 100.61,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b13-week-kofr',  s0: 112005,  target: 112040,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b13-week-ko',    s0: 81.50,   target: 81.95,   stop: 77.50,   annVol: 0.16, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b13-month-sgov', s0: 100.57,  target: 100.70,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b13-month-ko',   s0: 81.50,   target: 83.10,   stop: 76.00,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b13-month-msft', s0: 394.0,   target: 402.0,   stop: 355.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b13-long-sgov',  s0: 100.57,  target: 101.30,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b13-long-ko',    s0: 81.50,   target: 83.50,   stop: 74.00,   annVol: 0.16, annDrift: 0.14, kind: 'long', model: 't' },
  { id: 'b13-long-msft',  s0: 394.0,   target: 415.0,   stop: 340.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },

  // -- batch-2026-07-23 (v3.2 precision -- 7/23 close basis, day=7/24 Fri, risk-off: AI capex fears + oil surge) --
  { id: 'b14-day-kofr',   s0: 112010,  target: 112016,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b14-day-sgov',   s0: 100.58,  target: 100.59,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b14-day-ko',     s0: 82.00,   target: 82.16,   stop: 78.50,   annVol: 0.15, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b14-week-sgov',  s0: 100.58,  target: 100.62,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b14-week-kofr',  s0: 112010,  target: 112045,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b14-week-ko',    s0: 82.00,   target: 82.45,   stop: 78.00,   annVol: 0.16, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b14-month-sgov', s0: 100.58,  target: 100.71,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b14-month-xom',  s0: 149.0,   target: 153.0,   stop: 134.0,   annVol: 0.32, annDrift: 0.22, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b14-month-ko',   s0: 82.00,   target: 83.65,   stop: 76.50,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b14-long-ko',    s0: 82.00,   target: 84.05,   stop: 74.50,   annVol: 0.16, annDrift: 0.14, kind: 'long', model: 't' },
  { id: 'b14-long-msft',  s0: 384.0,   target: 404.0,   stop: 330.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b14-long-sgov',  s0: 100.58,  target: 101.30,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },

  // -- batch-2026-07-27 (v3.2 precision -- 7/24 close basis, day=7/27 Mon, earnings week: KO 7/28, MSFT/삼성/FOMC 7/29) --
  { id: 'b15-day-kofr',   s0: 112015,  target: 112021,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b15-day-sgov',   s0: 100.59,  target: 100.60,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b15-day-ko',     s0: 82.25,   target: 82.41,   stop: 78.70,   annVol: 0.15, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b15-week-sgov',  s0: 100.59,  target: 100.63,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b15-week-kofr',  s0: 112015,  target: 112050,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b15-week-ko',    s0: 82.25,   target: 82.70,   stop: 78.20,   annVol: 0.16, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b15-month-sgov', s0: 100.59,  target: 100.72,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b15-month-xom',  s0: 156.0,   target: 160.2,   stop: 140.4,   annVol: 0.32, annDrift: 0.20, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b15-month-ko',   s0: 82.25,   target: 83.90,   stop: 76.70,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b15-long-ko',    s0: 82.25,   target: 84.30,   stop: 74.80,   annVol: 0.16, annDrift: 0.14, kind: 'long', model: 't' },
  { id: 'b15-long-msft',  s0: 381.0,   target: 401.0,   stop: 328.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b15-long-sgov',  s0: 100.59,  target: 101.32,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },

  // -- batch-2026-07-28 (v3.2 -- 7/27 close, day=7/28 Tue; KO excluded from day (7/28 pre-open earnings), JNJ substitute; XOM dropped (oil momentum faded)) --
  { id: 'b16-day-kofr',   s0: 112020,  target: 112026,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b16-day-sgov',   s0: 100.60,  target: 100.61,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b16-day-jnj',    s0: 258.0,   target: 258.52,  stop: 246.9,   annVol: 0.14, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b16-week-sgov',  s0: 100.60,  target: 100.64,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b16-week-kofr',  s0: 112020,  target: 112055,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b16-week-jnj',   s0: 258.0,   target: 259.42,  stop: 245.1,   annVol: 0.15, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b16-month-sgov', s0: 100.60,  target: 100.73,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b16-month-msft', s0: 380.0,   target: 387.6,   stop: 351.0,   annVol: 0.27, annDrift: 0.18, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b16-month-ko',   s0: 83.50,   target: 85.17,   stop: 77.90,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b16-long-ko',    s0: 83.50,   target: 85.59,   stop: 76.00,   annVol: 0.16, annDrift: 0.14, kind: 'long', model: 't' },
  { id: 'b16-long-msft',  s0: 380.0,   target: 400.0,   stop: 327.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b16-long-sgov',  s0: 100.60,  target: 101.33,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },

  // -- batch-2026-07-29 (v3.2 -- 7/28 close, day=7/29 Wed = FOMC + MSFT/삼성 실적 초이벤트일; 주식 당일 축소, JNJ는 FOMC 전 오전 청산; KO는 실적 +6% 후 새 기준) --
  { id: 'b17-day-kofr',   s0: 112025,  target: 112031,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b17-day-sgov',   s0: 100.61,  target: 100.62,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b17-day-jnj',    s0: 259.0,   target: 259.52,  stop: 247.9,   annVol: 0.14, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b17-week-sgov',  s0: 100.61,  target: 100.65,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b17-week-kofr',  s0: 112025,  target: 112060,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b17-week-jnj',   s0: 259.0,   target: 260.42,  stop: 246.1,   annVol: 0.15, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b17-month-sgov', s0: 100.61,  target: 100.74,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b17-month-jnj',  s0: 259.0,   target: 264.2,   stop: 241.0,   annVol: 0.15, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b17-month-ko',   s0: 87.50,   target: 89.25,   stop: 81.50,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b17-long-ko',    s0: 87.50,   target: 89.69,   stop: 79.60,   annVol: 0.16, annDrift: 0.13, kind: 'long', model: 't' },
  { id: 'b17-long-msft',  s0: 381.0,   target: 401.0,   stop: 328.0,   annVol: 0.27, annDrift: 0.18, kind: 'long', model: 't' },
  { id: 'b17-long-sgov',  s0: 100.61,  target: 101.34,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },

  // 레짐: 7/29 매파적 동결 급락(다우 -2.19% 4월來 최악·나스닥 조정권) 후 7/30 선물 소폭 반등(MSFT 실적 서프라이즈 견인).
  // 리스크오프 유지·완만한 안도랠 시도 → 파킹 중심+저변동 방어주(JNJ·KO)만. MSFT는 실적 갭업·가격 불확실로 이번 배치 제외. volX 1.3(당일·1주)/1.2(1개월)
  { id: 'b18-day-kofr',   s0: 112030,  target: 112036,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b18-day-sgov',   s0: 100.62,  target: 100.63,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b18-day-jnj',    s0: 266.73,  target: 267.26,  stop: 255.0,   annVol: 0.13, annDrift: 0.12, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b18-week-sgov',  s0: 100.62,  target: 100.66,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b18-week-kofr',  s0: 112030,  target: 112065,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b18-week-jnj',   s0: 266.73,  target: 268.20,  stop: 253.5,   annVol: 0.14, annDrift: 0.12, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b18-month-sgov', s0: 100.62,  target: 100.75,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b18-month-jnj',  s0: 266.73,  target: 272.10,  stop: 248.5,   annVol: 0.14, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b18-month-ko',   s0: 87.00,   target: 88.74,   stop: 81.00,   annVol: 0.16, annDrift: 0.14, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b18-long-sgov',  s0: 100.62,  target: 101.35,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b18-long-ko',    s0: 87.00,   target: 89.18,   stop: 79.00,   annVol: 0.16, annDrift: 0.13, kind: 'long', model: 't' },
  { id: 'b18-long-jnj',   s0: 266.73,  target: 274.00,  stop: 245.0,   annVol: 0.14, annDrift: 0.13, kind: 'long', model: 't' },

  // 레짐: 7/30 강한 반등(S&P +1.7%·나스닥 +2.8%·MSFT +16% 사상 최대 시총 증가) 후 7/31. 다만 Fed "인플레 뒤처짐" + 고용 둔화 신호로 매크로 불확실.
  // JNJ는 7/30 소송(talc $5.5B 합의 불확실)+딜 희석으로 -3.49% 급락 → 당일 세트에서 제외. MSFT는 +16% 급등으로 추격 위험 → 장기만 미편입.
  // 파킹(SGOV·KOFR) 중심 + 클린 방어주 KO. JNJ는 장기 1종만 저확신·소송 리스크 명시. volX 1.3(당일·1주)/1.2(1개월)
  { id: 'b19-day-kofr',   s0: 112035,  target: 112041,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b19-day-sgov',   s0: 100.63,  target: 100.64,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b19-day-ko',     s0: 88.52,   target: 88.70,   stop: 84.50,   annVol: 0.16, annDrift: 0.13, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b19-week-sgov',  s0: 100.63,  target: 100.67,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b19-week-kofr',  s0: 112035,  target: 112070,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b19-week-ko',    s0: 88.52,   target: 89.01,   stop: 85.00,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b19-month-sgov', s0: 100.63,  target: 100.76,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b19-month-kofr', s0: 112035,  target: 112180,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'month', model: 't' },
  { id: 'b19-month-ko',   s0: 88.52,   target: 90.29,   stop: 82.50,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b19-long-sgov',  s0: 100.63,  target: 101.36,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b19-long-ko',    s0: 88.52,   target: 90.73,   stop: 80.50,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  { id: 'b19-long-jnj',   s0: 257.50,  target: 264.40,  stop: 236.0,   annVol: 0.18, annDrift: 0.10, kind: 'long', model: 't' },

  // 레짐: 7/31 리스크온(아마존 실적 서프라이즈·다우 4개월 연속 상승)에 방어주 KO -1.02% → 당일 단일 종목 2연패(JNJ 7/30·KO 7/31).
  // 교훈 23: 당일 세트의 단일 종목 슬롯을 폐지하고 파킹 전용(KOFR·SGOV·BIL)으로 전환. KO는 1주+ 방어로만. 8/3(월) 특별 이벤트 없음·8월 계절성 약세. volX 1.3(당일·1주)/1.2(1개월)
  { id: 'b20-day-kofr',   s0: 112040,  target: 112046,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b20-day-sgov',   s0: 100.64,  target: 100.65,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b20-day-bil',    s0: 91.68,   target: 91.69,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b20-week-sgov',  s0: 100.64,  target: 100.68,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b20-week-kofr',  s0: 112040,  target: 112075,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b20-week-ko',    s0: 87.59,   target: 88.07,   stop: 84.00,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b20-month-sgov', s0: 100.64,  target: 100.77,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b20-month-bil',  s0: 91.68,   target: 91.80,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b20-month-ko',   s0: 87.59,   target: 89.34,   stop: 81.50,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b20-long-sgov',  s0: 100.64,  target: 101.37,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b20-long-kofr',  s0: 112040,  target: 112600,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b20-long-ko',    s0: 87.59,   target: 89.78,   stop: 79.50,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },

  // 레짐: 8/3 강한 리스크온(다우 사상 최고 53,178·S&P +1.48%·나스닥 +2.1%, 이란 긴장완화로 유가 하락+빅테크). 파킹 당일 3종 성공.
  // v3.3 유지: 당일 파킹 전용(단일 종목 슬롯은 폐지 후 1일 — 리짐 아닌 구조적 결정이라 일관 유지). KO는 8/3 종가 미확인이라 7/31 종가 기준 근사. 8월 계절성 약세·8/7 고용보고서. volX 1.3(당일·1주)/1.2(1개월)
  { id: 'b21-day-kofr',   s0: 112045,  target: 112051,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b21-day-sgov',   s0: 100.65,  target: 100.66,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b21-day-bil',    s0: 91.69,   target: 91.70,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b21-week-sgov',  s0: 100.65,  target: 100.69,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b21-week-kofr',  s0: 112045,  target: 112080,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b21-week-ko',    s0: 87.60,   target: 88.08,   stop: 84.00,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b21-month-sgov', s0: 100.65,  target: 100.78,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b21-month-bil',  s0: 91.69,   target: 91.81,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b21-month-ko',   s0: 87.60,   target: 89.35,   stop: 81.50,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b21-long-sgov',  s0: 100.65,  target: 101.38,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b21-long-kofr',  s0: 112045,  target: 112605,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b21-long-ko',    s0: 87.60,   target: 89.79,   stop: 79.50,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },

  // 레짐: 8/4 기록적 리스크온(S&P 7,737 사상최고·다우 54,086 첫 5.4만 돌파·나스닥 +2.59%). 파킹 당일 3종 성공(누적 파킹 18/18).
  // v3.3 유지: 당일 파킹 전용. KO는 8/4 종가 $86.56로 검증(멜트업에 방어주 계속 소외). 리스크온·8월 변동성 완화(Citadel) 감안 volX 1.2(1주)/1.1(1개월)로 소폭 완화. 8/7 고용보고서.
  { id: 'b22-day-kofr',   s0: 112050,  target: 112056,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b22-day-sgov',   s0: 100.66,  target: 100.67,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b22-day-bil',    s0: 91.70,   target: 91.71,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b22-week-sgov',  s0: 100.66,  target: 100.70,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b22-week-kofr',  s0: 112050,  target: 112085,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b22-week-ko',    s0: 86.56,   target: 87.04,   stop: 83.00,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b22-month-sgov', s0: 100.66,  target: 100.79,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b22-month-bil',  s0: 91.70,   target: 91.82,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b22-month-ko',   s0: 86.56,   target: 88.29,   stop: 80.50,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b22-long-sgov',  s0: 100.66,  target: 101.39,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b22-long-kofr',  s0: 112050,  target: 112610,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b22-long-ko',    s0: 86.56,   target: 88.72,   stop: 78.50,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },

  // 레짐: 8/5 로테이션일(다우 +0.5% 사상최고 54,349·5일 연속↑, S&P -0.2%·나스닥 -0.8% 4일랠리 마감). 성장→가치/방어 순환에 KO $86.85로 소폭 반등.
  // v3.3 유지: 당일 파킹 전용(파킹 누적 21/21). 로테이션이 방어주(KO)엔 우호적. 리스크오프 아님 → KO volX 1.2(1주)/1.1(1개월). 8/7 고용보고서.
  { id: 'b23-day-kofr',   s0: 112055,  target: 112061,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b23-day-sgov',   s0: 100.67,  target: 100.68,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b23-day-bil',    s0: 91.71,   target: 91.72,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b23-week-sgov',  s0: 100.67,  target: 100.71,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b23-week-kofr',  s0: 112055,  target: 112090,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b23-week-ko',    s0: 86.85,   target: 87.33,   stop: 83.20,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b23-month-sgov', s0: 100.67,  target: 100.80,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b23-month-bil',  s0: 91.71,   target: 91.83,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b23-month-ko',   s0: 86.85,   target: 88.59,   stop: 80.80,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.1 },
  { id: 'b23-long-sgov',  s0: 100.67,  target: 101.40,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b23-long-kofr',  s0: 112055,  target: 112615,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b23-long-ko',    s0: 86.85,   target: 89.02,   stop: 78.80,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },

  // 레짐: 8/6 소폭 조정(다우 -0.85% 53,885 기록행진 마감·S&P -0.18%·나스닥 -0.06%, 유가↑·국채금리↑·고용보고서 대기). KO $86.59 보합.
  // v3.3 유지: 당일 파킹 전용(파킹 누적 24/24). ★8/7 미 7월 고용보고서(컨센 +8.5만·실업 4.2%)가 최대 이벤트 → 이벤트 리스크로 KO volX 1.3(1주)/1.2(1개월)로 상향. 당일 파킹은 이벤트 무관.
  { id: 'b24-day-kofr',   s0: 112060,  target: 112066,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b24-day-sgov',   s0: 100.68,  target: 100.69,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b24-day-bil',    s0: 91.72,   target: 91.73,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b24-week-sgov',  s0: 100.68,  target: 100.72,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b24-week-kofr',  s0: 112060,  target: 112095,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b24-week-ko',    s0: 86.59,   target: 87.07,   stop: 83.20,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b24-month-sgov', s0: 100.68,  target: 100.81,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b24-month-bil',  s0: 91.72,   target: 91.84,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b24-month-ko',   s0: 86.59,   target: 88.32,   stop: 80.80,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b24-long-sgov',  s0: 100.68,  target: 101.41,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b24-long-kofr',  s0: 112060,  target: 112620,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b24-long-ko',    s0: 86.59,   target: 88.75,   stop: 78.80,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  { id: 'b25-day-kofr',   s0: 112080,  target: 112086,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b25-day-sgov',   s0: 100.48,  target: 100.49,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b25-day-bil',    s0: 91.45,   target: 91.46,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b25-week-sgov',  s0: 100.48,  target: 100.52,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b25-week-kofr',  s0: 112080,  target: 112115,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b25-week-ko',    s0: 87.05,   target: 87.53,   stop: 83.60,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b25-month-sgov', s0: 100.48,  target: 100.61,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b25-month-bil',  s0: 91.45,   target: 91.57,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b25-month-ko',   s0: 87.05,   target: 88.79,   stop: 81.20,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b25-long-sgov',  s0: 100.48,  target: 101.21,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b25-long-kofr',  s0: 112080,  target: 112640,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b25-long-ko',    s0: 87.05,   target: 89.22,   stop: 79.20,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  { id: 'b26-day-kofr',   s0: 112090,  target: 112096,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b26-day-sgov',   s0: 100.49,  target: 100.50,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b26-day-bil',    s0: 91.46,   target: 91.47,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b26-week-sgov',  s0: 100.49,  target: 100.53,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b26-week-kofr',  s0: 112090,  target: 112125,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b26-week-ko',    s0: 87.10,   target: 87.58,   stop: 83.65,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b26-month-sgov', s0: 100.49,  target: 100.62,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b26-month-bil',  s0: 91.46,   target: 91.58,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b26-month-ko',   s0: 87.10,   target: 88.84,   stop: 81.25,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b26-long-sgov',  s0: 100.49,  target: 101.22,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b26-long-kofr',  s0: 112090,  target: 112650,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b26-long-ko',    s0: 87.10,   target: 89.28,   stop: 79.25,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  { id: 'b27-day-kofr',   s0: 112100,  target: 112106,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b27-day-sgov',   s0: 100.50,  target: 100.51,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b27-day-bil',    s0: 91.47,   target: 91.48,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b27-week-sgov',  s0: 100.50,  target: 100.54,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b27-week-kofr',  s0: 112100,  target: 112135,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b27-week-ko',    s0: 86.29,   target: 86.76,   stop: 82.85,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b27-month-sgov', s0: 100.50,  target: 100.63,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b27-month-bil',  s0: 91.47,   target: 91.59,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b27-month-ko',   s0: 86.29,   target: 88.02,   stop: 80.50,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b27-long-sgov',  s0: 100.50,  target: 101.23,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b27-long-kofr',  s0: 112100,  target: 112660,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b27-long-ko',    s0: 86.29,   target: 88.45,   stop: 78.50,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  { id: 'b28-day-kofr',   s0: 112110,  target: 112116,  stop: 111500,  annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b28-day-sgov',   s0: 100.51,  target: 100.52,  stop: 100.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b28-day-bil',    s0: 91.48,   target: 91.49,   stop: 91.0,    annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b28-week-sgov',  s0: 100.51,  target: 100.55,  stop: 99.8,    annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b28-week-kofr',  s0: 112110,  target: 112145,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b28-week-ko',    s0: 86.67,   target: 87.15,   stop: 83.60,   annVol: 0.16, annDrift: 0.13, kind: 'week', model: 't' },
  { id: 'b28-month-sgov', s0: 100.51,  target: 100.64,  stop: 99.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b28-month-bil',  s0: 91.48,   target: 91.60,   stop: 90.5,    annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b28-month-ko',   s0: 86.67,   target: 88.40,   stop: 80.85,   annVol: 0.16, annDrift: 0.13, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b28-long-sgov',  s0: 100.51,  target: 101.24,  stop: 99.0,    annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b28-long-kofr',  s0: 112110,  target: 112670,  stop: 111000,  annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b28-long-ko',    s0: 86.67,   target: 88.84,   stop: 78.85,   annVol: 0.16, annDrift: 0.12, kind: 'long', model: 't' },
  // ── 실제 주식 세트 (파킹 아님). 기준가는 2026-08-12 종가를 2개 이상 날짜 명시 소스로 직접 교차 확인.
  //    드리프트는 과장을 피해 보수적으로 둡니다(광범위 ETF 0.07~0.08, 개별주 0.08~0.12).
  { id: 'b28-stk-day-voo',   s0: 710.31, target: 713.86, stop: 699.66, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't' },
  { id: 'b28-stk-week-schd', s0: 34.19,  target: 34.50,  stop: 33.16,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't' },
  { id: 'b28-stk-week-nvda', s0: 224.09, target: 230.81, stop: 210.64, annVol: 0.45, annDrift: 0.12, kind: 'week', model: 't' },
  { id: 'b28-stk-month-voo', s0: 710.31, target: 724.52, stop: 674.79, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b28-stk-month-msft',s0: 492.43, target: 507.20, stop: 453.04, annVol: 0.32, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b28-stk-long-schd', s0: 34.19,  target: 35.90,  stop: 30.09,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // 당일 실제 주식 3종 구성을 위해 저변동 ETF 2종 추가(이익확률은 변동성이 낮을수록 높습니다).
  { id: 'b28-stk-day-schd',  s0: 34.19,  target: 34.33,  stop: 33.78,  annVol: 0.13, annDrift: 0.07, kind: 'day', model: 't' },
  { id: 'b28-stk-day-spy',   s0: 772.58, target: 776.06, stop: 762.54, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't' },
  // ── batch-2026-08-14 (8/14 금) · 기준가는 8/13 종가를 장중 레인지까지 확인해 사용 ──
  { id: 'b29-day-kofr',      s0: 112120, target: 112126, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b29-day-sgov',      s0: 100.52, target: 100.53, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b29-day-bil',       s0: 91.49,  target: 91.50,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b29-stk-day-schd',  s0: 34.35,  target: 34.49,  stop: 33.94,  annVol: 0.13, annDrift: 0.07, kind: 'day', model: 't' },
  { id: 'b29-stk-day-voo',   s0: 713.33, target: 716.54, stop: 704.06, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't' },
  { id: 'b29-stk-day-spy',   s0: 777.42, target: 780.92, stop: 767.31, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't' },
  { id: 'b29-week-sgov',     s0: 100.52, target: 100.56, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b29-week-kofr',     s0: 112120, target: 112155, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b29-stk-week-schd', s0: 34.35,  target: 34.66,  stop: 33.32,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't' },
  { id: 'b29-month-sgov',    s0: 100.52, target: 100.65, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b29-month-bil',     s0: 91.49,  target: 91.61,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b29-stk-month-voo', s0: 713.33, target: 727.60, stop: 677.66, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b29-long-sgov',     s0: 100.52, target: 101.25, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b29-long-kofr',     s0: 112120, target: 112680, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b29-stk-long-schd', s0: 34.35,  target: 36.07,  stop: 30.23,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-17 (v4 2회차 · 기준가 8/14 종가) — 뒤에 추가해 기존 seed 유지 ──
  // 회고 표본 12건으로 여전히 부족 → annVol/annDrift 가정은 변경하지 않음.
  // 레짐: 리스크오프 아님(지수 사상최고 부근·3주 연속 주간 상승). 당일·1주 volX 없음.
  // 1개월은 잭슨홀(8/27~29, 신임 의장 첫 기조연설)·엔비디아 실적·9월 FOMC가 구간에 들어와 volX 1.2.
  // IWM(러셀2000)은 새 노출 — 소형주 연 변동성 22%/기대수익 9% (장기 실적 기준, 부풀리지 않음)
  { id: 'b30-day-kofr',      s0: 112128, target: 112134, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't' },
  { id: 'b30-day-sgov',      s0: 100.55, target: 100.56, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b30-day-bil',       s0: 91.51,  target: 91.52,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't' },
  { id: 'b30-stk-day-spy',   s0: 776.34, target: 780.00, stop: 766.25, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't' },
  { id: 'b30-stk-day-schd',  s0: 34.52,  target: 34.66,  stop: 34.11,  annVol: 0.13, annDrift: 0.07, kind: 'day', model: 't' },
  { id: 'b30-stk-day-iwm',   s0: 305.09, target: 307.19, stop: 299.60, annVol: 0.22, annDrift: 0.09, kind: 'day', model: 't' },
  { id: 'b30-week-sgov',     s0: 100.55, target: 100.59, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't' },
  { id: 'b30-week-kofr',     s0: 112128, target: 112163, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't' },
  { id: 'b30-stk-week-schd', s0: 34.52,  target: 34.83,  stop: 33.48,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't' },
  { id: 'b30-month-sgov',    s0: 100.55, target: 100.68, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b30-month-bil',     s0: 91.51,  target: 91.63,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't' },
  { id: 'b30-stk-month-spy', s0: 776.34, target: 792.00, stop: 737.50, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b30-long-sgov',     s0: 100.55, target: 101.28, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b30-long-kofr',     s0: 112128, target: 112690, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b30-stk-long-schd', s0: 34.52,  target: 36.25,  stop: 30.40,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-18 (v4 3회차 · 기준가 8/17 종가) — 뒤에 추가해 기존 seed 유지 ──
  // 회고 표본 17건, 구간당 최대 5건으로 여전히 부족 → annVol/annDrift 가정 변경 없음.
  // 레짐: 리스크오프. 8/17 미·이란 긴장 재점화로 유가·국채금리 급등(30년물 수십 년 최고),
  // 4대 지수 동반 하락 → 규칙대로 volX 1.3(당일·1주)/1.2(1개월) 적용. 고베타(연 50%↑) 편성 없음.
  { id: 'b31-day-kofr',      s0: 112150, target: 112156, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-day-sgov',      s0: 100.57, target: 100.58, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-day-bil',       s0: 91.53,  target: 91.54,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-stk-day-spy',   s0: 772.28, target: 777.00, stop: 759.15, annVol: 0.15, annDrift: 0.08, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-stk-day-schd',  s0: 34.30,  target: 34.48,  stop: 33.79,  annVol: 0.13, annDrift: 0.07, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-stk-day-iwm',   s0: 304.06, target: 306.80, stop: 297.07, annVol: 0.22, annDrift: 0.09, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b31-week-sgov',     s0: 100.57, target: 100.61, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b31-week-kofr',     s0: 112150, target: 112185, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b31-stk-week-schd', s0: 34.30,  target: 34.70,  stop: 32.96,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b31-month-sgov',    s0: 100.57, target: 100.70, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b31-month-bil',     s0: 91.53,  target: 91.65,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b31-stk-month-spy', s0: 772.28, target: 790.80, stop: 725.94, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b31-long-sgov',     s0: 100.57, target: 101.30, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b31-long-kofr',     s0: 112150, target: 112715, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b31-stk-long-schd', s0: 34.30,  target: 36.02,  stop: 30.20,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-19 (v4 4회차 · 기준가 8/18 종가) — 뒤에 추가해 기존 seed 유지 ──
  // 회고 표본 23건, 구간당 최대 8건이나 가중 격차가 기준(±7%p) 이내 → annVol/annDrift 변경 없음.
  // 회고 조치 반영: SPY는 당일 슬롯 1승 2패(33%)로 오늘 당일에서 제외하고 1개월에만 유지.
  // 레짐: 리스크오프 지속(S&P 3일 연속 하락·30년물 금리 20년 최고·AI/반도체 매도) → volX 1.3/1.2.
  // XLE는 유가 급등 요인에 반대로 반응하는 자리 — 세 종목의 거시 논리를 서로 다르게 하기 위한 편성(교훈 26).
  { id: 'b32-day-kofr',      s0: 112159, target: 112165, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-day-sgov',      s0: 100.59, target: 100.60, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-day-bil',       s0: 91.55,  target: 91.56,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-stk-day-schd',  s0: 34.55,  target: 34.73,  stop: 34.03,  annVol: 0.13, annDrift: 0.07, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-stk-day-xle',   s0: 63.68,  target: 64.41,  stop: 61.83,  annVol: 0.28, annDrift: 0.08, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-stk-day-iwm',   s0: 301.06, target: 303.77, stop: 294.14, annVol: 0.22, annDrift: 0.09, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b32-week-sgov',     s0: 100.59, target: 100.63, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b32-week-kofr',     s0: 112159, target: 112194, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b32-stk-week-schd', s0: 34.55,  target: 34.95,  stop: 33.20,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b32-month-sgov',    s0: 100.59, target: 100.72, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b32-month-bil',     s0: 91.55,  target: 91.67,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b32-stk-month-spy', s0: 766.97, target: 785.40, stop: 720.95, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b32-long-sgov',     s0: 100.59, target: 101.32, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b32-long-kofr',     s0: 112159, target: 112725, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b32-stk-long-schd', s0: 34.55,  target: 36.28,  stop: 30.40,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-20 (v4 5회차 · 기준가 8/19 종가) — 뒤에 추가해 기존 seed 유지 ──
  // ★모델 v3.4: 회고 캘리브레이션이 처음으로 기준을 넘었습니다(0~50% 구간 예측 48.7% vs 실제 40%,
  //   가중 격차 -8.7%p, 표본 10건). 조치로 '당일' 실제 주식의 annDrift를 0으로 낮춥니다 —
  //   하루 단위에서 주식 위험프리미엄(연 7~9% → 하루 0.03%)은 잡음보다 훨씬 작은데도
  //   모든 당일 카드의 목표 도달 확률을 체계적으로 위로 밀어 올리기 때문입니다.
  //   annVol은 올리지 않습니다 — 배리어 터치형 목표에서는 변동성을 키우면 도달 확률이 오히려 올라가
  //   격차가 더 벌어집니다(회고 스크립트의 일반 제안은 기간에 따라 방향이 다릅니다).
  //   1주·1개월·장기의 드리프트는 그대로 둡니다(그 구간에서는 프리미엄이 잡음 대비 의미가 있습니다).
  // 회고 조치 반영: IWM은 당일 0승 3패이고, 8/19에는 전제(금리 하락)가 실제로 실현됐는데도
  //   러셀2000이 -1.30%로 빠져 논리 자체가 반증됐습니다 → SPY에 이어 IWM도 당일 슬롯에서 제외.
  // 레짐: 급성 리스크오프는 해소(국채 바이백으로 금리 급락·3일 연속 하락 마감) 그러나 의사록이
  //   매파(3명 인상 소수의견)이고 8/27~29 잭슨홀이 남아 volX 1.2로 완화 적용(당일·1주·1개월).
  { id: 'b33-day-kofr',      s0: 112167, target: 112173, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-day-sgov',      s0: 100.61, target: 100.62, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-day-bil',       s0: 91.57,  target: 91.58,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-stk-day-schd',  s0: 35.08,  target: 35.25,  stop: 34.59,  annVol: 0.13, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-stk-day-dia',   s0: 535.39, target: 538.23, stop: 527.36, annVol: 0.14, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-stk-day-xle',   s0: 63.65,  target: 64.32,  stop: 61.93,  annVol: 0.28, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b33-week-sgov',     s0: 100.61, target: 100.65, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b33-week-kofr',     s0: 112167, target: 112202, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b33-stk-week-schd', s0: 35.08,  target: 35.46,  stop: 33.82,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't', volX: 1.2 },
  { id: 'b33-month-sgov',    s0: 100.61, target: 100.74, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b33-month-bil',     s0: 91.57,  target: 91.69,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b33-stk-month-spy', s0: 768.59, target: 787.00, stop: 722.47, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b33-long-sgov',     s0: 100.61, target: 101.34, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b33-long-kofr',     s0: 112167, target: 112733, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b33-stk-long-schd', s0: 35.08,  target: 36.83,  stop: 30.87,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-21 (v4 6회차 · 기준가 8/20 종가) — 뒤에 추가해 기존 seed 유지 ──
  // 회고: 캘리브레이션 -10.1%p 경고는 전부 v3.4 이전 예측에서 나온 표본이라 이번엔 추가 조정하지 않음
  //   (같은 증거로 두 번 조정하지 않는다 — v3.4 이후 표본이 쌓인 뒤 다시 판단).
  // 레짐: 리스크오프 재점화 — 국채 바이백 랠리 하루 만에 소멸(금리 재상승), WTI +6% $91.94(장중 $100 터치),
  //   다우 -1.32%(월마트 급락)·4대 지수 동반 하락 → volX 1.3(당일·1주)/1.2(1개월).
  // XLE는 8/20 종가를 2개 소스로 확정하지 못해 오늘 편성 제외(채점도 보류). XLV(헬스케어)로 대체 —
  //   방어 섹터 + 이번 주 신약 뉴스 흐름, annVol 0.16(섹터 ETF · 최근 모더나발 변동 확대 반영).
  { id: 'b34-day-kofr',      s0: 112175, target: 112181, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-day-sgov',      s0: 100.63, target: 100.64, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-day-bil',       s0: 91.59,  target: 91.60,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-stk-day-schd',  s0: 34.87,  target: 35.05,  stop: 34.35,  annVol: 0.13, annDrift: 0.0, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-stk-day-dia',   s0: 527.99, target: 531.00, stop: 519.54, annVol: 0.14, annDrift: 0.0, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-stk-day-xlv',   s0: 173.46, target: 174.59, stop: 170.34, annVol: 0.16, annDrift: 0.0, kind: 'day', model: 't', volX: 1.3 },
  { id: 'b34-week-sgov',     s0: 100.63, target: 100.67, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b34-week-kofr',     s0: 112175, target: 112210, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b34-stk-week-schd', s0: 34.87,  target: 35.29,  stop: 33.51,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b34-month-sgov',    s0: 100.63, target: 100.76, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b34-month-bil',     s0: 91.59,  target: 91.71,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b34-stk-month-spy', s0: 761.93, target: 780.20, stop: 716.20, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b34-long-sgov',     s0: 100.63, target: 101.36, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b34-long-kofr',     s0: 112175, target: 112741, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b34-stk-long-schd', s0: 34.87,  target: 36.61,  stop: 30.69,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
  // ── 배치 2026-08-25주 월요일 (v4 7회차 · 기준가 8/21 종가) — 뒤에 추가해 기존 seed 유지 ──
  // 회고: 가중 캘리브레이션 격차 -1.9%p로 기준(±7%p) 이내 → 모델 무변경. v3.4 이후 채점 표본 5건(<8)이라
  //   당일 드리프트 수정의 효과 판정도 보류. stock/day 손실 집중은 구조적 지표(교훈 25)라 유지.
  // 레짐: 8/21 리스크온 반등(다우 +0.98%·4대 지수 상승, 기업활동 4년래 최고) → 당일 volX 1.2로 완화.
  //   단 이번 주 안에 엔비디아 실적(8/26)·잭슨홀 기조연설(8/28)이 있어 1주는 1.3, 1개월은 1.2 유지.
  // XLE 복귀: 8/21 종가 $63.64(-0.17%)가 등락률·전일 범위와 산술 일치로 확인돼 시세 품질 조건 충족.
  //   XLV는 8/21 소스가 상충(-1.9% vs 강세)해 기준가 확정 불가 → 오늘 제외.
  { id: 'b35-day-kofr',      s0: 112199, target: 112205, stop: 111500, annVol: 0.0005, annDrift: 0.025, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-day-sgov',      s0: 100.66, target: 100.67, stop: 100.0,  annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-day-bil',       s0: 91.62,  target: 91.63,  stop: 91.0,   annVol: 0.0008, annDrift: 0.036, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-stk-day-schd',  s0: 35.11,  target: 35.28,  stop: 34.62,  annVol: 0.13, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-stk-day-dia',   s0: 533.17, target: 536.00, stop: 525.17, annVol: 0.14, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-stk-day-xle',   s0: 63.64,  target: 64.31,  stop: 61.92,  annVol: 0.28, annDrift: 0.0, kind: 'day', model: 't', volX: 1.2 },
  { id: 'b35-week-sgov',     s0: 100.66, target: 100.70, stop: 99.8,   annVol: 0.0008, annDrift: 0.036, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b35-week-kofr',     s0: 112199, target: 112234, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b35-stk-week-schd', s0: 35.11,  target: 35.53,  stop: 33.74,  annVol: 0.13, annDrift: 0.07, kind: 'week', model: 't', volX: 1.3 },
  { id: 'b35-month-sgov',    s0: 100.66, target: 100.79, stop: 99.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b35-month-bil',     s0: 91.62,  target: 91.74,  stop: 90.5,   annVol: 0.0008, annDrift: 0.036, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b35-stk-month-spy', s0: 765.24, target: 783.60, stop: 719.30, annVol: 0.15, annDrift: 0.08, kind: 'month', model: 't', volX: 1.2 },
  { id: 'b35-long-sgov',     s0: 100.66, target: 101.39, stop: 99.0,   annVol: 0.0008, annDrift: 0.036, kind: 'long', model: 't' },
  { id: 'b35-long-kofr',     s0: 112199, target: 112765, stop: 111000, annVol: 0.0005, annDrift: 0.025, kind: 'long', model: 't' },
  { id: 'b35-stk-long-schd', s0: 35.11,  target: 36.87,  stop: 30.90,  annVol: 0.13, annDrift: 0.07, kind: 'long', model: 't' },
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
