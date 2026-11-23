// 유사도 계산 (운영자 화면 전용). data/vec.bin: 단어마다 300개의 int8 (words.json 순서), 약 6MB.
// 정답을 정하면 모든 단어와의 코사인 유사도를 한 번 계산해 순위표를 만들어 둡니다.
import { loadWords, norm, RANK_CUTOFF } from "./common.js";

const DIM = 300;
let engineP = null;

export function loadEngine() {
  if (engineP) return engineP;
  engineP = (async () => {
    const [words, buf] = await Promise.all([
      loadWords(),
      fetch(new URL("./data/vec.bin", import.meta.url)).then(r => { if (!r.ok) throw new Error("단어 벡터를 받지 못했어요"); return r.arrayBuffer(); }),
    ]);
    const n = words.length;
    const q = new Int8Array(buf);
    if (q.length !== n * DIM) throw new Error("단어 벡터 크기가 맞지 않아요");
    const inv = new Float32Array(n); // 1 / 벡터 길이
    for (let i = 0; i < n; i++) {
      let ss = 0; const o = i * DIM;
      for (let k = 0; k < DIM; k++) ss += q[o + k] * q[o + k];
      inv[i] = ss ? 1 / Math.sqrt(ss) : 0;
    }
    const index = new Map(words.map((w, i) => [w, i]));
    const cache = new Map();

    // 정답 하나에 대한 표: lookup(word) → {w, s, r} 또는 null(모르는 단어)
    function table(answer) {
      const a = index.get(norm(answer));
      if (a == null) return null;
      if (cache.has(a)) return cache.get(a);
      const sim = new Float32Array(n); const ao = a * DIM;
      for (let i = 0; i < n; i++) {
        let d = 0; const o = i * DIM;
        for (let k = 0; k < DIM; k++) d += q[o + k] * q[ao + k];
        sim[i] = d * inv[i] * inv[a];
      }
      const order = Array.from({ length: n }, (_, i) => i).filter(i => i !== a).sort((x, y) => sim[y] - sim[x]);
      const rank = new Int32Array(n).fill(-1);
      order.forEach((i, k) => { rank[i] = k + 1; });
      rank[a] = 0;
      const t = {
        answer: words[a],
        lookup(word) {
          const i = index.get(norm(word));
          if (i == null) return null;
          const r = rank[i];
          return { w: words[i], s: i === a ? 100 : Math.round(sim[i] * 10000) / 100, r: r <= RANK_CUTOFF ? r : null };
        },
        top(k) { return order.slice(0, k).map(i => ({ w: words[i], s: Math.round(sim[i] * 10000) / 100, r: rank[i] })); },
        at(r) { const i = order[r - 1]; return i == null ? null : { w: words[i], s: Math.round(sim[i] * 10000) / 100, r }; },
      };
      cache.set(a, t);
      return t;
    }
    return { words, has: w => index.has(norm(w)), table };
  })();
  engineP.catch(() => { engineP = null; });
  return engineP;
}

// 정답 추천 (미리보기로 가까운 단어가 자연스러운 것만 골랐음)
export const SUGGEST = ["선물", "회식", "연말", "커피", "월급", "케이크", "출근", "사랑", "달력", "치킨",
  "소주", "붕어빵", "비행기", "주식", "로또", "생일", "우산", "바다", "반도체", "겨울", "산타", "다이어트"];
