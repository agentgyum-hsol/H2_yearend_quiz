// 반도체왕 임삼성: 종목, 라운드 시나리오, 30초 실시간 장 가격 흐름과 계산
export const START_MONEY = 100_000_000; // 1억원
export const MARKET_SECONDS = 30;       // 라운드마다 열리는 실시간 장 길이(초)
export const PRE_SECONDS = 20;          // 본장 전 프리장(준비·시초 주문) 길이(초)
export const TRADE_COOLDOWN_MS = 1000;  // 폰에서 주문 사이 최소 간격
export const TOP_N = 5;                 // 최종 화면에 공개하는 순위

export const ASSETS = [
  { id: 'dram', name: 'DRAM',       short: 'DRAM', color: '#2fd3c4', vol: 0.014, desc: 'PC·서버 메인 메모리. AI 서버 붐이 오면 날아오른다.' },
  { id: 'nand', name: 'NAND 플래시', short: 'NAND', color: '#a77bff', vol: 0.014, desc: 'SSD·스마트폰 저장장치. 스마트폰 경기를 탄다.' },
  { id: 'gold', name: '금',          short: 'GOLD', color: '#ffc43d', vol: 0.006, desc: '전통의 안전자산. 세상이 불안하면 오른다.' },
  { id: 'btc',  name: '비트코인',     short: 'BTC',  color: '#ff8a2b', vol: 0.028, desc: '변동성의 왕. 크게 벌거나 크게 잃는다.' },
  { id: 'cash', name: '현금(예금)',   short: 'CASH', color: '#8f9bc7', vol: 0,     desc: '투자 안 한 돈. 라운드마다 이자 +2%.' },
];
export const INVEST = ASSETS.filter(a => a.id !== 'cash');
export const ZERO = { dram: 0, nand: 0, gold: 0, btc: 0 };

// 라운드마다: 뉴스(힌트) → 장 중 흐름(shape, %, 균등 간격 지점) → 마감 등락(move, %) → 해설
// shape 이 없는 종목은 시작에서 마감까지 출렁이며 곧장 감. shape 의 마지막 값은 move 로 덮어씀.
export const ROUNDS = [
  { when: '2026년 1분기', title: 'AI 서버 대란! 빅테크, 데이터센터 투자 2배로',
    bullets: ['글로벌 빅테크 4사, 올해 AI 인프라 투자 계획 일제히 상향', '서버용 고용량 메모리 주문 폭주, 납기 6개월 이상', '한편 금값은 사상 최고가 부근에서 숨 고르기'],
    boss: '서버에 들어가는 건 다 오른다! ...아마도?',
    move: { dram: 40, nand: 15, gold: -5, btc: 20, cash: 2 },
    shape: { dram: [0, 12, 4, 26, 40], btc: [0, -8, 6, 20] },
    twist: '예상대로 DRAM 독주. 초반 조정에 겁먹고 판 사람은 땅을 쳤다!' },
  { when: '2026년 2분기', title: '스마트폰 판매 3분기 연속 감소… 창고에 재고 산더미',
    bullets: ['신형 스마트폰 판매 부진, 제조사들 부품 주문 축소', '저장장치 재고가 평소의 2배까지 쌓였다는 보도', '금리 인하 기대감은 여전'],
    boss: '폰이 안 팔리면… 폰에 들어가는 게 문제겠지?',
    move: { dram: -25, nand: -35, gold: 10, btc: -10, cash: 2 },
    shape: { dram: [0, 8, -6, -25], nand: [0, -12, -18, -35], gold: [0, 4, 8, 10], btc: [0, 10, -14, -10] },
    twist: 'NAND 직격탄! DRAM은 초반 반짝 반등이 함정이었고, 금이 피난처가 됐다.' },
  { when: '2026년 3분기', title: '비트코인 신규 ETF 승인 임박! 기대감 최고조',
    bullets: ['"승인 확률 90% 이상" 전문가 전망 쏟아져', '커뮤니티는 "이번엔 진짜 달 간다" 열기', '메모리 업황은 바닥 다지기 중'],
    boss: '이건 무조건 비트코인이다! ...근데 언제 팔지?',
    move: { dram: 5, nand: 0, gold: 5, btc: -20, cash: 2 },
    shape: { btc: [0, 14, 24, 8, -20], dram: [0, -4, 3, 5] },
    twist: '반전! 승인 직전 +24%까지 갔다가 "뉴스에 팔아라"로 폭락. 꼭대기에서 판 사람이 승자!' },
  { when: '2026년 4분기', title: '지정학적 긴장 고조… 글로벌 증시 출렁',
    bullets: ['주요 해협 봉쇄 우려로 원자재 가격 급등', '각국 중앙은행, 금 매입 확대 발표', '공급망 불안에 반도체 장비 수출 일부 지연'],
    boss: '이럴 땐 금 아닙니까, 금!',
    move: { dram: -10, nand: -5, gold: 30, btc: 35, cash: 2 },
    shape: { gold: [0, 10, 18, 30], btc: [0, -16, -10, 12, 35] },
    twist: '금은 예상대로 폭등. 비트코인은 초반 급락 뒤 "디지털 금" 바람을 타고 역전!' },
  { when: '2027년 1분기', title: 'HBM 품귀! 메모리 슈퍼사이클 다시 온다',
    bullets: ['차세대 AI 칩 출하 본격화, 고대역폭 메모리 없어서 못 판다', '데이터센터용 대용량 SSD 수요도 급증', '긴장 완화로 안전자산 매도세'],
    boss: '마지막 더블 찬스! 반도체왕의 촉을 믿어라!',
    move: { dram: 80, nand: 40, gold: -10, btc: -15, cash: 2 },
    shape: { dram: [0, -8, 18, 42, 80], nand: [0, 8, 22, 40], btc: [0, 10, -4, -15] },
    double: true, // 더블 찬스: 투자 종목 흐름과 등락 2배 (현금 이자는 그대로)
    twist: '더블 찬스에 메모리 슈퍼사이클! DRAM이 한 라운드에 160% 폭등하며 판을 뒤집었다.' },
];

