// 추천 계산의 핵심. 화면(DOM)과 전역 상태 없이 동작해서 브라우저(window.Recommend)와 Node(require) 양쪽에서 쓴다.
// 테스트(tests/)가 이 파일만 불러 점수를 검사하므로, 숫자가 바뀌는 수정은 테스트로 먼저 확인한다
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Recommend = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 우리 세부 장르·특징 키 -> Steam 태그. 데이터의 rules.steamBridge가 있으면 그쪽을 쓰고, 없을 때만 이 기본값
  const DEFAULT_BRIDGE = {
    's:jrpg': 'JRPG', 's:turnbased': 'Turn-Based Combat', 's:actionrpg': 'Action RPG', 's:srpg': 'Strategy RPG',
    's:soulslike': 'Souls-like', 's:metroidvania': 'Metroidvania', 's:openworld': 'Open World', 's:stylish': 'Hack and Slash',
    't:explore': 'Exploration', 't:story': 'Story Rich', 't:combat': 'Combat', 't:strategy': 'Tactical', 't:growth': 'RPG',
    't:collect': 'Crafting', 't:survival': 'Survival', 't:horror': 'Horror', 't:puzzle': 'Puzzle', 't:coop': 'Co-op',
    't:roguelike': 'Roguelike', 't:simulation': 'Simulation', 't:racing': 'Racing', 't:sports': 'Sports', 't:emotional': 'Emotional',
    't:mystery': 'Mystery', 't:family': 'Family Friendly', 't:shooter': 'Shooter', 't:stealth': 'Stealth', 't:music': 'Great Soundtrack'
  };

  const MIN_SCORE = 40;   // 이보다 낮으면 "취향과 거리가 먼 게임"으로 따로 접는다

  // 특성 무게: Steam 태그(세기 곱, 20개라 합치면 가장 큰 신호) > 세부 장르 > 장르 > 특징 태그 > 제작사 > 플레이 방식 > 등급 표기
  // Steam 사용자 태그는 실제 플레이어가 붙인 것이라 가장 믿을 만하다 (Steam 라이브러리 추천과 같은 방식).
  // Steam 태그가 있으면 설명문 키워드(t:)는 광고 문구라 0.5로 낮추고,
  // 없으면(스토어 밖 게임·직접 추가·Steam에 없는 게임) 세부 장르·특징을 steamBridge로 옮겨 kb(0.8)로 같은 공간에 놓는다
  const W = { k: 1.1, kb: 0.8, s: 1.2, g: 1.0, t: 0.8, tSteam: 0.5, d: 0.4, p: 0.3, m: 0.4, c: 0.2 };

  // 이유로 내세우기엔 정보가 없는 흔한 Steam 태그
  const REASON_SKIP = new Set(['k:Singleplayer', 'k:Multiplayer', 'k:2D', 'k:3D', 'k:Indie', 'k:Controller', 'k:Third Person',
    'k:First-Person', 'k:Free to Play', 'k:Early Access', 'k:Action', 'k:Adventure', 'k:Casual']);
  // 이유에 이름을 댈 특성: 등급 표기·제작사·퍼블리셔는 "닮았다"의 근거로 쓰지 않는다
  const nameable = (k) => !/^[cpd]:/.test(k) && !REASON_SKIP.has(k);

  // Steam 태그가 실제로 있는 게임인지 (없으면 다리 놓은 추정 태그를 쓴다)
  const steamTagsOf = (g) => (g.steamTags && typeof g.steamTags === 'object' && Object.keys(g.steamTags).length ? g.steamTags : null);

  function dot(a, b) {
    let d = 0;
    const [small, big] = Object.keys(a.v).length < Object.keys(b.v).length ? [a, b] : [b, a];
    for (const k in small.v) if (big.v[k]) d += small.v[k] * big.v[k];
    return d;
  }
  const cos = (a, b) => dot(a, b) / (a.len * b.len);

  // 점수: 1위를 100으로 맞춘 상대 점수 (원점수 Map -> 0..100 정수 Map)
  function normalize(raw) {
    let max = 0;
    raw.forEach((s) => { if (s > max) max = s; });
    const out = new Map();
    raw.forEach((s, id) => out.set(id, max > 0 ? Math.round((100 * s) / max) : 0));
    return out;
  }

  // 추천순일 때 MIN_SCORE 미만은 "거리가 먼 게임"으로 접는다. 순서는 그대로 둔다
  function fold(list, scores, min = MIN_SCORE) {
    return { near: list.filter((g) => scores.get(g.id) >= min), far: list.filter((g) => scores.get(g.id) < min) };
  }

  // Steam 태그를 먼저, 같은 이름(JRPG 태그와 JRPG 세부 장르)은 한 번만. 이름은 화면 쪽 label 함수가 정한다
  function topLabels(keys, weightOf, label, n = 3) {
    const rank = (k) => (k.startsWith('k:') ? 0 : 1);
    const out = []; const seen = new Set();
    for (const k of [...keys].sort((x, y) => rank(x) - rank(y) || weightOf(y) - weightOf(x))) {
      const l = label(k); const same = l.replace(/ 플레이$/, '');   // "협동"과 "협동 플레이"도 같은 것으로
      if (seen.has(same)) continue;
      seen.add(same); out.push(l);
      if (out.length >= n) break;
    }
    return out;
  }

  // games: 게임패스 게임 목록, rules: 데이터의 rules (steamBridge만 쓴다)
  function create({ games = [], rules = null } = {}) {
    const byId = new Map(games.map((g) => [g.id, g]));
    const idf = new Map(); const vec = new Map();
    const bridge = () => (rules && rules.steamBridge) || DEFAULT_BRIDGE;

    function featureKeys(g) {
      const f = {};
      const steam = steamTagsOf(g);
      if (steam) {
        for (const [k, w] of Object.entries(steam)) { const n = Number(w) || 0; if (n > 0) f['k:' + k] = W.k * n; }
      } else {
        // Steam 태그가 없으면 세부 장르·특징을 Steam 태그 이름으로 옮겨 같은 비교 공간에 둔다
        const B = bridge();
        const put = (key, w) => { const name = B[key]; if (name) f['k:' + name] = Math.max(f['k:' + name] || 0, W.kb * w); };
        (g.styles || []).forEach((x) => put('s:' + x, 1));
        for (const [k, w] of Object.entries(g.tagW || {})) put('t:' + k, w);
      }
      (g.styles || []).forEach((x) => { f['s:' + x] = W.s; });
      (g.genres || []).forEach((x) => { f['g:' + x] = W.g; });
      for (const [k, w] of Object.entries(g.tagW || {})) f['t:' + k] = (steam ? W.tSteam : W.t) * w;
      (g.modes || []).forEach((x) => { f['m:' + x] = W.m; });
      ((g.content && g.content.flags) || []).forEach((x) => { f['c:' + x] = W.c; });
      if (g.developer) f['d:' + g.developer] = W.d;
      if (g.publisher && g.publisher !== g.developer) f['p:' + g.publisher] = W.p;
      return f;
    }

    // 흔한 특성(예: 전투는 400개 게임)일수록 덜 중요하게: IDF. 게임패스 밖 게임의 새 특성은 가장 드문 것으로 본다
    const idfOf = (k) => idf.get(k) ?? Math.log(1 + games.length);

    function makeVec(raw, keep) {
      const v = {};
      let sq = 0;
      for (const k in raw) {
        if (keep && !keep.includes(k)) continue;
        v[k] = raw[k] * idfOf(k); sq += v[k] * v[k];
      }
      return { v, len: Math.sqrt(sq) || 1 };
    }

    // IDF와 게임 벡터는 만들 때 한 번만 계산한다
    const raws = games.map((g) => [g.id, featureKeys(g)]);
    const df = new Map();
    raws.forEach(([, f]) => Object.keys(f).forEach((k) => df.set(k, (df.get(k) || 0) + 1)));
    df.forEach((c, k) => idf.set(k, Math.log(1 + games.length / c)));
    raws.forEach(([id, f]) => vec.set(id, makeVec(f)));

    // 기준 게임 벡터: "좋았던 점"을 골랐으면 그 특성만 남긴다 (예: 닌자 가이덴 4는 전투만)
    const anchorVec = (g, a) => makeVec(featureKeys(g), a && a.aspects && a.aspects.length ? a.aspects : null);

    // taste: { anchors: id -> {kind, aspects}, keywords: 특성 키 -> 1|-1, external: id -> 게임패스 밖 게임 }
    function profile({ anchors = {}, keywords = {}, external = {} } = {}) {
      const gameOf = (id) => byId.get(id) || external[id];
      const p = { v: {}, len: 0 };
      const likes = []; const dislikes = [];
      for (const [id, a] of Object.entries(anchors)) {
        const g = gameOf(id);
        if (!g) continue;
        const av = anchorVec(g, a);
        (a.kind === 'like' ? likes : dislikes).push({ id, vec: av });
        const w = a.kind === 'like' ? 1 : -0.8;
        for (const k in av.v) p.v[k] = (p.v[k] || 0) + (av.v[k] / av.len) * w;
      }
      // 요소 칩은 우리 키(s:, t:)와 그에 해당하는 Steam 태그(k:)를 함께 올린다
      const B = bridge();
      for (const [k, val] of Object.entries(keywords)) {
        const keys = B[k] ? [k, 'k:' + B[k]] : [k];
        for (const kk of keys) p.v[kk] = (p.v[kk] || 0) + (val > 0 ? 0.6 : -0.6) * idfOf(kk) / 2;
      }
      let sq = 0;
      for (const k in p.v) sq += p.v[k] * p.v[k];
      p.len = Math.sqrt(sq) || 1;
      return { p, likes, dislikes, empty: sq === 0 };
    }
    const asProfile = (x) => (x && x.p && x.likes ? x : profile(x));

    // 점수 = 취향 평균과의 유사도(0.55) + 가장 닮은 좋아한 게임과의 유사도(0.45) - 별로였던 게임과 닮은 만큼
    // 평균만 쓰면 "진 여신전생 + 레이싱"처럼 결이 다른 취향이 섞여 흐려지므로 최대 유사도를 섞는다
    function rawScore(prof, gv) {
      const base = cos(prof.p, gv);
      let bestLike = 0;
      for (const l of prof.likes) bestLike = Math.max(bestLike, cos(l.vec, gv));
      let worstDis = 0;
      for (const d of prof.dislikes) worstDis = Math.max(worstDis, cos(d.vec, gv));
      const s = 0.55 * base + 0.45 * bestLike - 0.5 * Math.max(0, worstDis - 0.2);
      return Math.max(0, s);
    }

    // list 안에서 1위를 100으로 맞춘 점수 Map. 취향이 비었으면 null (점수를 계산하지 않는다)
    function score(list, tasteOrProfile) {
      const prof = asProfile(tasteOrProfile);
      if (prof.empty) return null;
      const raw = new Map();
      list.forEach((g) => raw.set(g.id, rawScore(prof, vec.get(g.id))));
      return normalize(raw);
    }

    // 추천 이유의 재료 (문장은 화면 쪽에서 만든다). label: 특성 키 -> 표시 이름
    // similar: 가장 닮은 좋아한 게임과 겹치는 내용, liked: similar가 없을 때 좋아하는 요소,
    // disliked: 별로라고 한 요소, dislikedLike: 많이 닮은 별로였던 게임 id, nearest: 가장 닮은 좋아한 게임과 유사도
    function explain(g, tasteOrProfile, label) {
      const prof = asProfile(tasteOrProfile);
      const out = { similar: null, liked: [], disliked: [], dislikedLike: null, nearest: null };
      const gv = vec.get(g.id);
      if (prof.empty || !gv) return out;
      let best = null;
      for (const l of prof.likes) {
        const s = cos(l.vec, gv);
        if (!best || s > best.s) best = { ...l, s };
      }
      if (best) out.nearest = { id: best.id, s: best.s };
      if (best && best.s > 0.2) {
        // 닮았다고 말하려면 장르·태그 같은 내용이 실제로 겹쳐야 한다 (퍼블리셔만 같으면 말하지 않는다)
        const shared = Object.keys(gv.v).filter((k) => best.vec.v[k] && nameable(k));
        if (shared.length) out.similar = { id: best.id, s: best.s, labels: topLabels(shared, (k) => gv.v[k] * best.vec.v[k], label) };
      }
      const pos = Object.keys(gv.v).filter((k) => prof.p.v[k] > 0 && nameable(k));
      if (pos.length && !out.similar) out.liked = topLabels(pos, (k) => prof.p.v[k] * gv.v[k], label);
      const neg = Object.keys(gv.v).filter((k) => prof.p.v[k] < 0 && !k.startsWith('c:'));
      if (neg.length) out.disliked = topLabels(neg, (k) => -prof.p.v[k] * gv.v[k], label, 2);
      for (const d of prof.dislikes) {
        if (cos(d.vec, gv) > 0.5) { out.dislikedLike = d.id; break; }
      }
      return out;
    }

    return {
      games, byId, idf, vec, bridge, featureKeys, idfOf, makeVec, anchorVec, profile, rawScore, score, explain,
      vecOf: (id) => vec.get(id)
    };
  }

  return { create, W, DEFAULT_BRIDGE, MIN_SCORE, REASON_SKIP, nameable, steamTagsOf, cos, dot, normalize, fold, topLabels };
});
