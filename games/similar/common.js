// H2맨틀: 운영자·참가자 화면 공통
//
// 규칙: 운영자가 라운드마다 비밀 단어를 정합니다. 참가자는 단어를 추측하고, 추측할 때마다
// 비밀 단어와의 유사도와 순위를 받습니다. 가까운 단어를 따라가 비밀 단어를 맞히면 됩니다.
// 유사도는 미리 학습된 한국어 단어 벡터(spaCy ko_core_news_lg, floret 300차원)로 계산한 값이라
// 같은 단어는 언제나 같은 점수가 나옵니다. 비밀 단어는 운영자 브라우저에만 있고, 채점도 운영자 화면이 합니다.
//
// 데이터 구조
//   rooms/similar                         {phase: lobby|round|reveal|final, round, startedAt, duration, hints: [{r, w}], finalStep}
//   rooms/similar/guesses/{gid}           {pid, nick, round, word, at}     참가자가 씀
//   rooms/similar/feedback/{round}_{pid}  {round, list: [{w, s, r}], solvedMs, n}   운영자가 채점해 씀
//   rooms/similar/feed/current            {round, top: [{w, s, r, nick}], recent: [{w, s, r, nick} | {nick, hit}], solved: [nick], total}  모두의 추측 (정답 단어는 빠짐)
//   rooms/similar/rounds/{round}          {answer, top: [{w, s}], marks: {pid: {solved, t, best, bestW, pts}}}  정답 공개 때
//   rooms/similar/board/current           {round, rows: [{id, nick, score, solves, timeMs, rank, last}]}  정답 공개 때
//   s: 유사도 x100 (소수 둘째 자리), r: 순위 (0 = 정답, 1 = 가장 가까운 단어, 1000 넘으면 null)

export const ROOM = ["rooms", "similar"];
export const GAME_ID = "similar";
export const TITLE = "H2맨틀";
export const ROUNDS = 3;                 // [가정] 3라운드
export const DURATION_MS = 5 * 60_000;   // [가정] 라운드당 5분
export const EXTEND_MS = 60_000;         // 1분 연장 버튼
export const GRACE_MS = 2000;            // 마감 직후 도착한 추측 허용
export const RANK_CUTOFF = 1000;         // 이 순위 밖은 "1000위 밖"
export const MIN_GAP_MS = 1500;          // 한 사람의 추측 간격 (Firestore 쓰기 한도 보호)
export const HINT_RANKS = [100, 30, 10]; // 운영자가 차례로 공개할 수 있는 힌트 순위
export const FEED_TOP = 30;              // 모두의 추측: 가까운 단어 몇 개까지 공개
export const FEED_RECENT = 1;            // 방금 들어온 추측: 운영자 큰 화면에만 1개
export const FEED_EVERY_MS = 2000;       // 모두의 추측 갱신 간격 (Firestore 읽기 한도 보호)
export const TOP_SIM_MIN = 0.90;         // 가장 가까운 단어(1위)의 유사도가 이보다 낮으면 전체를 같은 비율로 올림 (순위는 그대로)
export const HINT_FLASH_MS = 10_000;     // 새 힌트가 반짝이는 시간

// [가정] 점수: 맞힌 순서대로 100, 98, 96 … 최소 50. 못 맞히면 가장 가까이 간 순위로 부분 점수.
export function solvePoints(order) { return Math.max(50, 100 - 2 * order); }
export function nearPoints(best) {
  if (best == null) return 0;
  if (best <= 10) return 30;
  if (best <= 100) return 20;
  if (best <= 1000) return 10;
  return 0;
}

export function loadStyle() {
  const href = new URL("./style.css", import.meta.url).href;
  if (![...document.querySelectorAll("link")].some(l => l.href === href)) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
}

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 띄어쓰기·문장부호 제거. 단어 목록은 한글 낱말만 있음.
export const norm = s => String(s ?? "").normalize("NFC").replace(/[^가-힣a-zA-Z0-9]/g, "");

// 유사도 표시: 100 = 정답
export const fmtSim = s => (s == null ? "-" : s.toFixed(2));
export const fmtRank = r => (r === 0 ? "정답" : r == null ? `${RANK_CUTOFF}위 밖` : `${r}위`);
// 막대 길이 0~1: 순위 기준 (1000위 밖은 0)
export const heat = r => (r === 0 ? 1 : r == null ? 0 : Math.max(0.04, 1 - Math.log10(r) / 3));

// 순위 막대: 가운데에서 한 덩어리로 차오르다가 두 블럭으로 갈라지며 양옆으로 늘어남.
// 목록은 2초마다 다시 그려지므로, 처음 보이는 단어만 움직이고 이미 본 단어는 그대로 둠.
const seenBars = new Set();
export function bar(r, key) {
  const h = heat(r);
  const c = h >= 0.75 ? "var(--dancheong)" : h >= 0.45 ? "var(--gold)" : "#6f95ff";
  let cls = "bar";
  if (h === 0) cls += " empty";
  else if (key != null && !seenBars.has(key)) { seenBars.add(key); cls += " grow"; }
  return `<span class="${cls}" style="--w:${(h * 100).toFixed(1)}%;--c:${c}"><i class="L"></i><i class="R"></i></span>`;
}

