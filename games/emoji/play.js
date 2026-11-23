// 이모지 퀴즈 참가자 화면 (휴대폰)
import { ALL, MAIN, isReserve, LVL_NAME, durationFor, multFor, hintTime, chosung } from "./questions.js";
import { ROOM, loadStyle, esc } from "./common.js";
import { ms } from "../../shared/db.js";

export function mount(el, { db, fs, player }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  let room = null, myAnswer = null, board = null, champ = null, scores = [], tick = null, ansUnsub = null, ansQ = null;
  let drawnKey = null;
  const unsubs = [];

  el.innerHTML = `<div class="ep" id="ep"></div>`;
  const root = el.querySelector("#ep");

  unsubs.push(fs.onSnapshot(roomRef, s => { room = s.exists() ? s.data() : null; watchMine(); render(); }));
  // 순위표는 운영자가 쓰는 문서 하나(board/current)만 구독. 내 이번 문제 결과도 여기 들어 있음.
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "board", "current"), s => { board = s.exists() ? s.data() : null; scores = board?.rows || []; render(); }));

  // 확정 우승자 (문서 하나)
  unsubs.push(fs.onSnapshot(fs.doc(db, "winners", "emoji"), s => { champ = s.exists() ? s.data() : null; drawnKey = null; render(); }));

  function watchMine() {
    if (!room || ansQ === room.q) return;
    if (ansUnsub) ansUnsub();
    ansQ = room.q; myAnswer = null;
    ansUnsub = fs.onSnapshot(fs.doc(db, ...ROOM, "answers", `${room.q}_${player.id}`), s => {
      myAnswer = s.exists() ? s.data() : null; renderSent();
    });
  }

  const dur = () => room.duration || durationFor(ALL[room.q]);
  function deadline() { const st = ms(room?.startedAt); return st == null ? null : st + dur(); }
  function timeUp() { const d = deadline(); return d != null && Date.now() > d; }

  function render() {
    if (!room) { root.innerHTML = `<div class="ep-result"><p class="muted">곧 시작합니다</p></div>`; return; }
    const q = ALL[room.q];
    // 문제 화면은 입력 중인 글자가 지워지지 않도록 같은 문제면 다시 그리지 않음 (힌트는 타이머가 채움)
    const key = `${room.phase}:${room.q}:${room.finalStep || 0}`;
    if (room.phase === "question" && key === drawnKey) { renderSent(); renderTimer(); return; }
    drawnKey = key;
    clearInterval(tick); tick = null;

    if (room.phase === "lobby") {
      root.innerHTML = `<div class="ep-result">
        <div class="emoji" style="font-size:3rem" aria-hidden="true">🐋⚔️🐋 🦐💥</div>
        <p class="ep-big">이게 내 이모지야</p>
        <p class="muted" style="margin:0">화면에 나오는 이모지를 보고 속담을 써서 내면 됩니다. 빨리 맞힐수록 점수가 높고, 어려움 문제는 2배예요.</p>
        <p class="muted">곧 시작합니다</p></div>`;
    }

    else if (room.phase === "question") {
      const label = isReserve(room.q) ? "동점 결승 문제" : `Q${room.q + 1} / ${MAIN} · ${LVL_NAME[q.lvl]}${multFor(q) > 1 ? " ×2" : ""}`;
      root.innerHTML = `
        <div class="ep-meta"><span class="pill">${label}</span><span class="ep-timer" id="epTimer"></span></div>
        <div class="ep-emoji" aria-label="이모지 문제">${q.e.map(r => `<span>${r}</span>`).join("")}</div>
        <div class="ep-hint" id="epHint"></div>
        <form id="epForm" autocomplete="off">
          <input class="field" id="epText" maxlength="40" placeholder="속담을 써 주세요" enterkeyhint="send">
          <button class="btn primary" id="epBtn" type="submit">제출</button>
          <div class="ep-sent" id="epSent" role="status"></div>
        </form>`;
      root.querySelector("#epForm").onsubmit = submit;
      tick = setInterval(renderTimer, 250); renderTimer(); renderSent();
    }

    else if (room.phase === "reveal" && isReserve(room.q)) {
      root.innerHTML = `<div class="ep-result">
        <p class="muted" style="margin:0">결승 문제 정답</p>
        <p class="display" style="font-size:1.5rem;margin:0">${esc(q.a)}</p>
        ${myAnswer ? `<p class="muted" style="margin:0">내 답: ${esc(myAnswer.text)}</p>` : ""}
        <p class="muted">결과는 큰 화면을 봐 주세요</p></div>`;
    }

    else if (room.phase === "reveal" && board?.q !== room.q) {
      root.innerHTML = `<div class="ep-result"><p class="muted">채점 중…</p></div>`;
    }

    else if (room.phase === "reveal") {
      const me = scores.find(r => r.id === player.id);
      const m = me && me.answered ? { ok: me.lastOk, pts: me.lastPts } : null;
      root.innerHTML = `<div class="ep-result">
        ${m ? (m.ok ? `<p class="ep-big ok">정답! +${m.pts}</p>` : `<p class="ep-big no">아쉬워요</p>`) : `<p class="ep-big no">답을 못 냈어요</p>`}
        <p class="muted" style="margin:0">정답</p>
        <p class="display" style="font-size:1.5rem;margin:0">${esc(q.a)}</p>
        ${myAnswer ? `<p class="muted" style="margin:0">내 답: ${esc(myAnswer.text)}</p>` : ""}
        <div class="ep-stat">
          ${board.hidden ? `<div><b>🤫</b><small>순위는 최종 발표 때</small></div>` : `<div><b>${me ? me.rank : "-"}<small>위</small></b><small>${scores.length}명 중</small></div>`}
          <div><b>${me ? me.score : 0}</b><small>내 점수</small></div>
        </div></div>`;
    }

    else if (room.phase === "final") {
      // 우승 확정 전까지는 등수를 가리고, 확정되면 내 등수와 우승자를 보여 줌
      const me = scores.find(x => x.id === player.id);
      const win = champ && champ.pid === player.id;
      root.innerHTML = `<div class="ep-result">
        <div class="emoji" style="font-size:3.4rem" aria-hidden="true">${!champ ? "🥁" : win ? "👑" : "🎉"}</div>
        <p class="ep-big ${win ? "ok" : ""}">${!champ ? "최종 발표 중…" : win ? "오늘의 속담왕!" : me ? `${me.rank}위` : "수고했어요"}</p>
        <div class="ep-stat">
          <div><b>${me ? me.score : 0}</b><small>최종 점수</small></div>
          <div><b>${me ? me.correct : 0}<small>/${MAIN}</small></b><small>맞힌 문제</small></div>
        </div>
        ${champ ? `<p class="muted">우승 ${esc(champ.nick)}</p>` : `<p class="muted">큰 화면을 봐 주세요</p>`}</div>`;
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
    const t = root.querySelector("#epTimer"); if (!t || room?.phase !== "question") return;
    const d = deadline();
    const left = d == null ? dur() : d - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `${s}초` : "마감";
    t.className = "ep-timer" + (s <= 0 ? " over" : s <= 10 ? " warn" : "");
    const h = hintTime(ms(room.startedAt), ms(room.hintAt), dur());
    const on = room.hintAt != null || (h != null && Date.now() >= h);
    const hint = root.querySelector("#epHint");
    if (hint && !!hint.textContent !== on) hint.textContent = on ? chosung(ALL[room.q].a) : "";
    if (s <= 0) {
      const b = root.querySelector("#epBtn"), i = root.querySelector("#epText");
      if (b) b.disabled = true; if (i) i.disabled = true;
    }
  }

  return () => { unsubs.forEach(u => u()); if (ansUnsub) ansUnsub(); clearInterval(tick); };
}
