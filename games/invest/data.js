// 반도체왕 임삼성: 종목, 라운드 시나리오, 30초 실시간 장 가격 흐름과 계산
export const START_MONEY = 100_000_000; // 1억원
export const MARKET_SECONDS = 30;       // 라운드마다 열리는 실시간 장 길이(초)
export const PRE_SECONDS = 20;          // 본장 전 프리장(시초 주문) 길이(초). 운영자가 라운드마다 열지 말지 고름
export const TRADE_COOLDOWN_MS = 1000;  // 프리장에서 주문 사이 최소 간격
export const FLASH_AT = 15;             // 본장 몇 초째에 추가 속보가 뜨는지 (장 시간 기준)
export const FLASH_SECONDS = 30;        // 속보가 뜨면 장이 멈추고 토의·결정하는 시간(초)
export const SLIDER_LOCK_SECONDS = 3;   // 본장에서 주문(비율 변경)하면 슬라이더가 잠기는 시간 = 거래 수수료
// 라운드의 프리장 길이: 운영자가 고른 값(room.preSec), 옛 기록이면 PRE_SECONDS
export const preOf = room => (room?.preSec ?? PRE_SECONDS);
export const MARKET_WALL = MARKET_SECONDS + FLASH_SECONDS; // 본장 실제 길이(초): 장 시간 + 속보 정지 시간
export const TOP_N = 5;
export const BOSS_TAG = '반도체 30년 외길 · 적중률 9할'; // 임삼성 회장 소개(믿음직하게 보여야 헛다리가 반전이 됨)
export const AUTO_ORDER_MS = 3000;     // 슬라이더에서 손 떼고 이 시간 동안 안 건드리면 자동 주문
export const ALL_IN_SECONDS = 5;       // 프리장에서 모두 시초 주문을 내면 이 초 뒤 본장 시작                 // 최종 화면에 공개하는 순위

export const ASSETS = [
  { id: 'dram', name: 'DRAM',       short: 'DRAM', color: '#2fd3c4', vol: 0.014, desc: 'PC·서버 메인 메모리. AI 서버 붐이 오면 날아오른다.' },
  { id: 'nand', name: 'NAND 플래시', short: 'NAND', color: '#a77bff', vol: 0.014, desc: 'SSD·스마트폰 저장장치. 스마트폰 경기를 탄다.' },
  { id: 'gold', name: '금',          short: 'GOLD', color: '#ffc43d', vol: 0.006, desc: '전통의 안전자산. 세상이 불안하면 오른다.' },
  { id: 'btc',  name: '비트코인',     short: 'BTC',  color: '#ff8a2b', vol: 0.028, desc: '변동성의 왕. 크게 벌거나 크게 잃는다.' },
  { id: 'cash', name: '현금(예금)',   short: 'CASH', color: '#8f9bc7', vol: 0,     desc: '투자 안 한 돈. 라운드마다 이자 +2%.' },
];
export const INVEST = ASSETS.filter(a => a.id !== 'cash');
export const ZERO = { dram: 0, nand: 0, gold: 0, btc: 0 };

