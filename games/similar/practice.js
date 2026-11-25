// H2맨틀 연습 라운드 (게임 설명 마지막 단계). 본 게임과 같은 화면 모양으로 보여 줍니다.
//   큰 화면: 모두의 추측 판(방금 들어온 추측, 가장 가까운 단어 1~20)
//   휴대폰: 1·2등 고정, 입력창, 내가 방금 넣은 단어, 모두의 추측(내 추측 파란색)
// 연습 정답과 가까운 단어 1000개는 shared/tutorial/similar-practice.js 에 미리 계산돼 있어 운영자 채점 없이 휴대폰이 바로 계산합니다.
//
// 데이터
//   rooms/tutorial/practice/{pid}   {run, game, nick, at, words: [{w, s, r, t}], best, tries, solved}   참가자가 씀
//   rooms/tutorial/simfeed/current  {run, top, recent, solved, seen, total}   운영자 화면이 2초에 한 번까지 모아 씀
//   (휴대폰 50대가 연습 기록 50개를 모두 구독하면 읽기가 너무 많아서, 본 게임처럼 문서 하나로 모읍니다)
import { TOP_SIM_MIN, RANK_CUTOFF, MIN_GAP_MS, FEED_TOP, FEED_EVERY_MS, loadStyle, loadWords, esc, norm, resolve, fmtSim, fmtRank, bar, feedBoard } from "./common.js";

const ROUND = "practice";
const feedRef = (db, fs) => fs.doc(db, "rooms", "tutorial", "simfeed", "current");

let toolsP = null;
function tools() {
  return (toolsP ||= Promise.all([import("../../shared/tutorial/similar-practice.js"), loadWords().catch(() => null)]).then(([P, W]) => {
    const top = P.NEAR[0]?.[1] || 1;
    const boost = top > 0 && top < TOP_SIM_MIN ? TOP_SIM_MIN / top : 1;
    const near = new Map(P.NEAR.map(([w, s], i) => [w, { w, s: Math.min(99.99, Math.round(s * boost * 10000) / 100), r: i + 1 }]));
    const words = W ? new Set(W.words) : null;
    const has = w => w === P.WORD || near.has(w) || (words ? words.has(w) : true);
    return {
      word: P.WORD,
      // 정답 {r: 0}, 가까운 단어 {w, s, r}, 목록엔 있지만 먼 단어 {w, s: null, r: null}, 모르는 단어 null
      lookup(raw) {
        const hit = resolve(raw, has);
        if (!hit || hit.parts) return null;
        if (hit.w === P.WORD) return { w: hit.w, s: 100, r: 0 };
        return near.get(hit.w) || { w: hit.w, s: null, r: null };
      },
    };
  }));
}

// 연습 기록들 → 본 게임과 같은 모양의 모두의 추측
export function practiceFeed(docs) {
  const events = [];
  for (const d of docs) for (const x of d.words || []) events.push({ ...x, nick: d.nick, pid: d.id });
  events.sort((a, b) => (a.t || 0) - (b.t || 0));
  const first = new Map();
  for (const e of events) if (e.r !== 0 && !first.has(e.w)) first.set(e.w, e);
  const top = [...first.values()].filter(e => e.r != null).sort((a, b) => a.r - b.r).slice(0, FEED_TOP).map(({ w, s, r, nick }) => ({ w, s, r, nick }));
  const last = events[events.length - 1];
  const recent = last ? [last.r === 0 ? { nick: last.nick, hit: 1 } : { w: last.w, s: last.s, r: last.r, nick: last.nick }] : [];
  const solved = docs.filter(d => d.solved).sort((a, b) => (a.solvedAt || 0) - (b.solvedAt || 0)).map(d => d.nick);
  return { top, recent, solved, seen: [...first.keys()], total: events.length };
}

