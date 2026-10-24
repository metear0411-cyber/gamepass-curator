'use strict';

// ---------- 라벨 ----------

const GENRES = {
  'Action & adventure': '액션·어드벤처', 'Role playing': 'RPG', 'Shooter': '슈팅', 'Simulation': '시뮬레이션',
  'Strategy': '전략', 'Family & kids': '가족', 'Platformer': '플랫포머', 'Sports': '스포츠', 'Other': '기타',
  'Racing & flying': '레이싱·비행', 'Puzzle & trivia': '퍼즐', 'Fighting': '격투', 'Classics': '고전',
  'Card & board': '카드·보드', 'Multi-player Online Battle Arena': 'MOBA', 'Music': '음악'
};
const TAGS = {
  explore: '탐험', story: '스토리', combat: '전투', strategy: '전략·전술', growth: '육성·성장', collect: '수집·제작',
  survival: '생존', horror: '공포', puzzle: '퍼즐', coop: '협동', roguelike: '로그라이크', simulation: '경영·시뮬',
  racing: '레이싱', sports: '스포츠', emotional: '감성·여운', mystery: '신비·미스터리', family: '가족',
  shooter: '슈팅', stealth: '잠입', music: '음악'
};
const MODES = { single: '싱글', coop: '협동', multi: '멀티' };
const CONTENT = {
  blood: '유혈', gore: '잔혹', violence: '강한 폭력', sexual: '선정성', nudity: '노출', horror: '공포',
  language: '욕설', drugs: '약물·음주', gambling: '도박 요소'
};
const FAMILY_BLOCK = ['blood', 'gore', 'violence', 'sexual', 'nudity'];
const WARN_FLAGS = ['blood', 'gore', 'violence', 'sexual', 'nudity', 'horror'];
const INSTALL = {
  accessible: ['폴더 접근 가능 (MSIXVC)', '게임 파일에 접근할 수 있어 파일 교체형 한글패치가 될 가능성이 있어요.'],
  launcher: ['외부 런처 설치 (EA·Ubisoft 등)', '일반 PC판과 같은 폴더 구조라 패치가 될 가능성이 있어요 (추정).'],
  protected: ['암호화 설치 (EAppx)', '파일이 암호화돼 있어 파일 교체형 한글패치는 사실상 안 돼요.'],
  uwp: ['UWP 설치 (Appx)', '보호된 폴더에 설치돼 한글패치 적용이 어려워요.'],
  console: ['콘솔 전용', 'PC 게임패스에 없는 게임이에요.'],
  unknown: ['미확인', '설치 형식 정보가 없어요.']
};
const STATUS = { wish: '관심', playing: '플레이 중', done: '완료', dropped: '포기' };
const STORE_KEY = 'gpc-state-v1';
const PAGE = 60;

// ---------- 상태 ----------

const S = {
  data: null, games: [], byId: new Map(), vec: new Map(), idf: new Map(),
  anchors: {},     // id -> 'like' | 'dislike'
  keywords: {},    // tag -> 1 | -1
  status: {},      // id -> wish | playing | done | dropped
  f: defaultFilters(),
  tab: 'rec', shown: PAGE
};

function defaultFilters() {
  return { plan: 'all', platform: 'any', korean: 'playable', family: false, nohorror: false,
           modes: [], genres: [], leaving: false, fresh: false, hidedone: true, sort: 'score' };
}

