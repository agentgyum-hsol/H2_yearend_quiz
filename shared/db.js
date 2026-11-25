// DB 연결. config.js 에 Firebase 설정이 있으면 Firestore + 익명 로그인,
// 없거나 주소에 ?mock=1 이 있으면 로컬 모의 DB를 씁니다.
import { firebaseConfig } from "../config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2";
const FS_FUNCS = ["doc", "collection", "query", "where", "orderBy", "limit", "getDoc", "getDocs",
  "setDoc", "updateDoc", "deleteDoc", "onSnapshot", "writeBatch", "serverTimestamp", "increment"];

export function isMock() {
  return new URLSearchParams(location.search).has("mock") || !firebaseConfig.projectId;
}

// 반환: { db, fs, uid, mock, onConn }
// fs 는 위 FS_FUNCS 함수 모음. writeBatch 는 fs.writeBatch(db) 로 호출합니다.
// onConn(cb): 서버와 연결돼 있으면 cb(true), 끊겨서 예전 값만 보이면 cb(false). 화면에 "다시 연결 중" 표시용.
export async function connect() {
  if (isMock()) {
    const m = await import("./mockfs.js");
    let uid = null;
    try { uid = sessionStorage.getItem("mock-uid"); } catch {}
    if (!uid) {
      uid = "u" + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem("mock-uid", uid); } catch {}
    }
    const fs = Object.fromEntries(FS_FUNCS.map(k => [k, m[k]]));
    fs.resetMock = m.resetMock;
    return { db: m.getMockDb(), fs, uid, mock: true, onConn: cb => cb(true) };
  }
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const fsMod = await import(`${FB}/firebase-firestore.js`);
  const { getAuth, signInAnonymously } = await import(`${FB}/firebase-auth.js`);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  const db = fsMod.getFirestore(app);
  const fs = Object.fromEntries(FS_FUNCS.map(k => [k, fsMod[k]]));
  const conn = keepConnected(db, fsMod);
  return { db, fs, uid: cred.user.uid, mock: false, onConn: conn.onConn };
}

// 휴대폰 화면이 꺼지거나 다른 앱(카톡 등)으로 갔다 오면 Firestore 실시간 연결이 끊긴 채로 남는 일이 많습니다.
// SDK 가 스스로 알아채기까지 수십 초~몇 분이 걸리고, 그동안 화면은 예전 문제에 멈춰 있어 "새로고침해야 된다"가 됩니다.
// 그래서 화면이 다시 보이거나 네트워크가 돌아오면 연결을 즉시 새로 맺고,
// 그래도 몇 초 안에 서버 응답이 없으면 페이지를 새로고침합니다 (참가자 정보와 점수는 DB에 있어 그대로 이어집니다).
// 화면을 켜 둔 채 연결만 조용히 죽는 경우는 아래 "조용히 죽은 연결 찾기"가 맡습니다.
const RELOAD_AFTER_MS = 8000;
function keepConnected(db, F) {
  let online = false, hiddenAt = null, busy = false, reloadTimer = null;
  const subs = [];
  const set = v => {
    online = v;
    if (v && reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
    subs.forEach(cb => { try { cb(v); } catch (e) { console.error(e); } });
  };
  // 작은 문서 하나를 메타데이터까지 구독해서 "서버에서 온 최신 값인지(fromCache=false)"로 연결 상태를 판단
  F.onSnapshot(F.doc(db, "rooms", "current"), { includeMetadataChanges: true },
    s => set(!s.metadata.fromCache), () => set(false));

  async function reconnect(why) {
    if (busy) return;
    busy = true;
    try { await F.disableNetwork(db); await F.enableNetwork(db); }
    catch (e) { console.warn("reconnect", why, e); }
    finally { busy = false; }
    // 새로 맺은 연결이 RELOAD_AFTER_MS 안에 서버 값을 못 받으면 새로고침 (입력 중이 아닐 때만)
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      if (online || document.hidden || !navigator.onLine) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.value) return;
      location.reload();
    }, RELOAD_AFTER_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    // 잠깐(2초 미만) 가렸다 돌아온 건 그냥 둠
    if (hiddenAt != null && Date.now() - hiddenAt > 2000) reconnect("visible");
    hiddenAt = null;
  });
  addEventListener("pageshow", e => { if (e.persisted) reconnect("pageshow"); });
  addEventListener("online", () => reconnect("online"));
  // 화면이 켜져 있는데 15초 넘게 끊긴 상태면 한 번 더 시도
  setInterval(() => { if (!online && !document.hidden && navigator.onLine) reconnect("stale"); }, 15000);

  // ── 조용히 죽은 연결 찾기 ──
  // 화면을 켜 둔 채 가만히 기다리는 동안(규칙 설명 등) 와이파이·LTE 전환이나 공유기 사정으로
  // 실시간 연결이 끊겼는데도 SDK 는 "연결됨"으로 알고 있는 경우가 있습니다. 이때는 위의 감지가 하나도 안 걸려서
  // 진행자가 다음으로 넘겨도 휴대폰 화면이 그대로 멈춰 있게 됩니다.
  // 그래서 PROBE_EVERY_MS 마다, 그리고 참가자가 화면을 누를 때, 아무도 구독하지 않는 작은 문서(rooms/ping)를
  // 서버에서 직접 읽어 봅니다. PROBE_TIMEOUT_MS 안에 답이 없으면 연결을 새로 맺습니다.
  // 비용: 휴대폰 한 대에 1분 3번 읽기 (50명이 1시간이면 약 9천 번, 무료 한도 하루 5만 번).
  const PROBE_EVERY_MS = 20000, PROBE_TIMEOUT_MS = 5000, TAP_GAP_MS = 4000;
  let probing = false, lastProbe = 0;
  const pingRef = F.doc(db, "rooms", "ping");
  async function probe(why) {
    if (probing || busy || document.hidden || !navigator.onLine) return;
    probing = true; lastProbe = Date.now();
    let timer;
    try {
      await Promise.race([
        F.getDocFromServer(pingRef),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), PROBE_TIMEOUT_MS); }),
      ]);
    } catch (e) {
      console.warn("probe", why, e?.message || e);
      probing = false; clearTimeout(timer);
      reconnect("probe:" + why);
      return;
    }
    clearTimeout(timer); probing = false;
  }
  setInterval(() => { if (Date.now() - lastProbe >= PROBE_EVERY_MS - 500) probe("timer"); }, PROBE_EVERY_MS);
  // 화면이 안 넘어가서 참가자가 화면을 톡 누르면 바로 확인
  addEventListener("pointerdown", () => { if (Date.now() - lastProbe > TAP_GAP_MS) probe("tap"); }, { passive: true });
  return { onConn: cb => { subs.push(cb); cb(online); } };
}

// Firestore Timestamp, 숫자, null 을 모두 밀리초로
export function ms(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return null;
}
