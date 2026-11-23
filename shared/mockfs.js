// 로컬 모의 Firestore. Firebase 설정이 없거나 주소에 ?mock=1 이 있으면 이걸 씁니다.
// 같은 브라우저의 여러 탭이 localStorage + storage 이벤트로 상태를 공유합니다.
// 지원 함수: doc, collection, query, where, orderBy, limit, getDoc, getDocs,
//            setDoc(merge), updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp, increment
// 게임 모듈은 ctx.fs 에 있는 이 함수들만 쓰면 Firebase에서도 그대로 동작합니다.

const KEY = "mockfs:v1";
const listeners = new Set();

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all));
  notify();
}
function notify() { for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error(e); } } }
window.addEventListener("storage", e => { if (e.key === KEY) notify(); });

const SERVER_TS = { __op: "serverTimestamp" };
const INC = n => ({ __op: "increment", n });

function resolveOps(prev, data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && v.__op === "serverTimestamp") out[k] = Date.now();
    else if (v && typeof v === "object" && v.__op === "increment") out[k] = ((prev && prev[k]) || 0) + v.n;
    else out[k] = v;
  }
  return out;
}

export function getMockDb() { return { __mock: true }; }

export function doc(base, ...segs) {
  const path = (base.path ? [base.path, ...segs] : segs).join("/");
  const parts = path.split("/");
  return { type: "doc", path, id: parts[parts.length - 1] };
}
export function collection(base, ...segs) {
  const path = (base.path ? [base.path, ...segs] : segs).join("/");
  return { type: "collection", path, id: path.split("/").pop() };
}
export function where(field, op, value) { return { kind: "where", field, op, value }; }
export function orderBy(field, dir = "asc") { return { kind: "orderBy", field, dir }; }
export function limit(n) { return { kind: "limit", n }; }
export function query(col, ...cons) { return { type: "query", path: col.path, cons }; }
export function serverTimestamp() { return SERVER_TS; }
export function increment(n) { return INC(n); }

function docSnap(path, all) {
  const data = all[path];
  return { id: path.split("/").pop(), ref: doc({}, path), exists: () => data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
}
function runQuery(q, all) {
  const depth = q.path.split("/").length + 1;
  let rows = Object.keys(all)
    .filter(p => p.startsWith(q.path + "/") && p.split("/").length === depth)
    .map(p => docSnap(p, all));
  for (const c of q.cons || []) {
    if (c.kind === "where") {
      rows = rows.filter(r => {
        const v = r.data()[c.field];
        switch (c.op) {
          case "==": return v === c.value;
          case "!=": return v !== c.value;
          case ">": return v > c.value;
          case ">=": return v >= c.value;
          case "<": return v < c.value;
          case "<=": return v <= c.value;
          case "in": return c.value.includes(v);
          default: throw new Error("mockfs: unsupported op " + c.op);
        }
      });
    }
  }
  for (const c of [...(q.cons || [])].reverse()) {
    if (c.kind === "orderBy") {
      const s = c.dir === "desc" ? -1 : 1;
      rows.sort((a, b) => { const x = a.data()[c.field], y = b.data()[c.field]; return x < y ? -s : x > y ? s : 0; });
    }
  }
  const lim = (q.cons || []).find(c => c.kind === "limit");
  if (lim) rows = rows.slice(0, lim.n);
  return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: fn => rows.forEach(fn) };
}

export async function getDoc(ref) { return docSnap(ref.path, readAll()); }
export async function getDocs(q) { return runQuery(q.type === "collection" ? { path: q.path, cons: [] } : q, readAll()); }

function applySet(all, ref, data, opts) {
  const prev = all[ref.path];
  const resolved = resolveOps(prev, data);
  all[ref.path] = opts && opts.merge ? { ...(prev || {}), ...resolved } : resolved;
}
function applyUpdate(all, ref, data) {
  if (all[ref.path] === undefined) throw new Error("mockfs: no document to update: " + ref.path);
  all[ref.path] = { ...all[ref.path], ...resolveOps(all[ref.path], data) };
}
export async function setDoc(ref, data, opts) { const all = readAll(); applySet(all, ref, data, opts); writeAll(all); }
export async function updateDoc(ref, data) { const all = readAll(); applyUpdate(all, ref, data); writeAll(all); }
export async function deleteDoc(ref) { const all = readAll(); delete all[ref.path]; writeAll(all); }

export function writeBatch() {
  const ops = [];
  const b = {
    set(ref, data, opts) { ops.push(all => applySet(all, ref, data, opts)); return b; },
    update(ref, data) { ops.push(all => applyUpdate(all, ref, data)); return b; },
    delete(ref) { ops.push(all => { delete all[ref.path]; }); return b; },
    async commit() { const all = readAll(); ops.forEach(op => op(all)); writeAll(all); },
  };
  return b;
}

export function onSnapshot(target, onNext, onError) {
  let last = null;
  const fire = () => {
    try {
      const all = readAll();
      const snap = target.type === "doc" ? docSnap(target.path, all)
        : runQuery(target.type === "collection" ? { path: target.path, cons: [] } : target, all);
      const sig = JSON.stringify(target.type === "doc" ? snap.data() ?? null : snap.docs.map(d => [d.id, d.data()]));
      if (sig === last) return;
      last = sig;
      onNext(snap);
    } catch (e) { if (onError) onError(e); else console.error(e); }
  };
  listeners.add(fire);
  queueMicrotask(fire);
  return () => listeners.delete(fire);
}

// 모의 DB 전체 비우기 (리허설용)
export function resetMock() { localStorage.removeItem(KEY); notify(); }
