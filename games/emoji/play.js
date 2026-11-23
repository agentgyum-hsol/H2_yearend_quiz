// 이모지 퀴즈 참가자 화면 (휴대폰)
import { QUESTIONS, LVL_NAME, DURATION_MS, chosung } from "./questions.js";
import { ROOM, loadStyle, esc } from "./common.js";
import { ms } from "../../shared/db.js";

export function mount(el, { db, fs, player }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  let room = null, myAnswer = null, board = null, scores = [], tick = null, ansUnsub = null, ansQ = null;
  let drawnKey = null;
  const unsubs = [];

  el.innerHTML = `<div class="ep" id="ep"></div>`;
  const root = el.querySelector("#ep");

  unsubs.push(fs.onSnapshot(roomRef, s => { room = s.exists() ? s.data() : null; watchMine(); render(); }));
  // 순위표는 운영자가 쓰는 문서 하나(board/current)만 구독. 내 이번 문제 결과도 여기 들어 있음.
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "board", "current"), s => { board = s.exists() ? s.data() : null; scores = board?.rows || []; render(); }));

  function watchMine() {
    if (!room || ansQ === room.q) return;
    if (ansUnsub) ansUnsub();
    ansQ = room.q; myAnswer = null;
    ansUnsub = fs.onSnapshot(fs.doc(db, ...ROOM, "answers", `${room.q}_${player.id}`), s => {
      myAnswer = s.exists() ? s.data() : null; renderSent();
    });
  }

  function deadline() {
    const st = ms(room?.startedAt);
    return st == null ? null : st + (room.duration || DURATION_MS);
  }
  function timeUp() { const d = deadline(); return d != null && Date.now() > d; }

  function render() {
    if (!room) { root.innerHTML = `<div class="ep-result"><p class="muted">곧 시작합니다</p></div>`; return; }
    const q = QUESTIONS[room.q];
    // 문제 화면은 입력 중인 글자가 지워지지 않도록 같은 문제·같은 힌트 상태면 다시 그리지 않음
    const key = `${room.phase}:${room.q}:${room.hintAt != null}`;
    if (room.phase === "question" && key === drawnKey) { renderSent(); return; }
    drawnKey = key;
    clearInterval(tick); tick = null;

    if (room.phase === "lobby") {
      root.innerHTML = `<div class="ep-result">
        <div class="emoji" style="font-size:3rem" aria-hidden="true">🐋⚔️🐋 🦐💥</div>
        <p class="ep-big">이게 내 이모지야</p>
        <p class="muted" style="margin:0">화면에 나오는 이모지를 보고 속담을 써서 내면 됩니다. 빨리 맞힐수록 점수가 높아요.</p>
        <p class="muted">곧 시작합니다</p></div>`;
    }

    else if (room.phase === "question") {
      const hinted = room.hintAt != null;
      root.innerHTML = `
        <div class="ep-meta"><span class="pill">Q${room.q + 1} / ${QUESTIONS.length} · ${LVL_NAME[q.lvl]}</span><span class="ep-timer" id="epTimer"></span></div>
        <div class="ep-emoji" aria-label="이모지 문제">${q.e.map(r => `<span>${r}</span>`).join("")}</div>
        ${hinted ? `<div class="ep-hint">${chosung(q.a)}</div>` : ""}
        <form id="epForm" autocomplete="off">
          <input class="field" id="epText" maxlength="40" placeholder="속담을 써 주세요" enterkeyhint="send">
          <button class="btn primary" id="epBtn" type="submit">제출</button>
          <div class="ep-sent" id="epSent" role="status"></div>
        </form>`;
      root.querySelector("#epForm").onsubmit = submit;
      tick = setInterval(renderTimer, 250); renderTimer(); renderSent();
    }

    else if (room.phase === "reveal" && board?.q !== room.q) {
      root.innerHTML = `<div class="ep-result"><p class="muted">채점 중…</p></div>`;
    }

    else if (room.phase === "reveal") {
      const me = board?.q === room.q ? scores.find(r => r.id === player.id) : null;
      const m = me && me.answered ? { ok: me.lastOk, pts: me.lastPts } : null;
      root.innerHTML = `<div class="ep-result">
        ${m ? (m.ok ? `<p class="ep-big ok">정답! +${m.pts}</p>` : `<p class="ep-big no">아쉬워요</p>`) : `<p class="ep-big no">답을 못 냈어요</p>`}
        <p class="muted" style="margin:0">정답</p>
        <p class="display" style="font-size:1.5rem;margin:0">${esc(q.a)}</p>
        ${myAnswer ? `<p class="muted" style="margin:0">내 답: ${esc(myAnswer.text)}</p>` : ""}
        <div class="ep-stat">
          <div><b>${me ? me.rank : "-"}<small>위</small></b><small>${scores.length}명 중</small></div>
          <div><b>${me ? me.score : 0}</b><small>내 점수</small></div>
        </div></div>`;
    }

    else if (room.phase === "final") {
      const r = scores, me = r.find(x => x.id === player.id);
      const top = me && me.rank <= 3;
      root.innerHTML = `<div class="ep-result">
        <div class="emoji" style="font-size:3.4rem" aria-hidden="true">${top ? ["🥇", "🥈", "🥉"][me.rank - 1] : "🎉"}</div>
        <p class="ep-big ${top ? "ok" : ""}">${me ? `${me.rank}위` : "수고했어요"}</p>
        <div class="ep-stat">
          <div><b>${me ? me.score : 0}</b><small>최종 점수</small></div>
          <div><b>${me ? me.correct : 0}<small>/${QUESTIONS.length}</small></b><small>맞힌 문제</small></div>
        </div>
        <p class="muted">1위 ${esc(r[0]?.nick || "")} · ${r[0]?.score ?? 0}점</p></div>`;
    }
  }

  async function submit(e) {
    e.preventDefault();
    const input = root.querySelector("#epText");
    const text = input.value.trim();
    if (!text || timeUp() || room.phase !== "question") return;
    const btn = root.querySelector("#epBtn"); btn.disabled = true;
    try {
      await fs.setDoc(fs.doc(db, ...ROOM, "answers", `${room.q}_${player.id}`),
        { pid: player.id, nick: player.nick, q: room.q, text, at: fs.serverTimestamp() });
    } catch (err) {
      root.querySelector("#epSent").textContent = "보내지 못했어요. 다시 눌러 주세요.";
    } finally { btn.disabled = timeUp(); }
  }

  function renderSent() {
    const s = root.querySelector("#epSent"); if (!s) return;
    if (myAnswer) s.textContent = `제출함: ${myAnswer.text} (마감 전까지 다시 내면 바뀝니다)`;
  }
  function renderTimer() {
    const t = root.querySelector("#epTimer"); if (!t) return;
    const d = deadline();
    const left = d == null ? (room.duration || DURATION_MS) : d - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `${s}초` : "마감";
    t.className = "ep-timer" + (s <= 0 ? " over" : s <= 10 ? " warn" : "");
    if (s <= 0) {
      const b = root.querySelector("#epBtn"), i = root.querySelector("#epText");
      if (b) b.disabled = true; if (i) i.disabled = true;
    }
  }

  return () => { unsubs.forEach(u => u()); if (ansUnsub) ansUnsub(); clearInterval(tick); };
}
