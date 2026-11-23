// 이모지 퀴즈 운영자 화면 (프로젝터용)
import { QUESTIONS, LVL_NAME, DURATION_MS, GRACE_MS, isCorrect, points, chosung } from "./questions.js";
import { ROOM, loadStyle, esc, ranked } from "./common.js";
import { ms } from "../../shared/db.js";

export function mount(el, { db, fs }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  const col = name => fs.collection(db, ...ROOM, name);

  let room = null, players = [], answers = [], results = {}, scores = [];
  let ansUnsub = null, ansQ = null, tick = null, resetArmed = false;
  const unsubs = [];

  el.innerHTML = `<div class="eh">
    <div class="eh-top"><div class="display" style="font-size:1.5rem">이게 내 <span style="color:var(--dancheong)">이모지</span>야</div><div class="meta" id="ehMeta"></div></div>
    <div class="eh-progress"><i id="ehBar" style="width:0%"></i></div>
    <div class="eh-stage" id="ehStage" aria-live="polite"></div>
    <div class="eh-controls" id="ehCtl"></div>
  </div>`;
  const $ = id => el.querySelector("#" + id);

  // ── 구독 ──
  unsubs.push(fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : null;
    if (!room) { fs.setDoc(roomRef, { phase: "lobby", q: 0, startedAt: null, hintAt: null, duration: DURATION_MS }); return; }
    watchAnswers(room.q);
    render();
  }));
  unsubs.push(fs.onSnapshot(fs.collection(db, "players"), s => { players = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }));
  unsubs.push(fs.onSnapshot(col("results"), s => { results = {}; s.docs.forEach(d => results[d.id] = d.data()); render(); }));
  unsubs.push(fs.onSnapshot(col("scores"), s => { scores = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }));

  function watchAnswers(q) {
    if (ansQ === q && ansUnsub) return;
    if (ansUnsub) ansUnsub();
    ansQ = q; answers = [];
    ansUnsub = fs.onSnapshot(fs.query(col("answers"), fs.where("q", "==", q)), s => {
      answers = s.docs.map(d => d.data()); renderLive();
    });
  }

  // ── 진행 동작 ──
  async function startQ(q) {
    await fs.setDoc(roomRef, { phase: "question", q, startedAt: fs.serverTimestamp(), hintAt: null, duration: DURATION_MS });
  }
  async function hint() {
    if (room?.phase === "question" && !room.hintAt) await fs.updateDoc(roomRef, { hintAt: fs.serverTimestamp() });
  }
  async function reveal() {
    if (room?.phase !== "question") return;
    const q = QUESTIONS[room.q];
    const startedAt = ms(room.startedAt), hintAt = ms(room.hintAt), duration = room.duration || DURATION_MS;
    const marks = {};
    for (const a of answers) {
      const at = ms(a.at);
      if (at != null && startedAt != null && at > startedAt + duration + GRACE_MS) continue; // 마감 뒤 제출 제외
      const ok = isCorrect(q, a.text);
      const t = at != null && startedAt != null ? Math.max(0, at - startedAt) : duration;
      marks[a.pid] = { ok, auto: ok, t, pts: ok ? points({ at, startedAt, hintAt, duration }) : 0, ifOk: points({ at, startedAt, hintAt, duration }) };
    }
    const all = { ...results, [room.q]: { marks } };
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, ...ROOM, "results", String(room.q)), { marks });
    writeTotals(b, all);
    b.update(roomRef, { phase: "reveal" });
    await b.commit();
  }
  async function toggle(pid) {
    const key = String(room.q);
    const marks = structuredClone(results[key]?.marks || {});
    const m = marks[pid]; if (!m) return;
    m.ok = !m.ok; m.pts = m.ok ? m.ifOk : 0;
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, ...ROOM, "results", key), { marks });
    writeTotals(b, { ...results, [key]: { marks } });
    await b.commit();
  }
  // 모든 문제 결과를 합쳐 참가자별 합계를 다시 씀
  function writeTotals(b, all) {
    const tot = {};
    players.forEach(p => tot[p.id] = { nick: p.nick, score: 0, correct: 0, timeMs: 0 });
    for (const r of Object.values(all)) {
      for (const [pid, m] of Object.entries(r.marks || {})) {
        if (!tot[pid]) continue; // 명단에서 빠진 사람은 제외
        tot[pid].score += m.pts || 0;
        if (m.ok) { tot[pid].correct++; tot[pid].timeMs += m.t || 0; }
      }
    }
    for (const [pid, t] of Object.entries(tot)) b.set(fs.doc(db, ...ROOM, "scores", pid), t);
  }
  async function next() {
    if (room.q < QUESTIONS.length - 1) await startQ(room.q + 1);
    else await fs.updateDoc(roomRef, { phase: "final" });
  }
  async function resetGame() {
    if (!resetArmed) { resetArmed = true; render(); setTimeout(() => { resetArmed = false; render(); }, 5000); return; }
    resetArmed = false;
    const b = fs.writeBatch(db);
    for (const name of ["answers", "results", "scores"]) {
      (await fs.getDocs(col(name))).docs.forEach(d => b.delete(d.ref));
    }
    b.set(roomRef, { phase: "lobby", q: 0, startedAt: null, hintAt: null, duration: DURATION_MS });
    await b.commit();
  }

  // ── 그리기 ──
  function render() {
    if (!room) return;
    const total = QUESTIONS.length, q = QUESTIONS[room.q];
    const done = room.phase === "final" ? total : room.q + (room.phase === "reveal" ? 1 : 0);
    $("ehBar").style.width = room.phase === "lobby" ? "0%" : `${(done / total) * 100}%`;
    clearInterval(tick); tick = null;

    if (room.phase === "lobby") {
      $("ehMeta").innerHTML = `<span class="pill">${total}문제</span><span class="pill">참가 ${players.length}명</span>`;
      $("ehStage").innerHTML = `
        <div class="emoji" style="font-size:clamp(2.4rem,7vw,4.5rem)" aria-hidden="true">🐋⚔️🐋 🦐💥</div>
        <h1 class="eh-title">이게 내 <span>이모지</span>야</h1>
        <p class="eh-mean">이모지를 보고 어떤 속담인지 휴대폰에 써 주세요. 문제당 ${DURATION_MS / 1000}초.<br>
        맞히면 100점, 빨리 낼수록 최대 50점 더. 초성 힌트가 나온 뒤에 내면 기본 50점.</p>`;
      $("ehCtl").innerHTML = `<button class="btn primary" data-act="start">1번 문제 시작 <kbd>Enter</kbd></button>
        <button class="btn warn" data-act="reset">${resetArmed ? "한 번 더 누르면 점수를 모두 지웁니다" : "게임 초기화"}</button>`;
    }

    else if (room.phase === "question") {
      $("ehMeta").innerHTML = meta(q);
      const hinted = room.hintAt != null;
      $("ehStage").innerHTML = `
        <div class="qnum mono muted">Q${room.q + 1}</div>
        ${emojiHtml(q)}
        <div class="eh-row"><div class="eh-timer" id="ehTimer"></div><div class="eh-count" id="ehCount"></div></div>
        <div class="eh-hint">${hinted ? `<small>초성 힌트 · ${q.a.replace(/\s/g, "").length}글자 · 지금부터 기본 50점</small>${chosung(q.a)}` : ""}</div>`;
      $("ehCtl").innerHTML = `
        ${hinted ? "" : `<button class="btn" data-act="hint">초성 힌트 <kbd>H</kbd></button>`}
        <button class="btn primary" data-act="reveal">정답 공개 <kbd>Enter</kbd></button>`;
      tick = setInterval(renderTimer, 250); renderTimer(); renderLive();
    }

    else if (room.phase === "reveal") {
      $("ehMeta").innerHTML = meta(q);
      const marks = results[room.q]?.marks || {};
      const list = Object.entries(marks).map(([pid, m]) => ({ pid, ...m, ...(answers.find(a => a.pid === pid) || {}) }))
        .sort((a, b) => (b.ok - a.ok) || (b.pts - a.pts));
      const nOk = list.filter(x => x.ok).length;
      const top = ranked(scores).slice(0, 5);
      const last = room.q === QUESTIONS.length - 1;
      $("ehStage").innerHTML = `
        ${emojiHtml(q, true)}
        <h2 class="eh-answer">${esc(q.a)}</h2>
        <div class="eh-decode">${esc(q.d)}</div>
        <p class="eh-mean">${esc(q.m)}</p>
        <div class="eh-split" style="width:min(1100px,100%)">
          <div class="card" style="background:var(--night)">
            <div class="muted" style="margin-bottom:6px">정답 <b class="mono" style="color:var(--pine)">${nOk}</b>명 / 제출 ${list.length}명 · 판정이 틀렸으면 O/X를 눌러 바꾸세요</div>
            <div class="eh-list">${list.map(x => `<div class="eh-ans">
              <button class="${x.ok ? "ok" : "no"}" data-toggle="${esc(x.pid)}" aria-label="${esc(x.nick)} 판정 바꾸기">${x.ok ? "O" : "X"}</button>
              <span class="nick">${esc(x.nick)}</span><span class="txt">${esc(x.text)}</span><span class="pts">${x.ok ? "+" + x.pts : ""}</span></div>`).join("") || `<span class="muted">제출한 사람이 없어요</span>`}</div>
          </div>
          <div class="card" style="background:var(--night)">
            <div class="muted" style="margin-bottom:6px">현재 순위</div>
            <div class="eh-board">${top.map(r => `<div><span class="r">${r.rank}</span><span class="n">${esc(r.nick)}</span><span class="s">${r.score}</span></div>`).join("")}</div>
          </div>
        </div>`;
      $("ehCtl").innerHTML = `<button class="btn primary" data-act="next">${last ? "최종 순위 보기" : "다음 문제"} <kbd>Enter</kbd></button>`;
    }

    else if (room.phase === "final") {
      $("ehMeta").innerHTML = `<span class="pill">최종 결과</span>`;
      const r = ranked(scores);
      const podium = [r[1], r[0], r[2]];
      $("ehStage").innerHTML = `
        <h1 class="eh-title">오늘의 <span>속담왕</span></h1>
        <div class="eh-podium">${podium.map((p, i) => p ? `<div class="p${[2, 1, 3][i]}">
          <span class="nm">${esc(p.nick)}</span><span class="sc">${p.score}점 · ${p.correct}개</span>
          <div class="bar">${p.rank}</div></div>` : "<div></div>").join("")}</div>
        <div class="eh-board" style="width:min(520px,100%)">${r.slice(3, 10).map(x => `<div><span class="r">${x.rank}</span><span class="n">${esc(x.nick)}</span><span class="s">${x.score}</span></div>`).join("")}</div>`;
      $("ehCtl").innerHTML = `<button class="btn warn" data-act="reset">${resetArmed ? "한 번 더 누르면 점수를 모두 지웁니다" : "게임 초기화"}</button>`;
    }

    $("ehCtl").querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    $("ehStage").querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggle(b.dataset.toggle));
  }

  function meta(q) {
    return `<span class="pill lvl-${q.lvl}">${LVL_NAME[q.lvl]}</span><span class="pill">${String(room.q + 1).padStart(2, "0")} / ${QUESTIONS.length}</span><span class="pill">참가 ${players.length}명</span>`;
  }
  function emojiHtml(q, small) {
    return `<div class="eh-emoji" ${small ? 'style="font-size:clamp(2rem,6vh,3.6rem)"' : ""} aria-label="이모지 문제">${q.e.map(r => `<span>${r}</span>`).join("")}</div>`;
  }
  function renderTimer() {
    const t = $("ehTimer"); if (!t || !room) return;
    const st = ms(room.startedAt);
    const left = st == null ? (room.duration || DURATION_MS) : st + (room.duration || DURATION_MS) - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `⏱ ${s}초` : "⏰ 시간 끝!";
    t.className = "eh-timer" + (s <= 0 ? " over" : s <= 10 ? " warn" : "");
  }
  function renderLive() {
    const c = $("ehCount"); if (!c) return;
    c.innerHTML = `제출 <b>${answers.length}</b> / ${players.length}`;
  }

  let busy = false;
  async function act(a) {
    if (busy) return; busy = true;
    try {
      if (a === "start") await startQ(0);
      else if (a === "hint") await hint();
      else if (a === "reveal") await reveal();
      else if (a === "next") await next();
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
      act({ lobby: "start", question: "reveal", reveal: "next" }[room.phase] || "");
    } else if ((e.key === "h" || e.key === "H" || e.key === "ㅗ") && room.phase === "question") act("hint");
  }
  document.addEventListener("keydown", onKey);

  return () => {
    unsubs.forEach(u => u()); if (ansUnsub) ansUnsub();
    clearInterval(tick); document.removeEventListener("keydown", onKey);
  };
}