// 브라우저 저장소는 막혀 있을 수 있어(사생활 보호 모드 등) 항상 try로 감싼다
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    S.anchors = s.anchors || {}; S.keywords = s.keywords || {}; S.status = s.status || {};
    S.f = Object.assign(defaultFilters(), s.f || {});
  } catch (e) { /* 저장소 없이도 동작 */ }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ anchors: S.anchors, keywords: S.keywords, status: S.status, f: S.f })); }
  catch (e) { /* 무시 */ }
}

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const img = (url, w) => (url ? `${url}?w=${w}` : '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- 추천 ----------

// 게임 특성 벡터: 장르 > 키워드 태그 > 플레이 방식·내용·퍼블리셔 순으로 가중치를 주고,
// 흔한 특성(예: 전투)일수록 IDF로 덜 중요하게 본다
function rawFeatures(g) {
  const f = {};
  g.genres.forEach((x) => { f['g:' + x] = 1.0; });
  g.tags.forEach((x) => { f['t:' + x] = 0.8; });
  g.modes.forEach((x) => { f['m:' + x] = 0.4; });
  g.content.flags.forEach((x) => { f['c:' + x] = 0.3; });
  if (g.publisher) f['p:' + g.publisher] = 0.3;
  return f;
}

function buildVectors() {
  const raws = S.games.map((g) => [g.id, rawFeatures(g)]);
  const df = new Map();
  raws.forEach(([, f]) => Object.keys(f).forEach((k) => df.set(k, (df.get(k) || 0) + 1)));
  const n = S.games.length;
  df.forEach((c, k) => S.idf.set(k, Math.log(1 + n / c)));
  raws.forEach(([id, f]) => {
    const v = {};
    let sq = 0;
    for (const k in f) { v[k] = f[k] * S.idf.get(k); sq += v[k] * v[k]; }
    S.vec.set(id, { v, len: Math.sqrt(sq) || 1 });
  });
}

function buildProfile() {
  const p = {};
  const add = (k, w) => { p[k] = (p[k] || 0) + w; };
  for (const [id, kind] of Object.entries(S.anchors)) {
    const g = S.vec.get(id);
    if (!g) continue;
    const w = kind === 'like' ? 1 : -0.8;
    for (const k in g.v) add(k, (g.v[k] / g.len) * w);
  }
  for (const [tag, val] of Object.entries(S.keywords)) {
    const k = 't:' + tag;
    add(k, (val > 0 ? 0.9 : -0.9) * (S.idf.get(k) || 1) / 2);
  }
  let sq = 0;
  for (const k in p) sq += p[k] * p[k];
  return { p, len: Math.sqrt(sq), empty: sq === 0 };
}

function cosine(prof, gv) {
  let dot = 0;
  for (const k in gv.v) if (prof.p[k]) dot += prof.p[k] * gv.v[k];
  return dot / (prof.len * gv.len);
}

function simGames(a, b) {
  let dot = 0;
  for (const k in a.v) if (b.v[k]) dot += a.v[k] * b.v[k];
  return dot / (a.len * b.len);
}

function featureLabel(k) {
  const [type, val] = [k.slice(0, 1), k.slice(2)];
  if (type === 'g') return GENRES[val] || val;
  if (type === 't') return TAGS[val] || val;
  if (type === 'm') return MODES[val] + ' 플레이';
  if (type === 'c') return CONTENT[val];
  if (type === 'p') return val;
  return val;
}

// 추천 이유: 점수에 가장 크게 기여한 특성 + 가장 닮은 좋아한 게임 + 주의할 점
function reasonsFor(g, prof) {
  const out = [];
  const gv = S.vec.get(g.id);
  if (!prof.empty) {
    let best = null;
    for (const [id, kind] of Object.entries(S.anchors)) {
      if (kind !== 'like' || id === g.id) continue;
      const a = S.vec.get(id);
      if (!a) continue;
      const s = simGames(a, gv);
      if (!best || s > best.s) best = { id, s, a };
    }
    if (best && best.s > 0.25) {
      const common = Object.keys(gv.v).filter((k) => best.a.v[k] && !k.startsWith('c:'))
        .sort((x, y) => gv.v[y] * best.a.v[y] - gv.v[x] * best.a.v[x]).slice(0, 3).map(featureLabel);
      out.push({ cls: '', text: `좋아한 「${S.byId.get(best.id).title}」와 비슷해요${common.length ? ` (${common.join('·')})` : ''}` });
    }
    const pos = Object.keys(gv.v).filter((k) => prof.p[k] > 0 && !k.startsWith('c:') && !k.startsWith('p:'))
      .sort((x, y) => prof.p[y] * gv.v[y] - prof.p[x] * gv.v[x]).slice(0, 3);
    if (pos.length && out.length === 0) out.push({ cls: '', text: `좋아하는 요소: ${pos.map(featureLabel).join('·')}` });
    const neg = Object.keys(gv.v).filter((k) => prof.p[k] < 0).sort((x, y) => prof.p[x] * gv.v[x] - prof.p[y] * gv.v[y]).slice(0, 2);
    if (neg.length) out.push({ cls: 'neg', text: `별로라고 한 요소도 있어요: ${neg.map(featureLabel).join('·')}` });
    for (const [id, kind] of Object.entries(S.anchors)) {
      if (kind !== 'dislike') continue;
      const a = S.vec.get(id);
      if (a && simGames(a, gv) > 0.5) { out.push({ cls: 'neg', text: `별로였던 「${S.byId.get(id).title}」와 닮은 점이 많아요` }); break; }
    }
  }
  const warn = g.content.flags.filter((x) => WARN_FLAGS.includes(x));
  if (warn.length) out.push({ cls: 'warn', text: `주의: ${warn.map((x) => CONTENT[x]).join('·')} (등급 기관 기준)` });
  if (g.leavingSoon) out.push({ cls: 'warn', text: '곧 게임패스에서 빠져요' });
  if (g.korean.status === 'patch') out.push({ cls: 'warn', text: '한국어는 유저 한글패치로 (검색 추정, 근거 확인 필요)' });
  return out;
}

// ---------- 필터 ----------

function planOk(g) {
  const { plan, platform } = S.f;
  const has = (arr) => (platform === 'any' ? arr.length > 0 : arr.includes(platform));
  const p = g.plans;
  if (plan === 'naver' || plan === 'pcgp') return p.pcgp && platform !== 'console';
  if (plan === 'ultimate') return has(p.ultimate);
  if (plan === 'premium') return has(p.premium);
  if (plan === 'essential') return has(p.essential);
  return has([...p.ultimate, ...p.premium, ...p.essential, ...(p.pcgp ? ['pc'] : [])]);
}

// 한글패치는 PC판 파일을 고칠 수 있을 때만 "한국어로 할 수 있음"으로 본다
function koreanPlayable(g) {
  const k = g.korean.status;
  if (k === 'official' || k === 'official_likely') return true;
  if (k === 'patch') return ['accessible', 'launcher', 'unknown'].includes(g.install.class) && S.f.platform !== 'console';
  return false;
}

function koreanOk(g) {
  if (S.f.korean === 'official') return g.korean.status === 'official';
  if (S.f.korean === 'playable') return koreanPlayable(g);
  return true;
}

function familyHidden(g) {
  if (S.f.family && g.content.flags.some((x) => FAMILY_BLOCK.includes(x))) return true;
  if (S.f.nohorror && (g.content.flags.includes('horror') || g.tags.includes('horror'))) return true;
  return false;
}

function passes(g) {
  if (!planOk(g) || !koreanOk(g)) return false;
  if (S.f.modes.length && !S.f.modes.some((m) => g.modes.includes(m))) return false;
  if (S.f.genres.length && !S.f.genres.some((x) => g.genres.includes(x))) return false;
  if (S.f.leaving && !g.leavingSoon) return false;
  if (S.f.fresh && !g.recentlyAdded) return false;
  return true;
}

// ---------- 그리기 ----------

function koreanBadge(g) {
  const k = g.korean.status;
  const ic = g.install.class;
  if (k === 'official') return ['good', '한국어'];
  if (k === 'official_likely') return ['info', '공식 한국어?'];
  if (k === 'patch') {
    if (ic === 'protected' || ic === 'uwp') return ['warn', '한글패치 · 게임패스판 불가 추정'];
    if (ic === 'console') return ['warn', '한글패치 · PC 전용'];
    return ['info', '한글패치 · 게임패스판 가능성'];
  }
  if (k === 'patch_blocked') return ['bad', '한글패치 게임패스판 불가'];
  if (k === 'planned') return ['warn', '한국어 추가 예정'];
  if (k === 'none' || k === 'none_found') return ['', '한국어 없음'];
  return ['', '한국어 미확인'];
}

function planBadge(g) {
  const p = g.plans;
  if (p.essential.length) return 'Essential부터';
  if (p.premium.length) return 'Premium부터';
  if (p.pcgp) return 'PC Game Pass부터';
  return 'Ultimate 전용';
}

function cardHtml(g, score, reasons) {
  const [kc, kt] = koreanBadge(g);
  const st = S.status[g.id];
  const an = S.anchors[g.id];
  const badges = [
    `<span class="badge ${kc}">${esc(kt)}</span>`,
    g.naverPlus ? '<span class="badge good">네이버플러스</span>' : '',
    `<span class="badge">${planBadge(g)}</span>`,
    g.leavingSoon ? '<span class="badge bad">곧 종료</span>' : '',
    g.recentlyAdded ? '<span class="badge info">최근 추가</span>' : '',
    g.genres.slice(0, 2).map((x) => `<span class="badge">${esc(GENRES[x] || x)}</span>`).join('')
  ].join('');
  const scoreHtml = score == null ? (g.rating ? `<div class="score"><b>${g.rating.toFixed(1)}</b><small>스토어 평점</small></div>` : '')
    : `<div class="score"><b>${score}</b><small>추천 점수</small></div>`;
  return `<article class="card">
    <img class="poster" loading="lazy" src="${esc(img(g.poster, 184))}" alt="" data-open="${g.id}">
    <div>
      <div class="head"><h3 data-open="${g.id}">${esc(g.title)}</h3>${scoreHtml}</div>
      <div class="badges">${badges}</div>
      <ul class="reasons">${reasons.slice(0, 4).map((r) => `<li class="${r.cls}">${esc(r.text)}</li>`).join('')}</ul>
      <div class="status">
        <button class="anchor-btn like ${an === 'like' ? 'on' : ''}" data-act="anchor" data-val="like" data-id="${g.id}" title="취향 기준 게임으로 추가">좋아요</button>
        <button class="anchor-btn dislike ${an === 'dislike' ? 'on' : ''}" data-act="anchor" data-val="dislike" data-id="${g.id}">별로예요</button>
        ${Object.entries(STATUS).map(([k, v]) => `<button class="${st === k ? 'on' : ''}" data-act="status" data-val="${k}" data-id="${g.id}">${v}</button>`).join('')}
      </div>
    </div>
  </article>`;
}

function render() {
  const prof = buildProfile();
  let list;
  let hiddenFamily = 0;
  if (S.tab === 'mine') {
    const order = Object.keys(STATUS);
    list = S.games.filter((g) => S.status[g.id]).sort((a, b) => order.indexOf(S.status[a.id]) - order.indexOf(S.status[b.id]));
  } else {
    list = S.games.filter((g) => {
      if (S.anchors[g.id]) return false;  // 기준으로 고른 게임은 이미 아는 게임
      if (S.f.hidedone && ['done', 'dropped'].includes(S.status[g.id])) return false;
      if (!passes(g)) return false;
      if (familyHidden(g)) { hiddenFamily++; return false; }
      return true;
    });
  }

  // 점수: 취향이 있으면 코사인 유사도를 최고점=100으로 맞추고, 없으면 평점·평가 수로 정렬
  const scores = new Map();
  if (!prof.empty) {
    let max = 0;
    list.forEach((g) => { const s = cosine(prof, S.vec.get(g.id)); scores.set(g.id, s); if (s > max) max = s; });
    if (max > 0) scores.forEach((s, id) => scores.set(id, Math.max(0, Math.round((100 * s) / max))));
  }
  const pop = (g) => (g.rating || 0) * Math.log10(10 + (g.ratingCount || 0));
  const sorters = {
    score: (a, b) => (prof.empty ? pop(b) - pop(a) : (scores.get(b.id) - scores.get(a.id)) || pop(b) - pop(a)),
    rating: (a, b) => pop(b) - pop(a),
    new: (a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)),
    title: (a, b) => a.title.localeCompare(b.title, 'ko')
  };
  if (S.tab === 'rec') list.sort(sorters[S.f.sort] || sorters.score);

  const grid = $('#grid');
  const shown = list.slice(0, S.shown);
  grid.innerHTML = shown.length
    ? shown.map((g) => cardHtml(g, prof.empty ? null : scores.get(g.id) ?? null, reasonsFor(g, prof))).join('')
    : `<div class="empty">${S.tab === 'mine' ? '아직 표시한 게임이 없어요. 카드의 관심·플레이 중·완료·포기 버튼으로 관리해 보세요.' : '조건에 맞는 게임이 없어요. 필터를 조금 풀어 보세요.'}</div>`;
  $('#more').hidden = list.length <= S.shown;

  const parts = [`${list.length}개 게임`];
  if (S.tab === 'rec') {
    parts.push(prof.empty ? '취향을 정하면 추천 점수가 계산돼요 (지금은 스토어 평점순)' : '내 취향 기준 추천');
    if (hiddenFamily) parts.push(`아이 옆 모드로 ${hiddenFamily}개 숨김`);
  }
  $('#summary').textContent = parts.join(' · ');
  $('#mine-count').textContent = Object.keys(S.status).length ? `(${Object.keys(S.status).length})` : '';
  renderTaste();
  saveState();
}

