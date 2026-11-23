// H2맨틀 운영자 화면 (프로젝터용). 비밀 단어를 갖고 있고, 참가자 추측을 채점합니다.
import { ROOM, GAME_ID, TITLE, ROUNDS, FEED_TOP, FEED_RECENT, FEED_EVERY_MS, DURATION_MS, EXTEND_MS, GRACE_MS, HINT_RANKS,
  solvePoints, nearPoints, loadStyle, esc, norm, fmtSim, fmtRank, heat, ranked } from "./common.js";
import { loadEngine, SUGGEST } from "./engine.js";
import { ms } from "../../shared/db.js";
import { GAMES } from "../../shared/games.js";
import { watchWinners, pickWinner, otherGameTitle, confirmWinner, clearWinner } from "../../shared/winners.js";

const TOP_N = 5; // 최종 발표에서 공개하는 등수
const TITLES = Object.fromEntries(GAMES.map(g => [g.id, g.title]));
const LOBBY = { phase: "lobby", round: 0, startedAt: null, duration: DURATION_MS, hints: [], finalStep: 0 };
const ANS_KEY = "similar-answers"; // 비밀 단어는 이 브라우저에만 저장

function loadAnswers() {
  try { const a = JSON.parse(localStorage.getItem(ANS_KEY) || "[]"); if (Array.isArray(a)) return a; } catch {}
  return [];
}
function saveAnswers(a) { try { localStorage.setItem(ANS_KEY, JSON.stringify(a)); } catch {} }

