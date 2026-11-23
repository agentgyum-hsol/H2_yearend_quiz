// '제 이모지야👽' 문제. lvl 1 쉬움, 2 보통, 3 어려움.
// e: 이모지 줄들, a: 정답, alt: 정답으로 인정할 다른 표현(넉넉히), m: 뜻, d: 정답 공개 때 이모지 풀이
// t: 문제 유형. 운영자·참가자 화면 위에 그대로 표시됩니다 (속담, 사자성어, 영화 제목, 드라마 제목, 직장인 말 …).
// reserve: true 는 본 게임에서 빼 둔 예비 문제. 1위 동점 결승이나 문제 교체용.
// 순서가 곧 출제 순서: 속담 워밍업(쉬움 4) → 유형 섞기(보통 6) → 유형 섞기(어려움 5, 40초·2배).
// ★ 교체용: custom: true 표시가 붙은 3문제(직장인 말)는 회사 사건·유행어 자리입니다.
//   소재가 정해지면 같은 모양으로 e·a·alt·m·d 만 바꾸면 됩니다.
const BANK = [
  // ── 쉬움 · 속담 워밍업 ──
  { t: "속담", e: ["🐄💨", "🏚️🔨"], a: "소 잃고 외양간 고친다", lvl: 1, alt: ["소 잃고 외양간 고치기", "소 잃고 외양간 고침"],
    m: "일이 이미 잘못된 뒤에야 손을 써 봐야 소용없다는 말.", d: "🐄 소가 💨 도망가고 나서 🏚️ 외양간을 🔨 고친다" },
  { t: "속담", e: ["🛌", "🍡😋"], a: "누워서 떡 먹기", lvl: 1, alt: ["누워서 떡먹기", "누워 떡 먹기"],
    m: "하기가 아주 쉬운 일.", d: "🛌 누워서 🍡 떡을 😋 먹는다" },
  { t: "속담", e: ["🕳️💧", "🐸"], a: "우물 안 개구리", lvl: 1, alt: ["우물 안의 개구리", "우물속 개구리", "우물 속 개구리"],
    m: "넓은 세상을 모르고 좁은 곳에서만 지내는 사람.", d: "🕳️💧 우물 안의 🐸 개구리" },
  { t: "속담", e: ["🐋⚔️🐋", "🦐💥"], a: "고래 싸움에 새우 등 터진다", lvl: 1, alt: ["고래 싸움에 새우등 터진다", "고래싸움에 새우등 터짐"],
    m: "강한 사람들 싸움에 약한 사람이 괜히 피해를 본다는 말.", d: "🐋 고래끼리 ⚔️ 싸우는데 🦐 새우 등이 💥 터진다" },

  // ── 보통 · 유형 섞기 ──
  { t: "사자성어", e: ["📝💪", "3️⃣📅", "🗑️"], a: "작심삼일", lvl: 2, alt: ["작심 삼일", "作心三日"],
    m: "단단히 먹은 마음이 사흘을 못 간다는 말. 새해 결심의 운명.", d: "📝 굳게 💪 마음먹어도(작심) 3️⃣📅 사흘(삼일)이면 🗑️ 끝" },
  { t: "영화 제목", e: ["❄️👑🏰", "👭⛄"], a: "겨울왕국", lvl: 2, alt: ["겨울 왕국", "겨울왕국2", "프로즌", "frozen"],
    m: "디즈니 애니메이션. 엘사와 안나, 올라프.", d: "❄️ 겨울 👑🏰 왕국, 👭 엘사·안나 자매와 ⛄ 올라프" },
  { t: "직장인 말", custom: true, e: ["🔪", "🏢🏃💨🏠"], a: "칼퇴", lvl: 2, alt: ["칼퇴근", "정시퇴근", "정시 퇴근"],
    m: "퇴근 시간이 되자마자 칼같이 퇴근하기.", d: "🔪 칼같이 🏢 회사에서 🏃💨 🏠 집으로 퇴근" },
  { t: "사자성어", e: ["1️⃣🪨", "2️⃣🐦🐦"], a: "일석이조", lvl: 2, alt: ["일석 이조", "一石二鳥", "일거양득"],
    m: "돌 하나로 새 두 마리를 잡듯, 한 번에 두 가지 이득을 보는 것.", d: "1️⃣ 돌 하나(일석)로 🪨 2️⃣ 새 두 마리(이조) 🐦🐦" },
  { t: "드라마 제목", e: ["📞🗣️❗", "1️⃣9️⃣8️⃣8️⃣"], a: "응답하라 1988", lvl: 2, alt: ["응답하라1988", "응답하라", "응답하라 88", "응답하라 천구백팔십팔", "응팔"],
    m: "쌍문동 골목 다섯 가족 이야기, 2015년 tvN 드라마.", d: "📞 여보세요, 🗣️❗ 응답하라 1️⃣9️⃣8️⃣8️⃣" },
  { t: "직장인 말", custom: true, e: ["⚖️", "💳"], a: "법인카드", lvl: 2, alt: ["법카", "법인 카드", "회사카드", "회사 카드"],
    m: "회사 돈으로 결제하는 카드. 오늘 회식비는 이걸로?", d: "⚖️ 법(法) + 인 + 💳 카드 = 법카" },

  // ── 어려움 · 유형 섞기 (40초, 점수 2배) ──
  { t: "사자성어", e: ["9️⃣☠️", "1️⃣💓"], a: "구사일생", lvl: 3, alt: ["구사 일생", "九死一生"],
    m: "아홉 번 죽을 뻔하다 한 번 살아난다, 죽을 고비를 겨우 넘김.", d: "9️⃣ 아홉 번 ☠️ 죽을 뻔(구사)하다 1️⃣ 한 번 💓 살아남(일생)" },
  { t: "영화 제목", e: ["🧟🧟‍♀️🧟‍♂️", "🚄💨"], a: "부산행", lvl: 3, alt: ["부산 행", "부산행 KTX", "train to busan"],
    m: "KTX 안에서 좀비를 피해 부산으로 가는 2016년 영화.", d: "🧟 좀비가 가득한 🚄 KTX, 목적지는 부산" },
  { t: "직장인 말", custom: true, e: ["🌙💰", "🎩🧐🦹"], a: "월급루팡", lvl: 3, alt: ["월급 루팡", "월급도둑", "월급 도둑", "세금루팡"],
    m: "하는 일 없이 월급만 챙겨 가는 사람(을 놀리는 말).", d: "🌙 월(月) + 💰 급 = 월급, 🎩🧐 괴도 🦹 루팡" },
  { t: "사자성어", e: ["🐲➡️🐍", "🎆➡️💨"], a: "용두사미", lvl: 3, alt: ["용두 사미", "龍頭蛇尾"],
    m: "시작은 용 머리처럼 거창하나 끝은 뱀 꼬리처럼 흐지부지함.", d: "🐲 용 머리(용두)로 시작해 🐍 뱀 꼬리(사미)로 끝, 🎆 화려하게 시작해 💨 흐지부지" },
  { t: "영화 제목", e: ["🍗🍗🍗", "🚓👮🕵️"], a: "극한직업", lvl: 3, alt: ["극한 직업"],
    m: "마약반 형사들이 위장 창업한 치킨집이 대박 나는 2019년 코미디 영화.", d: "🍗 치킨집을 차린 🚓👮 마약반 형사들" },

  // ── 예비 (동점 결승·교체용) ──
  { t: "속담", e: ["🐒🌳", "⬇️💥"], a: "원숭이도 나무에서 떨어진다", lvl: 1, reserve: true, alt: ["원숭이도 나무에서 떨어질 때가 있다"],
    m: "아무리 잘하는 사람도 실수할 때가 있다는 말.", d: "🐒 원숭이가 🌳 나무에서 ⬇️ 떨어진다" },
  { t: "드라마 제목", e: ["😭💧", "👑👸"], a: "눈물의 여왕", lvl: 2, reserve: true, alt: ["눈물의여왕"],
    m: "2024년 tvN 드라마. 재벌 3세 홍해인과 백현우.", d: "😭💧 눈물의 👑👸 여왕" },
  { t: "직장인 말", custom: true, e: ["🌙📅", "🤒😩"], a: "월요병", lvl: 2, reserve: true, alt: ["월요일병", "월요일 병"],
    m: "주말이 끝나고 월요일만 되면 몸과 마음이 아픈 병.", d: "🌙 월(月)요일 📅 만 되면 🤒 아픈 병" },
  { t: "사자성어", e: ["🐎👂", "🌬️💨"], a: "마이동풍", lvl: 3, reserve: true, alt: ["마이 동풍", "馬耳東風"],
    m: "말 귀에 동풍, 남의 말을 귀담아듣지 않고 흘려버림.", d: "🐎 말(마) 👂 귀(이)에 🌬️ 동쪽 바람(동풍)" },
  { t: "드라마 제목", e: ["🦑🎮", "🟢🔴🚦"], a: "오징어 게임", lvl: 2, reserve: true, alt: ["오징어게임"],
    m: "넷플릭스 드라마. 무궁화 꽃이 피었습니다.", d: "🦑 오징어 🎮 게임, 🟢 움직여 🔴 멈춰" },
];

