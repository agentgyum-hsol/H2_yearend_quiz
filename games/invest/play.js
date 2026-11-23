// 반도체왕 임삼성: 참가자(휴대폰) 화면
// mount(el, ctx) → unmount 함수. ctx = { db, fs, player: { id, nick } }
import { ASSETS, INVEST, ROUNDS, ZERO, START_MONEY, applyRound, cashOf,
  won, pct, cls, arrow, esc, rankList, loadCss } from './data.js';

export function mount(el, ctx) {
  const { db, fs, player } = ctx;
  loadCss(new URL('./invest.css', import.meta.url).href);

  const roomRef = fs.doc(db, 'rooms', 'invest');
  const portCol = fs.collection(db, 'rooms', 'invest', 'portfolios');
  const myRef = fs.doc(portCol, player.id);
  const allocRef = (run, r) => fs.doc(db, 'rooms', 'invest', `allocs_${run}_${r}`, player.id);

  let room = null, ports = {}, mine = null, sent = null, draft = null, key = '', unAlloc = null;
  let ui = { busy: false, err: '' };

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'inv';
  root.style.minHeight = '100%';
  root.innerHTML = '<div class="inv-play" data-r="stage"><p class="muted">불러오는 중…</p></div>';
  el.appendChild(root);
  const stage = root.querySelector('[data-r="stage"]');

  // 처음 들어오면 포트폴리오 만들기 (늦게 들어와도 시작 자금으로 참여)
  fs.getDoc(myRef).then(s => {
    if (!s.exists()) return fs.setDoc(myRef, { nick: player.nick, value: START_MONEY, hist: [START_MONEY], lastAlloc: ZERO, roundRet: 0, prevRank: null, settledRound: -1 });
    if (s.data().nick !== player.nick) return fs.updateDoc(myRef, { nick: player.nick });
  }).catch(e => { ui.err = '입장하지 못했어요. 새로고침해 주세요. (' + (e?.message || e) + ')'; render(); });

  const unRoom = fs.onSnapshot(roomRef, s => {
    room = s.exists() ? s.data() : { phase: 'lobby', round: 0, runId: '' };
    const k = room.runId + '_' + room.round;
    if (k !== key) {
      key = k; draft = null; sent = null; unAlloc && unAlloc();
      unAlloc = room.runId ? fs.onSnapshot(allocRef(room.runId, room.round), a => { sent = a.exists() ? a.data().alloc : null; render(); }) : null;
    }
    render();
  }, e => { ui.err = '서버 연결이 끊겼어요: ' + (e?.message || e); render(); });
  const unPorts = fs.onSnapshot(portCol, s => {
    ports = {}; s.forEach(d => { ports[d.id] = d.data(); });
    mine = ports[player.id] || null;
    render();
  });

  /* ---------- 입력 ---------- */
  const cur = () => draft || sent || mine?.lastAlloc || ZERO;
  function setA(id, v) {
    const a = { ...ZERO, ...cur() };
    const others = INVEST.reduce((s, x) => s + (x.id === id ? 0 : a[x.id]), 0);
    a[id] = Math.max(0, Math.min(100 - others, v)); // 합계 100% 넘지 않게
    draft = a; render();
  }
  function allIn(id) { const a = { ...ZERO }; if (id !== 'cash') a[id] = 100; draft = a; render(); }
  async function submit() {
    if (ui.busy) return;
    ui.busy = true; ui.err = ''; render();
    try {
      await fs.setDoc(allocRef(room.runId, room.round), { pid: player.id, nick: player.nick, alloc: { ...ZERO, ...cur() }, at: Date.now() });
      draft = null;
    } catch (e) { ui.err = '제출하지 못했어요. 다시 눌러 주세요.'; }
    ui.busy = false; render();
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const { a, id } = t.dataset;
    if (a === 'inc') setA(id, (cur()[id] || 0) + 10);
    else if (a === 'dec') setA(id, (cur()[id] || 0) - 10);
    else if (a === 'all') allIn(id);
    else if (a === 'submit') submit();
  });

  /* ---------- 렌더 ---------- */
  function myRank() {
    const list = rankList(ports); const i = list.findIndex(p => p.id === player.id);
    return { rank: i + 1, total: list.length };
  }
  function header() {
    const { rank, total } = myRank();
    const v = mine?.value ?? START_MONEY;
    return `<div class="top"><span class="brand">반도체왕 임삼성</span>${room && room.phase !== 'lobby' && room.phase !== 'final' ? `<span class="muted num">R${room.round + 1}/${ROUNDS.length}</span>` : ''}</div>
      <div class="me"><span class="nick">${esc(player.nick)}</span><span class="rk num">${rank ? rank + '<span style="font-size:.55em;color:var(--muted)">/' + total + '위</span>' : ''}</span>
        <span class="val">${won(v)} <span class="${cls(v - START_MONEY)}" style="font-size:.7em">${pct((v / START_MONEY - 1) * 100)}</span></span></div>`;
  }
  function abar(a) {
    return `<div class="abar">${ASSETS.map(x => { const p = x.id === 'cash' ? cashOf(a) : a[x.id]; return p > 0 ? `<span style="width:${p}%;background:${x.color}"></span>` : ''; }).join('')}</div>`;
  }
  function news(r) {
    return `<div class="news-s"><div class="num muted" style="font-size:.85rem">${r.when}</div><h2>${r.title}</h2><ul>${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>`;
  }

  function render() {
    if (!room) return;
    const err = ui.err ? `<p class="warn" role="alert" style="margin-bottom:12px">${esc(ui.err)}</p>` : '';
    const body = { lobby: vLobby, news: vNews, invest: vInvest, reveal: vReveal, final: vFinal }[room.phase] || vLobby;
    stage.innerHTML = err + header() + body();
  }

  function vLobby() {
    return `<div class="stack"><div class="hero stack" style="gap:10px"><div class="big">입장 완료!</div><p class="muted">운영자가 게임을 시작하면 화면이 바뀝니다.</p></div>
      <div class="card stack" style="gap:8px"><b>규칙</b>
        <p class="muted">모두 ${won(START_MONEY)}으로 시작해요. 라운드마다 뉴스를 보고 내 돈 전부를 DRAM, NAND, 금, 비트코인, 현금에 비율로 나눠 둡니다. ${ROUNDS.length}라운드 뒤 자산이 가장 많은 사람이 반도체왕!</p>
        <p class="muted">제출하지 않으면 지난 라운드 비율 그대로 갑니다. 첫 라운드는 전부 현금이에요.</p></div></div>`;
  }
  function vNews() {
    return `<div class="stack">${news(ROUNDS[room.round])}<div class="status">뉴스를 잘 읽어 두세요. 곧 투자 접수가 열립니다.</div></div>`;
  }
  function vInvest() {
    const r = ROUNDS[room.round], a = { ...ZERO, ...cur() }, c = cashOf(a);
    const dirty = draft && JSON.stringify({ ...ZERO, ...draft }) !== JSON.stringify({ ...ZERO, ...(sent || {}) });
    const status = sent && !dirty ? '<div class="status ok">제출 완료! 마감 전까지 바꿀 수 있어요.</div>'
      : sent ? '<div class="status">바꾼 비율은 아직 제출 전이에요.</div>' : '';
    return `<div class="stack" style="gap:14px">
      <div class="news-s"><div class="num muted" style="font-size:.85rem">${r.when}</div><h2 style="font-size:1.2rem">${r.title}</h2></div>
      ${abar(a)}
      <div class="alloc">${INVEST.map(x => `<div class="arow">
        <span class="lbl"><span class="dot" style="background:${x.color}"></span>${x.name}</span>
        <span class="stepper"><button data-a="dec" data-id="${x.id}" aria-label="${x.name} 10% 줄이기" ${a[x.id] <= 0 ? 'disabled' : ''}>−</button><span class="v">${a[x.id]}%</span><button data-a="inc" data-id="${x.id}" aria-label="${x.name} 10% 늘리기" ${c <= 0 ? 'disabled' : ''}>+</button></span>
        <span class="quick"><button data-a="all" data-id="${x.id}">${x.short} 몰빵</button></span></div>`).join('')}
        <div class="arow"><span class="lbl"><span class="dot" style="background:${ASSETS[4].color}"></span>현금 (나머지, +2%)</span><span class="num" style="font-size:1.2rem;font-weight:700;padding-right:50px">${c}%</span>
          <span class="quick"><button data-a="all" data-id="cash">전부 현금</button></span></div>
      </div>
      ${status}
      <button class="btn primary submit" data-a="submit" ${ui.busy || (sent && !dirty) ? 'disabled' : ''}>${sent ? '바꾼 비율로 다시 제출' : '이 비율로 제출'}</button>
    </div>`;
  }
  function vReveal() {
    const r = ROUNDS[room.round], m = r.move;
    const settled = mine?.settledRound === room.round;
    const ret = settled ? mine.roundRet : 0;
    const { rank } = myRank(); const d = settled && mine.prevRank ? mine.prevRank - rank : 0;
    return `<div class="stack" style="gap:14px">
      <div class="hero stack" style="gap:6px;padding:16px 8px"><div class="muted">이번 라운드 내 수익률</div><div class="big num ${cls(ret)}" style="color:inherit">${pct(ret)}</div>
        ${d ? `<div class="num ${cls(d)}">순위 ${arrow(d)} ${Math.abs(d)}</div>` : ''}</div>
      <div class="mv">${ASSETS.map(x => `<div><span class="row" style="gap:6px"><span class="dot" style="background:${x.color}"></span>${x.short}</span><b class="num ${cls(m[x.id])}">${arrow(m[x.id])} ${pct(Math.abs(m[x.id]), false)}</b></div>`).join('')}</div>
      ${settled ? `<div class="card stack" style="gap:8px"><b>내가 넣은 비율</b>${abar(mine.lastAlloc || ZERO)}<p class="muted" style="font-size:.9rem">${ASSETS.map(x => `${x.short} ${x.id === 'cash' ? cashOf(mine.lastAlloc) : (mine.lastAlloc?.[x.id] || 0)}%`).join(' · ')}${mine.submitted ? '' : ' (미제출, 지난 비율 유지)'}</p></div>` : ''}
      <p class="muted" style="font-size:.95rem">${r.twist}</p>
    </div>`;
  }
  function vFinal() {
    const { rank, total } = myRank(); const v = mine?.value ?? START_MONEY;
    return `<div class="hero stack" style="gap:10px">${rank === 1 ? '<div style="font-size:3rem" aria-hidden="true">👑</div>' : ''}
      <div class="muted">최종 순위</div><div class="big num">${rank}위 <span style="font-size:.4em;color:var(--muted)">/ ${total}명</span></div>
      <div class="num" style="font-size:1.4rem">${won(v)} <span class="${cls(v - START_MONEY)}">${pct((v / START_MONEY - 1) * 100)}</span></div>
      <p class="muted">${rank === 1 ? '올해의 반도체왕입니다!' : '수고하셨어요! 큰 화면에서 우승자를 확인하세요.'}</p></div>`;
  }

  return function unmount() { unRoom(); unPorts(); unAlloc && unAlloc(); el.innerHTML = ''; };
}
