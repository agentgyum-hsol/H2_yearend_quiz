// 이모지 퀴즈 운영자·참가자 화면 공통 도우미
// 데이터 구조
//   rooms/emoji                     {phase: lobby|question|reveal|final, q, startedAt, hintAt, duration}
//   rooms/emoji/answers/{q}_{pid}   {pid, nick, q, text, at}
//   rooms/emoji/results/{q}         {marks: {pid: {ok, pts, auto}}}   운영자가 정답 공개 때 씀
//   rooms/emoji/scores/{pid}        {nick, score, correct, timeMs}    운영자가 합계를 다시 계산해 씀
//   timeMs: 맞힌 문제들의 제출까지 걸린 시간 합계. 점수와 맞힌 개수가 같으면 이게 짧은 사람이 앞.

export const ROOM = ["rooms", "emoji"];

export function loadStyle() {
  const href = new URL("./style.css", import.meta.url).href;
  if (![...document.querySelectorAll("link")].some(l => l.href === href)) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
}

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 점수 높은 순, 같으면 맞힌 개수, 그래도 같으면 걸린 시간 합계가 짧은 순. 셋 다 같아야 공동 등수.
export function ranked(scores) {
  const t = r => r.timeMs ?? Infinity;
  const rows = [...scores].sort((a, b) => b.score - a.score || b.correct - a.correct || t(a) - t(b) || String(a.nick).localeCompare(b.nick, "ko"));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    const key = r.score + ":" + r.correct + ":" + t(r);
    if (key !== prev) { rank = i + 1; prev = key; }
    r.rank = rank;
  });
  return rows;
}

// 정답 공개 사진. img = {src, credit, fallback?}. 사진을 못 불러오면 fallback 으로 한 번 더, 그래도 안 되면 사진 자리를 지움.
export function photoHtml(img, cls = "eh-photo") {
  if (!img?.src) return "";
  const fb = img.fallback ? ` data-fb="${esc(img.fallback)}"` : "";
  return `<figure class="${cls}"><img src="${esc(img.src)}"${fb} alt="" referrerpolicy="no-referrer" decoding="async"
    onerror="if(this.dataset.fb){this.src=this.dataset.fb;delete this.dataset.fb}else{this.closest('figure').remove()}">
    ${img.credit ? `<figcaption>${esc(img.credit)}</figcaption>` : ""}</figure>`;
}
