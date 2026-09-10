window.STRATEGY = {
 "version": "v4.0",
 "updatedAt": "2026-09-10",
 "goal": "S&P 500 총수익(배당 포함)을 이기는 것을 명시적 목표로 하되, 그 확률을 가정과 함께 정직하게 공개한다",
 "benchmark": "S&P 500 총수익 (모형 가정: 연 +9.5%, 변동성 15%)",
 "rebalance": "분기(약 63거래일)마다 목표 비중으로 리밸런싱",
 "sleeves": [
  {
   "key": "core",
   "name": "코어 · S&P 500 인덱스",
   "weight": 45,
   "beta": 1,
   "alphaAssumption": 0,
   "vol": 15,
   "drift": 9.5
  },
  {
   "key": "growth",
   "name": "성장 위성 · AI 대형주 3~5종 분산(모멘텀 틸트)",
   "weight": 30,
   "beta": 1.35,
   "alphaAssumption": 2,
   "vol": 35,
   "drift": 14.8
  },
  {
   "key": "div",
   "name": "방어 위성 · 배당·저변동(KO·SCHD류)",
   "weight": 15,
   "beta": 0.6,
   "alphaAssumption": 1.5,
   "vol": 16,
   "drift": 7.2
  },
  {
   "key": "parking",
   "name": "파킹 · 초단기 국채(SGOV류) — 조정장 실탄",
   "weight": 10,
   "beta": 0,
   "alphaAssumption": 0,
   "vol": 0,
   "drift": 3.7
  }
 ],
 "assumptions": [
  "모든 수치는 몬테카를로(20,000 경로, Student-t(4) 시장 충격) 확률 추정치이며 수익을 보장하지 않습니다",
  "성장 위성 +2.0%p, 방어 위성 +1.5%p의 연간 팩터 프리미엄(모멘텀·저변동/배당)은 학계 장기 평균에 기댄 \"가정\"입니다 — 미래에 실현되지 않을 수 있습니다",
  "거래 비용·세금·환율은 반영하지 않았습니다 (실제 수익률은 이보다 낮아질 수 있습니다)",
  "가정을 전부 끈 pBeatNoAlpha 가 50%를 밑도는 것이 정직한 기준선입니다 — 프리미엄 실현 여부가 성패를 가릅니다"
 ],
 "sim": {
  "h3m": {
   "withAlpha": {
    "pBeat": 49.1,
    "excessMedian": -0.1,
    "excessP5": -7,
    "excessP95": 8.1,
    "portMedian": 2.1,
    "portP5": -10.8,
    "portP95": 17.3,
    "spyMedian": 2.1,
    "spyP5": -9.7,
    "spyP95": 15.5,
    "portMaxDDavg": 7.8,
    "spyMaxDDavg": 6.9
   },
   "noAlpha": {
    "pBeat": 47.4,
    "excessMedian": -0.3,
    "excessP5": -7.2,
    "excessP95": 7.9,
    "portMedian": 1.9,
    "portP5": -10.9,
    "portP95": 17.1,
    "spyMedian": 2.1,
    "spyP5": -9.7,
    "spyP95": 15.5,
    "portMaxDDavg": 7.9,
    "spyMaxDDavg": 6.9
   }
  },
  "h1y": {
   "withAlpha": {
    "pBeat": 50.9,
    "excessMedian": 0.2,
    "excessP5": -14.6,
    "excessP95": 17.8,
    "portMedian": 8.9,
    "portP5": -16.9,
    "portP95": 44.1,
    "spyMedian": 8.6,
    "spyP5": -15.2,
    "spyP95": 38.9,
    "portMaxDDavg": 14.8,
    "spyMaxDDavg": 13.1
   },
   "noAlpha": {
    "pBeat": 47.1,
    "excessMedian": -0.7,
    "excessP5": -15.4,
    "excessP95": 16.7,
    "portMedian": 8,
    "portP5": -17.6,
    "portP95": 42.9,
    "spyMedian": 8.6,
    "spyP5": -15.2,
    "spyP95": 38.9,
    "portMaxDDavg": 15,
    "spyMaxDDavg": 13.1
   }
  }
 },
 "race": {
  "start": "2026-09-10",
  "base": 100,
  "series": [
   {
    "date": "2026-09-10",
    "strategy": 100,
    "spy": 100
   }
  ]
 }
};
