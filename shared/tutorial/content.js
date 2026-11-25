// 게임별 단계형 설명(사전 라운드) 내용.
// 규칙 숫자는 각 게임 파일의 상수를 그대로 읽어서, 게임 규칙을 바꾸면 설명도 같이 바뀝니다.
// 게임 파일을 못 읽어도 설명은 뜨도록 기본값을 둡니다.
//
// 단계 모양: { title, big(live) → 큰 화면 HTML, phone → 휴대폰 HTML, practice? }
//   practice = { id, phase: "play" | "hint" | "reveal" }  같은 id 끼리는 휴대폰 입력이 이어집니다.
//   live = { docs: [연습 기록] }  연습 기록은 rooms/tutorial/practice/{pid} (tutorial.js 참고)
import { GAMES } from "../games.js";

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const load = p => import(p).catch(e => { console.warn("tutorial: 규칙을 못 읽음", p, e); return {}; });
const sec = ms => Math.round(ms / 1000);
const li = arr => `<ul class="rules tu-rules">${arr.map(t => `<li>${t}</li>`).join("")}</ul>`;
const big = (e, cls = "") => `<div class="tu-emoji ${cls}" aria-hidden="true">${e}</div>`;

export async function loadTutorial(gameId) {
  const g = GAMES.find(x => x.id === gameId) || { id: gameId, title: gameId, emoji: "🎲" };
  const make = { similar: similarSteps, emoji: emojiSteps, invest: investSteps }[gameId];
  const steps = make ? await make(g) : [];
  steps.push({
    title: "준비 끝!",
    big: () => `${big("🎉")}<p class="tu-lead">연습은 점수에 들어가지 않아요.<br>이제 진짜 <b>${esc(g.title)}</b> 시작합니다!</p>`,
    phone: `<p class="tu-lead">연습 끝! 곧 진짜 게임이 시작돼요.</p>`,
  });
  return { id: g.id, title: g.title, emoji: g.emoji, steps };
}

// 연습 기록 중 이 게임 것만, 먼저 낸 순서로
const byAt = docs => [...docs].sort((a, b) => (a.at || 0) - (b.at || 0));
const chips = (names, max = 24) => names.length
  ? `<div class="tu-chips">${names.slice(0, max).map(n => `<span>${esc(n)}</span>`).join("")}${names.length > max ? `<span>+${names.length - max}</span>` : ""}</div>`
  : "";

