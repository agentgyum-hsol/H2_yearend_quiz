// 게임 설명(사전 라운드): 운영자가 큰 화면에서 단계를 넘기면 모든 휴대폰이 같은 단계를 따라갑니다.
// 마지막 쪽에는 점수 없는 연습 문제가 있어 휴대폰이 잘 되는지도 같이 확인할 수 있어요.
//
// 데이터
//   rooms/tutorial                     {on, gameId, step, run}   운영자가 씀
//   rooms/tutorial/practice/{pid}      {run, game, nick, at, ...}  참가자가 자기 연습 기록을 씀 (점수와 무관)
//     이모지: {ok, tries}   H2맨틀: {best: [{w, s, r}], tries, solved}   임삼성: {alloc}
//
// 운영자: mountTutorialHost({db, fs}) 한 번 → openTutorial(gameId) 로 시작
// 참가자: watchTutorial({db, fs, uid}) 한 번 (play/index.html)
import { loadTutorial, esc, EMOJI_PRACTICE, INVEST_PRACTICE, investResult, similarPractice, similarRow } from "./content.js";

const css = new URL("./tutorial.css", import.meta.url).href;
function loadCss() {
  if ([...document.querySelectorAll("link")].some(l => l.href === css)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = css; document.head.appendChild(l);
}
const stateRef = (db, fs) => fs.doc(db, "rooms", "tutorial");
const practiceCol = (db, fs) => fs.collection(db, "rooms", "tutorial", "practice");

async function clearPractice(db, fs) {
  const docs = (await fs.getDocs(practiceCol(db, fs))).docs;
  for (let i = 0; i < docs.length; i += 450) {
    const b = fs.writeBatch(db); docs.slice(i, i + 450).forEach(d => b.delete(d.ref)); await b.commit();
  }
}

// ───────────────────────── 운영자 ─────────────────────────
export function mountTutorialHost({ db, fs }) {
  loadCss();
  const ref = stateRef(db, fs);
  const ov = document.createElement("section");
  ov.className = "tu-host"; ov.hidden = true; ov.setAttribute("aria-live", "polite");
  document.body.appendChild(ov);

  let st = null, tut = null, docs = [], pUnsub = null, pRun = null, busy = false;
  const loaded = new Map();
  const get = id => { if (!loaded.has(id)) loaded.set(id, loadTutorial(id)); return loaded.get(id); };

  const unsub = fs.onSnapshot(ref, async s => {
    st = s.exists() ? s.data() : null;
    if (!st?.on) { ov.hidden = true; watchPractice(null); return; }
    tut = await get(st.gameId);
    watchPractice(st.run);
    render();
  });
  function watchPractice(run) {
    if (run === pRun) return;
    pUnsub && pUnsub(); pUnsub = null; pRun = run; docs = [];
    if (run == null) return;
    pUnsub = fs.onSnapshot(fs.query(practiceCol(db, fs), fs.where("run", "==", run)), s => {
      docs = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.game === st?.gameId);
      if (tut?.steps[st.step]?.practice) render();
    });
  }
  function render() {
    if (!st?.on || !tut || tut.id !== st.gameId) return;
    const n = tut.steps.length, i = Math.min(st.step || 0, n - 1), step = tut.steps[i];
    ov.hidden = false;
    ov.innerHTML = `
      <header class="tu-top"><span class="tu-game"><span class="emoji" aria-hidden="true">${tut.emoji}</span> ${esc(tut.title)} 설명</span>
        <span class="tu-dots" aria-label="${i + 1}/${n}단계">${tut.steps.map((_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("")}</span></header>
      <div class="tu-body"><h2>${esc(step.title)}</h2><div class="tu-main">${step.big({ docs })}</div></div>
      <footer class="tu-ctl">
        <button class="btn" data-go="-1" ${i === 0 ? "disabled" : ""}>← 이전</button>
        <span class="muted mono">${i + 1} / ${n}</span>
        ${i < n - 1 ? `<button class="btn primary" data-go="1">다음 <kbd>→</kbd></button>` : `<button class="btn primary" data-close>설명 끝내기 <kbd>Enter</kbd></button>`}
        <button class="btn" data-close>닫기 <kbd>Esc</kbd></button>
      </footer>`;
    ov.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(+b.dataset.go));
    ov.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  }
  async function go(d) {
    if (busy || !st?.on || !tut) return;
    const next = Math.max(0, Math.min(tut.steps.length - 1, (st.step || 0) + d));
    if (next === st.step) return;
    busy = true;
    try { await fs.updateDoc(ref, { step: next }); } finally { busy = false; }
  }
  async function close() { await fs.setDoc(ref, { on: false }, { merge: true }); }

  // 설명이 떠 있는 동안에는 키를 게임 화면보다 먼저 가로챔
  const onKey = e => {
    if (ov.hidden) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || (k === "Enter" && tut && st.step < tut.steps.length - 1)) go(1);
    else if (k === "ArrowLeft" || k === "PageUp") go(-1);
    else if (k === "Escape" || k === "Enter") close();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  addEventListener("keydown", onKey, true);

  return {
    async open(gameId) {
      await clearPractice(db, fs).catch(e => console.warn("tutorial clear", e));
      await fs.setDoc(ref, { on: true, gameId, step: 0, run: Date.now() });
    },
    close,
    unmount() { unsub(); pUnsub && pUnsub(); removeEventListener("keydown", onKey, true); ov.remove(); },
  };
}

