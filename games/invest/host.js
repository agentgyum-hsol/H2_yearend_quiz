// 반도체왕 임삼성: 운영자(프로젝터) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, gameId, joinUrl? }
// 진행: 로비 → (라운드마다) 프리장 20초(뉴스 + 시초 주문, 화면이 뜨자마자 카운트다운) → 본장 30초(15초째 속보로 5초 정지) → 자동 마감·결과 → … → 최종(TOP 5, 우승 확정)
// 뉴스 단계는 '결과 취소'로 라운드를 되돌렸을 때만 씀(운영자가 프리장을 다시 엶).
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, MARKET_SECONDS, PRE_SECONDS, MARKET_WALL, FLASH_SECONDS, SLIDER_LOCK_SECONDS, TOP_N, tickAt, flashLeft, moveOf, pricePath, valueAt, indexSeries,
  toMs, won, pct, cls, arrow, esc, rankList, lineChart, loadCss } from './data.js';
import { watchWinners, pickWinner, otherGameTitle, confirmWinner, clearWinner } from '../../shared/winners.js';

const GAME = 'invest';
const TITLES = { emoji: '제 이모지야👽', invest: '반도체왕 임삼성', similar: 'H2맨틀' };
const PHASE_LABEL = { market: '프리장 → 본장', reveal: '결과' };
const newRun = () => Date.now().toString(36);
const T = MARKET_SECONDS, PRE = PRE_SECONDS, W = MARKET_WALL;