// 운영자 큰 화면
export function practiceBig(docs) {
  loadStyle();
  const f = practiceFeed(docs);
  const solved = f.solved.map(n => `<span class="chip ok">🎉 ${esc(n)}</span>`).join("");
  return `<div class="sh-practice">
    <div class="sh-row"><span class="pill">연습 라운드 · 점수 없음</span><div class="sh-count">정답 <b>${f.solved.length}</b>명 · 참여 <b>${docs.length}</b>명 · 추측 <b>${f.total}</b>개</div></div>
    <div class="sh-live">${f.total ? `${solved ? `<div class="sh-solved">${solved}</div>` : ""}${feedBoard(f, ROUND)}`
      : `<p class="muted">추측을 기다리는 중… 휴대폰에서 아무 단어나 넣어 보세요. (힌트: 연말 하면 떠오르는 단어)</p>`}</div>
  </div>`;
}

// 운영자 화면이 연습 기록이 바뀔 때마다 부름. 휴대폰용 모두의 추측 문서를 2초에 한 번까지만 씀
let syncTimer = null, syncSig = null, syncAt = 0, syncNext = null;
export function syncPracticeFeed(docs, { db, fs, run }) {
  syncNext = { docs, db, fs, run };
  if (syncTimer) return;
  const wait = Math.max(0, syncAt + FEED_EVERY_MS - Date.now());
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    const { docs, db, fs, run } = syncNext;
    const data = { run, ...practiceFeed(docs) };
    const sig = JSON.stringify(data);
    if (sig === syncSig) return;
    syncSig = sig; syncAt = Date.now();
    await fs.setDoc(feedRef(db, fs), data).catch(e => { console.warn("practice feed", e); syncSig = null; });
  }, wait);
}

