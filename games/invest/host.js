// 반도체왕 임삼성: 운영자(프로젝터) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, joinUrl? }
//   fs: Firestore 모듈 함수 { doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch }
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, applyRound, indexSeries, cashOf,
  won, pct, cls, arrow, esc, rankList, loadCss } from './data.js';

const PHASE_LABEL = { news: '뉴스', invest: '투자 접수', reveal: '결과' };
const newRun = () => Date.now().toString(36);

export function mount(el, ctx) {
  const { db, fs } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', 'invest');
  const portCol = fs.collection(db, 'rooms', 'invest', 'portfolios');
  const allocCol = (run, r) => fs.collection(db, 'rooms', 'invest', `allocs_${run}_${r}`);

  let room = null, ports = {}, allocs = {}, allocKey = '', unAlloc = null;
  let ui = { confirm: null, revealed: 0, revealKey: '', busy: false, err: '' };
  let timer = null;

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'inv inv-host';
  root.innerHTML = `<header class="ticker"><div class="wrap" data-r="ticker"></div></header>
    <main><div class="wrap" data-r="stage"></div></main>
    <nav class="bar" aria-label="게임 진행"><div class="wrap" data-r="bar"></div></nav>`;
  el.appendChild(root);
  const $ = k => root.querySelector(`[data-r="${k}"]`);

  /* ---------- 구독 ---------- */
  const unRoom = fs.onSnapshot(roomRef, snap => {
    if (!snap.exists()) { fs.setDoc(roomRef, { phase: 'lobby', round: 0, runId: newRun(), start: START_MONEY }); return; }
    room = snap.data();
    const key = room.runId + '_' + room.round;
    if (key !== allocKey) {
      unAlloc && unAlloc(); allocs = {}; allocKey = key;
      unAlloc = fs.onSnapshot(allocCol(room.runId, room.round), s => {
        allocs = {}; s.forEach(d => { allocs[d.id] = d.data(); }); render();
      });
    }
    if (room.phase === 'reveal' && ui.revealKey !== key) startReveal(key);
    render();
  }, e => showErr(e));
  const unPorts = fs.onSnapshot(portCol, s => {
    ports = {}; s.forEach(d => { ports[d.id] = d.data(); }); render();
  }, e => showErr(e));

  function showErr(e) { ui.err = '서버 연결에 문제가 있어요: ' + (e?.message || e); render(); }

  /* ---------- 진행 동작 ---------- */
  async function act(fn) {
    if (ui.busy) return;
    ui.busy = true; ui.err = ''; render();
    try { await fn(); } catch (e) { ui.err = '저장하지 못했어요. 다시 눌러 주세요. (' + (e?.message || e) + ')'; }
    ui.busy = false; ui.confirm = null; render();
  }
  const go = patch => act(() => fs.updateDoc(roomRef, patch));

  function settle() {
    return act(async () => {
      const r = room.round, m = ROUNDS[r].move;
      const before = rankList(ports).map(p => p.id);
      const next = {};
      Object.entries(ports).forEach(([id, p]) => {
        const alloc = allocs[id]?.alloc || p.lastAlloc || ZERO;
        const v = applyRound(p.value, alloc, m);
        next[id] = { nick: p.nick, value: v, hist: [...(p.hist || [p.value]), v], lastAlloc: alloc,
          roundRet: (v / p.value - 1) * 100, prevRank: before.indexOf(id) + 1, submitted: !!allocs[id], settledRound: r };
      });
      // 순위를 미리 계산해 각자 문서에 적어 둠: 참가자 폰은 자기 문서 하나만 구독하면 됨
      const order = rankList(next), total = order.length;
      const b = fs.writeBatch(db);
      order.forEach((p, k) => { const { id, nick, ...rest } = p; b.set(fs.doc(portCol, id), { ...rest, rank: k + 1, total }, { merge: true }); });
      b.update(roomRef, { phase: 'reveal' });
      await b.commit();
    });
  }
  function unsettle() { // 결과 취소: 이번 라운드 정산을 되돌리고 투자 접수로
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.entries(ports).forEach(([id, p]) => {
        if (p.settledRound !== room.round || !p.hist || p.hist.length < 2) return;
        const hist = p.hist.slice(0, -1);
        b.set(fs.doc(portCol, id), { value: hist[hist.length - 1], hist, settledRound: room.round - 1, rank: p.prevRank || null }, { merge: true });
      });
      b.update(roomRef, { phase: 'invest' });
      await b.commit();
    });
  }
  function resetGame() {
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.keys(ports).forEach(id => b.set(fs.doc(portCol, id),
        { value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, roundRet: 0, prevRank: null, rank: null, total: null, settledRound: -1 }, { merge: true }));
      b.set(roomRef, { phase: 'lobby', round: 0, runId: newRun(), start: START_MONEY });
      await b.commit();
    });
  }
  function clearPlayers() {
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.keys(ports).forEach(id => b.delete(fs.doc(portCol, id)));
      b.set(roomRef, { phase: 'lobby', round: 0, runId: newRun(), start: START_MONEY });
      await b.commit();
    });
  }

  function startReveal(key) {
    ui.revealKey = key; ui.revealed = 0; clearInterval(timer);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ui.revealed = 99; return; }
    timer = setInterval(() => { ui.revealed++; render(); if (ui.revealed > ASSETS.length) clearInterval(timer); }, 900);
  }

  /* ---------- 클릭 위임 ---------- */
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const a = t.dataset.a;
    if (a === 'start') go({ phase: 'news', round: 0 });
    else if (a === 'open') go({ phase: 'invest' });
    else if (a === 'settle') settle();
    else if (a === 'next') room.round >= ROUNDS.length - 1 ? go({ phase: 'final' }) : go({ phase: 'news', round: room.round + 1 });
    else if (a === 'back-news') go({ phase: 'news' });
    else if (a === 'unsettle') unsettle();
    else if (a === 'back-reveal') go({ phase: 'reveal' });
    else if (a === 'skip') { clearInterval(timer); ui.revealed = 99; render(); }
    else if (a === 'ask') { ui.confirm = t.dataset.k; render(); }
    else if (a === 'cancel') { ui.confirm = null; render(); }
    else if (a === 'reset') resetGame();
    else if (a === 'clear') clearPlayers();
  });

  /* ---------- 렌더 ---------- */
  function render() {
    if (!room) { $('stage').innerHTML = '<p class="muted">게임 정보를 불러오는 중…</p>'; return; }
    renderTicker(); renderBar();
    const v = { lobby: vLobby, news: vNews, invest: vInvest, reveal: vReveal, final: vFinal }[room.phase] || vLobby;
    $('stage').innerHTML = (ui.err ? `<p class="warn" role="alert" style="margin-bottom:16px">${esc(ui.err)}</p>` : '') + v();
  }

  function settledUpto() {
    if (!room || room.phase === 'lobby') return -1;
    if (room.phase === 'reveal' || room.phase === 'final') return room.round;
    return room.round - 1;
  }

  function renderTicker() {
    const upto = settledUpto();
    const hideLast = room.phase === 'reveal' && ui.revealed <= ASSETS.length;
    let h = '<div class="brand">반도체왕 임삼성</div>';
    INVEST.forEach((a, k) => {
      let u = upto; if (hideLast && k >= ui.revealed) u--;
      const arr = indexSeries(a.id, u), n = arr.length - 1, ch = n ? (arr[n] / arr[n - 1] - 1) * 100 : 0;
      h += `<div class="tick"><span class="dot" style="background:${a.color}"></span><b>${a.short}</b><span class="num">${arr[n].toFixed(1)}</span><span class="num ${cls(ch)}">${n ? arrow(ch) + ' ' + pct(Math.abs(ch), false) : ''}</span></div>`;
    });
    $('ticker').innerHTML = h;
  }

  function confirmBox(k, q, yes) {
    return ui.confirm === k
      ? `<span class="confirm">${q} <button class="btn" data-a="${k}">${yes}</button><button class="btn ghost" data-a="cancel">취소</button></span>`
      : '';
  }

  function renderBar() {
    const n = Object.keys(ports).length, busy = ui.busy ? 'disabled' : '';
    let steps = '', btns = '';
    if (room.phase === 'lobby') {
      steps = `<span class="muted">참가자 ${n}명 · ${ROUNDS.length}라운드</span>`;
      btns = confirmBox('clear', '참가자 명단을 모두 지울까요?', '예, 지우기') ||
        `<button class="btn ghost" data-a="ask" data-k="clear" ${n ? '' : 'disabled'}>참가자 비우기</button>`;
      btns += `<button class="btn primary" data-a="start" ${n < 1 || ui.busy ? 'disabled' : ''}>게임 시작</button>`;
    } else if (room.phase === 'final') {
      steps = '<span class="step on">최종 결과</span>';
      btns = `<button class="btn ghost" data-a="back-reveal" ${busy}>마지막 라운드 결과로</button>`;
    } else {
      steps = `<span class="step">R${room.round + 1}/${ROUNDS.length}</span>` +
        ['news', 'invest', 'reveal'].map(p => `<span class="step ${p === room.phase ? 'on' : ''}">${PHASE_LABEL[p]}</span>`).join('');
      if (room.phase === 'news') btns = `<button class="btn primary" data-a="open" ${busy}>투자 접수 열기</button>`;
      if (room.phase === 'invest') {
        const sub = Object.keys(allocs).filter(id => ports[id]).length;
        btns = `<button class="btn ghost" data-a="back-news" ${busy}>뉴스로</button>` +
          (confirmBox('settle', `${n - sub}명이 아직 안 냈어요. 지난 비율로 마감할까요?`, '예, 마감') ||
           `<button class="btn primary" data-a="${sub < n ? 'ask' : 'settle'}" data-k="settle" ${busy}>마감하고 결과 공개</button>`);
      }
      if (room.phase === 'reveal') {
        const done = ui.revealed > ASSETS.length;
        btns = (confirmBox('unsettle', '이번 라운드 정산을 취소하고 투자 접수로 돌아갈까요?', '예, 취소') ||
          `<button class="btn ghost" data-a="ask" data-k="unsettle" ${busy}>결과 취소</button>`) +
          `<button class="btn primary" data-a="next" ${done && !ui.busy ? '' : 'disabled'}>${room.round >= ROUNDS.length - 1 ? '최종 순위 발표' : '다음 라운드'}</button>`;
      }
    }
    const reset = confirmBox('reset', '모든 참가자의 자산을 처음으로 되돌릴까요?', '예, 처음부터') ||
      (room.phase !== 'lobby' ? `<button class="btn ghost" data-a="ask" data-k="reset" ${busy}>처음부터</button>` : '');
    $('bar').innerHTML = `<div class="steps">${steps}</div>${reset}${btns}`;
  }

  function vLobby() {
    const list = rankList(ports);
    return `<div class="lobby">
      <div class="stack">
        <div class="eyebrow">송년회 투자 배틀 · 개인전</div>
        <h1>반도체왕 <span style="color:var(--accent)">임삼성</span></h1>
        <p class="muted" style="font-size:1.15rem;max-width:60ch">모두 ${won(START_MONEY)}으로 시작합니다. 라운드마다 뉴스를 보고 휴대폰에서 DRAM, NAND, 금, 비트코인에 비율을 나눠 투자하세요. ${ROUNDS.length}라운드 뒤 자산이 가장 많은 사람이 올해의 반도체왕입니다.</p>
        <div class="card stack" style="gap:10px">
          ${ASSETS.map(a => `<div class="asset-li"><div class="asset-ic" style="background:${a.color}">${a.short}</div><div><b>${a.name}</b> <span class="muted" style="font-size:.9rem">${a.desc}</span></div></div>`).join('')}
        </div>
      </div>
      <div class="card stack">
        <div class="eyebrow">입장한 사람</div>
        <div class="big-count num">${list.length}<span style="font-size:.4em;color:var(--muted)"> 명</span></div>
        ${ctx.joinUrl ? `<p>휴대폰으로 접속: <b class="num" style="overflow-wrap:anywhere">${esc(ctx.joinUrl)}</b></p>` : ''}
        <div class="names">${list.map(p => `<span class="name">${esc(p.nick)}</span>`).join('') || '<span class="muted">아직 아무도 없어요. QR로 들어오면 여기에 이름이 뜹니다.</span>'}</div>
      </div>
    </div>`;
  }

  function newsBlock(r) {
    return `<article class="news"><div class="when">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></article>`;
  }

  function board(limit) {
    const list = rankList(ports).slice(0, limit);
    return `<div class="board">${list.map((p, k) => {
      const d = p.prevRank ? p.prevRank - (k + 1) : 0;
      return `<div class="brow ${k < 3 ? 'top' : ''}"><span class="rk">${k + 1}</span>
        <span class="nm">${esc(p.nick)} ${d ? `<span class="num ${cls(d)}" style="font-size:.8rem">${arrow(d)}${Math.abs(d)}</span>` : ''}</span>
        <span class="vv num">${won(p.value)}<br><span class="${cls(p.roundRet || 0)}">${room.phase === 'reveal' ? pct(p.roundRet || 0) : pct((p.value / START_MONEY - 1) * 100)}</span></span></div>`;
    }).join('')}</div>`;
  }

  function vNews() {
    const r = ROUNDS[room.round];
    return `<div class="stack" style="gap:24px">
      <div class="eyebrow">라운드 ${room.round + 1} / ${ROUNDS.length} · 속보</div>
      ${newsBlock(r)}
      <div class="boss"><div class="face" aria-hidden="true">임</div><div class="bubble"><b>임삼성 회장</b><br>${r.boss}</div></div>
      ${room.round > 0 ? `<div class="stack" style="gap:10px"><div class="eyebrow">현재 TOP 10</div>${board(10)}</div>` : ''}
    </div>`;
  }

  function vInvest() {
    const r = ROUNDS[room.round];
    const n = Object.keys(ports).length;
    const subs = Object.entries(allocs).filter(([id]) => ports[id]).map(([, a]) => a.alloc || ZERO);
    const avg = {}; ASSETS.forEach(a => { avg[a.id] = 0; });
    subs.forEach(a => { INVEST.forEach(x => { avg[x.id] += a[x.id] || 0; }); avg.cash += cashOf(a); });
    ASSETS.forEach(a => { avg[a.id] = subs.length ? avg[a.id] / subs.length : 0; });
    const p = n ? Math.round(subs.length / n * 100) : 0;
    return `<div class="stack" style="gap:24px">
      <div class="eyebrow">라운드 ${room.round + 1} · 투자 접수 중</div>
      <h2>${r.title}</h2>
      <div class="card stack" style="gap:12px">
        <div class="row" style="justify-content:space-between"><b style="font-size:1.3rem">제출 <span class="num" style="color:var(--accent)">${subs.length}</span> / ${n}명</b><span class="muted">마감 전까지 몇 번이든 바꿀 수 있어요</span></div>
        <div class="meter"><span style="width:${p}%"></span></div>
      </div>
      <div class="card stack" style="gap:12px">
        <b>모두의 평균 포트폴리오</b>
        ${subs.length ? `<div class="crowd">${ASSETS.map(a => `<span style="flex-grow:${avg[a.id].toFixed(2)};background:${a.color}">${avg[a.id] >= 8 ? a.short + ' ' + Math.round(avg[a.id]) + '%' : ''}</span>`).join('')}</div>
          <div class="row" style="gap:16px">${ASSETS.map(a => `<span class="row" style="gap:6px"><span class="dot" style="background:${a.color}"></span>${a.name} <span class="num muted">${Math.round(avg[a.id])}%</span></span>`).join('')}</div>`
          : '<p class="muted">첫 제출을 기다리는 중…</p>'}
      </div>
    </div>`;
  }

  function spark(arr, color, hideLast) {
    const a = hideLast ? arr.slice(0, -1) : arr; if (a.length < 2) return '<svg viewBox="0 0 100 44" aria-hidden="true"></svg>';
    const mn = Math.min(...arr) * .95, mx = Math.max(...arr) * 1.05, n = arr.length - 1;
    const pts = a.map((v, i) => [i / n * 96 + 2, 42 - (v - mn) / (mx - mn) * 38]);
    const [lx, ly] = pts[pts.length - 1];
    return `<svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts.map(q => q.join(',')).join(' ')}"/><circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"/></svg>`;
  }

  function vReveal() {
    const r = ROUNDS[room.round], m = r.move, done = ui.revealed > ASSETS.length;
    const cards = ASSETS.map((a, k) => {
      const on = k < ui.revealed;
      const sp = a.id === 'cash' ? '<svg viewBox="0 0 100 44" aria-hidden="true"></svg>' : spark(indexSeries(a.id, room.round), a.color, !on);
      return `<div class="move ${on ? 'shown' : ''}"><div class="row" style="gap:8px;font-weight:700"><span class="dot" style="background:${a.color}"></span>${a.name}</div>
        <div class="pct ${on ? cls(m[a.id]) : 'flat'}">${on ? arrow(m[a.id]) + ' ' + pct(Math.abs(m[a.id]), false) : '??'}</div>${sp}</div>`;
    }).join('');
    return `<div class="stack" style="gap:22px">
      <div class="row" style="justify-content:space-between"><div class="eyebrow">라운드 ${room.round + 1} · 결과 공개</div>${done ? '' : '<button class="btn ghost" data-a="skip">한 번에 공개</button>'}</div>
      <h2 style="font-size:clamp(1.4rem,3vw,2rem)">${r.title}</h2>
      <div class="moves">${cards}</div>
      ${done ? `<div class="twist">${r.twist}</div><div class="stack" style="gap:10px"><div class="eyebrow">현재 TOP 12 · 이번 라운드 수익률</div>${board(12)}</div>` : ''}
    </div>`;
  }

  function vFinal() {
    const list = rankList(ports), top = list.slice(0, 3);
    if (!list.length) return '<p class="muted">참가자가 없어요.</p>';
    const pod = [1, 0, 2].filter(i => top[i]).map(i => {
      const p = top[i];
      return `<div class="pod p${i + 1}">${i === 0 ? '<div class="crown" aria-hidden="true">👑</div>' : ''}<div class="tn">${esc(p.nick)}</div><div class="num">${won(p.value)}</div><div class="num ${cls(p.value - START_MONEY)}">${pct((p.value / START_MONEY - 1) * 100)}</div><div class="block">${i + 1}</div></div>`;
    }).join('');
    let best = null;
    list.forEach(p => (p.hist || []).forEach((v, i) => { if (i && (!best || v / p.hist[i - 1] > best.x)) best = { x: v / p.hist[i - 1], p, i }; }));
    return `<div class="stack" style="gap:30px;text-align:center">
      <div class="stack" style="gap:8px"><div class="eyebrow">최종 결과</div><h1>올해의 반도체왕은<br><span style="color:var(--accent)">${esc(list[0].nick)}</span>!</h1></div>
      <div class="podium">${pod}</div>
      ${best ? `<p class="muted">한 라운드 최고 수익: <b style="color:var(--fg)">${esc(best.p.nick)}</b>, 라운드 ${best.i}에서 <span class="num up">${pct((best.x - 1) * 100)}</span></p>` : ''}
      <div style="text-align:left" class="stack"><div class="eyebrow">전체 순위</div>${board(list.length)}</div>
    </div>`;
  }

  return function unmount() {
    clearInterval(timer); unRoom(); unPorts(); unAlloc && unAlloc(); el.innerHTML = '';
  };
}