// ───────────────────────── H2맨틀 ─────────────────────────
async function similarSteps(g) {
  const C = await load("../../games/similar/common.js");
  const P = await import("./similar-practice.js");
  const S = await load("../../games/similar/practice.js");
  const ROUNDS = C.ROUNDS ?? 3, MIN = sec(C.DURATION_MS ?? 300000) / 60, CUT = C.RANK_CUTOFF ?? 1000;
  const HINTS = C.HINT_RANKS ?? [100, 30, 10], TOP = C.TOP_SIM_MIN ?? 0.8;
  const solve = C.solvePoints || (o => Math.max(50, 100 - 2 * o));
  const near = C.nearPoints || (b => (b <= 10 ? 30 : b <= 100 ? 20 : b <= 1000 ? 10 : 0));
  const p = similarPractice(P, TOP, C.norm, C.resolve);
  const row = (w, x) => similarRow(w, x, CUT);
  const table = rows => `<table class="tu-table"><thead><tr><th>추측</th><th>유사도</th><th>순위</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  const ex = ["바캉스", "산타", "성탄절"].map(w => row(esc(w), p.lookup(w)));

  return [
    { title: `${g.title}`, big: () => `${big(g.emoji)}<p class="tu-lead">비밀 단어 하나를 <b>추리</b>하는 게임이에요.</p>${li([`모두 ${ROUNDS}라운드, 라운드마다 ${MIN}분`, "비밀 단어는 진행자만 알아요", "휴대폰에 단어를 넣을 때마다 얼마나 가까운지 알려 줘요"])}`,
      phone: li([`${ROUNDS}라운드, 라운드마다 ${MIN}분`, "비밀 단어를 추리해서 맞히세요"]) },
    { title: "단어를 넣으면 이렇게 나와요", big: () => `<p class="tu-lead">비밀 단어가 <b>?</b>일 때 예시</p>${table(ex)}${li(["<b>유사도</b>: 뜻이 가까울수록 높아요. 100이면 정답", `<b>순위</b>: 비밀 단어와 가장 가까운 단어가 1위. ${CUT}위 밖이면 멀어요`, "추측은 몇 번이든 괜찮아요"])}`,
      phone: table(ex) + li(["유사도가 높을수록, 순위가 1에 가까울수록 정답에 가까워요"]) },
    { title: "다른 사람 추측도 힌트예요", big: () => `${big("👀")}${li(["큰 화면과 휴대폰에 <b>모두의 추측</b>이 순위대로 떠요", "남이 찾은 가까운 단어를 보고 방향을 잡으세요", `막히면 진행자가 <b>${HINTS.join("위, ")}위</b> 단어를 차례로 힌트로 공개해요`])}`,
      phone: li(["다른 사람의 가까운 추측을 보고 방향을 잡으세요", "진행자가 힌트 단어를 공개하기도 해요"]) },
    { title: "점수와 우승", big: () => `${li([`맞히면 <b>${solve(0)}점</b>, 다음 사람부터 ${solve(0) - solve(1)}점씩 줄어 최소 ${solve(99)}점`, `못 맞혀도 가장 가까이 간 순위로 부분 점수: 10위 안 ${near(10)}점, 100위 안 ${near(100)}점, ${CUT}위 안 ${near(CUT)}점`, `${ROUNDS}라운드 합계 1등이 우승. 같으면 맞힌 라운드 수, 그다음 걸린 시간`])}`,
      phone: li([`맞히면 ${solve(0)}점부터, 빨리 맞힐수록 높아요`, "못 맞혀도 가까이 가면 부분 점수", `${ROUNDS}라운드 합계로 우승`]) },
    { title: "연습 라운드", practice: { id: "similar", phase: "play" },
      // 본 게임과 같은 화면 (games/similar/practice.js). 운영자 화면이 연습 기록을 모아 휴대폰용 모두의 추측을 씀
      big: live => (S.practiceBig ? S.practiceBig(live.docs) : similarBoard(live.docs, row, table)),
      sync: (docs, ctx) => S.syncPracticeFeed && S.syncPracticeFeed(docs, ctx),
      phone: "" },
    { title: "연습 정답 공개", practice: { id: "similar", phase: "reveal" },
      big: live => { const solved = byAt(live.docs.filter(d => d.solved)).map(d => d.nick);
        return `<p class="tu-answer">${esc(P.WORD)}</p>${solved.length ? `<p class="tu-lead">맞힌 사람 ${solved.length}명</p>${chips(solved)}` : ""}<p class="muted" style="margin:6px 0">가장 가까운 단어</p>${table(p.top(8).map(x => row(esc(x.w), x)))}`; },
      phone: "" },
  ];
}

// 유사도 표 한 줄. w 는 이미 HTML 로 만든 글자(이름 표시용)일 수 있어 호출하는 쪽에서 esc 합니다.
export function similarRow(w, x, CUT = 1000) {
  const r = x?.r;
  const heat = r === 0 ? 1 : r == null ? 0 : Math.max(.04, 1 - Math.log10(r) / 3);
  return `<tr class="${r === 0 ? "hit" : ""}"><td>${w}</td><td class="mono">${x?.s != null ? x.s.toFixed(2) : "-"}</td><td class="mono">${r === 0 ? "정답" : r == null ? `${CUT}위 밖` : r + "위"}</td><td><i class="tu-heat" style="--h:${heat}"></i></td></tr>`;
}
export function similarPractice(P, TOP, norm, resolve) {
  const n = norm || (s => String(s ?? "").normalize("NFC").replace(/[^가-힣a-zA-Z0-9]/g, ""));
  const top = P.NEAR[0]?.[1] || 1;
  const boost = top > 0 && top < TOP ? TOP / top : 1;
  const map = new Map(P.NEAR.map(([w, s], i) => [w, { w, s: Math.min(99.99, Math.round(s * boost * 10000) / 100), r: i + 1 }]));
  const has = w => w === P.WORD || map.has(w);
  return {
    word: P.WORD,
    // 정답이면 {r: 0}, 표에 있으면 {w, s, r}, 없으면 {w, r: null}
    lookup(raw) {
      let w = n(raw);
      if (!w) return null;
      if (!has(w) && resolve) { const hit = resolve(raw, has); if (hit && !hit.parts) w = hit.w; }
      if (w === P.WORD) return { w, s: 100, r: 0 };
      return map.get(w) || { w, s: null, r: null };
    },
    top: k => P.NEAR.slice(0, k).map(([w]) => map.get(w)),
  };
}
function similarBoard(docs, row, table) {
  // 각자 가장 가까웠던 추측들을 모아 가까운 순으로
  const all = [];
  docs.forEach(d => (d.best || []).forEach(x => all.push({ ...x, nick: d.nick })));
  const seen = new Set();
  const rows = all.filter(x => x.r > 0).sort((a, b) => a.r - b.r).filter(x => !seen.has(x.w) && seen.add(x.w)).slice(0, 8);
  const solved = byAt(docs.filter(d => d.solved)).map(d => d.nick);
  const tries = docs.reduce((s, d) => s + (d.tries || 0), 0);
  return `<div class="tu-live"><span class="pill">참여 ${docs.length}명</span><span class="pill">추측 ${tries}번</span><span class="pill good">맞힘 ${solved.length}명</span></div>
    ${rows.length ? table(rows.map(x => row(`${esc(x.w)} <small class="muted">${esc(x.nick)}</small>`, x))) : `<p class="muted">아직 추측이 없어요. 휴대폰에 아무 단어나 넣어 보세요.</p>`}
    ${solved.length ? `<p class="muted" style="margin:8px 0 4px">맞힌 사람 (정답은 비밀!)</p>${chips(solved)}` : ""}`;
}

// ───────────────────────── 이모지 ─────────────────────────
// 연습 문제는 본 게임 문제와 겹치지 않게 따로 둡니다.
export const EMOJI_PRACTICE = { t: "속담", e: ["🐎➡️💬😊", "🐎⬅️💬😊"], a: "가는 말이 고와야 오는 말이 곱다",
  alt: ["가는말이 고와야 오는말이 곱다", "가는 말이 고와야 오는 말도 곱다", "가는 말이 고우면 오는 말도 곱다"],
  d: "🐎 가는 말(言)이 💬😊 고와야, 🐎 오는 말도 💬😊 곱다" };

async function emojiSteps(g) {
  const Q = await load("../../games/emoji/questions.js");
  const N = Q.MAIN ?? 15, HIDE = Q.HIDE_LAST ?? 3, T1 = sec(Q.DURATION_MS ?? 30000), T3 = sec(Q.HARD_DURATION_MS ?? 40000);
  const qs = Q.QUESTIONS || [];
  const lv = k => qs.filter(q => q.lvl === k).length;
  const types = [...new Set(qs.map(q => q.t).filter(Boolean))];
  const cho = Q.chosung ? Q.chosung(EMOJI_PRACTICE.a) : "";
  const P = EMOJI_PRACTICE;
  const emo = (lines, cls = "") => `<div class="tu-emoji ${cls}" aria-hidden="true">${lines.map(l => `<div>${l}</div>`).join("")}</div>`;
  return [
    { title: g.title, big: () => `${big(g.emoji)}<p class="tu-lead">이모지만 보고 정답을 맞히는 게임이에요.</p>${li([`모두 ${N}문제${qs.length ? ` (쉬움 ${lv(1)}, 보통 ${lv(2)}, 어려움 ${lv(3)})` : ""}`, "1인 1폰, 각자 풀어요"])}`,
      phone: li([`${N}문제, 각자 휴대폰으로 풀어요`]) },
    { title: "이렇게 풀어요", big: () => `<span class="pill">예시 · 속담</span>${emo(["⏰🌅🐦", "🐛🍽️"])}<p class="tu-lead">→ 일찍 일어나는 새가 벌레를 잡는다</p>${li(["휴대폰 입력칸에 정답을 쓰고 보내요", "<b>띄어쓰기는 상관없어요</b>. 오타 한두 글자도 봐줘요"])}`,
      phone: `<p class="tu-emoji-s">⏰🌅🐦 🐛🍽️</p><p>→ 일찍 일어나는 새가 벌레를 잡는다</p>${li(["띄어쓰기는 상관없어요"])}` },
    { title: "문제 유형이 섞여 나와요", big: () => `<div class="tu-tags">${(types.length ? types : ["속담", "사자성어", "영화 제목", "드라마 제목"]).map(t => `<span class="pill">${esc(t)}</span>`).join("")}</div>${li(["문제 위에 <b>유형</b>이 떠요. 유형부터 보고 떠올려 보세요", "속담으로 몸풀고, 갈수록 어려워져요"])}`,
      phone: li(["문제 위에 유형(속담, 사자성어, 영화 제목 …)이 떠요"]) },
    { title: "점수", big: () => `${li(["맞히면 <b>100점</b>, 빨리 낼수록 <b>최대 50점</b> 더", "시간 절반이 지나면 <b>초성 힌트</b>가 뜨고, 그 뒤에 맞히면 기본 50점", `쉬움·보통은 ${T1}초, 어려움은 ${T3}초에 <b>점수 2배</b>`])}`,
      phone: li(["정답 100점 + 속도 보너스 최대 50점", "초성 힌트 뒤에는 기본 50점", `어려움은 ${T3}초, 점수 2배`]) },
    { title: "순위와 우승", big: () => `${li(["문제마다 정답과 순위를 보여 줘요", `마지막 <b>${HIDE}문제</b>는 순위를 가려요. 끝까지 몰라요!`, "점수가 같으면 맞힌 개수, 그다음 걸린 시간이 짧은 사람이 앞"])}`,
      phone: li([`마지막 ${HIDE}문제는 순위를 가려요`, "동점이면 맞힌 개수, 그다음 걸린 시간"]) },
    { title: "연습 문제", practice: { id: "emoji", phase: "play" },
      big: live => `<span class="pill">연습 · ${P.t}</span>${emo(P.e)}${emojiLive(live.docs)}`, phone: "" },
    { title: "초성 힌트", practice: { id: "emoji", phase: "hint" },
      big: live => `<span class="pill">연습 · ${P.t}</span>${emo(P.e, "sm")}<p class="tu-hint">${esc(cho)}</p><p class="muted" style="margin:0">본 게임에선 시간 절반이 지나면 이렇게 떠요</p>${emojiLive(live.docs)}`, phone: "" },
    { title: "연습 정답", practice: { id: "emoji", phase: "reveal" },
      big: live => { const ok = byAt(live.docs.filter(d => d.ok)).map(d => d.nick);
        return `<p class="tu-answer">${esc(P.a)}</p><p class="muted">${esc(P.d)}</p>${ok.length ? `<p class="tu-lead">맞힌 사람 ${ok.length}명. 가장 빨리 맞힌 사람은 <b>${esc(ok[0])}</b>님!</p>${chips(ok)}` : ""}`; },
      phone: "" },
  ];
}
function emojiLive(docs) {
  const ok = byAt(docs.filter(d => d.ok)).map(d => d.nick);
  return `<div class="tu-live"><span class="pill">참여 ${docs.length}명</span><span class="pill good">정답 ${ok.length}명</span></div>${chips(ok)}`;
}

// ───────────────────────── 반도체왕 임삼성 ─────────────────────────
// 연습 장: 결과는 미리 정해 둔 등락
export const INVEST_PRACTICE = {
  title: "연습 뉴스: 북극 한파 경보! 전기요금 비상",
  bullets: ["비트코인 채굴장 전기료 폭등, 채굴 중단 속출", "한파에 실내 생활 늘며 게임·PC 수요 증가", "불안할 땐 역시 금?"],
  boss: "추우면 다들 집에서 PC 하겠지? DRAM 가즈아!",
  move: { dram: 8, nand: 4, gold: 6, btc: -18, cash: 2 },
};
async function investSteps(g) {
  const D = await load("../../games/invest/data.js");
  const START = D.START_MONEY ?? 1e8, R = D.ROUNDS?.length ?? 5;
  const PRE = D.PRE_SECONDS ?? 20, MK = D.MARKET_SECONDS ?? 30, FA = D.FLASH_AT ?? 15, FS = D.FLASH_SECONDS ?? 5, LOCK = D.SLIDER_LOCK_SECONDS ?? 3;
  const won = D.won || (v => Math.round(v / 1e4).toLocaleString("ko-KR") + "만원");
  const assets = D.ASSETS || [];
  const P = INVEST_PRACTICE;
  const news = `<article class="tu-news"><h3>${esc(P.title)}</h3><ul>${P.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul><p class="tu-boss">🧑‍💼 임삼성: “${esc(P.boss)}”</p></article>`;
  return [
    { title: g.title, big: () => `${big(g.emoji)}<p class="tu-lead">모두 <b>${won(START)}</b>으로 시작해서 ${R}라운드 투자!</p>${li(["뉴스를 보고 어디에 얼마나 넣을지 정해요", `${R}라운드 뒤 자산 1등이 올해의 반도체왕`])}`,
      phone: li([`${won(START)}으로 시작, ${R}라운드`, "마지막 자산 1등이 우승"]) },
    { title: "투자할 수 있는 것", big: () => `<div class="tu-assets">${assets.map(a => `<div style="--c:${a.color}"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join("")}</div>`,
      phone: `<div class="tu-assets sm">${assets.map(a => `<div style="--c:${a.color}"><b>${esc(a.name)}</b></div>`).join("")}</div>` },
    { title: "한 라운드는 이렇게", big: () => `<div class="tu-flow"><div><b>📰 뉴스</b><small>진행자가 읽어 줘요. 함께 토론!</small></div><div><b>⏳ 프리장 ${PRE}초</b><small>진행자가 열면 미리 주문. 바로 본장일 수도!</small></div><div><b>📈 본장 ${MK}초</b><small>차트 보며 비율 변경</small></div><div><b>⚡ 속보</b><small>본장 ${FA}초째, 장이 ${FS}초 멈추고 토의</small></div><div><b>🧾 결과</b><small>순위 공개</small></div></div>`,
      phone: li(["뉴스·토의 → (프리장) → 본장(실시간) → 결과", "프리장은 진행자가 열 때만 있어요", `본장 중간에 속보가 뜨면 장이 ${FS}초 멈춰요. 이때 토의!`]) },
    { title: "슬라이더로 비율을 정해요", big: () => `${li(["종목마다 슬라이더로 <b>몇 %</b>를 넣을지 정해요 (5% 단위)", "넣지 않은 나머지는 <b>현금</b>. 라운드마다 이자 +2%", `본장에서 주문하면 슬라이더가 <b>${LOCK}초 잠겨요</b> (거래 수수료)`, "마지막 라운드는 등락 2배 <b>더블 찬스</b>"])}`,
      phone: li(["종목별 슬라이더로 비율 정하기, 나머지는 현금", `본장 주문 뒤 ${LOCK}초 잠김`, "마지막 라운드는 등락 2배"]) },
    { title: "임삼성의 한마디는 믿거나 말거나", big: () => `${big("🧑‍💼💬")}${li(["뉴스마다 임삼성이 한마디 해요", "맞을 때도 있지만 <b>헛다리</b>일 때도 있어요", "옆 사람과 이야기해서 판단하세요. 휴대폰마다 다른 <b>비밀 찌라시</b>가 올 수도 있는데, 진짜인지 가짜인지는 결과에서 밝혀져요"])}`,
      phone: li(["임삼성 조언은 맞을 수도, 틀릴 수도!"]) },
    { title: "연습 투자", practice: { id: "invest", phase: "play" },
      big: live => `${news}<div class="tu-live"><span class="pill">주문 ${live.docs.filter(d => d.alloc).length}명</span></div><p class="muted" style="margin:0">휴대폰 슬라이더로 비율을 정하고 '주문'을 눌러 보세요.</p>`, phone: "" },
    { title: "연습 결과", practice: { id: "invest", phase: "reveal" },
      big: live => {
        const res = live.docs.filter(d => d.alloc).map(d => ({ nick: d.nick, v: investResult(START, d.alloc), at: d.at || 0 }))
          .sort((a, b) => b.v - a.v || a.at - b.at).slice(0, 5);
        return `<div class="tu-moves">${assets.map(a => { const m = P.move[a.id] ?? 0; return `<div style="--c:${a.color}"><b>${esc(a.short || a.name)}</b><span class="${m > 0 ? "up" : m < 0 ? "down" : ""}">${m > 0 ? "▲" : m < 0 ? "▼" : "–"} ${Math.abs(m)}%</span></div>`; }).join("")}</div>
          ${res.length ? `<ol class="tu-rank">${res.map((r, i) => `<li><span>${i + 1}위</span><b>${esc(r.nick)}</b><span class="mono">${won(r.v)}</span></li>`).join("")}</ol>` : `<p class="muted">주문한 사람이 없어요.</p>`}`;
      }, phone: "" },
  ];
}
export function investResult(start, alloc) {
  const m = INVEST_PRACTICE.move;
  let inv = 0, v = 0;
  for (const k of ["dram", "nand", "gold", "btc"]) { const p = alloc?.[k] || 0; inv += p; v += start * p / 100 * (1 + (m[k] || 0) / 100); }
  return v + start * Math.max(0, 100 - inv) / 100 * (1 + (m.cash || 0) / 100);
}