// ───────────────────────── 참가자 ─────────────────────────
export function watchTutorial({ db, fs, uid }) {
  loadCss();
  const ov = document.createElement("section");
  ov.className = "tu-phone"; ov.hidden = true; ov.setAttribute("aria-live", "polite");
  document.body.appendChild(ov);
  let st = null, tut = null, player = null, comp = null, compKey = null;
  const loaded = new Map();
  const get = id => { if (!loaded.has(id)) loaded.set(id, loadTutorial(id)); return loaded.get(id); };

  fs.onSnapshot(fs.query(fs.collection(db, "players"), fs.where("uid", "==", uid)), s => {
    const d = s.docs[0];
    player = d ? { id: d.id, nick: d.data().nick } : null;
    render();
  });
  fs.onSnapshot(stateRef(db, fs), async s => {
    st = s.exists() ? s.data() : null;
    if (st?.on) tut = await get(st.gameId);
    render();
  });

  function render() {
    // 입장 전에는 입장 화면을 그대로 둠
    if (!st?.on || !player || !tut || tut.id !== st.gameId) { ov.hidden = true; document.body.classList.remove("tu-open"); return; }
    const n = tut.steps.length, i = Math.min(st.step || 0, n - 1), step = tut.steps[i];
    ov.hidden = false; document.body.classList.add("tu-open");
    let head = ov.querySelector(".tu-ph-head");
    if (!head) {
      ov.innerHTML = `<div class="tu-ph-head"></div><div class="tu-ph-body"></div><div class="tu-ph-prac"></div><p class="tu-ph-foot muted">진행자 화면을 따라 넘어가요</p>`;
      head = ov.querySelector(".tu-ph-head");
    }
    head.innerHTML = `<div class="tu-ph-game"><span class="emoji" aria-hidden="true">${tut.emoji}</span> ${esc(tut.title)} <span class="muted mono">${i + 1}/${n}</span></div>
      <div class="tu-dots sm">${tut.steps.map((_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("")}</div><h2>${esc(step.title)}</h2>`;
    ov.querySelector(".tu-ph-body").innerHTML = step.phone || "";
    // 연습 입력: 같은 연습끼리는 화면을 새로 그리지 않고 단계만 알려 줌 (쓰던 글자가 지워지지 않게)
    const key = step.practice ? `${st.run}:${step.practice.id}` : null;
    const box = ov.querySelector(".tu-ph-prac");
    if (key !== compKey) {
      comp && comp.destroy && comp.destroy(); comp = null; compKey = key; box.innerHTML = "";
      if (key) comp = PRACTICE[step.practice.id]?.(box, { db, fs, player, run: st.run, game: tut.id });
    }
    comp && comp.phase(step.practice.phase);
  }
}

// 자기 연습 기록 저장 (실패해도 연습은 계속)
function saver({ db, fs, player, run, game }) {
  const ref = fs.doc(db, "rooms", "tutorial", "practice", player.id);
  return data => fs.setDoc(ref, { run, game, nick: player.nick, at: Date.now(), ...data }, { merge: true }).catch(e => console.warn("practice", e));
}

