// 이모지 퀴즈 운영자 화면 (프로젝터용)
import { ALL, MAIN, isReserve, LVL_NAME, GRACE_MS, HIDE_LAST, durationFor, multFor, hintTime, isCorrect, similarity, CLOSE_HIDE, normalize, points, chosung } from "./questions.js";
import { ROOM, loadStyle, esc, ranked, photoHtml } from "./common.js";
import { ms } from "../../shared/db.js";
import { GAMES } from "../../shared/games.js";
import { watchWinners, pickWinner, otherGameTitle, confirmWinner, clearWinner } from "../../shared/winners.js";

const TOP_N = 5; // 최종 발표에서 공개하는 등수
const TITLES = Object.fromEntries(GAMES.map(g => [g.id, g.title]));

const LOBBY = { phase: "lobby", q: 0, startedAt: null, hintAt: null, duration: null, finalStep: 0, reserveNext: MAIN };

export function mount(el, { db, fs }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  const col = name => fs.collection(db, ...ROOM, name);

  let room = null, players = [], answers = [], results = {}, scores = [], winners = {};
  let ansUnsub = null, ansQ = null, tick = null, resetArmed = false, endArmed = false;
  const unsubs = [];

  el.innerHTML = `<div class="eh">
    <div class="eh-top"><div class="display" style="font-size:1.5rem">이게 제 <span style="color:var(--dancheong)">이모지</span>야👽</div><div class="meta" id="ehMeta"></div></div>
    <div class="eh-progress"><i id="ehBar" style="width:0%"></i></div>
    <div class="eh-stage" id="ehStage" aria-live="polite"></div>
    <div class="eh-wrong" id="ehWrong" aria-label="지금 들어온 오답"></div>
    <div class="eh-controls" id="ehCtl"></div>
  </div>`;
  const $ = id => el.querySelector("#" + id);

  // ── 구독 ──
  unsubs.push(fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : null;
    if (!room) { fs.setDoc(roomRef, LOBBY); return; }
    watchAnswers(room.q);
    render();
  }));
  unsubs.push(fs.onSnapshot(fs.collection(db, "players"), s => { players = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }));
  unsubs.push(fs.onSnapshot(col("results"), s => { results = {}; s.docs.forEach(d => results[d.id] = d.data()); render(); addLate(); }));
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "board", "current"), s => { scores = s.exists() ? s.data().rows || [] : []; render(); }));

  unsubs.push(watchWinners(db, fs, w => { winners = w; render(); }));

  function watchAnswers(q) {
    if (ansQ === q && ansUnsub) return;
    if (ansUnsub) ansUnsub();
    ansQ = q; answers = [];
    ansUnsub = fs.onSnapshot(fs.query(col("answers"), fs.where("q", "==", q)), s => {
      answers = s.docs.map(d => d.data()); renderLive(); addLate();
    });
  }

  // ── 진행 동작 ──
  async function startQ(i) {
    await fs.updateDoc(roomRef, { phase: "question", q: i, startedAt: fs.serverTimestamp(), hintAt: null, duration: durationFor(ALL[i]) });
  }
  async function hint() {
    if (room?.phase === "question" && !room.hintAt) await fs.updateDoc(roomRef, { hintAt: fs.serverTimestamp() });
  }
  // 답 하나 채점. 마감 뒤에 낸 답과, 이번 문제 시작 전에 남아 있던 예전 답은 제외(null)
  function markOf(a) {
    const q = ALL[room.q];
    const startedAt = ms(room.startedAt), hintAt = ms(room.hintAt), duration = room.duration || durationFor(q), mult = multFor(q);
    const at = ms(a.at);
    if (at != null && startedAt != null && (at > startedAt + duration + GRACE_MS || at < startedAt - 1000)) return null;
    const ok = isCorrect(q, a.text);
    const t = at != null && startedAt != null ? Math.max(0, at - startedAt) : duration;
    const ifOk = points({ at, startedAt, hintAt, duration, mult });
    return { ok, auto: ok, t, pts: ok ? ifOk : 0, ifOk };
  }
  async function reveal() {
    if (room?.phase !== "question") return;
    const marks = {};
    // 마감 직전에 낸 답이 아직 구독으로 안 들어왔을 수 있어서, 채점할 때는 서버에서 한 번 더 읽음
    let list = answers;
    try { list = (await fs.getDocs(fs.query(col("answers"), fs.where("q", "==", room.q)))).docs.map(d => d.data()); }
    catch (e) { console.warn("answers fetch", e); }
    for (const a of list) { const m = markOf(a); if (m) marks[a.pid] = m; }
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, ...ROOM, "results", String(room.q)), { marks });
    if (!isReserve(room.q)) writeTotals(b, { ...results, [room.q]: { marks } }, room.q);
    b.update(roomRef, { phase: "reveal" });
    await b.commit();
  }
  // 정답 공개 뒤에 도착한 답(휴대폰 전송이 늦은 경우)도 마감 안에 낸 것이면 채점에 넣음
  let lateBusy = false;
  async function addLate() {
    if (lateBusy || room?.phase !== "reveal" || ansQ !== room.q) return;
    const key = String(room.q), cur = results[key]?.marks;
    if (!cur) return;
    const add = {};
    for (const a of answers) if (!cur[a.pid]) { const m = markOf(a); if (m) add[a.pid] = m; }
    if (!Object.keys(add).length) return;
    lateBusy = true;
    try {
      const marks = { ...cur, ...add };
      results[key] = { marks };
      const b = fs.writeBatch(db);
      b.set(fs.doc(db, ...ROOM, "results", key), { marks });
      if (!isReserve(room.q)) writeTotals(b, { ...results }, room.q);
      await b.commit();
    } finally { lateBusy = false; }
  }
  async function toggle(pid) {
    const key = String(room.q);
    const marks = structuredClone(results[key]?.marks || {});
    const m = marks[pid]; if (!m) return;
    m.ok = !m.ok; m.pts = m.ok ? m.ifOk : 0;
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, ...ROOM, "results", key), { marks });
    if (!isReserve(room.q)) writeTotals(b, { ...results, [key]: { marks } }, room.q);
    await b.commit();
  }
  // 본 게임 결과를 합쳐 순위표 문서 하나(board/current)에 씀. 예비 문제는 점수에 넣지 않음.
  // 참가자 50명이 문서 하나만 구독하면 되어 Firestore 무료 읽기 한도(하루 5만)를 넉넉히 지킴.
  function writeTotals(b, all, q) {
    const tot = {};
    players.forEach(p => tot[p.id] = { nick: p.nick, score: 0, correct: 0, timeMs: 0 });
    for (const [key, r] of Object.entries(all)) {
      if (isReserve(+key)) continue;
      for (const [pid, m] of Object.entries(r.marks || {})) {
        if (!tot[pid]) continue; // 명단에서 빠진 사람은 제외
        tot[pid].score += m.pts || 0;
        if (m.ok) { tot[pid].correct++; tot[pid].timeMs += m.t || 0; }
      }
    }
    const last = all[q]?.marks || {};
    const rows = ranked(Object.entries(tot).map(([id, t]) => ({ id, ...t })))
      .map(r => ({ ...r, lastOk: !!last[r.id]?.ok, lastPts: last[r.id]?.pts || 0, answered: !!last[r.id] }));
    b.set(fs.doc(db, ...ROOM, "board", "current"), { q, rows, hidden: q >= MAIN - HIDE_LAST });
  }
  async function next() {
    if (isReserve(room.q)) await fs.updateDoc(roomRef, { phase: "final", finalStep: TOP_N });
    else if (room.q < MAIN - 1) await startQ(room.q + 1);
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
  async function tiebreak() {
    const i = room.reserveNext ?? MAIN;
    if (i >= ALL.length) return;
    await fs.updateDoc(roomRef, { reserveNext: i + 1 });
    await startQ(i);
  }
  async function resetGame() {
    if (!resetArmed) { resetArmed = true; render(); setTimeout(() => { resetArmed = false; render(); }, 5000); return; }
    resetArmed = false;
    const b = fs.writeBatch(db);
    for (const name of ["answers", "results", "board"]) {
      (await fs.getDocs(col(name))).docs.forEach(d => b.delete(d.ref));
    }
    b.set(roomRef, LOBBY);
    b.delete(fs.doc(db, "winners", "emoji"));
    await b.commit();
  }

  // ── 그리기 ──
  const resetBtn = () => `<button class="btn warn" data-act="reset">${resetArmed ? "한 번 더 누르면 점수를 모두 지웁니다" : "게임 초기화"}</button>`;

  function render() {
    if (!room) return;
    const q = ALL[room.q];
    const done = room.phase === "final" || isReserve(room.q) ? MAIN : room.q + (room.phase === "reveal" ? 1 : 0);
    $("ehBar").style.width = room.phase === "lobby" ? "0%" : `${(done / MAIN) * 100}%`;
    clearInterval(tick); tick = null;
    renderWrong();

    if (room.phase === "lobby") {
      $("ehMeta").innerHTML = `<span class="pill">${MAIN}문제</span><span class="pill">참가 ${players.length}명</span>`;
      $("ehStage").innerHTML = `
        <div class="emoji" style="font-size:clamp(2.4rem,7vw,4.5rem)" aria-hidden="true">🐋⚔️🐋 🦐💥</div>
        <h1 class="eh-title">이게 제 <span>이모지</span>야👽</h1>
        <ul class="rules eh-mean">
          <li>이모지를 보고 정답을 휴대폰에 써 주세요. 1인 1폰, 각자 풀기!</li>
          <li>속담으로 몸풀고, 사자성어·노래 가사·유행어·드라마 제목이 섞여 나와요. 어려움은 <b>넌센스</b>! 문제마다 <b>유형</b>을 알려 드려요</li>
          <li>맞히면 <b>100점</b>, 빨리 낼수록 <b>최대 50점</b> 더</li>
          <li>시간 절반이 지나면 <b>초성 힌트</b>, 그 뒤에 내면 기본 50점</li>
          <li>어려움 문제는 <b>점수 2배</b>, 제한 시간 40초</li>
          <li>마지막 ${HIDE_LAST}문제는 순위를 가립니다</li>
        </ul>`;
      $("ehCtl").innerHTML = `<button class="btn primary" data-act="start">1번 문제 시작 <kbd>Enter</kbd></button>${resetBtn()}`;
    }

    else if (room.phase === "question") {
      $("ehMeta").innerHTML = meta(q);
      $("ehStage").innerHTML = `
        <div class="qnum mono muted">${isReserve(room.q) ? "동점 결승 문제" : `Q${room.q + 1}`}${multFor(q) > 1 ? " · 점수 2배" : ""}</div>
        ${q.t ? `<div class="eh-type">${esc(q.t)}</div>` : ""}
        ${emojiHtml(q)}
        <div class="eh-row"><div class="eh-timer" id="ehTimer"></div><div class="eh-count" id="ehCount"></div></div>
        <div class="eh-hint" id="ehHint"></div>
        <div class="eh-rule">띄어쓰기·문장부호는 상관없어요. 몇 글자 오타도 정답으로 봐요.</div>`;
      $("ehCtl").innerHTML = `
        <button class="btn" data-act="hint" id="hintBtn">초성 힌트 지금 <kbd>H</kbd></button>
        <button class="btn primary" data-act="reveal">정답 공개 <kbd>Enter</kbd></button>`;
      tick = setInterval(renderTimer, 250); renderTimer(); renderLive();
    }

    else if (room.phase === "reveal") {
      $("ehMeta").innerHTML = meta(q);
      const reserve = isReserve(room.q);
      const marks = results[room.q]?.marks || {};
      const list = Object.entries(marks).map(([pid, m]) => ({ pid, ...m, ...(answers.find(a => a.pid === pid) || {}) }))
        .sort((a, b) => (b.ok - a.ok) || (reserve ? a.t - b.t : b.pts - a.pts));
      const nOk = list.filter(x => x.ok).length;
      const hidden = !reserve && room.q >= MAIN - HIDE_LAST;
      const last = !reserve && room.q === MAIN - 1;
      const right = reserve
        ? `<div class="muted" style="margin-bottom:6px">결승: 동점자 중 가장 빨리 맞힌 사람이 우승</div>
           <div class="eh-board">${list.filter(x => x.ok).slice(0, 8).map((x, i) => `<div><span class="r">${i + 1}</span><span class="n">${esc(x.nick)}</span><span class="s">${(x.t / 1000).toFixed(1)}초</span></div>`).join("") || `<span class="muted">맞힌 사람이 없어요</span>`}</div>`
        : hidden
        ? `<div class="eh-secret"><span class="emoji" aria-hidden="true">🤫</span><b class="display">순위는 최종 발표 때!</b><span class="muted">마지막 ${HIDE_LAST}문제는 순위를 가립니다</span></div>`
        : `<div class="muted" style="margin-bottom:6px">현재 순위</div>
           <div class="eh-board">${ranked(scores).slice(0, 5).map(r => `<div><span class="r">${r.rank}</span><span class="n">${esc(r.nick)}</span><span class="s">${r.score}</span></div>`).join("")}</div>`;
      $("ehStage").innerHTML = `
        ${emojiHtml(q, true)}
        <div class="eh-reveal${q.img ? " has-photo" : ""}">
          ${photoHtml(q.img)}
          <div class="eh-reveal-text">
            <h2 class="eh-answer">${esc(q.a)}</h2>
            <div class="eh-decode">${esc(q.d)}</div>
            <p class="eh-mean">${esc(q.m)}</p>
          </div>
        </div>
        <div class="eh-split" style="width:min(1100px,100%)">
          <div class="card" style="background:var(--night)">
            <div class="muted" style="margin-bottom:6px">정답 <b class="mono" style="color:var(--pine)">${nOk}</b>명 / 제출 ${list.length}명 · 판정이 틀렸으면 O/X를 눌러 바꾸세요</div>
            <div class="eh-list">${list.map(x => `<div class="eh-ans">
              <button class="${x.ok ? "ok" : "no"}" data-toggle="${esc(x.pid)}" aria-label="${esc(x.nick)} 판정 바꾸기">${x.ok ? "O" : "X"}</button>
              <span class="nick">${esc(x.nick)}</span><span class="txt">${esc(x.text)}</span><span class="pts">${x.ok ? (reserve ? (x.t / 1000).toFixed(1) + "초" : "+" + x.pts) : ""}</span></div>`).join("") || `<span class="muted">제출한 사람이 없어요</span>`}</div>
          </div>
          <div class="card" style="background:var(--night)">${right}</div>
        </div>`;
      $("ehCtl").innerHTML = reserve
        ? `<button class="btn primary" data-act="next">최종 결과로 <kbd>Enter</kbd></button>`
        : `<button class="btn primary" data-act="next">${last ? "최종 발표" : "다음 문제"} <kbd>Enter</kbd></button>
           ${last ? "" : `<button class="btn warn" data-act="end">${endArmed ? "한 번 더 누르면 여기서 끝내고 최종 발표" : "여기서 끝내기"}</button>`}`;
    }

    else if (room.phase === "final") {
      // 5위부터 한 명씩 공개. 시상은 1등 한 명, 다른 게임 우승자는 건너뛰고 다음 순위가 우승.
      const st = room.finalStep || 0;
      $("ehMeta").innerHTML = `<span class="pill">최종 발표</span>`;
      const r = ranked(scores);
      const top = r.slice(0, TOP_N);
      const other = id => otherGameTitle(winners, id, "emoji", TITLES);
      const done = st >= Math.min(TOP_N, top.length);
      const pick = pickWinner(r, winners, "emoji");
      const confirmed = winners.emoji;
      const champId = done ? (confirmed?.pid ?? (pick.tied.length ? null : pick.winner?.id)) : null;
      const rows = top.map((x, i) => {
        const shown = i >= TOP_N - st || i >= top.length - st;
        const o = other(x.id);
        return `<div class="eh-final-row ${shown ? "on" : ""} ${x.id === champId ? "first" : ""} ${shown && o ? "skip" : ""}">
          <span class="r">${x.rank}위</span>
          <span class="n">${shown ? `<span class="nn">${esc(x.nick)}</span>` : "?"}${shown && o ? ` <small>${esc(o)} 우승</small>` : ""}</span>
          <span class="s">${shown ? x.score + "점" : ""}</span></div>`;
      }).join("");
      let winnerHtml = "";
      if (done && confirmed) {
        winnerHtml = `<div class="eh-champ on"><span class="emoji" aria-hidden="true">👑</span><span class="nm">${esc(confirmed.nick)}</span><span class="sc">오늘의 이모지왕</span></div>`;
      } else if (done && pick.tied.length) {
        winnerHtml = `<p class="eh-note" style="color:var(--gold)">우승 자리에 ${pick.tied.map(x => esc(x.nick)).join(", ")} 님이 동점이에요. 예비 문제로 결승을 진행하세요.</p>`;
      } else if (done && pick.winner) {
        winnerHtml = `<p class="eh-note" style="font-size:1.1rem">${pick.skipped.length ? `${pick.skipped.map(x => esc(x.nick)).join(", ")} 님은 이미 다른 게임에서 우승해서, ` : ""}우승은 <b style="color:var(--gold)">${esc(pick.winner.nick)}</b> 님 (${pick.winner.rank}위)</p>`;
      }
      $("ehStage").innerHTML = `
        <h1 class="eh-title" style="font-size:clamp(2rem,5vw,3.6rem)">오늘의 <span>이모지왕</span>은?</h1>
        ${winnerHtml}
        <div class="eh-final">${rows}</div>`;
      const left = ALL.length - (room.reserveNext ?? MAIN);
      const tb = left > 0 && pick.tied.length ? `<button class="btn" data-act="tiebreak">동점 결승 문제 (예비 ${left}개)</button>` : "";
      $("ehCtl").innerHTML = !done
        ? `<button class="btn primary" data-act="step">${top.length - st}위 공개 <kbd>Enter</kbd></button>`
        : confirmed
        ? `<button class="btn" data-act="unconfirm">우승 확정 취소</button>${resetBtn()}`
        : `${pick.winner && !pick.tied.length ? `<button class="btn primary" data-act="confirm">${esc(pick.winner.nick)} 님 우승 확정</button>` : ""}${tb}${resetBtn()}`;
    }

    $("ehCtl").querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    $("ehStage").querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggle(b.dataset.toggle));
  }

  function meta(q) {
    const label = isReserve(room.q) ? `<span class="pill">결승</span>` : `<span class="pill">${String(room.q + 1).padStart(2, "0")} / ${MAIN}</span>`;
    return `${q.t ? `<span class="pill type">${esc(q.t)}</span>` : ""}<span class="pill lvl-${q.lvl}">${LVL_NAME[q.lvl]}${multFor(q) > 1 ? " ×2" : ""}</span>${label}<span class="pill">참가 ${players.length}명</span>`;
  }
  function emojiHtml(q, small) {
    return `<div class="eh-emoji" ${small ? 'style="font-size:clamp(2rem,6vh,3.6rem)"' : ""} aria-label="이모지 문제">${q.e.map(r => `<span>${r}</span>`).join("")}</div>`;
  }
  let hintShown = false;
  function renderTimer() {
    const t = $("ehTimer"); if (!t || !room) return;
    const q = ALL[room.q], dur = room.duration || durationFor(q), st = ms(room.startedAt);
    const left = st == null ? dur : st + dur - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `⏱ ${s}초` : "⏰ 시간 끝!";
    t.className = "eh-timer" + (s <= 0 ? " over" : s <= 10 ? " warn" : "");
    const h = hintTime(st, ms(room.hintAt), dur);
    const on = room.hintAt != null || (h != null && Date.now() >= h);
    if (on !== hintShown || !$("ehHint").innerHTML !== !on) {
      hintShown = on;
      $("ehHint").innerHTML = on ? `<small>초성 힌트 · ${q.a.replace(/\s/g, "").length}글자 · 지금부터 기본 50점</small>${chosung(q.a)}` : "";
      const hb = $("hintBtn"); if (hb) hb.hidden = on;
    }
  }
  function renderLive() {
    const c = $("ehCount"); if (!c) return;
    c.innerHTML = `제출 <b>${answers.length}</b> / ${players.length}`;
    renderWrong();
  }
  // ── 오답 전광판: 문제 푸는 동안 들어온 틀린 답을 큰 화면에 실시간으로 ──
  // 같은 답(띄어쓰기 무시)은 한 칸으로 묶어 ×N, 최근 것이 앞. 정답과 너무 비슷한 답은 글자를 가리고 "아깝다"만.
  const WRONG_MAX = 12;
  let seenWrong = new Set(), seenQ = null;
  function renderWrong() {
    const w = $("ehWrong"); if (!w) return;
    if (room?.phase !== "question") { w.dataset.html = ""; w.innerHTML = ""; return; }
    const q = ALL[room.q], groups = new Map();
    if (seenQ !== room.q) { seenQ = room.q; seenWrong = new Set(); }
    let close = 0;
    for (const a of answers) {
      if (!a.text || !markOf(a) || isCorrect(q, a.text)) continue;
      if (similarity(q, a.text) >= CLOSE_HIDE) { close++; continue; }
      const key = normalize(a.text), at = ms(a.at) ?? Date.now();
      const g = groups.get(key) || { key, text: a.text, nicks: [], at: 0 };
      g.nicks.push(a.nick); g.at = Math.max(g.at, at);
      groups.set(key, g);
    }
    const list = [...groups.values()].sort((a, b) => b.at - a.at);
    const shown = list.slice(0, WRONG_MAX);
    const more = list.length - shown.length;
    const html = (shown.length || close ? `<div class="eh-wrong-h">🙊 지금 들어온 오답</div>` : "")
      + shown.map(g => `<span class="eh-wbub${g.nicks.length > 1 ? " many" : ""}${seenWrong.has(g.key + g.nicks.length) ? "" : " new"}"><b>${esc(g.text)}</b>${g.nicks.length > 1
          ? `<i>×${g.nicks.length}</i>` : `<small>${esc(g.nicks[0])}</small>`}</span>`).join("")
      + (close ? `<span class="eh-wbub close"><b>🤏 아깝다!</b><i>×${close}</i></span>` : "")
      + (more > 0 ? `<span class="eh-wbub more">외 ${more}개</span>` : "");
    shown.forEach(g => seenWrong.add(g.key + g.nicks.length));
    if (w.dataset.html !== html) { w.dataset.html = html; w.innerHTML = html; }
  }

  let busy = false;
  async function act(a) {
    if (busy) return; busy = true;
    try {
      if (a === "start") await startQ(0);
      else if (a === "hint") await hint();
      else if (a === "reveal") await reveal();
      else if (a === "next") await next();
      else if (a === "end") await endNow();
      else if (a === "step") await step();
      else if (a === "tiebreak") await tiebreak();
      else if (a === "confirm") { const p = pickWinner(ranked(scores), winners, "emoji"); if (p.winner && !p.tied.length) await confirmWinner(db, fs, "emoji", p.winner); }
      else if (a === "unconfirm") await clearWinner(db, fs, "emoji");
      else if (a === "reset") await resetGame();
    } catch (e) { console.error(e); alertBox(e.message); }
    finally { busy = false; }
  }
  function alertBox(msg) {
    const d = document.createElement("div"); d.className = "eh-note"; d.textContent = "저장하지 못했어요: " + msg + " 다시 눌러 주세요.";
    $("ehCtl").appendChild(d);
  }

  function onKey(e) {
    if (e.target.tagName === "INPUT" || !room) return;
    if (e.key === "Enter") {
      e.preventDefault();
      act({ lobby: "start", question: "reveal", reveal: "next", final: "step" }[room.phase] || "");
    } else if ((e.key === "h" || e.key === "H" || e.key === "ㅗ") && room.phase === "question") act("hint");
  }
  document.addEventListener("keydown", onKey);

  return () => {
    unsubs.forEach(u => u()); if (ansUnsub) ansUnsub();
    clearInterval(tick); document.removeEventListener("keydown", onKey);
  };
}