function renderTaste() {
  $('#t-anchors').innerHTML = Object.entries(S.anchors).map(([id, kind]) => {
    const g = S.byId.get(id);
    if (!g) return '';
    return `<span class="anchor ${kind}"><img src="${esc(img(g.poster, 52))}" alt="">${kind === 'like' ? '좋아요' : '별로'} · ${esc(g.title)}<button data-remove="${id}" aria-label="${esc(g.title)} 빼기">×</button></span>`;
  }).join('');
  $('#t-keywords').innerHTML = Object.entries(TAGS).map(([k, v]) => {
    const val = S.keywords[k];
    return `<button type="button" class="chip ${val > 0 ? 'like' : val < 0 ? 'dislike' : ''}" data-kw="${k}">${v}</button>`;
  }).join('');
}

function renderFilterChips() {
  const genreCount = {};
  S.games.forEach((g) => g.genres.forEach((x) => { genreCount[x] = (genreCount[x] || 0) + 1; }));
  $('#f-genres').innerHTML = Object.keys(genreCount).sort((a, b) => genreCount[b] - genreCount[a])
    .map((x) => `<button type="button" class="chip ${S.f.genres.includes(x) ? 'on' : ''}" data-genre="${esc(x)}">${esc(GENRES[x] || x)}</button>`).join('');
  $('#f-modes').innerHTML = Object.entries(MODES)
    .map(([k, v]) => `<button type="button" class="chip ${S.f.modes.includes(k) ? 'on' : ''}" data-mode="${k}">${v}</button>`).join('');
}

