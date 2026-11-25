// 반도체왕 임삼성: 참가자(휴대폰) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, player: { id, nick } }
// 라운드: 뉴스·토의(나만의 비밀 찌라시, 비율 미리 정하기) → (운영자가 고르면) 프리장 20초 시초 주문
//        → 본장 30초(갈아탈 때마다 슬라이더 잠김, 15초째 속보로 30초 정지·토의) → 결과(찌라시 진위)
// 주문: 슬라이더에서 손 떼고 3초 동안 안 건드리면 자동 주문. 버튼을 누르면 바로 주문.
// 가격 흐름은 폰에서 직접 계산(서버 읽기 없음). 비율은 종목별 슬라이더로 정함.
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, MARKET_SECONDS, PRE_SECONDS, MARKET_WALL, preOf, FLASH_SECONDS, SLIDER_LOCK_SECONDS, TRADE_COOLDOWN_MS, TOP_N, BOSS_TAG, AUTO_ORDER_MS, ALL_IN_SECONDS,
  tickAt, flashLeft, moveOf, tipFor, pricePath, valueAt,
  cashOf, sameAlloc, toMs, won, pct, cls, arrow, esc, lineChart, loadCss } from './data.js';

const GAME = 'invest';
const T = MARKET_SECONDS, W = MARKET_WALL;
const STEP = 5;

