#!/usr/bin/env node
/**
 * 자동 학습 회고 분석기 (retrospect)
 *
 * 매일 아침 갱신 루틴이 새 추천을 만들기 전에 실행합니다.
 * 지금까지 쌓인 채점 기록(outcomes.records)을 전부 훑어서
 * "어디서 반복적으로 틀렸는가"를 사람이 아니라 숫자로 뽑아냅니다.
 *
 * 핵심 산출물은 캘리브레이션입니다. 시뮬레이터가 "목표 도달 90%"라고 말한 카드들이
 * 실제로 90% 근처에서 성공했는지를 확률 구간별로 비교합니다.
 * 실제가 예측보다 꾸준히 낮으면 모델이 과신하고 있다는 뜻이고,
 * 그때 고쳐야 하는 것은 개별 종목 선택이 아니라 변동성·드리프트 가정입니다.
 *
 *   node scripts/retrospect.mjs           사람이 읽는 리포트
 *   node scripts/retrospect.mjs --json    기계가 읽는 JSON (루틴이 파싱)
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

// ── 데이터 적재 ───────────────────────────────────────────────
function loadReco() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), ctx);
  return ctx.window.RECO;
}
function loadSim() {
  const raw = fs.readFileSync(path.join(ROOT, 'data/sim.json'), 'utf8');
  return JSON.parse(raw);
}

const PARKING_TICKERS = new Set(['423160.KS', 'SGOV', 'BIL', 'SHV', 'BOXX']);
const assetClassOf = p =>
  p.assetClass === 'stock' || p.assetClass === 'parking'
    ? p.assetClass
    : (PARKING_TICKERS.has(p.ticker) ? 'parking' : 'stock');

// 성공률 정의: (success + partial) / (success + partial + fail).
// invalid(매수 범위 미성립)와 pending(진행 중)은 분모에서 제외합니다 —
// 체결되지 않은 추천을 승패로 세면 성적이 실제보다 좋아 보입니다.
const COUNTED = new Set(['success', 'partial', 'fail']);
const isWin = s => s === 'success' || s === 'partial';

function rate(rows) {
  const counted = rows.filter(r => COUNTED.has(r.status));
  const wins = counted.filter(r => isWin(r.status)).length;
  return {
    n: rows.length,
    counted: counted.length,
    wins,
    losses: counted.length - wins,
    invalid: rows.filter(r => r.status === 'invalid').length,
    pending: rows.filter(r => r.status === 'pending').length,
    winRate: counted.length ? +(wins / counted.length * 100).toFixed(1) : null,
  };
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()]
    .map(([key, rs]) => ({ key, ...rate(rs) }))
    .sort((a, b) => b.counted - a.counted);
}

// ── 본체 ─────────────────────────────────────────────────────
const RECO = loadReco();
const SIM = loadSim();

// 채점 기록을 예측 메타데이터와 결합합니다.
const pickById = new Map();
for (const b of RECO.batches) for (const p of b.picks) pickById.set(p.id, { pick: p, batch: b });

const rows = [];
for (const [id, rec] of Object.entries(RECO.outcomes?.records || {})) {
  const hit = pickById.get(id);
  const sim = hit ? SIM[hit.pick.simId] : null;
  rows.push({
    id,
    status: rec.status,
    title: rec.title || '',
    detail: rec.detail || '',
    batchId: hit ? hit.batch.id : null,
    ticker: hit ? hit.pick.ticker : null,
    horizon: hit ? hit.pick.horizon : null,
    assetClass: hit ? assetClassOf(hit.pick) : null,
    risk: hit ? hit.pick.risk : null,
    // 예측 확률 — 이게 있어야 캘리브레이션을 볼 수 있습니다.
    pHitTarget: sim ? sim.final.pHitTarget : null,
    pHitStop: sim ? sim.final.pHitStop : null,
    pProfit: sim ? sim.final.pProfit : null,
    orphan: !hit, // 배치가 삭제됐는데 기록만 남은 경우
  });
}

// ── 캘리브레이션: 예측 확률 구간 vs 실제 성공률 ─────────────────
const BANDS = [[0, 50], [50, 60], [60, 70], [70, 80], [80, 90], [90, 95], [95, 101]];
const calibration = BANDS.map(([lo, hi]) => {
  const inBand = rows.filter(r => r.pHitTarget != null && r.pHitTarget >= lo && r.pHitTarget < hi);
  const st = rate(inBand);
  const predicted = inBand.length
    ? +(inBand.reduce((a, r) => a + r.pHitTarget, 0) / inBand.length).toFixed(1)
    : null;
  return {
    band: `${lo}-${hi === 101 ? 100 : hi}%`,
    predicted,
    actual: st.winRate,
    counted: st.counted,
    // 양수면 실제가 예측보다 좋음(모델이 과소평가), 음수면 과신.
    gap: predicted != null && st.winRate != null ? +(st.winRate - predicted).toFixed(1) : null,
  };
}).filter(c => c.counted > 0);

// 표본이 충분한 구간만 결론에 씁니다. 3건으로 "모델이 과신한다"고 말하면 안 됩니다.
const MIN_SAMPLE = 8;
const usableBands = calibration.filter(c => c.counted >= MIN_SAMPLE);
const weightedGap = usableBands.length
  ? +(usableBands.reduce((a, c) => a + c.gap * c.counted, 0) /
      usableBands.reduce((a, c) => a + c.counted, 0)).toFixed(1)
  : null;

// ── 반복 실패 탐지 ────────────────────────────────────────────
const byTicker = groupBy(rows, r => r.ticker);
const bySlot = groupBy(rows, r => (r.assetClass && r.horizon ? `${r.assetClass}/${r.horizon}` : null));

// 어떤 슬롯이 손실을 독점하는가 — 과거에 "당일 단일 종목" 슬롯이 그랬습니다.
const totalLosses = rows.filter(r => r.status === 'fail').length;
const lossConcentration = bySlot
  .map(s => {
    const losses = rows.filter(
      r => r.status === 'fail' && `${r.assetClass}/${r.horizon}` === s.key
    ).length;
    return { slot: s.key, losses, shareOfAllLosses: totalLosses ? +(losses / totalLosses * 100).toFixed(1) : 0, winRate: s.winRate, counted: s.counted };
  })
  .filter(s => s.losses > 0)
  .sort((a, b) => b.losses - a.losses);

// 3회 이상 채점됐는데 승률이 50% 미만인 종목 = 편성에서 빼는 걸 검토할 대상.
const chronicLosers = byTicker.filter(t => t.counted >= 3 && t.winRate != null && t.winRate < 50);

// ── 실행 가능한 제안 ──────────────────────────────────────────
const findings = [];
if (rows.length === 0) {
  findings.push({
    severity: 'info',
    finding: '채점 기록이 없습니다 — 기록 초기화 직후이거나 아직 만기된 예측이 없습니다.',
    action: '오늘 추천이 만기되는 다음 거래일부터 기록이 쌓입니다. 캘리브레이션 판단은 구간당 8건 이상 모인 뒤에 하세요.',
  });
}
if (weightedGap != null && weightedGap <= -7) {
  findings.push({
    severity: 'high',
    finding: `시뮬레이터가 과신하고 있습니다. 예측 대비 실제 성공률이 평균 ${weightedGap}%p 낮습니다.`,
    action: 'scripts/simulate.mjs 의 annVol 을 올리거나 annDrift 를 낮추세요. 개별 종목을 바꾸는 것으로는 해결되지 않습니다.',
  });
}
if (weightedGap != null && weightedGap >= 7) {
  findings.push({
    severity: 'medium',
    finding: `시뮬레이터가 과소평가하고 있습니다. 실제 성공률이 예측보다 평균 +${weightedGap}%p 높습니다.`,
    action: '목표를 지나치게 보수적으로 잡고 있을 수 있습니다. 변동성 가정이 실제보다 높지 않은지 확인하세요.',
  });
}
if (lossConcentration.length && totalLosses >= 3 && lossConcentration[0].shareOfAllLosses >= 60) {
  const w = lossConcentration[0];
  findings.push({
    severity: 'high',
    finding: `손실이 '${w.slot}' 슬롯에 집중돼 있습니다 (전체 실패의 ${w.shareOfAllLosses}%, 이 슬롯 승률 ${w.winRate}%).`,
    action: '예측을 더 잘하려 하지 말고 그 슬롯의 구성 자체를 바꾸세요 — 교훈 19·23과 같은 패턴입니다.',
  });
}
for (const t of chronicLosers) {
  findings.push({
    severity: 'medium',
    finding: `${t.key}: ${t.counted}회 채점 중 승률 ${t.winRate}% (${t.losses}패).`,
    action: `${t.key} 편성을 줄이거나, 어떤 기간(horizon)에서 지는지 확인해 그 기간에서만 제외하세요.`,
  });
}
const invalidRows = rows.filter(r => r.status === 'invalid');
if (invalidRows.length >= 3 && invalidRows.length / Math.max(1, rows.length) >= 0.15) {
  findings.push({
    severity: 'medium',
    finding: `매수 범위 미성립(invalid)이 ${invalidRows.length}건으로 전체의 ${(invalidRows.length / rows.length * 100).toFixed(0)}% 입니다.`,
    action: '기준가가 낡았거나 매수 범위가 좁습니다. 시가 기준 상대 매수 규칙을 더 넓게 쓰세요.',
  });
}
const orphans = rows.filter(r => r.orphan);
if (orphans.length) {
  findings.push({
    severity: 'low',
    finding: `배치가 사라졌는데 채점 기록만 남은 항목이 ${orphans.length}건 있습니다.`,
    action: '기록 초기화 시 outcomes.records 와 batches 를 함께 정리해야 합니다.',
  });
}

const report = {
  generatedFor: RECO.lastUpdated || null,
  totals: rate(rows),
  byAssetClass: groupBy(rows, r => r.assetClass),
  byHorizon: groupBy(rows, r => r.horizon),
  byTicker: byTicker.slice(0, 15),
  bySlot,
  calibration,
  calibrationVerdict: {
    weightedGapPct: weightedGap,
    usableBands: usableBands.length,
    minSamplePerBand: MIN_SAMPLE,
    note: weightedGap == null
      ? '표본 부족 — 아직 캘리브레이션을 판단하지 마세요.'
      : weightedGap < 0 ? '실제가 예측보다 나쁨(과신)' : '실제가 예측보다 좋음(과소평가)',
  },
  lossConcentration,
  chronicLosers,
  findings,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 1));
} else {
  const L = console.log;
  L('═══ 자동 학습 회고 리포트 ═══');
  L(`기준: ${report.generatedFor || '(lastUpdated 없음)'}`);
  const t = report.totals;
  L(`\n▸ 전체: 기록 ${t.n}건 / 채점대상 ${t.counted}건 · ${t.wins}승 ${t.losses}패` +
    (t.winRate != null ? ` · 성공률 ${t.winRate}%` : '') +
    ` (무효 ${t.invalid} · 진행중 ${t.pending})`);
  if (!t.n) L('  아직 기록이 없습니다.');

  const table = (title, arr, keyName = '구분') => {
    if (!arr.length) return;
    L(`\n▸ ${title}`);
    L(`  ${keyName.padEnd(18)} 채점  승  패  성공률`);
    arr.forEach(r => L(`  ${String(r.key).padEnd(18)} ${String(r.counted).padStart(3)} ${String(r.wins).padStart(3)} ${String(r.losses).padStart(3)}  ${r.winRate != null ? r.winRate + '%' : '-'}`));
  };
  table('자산 성격별', report.byAssetClass, '성격');
  table('기간별', report.byHorizon, '기간');
  table('슬롯별(성격/기간)', report.bySlot, '슬롯');
  table('종목별 상위', report.byTicker, '종목');

  if (report.calibration.length) {
    L('\n▸ 캘리브레이션 — 시뮬 예측 vs 실제');
    L('  예측구간      예측평균  실제   차이   표본');
    report.calibration.forEach(c =>
      L(`  ${c.band.padEnd(12)} ${String(c.predicted).padStart(6)}%  ${String(c.actual).padStart(5)}%  ${String(c.gap).padStart(5)}%p  ${c.counted}`));
    L(`  판정: ${report.calibrationVerdict.note}` +
      (weightedGap != null ? ` (가중 격차 ${weightedGap}%p, 표본 8건 이상 구간 ${usableBands.length}개)` : ''));
  }

  if (report.lossConcentration.length) {
    L('\n▸ 손실 집중도');
    report.lossConcentration.forEach(s =>
      L(`  ${s.slot.padEnd(18)} 실패 ${s.losses}건 (전체 실패의 ${s.shareOfAllLosses}%) · 승률 ${s.winRate}%`));
  }

  L('\n▸ 조치 제안');
  if (!report.findings.length) L('  특이사항 없음.');
  report.findings.forEach((f, i) => {
    L(`  ${i + 1}. [${f.severity}] ${f.finding}`);
    L(`     → ${f.action}`);
  });
  L('');
}