function syncFilterInputs() {
  $('#f-plan').value = S.f.plan; $('#f-platform').value = S.f.platform; $('#f-korean').value = S.f.korean;
  $('#f-family').checked = S.f.family; $('#f-nohorror').checked = S.f.nohorror;
  $('#f-leaving').checked = S.f.leaving; $('#f-new').checked = S.f.fresh; $('#f-hidedone').checked = S.f.hidedone;
  $('#f-sort').value = S.f.sort;
  renderFilterChips();
}

// ---------- 상세 ----------

function openDetail(id) {
  const g = S.byId.get(id);
  if (!g) return;
  const k = g.korean;
  const src = k.source === 'store' ? '스토어 표기' : k.source === 'override' ? (k.verified ? '사람이 확인함' : '수동 입력') : `네이버 검색 기반 추정${k.checkedAt ? `, ${k.checkedAt} 확인` : ''}`;
  const [il, idesc] = INSTALL[g.install.class] || INSTALL.unknown;
  const plans = [];
  if (g.plans.ultimate.length) plans.push(`Ultimate (${g.plans.ultimate.map((x) => (x === 'pc' ? 'PC' : '콘솔')).join('·')})`);
  if (g.plans.premium.length) plans.push(`Premium (${g.plans.premium.map((x) => (x === 'pc' ? 'PC' : '콘솔')).join('·')})`);
  if (g.plans.essential.length) plans.push(`Essential (${g.plans.essential.map((x) => (x === 'pc' ? 'PC' : '콘솔')).join('·')})`);
  if (g.plans.pcgp) plans.push('PC Game Pass');
  const flags = g.content.flags.map((x) => CONTENT[x]);
  const repo = repoUrl();
  const issue = repo ? `${repo}/issues/new?template=korean-patch.yml&title=${encodeURIComponent('[한글패치] ' + g.title)}` : '';
  $('#d-body').innerHTML = `
    ${g.hero ? `<img class="d-hero" src="${esc(img(g.hero, 720))}" alt="">` : ''}
    <div class="d-content">
      <h2 id="d-title">${esc(g.title)}</h2>
      <p class="d-meta">${esc([g.publisher, g.developer !== g.publisher ? g.developer : '', g.releaseDate ? g.releaseDate + ' 출시' : '', g.content.grac ? 'GRAC ' + g.content.grac.replace('GRB:', '') : ''].filter(Boolean).join(' · '))}</p>
      <p class="d-desc">${esc(g.description)} <span class="src">스토어 설명</span></p>
      <table class="d-table">
        <tr><th>한국어</th><td>${esc(k.label)}<span class="src">${esc(src)}</span>${k.link ? ` · <a href="${esc(k.link)}" target="_blank" rel="noopener">근거 글</a>` : ''}${k.note ? `<br>${esc(k.note)}` : ''}</td></tr>
        <tr><th>게임패스판 설치</th><td>${esc(il)}${g.install.officialMods ? ' · 공식 모드 지원' : ''}<br><span class="muted">${esc(idesc)}</span></td></tr>
        <tr><th>요금제</th><td>${esc(plans.join(', ') || '없음')}${g.naverPlus ? ' · <b>네이버플러스 멤버십으로 가능</b>' : ' · 네이버플러스로는 불가'}</td></tr>
        <tr><th>장르</th><td>${esc(g.genres.map((x) => GENRES[x] || x).join(', ') || '미확인')}</td></tr>
        <tr><th>특징</th><td>${esc(g.tags.map((x) => TAGS[x]).join(', ') || '미확인')}<span class="src">설명문 키워드 기반 추정</span></td></tr>
        <tr><th>플레이 방식</th><td>${esc(g.modes.map((x) => MODES[x]).join(', ') || '미확인')}</td></tr>
        <tr><th>주의 요소</th><td>${esc(flags.join(', ') || '등급 기관 표기 없음')}<span class="src">ESRB·PEGI·GRAC 내용 기술자</span></td></tr>
        <tr><th>스토어 평점</th><td>${g.rating ? `${g.rating.toFixed(1)} / 5 (${g.ratingCount.toLocaleString('ko-KR')}명)` : '미확인'}</td></tr>
        <tr><th>메인 플레이타임</th><td>미확인<span class="src">아직 수집하지 않는 정보예요</span></td></tr>
      </table>
      <div class="d-links">
        <a href="https://www.xbox.com/ko-KR/games/store/_/${encodeURIComponent(g.id)}" target="_blank" rel="noopener">Xbox 스토어에서 보기</a>
        ${issue ? `<a href="${esc(issue)}" target="_blank" rel="noopener">한글패치 정보 제보·수정</a>` : ''}
      </div>
    </div>`;
  $('#detail').showModal();
}