export function mount(el, ctx) {
  const { db, fs, player } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', GAME);
  const myRef = fs.doc(db, 'rooms', GAME, 'portfolios', player.id);
  const winRef = fs.doc(db, 'winners', GAME);
  const tradeCol = (run, r) => fs.collection(db, 'rooms', GAME, `trades_${run}_${r}`);
  const voteRef = (run, r) => fs.doc(db, 'rooms', GAME, `votes_${run}_${r}`, player.id); // 회장님 믿음 투표
  const ts = () => (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

  let room = null, mine = null, myTrades = [], key = '', unTr = null, unVote = null, myVote = null, winner = null;
  let autoAt = 0, draft = null, offset = 0, lastSent = 0, lockUntil = 0, busy = false, err = '', dragging = false, pending = false, stageKey = '';

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'inv';
  root.style.minHeight = '100%';
  root.innerHTML = '<div class="inv-play" data-r="stage"><p class="muted">불러오는 중…</p></div>';
  el.appendChild(root);
  const stage = root.querySelector('[data-r="stage"]');

  // 처음 들어오면 포트폴리오 만들기 (늦게 들어와도 시작 자금으로 참여). seenAt 으로 서버 시계와의 차이를 잼.
  // 운영자가 '참가자 비우기'로 지워도 이 화면이 켜져 있으면 바로 다시 만들어 계속 참여합니다.
  let ensuring = false;
  const ensure = () => { if (ensuring) return; ensuring = true; fs.getDoc(myRef).then(s => {
    const clock = { seenAt: ts(), seenAtMs: Date.now() };
    if (!s.exists()) return fs.setDoc(myRef, { nick: player.nick, value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, roundRet: 0,
      prevRank: null, rank: null, total: null, settledRound: -1, totalTime: 0, ...clock });
    return fs.updateDoc(myRef, { nick: player.nick, ...clock });
  }).catch(e => { err = '입장하지 못했어요. 새로고침해 주세요. (' + (e?.message || e) + ')'; render(); })
    .finally(() => { ensuring = false; }); };
  ensure();

  const unRoom = fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : { phase: 'lobby', round: 0, runId: '' };
    const k = room.runId + '_' + room.round;
    if (k !== key) {
      key = k; draft = null; myTrades = []; unTr && unTr(); unVote && unVote(); myVote = null;
      unVote = room.runId ? fs.onSnapshot(voteRef(room.runId, room.round), v => { myVote = v.exists() ? v.data().trust : null; render(); }) : null;
      unTr = room.runId ? fs.onSnapshot(fs.query(tradeCol(room.runId, room.round), fs.where('pid', '==', player.id)), q => {
        myTrades = q.docs.map(d => d.data()); render();
      }) : null;
    }
    render();
  }, e => { err = '서버 연결이 끊겼어요: ' + (e?.message || e); render(); });
  const unMine = fs.onSnapshot(myRef, s => {
    mine = s.exists() ? s.data() : null;
    if (!mine && !s.metadata?.hasPendingWrites) ensure();
    const sv = toMs(mine?.seenAt); if (sv && mine.seenAtMs) offset = sv - mine.seenAtMs;
    render();
  });
  const unWin = fs.onSnapshot(winRef, s => { winner = s.exists() ? s.data() : null; render(); });
  const liveTimer = setInterval(() => { if (room?.phase === 'market') live(); }, 500);
  // 자동 주문: 손 뗀 뒤 AUTO_ORDER_MS 동안 그대로면 주문. 뉴스 화면에서 정해 둔 비율은 장이 열리자마자 들어감.
  const autoTimer = setInterval(() => {
    if (!autoAt) return;
    const dirty = draft && !sameAlloc(draft, holding());
    if (!dirty) { autoAt = 0; paintSend(); return; }
    if (!dragging && Date.now() >= autoAt && canOrder() && !busy && !lockLeft()) { autoAt = 0; order(cur()); return; }
    paintSend();
  }, 200);
  // 폰 화면이 꺼졌다 켜지면 바로 다시 그림 (시계는 폰에서 계산하므로 서버를 기다리지 않음)
  const onVis = () => { if (document.visibilityState === 'visible') render(); };
  document.addEventListener('visibilitychange', onVis);

  /* ---------- 시간과 자산 ---------- */
  // 프리장 시작 시각(서버 기준) → 본장 시작 = 그 뒤 PRE 초
  const openMs = () => toMs(room?.marketStart) ?? (room?.marketStartMs != null ? room.marketStartMs : null);
  const pre = () => preOf(room); // 운영자가 프리장을 건너뛰면 0
  const startMs = () => { const o = openMs(); return o == null ? null : o + pre() * 1000; };
  const elapsed = () => { const s = startMs(); return s == null ? -pre() * 1000 : Date.now() + offset - s; }; // 음수면 프리장
  const isPre = () => room?.phase === 'market' && elapsed() < 0;
  const preLeft = () => Math.ceil(-elapsed() / 1000);
  const tick = () => tickAt(Math.max(0, elapsed()));
  const closed = () => room?.phase === 'market' && elapsed() >= W * 1000;
  const flash = () => (room?.phase === 'market' && !isPre() && !closed() ? flashLeft(elapsed()) : 0);
  const canOrder = () => room?.phase === 'market' && !closed();
  function myTradeList() {
    const s = startMs();
    return myTrades.map(t => ({ ms: toMs(t.at) ?? (t.atMs + offset), alloc: { ...ZERO, ...t.alloc } }))
      .sort((a, b) => a.ms - b.ms)
      .map(t => ({ ...t, tick: s == null ? 0 : tickAt(Math.max(0, t.ms - s)) }));
  }
  const holding = () => { const tr = myTradeList(); return tr.length ? tr[tr.length - 1].alloc : { ...ZERO, ...(mine?.lastAlloc || {}) }; };
  const cur = () => ({ ...ZERO, ...(draft || holding()) });
  // 거래 수수료: 본장에서 주문하면 SLIDER_LOCK_SECONDS 동안 슬라이더 잠금. 새로고침해도 마지막 주문 시각으로 다시 계산.
  function lockLeft() {
    if (room?.phase !== 'market' || isPre() || closed()) return 0;
    const tr = myTradeList(), last = tr[tr.length - 1], s = startMs();
    let until = lockUntil;
    if (last && s != null && last.ms >= s) until = Math.max(until, last.ms - offset + SLIDER_LOCK_SECONDS * 1000);
    return Math.max(0, until - Date.now());
  }
  const liveValue = () => valueAt(mine?.value ?? START_MONEY, mine?.lastAlloc, myTradeList(), room.round, tick());

  /* ---------- 주문 ---------- */
  async function order(alloc) {
    if (busy || !canOrder() || !room?.runId) return;
    if (lockLeft() > 0) return;
    if (Date.now() - lastSent < TRADE_COOLDOWN_MS) { err = '잠깐만요, 1초에 한 번씩 주문할 수 있어요.'; render(); return; }
    if (sameAlloc(alloc, holding())) { draft = null; render(); return; }
    busy = true; err = ''; lastSent = Date.now(); render();
    try {
      const id = `${player.id}_${Date.now().toString(36)}`;
      await fs.setDoc(fs.doc(tradeCol(room.runId, room.round), id), { pid: player.id, nick: player.nick, alloc: { ...ZERO, ...alloc }, at: ts(), atMs: Date.now() });
      draft = null; autoAt = 0;
      if (!isPre()) lockUntil = Date.now() + SLIDER_LOCK_SECONDS * 1000;
    } catch (e) { err = '주문하지 못했어요. 다시 눌러 주세요.'; }
    busy = false; render();
  }

  /* ---------- 슬라이더 ---------- */
  // 한 종목을 올리면 먼저 현금에서 가져오고, 모자라면 다른 종목을 큰 것부터 줄임(합계는 항상 100%).
  // 그래서 슬라이더 하나만 끝까지 밀어도 바로 그 종목으로 갈아탈 수 있음.
  function setSlider(id, v) {
    const a = cur();
    const want = Math.max(0, Math.min(100, Math.round(v / STEP) * STEP));
    let need = want - a[id] - cashOf(a);
    a[id] = want;
    while (need > 0) {
      const big = INVEST.filter(x => x.id !== id && a[x.id] > 0).sort((p, q) => a[q.id] - a[p.id])[0];
      if (!big) break;
      const take = Math.min(STEP, a[big.id], need);
      a[big.id] -= take; need -= take;
    }
    draft = a;
    return a;
  }
  // 드래그 중에는 화면 전체를 다시 그리지 않고 숫자·막대·버튼만 바꿈
  function paintSliders() {
    const a = cur(), c = cashOf(a);
    INVEST.forEach(x => {
      const r = stage.querySelector(`input[data-id="${x.id}"]`); if (r && +r.value !== a[x.id]) r.value = a[x.id];
      const l = stage.querySelector(`[data-pv="${x.id}"]`); if (l) l.textContent = a[x.id] + '%';
      if (r) r.style.setProperty('--p', a[x.id] + '%');
    });
    const cv = stage.querySelector('[data-pv="cash"]'); if (cv) cv.textContent = c + '%';
    const bar = stage.querySelector('[data-r="draftbar"]'); if (bar) bar.innerHTML = abarInner(a);
    paintSend();
    const undo = stage.querySelector('[data-a="undo"]'); if (undo) undo.hidden = !(draft && !sameAlloc(draft, holding()));
  }
  // 주문 버튼 글자: 자동 주문까지 남은 초를 보여 줌
  function sendLabel() {
    const dirty = draft && !sameAlloc(draft, holding());
    if (room.phase === 'news') return dirty ? '장이 열리면 이 비율로 자동 주문' : '비율을 정해 두면 장이 열릴 때 자동 주문';
    const base = isPre() ? '시초 주문' : '주문';
    if (!dirty) return `슬라이더를 움직이면 ${AUTO_ORDER_MS / 1000}초 뒤 자동 ${base}`;
    if (dragging || !autoAt) return `지금 ${base}`;
    return `지금 ${base} · ${Math.max(1, Math.ceil((autoAt - Date.now()) / 1000))}초 뒤 자동`;
  }
  function paintSend() {
    const send = stage.querySelector('[data-a="send"]'); if (!send) return;
    send.disabled = !(canOrder() && !busy && !lockLeft() && draft && !sameAlloc(draft, holding()));
    const t = sendLabel(); if (send.textContent !== t) send.textContent = t;
    send.classList.toggle('auto', !!autoAt && !dragging);
  }
  const armAuto = () => { autoAt = draft && !sameAlloc(draft, holding()) ? Date.now() + AUTO_ORDER_MS : 0; paintSend(); };
  root.addEventListener('input', e => {
    const r = e.target.closest('input[type=range][data-id]'); if (!r) return;
    setSlider(r.dataset.id, +r.value); autoAt = 0; paintSliders();
  });
  const endDrag = () => { if (!dragging) return; dragging = false; armAuto(); if (pending) { pending = false; render(); } };
  root.addEventListener('pointerdown', e => { if (e.target.closest('input[type=range]')) dragging = true; });
  root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
  root.addEventListener('change', e => { if (e.target.closest('input[type=range]')) { if (dragging) endDrag(); else armAuto(); } });
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const { a } = t.dataset;
    if (a === 'send') { autoAt = 0; order(cur()); }
    else if (a === 'undo') { draft = null; autoAt = 0; render(true); }
    else if (a === 'vote') {
      const trust = t.dataset.v === '1'; myVote = trust; render();
      fs.setDoc(voteRef(room.runId, room.round), { pid: player.id, nick: player.nick, trust, at: ts() }).catch(() => { err = '투표하지 못했어요. 다시 눌러 주세요.'; render(); });
    }
    else if (a === 'cash') { if (!lockLeft()) { draft = { ...ZERO }; render(true); armAuto(); } }
  });

  /* ---------- 렌더 ---------- */
  function header() {
    const v = room?.phase === 'market' && !isPre() ? liveValue() : (mine?.value ?? START_MONEY);
    const rank = mine?.rank, total = mine?.total;
    return `<div class="top"><span class="brand">반도체왕 임삼성</span>${room && !['lobby', 'final'].includes(room.phase) ? `<span class="muted num">R${room.round + 1}/${ROUNDS.length}</span>` : ''}</div>
      <div class="me"><span class="nick">${esc(player.nick)}</span><span class="rk num">${rank ? rank + '<span style="font-size:.55em;color:var(--muted)">/' + total + '위</span>' : ''}</span>
        <span class="val" data-live="val">${won(v)} <span class="${cls(v - START_MONEY)}" style="font-size:.7em">${pct((v / START_MONEY - 1) * 100)}</span></span></div>`;
  }
  const abarInner = a => ASSETS.map(x => { const p = x.id === 'cash' ? cashOf(a) : a[x.id]; return p > 0 ? `<span style="width:${p}%;background:${x.color}"></span>` : ''; }).join('');
  const abar = a => `<div class="abar">${abarInner(a)}</div>`;
  const allocText = a => ASSETS.map(x => { const p = x.id === 'cash' ? cashOf(a) : (a[x.id] || 0); return p ? `${x.short} ${p}%` : ''; }).filter(Boolean).join(' · ') || '현금 100%';

  function controls() {
    const a = cur(), c = cashOf(a), hold = holding(), dirty = draft && !sameAlloc(draft, hold);
    const pre = isPre(), news = room.phase === 'news';
    const lk = lockLeft(), dis = lk ? 'disabled' : '';
    return `<div class="sliders${lk ? ' locked' : ''}">
      ${lk ? `<div class="lock" role="status">🔒 거래 수수료: <b class="num" data-live="lock">${Math.ceil(lk / 1000)}초</b> 뒤 다시 조정</div>` : ''}
      <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:.95rem">${news ? '비율 미리 정해 두기' : pre ? '시초 주문' : '지금 보유'} <span class="muted" style="font-weight:400;font-size:.85rem">${news ? '' : allocText(hold)}</span></b>
        <button class="linkbtn" data-a="cash" ${dis}>전부 현금</button></div>
      ${INVEST.map(x => `<label class="srow" style="--c:${x.color}">
        <span class="sname"><span class="dot" style="background:${x.color}"></span>${x.short}</span>
        <input type="range" min="0" max="100" step="${STEP}" value="${a[x.id]}" data-id="${x.id}" ${dis} style="--p:${a[x.id]}%" aria-label="${x.name} 비율">
        <span class="spv num" data-pv="${x.id}">${a[x.id]}%</span></label>`).join('')}
      <div class="srow" style="--c:${ASSETS[4].color}"><span class="sname"><span class="dot" style="background:${ASSETS[4].color}"></span>현금</span>
        <div class="abar" data-r="draftbar">${abarInner(a)}</div><span class="spv num" data-pv="cash">${c}%</span></div>
      <div class="row" style="gap:8px;flex-wrap:nowrap">
        <button class="btn primary" style="flex:1;padding:14px" data-a="send" ${canOrder() && !busy && !lk && dirty ? '' : 'disabled'}>${sendLabel()}</button>
        <button class="btn ghost" data-a="undo" ${dirty ? '' : 'hidden'}>되돌리기</button></div>
    </div>`;
  }

  // force: 슬라이더를 드래그하는 중이어도 다시 그림(버튼으로 바꾼 경우)
  function render(force) {
    if (!room) return;
    if (dragging && !force) { pending = true; return; }
    const e = err ? `<p class="warn" role="alert" style="margin-bottom:10px">${esc(err)}</p>` : '';
    const body = { lobby: vLobby, news: vNews, market: vMarket, reveal: vReveal, final: vFinal }[room.phase] || vLobby;
    stageKey = phaseKey();
    stage.innerHTML = e + header() + body();
    paintSend();
  }
  // 장 중 0.5초마다: 차트·시계·내 자산만 바꿔 끼움 (슬라이더와 버튼은 그대로 두어 조작이 끊기지 않게)
  // 화면 구조가 바뀌는 시점(프리장·속보·잠금·마감)을 구분하는 키
  const phaseKey = () => room.phase + (isPre() ? 'pre' + (preLeft() <= ALL_IN_SECONDS ? 'cd' : '') : '') + (flash() ? 'flash' : '') + (lockLeft() ? 'lock' : '') + (closed() ? 'closed' : '');
  function live() {
    if (phaseKey() !== stageKey) { render(); return; }
    const set = (k, h) => { const n = stage.querySelector(`[data-live="${k}"]`); if (n) n.innerHTML = h; };
    if (isPre()) { set('clock', `${preLeft()}<span>초</span>`); set('cd', preLeft()); return; }
    const lk = lockLeft(); if (lk) set('lock', Math.ceil(lk / 1000) + '초');
    const fl = flash(); if (fl) set('flash', fl + '초');
    const v = liveValue(), tk = tick(), left = T - tk;
    set('val', `${won(v)} <span class="${cls(v - START_MONEY)}" style="font-size:.7em">${pct((v / START_MONEY - 1) * 100)}</span>`);
    set('clock', `${left}<span>초</span>`);
    set('chart', chartHtml(tk));
    set('prices', pricesHtml(tk));
    const ret = (v / (mine?.value ?? START_MONEY) - 1) * 100;
    set('ret', `<b class="num ${cls(ret)}">${pct(ret)}</b>`);
  }
  const chartHtml = tk => lineChart(INVEST.map(a => ({ color: a.color, data: pricePath(room.round, a.id) })), T + 1, tk, { h: 96 });
  const pricesHtml = tk => INVEST.map(a => { const c = (pricePath(room.round, a.id)[tk] - 1) * 100; return `<span><span class="dot" style="background:${a.color}"></span>${a.short} <b class="num ${cls(c)}">${pct(c)}</b></span>`; }).join('');

  function vLobby() {
    return `<div class="stack"><div class="hero stack" style="gap:10px"><div class="big">입장 완료!</div><p class="muted">운영자가 게임을 시작하면 화면이 바뀝니다.</p></div>
      <div class="card stack" style="gap:8px"><b>규칙</b>
        <ul class="rules">
          <li>모두 <b>${won(START_MONEY)}</b>으로 시작, ${ROUNDS.length}라운드 뒤 자산 1등이 반도체왕</li>
          <li>라운드마다 <b>뉴스·토의</b>: 폰마다 <b>다른 비밀 찌라시</b>가 와요. 진짜일 수도, 가짜일 수도! 옆 사람과 맞춰 보세요</li>
          <li>운영자가 열면 <b>${PRE_SECONDS}초 프리장</b>: 본장 시작 가격으로 시초 주문</li>
          <li><b>${T}초 본장</b>: 슬라이더로 비율을 바꿔 주문</li>
          <li>거래 수수료: 본장에서 주문하면 슬라이더 <b>${SLIDER_LOCK_SECONDS}초 잠김</b></li>
          <li>본장 중간 <b>추가 속보</b>: 장이 ${FLASH_SECONDS}초 멈추고 토의 타임. 큰 화면에 모두의 투자 비율 공개</li>
          <li>슬라이더에서 손 떼고 <b>${AUTO_ORDER_MS / 1000}초</b> 지나면 자동 주문 (버튼으로 바로 주문도 OK)</li>
          <li>마지막 라운드는 등락 2배 <b>더블 찬스</b></li>
          <li>자산이 같으면 더 빨리 결정한 사람이 승리</li>
        </ul></div></div>`;
  }
  function vNews() {
    const r = ROUNDS[room.round];
    return `<div class="stack" style="gap:12px">
      ${r.double ? '<div class="status" style="color:var(--accent)">더블 찬스! 이번 라운드는 등락 2배</div>' : ''}
      <div class="news-s"><div class="num muted" style="font-size:.85rem">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>
      ${tipBox()}
      <div class="boss-s stack" style="gap:8px"><div><b>임삼성 회장</b> <span class="boss-tag">${BOSS_TAG}</span><br>“${esc(r.boss)}”</div>
        <div class="row" style="gap:8px;flex-wrap:nowrap">
          <button class="btn ${myVote === true ? 'primary' : 'ghost'}" style="flex:1" data-a="vote" data-v="1" ${room.runId ? '' : 'disabled'}>👍 따른다</button>
          <button class="btn ${myVote === false ? 'primary' : 'ghost'}" style="flex:1" data-a="vote" data-v="0" ${room.runId ? '' : 'disabled'}>🙅 안 따른다</button></div>
        <span class="muted" style="font-size:.85rem">${myVote == null ? '큰 화면에 따르는 사람 비율이 떠요' : '투표 완료! 바꿀 수 있어요'}</span></div>
      <ul class="tips"><li>💬 지금은 토의 시간! 찌라시를 옆 사람과 맞춰 보세요</li><li>비율을 미리 정해 두면 장이 열리자마자 자동 주문돼요</li><li>주문하지 않으면 지난 라운드 비율 그대로</li></ul>
      ${controls()}
    </div>`;
  }
  // 나만 아는 비밀 찌라시 (라운드마다 참가자별로 다름, 진짜·가짜 섞임)
  function tipBox() {
    const t = tipFor(player.id, room.round);
    return `<div class="tip"><b class="tag">🤫 나만 아는 찌라시 · 진짜일까?</b>${esc(t.text)}</div>`;
  }
  function vMarket() {
    const r = ROUNDS[room.round];
    if (isPre()) {
      return `<div class="stack" style="gap:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div style="flex:1;min-width:0"><div class="eyebrow" style="color:var(--accent)">프리장 · 시초 주문</div><b style="font-size:1rem;line-height:1.3">${r.title}${r.double ? ' <span style="color:var(--accent)">×2</span>' : ''}</b></div>
          <span class="clock num" data-live="clock">${preLeft()}<span>초</span></span></div>
        ${preLeft() <= ALL_IN_SECONDS ? `<div class="p-cd" aria-live="assertive">본장 시작까지 <b class="num" data-live="cd">${preLeft()}</b></div>` : ''}
        <ul class="news-b">${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        ${tipBox()}
        <ul class="tips"><li>프리장 주문은 본장 시작 가격으로 체결</li><li>본장에선 주문할 때마다 슬라이더 ${SLIDER_LOCK_SECONDS}초 잠김</li></ul>
        ${controls()}
      </div>`;
    }
    const tk = tick(), left = T - tk, fl = flash();
    return `<div class="stack" style="gap:10px">
      ${fl ? `<div class="flash" role="alert"><div class="row" style="justify-content:space-between;align-items:center;gap:8px">
        <span class="flash-tag">추가 속보 · 토의 타임</span><b class="num" data-live="flash">${fl}초</b></div>
        <b style="font-size:1.05rem;line-height:1.35">${r.flash.title}</b><ul>${r.flash.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        <div class="muted" style="font-size:.9rem">💬 주변과 상의하세요! 큰 화면에 모두의 투자 비율이 떴어요. 지금 주문하면 멈춘 가격으로 체결</div></div>` : ''}
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1;min-width:0"><div class="eyebrow">본장 · 이번 라운드 <span data-live="ret"></span></div><b style="font-size:.95rem;line-height:1.3">${r.title}${r.double ? ' <span style="color:var(--accent)">×2</span>' : ''}</b></div>
        <span class="clock num" data-live="clock">${left}<span>초</span></span></div>
      <div class="card" style="padding:8px;color:var(--muted)" data-live="chart">${chartHtml(tk)}</div>
      <div class="prices" data-live="prices">${pricesHtml(tk)}</div>
      ${closed() ? '<div class="status">장 마감! 결과를 집계하고 있어요.</div>' : controls()}
    </div>`;
  }
  function vReveal() {
    const r = ROUNDS[room.round], m = moveOf(room.round), settled = mine?.settledRound === room.round;
    const ret = settled ? mine.roundRet : 0, d = settled && mine.prevRank && mine.rank ? mine.prevRank - mine.rank : 0;
    return `<div class="stack" style="gap:14px">
      <div class="hero stack" style="gap:6px;padding:16px 8px"><div class="muted">이번 라운드 내 수익률</div><div class="big num ${cls(ret)}" style="color:inherit">${settled ? pct(ret) : '집계 중'}</div>
        ${d ? `<div class="num ${cls(d)}">순위 ${arrow(d)} ${Math.abs(d)}</div>` : ''}</div>
      <div class="card" style="padding:10px;color:var(--muted)">${lineChart(INVEST.map(a => ({ color: a.color, data: pricePath(room.round, a.id) })), T + 1, T, { h: 120 })}</div>
      <div class="mv">${ASSETS.map(x => `<div><span class="row" style="gap:6px"><span class="dot" style="background:${x.color}"></span>${x.short}</span><b class="num ${cls(m[x.id])}">${arrow(m[x.id])} ${pct(Math.abs(m[x.id]), false)}</b></div>`).join('')}</div>
      ${settled ? `<p class="muted" style="font-size:.9rem">주문 ${mine.trades || 0}번 · 마감 때 비율: ${allocText(mine.lastAlloc || ZERO)}</p>` : ''}
      ${(() => { const t = tipFor(player.id, room.round); return `<div class="tip"><b class="tag">내 찌라시는… ${t.real ? '진짜였어요!' : '가짜였어요!'}</b>${esc(t.text)}</div>`; })()}
      <div class="boss-s"><b>임삼성 회장</b> ${r.bossWrong ? '🙈 헛다리!' : '🎯 적중!'} <span class="muted">“${esc(r.boss)}”</span>
        ${myVote == null ? '' : `<br><b>${myVote !== !!r.bossWrong ? '내 판단 적중 👏' : '내 판단은 빗나감 😅'}</b>`}</div>
      <p class="muted" style="font-size:.95rem">${r.twist}</p>
    </div>`;
  }
  function vFinal() {
    const rank = mine?.rank || 0, total = mine?.total || 0, v = mine?.value ?? START_MONEY, me = winner?.pid === player.id;
    return `<div class="hero stack" style="gap:10px">${me ? '<div style="font-size:3rem" aria-hidden="true">👑</div>' : ''}
      <div class="muted">최종 순위</div><div class="big num">${rank ? rank + '위' : '-'} <span style="font-size:.4em;color:var(--muted)">/ ${total}명</span></div>
      <div class="num" style="font-size:1.4rem">${won(v)} <span class="${cls(v - START_MONEY)}">${pct((v / START_MONEY - 1) * 100)}</span></div>
      <p class="muted">${me ? '올해의 반도체왕입니다! 무대로 나와 주세요.' : winner ? `올해의 반도체왕은 ${esc(winner.nick)} 님! 큰 화면에서 TOP ${TOP_N}를 확인하세요.` : `큰 화면에서 TOP ${TOP_N}와 우승자를 확인하세요.`}</p></div>`;
  }

  return function unmount() {
    clearInterval(liveTimer); clearInterval(autoTimer); document.removeEventListener('visibilitychange', onVis);
    unRoom(); unMine(); unWin(); unTr && unTr(); unVote && unVote(); el.innerHTML = '';
  };
}
