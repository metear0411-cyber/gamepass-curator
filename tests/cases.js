// 추천 엔진 회귀 테스트 사례. Node(tests/recommend.test.mjs)와 브라우저(tests/run.html)가 같은 사례를 쓴다.
// 다른 파일에 기대지 않아서, 브라우저 콘솔에 그대로 붙여 넣어도 돌아간다
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RecommendCases = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // t: { ok(조건, 메시지), equal(실제, 기대, 메시지) } — Node는 node:assert로, 브라우저는 작은 대체 구현으로 넘긴다
  function build(Recommend, fixture, t) {
    const games = fixture.games;
    const E = Recommend.create({ games, rules: fixture.rules });
    const MIN = Recommend.MIN_SCORE;
    const title = (id) => (games.find((g) => g.id === id) || {}).title || id;

    // 앱의 추천 탭처럼: 기준으로 고른 게임은 빼고 점수를 매긴다
    function rank(taste, engine = E) {
      const anchors = taste.anchors || {};
      const list = games.filter((g) => !anchors[g.id]);
      const scores = engine.score(list, taste);
      const order = scores ? [...list].sort((a, b) => scores.get(b.id) - scores.get(a.id)).map((g) => g.id) : [];
      return { scores, order, s: (id) => scores.get(id) };
    }
    const like = (aspects = null) => ({ kind: 'like', aspects });
    const dislike = () => ({ kind: 'dislike', aspects: null });
    const show = (r, ids) => ids.map((id) => `${title(id)}=${r.s(id)}`).join(', ');

    const JRPGS = ['jrpg1', 'jrpg2', 'jrpg3', 'jrpgSteam'];

    return [
      ['좋았던 점을 전투·스타일리시로 고르면 순수 액션 게임이 스토리 JRPG보다 위', () => {
        const aspects = ['t:combat', 's:stylish'];
        const av = E.anchorVec(games.find((g) => g.id === 'ninja'), like(aspects));
        t.ok(Object.keys(av.v).sort().join() === [...aspects].sort().join(), `기준 벡터에는 고른 특성만 남아야 함 (${Object.keys(av.v).join(',')})`);
        const r = rank({ anchors: { ninja: like(aspects) } });
        t.ok(r.s('slash') > r.s('jrpg1'), `액션이 JRPG보다 높아야 함 (${show(r, ['slash', 'jrpg1'])})`);
        t.equal(r.order[0], 'slash', `1위는 강철 베기여야 함 (순서: ${r.order.join(',')})`);
      }],

      ['JRPG·턴제 게임을 좋아하면 다른 JRPG가 레이싱보다 위', () => {
        const r = rank({ anchors: { jrpg1: like() } });
        const race = Math.max(r.s('race1'), r.s('race2'));
        for (const id of ['jrpg2', 'jrpg3', 'jrpgSteam']) {
          t.ok(r.s(id) > race, `${title(id)}가 레이싱보다 높아야 함 (${show(r, [id, 'race1', 'race2'])})`);
        }
        t.ok(r.order.slice(0, 3).every((id) => JRPGS.includes(id)), `상위 3개는 JRPG여야 함 (순서: ${r.order.join(',')})`);
      }],

      ['결이 다른 두 취향(JRPG + 레이싱)은 최대 유사도 덕분에 둘 다 스포츠보다 위', () => {
        const r = rank({ anchors: { jrpg1: like(), race1: like() } });
        t.ok(r.s('jrpg2') > r.s('sport'), `JRPG가 스포츠보다 높아야 함 (${show(r, ['jrpg2', 'sport'])})`);
        t.ok(r.s('race2') > r.s('sport'), `레이싱이 스포츠보다 높아야 함 (${show(r, ['race2', 'sport'])})`);
        t.ok(r.s('jrpg2') >= MIN && r.s('race2') >= MIN, `둘 다 MIN_SCORE(${MIN}) 이상이어야 함 (${show(r, ['jrpg2', 'race2'])})`);
        // JRPG 셋 + 레이싱 하나처럼 한쪽으로 쏠려도, 평균만 쓰면 묻히는 레이싱이 최대 유사도 덕분에 접히지 않는다
        const r2 = rank({ anchors: { jrpg1: like(), jrpg2: like(), jrpgSteam: like(), race1: like() } });
        t.ok(r2.s('race2') >= MIN, `쏠린 취향에서도 레이싱이 ${MIN} 이상이어야 함 (${show(r2, ['race2', 'sport'])})`);
      }],

      ['별로였던 게임과 거의 같은 게임은 MIN_SCORE 아래, 좋아한 쪽 게임보다 아래', () => {
        const r = rank({ anchors: { race1: like(), horror1: dislike() } });
        t.ok(r.s('horror2') < MIN, `검은 저택 2는 ${MIN} 미만이어야 함 (${show(r, ['horror2'])})`);
        t.ok(r.s('horror2') < r.s('race2'), `검은 저택 2가 서킷 마스터보다 낮아야 함 (${show(r, ['horror2', 'race2'])})`);
        const folded = Recommend.fold(games.filter((g) => r.scores.has(g.id)), r.scores, MIN);
        t.ok(folded.far.some((g) => g.id === 'horror2'), '접힌 목록(far)에 검은 저택 2가 있어야 함');
        t.ok(folded.near.some((g) => g.id === 'race2'), '보이는 목록(near)에 서킷 마스터가 있어야 함');
      }],

      ['Steam 태그 없는 밖 게임도 steamBridge로 Steam 태그만 있는 게임과 이어진다', () => {
        const ext = { id: 'ext:legend', external: true, title: '밖의 JRPG', genres: [], styles: ['jrpg', 'turnbased'],
          tagW: { story: 1 }, modes: [], content: { flags: [] } };
        const keys = E.featureKeys(ext);
        t.ok(keys['k:JRPG'] > 0 && keys['k:Turn-Based Combat'] > 0 && keys['k:Story Rich'] > 0, '세부 장르·특징이 Steam 태그(k:)로 옮겨져야 함');
        const taste = { anchors: { 'ext:legend': like() }, external: { 'ext:legend': ext } };
        const r = rank(taste);
        t.ok(r.s('jrpgSteam') >= MIN, `Steam 태그만 있는 JRPG가 ${MIN} 이상이어야 함 (${show(r, ['jrpgSteam'])})`);
        t.ok(r.s('jrpgSteam') > Math.max(r.s('race1'), r.s('sport')), `레이싱·스포츠보다 높아야 함 (${show(r, ['jrpgSteam', 'race1', 'sport'])})`);
        // 다리를 끊으면 겹치는 특성이 없어 0점이 된다 = 위 점수는 다리 덕분
        const noBridge = Recommend.create({ games, rules: { steamBridge: {} } });
        const r2 = rank(taste, noBridge);
        t.equal(r2.s('jrpgSteam'), 0, `다리가 없으면 0점이어야 함 (${show(r2, ['jrpgSteam'])})`);
      }],

      ['요소 칩 s:jrpg 하나만 골라도 JRPG가 먼저 나온다', () => {
        const r = rank({ keywords: { 's:jrpg': 1 } });
        const top = r.order.slice(0, JRPGS.length);
        t.ok(top.every((id) => JRPGS.includes(id)), `상위 ${JRPGS.length}개가 모두 JRPG여야 함 (순서: ${r.order.join(',')})`);
        t.ok(r.s(r.order[JRPGS.length]) < MIN, `JRPG가 아닌 게임은 ${MIN} 미만이어야 함 (${show(r, [r.order[JRPGS.length]])})`);
      }],

      ['퍼블리셔·개발사·등급 표기만 겹치면 "비슷해요" 이유를 만들지 않는다', () => {
        const ext = { id: 'ext:z', external: true, title: '같은 회사 슈터', genres: ['Shooter'], styles: [], tagW: { shooter: 1 },
          steamTags: { FPS: 1 }, modes: [], content: { flags: ['gambling', 'language'] }, publisher: 'Pub Z', developer: 'Dev Z' };
        const taste = { anchors: { 'ext:z': like(['d:Dev Z', 'p:Pub Z', 'c:gambling', 'c:language']) }, external: { 'ext:z': ext } };
        const prof = E.profile(taste);
        const label = (k) => k;
        const x = E.explain(games.find((g) => g.id === 'cards'), prof, label);
        t.ok(x.nearest && x.nearest.s > 0.2, `유사도 자체는 기준(0.2)을 넘어야 의미 있는 검사 (${x.nearest && x.nearest.s.toFixed(3)})`);
        t.equal(x.similar, null, '회사·등급만 같으면 similar가 없어야 함');
        t.equal(x.liked.length, 0, '회사·등급은 "좋아하는 요소"로도 이름을 대지 않아야 함');
        for (const g of games) t.equal(E.explain(g, prof, label).similar, null, `${g.title}: similar가 없어야 함`);
        // 내용이 실제로 겹치면 이유가 나오고, 그 이름에 회사·등급은 섞이지 않는다
        const y = E.explain(games.find((g) => g.id === 'jrpg2'), E.profile({ anchors: { jrpg1: like() } }), label);
        t.ok(y.similar && y.similar.id === 'jrpg1', '푸른 왕관은 별의 노래와 비슷하다고 해야 함');
        t.ok(y.similar.labels.every((k) => !/^[cpd]:/.test(k)), `이유에 회사·등급이 없어야 함 (${y.similar.labels.join(',')})`);
      }],

      ['점수는 1위가 100, 모두 0..100 정수', () => {
        const tastes = [
          { anchors: { ninja: like(['t:combat', 's:stylish']) } },
          { anchors: { jrpg1: like(), race1: like() } },
          { anchors: { race1: like(), horror1: dislike() } },
          { keywords: { 's:jrpg': 1, 't:horror': -1 } }
        ];
        for (const taste of tastes) {
          const { scores } = rank(taste);
          const vals = [...scores.values()];
          t.equal(Math.max(...vals), 100, '1위는 100이어야 함');
          t.ok(vals.every((v) => Number.isInteger(v) && v >= 0 && v <= 100), `모두 0..100 정수여야 함 (${vals.join(',')})`);
        }
        t.equal(E.score(games, {}), null, '취향이 비었으면 점수를 계산하지 않아야 함(null)');
        const n = Recommend.normalize(new Map([['a', 0.5], ['b', 0.25], ['c', 0]]));
        t.ok(n.get('a') === 100 && n.get('b') === 50 && n.get('c') === 0, 'normalize: 최댓값 기준 비율로 반올림');
        t.equal(Recommend.normalize(new Map([['a', 0]])).get('a'), 0, 'normalize: 모두 0이면 0');
      }],

      ['다양성 재정렬: 위 12개에 같은 시리즈는 2개까지, 게임은 빠짐없이, 점수는 그대로', () => {
        const all = [...games, ...(fixture.seriesGames || [])];
        const E2 = Recommend.create({ games: all, rules: fixture.rules });
        const list = all.filter((g) => g.id !== 'jrpg1');
        const scores = E2.score(list, { anchors: { jrpg1: like() } });
        const before = new Map(scores);
        const byScore = [...list].sort((a, b) => scores.get(b.id) - scores.get(a.id));
        const series = Recommend.seriesGroups(all);
        const fqIn = (arr) => arr.slice(0, 12).filter((g) => series.get(g.id) === 'finalquest').length;
        // 점수순만으로는 시리즈가 위를 채워야 이 검사가 의미 있다
        t.ok(fqIn(byScore) > 2, `점수순 위 12개에 FINAL QUEST가 3개 이상이어야 의미 있는 검사 (${fqIn(byScore)}개)`);
        const out = E2.diversify(byScore, scores);
        const perSeries = {};
        out.slice(0, 12).forEach((g) => { const k = series.get(g.id); perSeries[k] = (perSeries[k] || 0) + 1; });
        t.ok(Object.values(perSeries).every((n) => n <= 2), `위 12개에 같은 시리즈가 2개를 넘으면 안 됨 (${JSON.stringify(perSeries)})`);
        t.equal(out.length, list.length, '재정렬 뒤에도 게임 수가 같아야 함');
        t.equal(new Set(out.map((g) => g.id)).size, list.length, '모든 게임이 한 번씩 있어야 함');
        t.equal(out[0].id, byScore[0].id, '1위(지금 해 볼 1순위)는 점수 1위 그대로여야 함');
        t.ok([...before].every(([id, s]) => scores.get(id) === s), '점수 Map은 바뀌지 않아야 함');
        t.ok(byScore.map((g) => g.id).join() !== out.map((g) => g.id).join(), '순서는 실제로 바뀌어야 함');
      }],

      ['다양성을 끄면 순서가 점수순 그대로', () => {
        const all = [...games, ...(fixture.seriesGames || [])];
        const off = Recommend.create({ games: all, rules: fixture.rules, diversity: false });
        const list = all.filter((g) => g.id !== 'jrpg1');
        const scores = off.score(list, { anchors: { jrpg1: like() } });
        const byScore = [...list].sort((a, b) => scores.get(b.id) - scores.get(a.id));
        t.equal(off.diversify(byScore, scores).map((g) => g.id).join(), byScore.map((g) => g.id).join(), '엔진 옵션 diversity:false');
        const on = Recommend.create({ games: all, rules: fixture.rules });
        t.equal(on.diversify(byScore, scores, { diversity: false }).map((g) => g.id).join(), byScore.map((g) => g.id).join(), '호출 옵션 diversity:false');
        t.equal(on.diversify(byScore, null).length, byScore.length, '점수가 없으면(취향 없음) 그대로');
      }],

      ['시리즈 키: 번호·로마 숫자·부제를 뗀 제목', () => {
        const k = Recommend.seriesKey;
        t.equal(k('FINAL FANTASY IV'), 'finalfantasy', 'FINAL FANTASY IV');
        t.equal(k('FINAL FANTASY IV'), k('FINAL FANTASY VI'), 'FF IV와 FF VI는 같은 키');
        t.equal(k('FINAL FANTASY'), 'finalfantasy', '번호 없는 첫 편도 같은 키');
        t.equal(k('Persona 3 Reload'), 'persona', 'Persona 3 Reload');
        t.equal(k('Persona 3 Reload'), k('Persona 5 Royal'), '페르소나 3 리로드와 5 로열은 같은 키');
        t.equal(k('Ni no Kuni II: Revenant Kingdom PRINCE’S EDITION'), 'ninokuni', '부제(:) 뒤를 뗀다');
        t.equal(k('성검전설3 TRIALS of MANA'), '성검전설', '붙여 쓴 번호도 뗀다');
        t.equal(k('Tears of Metal (게임 미리보기)'), 'tearsofmetal', '괄호를 뗀다');
        t.ok(k('Forza Horizon 5') !== '' && k('Forza Motorsport') !== '', '키가 비지 않아야 함');
        // 개발사·퍼블리셔가 같고 키 앞부분이 겹치면 한 시리즈, 회사가 다르면 따로
        const g = Recommend.seriesGroups([
          { id: 'a', title: '성검전설3 TRIALS of MANA', developer: 'SE', publisher: 'SE' },
          { id: 'b', title: '성검전설 Visions of Mana', developer: 'SE', publisher: 'SE' },
          { id: 'c', title: '성검전설 Visions of Mana', developer: 'Other', publisher: 'SE' }
        ]);
        t.equal(g.get('a'), g.get('b'), '같은 회사의 성검전설 두 편은 한 시리즈');
        t.ok(g.get('c') !== g.get('a'), '회사가 다르면 제목 키로만 묶는다');
      }]
    ];
  }

  // 사례를 모두 돌려 [{ name, ok, error }]를 돌려준다. 한 사례가 실패해도 나머지는 계속한다
  function run(Recommend, fixture, t) {
    return build(Recommend, fixture, t).map(([name, fn]) => {
      try { fn(); return { name, ok: true }; } catch (e) { return { name, ok: false, error: (e && e.message) || String(e) }; }
    });
  }

  // node:assert가 없는 곳(브라우저)에서 쓰는 최소한의 검사 함수
  const simpleAssert = {
    ok(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓'); },
    equal(actual, expected, msg) { if (actual !== expected) throw new Error(`${msg || '값이 다름'} (실제: ${actual}, 기대: ${expected})`); }
  };

  return { build, run, simpleAssert };
});
