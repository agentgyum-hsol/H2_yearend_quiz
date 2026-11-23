// '이게 내 이모지야' 문제. lvl 1 쉬움, 2 보통, 3 어려움.
// e: 이모지 줄들, a: 정답, alt: 정답으로 인정할 다른 표현, m: 뜻, d: 정답 공개 때 이모지 풀이
// reserve: true 는 본 게임에서 빼 둔 예비 문제. 1위 동점 결승이나 문제 교체용.
const BANK = [
  { e: ["🐄💨", "🏚️🔨"], a: "소 잃고 외양간 고친다", lvl: 1, alt: ["소 잃고 외양간 고치기"],
    m: "일이 이미 잘못된 뒤에야 손을 써 봐야 소용없다는 말.", d: "🐄 소가 💨 도망가고 나서 🏚️ 외양간을 🔨 고친다" },
  { e: ["🐒🌳", "⬇️💥"], a: "원숭이도 나무에서 떨어진다", lvl: 1, reserve: true, alt: ["원숭이도 나무에서 떨어질 때가 있다"],
    m: "아무리 잘하는 사람도 실수할 때가 있다는 말.", d: "🐒 원숭이가 🌳 나무에서 ⬇️ 떨어진다" },
  { e: ["🛌", "🍡😋"], a: "누워서 떡 먹기", lvl: 1, alt: [],
    m: "하기가 아주 쉬운 일.", d: "🛌 누워서 🍡 떡을 😋 먹는다" },
  { e: ["🕳️💧", "🐸"], a: "우물 안 개구리", lvl: 1, alt: ["우물 안의 개구리"],
    m: "넓은 세상을 모르고 좁은 곳에서만 지내는 사람.", d: "🕳️💧 우물 안의 🐸 개구리" },
  { e: ["🖼️", "🍡"], a: "그림의 떡", lvl: 1, reserve: true, alt: ["그림 속의 떡", "그림에 떡"],
    m: "마음에 들어도 가질 수 없는 것.", d: "🖼️ 그림 속의 🍡 떡" },
  { e: ["🐋⚔️🐋", "🦐💥"], a: "고래 싸움에 새우 등 터진다", lvl: 1, alt: [],
    m: "강한 사람들 싸움에 약한 사람이 괜히 피해를 본다는 말.", d: "🐋 고래끼리 ⚔️ 싸우는데 🦐 새우 등이 💥 터진다" },
  { e: ["☀️🗣️🐦", "🌙🗣️🐭"], a: "낮말은 새가 듣고 밤말은 쥐가 듣는다", lvl: 2, alt: [],
    m: "아무도 안 듣는 것 같아도 말이 새어 나가니 늘 말조심하라는 뜻.", d: "☀️ 낮 말은 🐦 새가, 🌙 밤 말은 🐭 쥐가 듣는다" },
  { e: ["3️⃣👶", "➡️", "8️⃣0️⃣👴"], a: "세 살 버릇 여든까지 간다", lvl: 2, alt: ["세살 버릇 여든 간다"],
    m: "어릴 때 든 버릇은 늙어서도 고치기 어렵다는 말.", d: "3️⃣ 세 살 👶 아기 버릇이 8️⃣0️⃣ 여든 👴 까지 간다" },
  { e: ["🌌⭐", "✋"], a: "하늘의 별 따기", lvl: 2, reserve: true, alt: ["하늘에 별 따기"],
    m: "이루기가 매우 어려운 일.", d: "🌌 하늘의 ⭐ 별을 ✋ 딴다" },
  { e: ["🐕💨🐓", "🏠⬆️👀"], a: "닭 쫓던 개 지붕 쳐다본다", lvl: 2, alt: ["닭 쫓던 개 지붕 쳐다보듯"],
    m: "애써 하던 일이 틀어져 어찌할 도리가 없게 된 처지.", d: "🐕 개가 🐓 닭을 쫓다가 🏠 지붕만 ⬆️👀 쳐다본다" },
  { e: ["🈳🛒", "📢📢"], a: "빈 수레가 요란하다", lvl: 2, alt: [],
    m: "실속 없는 사람이 더 떠들어 댄다는 말.", d: "🈳 빈 🛒 수레가 📢 시끄럽다" },
  { e: ["🪨🌉", "✊✊", "🚶"], a: "돌다리도 두들겨 보고 건너라", lvl: 2, alt: ["돌다리도 두드려 보고 건너라"],
    m: "잘 아는 일이라도 한 번 더 확인하고 조심하라는 말.", d: "🪨🌉 돌다리도 ✊ 두들겨 보고 🚶 건너라" },
  { e: ["🐯💬", "🚪🐯"], a: "호랑이도 제 말 하면 온다", lvl: 2, alt: ["호랑이도 제 말하면 온다"],
    m: "그 자리에 없는 사람 이야기를 하면 마침 그 사람이 나타난다는 말.", d: "🐯 호랑이 💬 얘기를 하니 🚪 호랑이가 온다" },
  { e: ["🪔⬇️", "🌑"], a: "등잔 밑이 어둡다", lvl: 2, reserve: true, alt: [],
    m: "가까이 있는 것을 오히려 잘 모른다는 말.", d: "🪔 등잔 ⬇️ 밑이 🌑 어둡다" },
  { e: ["🫘🌱🫘", "🔴🌱🔴"], a: "콩 심은 데 콩 나고 팥 심은 데 팥 난다", lvl: 3, alt: ["콩 심은 데 콩 난다"],
    m: "모든 일은 원인에 따라 결과가 나온다는 말.", d: "🫘 콩 🌱 심으면 🫘 콩, 🔴 팥 🌱 심으면 🔴 팥" },
  { e: ["🌫️➕🌫️➕🌫️", "🟰🏔️"], a: "티끌 모아 태산", lvl: 3, alt: [],
    m: "작은 것도 모이면 큰 것이 된다는 말.", d: "🌫️ 티끌을 ➕ 모으면 🏔️ 태산" },
  { e: ["🚫🦶🐎", "💨", "1️⃣0️⃣0️⃣0️⃣📏"], a: "발 없는 말이 천 리 간다", lvl: 3, alt: ["발없는 말이 천리 간다"],
    m: "말은 순식간에 멀리 퍼지니 말을 조심하라는 뜻.", d: "🚫🦶 발 없는 🐎 말(言)이 1️⃣0️⃣0️⃣0️⃣ 천 리를 💨 간다" },
  { e: ["🐄👂", "📖🙏"], a: "소 귀에 경 읽기", lvl: 3, alt: [],
    m: "아무리 가르치고 일러 줘도 알아듣지 못한다는 말.", d: "🐄 소 👂 귀에 📖 경을 🙏 읽어 준다" },
  { e: ["🔟🪓", "🌳❌"], a: "열 번 찍어 안 넘어가는 나무 없다", lvl: 3, alt: [],
    m: "여러 번 계속 노력하면 결국 이룬다는 말.", d: "🔟 열 번 🪓 찍으면 🌳 안 넘어가는 나무 ❌ 없다" },
  { e: ["🪡🦹", "➡️", "🐄🦹"], a: "바늘 도둑이 소 도둑 된다", lvl: 3, reserve: true, alt: [],
    m: "작은 나쁜 짓도 버릇이 되면 큰 죄를 짓게 된다는 말.", d: "🪡 바늘 🦹 도둑이 ➡️ 🐄 소 🦹 도둑이 된다" },
];

// 본 게임 15문제(쉬움 4, 보통 6, 어려움 5)와 예비 5문제. room.q 는 ALL 의 순번.
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
export function isCorrect(q, text) {
  const t = normalize(text);
  if (!t) return false;
  return [q.a, ...(q.alt || [])].some(ans => {
    const n = normalize(ans);
    if (t === n) return true;
    const len = Math.max([...n].length, [...t].length);
    return 1 - lev(t, n) / len >= 0.85;
  });
}

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
