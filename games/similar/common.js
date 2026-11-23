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
export const FEED_RECENT = 20;           // 모두의 추측: 최근 추측 몇 개까지 공개
export const FEED_EVERY_MS = 2000;       // 모두의 추측 갱신 간격 (Firestore 읽기 한도 보호)

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

// 단어 목록 (참가자 화면은 모르는 단어를 보내지 않으려고 이것만 받음, 약 200KB)
let wordsP = null;
export function loadWords() {
  if (!wordsP) wordsP = fetch(new URL("./data/words.json", import.meta.url)).then(r => {
    if (!r.ok) throw new Error("단어 목록을 받지 못했어요");
    return r.json();
  });
  return wordsP;
}
