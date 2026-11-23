// 게임별 우승자. 시상은 게임마다 1등 한 명이고, 한 사람이 두 게임 우승을 받을 수 없습니다.
//   winners/{gameId} = { pid, nick, rank, at }
// 운영자 화면은 watchWinners 로 다른 게임 우승자를 받아 pickWinner 로 이번 게임 우승자를 고르고,
// '우승 확정'을 누르면 confirmWinner 로 씁니다. 참가자 화면은 winners/{gameId} 문서 하나만 구독하면 됩니다.

export function watchWinners(db, fs, cb) {
  return fs.onSnapshot(fs.collection(db, "winners"), s => {
    const w = {}; s.docs.forEach(d => w[d.id] = d.data()); cb(w);
  });
}

// rows: rank 가 매겨진 순위 목록 [{id, nick, rank, ...}], winners: watchWinners 결과
// 반환: { winner, skipped: [다른 게임 우승이라 건너뛴 사람], tied: [우승 자리에 같은 등수로 묶인 사람] }
export function pickWinner(rows, winners, gameId) {
  const taken = new Set(Object.entries(winners).filter(([g]) => g !== gameId).map(([, w]) => w.pid));
  const skipped = [];
  for (const r of rows) {
    if (taken.has(r.id)) { skipped.push(r); continue; }
    const tied = rows.filter(x => x.rank === r.rank && !taken.has(x.id));
    return { winner: r, skipped, tied: tied.length > 1 ? tied : [] };
  }
  return { winner: null, skipped, tied: [] };
}

export function otherGameTitle(winners, pid, gameId, titles = {}) {
  const g = Object.entries(winners).find(([id, w]) => id !== gameId && w.pid === pid);
  return g ? titles[g[0]] || g[0] : null;
}

export async function confirmWinner(db, fs, gameId, row) {
  await fs.setDoc(fs.doc(db, "winners", gameId), { pid: row.id, nick: row.nick, rank: row.rank, at: fs.serverTimestamp() });
}
export async function clearWinner(db, fs, gameId) {
  await fs.deleteDoc(fs.doc(db, "winners", gameId));
}
