// 유사도 계산 (운영자 화면 전용). data/vec.bin: 단어마다 300개의 int8 (words.json 순서), 약 17MB.
// 정답을 정하면 모든 단어와의 코사인 유사도를 한 번 계산해 순위표를 만들어 둡니다.
// 순위는 기본 명사(core) 안에서만 셉니다. 나머지 단어(동사·형용사·합성어 등)는 받아 주되,
// 기본 명사 사이 어디쯤 들어가는지로 순위를 매깁니다. 그래서 힌트와 "가까운 단어"는 늘 자연스러운 명사입니다.
import { loadWords, norm, resolve, RANK_CUTOFF, TOP_SIM_MIN } from "./common.js";

const DIM = 300;
let engineP = null;

export function loadEngine() {
  if (engineP) return engineP;
  engineP = (async () => {
    const [{ core, words }, buf] = await Promise.all([
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
    const has = w => index.has(w);
    const cache = new Map();

    // 정답 하나에 대한 표: lookup(word) → {w, s, r} 또는 null(모르는 단어)
    function table(answer) {
      const a = index.get(norm(answer));
      if (a == null) return null;
      if (cache.has(a)) return cache.get(a);
      const ao = a * DIM;
      const cosTo = (vec, vinv) => { let d = 0; for (let k = 0; k < DIM; k++) d += vec[k] * q[ao + k]; return d * vinv * inv[a]; };
      const sim = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let d = 0; const o = i * DIM;
        for (let k = 0; k < DIM; k++) d += q[o + k] * q[ao + k];
        sim[i] = d * inv[i] * inv[a];
      }
      const order = [];
      for (let i = 0; i < core; i++) if (i !== a) order.push(i);
      order.sort((x, y) => sim[y] - sim[x]);
      const sorted = Float32Array.from(order, i => sim[i]); // 내림차순
      const rank = new Int32Array(core).fill(-1);
      order.forEach((i, k) => { rank[i] = k + 1; });
      // 기본 명사 밖 단어의 순위: 나보다 가까운 기본 명사 수 + 1
      const rankOf = s => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] > s) lo = m + 1; else hi = m; } return lo + 1; };
      // 1위 유사도가 TOP_SIM_MIN보다 낮으면 모두 같은 비율로 올림 (순서는 그대로, 최대 99.99)
      const boost = sorted[0] > 0 && sorted[0] < TOP_SIM_MIN ? TOP_SIM_MIN / sorted[0] : 1;
      const show = x => Math.min(9999, Math.round(x * boost * 10000)) / 100;
      const out = (w, x, r) => ({ w, s: show(x), r: r <= RANK_CUTOFF ? r : null });
      const t = {
        answer: words[a],
        lookup(word) {
          const hit = resolve(word, has);
          if (!hit) return null;
          const i = index.get(hit.w);
          if (i === a) return { w: words[a], s: 100, r: 0 };
          if (i != null) return out(words[i], sim[i], i < core ? rank[i] : rankOf(sim[i]));
          // 합성어: 두 단어 벡터(길이 1로 맞춤)의 합
          const [p1, p2] = hit.parts.map(p => index.get(p));
          const v = new Float32Array(DIM); let ss = 0;
          for (let k = 0; k < DIM; k++) { v[k] = q[p1 * DIM + k] * inv[p1] + q[p2 * DIM + k] * inv[p2]; ss += v[k] * v[k]; }
          const s = cosTo(v, ss ? 1 / Math.sqrt(ss) : 0);
          return out(hit.w, s, rankOf(s));
        },
        top(k) { return order.slice(0, k).map(i => ({ w: words[i], s: show(sim[i]), r: rank[i] })); },
        at(r) { const i = order[r - 1]; return i == null ? null : { w: words[i], s: show(sim[i]), r }; },
      };
      cache.set(a, t);
      return t;
    }
    return { words, core, has: w => has(norm(w)), table };
  })();
  engineP.catch(() => { engineP = null; });
  return engineP;
}

// 정답 추천 (미리보기로 가까운 단어가 자연스러운 것만 골랐음)
export const SUGGEST = ["파스타", "치즈", "셰프", "레스토랑", "선물", "회식", "연말", "커피", "월급", "케이크", "출근", "사랑", "달력", "치킨",
  "소주", "붕어빵", "비행기", "주식", "로또", "생일", "우산", "바다", "반도체", "겨울", "산타", "다이어트"];

// 2026 송년회(오 리틀 이태리) 라운드 정답, AG 확정 2026-11-25. 소스를 훑어봐도 바로 보이지 않게 base64로만 감쌈.
export const PARTY_ANSWERS = () => new TextDecoder().decode(Uint8Array.from(atob("7J207YOc66asLOyZgOyduCzshqHrhYTtmow="), c => c.charCodeAt(0))).split(",");
