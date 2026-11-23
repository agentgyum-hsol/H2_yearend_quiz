// DB 연결. config.js 에 Firebase 설정이 있으면 Firestore + 익명 로그인,
// 없거나 주소에 ?mock=1 이 있으면 로컬 모의 DB를 씁니다.
import { firebaseConfig } from "../config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2";
const FS_FUNCS = ["doc", "collection", "query", "where", "orderBy", "limit", "getDoc", "getDocs",
  "setDoc", "updateDoc", "deleteDoc", "onSnapshot", "writeBatch", "serverTimestamp", "increment"];

export function isMock() {
  return new URLSearchParams(location.search).has("mock") || !firebaseConfig.projectId;
}

// 반환: { db, fs, uid, mock }
// fs 는 위 FS_FUNCS 함수 모음. writeBatch 는 fs.writeBatch(db) 로 호출합니다.
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
    return { db: m.getMockDb(), fs, uid, mock: true };
  }
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const fsMod = await import(`${FB}/firebase-firestore.js`);
  const { getAuth, signInAnonymously } = await import(`${FB}/firebase-auth.js`);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  const db = fsMod.getFirestore(app);
  const fs = Object.fromEntries(FS_FUNCS.map(k => [k, fsMod[k]]));
  return { db, fs, uid: cred.user.uid, mock: false };
}

// Firestore Timestamp, 숫자, null 을 모두 밀리초로
export function ms(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return null;
}
