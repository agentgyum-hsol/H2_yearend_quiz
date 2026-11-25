// 반도체왕 임삼성: 운영자(프로젝터) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, gameId, joinUrl? }
// 진행: 로비 → (라운드마다) 뉴스·토의(찌라시, 군중 포지션) → [운영자 선택: 프리장 20초 시초 주문 | 바로 본장]
//       → (모두 시초 주문하면 5초 카운트다운) → 본장 30초(15초째 속보로 30초 정지·토의) → 자동 마감·결과(임삼성 조언 적중/헛다리, 찌라시 진위) → … → 최종(TOP 5, 우승 확정)
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, MARKET_SECONDS, PRE_SECONDS, MARKET_WALL, preOf, FLASH_SECONDS, SLIDER_LOCK_SECONDS, TOP_N, BOSS_TAG, ALL_IN_SECONDS, tickAt, flashLeft, cashOf, moveOf, pricePath, valueAt, indexSeries,
  toMs, won, pct, cls, arrow, esc, rankList, lineChart, loadCss } from './data.js';
import { watchWinners, pickWinner, otherGameTitle, confirmWinner, clearWinner } from '../../shared/winners.js';

const GAME = 'invest';
const TITLES = { emoji: '이게 제 이모지야👽', invest: '반도체왕 임삼성', similar: 'H2맨틀' };
const PHASE_LABEL = { news: '뉴스·토의', market: '장', reveal: '결과' };
const newRun = () => Date.now().toString(36);
const T = MARKET_SECONDS, PRE = PRE_SECONDS, W = MARKET_WALL;