// GitHub Pages(owner.github.io/repo)에서 열리면 저장소 주소를 알아낸다
function repoUrl() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return '';
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return repo ? `https://github.com/${m[1]}/${repo}` : '';
}

// ---------- 취향 조작 ----------

function setAnchor(id, kind) {
  if (S.anchors[id] === kind) delete S.anchors[id]; else S.anchors[id] = kind;
  S.shown = PAGE; render();
}

function findByTitle(re) {
  return S.games.find((g) => re.test(g.title));
}

// 프로젝트를 만든 사람의 취향 예시: 진 여신전생 V·위쳐 3·페르소나 3 리로드·닌자 가이덴 4를 좋아하고
// 페르소나 5 로열의 긴 일상 파트는 루즈했음. 게임패스에 있는 게임만 기준으로 들어간다
function loadExample() {
  const likes = [/여신전생|megami tensei/i, /위쳐|witcher/i, /페르소나\s*3|persona\s*3/i, /닌자\s*가이덴\s*4|ninja gaiden 4/i, /메타포|metaphor/i];
  const dislikes = [/페르소나\s*5|persona\s*5/i];
  S.anchors = {}; S.keywords = { explore: 1, story: 1, combat: 1, growth: 1, collect: 1, mystery: 1, emotional: 1, music: 1 };
  const found = [];
  likes.forEach((re) => { const g = findByTitle(re); if (g) { S.anchors[g.id] = 'like'; found.push(g.title); } });
  dislikes.forEach((re) => { const g = findByTitle(re); if (g) { S.anchors[g.id] = 'dislike'; found.push(g.title + '(별로)'); } });
  S.f.family = true;
  syncFilterInputs(); S.shown = PAGE; render();
  toast(found.length ? `예시 취향: ${found.join(', ')} + 탐험·스토리·전투·육성·여운` : '예시 취향 요소를 불러왔어요 (기준 게임은 지금 게임패스에 없어요)');
}

