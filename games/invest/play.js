// 반도체왕 임삼성: 참가자(휴대폰) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, player: { id, nick } }
// 뉴스 화면에서 시초 주문, 30초 장 동안 한 번 터치로 갈아타기. 가격 흐름은 폰에서 직접 계산(서버 읽기 없음).
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, MARKET_SECONDS, TRADE_COOLDOWN_MS, TOP_N, moveOf, pricePath, valueAt,
  cashOf, sameAlloc, toMs, won, pct, cls, arrow, esc, lineChart, loadCss } from './data.js';

const GAME = 'invest';
const T = MARKET_SECONDS;

export function mount(el, ctx) {
  const { db, fs, player } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', GAME);
  const myRef = fs.doc(db, 'rooms', GAME, 'portfolios', player.id);
  const winRef = fs.doc(db, 'winners', GAME);
  const tradeCol = (run, r) => fs.collection(db, 'rooms', GAME, `trades_${run}_${r}`);
  const ts = () => (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

  let room = null, mine = null, myTrades = [], key = '', unTr = null, winner = null;
  let draft = null, offset = 0, lastSent = 0, busy = false, err = '', sig = '';

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'inv';
  root.style.minHeight = '100%';
  root.innerHTML = '<div class="inv-play" data-r="stage"><p class="muted">불러오는 중…</p></div>';
  el.appendChild(root);
  const stage = root.querySelector('[data-r="stage"]');

  // 처음 들어오면 포트폴리오 만들기 (늦게 들어와도 시작 자금으로 참여). seenAt 으로 서버 시계와의 차이를 잼.
  fs.getDoc(myRef).then(s => {
    const clock = { seenAt: ts(), seenAtMs: Date.now() };
    if (!s.exists()) return fs.setDoc(myRef, { nick: player.nick, value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, roundRet: 0,
      prevRank: null, rank: null, total: null, settledRound: -1, totalTime: 0, ...clock });
    return fs.updateDoc(myRef, { nick: player.nick, ...clock });
  }).catch(e => { err = '입장하지 못했어요. 새로고침해 주세요. (' + (e?.message || e) + ')'; render(true); });

  const unRoom = fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : { phase: 'lobby', round: 0, runId: '' };
    const k = room.runId + '_' + room.round;
    if (k !== key) {
      key = k; draft = null; myTrades = []; unTr && unTr();
      unTr = room.runId ? fs.onSnapshot(fs.query(tradeCol(room.runId, room.round), fs.where('pid', '==', player.id)), q => {
        myTrades = q.docs.map(d => d.data()); render(true);
      }) : null;
    }
    render(true);
  }, e => { err = '서버 연결이 끊겼어요: ' + (e?.message || e); render(true); });
  const unMine = fs.onSnapshot(myRef, s => {
    mine = s.exists() ? s.data() : null;
    const sv = toMs(mine?.seenAt); if (sv && mine.seenAtMs) offset = sv - mine.seenAtMs;
    render(true);
  });
  const unWin = fs.onSnapshot(winRef, s => { winner = s.exists() ? s.data() : null; render(true); });
  const liveTimer = setInterval(() => { if (room?.phase === 'market') live(); }, 500);

  /* ---------- 시간과 자산 ---------- */
  const startMs = () => toMs(room?.marketStart) ?? (room?.marketStartMs != null ? room.marketStartMs : null);
  const elapsed = () => { const s = startMs(); return s == null ? 0 : Date.now() + offset - s; };
  const tick = () => Math.max(0, Math.min(T, Math.floor(elapsed() / 1000)));
  const closed = () => room?.phase === 'market' && elapsed() >= T * 1000;
  function myTradeList() {
    const s = startMs();
    return myTrades.map(t => ({ ms: toMs(t.at) ?? (t.atMs + offset), alloc: { ...ZERO, ...t.alloc } }))
      .sort((a, b) => a.ms - b.ms)
      .map(t => ({ ...t, tick: s == null ? 0 : Math.max(0, Math.min(T, Math.floor((t.ms - s) / 1000))) }));
  }
  const holding = () => { const tr = myTradeList(); return tr.length ? tr[tr.length - 1].alloc : { ...ZERO, ...(mine?.lastAlloc || {}) }; };
  const cur = () => draft || holding();
  const liveValue = () => valueAt(mine?.value ?? START_MONEY, mine?.lastAlloc, myTradeList(), room.round, tick());

  /* ---------- 주문 ---------- */
  async function order(alloc) {
    if (busy || closed() || !room?.runId) return;
    if (Date.now() - lastSent < TRADE_COOLDOWN_MS) { err = '잠깐만요, 1초에 한 번씩 주문할 수 있어요.'; render(true); return; }
    if (sameAlloc(alloc, holding())) { draft = null; render(true); return; }
    busy = true; err = ''; lastSent = Date.now(); render(true);
    try {
      const id = `${player.id}_${Date.now().toString(36)}`;
      await fs.setDoc(fs.doc(tradeCol(room.runId, room.round), id), { pid: player.id, nick: player.nick, alloc: { ...ZERO, ...alloc }, at: ts(), atMs: Date.now() });
      draft = null;
    } catch (e) { err = '주문하지 못했어요. 다시 눌러 주세요.'; }
    busy = false; render(true);
  }
  function step(id, d) {
    const a = { ...ZERO, ...cur() };
    const others = INVEST.reduce((s, x) => s + (x.id === id ? 0 : a[x.id]), 0);
    a[id] = Math.max(0, Math.min(100 - others, (a[id] || 0) + d));
    draft = a; render(true);
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const { a, id } = t.dataset;
    if (a === 'inc') step(id, 10);
    else if (a === 'dec') step(id, -10);
    else if (a === 'all') { const x = { ...ZERO }; if (id !== 'cash') x[id] = 100; order(x); }
    else if (a === 'half') order({ ...ZERO, [id]: 50 });
    else if (a === 'send') order(cur());
    else if (a === 'undo') { draft = null; render(true); }
  });

  /* ---------- 렌더 ---------- */
  function header() {
    const v = room?.phase === 'market' ? liveValue() : (mine?.value ?? START_MONEY);
    const rank = mine?.rank, total = mine?.total;
    return `<div class="top"><span class="brand">반도체왕 임삼성</span>${room && !['lobby', 'final'].includes(room.phase) ? `<span class="muted num">R${room.round + 1}/${ROUNDS.length}</span>` : ''}</div>
      <div class="me"><span class="nick">${esc(player.nick)}</span><span class="rk num">${rank ? rank + '<span style="font-size:.55em;color:var(--muted)">/' + total + '위</span>' : ''}</span>
        <span class="val" data-live="val">${won(v)} <span class="${cls(v - START_MONEY)}" style="font-size:.7em">${pct((v / START_MONEY - 1) * 100)}</span></span></div>`;
  }
  function abar(a) {
    return `<div class="abar">${ASSETS.map(x => { const p = x.id === 'cash' ? cashOf(a) : a[x.id]; return p > 0 ? `<span style="width:${p}%;background:${x.color}"></span>` : ''; }).join('')}</div>`;
  }
  const allocText = a => ASSETS.map(x => { const p = x.id === 'cash' ? cashOf(a) : (a[x.id] || 0); return p ? `${x.short} ${p}%` : ''; }).filter(Boolean).join(' · ') || '현금 100%';

  function controls(isMarket) {
    const a = { ...ZERO, ...cur() }, c = cashOf(a), hold = holding(), dirty = draft && !sameAlloc(draft, hold), off = busy || closed() ? 'disabled' : '';
    return `<div class="stack" style="gap:10px">
      <div class="card stack" style="gap:6px;padding:12px 14px"><div class="row" style="justify-content:space-between"><b>${isMarket ? '지금 보유' : '시초 주문'}</b><span class="muted" style="font-size:.85rem">${allocText(hold)}</span></div>${abar(hold)}</div>
      <div class="quickgrid">${INVEST.map(x => `<button class="qbtn" data-a="all" data-id="${x.id}" ${off} style="--c:${x.color}"><b>${x.short}</b><span>몰빵</span></button>`).join('')}
        <button class="qbtn" data-a="all" data-id="cash" ${off} style="--c:${ASSETS[4].color}"><b>CASH</b><span>전부 현금</span></button></div>
      <details class="custom" ${draft ? 'open' : ''}><summary>비율 직접 정하기</summary>
        <div class="alloc" style="margin-top:10px">${INVEST.map(x => `<div class="arow"><span class="lbl"><span class="dot" style="background:${x.color}"></span>${x.name}</span>
          <span class="stepper"><button data-a="dec" data-id="${x.id}" aria-label="${x.name} 10% 줄이기" ${a[x.id] <= 0 ? 'disabled' : ''}>−</button><span class="v">${a[x.id]}%</span><button data-a="inc" data-id="${x.id}" aria-label="${x.name} 10% 늘리기" ${c <= 0 ? 'disabled' : ''}>+</button></span></div>`).join('')}
          <div class="arow"><span class="lbl"><span class="dot" style="background:${ASSETS[4].color}"></span>현금 (나머지)</span><span class="num" style="font-size:1.2rem;font-weight:700;padding-right:50px">${c}%</span></div>
          ${abar(a)}
          <div class="row" style="gap:8px"><button class="btn primary" style="flex:1" data-a="send" ${dirty && !off ? '' : 'disabled'}>이 비율로 주문</button>${dirty ? '<button class="btn ghost" data-a="undo">되돌리기</button>' : ''}</div>
        </div></details>
    </div>`;
  }

  function render(force) {
    if (!room) return;
    const e = err ? `<p class="warn" role="alert" style="margin-bottom:12px">${esc(err)}</p>` : '';
    const body = { lobby: vLobby, news: vNews, market: vMarket, reveal: vReveal, final: vFinal }[room.phase] || vLobby;
    const html = e + header() + body();
    if (force || html !== sig) { const open = stage.querySelector('details.custom')?.open; sig = html; stage.innerHTML = html; const d = stage.querySelector('details.custom'); if (d && open) d.open = true; }
  }
  // 장 중 0.5초마다: 차트·시계·내 자산만 바꿔 끼움 (버튼은 그대로 두어 터치가 끊기지 않게)
  let wasClosed = false;
  function live() {
    const set = (k, h) => { const n = stage.querySelector(`[data-live="${k}"]`); if (n) n.innerHTML = h; };
    const v = liveValue(), left = Math.max(0, T - Math.floor(elapsed() / 1000)), tk = tick();
    set('val', `${won(v)} <span class="${cls(v - START_MONEY)}" style="font-size:.7em">${pct((v / START_MONEY - 1) * 100)}</span>`);
    set('clock', `${left}<span>초</span>`);
    set('chart', chartHtml(tk));
    set('prices', pricesHtml(tk));
    const ret = (v / (mine?.value ?? START_MONEY) - 1) * 100;
    set('ret', `이번 라운드 <b class="num ${cls(ret)}">${pct(ret)}</b>`);
    if (closed() !== wasClosed) { wasClosed = closed(); render(true); }
  }
  const chartHtml = tk => lineChart(INVEST.map(a => ({ color: a.color, data: pricePath(room.round, a.id) })), T + 1, tk, { h: 150 });
  const pricesHtml = tk => INVEST.map(a => { const c = (pricePath(room.round, a.id)[tk] - 1) * 100; return `<span><span class="dot" style="background:${a.color}"></span> ${a.short} <b class="num ${cls(c)}">${pct(c)}</b></span>`; }).join('');

  function vLobby() {
    return `<div class="stack"><div class="hero stack" style="gap:10px"><div class="big">입장 완료!</div><p class="muted">운영자가 게임을 시작하면 화면이 바뀝니다.</p></div>
      <div class="card stack" style="gap:8px"><b>규칙</b>
        <p class="muted">모두 ${won(START_MONEY)}으로 시작해요. 라운드마다 뉴스를 보고 시초 주문을 넣고, ${T}초 동안 열리는 장에서 차트를 보며 언제든 갈아탈 수 있어요.</p>
        <p class="muted">${ROUNDS.length}라운드 뒤 자산이 가장 많은 사람이 반도체왕! 마지막 라운드는 등락 2배 더블 찬스. 자산이 같으면 더 빨리 결정한 사람이 이겨요.</p></div></div>`;
  }
  function vNews() {
    const r = ROUNDS[room.round];
    return `<div class="stack" style="gap:14px">
      ${r.double ? '<div class="status" style="color:var(--accent)">더블 찬스! 이번 라운드는 등락 2배</div>' : ''}
      <div class="news-s"><div class="num muted" style="font-size:.85rem">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>
      <p class="muted" style="font-size:.9rem">장이 열리기 전에 넣은 주문은 장 시작 가격으로 체결돼요. 안 넣으면 지난 라운드 비율 그대로 갑니다.</p>
      ${controls(false)}
    </div>`;
  }
  function vMarket() {
    const r = ROUNDS[room.round], tk = tick(), left = Math.max(0, T - Math.floor(elapsed() / 1000));
    return `<div class="stack" style="gap:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b style="font-size:1rem;line-height:1.3;flex:1;min-width:0">${r.title}${r.double ? ' <span style="color:var(--accent)">×2</span>' : ''}</b>
        <span class="clock num" data-live="clock">${left}<span>초</span></span></div>
      <div class="card" style="padding:10px;color:var(--muted)" data-live="chart">${chartHtml(tk)}</div>
      <div class="prices" data-live="prices">${pricesHtml(tk)}</div>
      <div class="muted" data-live="ret"></div>
      ${closed() ? '<div class="status">장 마감! 결과를 집계하고 있어요.</div>' : controls(true)}
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

  return function unmount() { clearInterval(liveTimer); unRoom(); unMine(); unWin(); unTr && unTr(); el.innerHTML = ''; };
}