// 휴대폰. box 안에 본 게임과 같은 화면을 그림. 돌려주는 값: {phase(p), destroy()}
export function mountPracticePhone(box, { db, fs, player, run, game }) {
  loadStyle();
  const ref = fs.doc(db, "rooms", "tutorial", "practice", player.id);
  const save = data => fs.setDoc(ref, { run, game, nick: player.nick, at: Date.now(), ...data }, { merge: true }).catch(e => console.warn("practice", e));
  const mine = []; // {w, s, r, t}
  let solved = false, tries = 0, last = 0, lastWord = null, phase = "play", feed = null, T = null;
  tools().then(t => { T = t; draw(); });

  box.innerHTML = `<div class="sp sp-practice">
    <div class="sp-meta"><span class="pill">연습 라운드 · 점수 없음</span></div>
    <div class="sp-top2" id="ppTop2"></div>
    <form id="ppForm" autocomplete="off" class="sp-form">
      <input class="field" id="ppText" maxlength="12" placeholder="단어를 넣어 보세요" enterkeyhint="send" autocapitalize="off" spellcheck="false">
      <button class="btn primary" id="ppBtn" type="submit">추측</button>
    </form>
    <div class="sp-msg" id="ppMsg" role="status"></div>
    <div id="ppSolved"></div>
    <div class="sp-last" id="ppLast"></div>
    <div class="sp-sub">모두의 추측 <span class="sp-me-key">내 추측</span></div>
    <div class="sp-head"><span>#</span><span>단어</span><span class="s">단어 유사도</span><span class="r">순위</span></div>
    <div class="sp-list" id="ppList"></div>
  </div>`;
  const $ = id => box.querySelector("#" + id);
  const say = t => { $("ppMsg").textContent = t; };

  const unsub = fs.onSnapshot(feedRef(db, fs), s => { const d = s.exists() ? s.data() : null; feed = d && d.run === run ? d : null; draw(); });

  const row = (x, i, cls = "") => x.hit
    ? `<div class="sp-row hit ${cls}"><span class="i"></span><span class="w">🎉 정답!${x.nick ? `<small class="nk">${esc(x.nick)}</small>` : ""}</span><span class="s"></span><span class="r"></span></div>`
    : `<div class="sp-row ${x.r === 0 ? "hit" : ""} ${x.mine ? "mine" : ""} ${cls}"><span class="i mono">${i ?? ""}</span><span class="w">${esc(x.w)}${x.nick ? `<small class="nk">${esc(x.nick)}</small>` : ""}</span><span class="s mono">${fmtSim(x.s)}</span>
      <span class="r">${bar(x.r, `${ROUND}:${x.w}`)}<small class="mono">${fmtRank(x.r)}</small></span></div>`;

  function draw() {
    const lastX = mine.find(x => x.w === lastWord);
    $("ppLast").innerHTML = lastX ? `<div class="muted" style="font-size:.85rem">내가 방금 넣은 단어</div>${row({ ...lastX, mine: true }, mine.indexOf(lastX) + 1, "latest")}` : "";
    const merged = new Map();
    for (const x of feed?.top || []) merged.set(x.w, { ...x });
    for (const x of mine) if (x.r !== 0) merged.set(x.w, { ...merged.get(x.w), ...x, nick: "나", mine: true });
    const rows = [...merged.values()].sort((a, b) => (a.r ?? 1e9) - (b.r ?? 1e9));
    const solvedLine = feed?.solved?.length ? `<div class="sp-sub">맞힌 사람: ${feed.solved.map(esc).join(", ")}</div>` : "";
    $("ppList").innerHTML = solvedLine + (rows.length ? rows.map((x, i) => row(x, i + 1)).join("")
      : `<p class="muted" style="text-align:center">아직 추측이 없어요. 아무 단어나 시작해 보세요!</p>`);
    $("ppTop2").innerHTML = rows.filter(x => x.r != null).slice(0, 2).map((x, i) => `<div class="sp-top2-i ${x.mine ? "mine" : ""}"><small>${i + 1}등</small><b>${esc(x.w)}</b><span class="mono">${fmtSim(x.s)}</span><small class="mono">${fmtRank(x.r)}</small></div>`).join("");
    $("ppSolved").innerHTML = solved ? `<div class="sp-solved"><span class="emoji" aria-hidden="true">🎉</span> 정답! ${tries}번째 추측으로 맞혔어요</div>` : "";
    const off = solved || phase === "reveal";
    $("ppText").disabled = off; $("ppBtn").disabled = off;
  }

  $("ppForm").onsubmit = async e => {
    e.preventDefault();
    const input = $("ppText"), typed = norm(input.value);
    if (!typed || solved || phase === "reveal") return;
    T ||= await tools();
    const x = T.lookup(typed);
    if (!x) { input.value = ""; return say(`"${typed}"는 단어 목록에 없어요. 다른 단어를 넣어 주세요 (횟수에 안 들어가요)`); }
    if (mine.some(m => m.w === x.w)) { lastWord = x.w; input.value = ""; draw(); return say(`"${x.w}"는 이미 넣은 단어예요`); }
    if (x.r !== 0 && feed?.seen?.includes(x.w)) { input.value = ""; return say(`"${x.w}"는 이미 다른 사람이 넣은 단어예요. 모두의 추측에서 확인하세요 (횟수에 안 들어가요)`); }
    if (Date.now() - last < MIN_GAP_MS) return say("조금만 천천히 넣어 주세요");
    last = Date.now();
    input.value = ""; tries++; lastWord = x.w;
    mine.push({ ...x, t: Date.now() });
    solved = x.r === 0;
    say(x.w !== typed ? `"${typed}" → "${x.w}"(으)로 넣었어요` : x.r == null ? `${RANK_CUTOFF}위 밖이에요. 다른 방향으로 가 보세요` : "");
    draw();
    const best = mine.filter(m => m.r != null && m.r > 0).sort((a, b) => a.r - b.r).slice(0, 3).map(({ w, s, r }) => ({ w, s, r }));
    save({ words: mine.slice(-60), best, tries, solved, ...(solved ? { solvedAt: Date.now() } : {}) });
  };

  return {
    async phase(p) {
      phase = p;
      if (p === "reveal") {
        T ||= await tools();
        $("ppForm").hidden = true;
        $("ppMsg").innerHTML = `정답: <b>${esc(T.word)}</b>${solved ? " 🎉 맞혔어요!" : ""}`;
      }
      draw();
    },
    destroy() { unsub(); },
  };
}