/* ---------- 가격 흐름 ---------- */
// 라운드 마감 등락(더블 찬스 반영)
export function moveOf(r) {
  const R = ROUNDS[r], m = { ...R.move };
  if (R.double) INVEST.forEach(x => { m[x.id] *= 2; });
  return m;
}

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pathCache = {};
// 라운드 r, 종목 id 의 초별 가격(장 시작 = 1). 길이 MARKET_SECONDS + 1. 모든 기기에서 똑같이 계산됨.
export function pricePath(r, id) {
  const key = r + id; if (pathCache[key]) return pathCache[key];
  const T = MARKET_SECONDS, R = ROUNDS[r], k = R.double && id !== 'cash' ? 2 : 1;
  let out;
  if (id === 'cash') out = Array.from({ length: T + 1 }, (_, t) => 1 + (R.move.cash / 100) * t / T);
  else {
    const a = ASSETS.find(x => x.id === id);
    const pts = (R.shape?.[id] || [0, R.move[id]]).slice(); pts[pts.length - 1] = R.move[id];
    const segs = pts.length - 1;
    const base = t => { const f = t / T * segs, i = Math.min(segs - 1, Math.floor(f)), u = f - i; return 1 + k * (pts[i] + (pts[i + 1] - pts[i]) * u) / 100; };
    // 양 끝이 0인 흔들림(브라운 브리지) → 마감 값은 정확히 move
    const rand = rng((r + 1) * 1000 + ASSETS.indexOf(a) * 97 + 7);
    const w = [0]; for (let t = 1; t <= T; t++) w.push(w[t - 1] + (rand() - 0.5) * 2 * a.vol * k);
    out = Array.from({ length: T + 1 }, (_, t) => Math.max(0.05, base(t) * Math.exp(w[t] - w[T] * t / T)));
  }
  return (pathCache[key] = out);
}
export const priceAt = (r, id, tick) => pricePath(r, id)[Math.max(0, Math.min(MARKET_SECONDS, tick))];