function shareLink() {
  const payload = JSON.stringify({ a: S.anchors, k: S.keywords });
  const b64 = btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = `${location.origin}${location.pathname}#t=${b64}`;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
    () => toast('취향 링크를 복사했어요'),
    () => { prompt('이 링크를 복사하세요', url); }
  );
}

function importFromHash() {
  const m = location.hash.match(/^#t=([\w-]+)/);
  if (!m) return;
  try {
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
    const t = JSON.parse(json);
    S.anchors = t.a || {}; S.keywords = t.k || {};
    toast('링크의 취향을 불러왔어요');
  } catch (e) { toast('취향 링크를 읽지 못했어요'); }
  history.replaceState(null, '', location.pathname);
}

// ---------- 검색 ----------

let suggestions = [];
function updateSuggest() {
  const q = norm($('#t-search').value);
  const box = $('#t-suggest');
  if (!q) { box.hidden = true; return; }
  suggestions = S.games.filter((g) => norm(g.title).includes(q)).slice(0, 8);
  box.innerHTML = suggestions.length ? suggestions.map((g, i) => `<li data-i="${i}">
      <img src="${esc(img(g.poster, 64))}" alt=""><span class="s-title">${esc(g.title)}</span>
      <span class="s-btns"><button data-sug="like" data-id="${g.id}">좋아요</button><button data-sug="dislike" data-id="${g.id}">별로예요</button></span>
    </li>`).join('') : '<li><span class="s-title muted">게임패스에 없는 게임이에요. 아래 요소로 취향을 표현해 주세요.</span></li>';
  box.hidden = false;
}

// ---------- 이벤트 ----------

function bind() {
  const onFilter = (key, prop = 'value') => (e) => { S.f[key] = e.target[prop]; S.shown = PAGE; render(); };
  $('#f-plan').addEventListener('change', onFilter('plan'));
  $('#f-platform').addEventListener('change', onFilter('platform'));
  $('#f-korean').addEventListener('change', onFilter('korean'));
  $('#f-family').addEventListener('change', onFilter('family', 'checked'));
  $('#f-nohorror').addEventListener('change', onFilter('nohorror', 'checked'));
  $('#f-leaving').addEventListener('change', onFilter('leaving', 'checked'));
  $('#f-new').addEventListener('change', onFilter('fresh', 'checked'));
  $('#f-hidedone').addEventListener('change', onFilter('hidedone', 'checked'));
  $('#f-sort').addEventListener('change', onFilter('sort'));
  $('#f-reset').addEventListener('click', () => { S.f = defaultFilters(); syncFilterInputs(); S.shown = PAGE; render(); });

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  $('#f-genres').addEventListener('click', (e) => {
    const b = e.target.closest('[data-genre]'); if (!b) return;
    S.f.genres = toggleIn(S.f.genres, b.dataset.genre); renderFilterChips(); S.shown = PAGE; render();
  });
  $('#f-modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    S.f.modes = toggleIn(S.f.modes, b.dataset.mode); renderFilterChips(); S.shown = PAGE; render();
  });

  // 요소 칩: 없음 -> 좋아요 -> 별로예요 -> 없음
  $('#t-keywords').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kw]'); if (!b) return;
    const k = b.dataset.kw; const v = S.keywords[k];
    if (!v) S.keywords[k] = 1; else if (v > 0) S.keywords[k] = -1; else delete S.keywords[k];
    S.shown = PAGE; render();
  });
  $('#t-anchors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    delete S.anchors[b.dataset.remove]; render();
  });

  $('#t-search').addEventListener('input', updateSuggest);
  $('#t-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && suggestions[0]) { setAnchor(suggestions[0].id, 'like'); $('#t-search').value = ''; updateSuggest(); }
    if (e.key === 'Escape') { $('#t-search').value = ''; updateSuggest(); }
  });
  $('#t-suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sug]'); if (!b) return;
    S.anchors[b.dataset.id] = b.dataset.sug; $('#t-search').value = ''; updateSuggest(); S.shown = PAGE; render();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) $('#t-suggest').hidden = true; });

  $('#t-example').addEventListener('click', loadExample);
  $('#t-share').addEventListener('click', shareLink);
  $('#t-clear').addEventListener('click', () => { S.anchors = {}; S.keywords = {}; S.shown = PAGE; render(); });

  $('#grid').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { openDetail(open.dataset.open); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { id, val } = b.dataset;
    if (b.dataset.act === 'anchor') { setAnchor(id, val); return; }
    if (S.status[id] === val) delete S.status[id]; else S.status[id] = val;
    render();
  });
  $('#more').addEventListener('click', () => { S.shown += PAGE; render(); });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    S.tab = t.dataset.tab; S.shown = PAGE; render();
  }));

  // 좁은 화면에서는 필터를 접어서 시작
  if (window.matchMedia('(max-width: 900px)').matches) $('#filter-box').open = false;
}

// ---------- 시작 ----------

async function main() {
  loadState();
  importFromHash();
  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    S.data = await res.json();
  } catch (e) {
    $('#grid').innerHTML = '<div class="empty">게임 데이터를 불러오지 못했어요. 로컬에서 열었다면 scripts/serve.ps1로 서버를 띄워 주세요.</div>';
    return;
  }
  S.games = S.data.games;
  S.games.forEach((g) => S.byId.set(g.id, g));
  // 데이터가 갱신되며 사라진 게임은 취향·상태에서 뺀다
  for (const id of Object.keys(S.anchors)) if (!S.byId.has(id)) delete S.anchors[id];
  $('#data-date').textContent = `데이터 기준 ${S.data.generatedAt.slice(0, 10)} · ${S.games.length}개 게임`;
  const repo = repoUrl();
  if (repo) $('#repo-link').href = repo; else $('#repo-link').hidden = true;
  buildVectors();
  syncFilterInputs();
  bind();
  render();
}

main();