// 라운드마다: 뉴스(힌트) → 임삼성 조언(boss, bossWrong 이면 실제와 반대인 헛다리) → 장 중 흐름(shape, %, 균등 간격 지점) → 마감 등락(move, %) → 해설
// shape 이 없는 종목은 시작에서 마감까지 출렁이며 곧장 감. shape 의 마지막 값은 move 로 덮어씀.
export const ROUNDS = [
  { when: '2026년 1분기', title: 'AI 서버 대란! 빅테크, 데이터센터 투자 2배로',
    bullets: ['글로벌 빅테크 4사, 올해 AI 인프라 투자 계획 일제히 상향', '서버용 고용량 메모리 주문 폭주, 납기 6개월 이상', '한편 금값은 사상 최고가 부근에서 숨 고르기'],
    boss: '서버에 들어가는 건 다 오른다. 30년 감이 그렇게 말하고 있어!',
    move: { dram: 40, nand: 15, gold: -5, btc: 20, cash: 2 },
    shape: { dram: [0, 12, 4, 26, 40], btc: [0, -8, 6, 20] },
    flash: { title: '빅테크 1곳, 메모리 3년 장기공급 계약 전격 체결', bullets: ['계약 규모 사상 최대, 대부분 서버용 DRAM', '비트코인 채굴업체들도 AI 데이터센터로 업종 변경 바람'] },
    tips: [{ text: '서버 업체 지인: DRAM 납품가 다음 달 또 오른대', real: true }, { text: '코인 커뮤니티: 채굴업체들 AI 데이터센터로 갈아탄대. 비트코인 매물 줄어들 듯', real: true }, { text: '업계 소문: 빅테크 투자 발표는 부풀린 숫자래. DRAM 곧 꺾인다', real: false }, { text: '금 딜러: 이번 분기 금값 20% 더 간대', real: false }],
    twist: '예상대로 DRAM 독주. 초반 조정에 겁먹고 판 사람은 땅을 쳤다!' },
  { when: '2026년 2분기', title: '스마트폰 판매 3분기 연속 감소… 창고에 재고 산더미',
    bullets: ['신형 스마트폰 판매 부진, 제조사들 부품 주문 축소', '저장장치 재고가 평소의 2배까지 쌓였다는 보도', '금리 인하 기대감은 여전'],
    boss: '폰이 안 팔리면 폰에 들어가는 게 먼저 무너진다. 이건 확실해.',
    move: { dram: -25, nand: -35, gold: 10, btc: -10, cash: 2 },
    shape: { dram: [0, 8, -6, -25], nand: [0, -12, -18, -35], gold: [0, 4, 8, 10], btc: [0, 10, -14, -10] },
    flash: { title: '메모리 업체들 “감산은 없다” 공식 발표', bullets: ['재고가 더 쌓일 거라는 우려 확산', '불안한 투자자들, 안전자산으로 피신 조짐'] },
    tips: [{ text: '물류센터 직원: 창고에 SSD 박스가 천장까지 쌓였어', real: true }, { text: '은행 PB: 큰손 고객들 요즘 골드바만 찾아', real: true }, { text: '부품 대리점: 신형 폰 사전예약 대박. NAND 다시 오른다', real: false }, { text: '코인 고수: 이번 달 비트코인 신고가 확정', real: false }],
    twist: 'NAND 직격탄! DRAM은 초반 반짝 반등이 함정이었고, 금이 피난처가 됐다.' },
  { when: '2026년 3분기', title: '비트코인 신규 ETF 승인 임박! 기대감 최고조',
    bullets: ['"승인 확률 90% 이상" 전문가 전망 쏟아져', '커뮤니티는 "이번엔 진짜 달 간다" 열기', '메모리 업황은 바닥 다지기 중'],
    boss: '이건 무조건 비트코인이다. 승인 나면 바로 달 간다!',
    bossWrong: true, // 헛다리: 조언과 반대로 움직임
    move: { dram: 5, nand: 0, gold: 5, btc: -20, cash: 2 },
    shape: { btc: [0, 14, 24, 8, -20], dram: [0, -4, 3, 5] },
    flash: { title: 'ETF 최종 승인! …그런데 고래 지갑이 움직인다', bullets: ['대형 보유자 지갑에서 거래소로 비트코인 대량 이동 포착', '“소문에 사서 뉴스에 판다”는 격언 재소환'] },
    tips: [{ text: '거래소 직원: 고래 지갑들이 거래소로 코인 옮기는 중이래', real: true }, { text: '메모리 영업팀: 바닥 찍었어. 조금씩 오를 거야', real: true }, { text: 'ETF 운용사 지인: 승인 나면 기관 자금 쏟아진대. 비트코인 2배', real: false }, { text: '금 시장 소식: 금값 폭락 임박, 빨리 팔아라', real: false }],
    twist: '회장님 헛다리! 승인 직전 +24%까지 갔다가 "뉴스에 팔아라"로 폭락. 꼭대기에서 판 사람이 승자!' },
  { when: '2026년 4분기', title: '지정학적 긴장 고조… 글로벌 증시 출렁',
    bullets: ['주요 해협 봉쇄 우려로 원자재 가격 급등', '각국 중앙은행, 금 매입 확대 발표', '공급망 불안에 반도체 장비 수출 일부 지연'],
    boss: '금은 이미 꼭대기야. 이럴 때일수록 반도체를 담아라.',
    bossWrong: true,
    move: { dram: -10, nand: -5, gold: 30, btc: 35, cash: 2 },
    shape: { gold: [0, 10, 18, 30], btc: [0, -16, -10, 12, 35] },
    flash: { title: '대형 자산운용사 “비트코인은 디지털 금” 대규모 매수', bullets: ['안전자산 수요가 금에 이어 코인으로 번질지 주목', '반도체 장비 수출 지연은 장기화 조짐'] },
    tips: [{ text: '중앙은행 출입기자: 금 매입 발표가 줄줄이 대기 중', real: true }, { text: '자산운용사 지인: 비트코인 대규모 매수 보고서 곧 나온대', real: true }, { text: '장비 업체 직원: 수출 지연 다음 주에 풀린대. 반도체 반등!', real: false }, { text: '투자 카페: 금은 이미 꼭대기. 지금 사면 상투', real: false }],
    twist: '회장님 또 헛다리! 꼭대기라던 금은 30% 더 올랐고, 반도체는 장비 수출 지연에 하락. 비트코인은 "디지털 금" 바람을 타고 역전!' },
  { when: '2027년 1분기', title: 'HBM 품귀! 메모리 슈퍼사이클 다시 온다',
    bullets: ['차세대 AI 칩 출하 본격화, 고대역폭 메모리 없어서 못 판다', '데이터센터용 대용량 SSD 수요도 급증', '긴장 완화로 안전자산 매도세'],
    boss: '마지막 더블 찬스! 메모리가 판을 뒤집는다. 내 촉을 믿어!',
    move: { dram: 80, nand: 40, gold: -10, btc: -15, cash: 2 },
    shape: { dram: [0, -8, 18, 42, 80], nand: [0, 8, 22, 40], btc: [0, 10, -4, -15] },
    double: true, // 더블 찬스: 투자 종목 흐름과 등락 2배 (현금 이자는 그대로)
    flash: { title: '임삼성전자, 차세대 HBM 양산 성공! 빅테크 선주문 싹쓸이', bullets: ['DRAM 가격 추가 인상 공식화, SSD 주문도 줄줄이', '위험자산 쏠림에 비트코인은 매물 출회'] },
    tips: [{ text: '임삼성전자 직원: HBM 수율 대박. 다음 주 발표 있대', real: true }, { text: '코인 단톡방: 큰손들 코인 팔고 반도체 산대', real: true }, { text: '금 유튜버: 전쟁 위험 다시 커진다. 금 사재기 시작', real: false }, { text: '반도체 기자: HBM 양산 또 연기될 듯', real: false }],
    twist: '더블 찬스에 메모리 슈퍼사이클! DRAM이 한 라운드에 160% 폭등하며 판을 뒤집었다.' },
];