export function mount(el, { db, fs }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  const col = name => fs.collection(db, ...ROOM, name);

  let eng = null, engErr = null;
  let room = null, players = [], guesses = [], rounds = {}, scores = [], winners = {};
  let answers = loadAnswers();
  let live = new Map();          // pid → {nick, list, best, bestW, bestS, solvedMs, n}
  const written = new Map();     // feedback 문서별 마지막으로 쓴 내용
  let gUnsub = null, gRound = null, tick = null, resetArmed = false, endArmed = false;
  let showSecret = false, preview = null;
  const unsubs = [];

  el.innerHTML = `<div class="sh">
    <div class="sh-top"><div class="display" style="font-size:1.5rem">H2<span style="color:var(--dancheong)">맨틀</span> 🌡️</div><div class="meta" id="shMeta"></div></div>
    <div class="sh-progress"><i id="shBar" style="width:0%"></i></div>
    <div class="sh-stage" id="shStage" aria-live="polite"></div>
    <div class="sh-controls" id="shCtl"></div>
  </div>`;
  const $ = id => el.querySelector("#" + id);

  loadEngine().then(e => { eng = e; process(); render(); }, e => { engErr = e.message; render(); });

  // ── 구독 ──
  unsubs.push(fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : null;
    if (!room) { fs.setDoc(roomRef, LOBBY); return; }
    watchGuesses(room.round);
    render();
  }));
  unsubs.push(fs.onSnapshot(fs.collection(db, "players"), s => { players = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }));
  unsubs.push(fs.onSnapshot(col("rounds"), s => { rounds = {}; s.docs.forEach(d => rounds[d.id] = d.data()); render(); }));
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "board", "current"), s => { scores = s.exists() ? s.data().rows || [] : []; render(); }));
  unsubs.push(watchWinners(db, fs, w => { winners = w; render(); }));

  function watchGuesses(r) {
    if (gRound === r && gUnsub) return;
    if (gUnsub) gUnsub();
    gRound = r; guesses = []; live = new Map();
    gUnsub = fs.onSnapshot(fs.query(col("guesses"), fs.where("round", "==", r)), s => {
      guesses = s.docs.map(d => d.data()); process();
    });
  }

  const table = r => (eng && answers[r] ? eng.table(answers[r]) : null);

  // ── 채점: 이번 라운드 추측 전체로 참가자별 상태를 다시 만들고, 바뀐 사람의 feedback 문서만 씀 ──
  let writing = false, again = false;
  async function process() {
    if (!room || room.phase !== "round") { renderLive(); return; }
    const t = table(room.round);
    if (!t) { renderLive(); return; }
    const st = ms(room.startedAt), end = st == null ? Infinity : st + (room.duration || DURATION_MS) + GRACE_MS;
    const by = new Map();
    for (const g of guesses) {
      const at = ms(g.at) ?? Date.now();
      if (at > end) continue;
      if (!by.has(g.pid)) by.set(g.pid, []);
      by.get(g.pid).push({ ...g, at });
    }
    const next = new Map(), events = [];
    for (const [pid, gs] of by) {
      gs.sort((a, b) => a.at - b.at);
      const seen = new Set(), list = [];
      let solvedMs = null, best = null;
      for (const g of gs) {
        if (solvedMs != null) break;
        const w = norm(g.word);
        if (!w || seen.has(w)) continue;
        seen.add(w);
        const hit = t.lookup(w) || { w, s: null, r: null, u: 1 };
        list.push(hit);
        if (!hit.u) events.push({ pid, nick: g.nick, w: hit.w, s: hit.s, r: hit.r, at: g.at });
        if (hit.r === 0) solvedMs = Math.max(0, g.at - (st ?? g.at));
        if (!hit.u && (best == null || hit.s > best.s)) best = hit;
      }
      next.set(pid, { pid, nick: gs[gs.length - 1].nick, list, best, solvedMs, n: list.length });
    }
    live = next;
    feed = buildFeed(events);
    renderLive();
    scheduleFeed();

    if (writing) { again = true; return; }
    writing = true;
    try {
      do {
        again = false;
        const b = fs.writeBatch(db); let ops = 0;
        for (const p of live.values()) {
          const id = `${room.round}_${p.pid}`;
          const data = { round: room.round, list: p.list, solvedMs: p.solvedMs, n: p.n };
          const sig = JSON.stringify(data);
          if (written.get(id) === sig) continue;
          written.set(id, sig);
          b.set(fs.doc(db, ...ROOM, "feedback", id), data);
          if (++ops >= 450) break;
        }
        if (ops) await b.commit();
      } while (again);
    } catch (e) { console.error(e); written.clear(); }
    finally { writing = false; }
  }

  // ── 모두의 추측: 다른 사람의 단어와 순위를 공개해 함께 추리. 비밀 단어(정답)만 가림 ──
  // rooms/similar/feed/current 문서 하나에 모아 2초에 한 번까지만 씀 (참가자 50명이 이 문서 하나만 구독)
  let feed = null, feedSig = null, feedTimer = null, feedAt = 0;
  function buildFeed(events) {
    const first = new Map();
    for (const e of [...events].sort((a, b) => a.at - b.at)) if (e.r !== 0 && !first.has(e.w)) first.set(e.w, e);
    const top = [...first.values()].sort((a, b) => b.s - a.s).slice(0, FEED_TOP).map(({ w, s, r, nick }) => ({ w, s, r, nick }));
    const recent = [...events].sort((a, b) => b.at - a.at).slice(0, FEED_RECENT)
      .map(e => (e.r === 0 ? { nick: e.nick, hit: 1 } : { w: e.w, s: e.s, r: e.r, nick: e.nick }));
    const solved = [...live.values()].filter(p => p.solvedMs != null).sort((a, b) => a.solvedMs - b.solvedMs).map(p => p.nick);
    return { round: room.round, top, recent, solved, total: events.length };
  }
  function scheduleFeed() {
    if (!feed || feedTimer) return;
    const wait = Math.max(0, feedAt + FEED_EVERY_MS - Date.now());
    feedTimer = setTimeout(async () => {
      feedTimer = null;
      const sig = JSON.stringify(feed);
      if (sig === feedSig || room?.phase !== "round") return;
      feedSig = sig; feedAt = Date.now();
      try { await fs.setDoc(fs.doc(db, ...ROOM, "feed", "current"), feed); }
      catch (e) { console.error(e); feedSig = null; }
    }, wait);
  }

  // ── 진행 동작 ──
  async function startRound(r) {
    if (!table(r)) { alertBox(`${r + 1}라운드 비밀 단어를 먼저 정해 주세요.`); return; }
    await fs.updateDoc(roomRef, { phase: "round", round: r, startedAt: fs.serverTimestamp(), duration: DURATION_MS, hints: [] });
  }
  async function extend() {
    if (room?.phase === "round") await fs.updateDoc(roomRef, { duration: (room.duration || DURATION_MS) + EXTEND_MS });
  }
  async function hint() {
    const t = table(room.round); if (!t || room.phase !== "round") return;
    const used = (room.hints || []).length;
    if (used >= HINT_RANKS.length) return;
    const h = t.at(HINT_RANKS[used]);
    if (h) await fs.updateDoc(roomRef, { hints: [...(room.hints || []), h] });
  }
  function marksOf() {
    const arr = [...live.values()];
    const solved = arr.filter(p => p.solvedMs != null).sort((a, b) => a.solvedMs - b.solvedMs);
    const marks = {};
    solved.forEach((p, i) => { marks[p.pid] = { nick: p.nick, solved: true, t: p.solvedMs, n: p.n, best: 0, bestW: p.best?.w ?? null, pts: solvePoints(i), order: i + 1 }; });
    arr.filter(p => p.solvedMs == null).forEach(p => {
      const best = p.best ? p.best.r : null;
      marks[p.pid] = { nick: p.nick, solved: false, t: null, n: p.n, best, bestW: p.best?.w ?? null, bestS: p.best?.s ?? null, pts: nearPoints(best) };
    });
    return marks;
  }
  async function reveal() {
    if (room?.phase !== "round") return;
    const t = table(room.round);
    if (!t) { alertBox("비밀 단어가 없어 채점할 수 없어요. 아래에서 다시 넣어 주세요."); return; }
    // 마감 직전에 낸 추측이 아직 구독으로 안 들어왔을 수 있어 서버에서 한 번 더 읽고 채점
    try {
      const snap = await fs.getDocs(fs.query(col("guesses"), fs.where("round", "==", room.round)));
      guesses = snap.docs.map(d => d.data());
    } catch (e) { console.error(e); }
    await process();
    const marks = marksOf();
    const rec = { answer: t.answer, top: t.top(10), marks };
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, ...ROOM, "rounds", String(room.round)), rec);
    writeTotals(b, { ...rounds, [room.round]: rec }, room.round);
    b.update(roomRef, { phase: "reveal" });
    await b.commit();
  }
  // 라운드 결과를 합쳐 순위표 문서 하나(board/current)에 씀. 참가자 화면은 이 문서만 구독.
  function writeTotals(b, all, r) {
    const tot = {};
    players.forEach(p => tot[p.id] = { nick: p.nick, score: 0, solves: 0, timeMs: 0 });
    for (const rec of Object.values(all)) {
      for (const [pid, m] of Object.entries(rec.marks || {})) {
        if (!tot[pid]) continue;
        tot[pid].score += m.pts || 0;
        if (m.solved) { tot[pid].solves++; tot[pid].timeMs += m.t || 0; }
      }
    }
    const last = all[r]?.marks || {};
    const rows = ranked(Object.entries(tot).map(([id, t]) => ({ id, ...t })))
      .map(x => ({ ...x, last: last[x.id] ? { solved: last[x.id].solved, pts: last[x.id].pts, best: last[x.id].best, order: last[x.id].order || null } : null }));
    b.set(fs.doc(db, ...ROOM, "board", "current"), { round: r, rows });
  }
  async function next() {
    if (room.round < ROUNDS - 1) await startRound(room.round + 1);
    else await fs.updateDoc(roomRef, { phase: "final", finalStep: 0 });
  }
  async function endNow() {
    if (!endArmed) { endArmed = true; render(); setTimeout(() => { endArmed = false; render(); }, 5000); return; }
    endArmed = false;
    await fs.updateDoc(roomRef, { phase: "final", finalStep: 0 });
  }
  async function step() {
    if (room.phase === "final" && (room.finalStep || 0) < TOP_N) await fs.updateDoc(roomRef, { finalStep: (room.finalStep || 0) + 1 });
  }
  async function resetGame() {
    if (!resetArmed) { resetArmed = true; render(); setTimeout(() => { resetArmed = false; render(); }, 5000); return; }
    resetArmed = false;
    for (const name of ["guesses", "feedback", "feed", "rounds", "board"]) {
      const docs = (await fs.getDocs(col(name))).docs;
      for (let i = 0; i < docs.length; i += 450) {
        const b = fs.writeBatch(db); docs.slice(i, i + 450).forEach(d => b.delete(d.ref)); await b.commit();
      }
    }
    written.clear();
    const b = fs.writeBatch(db);
    b.set(roomRef, LOBBY);
    b.delete(fs.doc(db, "winners", GAME_ID));
    await b.commit();
  }

  // ── 그리기 ──
  const resetBtn = () => `<button class="btn warn" data-act="reset">${resetArmed ? "한 번 더 누르면 점수를 모두 지웁니다" : "게임 초기화"}</button>`;

  // 비밀 단어 정하기. 프로젝터에 비치므로 기본은 가림.
  function secretPanel(onlyRound) {
    const idx = onlyRound == null ? [...Array(ROUNDS).keys()] : [onlyRound];
    const rows = idx.map(r => {
      const w = answers[r] || "";
      const ok = eng ? (w ? eng.has(w) : null) : null;
      return `<div class="sh-secret-row">
        <label for="ans${r}">${r + 1}라운드</label>
        <input class="field ${showSecret ? "" : "masked"}" id="ans${r}" data-ans="${r}" value="${esc(w)}" maxlength="12" autocomplete="off" spellcheck="false" placeholder="비밀 단어">
        <span class="st ${ok ? "ok" : ok === false ? "no" : ""}">${ok ? "✓ 목록에 있음" : ok === false ? "목록에 없는 단어" : eng ? "" : "단어 목록 불러오는 중"}</span>
        <button class="btn" data-preview="${r}" ${ok ? "" : "disabled"}>가까운 단어 보기</button>
      </div>`;
    }).join("");
    let prev = "";
    if (preview != null && showSecret && table(preview)) {
      const t = table(preview);
      prev = `<div class="sh-preview"><div class="muted">${preview + 1}라운드 "${esc(t.answer)}"와 가까운 단어 20개. 이상한 단어가 위에 많으면 다른 정답을 고르세요.</div>
        <ol>${t.top(20).map(x => `<li><b>${esc(x.w)}</b> <span class="mono muted">${fmtSim(x.s)}</span></li>`).join("")}</ol></div>`;
    }
    return `<details class="sh-secret" ${onlyRound != null || [...Array(ROUNDS).keys()].some(r => !answers[r]) ? "open" : ""}>
      <summary>비밀 단어 정하기 <span class="muted">(프로젝터에 비치지 않게 주의)</span></summary>
      <div class="sh-secret-tools">
        <button class="btn" data-act="toggleSecret">${showSecret ? "🙈 가리기" : "👀 보이기"}</button>
        <button class="btn" data-act="suggest">추천 단어로 채우기</button>
      </div>
      ${rows}${prev}
      <p class="muted" style="margin:0;font-size:.9rem">비밀 단어는 이 브라우저에만 저장되고, 정답 공개 전까지 참가자에게 전송되지 않습니다. 운영 노트북을 바꾸면 다시 넣어야 해요.</p>
    </details>`;
  }

  function liveRows() {
    return [...live.values()].sort((a, b) =>
      (a.solvedMs != null) !== (b.solvedMs != null) ? (a.solvedMs != null ? -1 : 1)
      : a.solvedMs != null ? a.solvedMs - b.solvedMs
      : (b.best?.s ?? -1) - (a.best?.s ?? -1));
  }

  let deferred = false;
  function render() {
    if (!room) return;
    // 비밀 단어를 입력하는 중에는 다시 그리지 않음 (입력이 지워지지 않게). 칸을 벗어나면 그림.
    const ae = document.activeElement;
    if (ae && el.contains(ae) && ae.dataset.ans != null) { deferred = true; return; }
    deferred = false;
    const done = room.phase === "final" ? ROUNDS : room.phase === "lobby" ? 0 : room.round + (room.phase === "reveal" ? 1 : 0);
    $("shBar").style.width = `${(done / ROUNDS) * 100}%`;
    clearInterval(tick); tick = null;
    const keepOpen = el.querySelector(".sh-secret")?.open;

    if (engErr) {
      $("shStage").innerHTML = `<p class="display" style="font-size:2rem;margin:0">단어 벡터를 불러오지 못했어요</p><p class="muted">${esc(engErr)} · 새로고침해 주세요.</p>`;
      $("shCtl").innerHTML = ""; return;
    }

    if (room.phase === "lobby") {
      $("shMeta").innerHTML = `<span class="pill">${ROUNDS}라운드 · 라운드당 ${DURATION_MS / 60000}분</span><span class="pill">참가 ${players.length}명</span>`;
      $("shStage").innerHTML = `
        <div class="emoji" style="font-size:clamp(2.4rem,7vw,4.5rem)" aria-hidden="true">🌡️🔤🕵️</div>
        <h1 class="sh-title">H2<span>맨틀</span></h1>
        <p class="sh-mean">비밀 단어가 하나 있어요. 아무 단어나 휴대폰에 넣으면 비밀 단어와 얼마나 가까운지 <b>유사도</b>와 <b>순위</b>가 나옵니다.<br>
        유사도가 높은 단어를 따라가 비밀 단어를 맞히세요. 추측은 몇 번이든 괜찮아요.<br>
        먼저 맞힐수록 높은 점수 (100점부터), 못 맞혀도 1000위 안에 가까이 가면 부분 점수.</p>
        ${secretPanel()}`;
      $("shCtl").innerHTML = `<button class="btn primary" data-act="start" ${eng && table(0) ? "" : "disabled"}>1라운드 시작 <kbd>Enter</kbd></button>${resetBtn()}`;
    }

    else if (room.phase === "round") {
      const t = table(room.round);
      $("shMeta").innerHTML = meta();
      $("shStage").innerHTML = `
        <div class="sh-row"><div class="sh-timer" id="shTimer"></div><div class="sh-count" id="shCount"></div></div>
        <div class="sh-hints">${(room.hints || []).map(h => `<span class="sh-hint"><small>${h.r}위 힌트</small>${esc(h.w)}<small class="mono">${fmtSim(h.s)}</small></span>`).join("")}</div>
        <div class="sh-live" id="shLive"></div>
        ${t ? "" : secretPanel(room.round)}`;
      const hn = (room.hints || []).length;
      $("shCtl").innerHTML = `
        ${hn < HINT_RANKS.length ? `<button class="btn" data-act="hint">힌트: ${HINT_RANKS[hn]}위 단어 공개 <kbd>H</kbd></button>` : ""}
        <button class="btn" data-act="extend">1분 연장</button>
        <button class="btn primary" data-act="reveal">정답 공개 <kbd>Enter</kbd></button>`;
      tick = setInterval(renderTimer, 250); renderTimer(); renderLive();
    }

    else if (room.phase === "reveal") {
      $("shMeta").innerHTML = meta();
      const rec = rounds[room.round];
      if (!rec) { $("shStage").innerHTML = `<p class="muted">채점 중…</p>`; $("shCtl").innerHTML = ""; return; }
      const ms_ = Object.entries(rec.marks || {}).map(([pid, m]) => ({ pid, ...m }));
      const solved = ms_.filter(m => m.solved).sort((a, b) => a.t - b.t);
      const near = ms_.filter(m => !m.solved && m.best != null).sort((a, b) => a.best - b.best).slice(0, 5);
      const lastRound = room.round >= ROUNDS - 1;
      $("shStage").innerHTML = `
        <div class="muted">${room.round + 1}라운드 비밀 단어</div>
        <h2 class="sh-answer">${esc(rec.answer)}</h2>
        <div class="sh-top10">${rec.top.map(x => `<span><small>${x.r}</small>${esc(x.w)}</span>`).join("")}</div>
        <div class="sh-split">
          <div class="card" style="background:var(--night)">
            <div class="muted" style="margin-bottom:6px">맞힌 사람 <b class="mono" style="color:var(--pine)">${solved.length}</b>명 / 참여 ${ms_.length}명</div>
            <div class="sh-board">${solved.slice(0, 8).map((m, i) => `<div><span class="r">${i + 1}</span><span class="n">${esc(m.nick)}</span><span class="d mono">${fmtTime(m.t)} · ${m.n}번째</span><span class="s">+${m.pts}</span></div>`).join("") || `<span class="muted">아무도 못 맞혔어요</span>`}</div>
            ${near.length ? `<div class="muted" style="margin:10px 0 6px">아깝게 놓친 사람</div>
            <div class="sh-board">${near.map(m => `<div><span class="r">${m.best}위</span><span class="n">${esc(m.nick)}</span><span class="d">${esc(m.bestW || "")}</span><span class="s">+${m.pts}</span></div>`).join("")}</div>` : ""}
          </div>
          <div class="card" style="background:var(--night)">
            <div class="muted" style="margin-bottom:6px">현재 순위</div>
            <div class="sh-board">${ranked(scores).slice(0, 5).map(r => `<div><span class="r">${r.rank}</span><span class="n">${esc(r.nick)}</span><span class="d mono">${r.solves}회 정답</span><span class="s">${r.score}</span></div>`).join("")}</div>
          </div>
        </div>`;
      $("shCtl").innerHTML = `<button class="btn primary" data-act="next">${lastRound ? "최종 발표" : `${room.round + 2}라운드 시작`} <kbd>Enter</kbd></button>
        ${lastRound ? "" : `<button class="btn warn" data-act="end">${endArmed ? "한 번 더 누르면 여기서 끝내고 최종 발표" : "여기서 끝내기"}</button>`}
        ${lastRound || table(room.round + 1) ? "" : secretPanel(room.round + 1)}`;
    }

    else if (room.phase === "final") {
      // 5위부터 한 명씩 공개. 시상은 1등 한 명, 다른 게임 우승자는 건너뛰고 다음 순위가 우승.
      const st = room.finalStep || 0;
      $("shMeta").innerHTML = `<span class="pill">최종 발표</span>`;
      const r = ranked(scores);
      const top = r.slice(0, TOP_N);
      const other = id => otherGameTitle(winners, id, GAME_ID, TITLES);
      const fin = st >= Math.min(TOP_N, top.length);
      const pick = pickWinner(r, winners, GAME_ID);
      const confirmed = winners[GAME_ID];
      const champId = fin ? (confirmed?.pid ?? (pick.tied.length ? null : pick.winner?.id)) : null;
      const rows = top.map((x, i) => {
        const shown = i >= TOP_N - st || i >= top.length - st;
        const o = other(x.id);
        return `<div class="sh-final-row ${shown ? "on" : ""} ${x.id === champId ? "first" : ""} ${shown && o ? "skip" : ""}">
          <span class="r">${x.rank}위</span>
          <span class="n">${shown ? `<span class="nn">${esc(x.nick)}</span>` : "?"}${shown && o ? ` <small>${esc(o)} 우승</small>` : ""}</span>
          <span class="s">${shown ? x.score + "점" : ""}</span></div>`;
      }).join("");
      let winnerHtml = "";
      if (fin && confirmed) winnerHtml = `<div class="sh-champ"><span class="emoji" aria-hidden="true">👑</span><span class="nm">${esc(confirmed.nick)}</span><span class="sc">H2맨틀 우승자</span></div>`;
      else if (fin && pick.tied.length) winnerHtml = `<p class="sh-note" style="color:var(--gold)">우승 자리에 ${pick.tied.map(x => esc(x.nick)).join(", ")} 님이 동점이에요. 가위바위보나 즉석 추가 라운드로 정해 주세요.</p>`;
      else if (fin && pick.winner) winnerHtml = `<p class="sh-note" style="font-size:1.1rem">${pick.skipped.length ? `${pick.skipped.map(x => esc(x.nick)).join(", ")} 님은 이미 다른 게임에서 우승해서, ` : ""}우승은 <b style="color:var(--gold)">${esc(pick.winner.nick)}</b> 님 (${pick.winner.rank}위)</p>`;
      $("shStage").innerHTML = `
        <h1 class="sh-title" style="font-size:clamp(2rem,5vw,3.6rem)">오늘의 <span>H2맨틀 우승자</span>는?</h1>
        ${winnerHtml}
        <div class="sh-final">${rows}</div>`;
      $("shCtl").innerHTML = !fin
        ? `<button class="btn primary" data-act="step">${top.length - st}위 공개 <kbd>Enter</kbd></button>`
        : confirmed
        ? `<button class="btn" data-act="unconfirm">우승 확정 취소</button>${resetBtn()}`
        : `${pick.winner && !pick.tied.length ? `<button class="btn primary" data-act="confirm">${esc(pick.winner.nick)} 님 우승 확정</button>` : ""}${resetBtn()}`;
    }

    const det = el.querySelector(".sh-secret"); if (det && keepOpen) det.open = true;
    el.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    el.querySelectorAll("[data-preview]").forEach(b => b.onclick = () => { preview = +b.dataset.preview; showSecret = true; render(); });
    el.querySelectorAll("[data-ans]").forEach(i => {
      i.onblur = () => { if (deferred) setTimeout(render, 0); };
      i.onchange = () => { answers[+i.dataset.ans] = norm(i.value); saveAnswers(answers); if (preview === +i.dataset.ans) preview = null; process(); render(); };
    });
  }

  function meta() {
    return `<span class="pill">${room.round + 1} / ${ROUNDS} 라운드</span><span class="pill">참가 ${players.length}명</span>`;
  }
  const fmtTime = t => { const s = Math.round((t || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function renderTimer() {
    const t = $("shTimer"); if (!t || !room) return;
    const dur = room.duration || DURATION_MS, st = ms(room.startedAt);
    const left = st == null ? dur : st + dur - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "⏰ 시간 끝!";
    t.className = "sh-timer" + (s <= 0 ? " over" : s <= 30 ? " warn" : "");
  }

  // 큰 화면 실시간 현황: 단어는 가리고 닉네임과 가장 가까운 순위만
  // 큰 화면 실시간 현황: 모두의 추측 단어와 순위 (정답 단어만 가림)
  function renderLive() {
    const box = $("shLive"), c = $("shCount");
    if (!box || room?.phase !== "round") return;
    const rows = liveRows();
    const nSolved = rows.filter(p => p.solvedMs != null).length;
    const total = rows.reduce((a, p) => a + p.n, 0);
    if (c) c.innerHTML = `정답 <b>${nSolved}</b>명 · 참여 <b>${rows.length}</b> / ${players.length} · 추측 <b>${total}</b>개`;
    if (!feed || !feed.total) { box.innerHTML = `<p class="muted">추측을 기다리는 중… 휴대폰에서 아무 단어나 넣어 보세요.</p>`; return; }
    const solvedNames = rows.filter(p => p.solvedMs != null).map(p => `<span class="chip ok">🎉 ${esc(p.nick)} <small class="mono">${fmtTime(p.solvedMs)}</small></span>`).join("");
    box.innerHTML = `
      ${solvedNames ? `<div class="sh-solved">${solvedNames}</div>` : ""}
      <div class="sh-feed">
        <div class="card"><div class="muted sh-feed-h">가장 가까운 단어</div>
          ${feed.top.slice(0, 15).map((x, i) => feedRow(x, i + 1)).join("")}</div>
        <div class="card"><div class="muted sh-feed-h">방금 들어온 추측</div>
          ${feed.recent.slice(0, 15).map(x => feedRow(x)).join("")}</div>
      </div>`;
  }
  function feedRow(x, i) {
    if (x.hit) return `<div class="sh-feed-row hit"><span class="i"></span><span class="w">🎉 정답!</span><span class="n">${esc(x.nick)}</span><span class="s"></span><span class="r"></span></div>`;
    return `<div class="sh-feed-row"><span class="i mono muted">${i ?? ""}</span><span class="w">${esc(x.w)}</span><span class="n">${esc(x.nick)}</span>
      <span class="s mono">${fmtSim(x.s)}</span><span class="r"><span class="bar"><i style="width:${heat(x.r) * 100}%"></i></span><small class="mono">${fmtRank(x.r)}</small></span></div>`;
  }


  let busy = false;
  async function act(a) {
    if (busy) return; busy = true;
    try {
      if (a === "start") await startRound(0);
      else if (a === "hint") await hint();
      else if (a === "extend") await extend();
      else if (a === "reveal") await reveal();
      else if (a === "next") await next();
      else if (a === "end") await endNow();
      else if (a === "step") await step();
      else if (a === "confirm") { const p = pickWinner(ranked(scores), winners, GAME_ID); if (p.winner && !p.tied.length) await confirmWinner(db, fs, GAME_ID, p.winner); }
      else if (a === "unconfirm") await clearWinner(db, fs, GAME_ID);
      else if (a === "reset") await resetGame();
      else if (a === "toggleSecret") { showSecret = !showSecret; if (!showSecret) preview = null; render(); }
      else if (a === "suggest") {
        const pool = SUGGEST.filter(w => !answers.slice(0, ROUNDS).includes(w)).sort(() => Math.random() - 0.5);
        for (let r = 0; r < ROUNDS; r++) if (!answers[r] || (eng && !eng.has(answers[r]))) answers[r] = pool.pop();
        saveAnswers(answers); render();
      }
    } catch (e) { console.error(e); alertBox("저장하지 못했어요: " + e.message + " 다시 눌러 주세요."); }
    finally { busy = false; }
  }
  function alertBox(msg) {
    const d = document.createElement("div"); d.className = "sh-note"; d.textContent = msg;
    $("shCtl").appendChild(d);
  }

  function onKey(e) {
    if (e.target.tagName === "INPUT" || !room) return;
    if (e.key === "Enter") {
      e.preventDefault();
      act({ lobby: "start", round: "reveal", reveal: "next", final: "step" }[room.phase] || "");
    } else if ((e.key === "h" || e.key === "H" || e.key === "ㅗ") && room.phase === "round") act("hint");
  }
  document.addEventListener("keydown", onKey);

  return () => {
    unsubs.forEach(u => u()); if (gUnsub) gUnsub();
    clearInterval(tick); document.removeEventListener("keydown", onKey);
  };
}
