// 메인(운영 로비)에 보여 줄 게임별 순위와 우승자.
// 게임 모듈을 불러오지 않고, 각 게임이 DB에 남긴 결과만 읽습니다.
//   이모지·H2맨틀: rooms/{id}/board/current.rows (rank 포함)
//   임삼성: rooms/invest/portfolios/* (정산 때 rank 를 적어 둠)
// 게임이 끝났는지는 rooms/{id}.phase === "final" 로 판단합니다.
import { GAMES } from "./games.js";
import { pickWinner } from "./winners.js";

export const TOP_N = 5;

function won(v) {
  v = Math.round(v / 10000);
  const neg = v < 0; v = Math.abs(v);
  const eok = Math.floor(v / 10000), man = v % 10000;
  const s = eok ? eok + "억" + (man ? " " + man.toLocaleString("ko-KR") + "만" : "") : man.toLocaleString("ko-KR") + "만";
  return (neg ? "-" : "") + s + "원";
}

// 순위 목록을 그대로 다시 등수로: rank 가 없으면 순서대로, 같은 값이면 같은 등수
function invRows(docs) {
  const rows = docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (Math.round(b.value) - Math.round(a.value)) || ((a.totalTime ?? 0) - (b.totalTime ?? 0)));
  return rows.map((r, i) => ({ id: r.id, nick: r.nick, rank: r.rank ?? i + 1, label: won(r.value || 0) }));
}
function boardRows(rows) {
  return [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .map((r, i) => ({ id: r.id, nick: r.nick, rank: r.rank ?? i + 1, label: `${r.score ?? 0}점` }));
}

// cb({ [gameId]: { phase, finished, rows: [{id, nick, rank, label}] } }) 를 바뀔 때마다 부름. 반환: 구독 해제 함수
export function watchStandings(db, fs, cb) {
  const state = {}, unsubs = [];
  const emit = () => cb(structuredClone(state));
  for (const g of GAMES) {
    state[g.id] = { phase: null, finished: false, rows: [] };
    unsubs.push(fs.onSnapshot(fs.doc(db, "rooms", g.id), s => {
      const phase = s.exists() ? s.data().phase || null : null;
      state[g.id].phase = phase; state[g.id].finished = phase === "final"; emit();
    }, e => console.warn("standings", g.id, e)));
    if (g.id === "invest") {
      unsubs.push(fs.onSnapshot(fs.collection(db, "rooms", "invest", "portfolios"), s => {
        state.invest.rows = invRows(s.docs); emit();
      }, e => console.warn("standings invest", e)));
    } else {
      unsubs.push(fs.onSnapshot(fs.doc(db, "rooms", g.id, "board", "current"), s => {
        state[g.id].rows = boardRows(s.exists() ? s.data().rows || [] : []); emit();
      }, e => console.warn("standings", g.id, e)));
    }
  }
  return () => unsubs.forEach(u => u());
}

// 게임별 우승자: 확정된 게임(winners/{id})은 그대로, 끝났지만 확정 전인 게임은 규칙대로 임시 계산.
// 한 사람이 두 게임 우승을 받을 수 없으므로 확정된 게임을 먼저 반영하고, 나머지는 게임 순서대로 고릅니다.
// 반환: { [gameId]: { nick, rank, confirmed, skipped: [nick], tied: [nick] } | null }
export function resolveWinners(standings, winners) {
  const taken = {}, out = {};
  for (const g of GAMES) if (winners[g.id]) { taken[g.id] = winners[g.id]; out[g.id] = { nick: winners[g.id].nick, rank: winners[g.id].rank ?? 1, confirmed: true, skipped: [], tied: [] }; }
  for (const g of GAMES) {
    if (out[g.id]) continue;
    const st = standings[g.id];
    if (!st || !st.finished || !st.rows.length) { out[g.id] = null; continue; }
    const p = pickWinner(st.rows, taken, g.id);
    if (!p.winner) { out[g.id] = null; continue; }
    taken[g.id] = { pid: p.winner.id, nick: p.winner.nick };
    out[g.id] = { nick: p.winner.nick, rank: p.winner.rank, confirmed: false,
      skipped: p.skipped.map(r => r.nick), tied: p.tied.map(r => r.nick) };
  }
  return out;
}