// 주문 기록으로 장 중 tick 시점의 자산 계산. trades: [{tick, alloc}] (tick 오름차순, 장 전 주문은 0)
export function valueAt(startValue, startAlloc, trades, r, tick) {
  let units = toUnits(startValue, startAlloc || ZERO, r, 0);
  for (const tr of trades) {
    if (tr.tick > tick) break;
    units = toUnits(unitsValue(units, r, tr.tick), tr.alloc, r, tr.tick);
  }
  return unitsValue(units, r, tick);
}
function toUnits(v, alloc, r, tick) {
  const a = { ...ZERO, ...alloc }, u = {};
  INVEST.forEach(x => { u[x.id] = v * (a[x.id] / 100) / priceAt(r, x.id, tick); });
  u.cash = v * (cashOf(a) / 100) / priceAt(r, 'cash', tick);
  return u;
}
function unitsValue(u, r, tick) { return ASSETS.reduce((s, x) => s + u[x.id] * priceAt(r, x.id, tick), 0); }

/* ---------- 공용 계산 · 표기 ---------- */
export const toMs = t => (t == null ? null : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : (t.seconds != null ? t.seconds * 1000 : null));
export const cashOf = a => 100 - INVEST.reduce((s, x) => s + (a?.[x.id] || 0), 0);
export const sameAlloc = (a, b) => INVEST.every(x => (a?.[x.id] || 0) === (b?.[x.id] || 0));

// 라운드별 마감 가격 지수(1라운드 시작 100)
export function indexSeries(id, upto) {
  const arr = [100];
  for (let r = 0; r <= upto; r++) arr.push(arr[arr.length - 1] * (1 + moveOf(r)[id] / 100));
  return arr;
}

export function won(v) {
  v = Math.round(v / 10000);
  const neg = v < 0; v = Math.abs(v);
  const eok = Math.floor(v / 10000), man = v % 10000;
  const s = eok ? eok + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '') : man.toLocaleString('ko-KR') + '만';
  return (neg ? '-' : '') + s + '원';
}
export function pct(n, plus = true) {
  const r = Math.round(n * 10) / 10;
  return (r > 0 && plus ? '+' : '') + (Number.isInteger(r) ? r : r.toFixed(1)) + '%';
}
export const cls = n => (n > 0.0001 ? 'up' : n < -0.0001 ? 'down' : 'flat');
export const arrow = n => (n > 0.0001 ? '▲' : n < -0.0001 ? '▼' : '–');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 순위: 자산(원 단위) 내림차순 → 같으면 누적 결정 시간이 짧은 사람 → 닉네임
export function rankList(portfolios) {
  return Object.entries(portfolios)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (Math.round(b.value) - Math.round(a.value)) || ((a.totalTime ?? 0) - (b.totalTime ?? 0)) || String(a.nick).localeCompare(String(b.nick)));
}

// 작은 선 차트(SVG). series: [{color, data:[...]}], 같은 축. upto: 그릴 마지막 인덱스
export function lineChart(series, len, upto, { h = 160, base = 1 } = {}) {
  const all = series.flatMap(s => s.data.slice(0, upto + 1));
  const mn = Math.min(base, ...all), mx = Math.max(base, ...all), pad = (mx - mn) * 0.08 || 0.05;
  const lo = mn - pad, hi = mx + pad, W = 300;
  const x = i => (i / (len - 1)) * (W - 8) + 4, y = v => h - 4 - (v - lo) / (hi - lo) * (h - 8);
  const by = y(base).toFixed(1);
  let svg = `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true" style="width:100%;height:${h}px;display:block">`;
  svg += `<line x1="0" x2="${W}" y1="${by}" y2="${by}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`;
  series.forEach(s => {
    const d = s.data.slice(0, upto + 1);
    if (!d.length) return;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.5}" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${d.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')}"/>`;
    const l = d.length - 1;
    svg += `<circle cx="${x(l).toFixed(1)}" cy="${y(d[l]).toFixed(1)}" r="3.5" fill="${s.color}"/>`;
  });
  return svg + '</svg>';
}

export function loadCss(href) {
  if ([...document.querySelectorAll('link[data-inv]')].some(l => l.href === href)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.inv = '1';
  document.head.appendChild(l);
}
