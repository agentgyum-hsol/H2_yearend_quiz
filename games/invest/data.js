// 반도체왕 임삼성: 종목과 라운드 시나리오
export const START_MONEY = 10_000_000; // 1,000만원

export const ASSETS = [
  { id: 'dram', name: 'DRAM',       short: 'DRAM', color: '#2fd3c4', desc: 'PC·서버 메인 메모리. AI 서버 붐이 오면 날아오른다.' },
  { id: 'nand', name: 'NAND 플래시', short: 'NAND', color: '#a77bff', desc: 'SSD·스마트폰 저장장치. 스마트폰 경기를 탄다.' },
  { id: 'gold', name: '금',          short: 'GOLD', color: '#ffc43d', desc: '전통의 안전자산. 세상이 불안하면 오른다.' },
  { id: 'btc',  name: '비트코인',     short: 'BTC',  color: '#ff8a2b', desc: '변동성의 왕. 크게 벌거나 크게 잃는다.' },
  { id: 'cash', name: '현금(예금)',   short: 'CASH', color: '#8f9bc7', desc: '투자 안 한 돈. 라운드마다 이자 +2%.' },
];
export const INVEST = ASSETS.filter(a => a.id !== 'cash');
export const ZERO = { dram: 0, nand: 0, gold: 0, btc: 0 };

// 라운드마다: 뉴스(힌트) → 실제 등락률(%) → 결과 해설
export const ROUNDS = [
  { when: '2026년 1분기', title: 'AI 서버 대란! 빅테크, 데이터센터 투자 2배로',
    bullets: ['글로벌 빅테크 4사, 올해 AI 인프라 투자 계획 일제히 상향', '서버용 고용량 메모리 주문 폭주, 납기 6개월 이상', '한편 금값은 사상 최고가 부근에서 숨 고르기'],
    boss: '서버에 들어가는 건 다 오른다! ...아마도?',
    move: { dram: 40, nand: 15, gold: -5, btc: 20, cash: 2 },
    twist: '예상대로 DRAM 독주. AI 훈풍에 위험자산 비트코인도 동반 상승!' },
  { when: '2026년 2분기', title: '스마트폰 판매 3분기 연속 감소… 창고에 재고 산더미',
    bullets: ['신형 스마트폰 판매 부진, 제조사들 부품 주문 축소', '저장장치 재고가 평소의 2배까지 쌓였다는 보도', '금리 인하 기대감은 여전'],
    boss: '폰이 안 팔리면… 폰에 들어가는 게 문제겠지?',
    move: { dram: -25, nand: -35, gold: 10, btc: -10, cash: 2 },
    twist: 'NAND 직격탄! 재고 쇼크에 DRAM까지 끌려 내려갔고, 금이 피난처가 됐다.' },
  { when: '2026년 3분기', title: '비트코인 신규 ETF 승인 임박! 기대감 최고조',
    bullets: ['"승인 확률 90% 이상" 전문가 전망 쏟아져', '커뮤니티는 "이번엔 진짜 달 간다" 열기', '메모리 업황은 바닥 다지기 중'],
    boss: '이건 무조건 비트코인이다! ...근데 다들 그렇게 생각하면?',
    move: { dram: 5, nand: 0, gold: 5, btc: -20, cash: 2 },
    twist: '반전! "소문에 사서 뉴스에 팔아라". 승인 당일 차익실현 물량이 쏟아지며 비트코인 급락.' },
  { when: '2026년 4분기', title: '지정학적 긴장 고조… 글로벌 증시 출렁',
    bullets: ['주요 해협 봉쇄 우려로 원자재 가격 급등', '각국 중앙은행, 금 매입 확대 발표', '공급망 불안에 반도체 장비 수출 일부 지연'],
    boss: '이럴 땐 금 아닙니까, 금!',
    move: { dram: -10, nand: -5, gold: 30, btc: 35, cash: 2 },
    twist: '금은 예상대로 폭등. 그런데 "디지털 금" 이야기에 비트코인도 따라 올랐다!' },
  { when: '2027년 1분기', title: 'HBM 품귀! 메모리 슈퍼사이클 다시 온다',
    bullets: ['차세대 AI 칩 출하 본격화, 고대역폭 메모리 없어서 못 판다', '데이터센터용 대용량 SSD 수요도 급증', '긴장 완화로 안전자산 매도세'],
    boss: '마지막 라운드! 반도체왕의 촉을 믿어라!',
    move: { dram: 80, nand: 40, gold: -10, btc: -15, cash: 2 },
    twist: '메모리 슈퍼사이클! DRAM이 한 라운드에 80% 폭등하며 판을 뒤집었다.' },
];

/* ---------- 공용 계산 · 표기 ---------- */
export const cashOf = a => 100 - INVEST.reduce((s, x) => s + (a?.[x.id] || 0), 0);

export function applyRound(value, alloc, move) {
  const a = { ...ZERO, ...(alloc || {}) };
  let v = 0;
  INVEST.forEach(x => { v += value * (a[x.id] / 100) * (1 + move[x.id] / 100); });
  v += value * (cashOf(a) / 100) * (1 + move.cash / 100);
  return v;
}

// 라운드별 가격 지수(시작 100)
export function indexSeries(id, upto) {
  const arr = [100];
  for (let r = 0; r <= upto; r++) arr.push(arr[arr.length - 1] * (1 + ROUNDS[r].move[id] / 100));
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

// 순위: 자산 내림차순, 같으면 닉네임
export function rankList(portfolios) {
  return Object.entries(portfolios)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.value - a.value) || String(a.nick).localeCompare(String(b.nick)));
}

export function loadCss(href) {
  if ([...document.querySelectorAll('link[data-inv]')].some(l => l.href === href)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.inv = '1';
  document.head.appendChild(l);
}