export function mount(el, ctx) {
  const { db, fs } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', GAME);
  const portCol = fs.collection(db, 'rooms', GAME, 'portfolios');
  const tradeCol = (run, r) => fs.collection(db, 'rooms', GAME, `trades_${run}_${r}`);
  const ts = () => (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

  let room = null, ports = {}, trades = [], tradeKey = '', unTrades = null, winners = {}, roster = [];
  let ui = { confirm: null, revealed: 0, revealKey: '', busy: false, err: '', settling: '' };
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
    if (!snap.exists()) { fs.setDoc(roomRef, { phase: 'lobby', round: 0, runId: newRun() }); return; }
    room = snap.data();
    const key = room.runId + '_' + room.round;
    if (key !== tradeKey) {
      unTrades && unTrades(); trades = []; tradeKey = key;
      unTrades = fs.onSnapshot(tradeCol(room.runId, room.round), s => { trades = s.docs.map(d => d.data()); render(); });
    }
    if (room.phase === 'reveal' && ui.revealKey !== key) startReveal(key);
    render();
  }, e => showErr(e));
  const unPorts = fs.onSnapshot(portCol, s => { ports = {}; s.forEach(d => { ports[d.id] = d.data(); }); render(); }, e => showErr(e));
  const unWin = watchWinners(db, fs, w => { winners = w; render(); });
  // 메인 입장 명단. 이 게임에 아직 안 들어온 사람을 '명단에서 불러오기'로 채울 때 씀
  const unRoster = fs.onSnapshot(fs.collection(db, 'players'), s => { roster = s.docs.map(d => ({ id: d.id, nick: d.data().nick })); render(); });

  // 장 중에는 1초마다 다시 그리고, 시간이 다 되면 자동 정산
  const tickTimer = setInterval(() => {
    if (room?.phase !== 'market') return;
    if (elapsedMs() >= (W + 2.5) * 1000 && ui.settling !== tradeKey) settle();
    render();
  }, 1000);

  function showErr(e) { ui.err = '서버 연결에 문제가 있어요: ' + (e?.message || e); render(); }
  // 본장 시작 기준 경과 시간(운영자 시계). 음수면 프리장
  const elapsedMs = () => (room?.marketStartMs ? Date.now() - (room.marketStartMs + PRE * 1000) : -PRE * 1000);
  const isPre = () => room?.phase === 'market' && elapsedMs() < 0;
  const curTick = () => tickAt(Math.max(0, elapsedMs()));
  const flashNow = () => (room?.phase === 'market' && !isPre() ? flashLeft(elapsedMs()) : 0);

  /* ---------- 주문 기록 → 자산 ---------- */
  // 참가자별 주문을 시간순으로 모아 tick 으로 바꿈. 장 시작 전 주문은 0초(시초가)로 체결.
  function tradesByPid() {
    const open = toMs(room.marketStart), start = open == null ? null : open + PRE * 1000; // 서버 시각 기준 본장 시작
    const by = {};
    trades.map(t => ({ ...t, ms: toMs(t.at) ?? t.atMs }))
      .filter(t => t.ms != null && (!start || t.ms - start <= W * 1000 + 500))
      .sort((a, b) => a.ms - b.ms)
      .forEach(t => {
        const tick = start ? tickAt(Math.max(0, t.ms - start)) : 0;
        (by[t.pid] ||= []).push({ tick, alloc: { ...ZERO, ...t.alloc }, ms: t.ms });
      });
    return by;
  }
  function liveValues(tick) {
    const by = tradesByPid(), out = {};
    Object.entries(ports).forEach(([id, p]) => {
      const v = valueAt(p.value, p.lastAlloc, by[id] || [], room.round, tick);
      out[id] = { nick: p.nick, value: v, roundRet: (v / p.value - 1) * 100, totalTime: p.totalTime || 0 };
    });
    return out;
  }

  /* ---------- 진행 동작 ---------- */
  async function act(fn) {
    if (ui.busy) return;
    ui.busy = true; ui.err = ''; render();
    try { await fn(); } catch (e) { ui.err = '저장하지 못했어요. 다시 눌러 주세요. (' + (e?.message || e) + ')'; }
    ui.busy = false; ui.confirm = null; render();
  }
  const go = patch => act(() => fs.updateDoc(roomRef, patch));

  function settle() {
    if (ui.settling === tradeKey) return;
    ui.settling = tradeKey;
    return act(async () => {
      // 마감 직전 주문이 구독에 아직 안 들어왔을 수 있어 서버에서 한 번 더 읽음
      try { const snap = await fs.getDocs(tradeCol(room.runId, room.round)); trades = snap.docs.map(d => d.data()); } catch (e) { /* 구독 목록으로 진행 */ }
      const r = room.round, by = tradesByPid(), open = toMs(room.marketStart), start = open == null ? null : open + PRE * 1000;
      const before = rankList(ports).map(p => p.id);
      const next = {};
      Object.entries(ports).forEach(([id, p]) => {
        const tr = by[id] || [];
        const v = valueAt(p.value, p.lastAlloc, tr, r, T);
        const last = tr[tr.length - 1];
        // 동점 처리용 결정 시간: 장 시작부터 마지막 주문까지(장 전 주문은 0초). 주문이 없으면 장 전체 시간.
        const roundTime = last && start ? Math.max(0, Math.min(W * 1000, last.ms - start)) : W * 1000;
        next[id] = { nick: p.nick, value: v, hist: [...(p.hist || [p.value]), v], lastAlloc: last ? last.alloc : (p.lastAlloc || ZERO),
          prevAlloc: p.lastAlloc || ZERO, roundRet: (v / p.value - 1) * 100, prevRank: before.indexOf(id) + 1,
          trades: tr.length, settledRound: r, roundTime, totalTime: (p.totalTime || 0) + roundTime };
      });
      // 순위를 각자 문서에 적어 둠: 참가자 폰은 자기 문서 하나만 구독
      const order = rankList(next), total = order.length;
      const b = fs.writeBatch(db);
      order.forEach((p, k) => { const { id, nick, ...rest } = p; b.set(fs.doc(portCol, id), { ...rest, rank: k + 1, total }, { merge: true }); });
      b.update(roomRef, { phase: 'reveal' });
      await b.commit();
    });
  }
  function unsettle() { // 결과 취소: 이번 라운드 정산을 되돌리고 뉴스 화면으로 (장을 다시 열 수 있음)
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.entries(ports).forEach(([id, p]) => {
        if (p.settledRound !== room.round || !p.hist || p.hist.length < 2) return;
        const hist = p.hist.slice(0, -1);
        b.set(fs.doc(portCol, id), { value: hist[hist.length - 1], hist, lastAlloc: p.prevAlloc || ZERO, settledRound: room.round - 1,
          rank: p.prevRank || null, totalTime: Math.max(0, (p.totalTime || 0) - (p.roundTime || 0)), roundTime: 0 }, { merge: true });
      });
      b.update(roomRef, { phase: 'news', marketStart: null, marketStartMs: null });
      await b.commit();
      ui.settling = '';
    });
  }
  function resetGame() {
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.keys(ports).forEach(id => b.set(fs.doc(portCol, id),
        { value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, prevAlloc: ZERO, roundRet: 0, prevRank: null, rank: null, total: null,
          settledRound: -1, totalTime: 0, roundTime: 0, trades: 0 }, { merge: true }));
      b.set(roomRef, { phase: 'lobby', round: 0, runId: newRun() });
      b.delete(fs.doc(db, 'winners', GAME));
      await b.commit();
      ui.settling = '';
    });
  }
  function clearPlayers() {
    return act(async () => {
      const b = fs.writeBatch(db);
      Object.keys(ports).forEach(id => b.delete(fs.doc(portCol, id)));
      b.set(roomRef, { phase: 'lobby', round: 0, runId: newRun() });
      await b.commit();
    });
  }

  // 메인 명단에 있는데 이 게임에 없는 사람을 시작 자금으로 넣음 (실수로 비웠거나 폰이 꺼져 있던 사람 복구)
  function importRoster() {
    return act(async () => {
      const b = fs.writeBatch(db);
      roster.filter(p => !ports[p.id]).forEach(p => b.set(fs.doc(portCol, p.id),
        { nick: p.nick, value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, roundRet: 0, prevRank: null, rank: null, total: null,
          settledRound: -1, totalTime: 0 }));
      await b.commit();
    });
  }

  function startReveal(key) {
    ui.revealKey = key; ui.revealed = 0; clearInterval(timer);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ui.revealed = 99; return; }
    timer = setInterval(() => { ui.revealed++; render(); if (ui.revealed > ASSETS.length) clearInterval(timer); }, 900);
  }

  const finalRows = () => rankList(ports).map((p, k) => ({ ...p, rank: k + 1 }));

  /* ---------- 클릭 ---------- */
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const a = t.dataset.a;
    // 라운드가 시작되면 바로 프리장 카운트다운 (뉴스는 프리장 화면에 함께 나옴)
    const openRound = r => go({ phase: 'market', round: r, marketStart: ts(), marketStartMs: Date.now() });
    if (a === 'start') openRound(0);
    else if (a === 'open') go({ phase: 'market', marketStart: ts(), marketStartMs: Date.now() });
    else if (a === 'settle') settle();
    else if (a === 'next') room.round >= ROUNDS.length - 1 ? go({ phase: 'final' }) : openRound(room.round + 1);
    else if (a === 'unsettle') unsettle();
    else if (a === 'back-reveal') go({ phase: 'reveal' });
    else if (a === 'skip') { clearInterval(timer); ui.revealed = 99; render(); }
    else if (a === 'ask') { ui.confirm = t.dataset.k; render(); }
    else if (a === 'cancel') { ui.confirm = null; render(); }
    else if (a === 'reset') resetGame();
    else if (a === 'clear') clearPlayers();
    else if (a === 'import') importRoster();
    else if (a === 'confirm-win') act(async () => { const p = pickWinner(finalRows(), winners, GAME); if (p.winner) await confirmWinner(db, fs, GAME, p.winner); });
    else if (a === 'unconfirm-win') act(() => clearWinner(db, fs, GAME));
  });

  /* ---------- 렌더 ---------- */
  function render() {
    if (!room) { $('stage').innerHTML = '<p class="muted">게임 정보를 불러오는 중…</p>'; return; }
    renderTicker(); renderBar();
    const v = { lobby: vLobby, news: vNews, market: vMarket, reveal: vReveal, final: vFinal }[room.phase] || vLobby;
    $('stage').innerHTML = (ui.err ? `<p class="warn" role="alert" style="margin-bottom:16px">${esc(ui.err)}</p>` : '') + v();
  }

  function renderTicker() {
    let h = '<div class="brand">반도체왕 임삼성</div>';
    const hideLast = room.phase === 'reveal' && ui.revealed <= ASSETS.length;
    const upto = room.phase === 'lobby' ? -1 : (room.phase === 'reveal' || room.phase === 'final') ? room.round : room.round - 1;
    INVEST.forEach((a, k) => {
      const arr = indexSeries(a.id, hideLast && k >= ui.revealed ? upto - 1 : upto);
      let v = arr[arr.length - 1], prev = arr.length > 1 ? arr[arr.length - 2] : v;
      if (room.phase === 'market') { prev = v; v = v * pricePath(room.round, a.id)[curTick()]; }
      const ch = (v / prev - 1) * 100, show = arr.length > 1 || room.phase === 'market';
      h += `<div class="tick"><span class="dot" style="background:${a.color}"></span><b>${a.short}</b><span class="num">${v.toFixed(1)}</span><span class="num ${cls(ch)}">${show ? arrow(ch) + ' ' + pct(Math.abs(ch), false) : ''}</span></div>`;
    });
    $('ticker').innerHTML = h;
  }

  function confirmBox(k, q, yes) {
    return ui.confirm === k ? `<span class="confirm">${q} <button class="btn" data-a="${k}">${yes}</button><button class="btn ghost" data-a="cancel">취소</button></span>` : '';
  }

  function renderBar() {
    const n = Object.keys(ports).length, busy = ui.busy ? 'disabled' : '';
    let steps = '', btns = '';
    if (room.phase === 'lobby') {
      steps = `<span class="muted">참가자 ${n}명 · ${ROUNDS.length}라운드 · 라운드마다 ${T}초 장</span>`;
      const missing = roster.filter(p => !ports[p.id]).length;
      steps += missing ? ` <span class="muted">· 메인 명단 중 ${missing}명 아직 안 들어옴</span>` : '';
      btns = confirmBox('clear', '이 게임 참가자를 비울까요? 화면을 켜 둔 사람은 바로 다시 들어와요.', '예, 비우기') ||
        `<button class="btn ghost" data-a="ask" data-k="clear" ${n ? '' : 'disabled'}>참가자 비우기</button>`;
      if (missing) btns += `<button class="btn ghost" data-a="import" ${busy}>명단에서 불러오기 (${missing}명)</button>`;
      btns += `<button class="btn primary" data-a="start" ${n < 1 || ui.busy ? 'disabled' : ''}>게임 시작</button>`;
    } else if (room.phase === 'final') {
      steps = '<span class="step on">최종 결과</span>';
      btns = `<button class="btn ghost" data-a="back-reveal" ${busy}>마지막 라운드 결과로</button>` +
        (winners[GAME] ? `<button class="btn ghost" data-a="unconfirm-win" ${busy}>우승 확정 취소</button>` : '');
    } else {
      steps = `<span class="step">R${room.round + 1}/${ROUNDS.length}</span>` +
        ['market', 'reveal'].map(p => `<span class="step ${p === room.phase || (p === 'market' && room.phase === 'news') ? 'on' : ''}">${PHASE_LABEL[p]}</span>`).join('');
      if (room.phase === 'news') btns = `<button class="btn primary" data-a="open" ${busy}>프리장 다시 열기 (${PRE}초 뒤 본장 자동 시작)</button>`;
      if (room.phase === 'market') {
        const over = elapsedMs() >= W * 1000;
        btns = `<button class="btn primary" data-a="settle" ${over && !ui.busy ? '' : 'disabled'}>${over ? '마감 · 결과 공개' : isPre() ? '프리장 진행 중…' : flashNow() ? '속보! 장 일시 정지…' : '본장 진행 중…'}</button>`;
      }
      if (room.phase === 'reveal') {
        const done = ui.revealed > ASSETS.length;
        btns = (confirmBox('unsettle', '이번 라운드를 취소하고 장을 다시 열까요?', '예, 취소') ||
          `<button class="btn ghost" data-a="ask" data-k="unsettle" ${busy}>결과 취소</button>`) +
          `<button class="btn primary" data-a="next" ${done && !ui.busy ? '' : 'disabled'}>${room.round >= ROUNDS.length - 1 ? '최종 순위 발표' : '다음 라운드'}</button>`;
      }
    }
    const reset = confirmBox('reset', '모든 참가자의 자산과 우승 확정을 처음으로 되돌릴까요?', '예, 처음부터') ||
      (room.phase !== 'lobby' ? `<button class="btn ghost" data-a="ask" data-k="reset" ${busy}>처음부터</button>` : '');
    $('bar').innerHTML = `<div class="steps">${steps}</div>${reset}${btns}`;
  }

  function vLobby() {
    const list = rankList(ports);
    return `<div class="lobby">
      <div class="stack">
        <div class="eyebrow">송년회 투자 배틀 · 개인전</div>
        <h1>반도체왕 <span style="color:var(--accent)">임삼성</span></h1>
        <ul class="rules" style="font-size:1.15rem">
          <li>모두 <b>${won(START_MONEY)}</b>으로 시작, ${ROUNDS.length}라운드 뒤 자산 1등이 올해의 반도체왕</li>
          <li>라운드가 열리면 바로 <b>${PRE}초 프리장</b>: 뉴스 보고 시초 주문</li>
          <li><b>${T}초 본장</b>: 차트를 보며 슬라이더로 비율 변경</li>
          <li>본장 중간 <b>추가 속보</b>: 장이 ${FLASH_SECONDS}초 멈추고 그 사이 결정</li>
          <li>거래 수수료: 본장에서 주문하면 슬라이더가 <b>${SLIDER_LOCK_SECONDS}초 잠김</b></li>
          <li>마지막 라운드는 등락 2배 <b>더블 찬스</b></li>
        </ul>
        <div class="card stack" style="gap:10px">
          ${ASSETS.map(a => `<div class="asset-li"><div class="asset-ic" style="background:${a.color}">${a.short}</div><div><b>${a.name}</b> <span class="muted" style="font-size:.9rem">${a.desc}</span></div></div>`).join('')}
        </div>
      </div>
      <div class="card stack">
        <div class="eyebrow">이 게임에 들어온 사람</div>
        <div class="big-count num">${list.length}<span style="font-size:.4em;color:var(--muted)"> 명</span></div>
        <div class="names">${list.map(p => `<span class="name">${esc(p.nick)}</span>`).join('') || '<span class="muted">참가자 폰이 이 게임 화면으로 바뀌면 여기에 이름이 뜹니다.</span>'}</div>
      </div>
    </div>`;
  }

  function doubleBanner() {
    return `<div class="twist" style="border-color:var(--accent);background:rgba(255,196,61,.12);font-size:1.3rem"><b style="color:var(--accent)">더블 찬스!</b> 이번 라운드는 DRAM, NAND, 금, 비트코인이 평소의 2배로 움직입니다.</div>`;
  }

  function board(rows, limit, mode) {
    return `<div class="board">${rows.slice(0, limit).map((p, k) => {
      const d = mode === 'reveal' && p.prevRank ? p.prevRank - (k + 1) : 0;
      const sub = mode === 'total' ? pct((p.value / START_MONEY - 1) * 100) : pct(p.roundRet || 0);
      const subCls = mode === 'total' ? cls(p.value - START_MONEY) : cls(p.roundRet || 0);
      return `<div class="brow ${k < 3 ? 'top' : ''}"><span class="rk">${k + 1}</span>
        <span class="nm">${esc(p.nick)} ${d ? `<span class="num ${cls(d)}" style="font-size:.8rem">${arrow(d)}${Math.abs(d)}</span>` : ''}</span>
        <span class="vv num">${won(p.value)}<br><span class="${subCls}">${sub}</span></span></div>`;
    }).join('')}</div>`;
  }

  function vNews() { // 결과 취소 뒤에만 나옴: 운영자가 프리장을 다시 열 때까지 대기
    const r = ROUNDS[room.round];
    return `<div class="stack" style="gap:24px">
      <div class="eyebrow">라운드 ${room.round + 1} / ${ROUNDS.length} · 라운드 다시 열기 대기</div>
      ${r.double ? doubleBanner() : ''}
      <article class="news"><div class="when">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></article>
      <div class="boss"><div class="face" aria-hidden="true">임</div><div class="bubble"><b>임삼성 회장</b><br>${r.boss}</div></div>
      <div class="card row" style="justify-content:space-between"><b>다음: ${PRE}초 프리장 → ${T}초 본장</b><span class="muted">아래 버튼을 누르면 바로 카운트다운이 시작돼요.</span></div>
      ${room.round > 0 ? `<div class="stack" style="gap:10px"><div class="eyebrow">현재 TOP 10</div>${board(rankList(ports), 10, 'total')}</div>` : ''}
    </div>`;
  }

  function vPre() {
    const r = ROUNDS[room.round], left = Math.ceil(-elapsedMs() / 1000);
    const ordered = new Set(trades.map(t => t.pid)).size, n = Object.keys(ports).length, p = n ? Math.round(ordered / n * 100) : 0;
    return `<div class="stack" style="gap:24px">
      <div class="eyebrow">라운드 ${room.round + 1} / ${ROUNDS.length} · 프리장${r.double ? ' · 더블 찬스 ×2' : ''}</div>
      ${r.double ? doubleBanner() : ''}
      <div class="row" style="gap:24px;align-items:stretch">
        <div class="card stack" style="gap:6px;align-items:center;justify-content:center;min-width:220px">
          <div class="eyebrow" style="color:var(--accent)">본장까지</div>
          <div class="clock num" style="font-size:clamp(4rem,10vw,7rem);color:${left <= 5 ? 'var(--up)' : 'var(--accent)'}">${left}<span>초</span></div>
        </div>
        <div class="card stack" style="gap:14px;flex:1;min-width:260px;justify-content:center">
          <div class="muted num">${r.when} · 속보</div>
          <h2 style="font-size:clamp(1.4rem,3vw,2.2rem)">${r.title}</h2>
          <ul class="news-ul">${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
          <div class="boss"><div class="face" aria-hidden="true">임</div><div class="bubble"><b>임삼성 회장</b><br>${r.boss}</div></div>
          <div class="row" style="justify-content:space-between"><b style="font-size:1.3rem">시초 주문 <span class="num" style="color:var(--accent)">${ordered}</span> / ${n}명</b><span class="muted">본장 시작 가격으로 체결 · 안 내면 지난 비율 그대로</span></div>
          <div class="meter"><span style="width:${p}%"></span></div>
        </div>
      </div>
      ${room.round > 0 ? `<div class="stack" style="gap:10px"><div class="eyebrow">현재 TOP 10</div>${board(rankList(ports), 10, 'total')}</div>` : ''}
    </div>`;
  }

  function vMarket() {
    if (isPre()) return vPre();
    const r = ROUNDS[room.round], tick = curTick(), left = T - tick, fl = flashNow();
    const series = INVEST.map(a => ({ color: a.color, data: pricePath(room.round, a.id), w: 3.5 }));
    const live = rankList(liveValues(tick));
    return `<div class="stack" style="gap:20px">
      <div class="row" style="justify-content:space-between">
        <div class="eyebrow">라운드 ${room.round + 1} · 실시간 장${r.double ? ' · 더블 찬스 ×2' : ''}</div>
        <span class="muted">주문 ${trades.length}건</span>
      </div>
      ${fl ? `<div class="flash" role="alert"><div class="row" style="justify-content:space-between;align-items:center">
          <span class="flash-tag">추가 속보 · 장 일시 정지</span><span class="clock num">${fl}<span>초</span></span></div>
        <h2>${r.flash.title}</h2><ul>${r.flash.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        <div class="muted">지금 주문하면 멈춘 가격으로 체결돼요. ${fl}초 뒤 장 재개!</div></div>` : ''}
      <div class="market">
        <div class="card stack" style="gap:12px;min-width:0">
          <div class="row" style="justify-content:space-between;align-items:flex-end">
            <h2 style="font-size:clamp(1.3rem,2.6vw,1.9rem)">${r.title}</h2>
            <div class="clock num" style="color:${left <= 5 ? 'var(--up)' : 'var(--accent)'}">${left}<span>초</span></div>
          </div>
          <div style="color:var(--muted)">${lineChart(series, T + 1, tick, { h: 300 })}</div>
          <div class="row" style="gap:18px">${INVEST.map(a => { const c = (pricePath(room.round, a.id)[tick] - 1) * 100; return `<span class="row" style="gap:6px;font-size:1.15rem"><span class="dot" style="background:${a.color}"></span><b>${a.short}</b><span class="num ${cls(c)}">${arrow(c)} ${pct(Math.abs(c), false)}</span></span>`; }).join('')}</div>
        </div>
        <div class="stack" style="gap:10px;min-width:0"><div class="eyebrow">실시간 TOP 10 · 이번 라운드</div>${board(live, 10, 'round')}</div>
      </div>
    </div>`;
  }

  function vReveal() {
    const r = ROUNDS[room.round], m = moveOf(room.round), done = ui.revealed > ASSETS.length;
    const cards = ASSETS.map((a, k) => {
      const on = k < ui.revealed;
      const sp = a.id === 'cash' ? '' : `<div style="color:var(--muted)">${lineChart([{ color: a.color, data: pricePath(room.round, a.id) }], T + 1, on ? T : 0, { h: 60 })}</div>`;
      return `<div class="move ${on ? 'shown' : ''}"><div class="row" style="gap:8px;font-weight:700"><span class="dot" style="background:${a.color}"></span>${a.name}</div>
        <div class="pct ${on ? cls(m[a.id]) : 'flat'}">${on ? arrow(m[a.id]) + ' ' + pct(Math.abs(m[a.id]), false) : '??'}</div>${sp}</div>`;
    }).join('');
    return `<div class="stack" style="gap:22px">
      <div class="row" style="justify-content:space-between"><div class="eyebrow">라운드 ${room.round + 1} · 장 마감</div>${done ? '' : '<button class="btn ghost" data-a="skip">한 번에 공개</button>'}</div>
      <h2 style="font-size:clamp(1.4rem,3vw,2rem)">${r.title}${r.double ? ' <span style="color:var(--accent)">· 더블 찬스 ×2</span>' : ''}</h2>
      <div class="moves">${cards}</div>
      ${done ? `<div class="twist">${r.twist}</div><div class="stack" style="gap:10px"><div class="eyebrow">현재 TOP 10 · 이번 라운드 수익률</div>${board(rankList(ports), 10, 'reveal')}</div>` : ''}
    </div>`;
  }

  function vFinal() {
    const rows = finalRows();
    if (!rows.length) return '<p class="muted">참가자가 없어요.</p>';
    const pick = pickWinner(rows, winners, GAME), confirmed = winners[GAME];
    const other = id => otherGameTitle(winners, id, GAME, TITLES);
    let head;
    if (confirmed) {
      const w = rows.find(x => x.id === confirmed.pid);
      head = `<div class="crown" aria-hidden="true" style="font-size:4.5rem">👑</div>
        <div class="eyebrow">올해의 반도체왕</div>
        <h1 style="color:var(--accent);font-size:clamp(3.2rem,9vw,6.5rem);overflow-wrap:anywhere">${esc(confirmed.nick)}</h1>
        ${w ? `<div class="num" style="font-size:clamp(1.5rem,3.6vw,2.4rem);font-weight:700">${won(w.value)} <span class="${cls(w.value - START_MONEY)}">${pct((w.value / START_MONEY - 1) * 100)}</span></div>` : ''}`;
    } else {
      head = `<div class="eyebrow">최종 결과</div><h1>올해의 반도체왕은…</h1>
        ${pick.winner ? `<p style="font-size:1.2rem">${pick.skipped.length ? `${pick.skipped.map(x => `<b>${esc(x.nick)}</b>`).join(', ')} 님은 이미 다른 게임에서 우승해서, ` : ''}우승 후보는 <b style="color:var(--accent)">${esc(pick.winner.nick)}</b> 님 (${pick.winner.rank}위)</p>
          <div><button class="btn primary" data-a="confirm-win" ${ui.busy ? 'disabled' : ''}>${esc(pick.winner.nick)} 님 우승 확정</button></div>` : '<p class="muted">우승할 수 있는 사람이 없어요.</p>'}`;
    }
    const winId = confirmed ? confirmed.pid : pick.winner?.id;
    return `<div class="stack" style="gap:26px;text-align:center;align-items:center">
      ${head}
      <div class="stack" style="gap:8px;width:100%;max-width:760px;text-align:left">
        <div class="eyebrow">TOP ${TOP_N}</div>
        ${rows.slice(0, TOP_N).map(p => {
          const o = other(p.id), isW = winId === p.id;
          return `<div class="brow ${isW ? 'top' : ''}" style="grid-template-columns:48px minmax(0,1fr) auto;padding:12px 16px">
            <span class="rk" style="font-size:1.6rem">${p.rank}</span>
            <span class="nm" style="font-size:1.25rem">${esc(p.nick)}${isW && confirmed ? ' 👑' : ''}${o ? ` <span class="muted" style="font-size:.85rem;font-weight:400">${esc(o)} 우승자</span>` : ''}</span>
            <span class="vv num" style="font-size:1.1rem">${won(p.value)}<br><span class="${cls(p.value - START_MONEY)}">${pct((p.value / START_MONEY - 1) * 100)}</span></span></div>`;
        }).join('')}
      </div>
    </div>`;
  }

  return function unmount() {
    clearInterval(timer); clearInterval(tickTimer); unRoom(); unPorts(); unWin(); unRoster(); unTrades && unTrades(); el.innerHTML = '';
  };
}