// 본 게임 15문제(속담 4, 사자성어 4, 영화·드라마 제목 4, 직장인 말 3)와 예비 5문제. room.q 는 ALL 의 순번.
export const QUESTIONS = BANK.filter(q => !q.reserve);
export const RESERVE = BANK.filter(q => q.reserve);
export const ALL = [...QUESTIONS, ...RESERVE];
export const MAIN = QUESTIONS.length;
export const isReserve = i => i >= MAIN;

export const LVL_NAME = { 1: "쉬움", 2: "보통", 3: "어려움" };
export const DURATION_MS = 30000;   // 쉬움·보통 제한 시간
export const HARD_DURATION_MS = 40000; // 어려움 제한 시간
export const GRACE_MS = 2000;       // 마감 뒤 네트워크 지연 허용
export const HIDE_LAST = 3;         // 마지막 몇 문제는 순위를 가림
export const durationFor = q => (q.lvl === 3 ? HARD_DURATION_MS : DURATION_MS);
export const multFor = q => (q.lvl === 3 ? 2 : 1);  // 어려움 2배
// 초성 힌트 공개 시각: 운영자가 먼저 눌렀으면 그때, 아니면 제한 시간 절반
export function hintTime(startedAt, hintAt, duration) {
  if (startedAt == null) return hintAt ?? null;
  const auto = startedAt + duration / 2;
  return hintAt != null ? Math.min(hintAt, auto) : auto;
}