export function mount(el, ctx) {
  const { db, fs } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', GAME);
  const portCol = fs.collection(db, 'rooms', GAME, 'portfolios');
  const tradeCol = (run, r) => fs.collection(db, 'rooms', GAME, `trades_${run}_${r}`);
  const voteCol = (run, r) => fs.collection(db, 'rooms', GAME, `votes_${run}_${r}`); // 회장님 믿음 투표
  const ts = () => (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

  let room = null, ports = {}, trades = [], tradeKey = '', unTrades = null, votes = [], unVotes = null, winners = {}, roster = [];
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
      unVotes && unVotes(); votes = [];
      unVotes = fs.onSnapshot(voteCol(room.runId, room.round), s => { votes = s.docs.map(d => d.data()); render(); });
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
    allIn();
    render();
  }, 1000);

  // 프리장에서 모두 시초 주문을 내면 ALL_IN_SECONDS 초 뒤 본장 시작 (프리장 길이 preSec 을 줄임 → 폰도 같이 따라옴)
  function allIn() {
    if (!isPre() || ui.allIn === tradeKey || !room.marketStartMs) return;
    const n = Object.keys(ports).length, ordered = new Set(trades.map(t => t.pid)).size;
    if (!n || ordered < n || -elapsedMs() <= (ALL_IN_SECONDS + 0.5) * 1000) return;
    ui.allIn = tradeKey;
    const preSec = Math.ceil((Date.now() - room.marketStartMs) / 1000) + ALL_IN_SECONDS;
    fs.updateDoc(roomRef, { preSec }).catch(() => { ui.allIn = ''; });
  }
  function showErr(e) { ui.err = '서버 연결에 문제가 있어요: ' + (e?.message || e); render(); }
  // 본장 시작 기준 경과 시간(운영자 시계). 음수면 프리장
  const pre = () => preOf(room);
  const elapsedMs = () => (room?.marketStartMs ? Date.now() - (room.marketStartMs + pre() * 1000) : -pre() * 1000);
  const isPre = () => room?.phase === 'market' && elapsedMs() < 0;
  const curTick = () => tickAt(Math.max(0, elapsedMs()));
  const flashNow = () => (room?.phase === 'market' && !isPre() ? flashLeft(elapsedMs()) : 0);

  /* ---------- 주문 기록 → 자산 ---------- */
  // 참가자별 주문을 시간순으로 모아 tick 으로 바꿈. 장 시작 전 주문은 0초(시초가)로 체결.
  function tradesByPid() {
    const open = toMs(room.marketStart), start = open == null ? null : open + pre() * 1000; // 서버 시각 기준 본장 시작
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
      const r = room.round, by = tradesByPid(), open = toMs(room.marketStart), start = open == null ? null : open + pre() * 1000;
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
    // 라운드를 열면 먼저 뉴스·토의 화면. 운영자가 프리장(시초 주문)을 열지, 바로 본장을 열지 고름
    const openRound = r => go({ phase: 'news', round: r, newsStartMs: Date.now(), marketStart: null, marketStartMs: null });
    if (a === 'start') openRound(0);
    else if (a === 'open-pre') go({ phase: 'market', preSec: PRE, marketStart: ts(), marketStartMs: Date.now() });
    else if (a === 'open-now') go({ phase: 'market', preSec: 0, marketStart: ts(), marketStartMs: Date.now() });
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
        ['news', 'market', 'reveal'].map(p => `<span class="step ${p === room.phase ? 'on' : ''}">${PHASE_LABEL[p]}</span>`).join('');
      if (room.phase === 'news') btns = `<button class="btn ghost" data-a="open-now" ${busy}>바로 본장 시작</button>` +
        `<button class="btn primary" data-a="open-pre" ${busy}>프리장 열기 (${PRE}초 시초 주문 → 본장)</button>`;
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
          <li>라운드마다 <b>뉴스·토의</b>: 폰마다 <b>다른 비밀 찌라시</b>가 와요. 진짜일 수도, 가짜일 수도! 옆 사람과 맞춰 보세요</li>
          <li>운영자가 고르면 <b>${PRE}초 프리장</b>: 본장 시작 가격으로 시초 주문</li>
          <li><b>${T}초 본장</b>: 차트를 보며 슬라이더로 비율 변경</li>
          <li>본장 중간 <b>추가 속보</b>: 장이 ${FLASH_SECONDS}초 멈추고 토의 타임. 이때만 <b>모두의 투자 비율</b> 공개</li>
          <li>${BOSS_TAG}, <b>임삼성 회장</b>의 한마디도 뉴스와 함께 나와요</li>
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

  // 오른쪽 순위판: 한 줄짜리 행으로 TOP 10. mode: total(누적) | round(이번 라운드 실시간) | reveal(정산 직후, 순위 변동 표시)
  function board(rows, limit, mode) {
    return `<ol class="side-board">${rows.slice(0, limit).map((p, k) => {
      const d = mode === 'reveal' && p.prevRank ? p.prevRank - (k + 1) : 0;
      const sub = mode === 'total' ? (p.value / START_MONEY - 1) * 100 : (p.roundRet || 0);
      return `<li class="${k < 3 ? 'top' : ''}"><span class="rk">${k + 1}</span>
        <span class="nm">${esc(p.nick)}${d ? ` <span class="num ${cls(d)}" style="font-size:.75rem">${arrow(d)}${Math.abs(d)}</span>` : ''}</span>
        <span class="vv num">${won(p.value)}<br><span class="${cls(sub)}">${pct(sub)}</span></span></li>`;
    }).join('')}</ol>`;
  }
  function side(title, rows, mode) {
    const n = Object.keys(ports).length;
    return `<aside class="side card"><div class="row" style="justify-content:space-between"><div class="eyebrow" style="color:var(--accent)">${title}</div><span class="muted" style="font-size:.85rem">${n}명</span></div>
      ${rows.length ? board(rows, 10, mode) : '<p class="muted">아직 순위가 없어요.</p>'}</aside>`;
  }
  // 라운드 화면 공통 틀: 왼쪽 내용 + 오른쪽 순위 (스크롤 없이 한 화면)
  const layout = (main, aside) => `<div class="rd"><div class="rd-main">${main}</div>${aside}</div>`;
  const totalSide = () => side(room.round > 0 ? '누적 순위 TOP 10' : '순위', room.round > 0 ? rankList(ports) : [], 'total');

  const bossHtml = (r, extra = '') => `<div class="boss"><div class="face" aria-hidden="true">임</div><div class="bubble">
    <div class="boss-h"><b>임삼성 회장</b><span class="boss-tag">${BOSS_TAG}</span></div>“${esc(r.boss)}”${extra}</div></div>`;

  function vNews() { // 라운드 시작: 뉴스를 띄워 두고 토의. 운영자가 프리장 또는 바로 본장을 엶
    const r = ROUNDS[room.round];
    return layout(`
      <div class="eyebrow">라운드 ${room.round + 1} / ${ROUNDS.length} · 뉴스 · 토의 시간</div>
      ${r.double ? doubleBanner() : ''}
      <article class="news"><div class="when">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></article>
      ${bossHtml(r)}
      ${votePanel(r, false)}
      <div class="card talk"><b>💬 작전 회의! 폰마다 <span style="color:var(--accent)">다른</span> 비밀 찌라시를 옆 사람과 맞춰 보세요.</b><span class="muted">폰에서 비율을 미리 정해 둘 수 있어요.</span></div>`, totalSide());
  }

  function vPre() {
    const r = ROUNDS[room.round], left = Math.ceil(-elapsedMs() / 1000);
    const ordered = new Set(trades.map(t => t.pid)).size, n = Object.keys(ports).length, p = n ? Math.round(ordered / n * 100) : 0;
    const all = n > 0 && ordered >= n;
    return layout(`
      <div class="eyebrow">라운드 ${room.round + 1} / ${ROUNDS.length} · 프리장${r.double ? ' · 더블 찬스 ×2' : ''}</div>
      ${r.double ? doubleBanner() : ''}
      <div class="pre-grid">
        <div class="card stack" style="gap:6px;align-items:center;justify-content:center">
          <div class="eyebrow" style="color:var(--accent)">본장까지</div>
          <div class="clock num" style="font-size:clamp(4rem,9vw,7rem);color:${left <= 5 ? 'var(--up)' : 'var(--accent)'}">${left}<span>초</span></div>
        </div>
        <div class="card stack" style="gap:12px;min-width:0;justify-content:center">
          <div class="muted num">${r.when}</div>
          <h2 style="font-size:clamp(1.4rem,2.6vw,2.1rem)">${r.title}</h2>
          <ul class="news-ul">${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        </div>
      </div>
      ${bossHtml(r)}
      <div class="card stack" style="gap:10px">
        <div class="row" style="justify-content:space-between"><b style="font-size:1.3rem">시초 주문 <span class="num" style="color:var(--accent)">${ordered}</span> / ${n}명</b><span class="muted">${all ? '모두 주문 완료! 곧 본장 시작' : `모두 내면 ${ALL_IN_SECONDS}초 뒤 바로 본장 · 안 내면 지난 비율 그대로`}</span></div>
        <div class="meter"><span style="width:${p}%"></span></div>
      </div>
      ${left <= ALL_IN_SECONDS ? `<div class="countdown" aria-live="assertive"><div class="eyebrow">${all ? '시초 주문 완료! ' : ''}본장 시작까지</div><div class="cd-num num">${left}</div></div>` : ''}`,
      totalSide());
  }

  function vMarket() {
    if (isPre()) return vPre();
    const r = ROUNDS[room.round], tick = curTick(), left = T - tick, fl = flashNow();
    const series = INVEST.map(a => ({ color: a.color, data: pricePath(room.round, a.id), w: 3.5 }));
    const live = rankList(liveValues(tick));
    return layout(`
      <div class="row" style="justify-content:space-between">
        <div class="eyebrow">라운드 ${room.round + 1} · 실시간 장${r.double ? ' · 더블 찬스 ×2' : ''}</div>
        <span class="muted">주문 ${trades.length}건</span>
      </div>
      ${fl ? `<div class="flash" role="alert"><div class="row" style="justify-content:space-between;align-items:center">
          <span class="flash-tag">추가 속보 · 장 정지 · 토의 타임</span><span class="clock num">${fl}<span>초</span></span></div>
        <h2>${r.flash.title}</h2><ul>${r.flash.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        <div class="muted" style="font-size:1.1rem">💬 주변과 상의하세요! 지금 주문하면 멈춘 가격으로 체결, ${fl}초 뒤 장 재개</div>
        ${crowdPanel()}</div>` : ''}
      <div class="card chart-card">
        <div class="row" style="justify-content:space-between;align-items:flex-end;flex-wrap:nowrap">
          <h2 style="font-size:clamp(1.2rem,2.2vw,1.7rem)">${r.title}</h2>
          <div class="clock num" style="color:${left <= 5 ? 'var(--up)' : 'var(--accent)'}">${left}<span>초</span></div>
        </div>
        <div class="chart-fill">${lineChart(series, T + 1, tick, { h: 300 })}</div>
        <div class="row" style="gap:18px">${INVEST.map(a => { const c = (pricePath(room.round, a.id)[tick] - 1) * 100; return `<span class="row" style="gap:6px;font-size:1.1rem"><span class="dot" style="background:${a.color}"></span><b>${a.short}</b><span class="num ${cls(c)}">${arrow(c)} ${pct(Math.abs(c), false)}</span></span>`; }).join('')}</div>
      </div>`, side('실시간 순위 · 이번 라운드', live, 'round'));
  }

  function vReveal() {
    const r = ROUNDS[room.round], m = moveOf(room.round), done = ui.revealed > ASSETS.length;
    const cards = ASSETS.map((a, k) => {
      const on = k < ui.revealed;
      const sp = a.id === 'cash' ? '' : `<div style="color:var(--muted)">${lineChart([{ color: a.color, data: pricePath(room.round, a.id) }], T + 1, on ? T : 0, { h: 40 })}</div>`;
      return `<div class="move ${on ? 'shown' : ''}"><div class="row" style="gap:8px;font-weight:700"><span class="dot" style="background:${a.color}"></span>${a.name}</div>
        <div class="pct ${on ? cls(m[a.id]) : 'flat'}">${on ? arrow(m[a.id]) + ' ' + pct(Math.abs(m[a.id]), false) : '??'}</div>${sp}</div>`;
    }).join('');
    return layout(`
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div class="stack" style="gap:4px;min-width:0"><div class="eyebrow">라운드 ${room.round + 1} · 장 마감</div><h2 style="font-size:clamp(1.3rem,2.4vw,1.8rem)">${r.title}${r.double ? ' <span style="color:var(--accent)">· 더블 찬스 ×2</span>' : ''}</h2></div>${done ? '' : '<button class="btn ghost" data-a="skip">한 번에 공개</button>'}</div>
      <div class="moves">${cards}</div>
      ${done ? `<div class="rv-grid">
        <div class="stack" style="gap:12px;min-width:0">${bossVerdict(r)}${votePanel(r, true)}<div class="twist">${r.twist}</div></div>
        <div class="stack" style="gap:10px;min-width:0">${interview()}${tipsVerdict(r)}</div>
      </div>` : ''}`, done ? side('누적 순위 TOP 10', rankList(ports), 'reveal') : totalSide());
  }

  // 군중 포지션: 참가자마다 지금 들고 있는 비율(마지막 주문, 없으면 지난 라운드 비율)의 평균
  function crowdAlloc() {
    const by = tradesByPid(), ids = Object.keys(ports), sum = { cash: 0 };
    INVEST.forEach(x => { sum[x.id] = 0; });
    ids.forEach(id => {
      const tr = by[id], a = { ...ZERO, ...(tr?.length ? tr[tr.length - 1].alloc : ports[id].lastAlloc) };
      INVEST.forEach(x => { sum[x.id] += a[x.id] || 0; }); sum.cash += cashOf(a);
    });
    const n = ids.length || 1, out = {};
    ASSETS.forEach(x => { out[x.id] = sum[x.id] / n; });
    return out;
  }
  function crowdPanel() {
    const c = crowdAlloc();
    return `<div class="herd stack" style="gap:8px"><div class="eyebrow" style="color:var(--fg)">👀 지금 모두의 투자 비율 (평균)</div>
      <div class="crowd-bar">${ASSETS.map(x => c[x.id] >= 0.5 ? `<span style="flex:${c[x.id]};background:${x.color}">${c[x.id] >= 7 ? `${x.short} ${Math.round(c[x.id])}%` : ''}</span>` : '').join('')}</div></div>`;
  }

  // 회장님 믿음 투표. after=true(결과 화면)면 누가 맞혔는지 함께 보여 줌
  function votePanel(r, after) {
    const yes = votes.filter(v => v.trust).length, no = votes.length - yes, n = votes.length, py = n ? Math.round(yes / n * 100) : 50;
    if (after && !n) return '';
    const win = after ? (r.bossWrong ? `안 따른 ${no}명 승리!` : `따른 ${yes}명 승리!`) : '';
    return `<div class="card stack" style="gap:8px;padding:14px 16px">
      <div class="row" style="justify-content:space-between"><div class="eyebrow">🗳 회장님 촉, 따른다? 안 따른다?</div><b>${after ? win : `${n}명 투표`}</b></div>
      <div class="vote-bar"><span class="y" style="flex:${n ? yes : 1}">👍 따른다 ${yes}명${n ? ` · ${py}%` : ''}</span><span class="n" style="flex:${n ? no : 1}">🙅 안 따른다 ${no}명${n ? ` · ${100 - py}%` : ''}</span></div></div>`;
  }

  // 인터뷰 카드: 이번 라운드 수익률 최고·최저. 사회자가 마이크를 넘길 사람
  function interview() {
    const rows = Object.values(ports).filter(p => p.settledRound === room.round);
    if (rows.length < 2) return '';
    rows.sort((a, b) => (b.roundRet || 0) - (a.roundRet || 0));
    const best = rows[0], worst = rows[rows.length - 1];
    const cell = (tag, p, q) => `<div class="iv"><div class="eyebrow">${tag}</div><div class="iv-nm">${esc(p.nick)}</div>
      <div class="num ${cls(p.roundRet || 0)}" style="font-size:1.4rem;font-weight:700">${pct(p.roundRet || 0)}</div><div class="muted">${q}</div></div>`;
    return `<div class="eyebrow">🎤 인터뷰 타임</div><div class="ivs">
      ${cell('이번 라운드 수익 1등', best, '비결이 뭐였나요?')}${cell('이번 라운드 수익 꼴등', worst, '무슨 생각이었나요?')}</div>`;
  }

  function tipsVerdict(r) {
    return `<div class="card stack" style="gap:6px;padding:14px 16px"><div class="eyebrow">🤫 이번 라운드 찌라시 진위</div>
      ${r.tips.map(t => `<div class="row" style="gap:10px;flex-wrap:nowrap;font-size:1rem"><b style="flex:none;color:${t.real ? 'var(--up)' : 'var(--down)'}">${t.real ? '진짜' : '가짜'}</b><span>${esc(t.text)}</span></div>`).join('')}</div>`;
  }

  function bossVerdict(r) {
    return bossHtml(r, `<br><b style="font-size:1.35rem;color:${r.bossWrong ? 'var(--down)' : 'var(--up)'}">${r.bossWrong ? '🙈 회장님 헛다리!' : '🎯 회장님 촉 적중!'}</b>`);
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
    clearInterval(timer); clearInterval(tickTimer); unRoom(); unPorts(); unWin(); unRoster(); unTrades && unTrades(); unVotes && unVotes(); el.innerHTML = '';
  };
}
