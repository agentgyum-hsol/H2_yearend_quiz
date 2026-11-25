// '이게 제 이모지야👽' 문제. lvl 1 쉬움, 2 보통, 3 어려움.
// e: 이모지 줄들, a: 정답, alt: 정답으로 인정할 다른 표현(넉넉히), m: 뜻, d: 정답 공개 때 이모지 풀이
// t: 문제 유형. 운영자·참가자 화면 위에 그대로 표시됩니다 (속담, 사자성어, 노래 가사, 유행어, 드라마 제목, 넌센스 …).
// img: 정답 공개 때 큰 화면에 띄울 사진 {src, credit, fallback?}. 못 불러오면 사진 자리만 빠지고 나머지는 그대로 나와요.
//   가수·인물 사진은 저작권 걱정이 없도록 Wikimedia Commons(자유 이용 사진)에서 링크합니다.
// reserve: true 는 본 게임에서 빼 둔 예비 문제. 1위 동점 결승이나 문제 교체용.
// 순서가 곧 출제 순서: 속담 워밍업(쉬움 4) → 유형 섞기(보통 6) → 넌센스(어려움 5, 40초·2배).
// 문제를 바꿀 때는 같은 모양으로 t·e·a·alt·m·d(·img) 만 바꾸면 됩니다.
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

  // ── 보통 · 유형 섞기 (사자성어, 노래 가사, 유행어, 드라마) ──
  { t: "사자성어", e: ["📝💪", "3️⃣📅", "🗑️"], a: "작심삼일", lvl: 2, alt: ["작심 삼일", "作心三日"],
    m: "단단히 먹은 마음이 사흘을 못 간다는 말. 새해 결심의 운명.", d: "📝 굳게 💪 마음먹어도(작심) 3️⃣📅 사흘(삼일)이면 🗑️ 끝" },
  { t: "노래 가사", e: ["🙋‍♀️", "👨❤️😍", "🤷‍♀️❓"], a: "나는요 오빠가 좋은걸 어떡해", lvl: 2,
    alt: ["나는요 오빠가 좋은 걸 어떡해", "나는 오빠가 좋은걸 어떡해", "오빠가 좋은걸 어떡해", "나는요 오빠가 좋은걸", "나는요 오빠가 좋은 걸 어떡해요"],
    m: "아이유 '좋은 날'(2010) 후렴, 바로 뒤에 3단 고음이 나와요.", d: "🙋‍♀️ 나는요 👨 오빠가 ❤️😍 좋은걸 🤷‍♀️ 어떡해",
    img: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/IU_at_SBS_Gayo_Daejun_2010_01.JPG?width=640", credit: "사진: Wikimedia Commons · IU at SBS Gayo Daejun 2010 01.JPG" } },
  { t: "유행어", e: ["🍀🤞", "🍞⏳😆✨"], a: "럭키비키", lvl: 2, alt: ["럭키비키잖아", "완전 럭키비키잖아", "완전 럭키비키", "럭키 비키"],
    m: "아이브 장원영의 초긍정 화법(원영적 사고)에서 퍼진 말. 앞사람이 마지막 빵을 사 가도 '갓 구운 빵을 받으니 완전 럭키비키잖아!'", d: "🍀 럭키(Lucky) + 🍞 기다린 덕에 갓 구운 빵 😆 = 럭키비키",
    img: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/20231002_Jang_Won-young_(장원영).jpg?width=640", credit: "사진: Wikimedia Commons · 20231002 Jang Won-young (장원영).jpg" } },
  { t: "드라마 제목", e: ["📞🗣️❗", "1️⃣9️⃣8️⃣8️⃣"], a: "응답하라 1988", lvl: 2, alt: ["응답하라1988", "응답하라", "응답하라 88", "응답하라 천구백팔십팔", "응팔"],
    m: "쌍문동 골목 다섯 가족 이야기, 2015년 tvN 드라마.", d: "📞 여보세요, 🗣️❗ 응답하라 1️⃣9️⃣8️⃣8️⃣" },
  { t: "노래 가사", e: ["👨‍🦱👉", "🏙️🌉💃", "🐴🕺"], a: "오빤 강남스타일", lvl: 2,
    alt: ["오빤강남스타일", "오빤 강남 스타일", "오빠는 강남스타일", "강남스타일", "오빤 강남스타일이야"],
    m: "싸이 '강남스타일'(2012). 말춤으로 세계를 휩쓴 노래.", d: "👨‍🦱👉 오빤 🏙️🌉 강남 💃🐴🕺 스타일 (말춤)",
    img: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/Psy_2012.jpg?width=640", credit: "사진: Wikimedia Commons · Psy 2012.jpg" } },
  { t: "유행어", e: ["💎❗", "🙅‍♂️🌿↘️", "💓"], a: "중요한 건 꺾이지 않는 마음", lvl: 2,
    alt: ["중꺾마", "중요한건 꺾이지 않는 마음", "중요한 것은 꺾이지 않는 마음", "중요한 건 꺾이지 않는 마음이다", "중요한건 꺾이지않는 마음"],
    m: "2022 롤드컵, DRX 데프트 선수 인터뷰 기사 제목에서 퍼진 말. DRX는 그해 우승까지 했어요.", d: "💎 중요한 건 🙅‍♂️ 꺾이지(🌿↘️) 않는 💓 마음 = 중꺾마",
    img: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/Deft_interview_in_2022.jpg?width=640", credit: "사진: Wikimedia Commons · Deft interview in 2022.jpg" } },

  // ── 어려움 · 넌센스 (40초, 점수 2배) ──
  // 이모지를 곧이곧대로 읽으면 안 되고, 말장난으로 풀어야 해요.
  { t: "넌센스", e: ["🐄", "🎤🎶"], a: "소송", lvl: 3, alt: ["소 송", "소쏭", "소song"],
    m: "소가 노래하면? 소 + 송(song) = 소송", d: "🐄 소가 🎤🎶 노래(song)하면 = 소송" },
  { t: "넌센스", e: ["🦆", "🧊🥶"], a: "언덕", lvl: 3, alt: ["언 덕", "언duck", "언 duck"],
    m: "오리가 얼면? 언(얼은) + 덕(duck) = 언덕", d: "🦆 오리(duck)가 🧊🥶 얼면 = 언 덕" },
  { t: "넌센스", e: ["🐶", "👨‍🏫📚"], a: "개인지도", lvl: 3, alt: ["개인 지도", "개인교습"],
    m: "개가 사람을 가르치면? 개 + 인(사람) + 지도 = 개인지도", d: "🐶 개가 👨‍🏫📚 사람을 지도하면 = 개인지도" },
  { t: "넌센스", e: ["👑🚶", "🍌🫠💥"], a: "킹콩", lvl: 3, alt: ["킹 콩", "킹콩!"],
    m: "왕이 넘어지면? 킹(King)이 '콩!' = 킹콩", d: "👑 King이 🍌 바나나 밟고 💥 콩! 넘어지면 = 킹콩" },
  { t: "넌센스", e: ["📉📉", "👑💸"], a: "최저임금", lvl: 3, alt: ["최저 임금", "최저시급"],
    m: "세상에서 가장 가난한 왕은? 최저 + 임금(왕) = 최저임금", d: "📉 가장 낮은(최저) 👑 임금(왕) 💸 = 최저임금" },

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

// 본 게임 15문제(쉬움 속담 4, 보통 사자성어·노래 가사 2·유행어 2·드라마 6, 어려움 넌센스 5)와 예비 5문제. room.q 는 ALL 의 순번.
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