// 채점: 띄어쓰기와 문장부호를 빼고 비교, 정답이나 다른 표현과 85% 이상 같으면 정답.
// 오타 한두 글자 정도는 봐줍니다. 애매한 건 운영자가 정답 공개 화면에서 직접 바꿀 수 있어요.
export function normalize(s) {
  return String(s || "").normalize("NFC").replace(/[\s.,!?~'"“”‘’·…\-]/g, "").toLowerCase();
}
function lev(a, b) {
  a = [...a]; b = [...b];
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
// 정답(과 다른 표현) 중 가장 가까운 것과의 비슷한 정도 0~1. 1이면 똑같음.
export function similarity(q, text) {
  const t = normalize(text);
  if (!t) return 0;
  return Math.max(...[q.a, ...(q.alt || [])].map(ans => {
    const n = normalize(ans);
    if (t === n) return 1;
    return 1 - lev(t, n) / Math.max([...n].length, [...t].length);
  }));
}
export function isCorrect(q, text) {
  return similarity(q, text) >= 0.85;
}
// 오답 화면에서 글자를 가리는 기준: 정답과 이만큼 비슷하면 "아깝다"로만 보여 줌(정답 유출 방지)
export const CLOSE_HIDE = 0.5;

// 점수: 정답 100점(힌트 공개 뒤 제출은 50점) + 남은 시간 비율로 최대 50점, 어려움은 전체 2배
export function points({ at, startedAt, hintAt, duration = DURATION_MS, mult = 1 }) {
  if (at == null || startedAt == null) return 0;
  const h = hintTime(startedAt, hintAt, duration);
  const base = h != null && at >= h ? 50 : 100;
  const frac = Math.min(1, Math.max(0, 1 - (at - startedAt) / duration));
  return (base + Math.round(50 * frac)) * mult;
}

// 초성 힌트
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
export function chosung(str) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join("");
}
