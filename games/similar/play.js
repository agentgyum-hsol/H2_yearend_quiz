// H2맨틀 참가자 화면 (휴대폰). 단어 목록(약 200KB)만 받아 모르는 단어는 보내지 않고,
// 유사도는 운영자 화면이 채점해 feedback 문서로 돌려줍니다.
import { ROOM, GAME_ID, ROUNDS, DURATION_MS, GRACE_MS, MIN_GAP_MS, loadStyle, esc, norm, resolve, fmtSim, fmtRank, bar, hintFlash, loadWords } from "./common.js";
import { ms } from "../../shared/db.js";

export function mount(el, { db, fs, player }) {
  loadStyle();
  const roomRef = fs.doc(db, ...ROOM);
  let room = null, fb = null, board = null, champ = null, words = null, wordErr = false;
  let fbUnsub = null, fbRound = null, tick = null, drawnKey = null, lastSent = 0;
  let pending = [];   // 보냈지만 아직 채점 결과가 오지 않은 단어
  let lastWord = null, msg = "";
  let feed = null;   // 모두의 추측 (운영자 화면이 2초마다 갱신)
  const unsubs = [];

  el.innerHTML = `<div class="sp" id="sp"></div>`;
  const root = el.querySelector("#sp");

  loadWords().then(d => { words = new Set(d.words); render(); }, () => { wordErr = true; render(); });

  unsubs.push(fs.onSnapshot(roomRef, s => { room = s.exists() ? s.data() : null; watchMine(); render(); }));
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "board", "current"), s => { board = s.exists() ? s.data() : null; render(); }));
  unsubs.push(fs.onSnapshot(fs.doc(db, ...ROOM, "feed", "current"), s => { feed = s.exists() ? s.data() : null; renderList(); }));
  unsubs.push(fs.onSnapshot(fs.doc(db, "winners", GAME_ID), s => { champ = s.exists() ? s.data() : null; drawnKey = null; render(); }));

  function watchMine() {
    if (!room || fbRound === room.round) return;
    if (fbUnsub) fbUnsub();
    fbRound = room.round; fb = null; pending = []; lastWord = null; msg = "";
    fbUnsub = fs.onSnapshot(fs.doc(db, ...ROOM, "feedback", `${room.round}_${player.id}`), s => {
      fb = s.exists() ? s.data() : null;
      const got = new Set((fb?.list || []).map(x => x.w));
      pending = pending.filter(w => !got.has(w));
      renderList();
    });
  }

  const dur = () => room?.duration || DURATION_MS;
  function deadline() { const st = ms(room?.startedAt); return st == null ? null : st + dur(); }
  function timeUp() { const d = deadline(); return d != null && Date.now() > d; }
  const solved = () => fb?.solvedMs != null;
  const fmtTime = t => { const s = Math.round((t || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function render() {
    if (!room) { root.innerHTML = `<div class="sp-center"><p class="muted">곧 시작합니다</p></div>`; return; }
    const key = `${room.phase}:${room.round}:${room.finalStep || 0}:${JSON.stringify(room.hints || [])}:${!!words}`;
    if (room.phase === "round" && key === drawnKey) { renderList(); renderTimer(); return; }
    drawnKey = key;
    clearInterval(tick); tick = null;

    if (room.phase === "lobby") {
      root.innerHTML = `<div class="sp-center">
        <div class="emoji" style="font-size:3rem" aria-hidden="true">🌡️🔤🕵️</div>
        <p class="sp-big">H2맨틀</p>
        <ul class="rules">
          <li>비밀 단어를 맞히는 게임이에요</li>
          <li>아무 단어나 넣으면 비밀 단어와 얼마나 가까운지 <b>유사도</b>와 <b>순위</b>가 나와요</li>
          <li>유사도가 높은 단어를 따라가세요</li>
          <li>추측 횟수는 무제한, 먼저 맞힐수록 점수가 높아요</li>
        </ul>
        <p class="muted">곧 시작합니다</p></div>`;
    }

    else if (room.phase === "round") {
      const typing = root.querySelector("#spText");
      const keep = typing ? typing.value : "";
      root.innerHTML = `
        <div class="sp-meta"><span class="pill">${room.round + 1} / ${ROUNDS} 라운드</span><span class="sp-timer" id="spTimer"></span></div>
        ${(room.hints || []).length ? `<div class="sp-hints">${room.hints.map(h => `<span class="${hintFlash(h)}"><small>💡 ${h.r}위 힌트</small> ${esc(h.w)}</span>`).join("")}</div>` : ""}
        <div class="sp-top2" id="spTop2"></div>
        <form id="spForm" autocomplete="off">
          <input class="field" id="spText" maxlength="12" placeholder="${words ? "단어를 넣어 보세요" : wordErr ? "단어 목록을 못 받았어요. 새로고침해 주세요" : "단어 목록 받는 중…"}" enterkeyhint="send" autocapitalize="off" spellcheck="false" ${words ? "" : "disabled"}>
          <button class="btn primary" id="spBtn" type="submit" ${words ? "" : "disabled"}>추측</button>
        </form>
        <div class="sp-msg" id="spMsg" role="status"></div>
        <div id="spSolved"></div>
        <div class="sp-last" id="spLast"></div>
        <div class="sp-sub">모두의 추측 <span class="sp-me-key">내 추측</span></div>
        <div class="sp-head"><span>#</span><span>단어</span><span class="s">단어 유사도</span><span class="r">순위</span></div>
        <div class="sp-list" id="spList"></div>`;
      const inp = root.querySelector("#spText"); inp.value = keep;
      root.querySelector("#spForm").onsubmit = submit;
      tick = setInterval(renderTimer, 250); renderTimer(); renderList();
    }

    else if (room.phase === "reveal") {
      const me = board?.round === room.round ? board.rows.find(r => r.id === player.id) : null;
      const l = me?.last;
      const waiting = board?.round !== room.round;
      root.innerHTML = `<div class="sp-center">
        ${waiting ? `<p class="muted">채점 중…</p>`
          : l?.solved ? `<p class="sp-big ok">${l.order}등으로 정답! +${l.pts}</p>`
          : l ? `<p class="sp-big no">아쉬워요 ${l.pts ? `+${l.pts}` : ""}</p><p class="muted" style="margin:0">가장 가까이 간 순위: ${fmtRank(l.best)}</p>`
          : `<p class="sp-big no">이번 라운드는 쉬었어요</p>`}
        <p class="muted" style="margin:0">비밀 단어는 큰 화면을 봐 주세요</p>
        ${me ? `<div class="sp-stat"><div><b>${me.rank}<small>위</small></b><small>${board.rows.length}명 중</small></div><div><b>${me.score}</b><small>내 점수</small></div></div>` : ""}
      </div>`;
    }

    else if (room.phase === "final") {
      const me = board?.rows?.find(x => x.id === player.id);
      const win = champ && champ.pid === player.id;
      root.innerHTML = `<div class="sp-center">
        <div class="emoji" style="font-size:3.4rem" aria-hidden="true">${!champ ? "🥁" : win ? "👑" : "🎉"}</div>
        <p class="sp-big ${win ? "ok" : ""}">${!champ ? "최종 발표 중…" : win ? "H2맨틀 우승!" : me ? `${me.rank}위` : "수고했어요"}</p>
        <div class="sp-stat">
          <div><b>${me ? me.score : 0}</b><small>최종 점수</small></div>
          <div><b>${me ? me.solves : 0}<small>/${ROUNDS}</small></b><small>맞힌 라운드</small></div>
        </div>
        ${champ ? `<p class="muted">우승 ${esc(champ.nick)}</p>` : `<p class="muted">큰 화면을 봐 주세요</p>`}</div>`;
    }
  }

  async function submit(e) {
    e.preventDefault();
    const input = root.querySelector("#spText");
    const typed = norm(input.value);
    const say = t => { msg = t; const m = root.querySelector("#spMsg"); if (m) m.textContent = t; };
    if (!typed || room?.phase !== "round") return;
    if (timeUp()) return say("시간이 끝났어요");
    if (solved()) return say("이미 맞혔어요! 다음 라운드를 기다려 주세요");
    const hit = resolve(typed, x => words.has(x));
    if (!hit) { input.value = ""; return say(`"${typed}"는 단어 목록에 없어요. 다른 단어를 넣어 주세요 (횟수에 안 들어가요)`); }
    const w = hit.w;
    const mine = fb?.list || [];
    if (mine.some(x => x.w === w) || pending.includes(w)) { lastWord = w; input.value = ""; renderList(); return say(`"${w}"는 이미 넣은 단어예요`); }
    const wait = lastSent + MIN_GAP_MS - Date.now();
    if (wait > 0) return say("조금만 천천히 넣어 주세요");
    lastSent = Date.now();
    const btn = root.querySelector("#spBtn"); btn.disabled = true;
    try {
      const gid = `${room.round}_${player.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      pending.push(w); lastWord = w; input.value = ""; say(w !== typed && !hit.parts ? `"${typed}" → "${w}"(으)로 넣었어요` : ""); renderList();
      await fs.setDoc(fs.doc(db, ...ROOM, "guesses", gid), { pid: player.id, nick: player.nick, round: room.round, word: w, at: fs.serverTimestamp() });
    } catch (err) {
      console.error(err);
      pending = pending.filter(x => x !== w);
      input.value = typed; say("보내지 못했어요. 다시 눌러 주세요."); renderList();
    } finally { btn.disabled = timeUp() || solved(); input.focus(); }
  }

  const nk = x => (x.nick ? `<small class="nk">${esc(x.nick)}</small>` : "");
  function rowHtml(x, i, cls = "") {
    if (x.pending) return `<div class="sp-row pending ${cls}"><span class="i mono">${i}</span><span class="w">${esc(x.w)}</span><span class="s muted">채점 중…</span><span class="r"></span></div>`;
    if (x.u) return `<div class="sp-row ${cls}"><span class="i mono">${i}</span><span class="w">${esc(x.w)}</span><span class="s muted">모르는 단어</span><span class="r"></span></div>`;
    if (x.hit) return `<div class="sp-row hit ${cls}"><span class="i"></span><span class="w">🎉 정답!${nk(x)}</span><span class="s"></span><span class="r"></span></div>`;
    return `<div class="sp-row ${x.r === 0 ? "hit" : ""} ${x.mine ? "mine" : ""} ${cls}"><span class="i mono">${i ?? ""}</span><span class="w">${esc(x.w)}${nk(x)}</span><span class="s mono">${fmtSim(x.s)}</span>
      <span class="r">${bar(x.r, `${room?.round}:${x.w}`)}<small class="mono">${fmtRank(x.r)}</small></span></div>`;
  }

  function renderList() {
    const box = root.querySelector("#spList"); if (!box || room?.phase !== "round") return;
    const list = (fb?.list || []).map((x, i) => ({ ...x, i: i + 1, mine: true }));
    const all = [...list, ...pending.map((w, k) => ({ w, pending: true, mine: true, i: list.length + k + 1 }))];
    const last = all.find(x => x.w === lastWord);
    root.querySelector("#spLast").innerHTML = last ? `<div class="muted" style="font-size:.85rem">내가 방금 넣은 단어</div>${rowHtml(last, last.i, "latest")}` : "";

    // 모두의 추측 + 내 추측을 한 목록으로 (내 단어는 바로 보이고, 다른 사람 단어는 2초마다 갱신)
    const f = feed && feed.round === room.round ? feed : null;
    const merged = new Map();
    for (const x of f?.top || []) merged.set(x.w, { ...x });
    for (const x of list) if (!x.u) merged.set(x.w, { ...merged.get(x.w), ...x, nick: "나", mine: true });
    const rows = [...merged.values()].filter(x => x.r !== 0).sort((a, b) => (b.s ?? -99) - (a.s ?? -99));
    const solvedLine = f?.solved?.length ? `<div class="sp-sub">맞힌 사람: ${f.solved.map(esc).join(", ")}</div>` : "";
    box.innerHTML = solvedLine + (rows.length ? rows.map((x, i) => rowHtml(x, i + 1)).join("")
      : `<p class="muted" style="text-align:center">아직 추측이 없어요. 아무 단어나 시작해 보세요!</p>`);

    // 지금 가장 가까운 단어 1·2등: 입력창 바로 위에 고정 (키보드가 올라와도 보이게)
    const t2 = root.querySelector("#spTop2");
    if (t2) t2.innerHTML = rows.length ? rows.slice(0, 2).map((x, i) => `<div class="sp-top2-i ${x.mine ? "mine" : ""}"><small>${i + 1}등</small><b>${esc(x.w)}</b><span class="mono">${fmtSim(x.s)}</span><small class="mono">${fmtRank(x.r)}</small></div>`).join("") : "";

    const sv = root.querySelector("#spSolved");
    if (sv) sv.innerHTML = solved() ? `<div class="sp-solved"><span class="emoji" aria-hidden="true">🎉</span> 정답! ${fmtTime(fb.solvedMs)} 만에 ${fb.n}번째 추측으로 맞혔어요</div>` : "";
    if (solved()) { const b = root.querySelector("#spBtn"), i = root.querySelector("#spText"); if (b) b.disabled = true; if (i) i.disabled = true; }
  }

  function renderTimer() {
    const t = root.querySelector("#spTimer"); if (!t || room?.phase !== "round") return;
    const d = deadline();
    const left = d == null ? dur() : d - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    t.textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "마감";
    t.className = "sp-timer" + (s <= 0 ? " over" : s <= 30 ? " warn" : "");
    if (s <= 0) {
      const b = root.querySelector("#spBtn"), i = root.querySelector("#spText");
      if (b) b.disabled = true; if (i) i.disabled = true;
    }
  }

  return () => { unsubs.forEach(u => u()); if (fbUnsub) fbUnsub(); clearInterval(tick); };
}