// 힌트 반짝임: 처음 본 때부터 HINT_FLASH_MS 동안. 다시 그려져도 이어서 반짝이도록 지난 시간만큼 앞당겨 시작.
const hintSeen = new Map();
export function hintFlash(h) {
  const k = `${h.r}:${h.w}`;
  if (!hintSeen.has(k)) hintSeen.set(k, h.at && Date.now() - h.at > 60_000 ? 0 : Date.now()); // 새로고침 때 오래된 힌트는 반짝이지 않음
  const el = Date.now() - hintSeen.get(k);
  return el < HINT_FLASH_MS ? ` flash" style="animation-delay:-${el}ms` : "";
}

// 점수 → 맞힌 라운드 수 → 맞힌 시간 합계. 셋 다 같아야 공동 등수.
export function ranked(rows) {
  const t = r => r.timeMs ?? Infinity;
  const out = [...rows].sort((a, b) => b.score - a.score || b.solves - a.solves || t(a) - t(b) || String(a.nick).localeCompare(b.nick, "ko"));
  let rank = 0, prev = null;
  out.forEach((r, i) => {
    const key = r.score + ":" + r.solves + ":" + t(r);
    if (key !== prev) { rank = i + 1; prev = key; }
    r.rank = rank;
  });
  return out;
}

// 단어 목록 (참가자 화면은 모르는 단어를 보내지 않으려고 이것만 받음, 약 650KB)
// data/words.json = {core, words}: 앞쪽 core개는 순위·힌트에 쓰는 기본 명사, 뒤쪽은 받아만 주는 단어(명사·동사·형용사·합성어)
let wordsP = null;
export function loadWords() {
  if (!wordsP) wordsP = fetch(new URL("./data/words.json", import.meta.url)).then(r => {
    if (!r.ok) throw new Error("단어 목록을 받지 못했어요");
    return r.json();
  }).then(d => (Array.isArray(d) ? { core: d.length, words: d } : d));
  wordsP.catch(() => { wordsP = null; });
  return wordsP;
}

// 목록에 없는 입력을 목록 단어로 바꿔 보기. 참가자 화면과 운영자 화면이 같은 규칙을 씀.
//   1) 그대로   2) 조사·복수 떼기 (고양이가 → 고양이, 친구들이랑 → 친구)
//   3) 동사·형용사 활용 → 기본형 (먹었어 → 먹다, 행복해요 → 행복하다)
//   4) 두 단어 합성어 (인공지능 → 인공+지능): 운영자 화면이 두 단어 벡터의 합으로 채점
// 돌려주는 값: {w, parts?} 또는 null
const JOSA = ["에서부터", "으로부터", "에게서", "한테서", "으로서", "으로써", "이라고", "이라는", "에서는", "에서도", "에게는", "까지", "부터", "처럼", "보다", "마다", "조차", "에서", "에게", "한테", "께서",
  "으로", "이랑", "이나", "이든", "이며", "하고", "라고", "라는", "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "만", "랑", "나", "요", "들", "님"];
const ENDINGS = [["했습니다", "하다"], ["합니다", "하다"], ["했어요", "하다"], ["해요", "하다"], ["했다", "하다"], ["했어", "하다"], ["하는", "하다"], ["하게", "하다"], ["하고", "하다"], ["하기", "하다"], ["해서", "하다"], ["해", "하다"], ["한", "하다"], ["함", "하다"],
  ["습니다", "다"], ["었어요", "다"], ["았어요", "다"], ["었다", "다"], ["았다", "다"], ["었어", "다"], ["았어", "다"], ["어요", "다"], ["아요", "다"], ["는", "다"], ["고", "다"], ["기", "다"], ["게", "다"], ["지", "다"], ["네", "다"], ["음", "다"], ["어", "다"], ["아", "다"]];
export function resolve(raw, has) {
  const w = norm(raw);
  if (!w) return null;
  if (has(w)) return { w };
  const strip = s => { for (const j of JOSA) if (s.length > j.length && s.endsWith(j)) { const b = s.slice(0, -j.length); if (has(b)) return b; } return null; };
  let b = strip(w);
  if (b) return { w: b };
  for (const j of JOSA) if (w.length > j.length && w.endsWith(j)) { b = strip(w.slice(0, -j.length)); if (b) return { w: b }; } // 친구들이랑
  for (const [e, to] of ENDINGS) if (w.length > e.length && w.endsWith(e)) { b = w.slice(0, -e.length) + to; if (has(b)) return { w: b }; }
  // 합성어: 앞뒤 모두 목록에 있는 가장 고른 나누기. 한쪽은 두 글자 이상, 앞쪽은 동사·형용사가 아님
  const split = s => {
    let best = null;
    for (let i = 1; i < s.length; i++) {
      const a = s.slice(0, i), c = s.slice(i);
      if (Math.max(a.length, c.length) < 2 || a.endsWith("다") || !has(a) || !has(c)) continue;
      const sc = Math.min(a.length, c.length);
      if (!best || sc > best.sc) best = { sc, parts: [a, c] };
    }
    return best;
  };
  if (w.length >= 3 && w.length <= 8) {
    let sp = split(w);
    if (sp) return { w, parts: sp.parts };
    for (const j of JOSA) if (w.length - j.length >= 3 && w.endsWith(j)) { const s = w.slice(0, -j.length); sp = split(s); if (sp) return { w: s, parts: sp.parts }; }
  }
  return null;
}