let _qs = null, _sim = null;
const questionsMod = () => (_qs ||= import("../../games/emoji/questions.js").catch(() => ({})));
const similarTools = () => (_sim ||= Promise.all([import("./similar-practice.js"), import("../../games/similar/common.js").catch(() => ({}))])
  .then(([P, C]) => ({ p: similarPractice(P, C.TOP_SIM_MIN ?? 0.8, C.norm, C.resolve), CUT: C.RANK_CUTOFF ?? 1000, gap: C.MIN_GAP_MS ?? 1500 })));

const PRACTICE = {
  emoji(box, ctx) {
    const P = EMOJI_PRACTICE, save = saver(ctx);
    let ok = false, tries = 0, phase = "play";
    box.innerHTML = `<span class="pill">연습 · ${esc(P.t)}</span>
      <div class="tu-emoji sm" aria-hidden="true">${P.e.map(l => `<div>${l}</div>`).join("")}</div>
      <p class="tu-hint" hidden></p>
      <form class="tu-form"><input class="field" maxlength="40" placeholder="정답을 써 보세요" autocomplete="off" enterkeyhint="send"><button class="btn primary">보내기</button></form>
      <p class="tu-msg" role="status"></p><p class="muted tu-note">연습이라 몇 번이든 다시 낼 수 있어요. 띄어쓰기는 상관없어요.</p>`;
    const form = box.querySelector("form"), input = box.querySelector("input"), msg = box.querySelector(".tu-msg");
    form.onsubmit = async e => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t || ok || phase === "reveal") return;
      const Q = await questionsMod();
      const n = s => String(s).replace(/\s/g, "");
      ok = Q.isCorrect ? Q.isCorrect(P, t) : [P.a, ...P.alt].some(a => n(a) === n(t));
      tries++;
      msg.className = "tu-msg " + (ok ? "good" : "bad");
      msg.textContent = ok ? "정답! 본 게임이었다면 100점 + 속도 보너스" : "아쉬워요. 다시 써 보세요";
      if (ok) { input.disabled = true; form.querySelector("button").disabled = true; } else input.select();
      save({ ok, tries });
    };
    return {
      async phase(p) {
        phase = p;
        const Q = await questionsMod();
        const h = box.querySelector(".tu-hint");
        h.hidden = p === "play"; h.textContent = Q.chosung ? Q.chosung(P.a) : "";
        if (p === "reveal") {
          form.hidden = true; box.querySelector(".tu-note").hidden = true; h.hidden = true;
          msg.className = "tu-msg " + (ok ? "good" : "");
          msg.innerHTML = `정답: <b>${esc(P.a)}</b><br>${ok ? "맞혔어요! 🎉" : "본 게임에선 꼭 맞혀 봐요"}`;
        }
      },
    };
  },

  similar(box, ctx) {
    const save = saver(ctx);
    const mine = []; let solved = false, tries = 0, last = 0, phase = "play", tools = null;
    box.innerHTML = `<form class="tu-form"><input class="field" maxlength="20" placeholder="아무 단어나 넣어 보세요" autocomplete="off" enterkeyhint="send"><button class="btn primary">추측</button></form>
      <p class="tu-msg" role="status"></p><div class="tu-mine"></div><p class="muted tu-note">연말 하면 떠오르는 단어예요. 모두의 추측은 큰 화면에서 보여요.</p>`;
    const form = box.querySelector("form"), input = box.querySelector("input"), msg = box.querySelector(".tu-msg");
    similarTools().then(t => { tools = t; });
    const draw = () => {
      if (!tools) return;
      const rows = [...mine].sort((a, b) => (a.r ?? 1e9) - (b.r ?? 1e9)).slice(0, 12);
      box.querySelector(".tu-mine").innerHTML = rows.length
        ? `<table class="tu-table sm"><thead><tr><th>내 추측</th><th>유사도</th><th>순위</th><th></th></tr></thead><tbody>${rows.map(x => similarRow(esc(x.w), x, tools.CUT)).join("")}</tbody></table>` : "";
    };
    form.onsubmit = async e => {
      e.preventDefault();
      if (solved || phase === "reveal") return;
      tools ||= await similarTools();
      const raw = input.value.trim();
      if (!raw) return;
      if (Date.now() - last < tools.gap) { msg.className = "tu-msg"; msg.textContent = "조금 천천히!"; return; }
      last = Date.now();
      const x = tools.p.lookup(raw);
      if (!x) { msg.className = "tu-msg bad"; msg.textContent = "한글 단어를 넣어 주세요"; return; }
      input.value = "";
      tries++;
      if (!mine.some(m => m.w === x.w)) mine.push(x);
      solved = x.r === 0;
      msg.className = "tu-msg " + (solved ? "good" : "");
      msg.textContent = solved ? `정답! ${x.w}` : x.r == null ? `${x.w}: ${tools.CUT}위 밖이거나 모르는 단어예요` : `${x.w}: 유사도 ${x.s.toFixed(2)}, ${x.r}위`;
      if (solved) { input.disabled = true; form.querySelector("button").disabled = true; }
      draw();
      // 큰 화면에는 각자 가장 가까운 추측 몇 개만 보냄 (쓰기 줄이기)
      const best = mine.filter(m => m.r != null && m.r > 0).sort((a, b) => a.r - b.r).slice(0, 3).map(({ w, s, r }) => ({ w, s, r }));
      save({ best, tries, solved });
    };
    return {
      async phase(p) {
        phase = p;
        if (p !== "reveal") return;
        tools ||= await similarTools();
        form.hidden = true; box.querySelector(".tu-note").hidden = true;
        msg.className = "tu-msg " + (solved ? "good" : "");
        msg.innerHTML = `정답: <b>${esc(tools.p.word)}</b>${solved ? " 🎉 맞혔어요!" : ""}`;
        draw();
      },
    };
  },

  invest(box, ctx) {
    const save = saver(ctx), P = INVEST_PRACTICE;
    const ids = ["dram", "nand", "gold", "btc"], alloc = { dram: 0, nand: 0, gold: 0, btc: 0 };
    let assets = null, sent = null, phase = "play", START = 1e8, won = v => Math.round(v / 1e4).toLocaleString("ko-KR") + "만원";
    box.innerHTML = `<article class="tu-news sm"><h3>${esc(P.title)}</h3><ul>${P.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul><p class="tu-boss">🧑‍💼 “${esc(P.boss)}”</p></article>
      <div class="tu-sliders"></div><p class="tu-cash"></p>
      <button class="btn primary tu-order" type="button">주문</button><p class="tu-msg" role="status"></p>`;
    const sl = box.querySelector(".tu-sliders"), msg = box.querySelector(".tu-msg");
    const cash = () => 100 - ids.reduce((s, k) => s + alloc[k], 0);
    import("../../games/invest/data.js").catch(() => ({})).then(D => {
      assets = (D.ASSETS || ids.map(id => ({ id, name: id.toUpperCase(), color: "#888" }))).filter(a => ids.includes(a.id));
      START = D.START_MONEY ?? START; if (D.won) won = D.won;
      sl.innerHTML = assets.map(a => `<label style="--c:${a.color}"><span>${esc(a.name)}</span><input type="range" min="0" max="100" step="5" value="0" data-id="${a.id}"><b class="mono">0%</b></label>`).join("");
      sl.querySelectorAll("input").forEach(inp => inp.oninput = () => {
        const id = inp.dataset.id, others = 100 - cash() - alloc[id];
        alloc[id] = Math.min(+inp.value, 100 - others); inp.value = alloc[id];
        inp.nextElementSibling.textContent = alloc[id] + "%"; drawCash();
      });
      drawCash();
    });
    const drawCash = () => { box.querySelector(".tu-cash").innerHTML = `현금 <b class="mono">${cash()}%</b> <span class="muted">(이자 +2%)</span>`; };
    box.querySelector(".tu-order").onclick = () => {
      if (phase === "reveal") return;
      sent = { ...alloc }; save({ alloc: sent });
      msg.className = "tu-msg good"; msg.textContent = "주문 완료! 결과 전까지 몇 번이든 바꿀 수 있어요";
    };
    return {
      phase(p) {
        phase = p;
        if (p !== "reveal") return;
        sl.querySelectorAll("input").forEach(i => i.disabled = true);
        box.querySelector(".tu-order").hidden = true;
        const v = investResult(START, sent || { dram: 0, nand: 0, gold: 0, btc: 0 }), r = (v / START - 1) * 100;
        msg.className = "tu-msg " + (r > 0 ? "good" : r < 0 ? "bad" : "");
        msg.innerHTML = sent ? `연습 결과: <b>${won(v)}</b> (${r >= 0 ? "+" : ""}${r.toFixed(1)}%)<br><span class="muted">비트코인 ▼${-P.move.btc}%, 금 ▲${P.move.gold}%, DRAM ▲${P.move.dram}%</span>` : "주문하지 않아 모두 현금(+2%)이에요";
      },
    };
  },
};