/* ---------- 비밀 찌라시 ---------- */
// 라운드마다 찌라시 4개(진짜 2, 가짜 2) 중 하나를 참가자별로 나눠 줌. 같은 사람은 그 라운드에 늘 같은 찌라시.
// 라운드마다 섞는 순서가 달라서 매번 다른 사람과 정보를 맞춰 봐야 함.
export function tipIndex(pid, r) {
  let h = 2166136261 ^ (r + 1) * 7919;
  for (const c of String(pid)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000003) % ROUNDS[r].tips.length;
}
export const tipFor = (pid, r) => ROUNDS[r].tips[tipIndex(pid, r)];

/* ---------- 본장 시계 (속보 정지 포함) ---------- */
// ms: 본장 시작부터 지난 실제 시간. FLASH_AT 초에 장이 FLASH_SECONDS 초 동안 멈춤(가격 고정, 주문은 그 가격으로 체결).
export function tickAt(ms) {
  const s = ms / 1000;
  if (s < FLASH_AT) return Math.max(0, Math.floor(s));
  if (s < FLASH_AT + FLASH_SECONDS) return FLASH_AT;
  return Math.min(MARKET_SECONDS, Math.floor(s - FLASH_SECONDS));
}
// 속보 정지 중이면 남은 초(올림), 아니면 0
export function flashLeft(ms) {
  const s = ms / 1000;
  return s >= FLASH_AT && s < FLASH_AT + FLASH_SECONDS ? Math.ceil(FLASH_AT + FLASH_SECONDS - s) : 0;
}

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
  const old = [...document.querySelectorAll('link[data-inv]')];
  if (old.some(l => l.href === href)) return;
  old.forEach(l => l.remove()); // 예전 버전 css 는 치움
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.inv = '1';
  document.head.appendChild(l);
}
