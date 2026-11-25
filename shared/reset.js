// 운영 화면의 초기화 버튼들.
//   resetGame(gameId): 그 게임의 진행 상태·답안·점수·우승 확정을 지움. 참가자 명단은 그대로.
//   wipeAll():         모든 게임 + 참가자 명단·숫자 4자리·백업·우승자까지 지움 (행사 직전 리허설 정리용).
// 게임 방 문서(rooms/{id})를 지우면 그 게임 운영 화면이 열릴 때 처음 상태로 다시 만듭니다.
// ★ 게임에 새 하위 컬렉션을 만들면 아래 SUBS 에도 적어 주세요.
const SUBS = {
  similar: ["guesses", "feedback", "feed", "rounds", "board"],
  emoji: ["answers", "results", "scores", "board"],
  invest: ["portfolios"],   // + trades_/votes_{runId}_{라운드} (아래에서 따로)
};

async function wipeDocs(db, fs, docs) {
  for (let i = 0; i < docs.length; i += 450) {
    const b = fs.writeBatch(db);
    docs.slice(i, i + 450).forEach(d => b.delete(d));
    await b.commit();
  }
  return docs.length;
}
const refsOf = async (db, fs, ...path) => (await fs.getDocs(fs.collection(db, ...path))).docs.map(d => d.ref);

export async function resetGame(db, fs, gameId) {
  const refs = [];
  for (const sub of SUBS[gameId] || []) refs.push(...await refsOf(db, fs, "rooms", gameId, sub));
  if (gameId === "invest") {
    const room = await fs.getDoc(fs.doc(db, "rooms", "invest"));
    const run = room.exists() ? room.data().runId : null;
    if (run) for (let r = 0; r <= 10; r++) for (const k of ["trades", "votes"]) refs.push(...await refsOf(db, fs, "rooms", "invest", `${k}_${run}_${r}`));
  }
  refs.push(fs.doc(db, "rooms", gameId), fs.doc(db, "winners", gameId));
  await wipeDocs(db, fs, refs);
}

// 반환: 지운 참가자 수
export async function wipeAll(db, fs, { uid } = {}) {
  await fs.setDoc(fs.doc(db, "rooms", "current"), { gameId: null });
  for (const id of Object.keys(SUBS)) await resetGame(db, fs, id);
  const players = await refsOf(db, fs, "players");
  const backup = await fs.getDoc(fs.doc(db, "rooms", "playersBackup"));
  const ids = new Set([...players.map(r => r.id), ...(backup.exists() ? backup.data().ids || [] : [])]);
  const refs = [
    ...[...ids].map(id => fs.doc(db, "pins", id)),
    ...players,
    ...await refsOf(db, fs, "winners"),
    ...await refsOf(db, fs, "rooms", "tutorial", "practice"),
    fs.doc(db, "rooms", "playersBackup"),
    fs.doc(db, "rooms", "tutorial"),
  ];
  if (uid) refs.push(fs.doc(db, "claims", uid));
  await wipeDocs(db, fs, refs);
  if (fs.resetMock) { fs.resetMock(); await fs.setDoc(fs.doc(db, "rooms", "current"), { gameId: null }); }
  return players.length;
}
