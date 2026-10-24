'use strict';

// ---------- 라벨 ----------

const GENRES = {
  'Action & adventure': '액션·어드벤처', 'Role playing': 'RPG', 'Shooter': '슈팅', 'Simulation': '시뮬레이션',
  'Strategy': '전략', 'Family & kids': '가족', 'Platformer': '플랫포머', 'Sports': '스포츠', 'Other': '기타',
  'Racing & flying': '레이싱·비행', 'Puzzle & trivia': '퍼즐', 'Fighting': '격투', 'Classics': '고전',
  'Card & board': '카드·보드', 'Multi-player Online Battle Arena': 'MOBA', 'Music': '음악'
};
const STYLES = {
  jrpg: 'JRPG', turnbased: '턴제', actionrpg: '액션 RPG', srpg: '전략 RPG', soulslike: '소울라이크',
  metroidvania: '메트로배니아', openworld: '오픈월드', stylish: '스타일리시 액션'
};
const TAGS = {
  explore: '탐험', story: '스토리', combat: '전투', strategy: '전략·전술', growth: '육성·성장', collect: '수집·제작',
  survival: '생존', horror: '공포', puzzle: '퍼즐', coop: '협동', roguelike: '로그라이크', simulation: '경영·시뮬',
  racing: '레이싱', sports: '스포츠', emotional: '감성·여운', mystery: '신비·미스터리', family: '가족',
  shooter: '슈팅', stealth: '잠입', music: '음악'
};
const MODES = { single: '싱글', coop: '협동', multi: '멀티' };
const CONTENT = {
  blood: '유혈', gore: '잔혹', violence: '강한 폭력', sexual: '선정적 표현', nudity: '노출', horror: '공포',
  language: '욕설', drugs: '약물·음주', gambling: '도박 요소'
};
const WARN_FLAGS = ['blood', 'gore', 'violence'];   // 카드에 주의로 띄우는 것은 이것뿐 (나머지는 상세에 기관 표기 그대로)
const INSTALL = {
  accessible: ['폴더 접근 가능 (MSIXVC)', '게임 파일에 접근할 수 있어 파일 교체형 한글패치가 될 가능성이 있어요.'],
  launcher: ['외부 런처 설치 (EA·Ubisoft 등)', '일반 PC판과 같은 폴더 구조라 패치가 될 가능성이 있어요 (추정).'],
  protected: ['암호화 설치 (EAppx)', '파일이 암호화돼 있어 파일 교체형 한글패치는 사실상 안 돼요.'],
  uwp: ['UWP 설치 (Appx)', '보호된 폴더에 설치돼 한글패치 적용이 어려워요.'],
  console: ['콘솔 전용', 'PC 게임패스에 없는 게임이에요.'],
  unknown: ['미확인', '설치 형식 정보가 없어요.']
};
const STATUS = { wish: '관심', playing: '플레이 중', done: '완료', dropped: '포기' };
// Xbox 앱의 "기능" 필터와 같은 항목
const FEATURES = {
  playAnywhere: 'Play Anywhere', cloudSaves: '클라우드 저장', seriesOptimized: 'Series X|S 최적화', '4k': '4K', hdr: 'HDR',
  '120fps': '120fps', raytracing: '레이 트레이싱', couch: '로컬 협동·분할화면', crossplay: '크로스플레이',
  controller: '컨트롤러 지원', onlineCoop: '온라인 협동', onlineMulti: '온라인 멀티',
  // 아래는 데이터의 다른 칸에서 만든다 (featsOf). 아이 옆에서 짧게 끊어 할 때 쓸모 있는 것들
  familyKids: '가족 및 어린이', cloud: '클라우드', cloudTouch: '터치로 클라우드 플레이', pause: '일시 중지 가능', handheld: '휴대용 (ROG Ally 등)'
};
// "짧게 끊어 하기": 이 Steam 태그 중 하나가 0.3 이상이면 한 판이 짧은 게임으로 본다
const QUICK_TAGS = ['Roguelike', 'Roguelite', 'Arcade', 'Racing', 'Puzzle', 'Sports', 'Fighting', 'Score Attack', 'Replay Value', 'Short', 'Casual', 'Party'];
const QUICK_LONG_STYLES = ['jrpg', 'openworld'];   // 플레이타임이 짧아도 한 번 앉으면 길어지는 세부 장르
const ALERT_KEY = 'gpc-alert-dismissed';
// 휴대용 PC 검증 결과 (스토어 영어 값 -> 한국어). 목록에 없는 값은 그대로 보여 준다
const HANDHELD = { verified: '검증됨', playable: '플레이 가능', unsupported: '미지원' };
const PARTNER = {
  ea: ['EA 앱 필요', 'EA 앱을 설치하고 EA 계정을 연결해야 해요'],
  ubisoft: ['Ubisoft 계정 연동', 'Ubisoft Connect 계정을 연결해야 해요']
};
const TIMES = ['any', '5', '10', '20', '40'];   // 플레이타임 필터: 메인 스토리 N시간 이하
// Steam 사용자 태그의 한국어 이름. 없는 태그는 영어 그대로 보여 준다
const STEAM_KO = {
  'Story Rich': '스토리 중심', 'Turn-Based Combat': '턴제 전투', 'Turn-Based': '턴제', 'Turn-Based Strategy': '턴제 전략',
  'Turn-Based Tactics': '턴제 전술', 'JRPG': 'JRPG', 'RPG': 'RPG', 'Action RPG': '액션 RPG', 'Party-Based RPG': '파티 RPG',
  'Strategy RPG': '전략 RPG', 'Tactical RPG': '전술 RPG', 'CRPG': 'CRPG', 'Action': '액션', 'Adventure': '어드벤처',
  'Action-Adventure': '액션 어드벤처', 'Hack and Slash': '핵앤슬래시', 'Character Action Game': '캐릭터 액션',
  "Beat 'em up": '벨트스크롤 액션', 'Souls-like': '소울라이크', 'Combat': '전투', 'Fast-Paced': '빠른 템포', 'Difficult': '높은 난이도',
  'Great Soundtrack': '좋은 음악', 'Atmospheric': '분위기', 'Beautiful': '아름다운 그래픽', 'Stylized': '개성 있는 그래픽',
  'Open World': '오픈월드', 'Exploration': '탐험', 'Choices Matter': '선택이 중요', 'Multiple Endings': '멀티 엔딩',
  'Character Customization': '캐릭터 커스터마이징', 'Dark Fantasy': '다크 판타지', 'Fantasy': '판타지', 'Magic': '마법',
  'Mythology': '신화', 'Demons': '악마', 'Supernatural': '초자연', 'Anime': '애니메이션풍', 'Time Management': '시간 관리',
  'Lore-Rich': '풍부한 세계관', 'Emotional': '감성', 'Mystery': '미스터리', 'Detective': '추리', 'Investigation': '수사',
  'Crime': '범죄', 'Funny': '유머', 'Comedy': '코미디', 'Dark': '어두운 분위기', 'Romance': '로맨스', 'Cinematic': '영화 같은 연출',
  'Singleplayer': '싱글플레이', 'Multiplayer': '멀티플레이', 'Co-op': '협동', 'Online Co-Op': '온라인 협동', 'Local Co-Op': '로컬 협동',
  'Split Screen': '분할 화면', 'PvP': 'PvP', 'Online PvP': '온라인 PvP', 'Third Person': '3인칭', 'First-Person': '1인칭',
  'FPS': 'FPS', 'Shooter': '슈팅', 'Third-Person Shooter': '3인칭 슈팅', 'Looter Shooter': '루터 슈터', 'Hero Shooter': '히어로 슈터',
  'Stealth': '잠입', 'Horror': '공포', 'Survival Horror': '서바이벌 호러', 'Psychological Horror': '심리 공포', 'Survival': '생존',
  'Zombies': '좀비', 'Crafting': '제작', 'Base Building': '기지 건설', 'Building': '건설', 'Sandbox': '샌드박스',
  'Open World Survival Craft': '오픈월드 생존 제작', 'Simulation': '시뮬레이션', 'Management': '경영', 'Resource Management': '자원 관리',
  'Automation': '자동화', 'City Builder': '도시 건설', 'Farming Sim': '농장 시뮬', 'Life Sim': '생활 시뮬', 'Dating Sim': '연애 시뮬',
  'Relaxing': '힐링', 'Cute': '귀여움', 'Colorful': '화사함', 'Family Friendly': '가족 친화', 'Casual': '캐주얼', 'Puzzle': '퍼즐',
  'Platformer': '플랫포머', '2D Platformer': '2D 플랫포머', 'Puzzle Platformer': '퍼즐 플랫포머', 'Metroidvania': '메트로배니아',
  'Roguelike': '로그라이크', 'Roguelite': '로그라이트', 'Action Roguelike': '액션 로그라이크', 'Deckbuilding': '덱빌딩',
  'Card Game': '카드 게임', 'Dungeon Crawler': '던전 탐험', 'Creature Collector': '몬스터 수집', 'Collectathon': '수집',
  'Loot': '파밍', 'Racing': '레이싱', 'Driving': '운전', 'Flight': '비행', 'Sports': '스포츠', 'Fighting': '격투',
  'Strategy': '전략', 'Tactical': '전술', 'RTS': 'RTS', 'Real-Time Tactics': '실시간 전술', 'Grand Strategy': '대전략', '4X': '4X',
  'Sci-fi': 'SF', 'Space': '우주', 'Cyberpunk': '사이버펑크', 'Post-apocalyptic': '포스트 아포칼립스', 'Medieval': '중세',
  'Historical': '역사', 'War': '전쟁', 'Military': '밀리터리', 'Violent': '폭력적', 'Gore': '고어', 'Female Protagonist': '여성 주인공',
  'Pixel Graphics': '픽셀 그래픽', 'Hand-drawn': '손그림', '2D': '2D', '3D': '3D', 'Retro': '레트로', 'Indie': '인디',
  'Classic': '고전', 'Visual Novel': '비주얼 노벨', 'Point & Click': '포인트 앤 클릭', 'Immersive Sim': '이머시브 심',
  'Music': '음악', 'Rhythm': '리듬', 'Replay Value': '반복 플레이', 'Linear': '선형 진행', 'Nonlinear': '비선형 진행',
  'Narration': '내레이션', 'Realistic': '사실적', 'Physics': '물리', 'Massively Multiplayer': 'MMO', 'MMORPG': 'MMORPG',
  'Free to Play': '무료', 'Early Access': '앞서 해보기', 'Controller': '컨트롤러'
};
const SORTS = ['score', 'meta', 'rating', 'short', 'added', 'new', 'old', 'title', 'titleDesc'];
const STORE_KEY = 'gpc-state-v2';
const PAGE = 48;
// 점수 계산(특성 무게·IDF·유사도)은 recommend.js에 있다. 여기는 화면과 상태만
const MIN_SCORE = Recommend.MIN_SCORE;   // 이보다 낮으면 "취향과 거리가 먼 게임"으로 따로 접는다
let canMix = false;   // 지금 화면에 골고루 섞기가 걸리는지 (추천 탭 · 취향 점수 있음 · 추천순). render가 정한다

// ---------- 상태 ----------

// 추천 엔진: 데이터를 받기 전에도 특성 키를 볼 수 있게 빈 엔진으로 시작하고, main에서 게임 목록으로 다시 만든다
let E = Recommend.create();

const S = {
  data: null, games: [], byId: new Map(), rules: null,
  firstMin: '',    // 기록을 시작한 날(모든 게임 firstSeen 중 가장 이른 날). 이날 본 게임은 "언제 들어왔는지" 모른다
  anchors: {},     // id -> { kind: 'like' | 'dislike', aspects: [특성 키] | null }
  external: {},    // 게임패스 밖 게임: id('ext:스토어ID' | 'custom:...') -> 게임 정보
  keywords: {},    // 특성 키('t:story', 's:jrpg') -> 1 | -1
  status: {},      // id -> wish | playing | done | dropped
  f: defaultFilters(),
  native: false,   // Windows 앱(exe) 안에서 열려 Steam 프록시(/proxy/)를 쓸 수 있는지 (detectNative)
  tab: 'rec', shown: PAGE, showFar: false, q: ''
};

function defaultFilters() {
  return { plan: 'all', platform: 'any', korean: 'playable', age: 'any', time: 'any',
           modes: [], genres: [], styles: [], features: [], leaving: false, fresh: false, hidedone: true, quick: false, sort: 'score',
           mix: true };   // 추천순에서 비슷한 게임(같은 시리즈 등)이 몰리지 않게 섞기
}

// 브라우저 저장소는 막혀 있을 수 있어(사생활 보호 모드 등) 항상 try로 감싼다
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || migrateV1();
    if (!s) return;
    S.anchors = s.anchors || {}; S.external = s.external || {}; S.keywords = s.keywords || {};
    S.status = s.status || {}; S.f = normFilters(s.f);
  } catch (e) { /* 저장소 없이도 동작 */ }
}

// 저장했거나 가져온 필터를 지금 형식에 맞춘다 (모르는 값은 기본값으로)
function normFilters(raw) {
  const f = Object.assign(defaultFilters(), raw && typeof raw === 'object' ? raw : {});
  if (!SORTS.includes(f.sort)) f.sort = 'score';
  if (!TIMES.includes(f.time)) f.time = 'any';
  for (const k of ['modes', 'genres', 'styles', 'features']) f[k] = Array.isArray(f[k]) ? f[k].filter((x) => typeof x === 'string') : [];
  for (const k of ['leaving', 'fresh', 'quick']) f[k] = f[k] === true;
  f.hidedone = f.hidedone !== false;
  f.mix = f.mix !== false;
  return f;
}

// v1: anchors 값이 문자열, keywords 키에 접두어 없음
function migrateV1() {
  const old = JSON.parse(localStorage.getItem('gpc-state-v1') || 'null');
  if (!old) return null;
  const anchors = {};
  for (const [id, kind] of Object.entries(old.anchors || {})) anchors[id] = { kind, aspects: null };
  const keywords = {};
  for (const [k, v] of Object.entries(old.keywords || {})) keywords['t:' + k] = v;
  return { anchors, keywords, status: old.status, f: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ anchors: S.anchors, external: S.external, keywords: S.keywords, status: S.status, f: S.f }));
  } catch (e) { /* 무시 */ }
}

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const img = (url, w) => (url ? `${url}${url.includes('?') ? '&' : '?'}w=${w}` : '');
const gameOf = (id) => S.byId.get(id) || S.external[id];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- 특성과 추천 ----------

// 스토어는 출시일을 모를 때 9998-12-30 같은 값을 넣는다 -> 날짜 없음으로 본다
const releaseOf = (g) => { const d = String(g.releaseDate || ''); return d >= '9000' ? '' : d; };
const metaOf = (g) => (typeof g.metacritic === 'number' && g.metacritic > 0 ? g.metacritic : null);
const posNum = (x) => (typeof x === 'number' && isFinite(x) && x > 0 ? x : null);

// 아래 칸들(플레이타임·가격·접근성·클라우드 등)은 데이터에 없을 수 있다. 없으면 표시하지 않는다
// HowLongToBeat 시간 (main | mainPlus | completionist)
const hoursOf = (g, k = 'main') => (g.playtime && typeof g.playtime === 'object' ? posNum(g.playtime[k]) : null);
const fmtHours = (h) => (h < 1 ? '1시간 미만' : h >= 100 ? '100시간+' : `${Math.round(h)}시간`);
// 게임패스 회원 구매가. 정가·회원가 둘 다 없으면 null
function priceOf(g) {
  const p = g.price;
  if (!p || typeof p !== 'object') return null;
  const msrp = posNum(p.msrp); const member = posNum(p.gamePass);
  if (msrp == null && member == null) return null;
  return { msrp, member, discount: Number.isInteger(p.discount) && p.discount > 0 ? p.discount : 0 };
}
const MEMBER_DISCOUNT = 20;   // 게임패스 회원이면 기본으로 받는 구매 할인(%)
const won = (n) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const handheldOf = (g) => (typeof g.handheld === 'string' && g.handheld.trim() ? g.handheld.trim() : null);
const handheldLabel = (v) => HANDHELD[v.toLowerCase()] || v;
const accessOf = (g) => (Array.isArray(g.accessibility) ? g.accessibility.filter((x) => typeof x === 'string' && x.trim()) : []);
const partnerOf = (g) => (PARTNER[g.partner] ? g.partner : null);
const pausable = (g) => accessOf(g).some((x) => /일시\s*중지/.test(x));
// 휴대용 PC(ROG Ally 등)에서 할 만한지: 빌드가 붙인 handheldReady, 없으면 스토어 검증 결과(검증됨·플레이 가능)
function handheldOk(g) {
  if (g.handheldReady === true) return true;
  const hh = handheldOf(g);
  return !!hh && ['verified', 'playable'].includes(hh.toLowerCase());
}

// 게임패스 기록: firstSeen(처음 본 날)·daysOnPass(그 뒤 지난 날수). 둘 다 없을 수 있다
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const firstSeenOf = (g) => (isDate(g.firstSeen) ? g.firstSeen : null);
// 최근 30일 안에 들어온 게임만 "N일 전 추가". 기록 첫날에 본 게임은 그 전부터 있었을 수 있어 말하지 않는다
function addedAgo(g) {
  const d = g.daysOnPass; const fs = firstSeenOf(g);
  if (!Number.isInteger(d) || d < 0 || d > 30 || !fs || fs === S.firstMin) return '';
  return d === 0 ? '오늘 추가' : `${d}일 전 추가`;
}

// Steam 태그 한국어 이름: 데이터의 Steam 공식 한국어 이름 -> 여기 사전 -> 영어 그대로
function steamKo(t) {
  const ko = S.rules && S.rules.steamKo && typeof S.rules.steamKo === 'object' ? S.rules.steamKo[t] : null;
  return (typeof ko === 'string' && ko.trim()) || STEAM_KO[t] || t;
}

// 짧게 끊어 하기: 한 판이 짧은 태그가 있거나, 메인 10시간 이하(JRPG·오픈월드 빼고)거나, 일시 중지가 되는 게임
function quickOk(g) {
  const st = steamTagsOf(g) || {};
  if (QUICK_TAGS.some((t) => Number(st[t]) >= 0.3)) return true;
  const h = hoursOf(g);
  if (h != null && h <= 10 && !(g.styles || []).some((x) => QUICK_LONG_STYLES.includes(x))) return true;
  return pausable(g);
}

// 기능 칩에 쓰는 키: 스토어 기능(features) + 다른 칸에서 만든 것
function featsOf(g) {
  const out = new Set(Array.isArray(g.features) ? g.features : []);
  if (g.familyKids === true) out.add('familyKids');
  if (g.cloud === true) out.add('cloud');
  if (g.cloudTouch === true) out.add('cloudTouch');
  if (pausable(g)) out.add('pause');
  if (handheldOk(g)) out.add('handheld');
  return [...out];
}

// 오늘 날짜(내 컴퓨터 시간대) YYYY-MM-DD
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 곧 추가: Xbox의 "게임패스에 곧 들어오는" 목록. releaseDate는 게임패스 추가일이 아니라 스토어 출시일이다
// (추가일은 어디에도 없다). 출시 전 게임을 출시일 가까운 순으로 먼저, 이미 나온 게임은 최근 출시순, 날짜 모르면 맨 뒤
function soonList() {
  const list = S.data && Array.isArray(S.data.comingSoon) ? S.data.comingSoon.filter((c) => c && c.id && c.title) : [];
  const today = todayStr();
  const rank = (c) => { const d = releaseOf(c); return !d ? 2 : d > today ? 0 : 1; };
  return list.slice().sort((a, b) => rank(a) - rank(b) ||
    (rank(a) === 0 ? releaseOf(a).localeCompare(releaseOf(b)) : releaseOf(b).localeCompare(releaseOf(a))));
}
// 곧 추가 카드의 날짜 문구
function soonDateLabel(c) {
  const d = releaseOf(c);
  if (!d) return '출시일 미정';
  return d > todayStr() ? `${d} 출시 예정` : `이미 출시된 게임 · 스토어 출시 ${d}`;
}
const soonOf = (id) => (S.byId.has(id) ? null : soonList().find((c) => c.id === id) || null);
const steamTagsOf = Recommend.steamTagsOf;
const featureKeys = (g) => E.featureKeys(g);
const bridge = () => E.bridge();
const buildProfile = () => E.profile({ anchors: S.anchors, keywords: S.keywords, external: S.external });

function featureLabel(k) {
  const t = k.slice(0, 1); const v = k.slice(2);
  if (t === 'k') return steamKo(v);
  if (t === 'g') return GENRES[v] || v;
  if (t === 's') return STYLES[v] || v;
  if (t === 't') return TAGS[v] || v;
  if (t === 'm') return MODES[v] + ' 플레이';
  if (t === 'c') return CONTENT[v] || v;
  return v;   // 제작사·퍼블리셔
}

function reasonsFor(g, prof) {
  const out = [];
  // 어떤 게임과 닮았는지·어떤 요소가 겹치는지는 엔진이 고르고, 문장만 여기서 만든다
  const x = E.explain(g, prof, featureLabel);
  if (x.similar) out.push({ cls: '', text: `좋아한 「${gameOf(x.similar.id).title}」와 비슷해요 (${x.similar.labels.join('·')})` });
  if (x.liked.length && !out.length) out.push({ cls: '', text: `좋아하는 요소: ${x.liked.join('·')}` });
  if (x.disliked.length) out.push({ cls: 'neg', text: `별로라고 한 요소도 있어요: ${x.disliked.join('·')}` });
  if (x.dislikedLike) out.push({ cls: 'neg', text: `별로였던 「${gameOf(x.dislikedLike).title}」와 닮은 점이 많아요` });
  const warn = g.content.flags.filter((x) => WARN_FLAGS.includes(x));
  if (warn.length) out.push({ cls: 'warn', text: `${warn.map((x) => CONTENT[x]).join('·')} 표현이 있어요 (등급 기관 표기)` });
  if (g.leavingSoon) out.push({ cls: 'warn', text: '곧 게임패스에서 빠져요' });
  if (g.leavingSoon && (priceOf(g) || {}).discount) out.push({ cls: 'warn', text: '곧 빠지는데 회원 할인 중이에요' });
  if (g.korean.status === 'patch') out.push({ cls: 'warn', text: '한국어는 유저 한글패치로 (검색 추정, 근거 확인 필요)' });
  return out;
}

// ---------- 필터 ----------

function ageOf(g) {
  const m = String(g.content.grac || '').match(/GRB:(All|\d+)/i);
  if (!m) return null;
  return m[1].toLowerCase() === 'all' ? 0 : Number(m[1]);
}
const AGE_LABEL = (a) => (a == null ? '' : a === 0 ? '전체' : a >= 18 ? '18' : String(a));

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

function passes(g) {
  if (!planOk(g)) return false;
  if (S.f.korean === 'official' && g.korean.status !== 'official') return false;
  if (S.f.korean === 'playable' && !koreanPlayable(g)) return false;
  if (S.f.age !== 'any') { const a = ageOf(g); if (a == null || a > Number(S.f.age)) return false; }
  // 플레이타임 제한을 걸면 시간 정보가 없는 게임은 뺀다 (요약 문구에 알린다)
  if (S.f.time !== 'any') { const h = hoursOf(g); if (h == null || h > Number(S.f.time)) return false; }
  if (S.f.modes.length && !S.f.modes.some((m) => g.modes.includes(m))) return false;
  if (S.f.genres.length && !S.f.genres.some((x) => g.genres.includes(x))) return false;
  if (S.f.styles.length && !S.f.styles.some((x) => g.styles.includes(x))) return false;
  // 기능은 Xbox 앱처럼 고른 것을 모두 갖춘 게임만 (AND)
  if (S.f.features.length) { const fs = featsOf(g); if (!S.f.features.every((x) => fs.includes(x))) return false; }
  if (S.f.leaving && !g.leavingSoon) return false;
  if (S.f.fresh && !g.recentlyAdded) return false;
  if (S.f.quick && !quickOk(g)) return false;
  return true;
}

// ---------- 그리기 ----------

function koreanPill(g) {
  const k = g.korean.status; const ic = g.install.class;
  if (k === 'official') return ['good', '한국어'];
  if (k === 'official_likely') return ['info', '공식 한국어?'];
  if (k === 'patch') {
    if (ic === 'protected' || ic === 'uwp') return ['warn', '한글패치 · 게임패스 불가 추정'];
    if (ic === 'console') return ['warn', '한글패치 · PC만'];
    return ['good', '한글패치'];
  }
  if (k === 'patch_blocked') return ['bad', '한글패치 게임패스 불가'];
  if (k === 'planned') return ['warn', '한국어 예정'];
  if (k === 'none' || k === 'none_found') return ['', '한국어 없음'];
  return ['', '한국어 미확인'];
}

function planPill(g) {
  if (g.naverPlus) return ['good', '네이버플러스'];
  const p = g.plans;
  if (p.essential.length) return ['', 'Essential'];
  if (p.premium.length) return ['', 'Premium'];
  return ['', 'Ultimate 전용'];
}

const pill = ([cls, text]) => `<span class="pill ${cls}">${esc(text)}</span>`;

// 메타크리틱 점수를 어디서 가져왔는지 (모르면 예전처럼 Steam)
const metaSrc = (g) => (g.metacriticSource === 'gamepass' ? '게임패스 정보' : 'Steam 상점 정보');

// 메타크리틱: 75 이상 녹색, 50~74 중립, 50 미만 주의. 점수가 없으면 카드에는 띄우지 않는다
function metaPill(g) {
  const m = metaOf(g);
  if (m == null) return '';
  return `<span class="pill meta num ${m >= 75 ? 'good' : m < 50 ? 'warn' : ''}" title="메타크리틱 점수 (${metaSrc(g)})">메타 ${m}</span>`;
}

// 짧게 끊어 할 사람에게 쓸모 있는 표시: 플레이타임·가족·회원 할인·계정 연동. 값이 없으면 아무것도 안 띄운다
function timePill(g) {
  const h = hoursOf(g);
  return h == null ? '' : `<span class="pill num" title="메인 스토리 플레이타임 (HowLongToBeat)">메인 ${esc(fmtHours(h))}</span>`;
}
function extraPills(g) {
  const pr = priceOf(g); const pt = partnerOf(g); const ago = addedAgo(g);
  return (ago ? `<span class="pill info" title="게임패스에 들어온 날 ${esc(firstSeenOf(g))}">${esc(ago)}</span>` : '') +
    (handheldOk(g) ? `<span class="pill" title="휴대용 PC(ROG Ally 등)에서 할 만해요">휴대용</span>` : '') +
    (g.familyKids === true ? `<span class="pill" title="Xbox 가족 및 어린이 모음">가족</span>` : '') +
    // 20%는 게임패스 회원 기본 할인이라 거의 모든 게임에 붙는다 -> 그보다 클 때만 띄운다
    (pr && pr.discount > MEMBER_DISCOUNT ? `<span class="pill info num" title="게임패스 회원 기본 할인(${MEMBER_DISCOUNT}%)보다 큰 할인">할인 중 ${pr.discount}%↓</span>` : '') +
    (pt ? pill(['warn', PARTNER[pt][0]]) : '');
}

function anchorButtons(id, cls = 'act') {
  const a = S.anchors[id];
  return `<button class="${cls} like ${a && a.kind === 'like' ? 'on' : ''}" data-act="anchor" data-val="like" data-id="${esc(id)}">좋아요</button>
          <button class="${cls} dislike ${a && a.kind === 'dislike' ? 'on' : ''}" data-act="anchor" data-val="dislike" data-id="${esc(id)}">별로</button>`;
}

function tileHtml(g, score, reasons) {
  const age = ageOf(g);
  const why = reasons[0];
  const flag = g.leavingSoon ? '<span class="flag-tag leaving">곧 종료</span>' : g.recentlyAdded ? '<span class="flag-tag fresh">최근 추가</span>' : '';
  const st = S.status[g.id];
  return `<article class="tile">
    <div class="cover" data-open="${g.id}" role="button" tabindex="0" aria-label="${esc(g.title)} 자세히 보기">
      <img loading="lazy" src="${esc(img(g.poster, 352))}" alt="">
      ${score != null ? `<span class="score-tag num" title="추천 점수 (1위=100)">${score}</span>` : ''}${flag}
    </div>
    <h3 data-open="${g.id}">${esc(g.title)}</h3>
    <div class="meta">${pill(koreanPill(g))}${metaPill(g)}${pill(planPill(g))}${age != null ? pill(['', AGE_LABEL(age) + (age ? '세' : '')]) : ''}${timePill(g)}${extraPills(g)}</div>
    ${why ? `<p class="why ${why.cls === 'warn' ? 'warn' : ''}">${esc(why.text)}</p>` : ''}
    <div class="acts">${anchorButtons(g.id)}<button class="act ${st === 'wish' ? 'on' : ''}" data-act="status" data-val="wish" data-id="${g.id}">관심</button></div>
  </article>`;
}

// 곧 추가 카드: 상세 정보가 없어 표지·제목·출시일·장르와 관심 버튼만
function soonTileHtml(c) {
  const st = S.status[c.id];
  const genres = (Array.isArray(c.genres) ? c.genres : []).slice(0, 2).map((x) => pill(['', GENRES[x] || x])).join('');
  const maker = [c.developer, c.publisher !== c.developer ? c.publisher : ''].filter(Boolean).join(' · ');
  return `<article class="tile">
    <div class="cover soon">${c.poster ? `<img loading="lazy" src="${esc(img(c.poster, 352))}" alt="">` : ''}<span class="flag-tag fresh">곧 추가</span></div>
    <h3>${esc(c.title)}</h3>
    <div class="meta">${pill(['', soonDateLabel(c)])}${genres}</div>
    ${maker ? `<p class="why">${esc(maker)}</p>` : ''}
    <div class="acts"><button class="act ${st === 'wish' ? 'on' : ''}" data-act="status" data-val="wish" data-id="${esc(c.id)}">관심</button></div>
  </article>`;
}

function pickHtml(g, score, reasons) {
  const art = g.hero || g.poster;
  return `<div class="pick-card">
    <div class="pick-art" data-open="${g.id}"><img src="${esc(img(art, 1200))}" alt=""></div>
    <div class="pick-body">
      <span class="pick-label">지금 해 볼 1순위</span>
      <h2 data-open="${g.id}">${esc(g.title)}</h2>
      <div class="pick-score"><b class="num">${score}</b><span>추천 점수 · ${esc([g.genres.map((x) => GENRES[x] || x)[0], ...g.styles.map((x) => STYLES[x]).slice(0, 2)].filter(Boolean).join(' · '))}</span></div>
      <div class="meta">${pill(koreanPill(g))} ${metaPill(g)} ${pill(planPill(g))} ${timePill(g)} ${extraPills(g)}</div>
      <ul class="reasons">${reasons.slice(0, 4).map((r) => `<li class="${r.cls}">${esc(r.text)}</li>`).join('')}</ul>
      <div class="pick-actions">
        <a class="btn primary" href="${xboxAppLink(g.id)}" style="display:inline-flex;align-items:center;text-decoration:none">Xbox 앱에서 열기</a>
        <button class="btn" data-open="${g.id}">자세히</button>
        ${anchorButtons(g.id, 'btn')}
      </div>
    </div>
  </div>`;
}

const xboxAppLink = (id) => `msxbox://game/?productId=${encodeURIComponent(id)}`;

function sortList(list, scores) {
  const pop = (g) => (g.rating || 0) * Math.log10(10 + (g.ratingCount || 0));
  const date = releaseOf;
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  // 값이 없는 게임은 항상 뒤로
  const nullsLast = (x, y, cmp) => (x == null ? (y == null ? 0 : 1) : y == null ? -1 : cmp(x, y));
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true });
  const by = {
    score: (a, b) => (scores ? (scores.get(b.id) - scores.get(a.id)) || pop(b) - pop(a) : pop(b) - pop(a)),
    meta: (a, b) => nullsLast(metaOf(a), metaOf(b), (x, y) => y - x) || pop(b) - pop(a),
    rating: (a, b) => pop(b) - pop(a),
    // 메인 스토리가 짧은 순. 시간 정보가 없으면 뒤로
    short: (a, b) => nullsLast(hoursOf(a), hoursOf(b), (x, y) => x - y) || pop(b) - pop(a),
    // 게임패스에 들어온 순서(0 = 가장 최근). 순서 정보가 없으면 "최근 추가" 표시, 그다음 출시일
    added: (a, b) => nullsLast(num(a.addedRank), num(b.addedRank), (x, y) => x - y)
      || Number(!!b.recentlyAdded) - Number(!!a.recentlyAdded) || date(b).localeCompare(date(a)),
    new: (a, b) => date(b).localeCompare(date(a)),
    old: (a, b) => nullsLast(date(a) || null, date(b) || null, (x, y) => x.localeCompare(y)),
    title: byTitle,
    titleDesc: (a, b) => byTitle(b, a)
  };
  return list.sort(by[S.f.sort] || by.score);
}

function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.nav-item').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
}

function render() {
  const soon = soonList();
  // 곧 추가 자료가 없으면 탭을 숨긴다 (보고 있었다면 추천으로)
  $('#soon-tab').hidden = !soon.length;
  $('#soon-count').textContent = soon.length || '';
  if (S.tab === 'soon' && !soon.length) setTab('rec');
  if (S.tab === 'soon') { renderSoon(soon); return; }

  const prof = buildProfile();
  const q = norm(S.q);
  let list = [];
  let soonMine = [];
  if (S.tab === 'mine') {
    list = S.games.filter((g) => S.status[g.id]);
    // 게임패스 목록에 없는 id는 곧 추가 자료에서 찾고, 거기에도 없으면 건너뛴다
    soonMine = Object.keys(S.status).filter((id) => !S.byId.has(id)).map(soonOf).filter(Boolean);
  } else {
    list = S.games.filter((g) => {
      if (S.tab === 'rec' && S.anchors[g.id]) return false;  // 기준으로 고른 게임은 이미 아는 게임
      if (S.tab === 'rec' && S.f.hidedone && ['done', 'dropped'].includes(S.status[g.id])) return false;
      if (q && !norm(g.title).includes(q)) return false;
      return passes(g);
    });
  }

  // 점수: 1위를 100으로 맞춘 상대 점수. 취향이 없으면 계산하지 않는다
  const scores = E.score(list, prof);
  if (S.tab !== 'mine') sortList(list, scores);

  let pick = null; let far = [];
  canMix = S.tab === 'rec' && !!scores && S.f.sort === 'score';
  if (canMix) {
    // 접기는 원래 점수로 하고, 보이는 쪽만 한 시리즈가 몰리지 않게 순서를 섞는다 (숫자는 원래 점수 그대로).
    // 섞기를 끄면 점수 순서 그대로
    ({ near: list, far } = Recommend.fold(list, scores, MIN_SCORE));
    list = E.diversify(list, scores, { diversity: S.f.mix });
    pick = list.shift() || null;
  }

  $('#pick').innerHTML = pick ? pickHtml(pick, scores.get(pick.id), reasonsFor(pick, prof))
    : (S.tab === 'rec' && prof.empty ? '<div class="empty">재미있게 한 게임을 위에서 검색해 추가하면 취향에 맞춰 추천해요. 게임패스에 없는 게임도 돼요. 그 전까지는 스토어 평점순으로 보여 드려요.</div>' : '');

  if (S.tab === 'mine') {
    const order = Object.keys(STATUS);
    list = [...list, ...soonMine].sort((a, b) => order.indexOf(S.status[a.id]) - order.indexOf(S.status[b.id]));
  }
  const shown = list.slice(0, S.shown);
  const farShown = S.showFar ? far : [];
  let html = shown.map((g) => (S.byId.has(g.id) ? tileHtml(g, scores ? scores.get(g.id) : null, reasonsFor(g, prof)) : soonTileHtml(g))).join('');
  if (farShown.length) {
    html += `<p class="section-note">취향과 거리가 먼 게임 (추천 점수 ${MIN_SCORE} 미만)</p>` +
      farShown.slice(0, 240).map((g) => tileHtml(g, scores.get(g.id), reasonsFor(g, prof))).join('');
  }
  if (!html && !pick) {
    html = `<div class="empty">${S.tab === 'mine' ? '아직 표시한 게임이 없어요. 게임의 관심 버튼이나 상세 화면에서 플레이 중·완료·포기를 고를 수 있어요.' : '조건에 맞는 게임이 없어요. 필터를 조금 풀어 보세요.'}</div>`;
  }
  $('#grid').innerHTML = html;
  $('#more').hidden = list.length <= S.shown;
  $('#far').hidden = !far.length;
  $('#far').textContent = S.showFar ? '거리가 먼 게임 접기' : `취향과 거리가 먼 게임 ${far.length}개 보기`;

  const total = list.length + (pick ? 1 : 0);
  // 추천순이 아니면 거리가 먼 게임을 접지 않으므로 "조건에 맞는"으로 말한다
  const sortName = S.f.sort === 'score' ? (prof.empty ? '스토어 평점순' : '') : ($('#f-sort').selectedOptions[0]?.text || '');
  const timeNote = (S.f.quick ? ' · 짧게 끊어 하기 모드' : '') + (S.f.time !== 'any' ? ' · 플레이타임 정보가 있는 게임만' : '');
  const mixNote = canMix && S.f.mix ? ' · 비슷한 게임이 몰리지 않게 섞었어요' : '';
  const lead = {
    rec: (sortName ? `조건에 맞는 ${total}개 · ${sortName}` : `취향에 맞는 ${total}개${far.length ? ` · 거리가 먼 ${far.length}개는 접어 뒀어요` : ''}`) + timeNote + mixNote,
    all: `지금 게임패스에 있는 게임 중 조건에 맞는 ${list.length}개${scores ? ' · 숫자는 내 취향 점수' : ''}${timeNote}`,
    mine: `${list.length}개 · 관심, 플레이 중, 완료, 포기 순`
  };
  // 결과가 적은 까닭이 필터라면 그렇다고 말해 준다
  // (섞기 끔은 개수와 상관없어 세지 않는다)
  const few = S.tab !== 'mine' && (S.tab === 'rec' ? total : list.length) < 5 && activeFilters().some((x) => x.id !== 'mix');
  renderChrome(lead[S.tab] + (few ? ' · 필터 때문에 적게 보여요' : ''));
}

// 곧 추가 탭: 취향 점수·필터 없이 출시일 기준 순서(soonList). 제목 검색만 된다
function renderSoon(soon) {
  const q = norm(S.q);
  const list = soon.filter((c) => !q || norm(c.title).includes(q));
  $('#pick').innerHTML = '';
  $('#grid').innerHTML = list.slice(0, S.shown).map(soonTileHtml).join('') ||
    '<div class="empty">찾는 게임이 없어요.</div>';
  $('#more').hidden = list.length <= S.shown;
  $('#far').hidden = true;
  canMix = false;
  renderChrome(`게임패스에 곧 들어오는 게임 ${list.length}개 · 추가 날짜는 Microsoft가 공개하지 않아요`);
}

// 모든 탭에 공통인 제목·요약·개수
function renderChrome(summary) {
  const titles = { rec: '추천', all: '전체 게임', mine: '내 목록', soon: '곧 추가' };
  $('#page-title').textContent = titles[S.tab];
  $('#summary').textContent = summary;
  $('#q').hidden = S.tab === 'rec';
  $('#taste').hidden = S.tab === 'mine' || S.tab === 'soon';
  $('#sort-box').hidden = S.tab === 'soon';
  // 짧게 끊어 하기는 필터라 필터가 걸리는 추천·전체 게임에서만
  $('#f-quick').hidden = S.tab === 'mine' || S.tab === 'soon';
  $('#f-quick').classList.toggle('on', S.f.quick);
  $('#f-quick').setAttribute('aria-pressed', String(S.f.quick));
  // 골고루 섞기: 취향 점수로 추천순일 때만 (render가 canMix를 정한다)
  $('#f-mix').hidden = !canMix;
  $('#f-mix').classList.toggle('on', S.f.mix);
  $('#f-mix').setAttribute('aria-pressed', String(S.f.mix));
  renderAlert();
  renderLeft();
  // 내 목록 개수: 보여 줄 수 있는 것만 (데이터에서 사라진 게임은 세지 않는다)
  $('#mine-count').textContent = Object.keys(S.status).filter((id) => S.byId.has(id) || soonOf(id)).length || '';
  $('#all-count').textContent = S.games.length;
  renderTaste();
  renderActive();
  saveState();
}

// ---------- 켜 둔 필터 ----------

const PLAN_LABEL = { naver: '네이버플러스', pcgp: 'PC Game Pass', ultimate: 'Ultimate', premium: 'Premium', essential: 'Essential' };
const AGE_FILTER = { 0: '전체이용가만', 12: '12세까지', 15: '15세까지' };

// 기본값과 다른 필터 하나하나 [{ id, label }]. tab을 주면 그 탭에 실제로 걸리는 것만
// (한국어 'playable'·완료 숨기기 켜짐은 기본값이라 넣지 않는다)
function activeFilters(tab = S.tab) {
  const out = [];
  const q = S.q.trim();
  if (tab === 'mine') return out;
  if (tab !== 'soon') {
    const f = S.f; const d = defaultFilters();
    if (f.plan !== d.plan) out.push({ id: 'plan', label: `요금제: ${PLAN_LABEL[f.plan] || f.plan}` });
    if (f.platform !== d.platform) out.push({ id: 'platform', label: `플랫폼: ${f.platform === 'pc' ? 'PC' : '콘솔'}` });
    if (f.korean !== d.korean) out.push({ id: 'korean', label: `한국어: ${f.korean === 'official' ? '공식만' : '전체'}` });
    if (f.age !== d.age) out.push({ id: 'age', label: `연령: ${AGE_FILTER[f.age] || f.age}` });
    if (f.time !== d.time) out.push({ id: 'time', label: `플레이타임: ${f.time}시간 이하` });
    f.modes.forEach((x) => out.push({ id: 'modes:' + x, label: `방식: ${MODES[x] || x}` }));
    f.genres.forEach((x) => out.push({ id: 'genres:' + x, label: `장르: ${GENRES[x] || x}` }));
    f.styles.forEach((x) => out.push({ id: 'styles:' + x, label: `세부 장르: ${STYLES[x] || x}` }));
    f.features.forEach((x) => out.push({ id: 'features:' + x, label: `기능: ${FEATURES[x] || x}` }));
    if (f.quick) out.push({ id: 'quick', label: '짧게 끊어 하기' });
    if (f.leaving) out.push({ id: 'leaving', label: '곧 종료만' });
    if (f.fresh) out.push({ id: 'fresh', label: '최근 추가만' });
    if (!f.hidedone && tab === 'rec') out.push({ id: 'hidedone', label: '완료·포기도 보기' });
    // 섞기는 기본이 켜짐이라 껐을 때만, 그것도 섞기가 걸리는 추천순에서만
    if (!f.mix && tab === 'rec' && f.sort === 'score') out.push({ id: 'mix', label: '섞기 끔' });
  }
  // 추천 탭에는 검색칸이 없지만 다른 탭에서 넣은 검색어도 걸리므로 알린다
  if (q) out.push({ id: 'q', label: `검색: ${q}` });
  return out;
}

// 사이드바에서 고른 필터 개수 (탭과 상관없이, 검색어는 빼고)
const sideFilterCount = () => activeFilters('all').filter((x) => x.id !== 'q').length + (S.f.hidedone ? 0 : 1);

function clearFilter(id) {
  const [key, val] = id.split(/:(.*)/s);
  if (key === 'q') { S.q = ''; $('#q').value = ''; }
  else if (val != null && Array.isArray(S.f[key])) S.f[key] = S.f[key].filter((x) => x !== val);
  else if (key in S.f) S.f[key] = defaultFilters()[key];
}

function renderActive() {
  const list = activeFilters();
  const box = $('#active-filters');
  box.hidden = !list.length;
  box.innerHTML = list.map((x) => `<button type="button" class="af-chip" data-clear="${esc(x.id)}" aria-label="${esc(x.label)} 필터 끄기">${esc(x.label)}<span class="x" aria-hidden="true">×</span></button>`).join('') +
    (list.length >= 2 ? '<button type="button" class="af-clear" data-clear-all>모두 지우기</button>' : '');
  const n = sideFilterCount();
  $('#f-reset').textContent = n ? `필터 초기화 (${n}개 켜짐)` : '필터 초기화';
  sideToggleLabel();
}

function sideToggleLabel() {
  const open = document.querySelector('.side').classList.contains('open');
  const n = sideFilterCount();
  $('#side-toggle').textContent = open ? '닫기' : n ? `필터 ${n}` : '필터';
  $('#side-toggle').setAttribute('aria-label', open ? '필터 닫기' : n ? `필터 열기, ${n}개 켜짐` : '필터 열기');
}

// 관심·플레이 중으로 표시한 게임이 곧 빠지면 맨 위에 알린다. 닫으면 같은 게임 묶음에는 다시 띄우지 않는다
function alertIds() {
  return S.games.filter((g) => g.leavingSoon && ['wish', 'playing'].includes(S.status[g.id])).map((g) => g.id).sort();
}
function renderAlert() {
  const box = $('#alert');
  const ids = S.tab === 'soon' ? [] : alertIds();
  let dismissed = '';
  try { dismissed = localStorage.getItem(ALERT_KEY) || ''; } catch (e) { /* 저장소 없이도 동작 */ }
  if (!ids.length || dismissed === ids.join(',')) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = `<div class="alert-text">
      <b>관심·플레이 중인 게임 중 ${ids.length}개가 곧 게임패스에서 빠져요</b>
      <span class="alert-games">${ids.map((id) => `<button type="button" class="alert-link" data-open="${esc(id)}">${esc(S.byId.get(id).title)}</button>`).join('')}</span>
    </div>
    <button type="button" class="btn ghost small" data-dismiss="${esc(ids.join(','))}">닫기</button>`;
  box.hidden = false;
}

// 최근에 빠진 게임: 전체 게임·곧 추가 탭 아래에 접어 둔다. 자료가 없으면 숨긴다
function renderLeft() {
  const list = (S.data && Array.isArray(S.data.recentlyLeft) ? S.data.recentlyLeft : [])
    .filter((x) => x && typeof x.title === 'string' && x.title.trim())
    .slice().sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
  const box = $('#left');
  box.hidden = !list.length || !['all', 'soon'].includes(S.tab);
  if (box.hidden) return;
  $('#left-count').textContent = list.length;
  $('#left-list').innerHTML = list.map((x) => `<li><span>${esc(x.title)}</span>${isDate(x.lastSeen) ? `<span class="num">${x.lastSeen}까지 있었어요</span>` : ''}</li>`).join('');
}

function renderTaste() {
  $('#t-anchors').innerHTML = Object.entries(S.anchors).map(([id, a]) => {
    const g = gameOf(id);
    if (!g) return '';
    const sub = a.aspects && a.aspects.length ? `좋았던 점: ${a.aspects.slice(0, 3).map(featureLabel).join('·')}${a.aspects.length > 3 ? ' 외' : ''}`
      : (g.external ? extSource(g) || '게임패스 밖 게임' : '전부 반영');
    // 좋았던 점 고르기는 버튼이라 키보드로도 열린다
    return `<span class="anchor ${a.kind}">
      <button type="button" class="a-open" data-aspect="${esc(id)}" title="눌러서 좋았던 점 고르기">
      ${g.poster ? `<img src="${esc(img(g.poster, 52))}" alt="">` : ''}
      <span><span class="a-kind">${a.kind === 'like' ? '좋아요' : '별로'}</span> ${esc(g.title)}<span class="a-sub"> · ${esc(sub)}</span></span>
      </button>
      <button type="button" class="x" data-remove="${esc(id)}" aria-label="${esc(g.title)} 빼기">×</button></span>`;
  }).join('');
  renderTasteFold();
  const chip = (k, label) => {
    const v = S.keywords[k];
    return `<button type="button" class="chip ${v > 0 ? 'like' : v < 0 ? 'dislike' : ''}" data-kw="${k}">${label}</button>`;
  };
  $('#t-keywords').innerHTML = Object.entries(STYLES).map(([k, v]) => chip('s:' + k, v)).join('') +
    Object.entries(TAGS).map(([k, v]) => chip('t:' + k, v)).join('');
}

// 취향 패널 접기: 휴대폰에서는 처음에 접고, 데스크톱에서는 편다. 사용자가 바꾸면 기억한다.
// 취향이 비어 있으면 늘 편다 (그때는 패널 자체가 시작 안내라서)
const FOLD_KEY = 'gpc-taste-folded';
function tasteFolded() {
  try { const v = localStorage.getItem(FOLD_KEY); if (v === '1' || v === '0') return v === '1'; } catch (e) { /* 기본값으로 */ }
  return window.matchMedia('(max-width: 860px)').matches;
}
function setTasteFolded(folded) {
  try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch (e) { /* 이번만 */ }
  renderTasteFold();
}
function renderTasteFold() {
  const nA = Object.keys(S.anchors).filter((id) => gameOf(id)).length;
  const nK = Object.keys(S.keywords).length;
  const empty = !nA && !nK;
  const folded = !empty && tasteFolded();
  $('#taste').classList.toggle('folded', folded);
  $('#t-mini').hidden = !folded;
  $('#t-fold').hidden = empty;
  $('#t-fold').setAttribute('aria-expanded', String(!folded));
  $('#t-edit').setAttribute('aria-expanded', String(!folded));
  if (!folded) return;
  $('#t-mini-text').innerHTML = `<b>내 취향</b>: 게임 <span class="num">${nA}</span>개 · 요소 <span class="num">${nK}</span>개`;
  $('#t-mini-covers').innerHTML = Object.keys(S.anchors).map(gameOf).filter((g) => g && g.poster).slice(0, 3)
    .map((g) => `<img src="${esc(img(g.poster, 52))}" alt="" title="${esc(g.title)}">`).join('');
}

function renderFilterChips() {
  const count = (field) => { const c = {}; S.games.forEach((g) => (g[field] || []).forEach((x) => { c[x] = (c[x] || 0) + 1; })); return c; };
  const gc = count('genres'); const sc = count('styles');
  const fc = {}; S.games.forEach((g) => featsOf(g).forEach((x) => { fc[x] = (fc[x] || 0) + 1; }));
  // 플레이타임 자료가 하나도 없으면 필터와 "짧은 순"을 숨긴다 (이미 골라 둔 값이면 풀 수 있게 남긴다)
  const hasTime = S.games.some((g) => hoursOf(g) != null);
  $('#f-time-box').hidden = !hasTime && S.f.time === 'any';
  $('#f-sort option[value="short"]').hidden = !hasTime && S.f.sort !== 'short';
  // 기능: 데이터에 있는 것만 (이미 고른 것은 개수가 0이어도 남겨 풀 수 있게). 하나도 없으면 칸을 숨긴다
  const feats = Object.keys(FEATURES).filter((x) => fc[x] || S.f.features.includes(x));
  $('#f-features-box').hidden = !feats.length;
  $('#f-features').innerHTML = feats
    .map((x) => `<button type="button" class="chip ${S.f.features.includes(x) ? 'on' : ''}" data-feature="${x}">${esc(FEATURES[x])} <span class="nav-count">${fc[x] || 0}</span></button>`).join('');
  $('#f-genres').innerHTML = Object.keys(gc).sort((a, b) => gc[b] - gc[a])
    .map((x) => `<button type="button" class="chip ${S.f.genres.includes(x) ? 'on' : ''}" data-genre="${esc(x)}">${esc(GENRES[x] || x)}</button>`).join('');
  $('#f-styles').innerHTML = Object.keys(STYLES).filter((x) => sc[x])
    .map((x) => `<button type="button" class="chip ${S.f.styles.includes(x) ? 'on' : ''}" data-style="${x}">${STYLES[x]} <span class="nav-count">${sc[x]}</span></button>`).join('');
  $('#f-modes').innerHTML = Object.entries(MODES)
    .map(([k, v]) => `<button type="button" class="chip ${S.f.modes.includes(k) ? 'on' : ''}" data-mode="${k}">${v}</button>`).join('');
}

function syncFilterInputs() {
  $('#f-plan').value = S.f.plan; $('#f-platform').value = S.f.platform; $('#f-korean').value = S.f.korean; $('#f-age').value = S.f.age; $('#f-time').value = S.f.time;
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
  const where = (arr) => arr.map((x) => (x === 'pc' ? 'PC' : '콘솔')).join('·');
  const plans = [];
  if (g.plans.ultimate.length) plans.push(`Ultimate (${where(g.plans.ultimate)})`);
  if (g.plans.premium.length) plans.push(`Premium (${where(g.plans.premium)})`);
  if (g.plans.essential.length) plans.push(`Essential (${where(g.plans.essential)})`);
  if (g.plans.pcgp) plans.push('PC Game Pass');
  const age = ageOf(g);
  const tags = Object.entries(g.tagW || {}).sort((a, b) => b[1] - a[1]).map(([t, w]) => `${TAGS[t]}${w < 1 ? ' (약)' : ''}`);
  const steam = Object.entries(steamTagsOf(g) || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => steamKo(t));
  const feats = featsOf(g).filter((x) => FEATURES[x]).map((x) => FEATURES[x]);
  // 플레이타임: 믿을 만한 값만 데이터에 들어온다. 하나도 없으면 미확인
  const hours = [['메인', 'main'], ['메인+서브', 'mainPlus'], ['완전 정복', 'completionist']]
    .map(([l, key]) => [l, hoursOf(g, key)]).filter(([, h]) => h != null);
  const timeCell = hours.length
    ? `${hours.map(([l, h]) => `${l} <span class="num">${esc(fmtHours(h))}</span>`).join(' · ')}<span class="src">HowLongToBeat (게임패스 제공)</span>`
    : '미확인<span class="src">믿을 만한 정보가 없어요</span>';
  const pr = priceOf(g);
  const priceCell = pr ? [
    pr.msrp != null ? `정가 <span class="num">${won(pr.msrp)}</span>` : '',
    pr.member != null && pr.member !== pr.msrp ? `회원가 <span class="num">${won(pr.member)}</span>${pr.discount === MEMBER_DISCOUNT ? ` (게임패스 회원 기본 할인 ${MEMBER_DISCOUNT}%)` : pr.discount ? ` (${pr.discount}% 할인)` : ''}` : ''
  ].filter(Boolean).join(' → ') : '';
  const access = accessOf(g);
  const hh = handheldOf(g);
  const cloudCell = g.cloud === true || g.cloudTouch === true ? ['가능', g.cloudTouch === true ? '터치 지원' : ''].filter(Boolean).join(' · ')
    : g.cloud === false ? '안 돼요' : '';
  const size = posNum(g.installSizeGB);
  const minAge = Number.isInteger(g.minAge) && g.minAge > 0 ? g.minAge : null;
  const pt = partnerOf(g);
  // 기록 첫날에 본 게임은 그 전부터 있었을 수 있어 "이전부터"로 쓴다
  const fs = firstSeenOf(g); const ago = addedAgo(g);
  const joinCell = !fs ? '' : fs === S.firstMin ? `<span class="num">${fs}</span> 이전부터<span class="src">기록을 시작한 날부터 있던 게임</span>`
    : `<span class="num">${fs}</span>${ago ? ` · ${ago}` : ''}<span class="src">게임패스 목록 기록</span>`;
  const row = (th, td) => (td ? `<tr><th>${th}</th><td>${td}</td></tr>` : '');
  const meta = metaOf(g);
  const metaCell = meta == null ? '미확인'
    : `<span class="num">${meta}</span> / 100${g.metacriticUrl && /^https?:\/\//.test(g.metacriticUrl) ? ` · <a href="${esc(g.metacriticUrl)}" target="_blank" rel="noopener">메타크리틱에서 보기</a>` : ''}`;
  const steamUrl = Number.isInteger(g.steamAppId) && g.steamAppId > 0 ? `https://store.steampowered.com/app/${g.steamAppId}` : '';
  const repo = repoUrl();
  const issue = repo ? `${repo}/issues/new?template=korean-patch.yml&title=${encodeURIComponent('[한글패치] ' + g.title)}` : '';
  const st = S.status[id];
  $('#d-body').innerHTML = `
    ${g.hero || g.poster ? `<img class="d-hero" src="${esc(img(g.hero || g.poster, 760))}" alt="">` : ''}
    <div class="d-content">
      <h2 id="d-title">${esc(g.title)}</h2>
      <p class="d-meta">${esc([g.developer, g.publisher !== g.developer ? g.publisher : '', releaseOf(g) ? releaseOf(g) + ' 출시' : ''].filter(Boolean).join(' · '))}</p>
      <div class="d-acts">
        <a class="btn primary" href="${xboxAppLink(id)}" style="display:inline-flex;align-items:center;text-decoration:none">Xbox 앱에서 열기</a>
        ${anchorButtons(id, 'btn')}
        ${Object.entries(STATUS).map(([s, v]) => `<button class="btn ${st === s ? 'on' : ''}" data-act="status" data-val="${s}" data-id="${id}" ${st === s ? 'style="border-color:var(--text);background:var(--active)"' : ''}>${v}</button>`).join('')}
      </div>
      <p class="d-desc">${esc(g.description)} <span class="src">스토어 설명</span></p>
      <table class="d-table">
        <tr><th>한국어</th><td>${esc(k.label)}<span class="src">${esc(src)}</span>${k.link ? ` · <a href="${esc(k.link)}" target="_blank" rel="noopener">근거 글</a>` : ''}${k.note ? `<br>${esc(k.note)}` : ''}</td></tr>
        <tr><th>게임패스판 설치</th><td>${esc(il)}${g.install.officialMods ? ' · 공식 모드 지원' : ''}<br><span class="src" style="margin:0">${esc(idesc)}</span></td></tr>
        <tr><th>요금제</th><td>${esc(plans.join(', ') || '없음')} · ${g.naverPlus ? '<b>네이버플러스 멤버십으로 가능</b>' : '네이버플러스로는 불가'}</td></tr>
        <tr><th>연령 등급</th><td>${age == null ? '미확인' : age === 0 ? '전체이용가' : age >= 18 ? '청소년이용불가' : `${age}세 이용가`}<span class="src">게임물관리위원회</span></td></tr>
        <tr><th>장르</th><td>${esc(g.genres.map((x) => GENRES[x] || x).join(', ') || '미확인')}${g.styles.length ? ` · ${esc(g.styles.map((x) => STYLES[x]).join(', '))}<span class="src">세부 장르 추정</span>` : ''}</td></tr>
        <tr><th>Steam 태그</th><td>${esc(steam.join(', ') || '미확인')}<span class="src">Steam 사용자 태그 (SteamSpy)</span></td></tr>
        <tr><th>특징</th><td>${esc(tags.join(', ') || '미확인')}<span class="src">설명문 키워드 2번 이상 기준 추정</span></td></tr>
        <tr><th>플레이 방식</th><td>${esc(g.modes.map((x) => MODES[x]).join(', ') || '미확인')}</td></tr>
        <tr><th>기능</th><td>${esc(feats.join(', ') || '미확인')}<span class="src">스토어 표기</span></td></tr>
        <tr><th>등급 기관 표기</th><td>${esc(g.content.flags.map((x) => CONTENT[x]).join(', ') || '없음')}<span class="src">ESRB·PEGI·GRAC 내용 기술자, 가벼운 표현도 포함돼요</span></td></tr>
        <tr><th>메타크리틱</th><td>${metaCell}<span class="src">${metaSrc(g)}</span></td></tr>
        <tr><th>스토어 평점</th><td class="num">${g.rating ? `${g.rating.toFixed(1)} / 5 (${g.ratingCount.toLocaleString('ko-KR')}명)` : '미확인'}</td></tr>
        <tr><th>플레이타임</th><td>${timeCell}</td></tr>
        ${row('구매가', priceCell && `${priceCell}<br><span class="src" style="margin:0">게임패스에서 빠져도 계속 하려면 구매 필요</span>`)}
        ${row('계정 연동', pt && `${esc(PARTNER[pt][0])}<br><span class="src" style="margin:0">${esc(PARTNER[pt][1])}. 처음 실행할 때 연결 화면이 나와요</span>`)}
        ${row('접근성', access.length && `${esc(access.join(', '))}<span class="src">스토어 표기</span>`)}
        ${row('휴대용 PC', hh ? `${esc(handheldLabel(hh))}<span class="src">휴대용 PC 검증</span>` : g.handheldReady === true ? '할 만해요 (ROG Ally 등)' : '')}
        ${row('게임패스 합류', joinCell)}
        ${row('클라우드', cloudCell && esc(cloudCell))}
        ${row('설치 용량', size && `<span class="num">~${size < 10 ? size.toFixed(1) : Math.round(size)} GB</span>`)}
        ${row('최소 연령', minAge && `${minAge}세 이상<span class="src">스토어 표기</span>`)}
      </table>
      <div class="d-links">
        <a href="https://www.xbox.com/ko-KR/games/store/_/${encodeURIComponent(id)}" target="_blank" rel="noopener">웹 스토어에서 보기</a>
        ${steamUrl ? `<a href="${steamUrl}" target="_blank" rel="noopener">Steam에서 보기</a>` : ''}
        ${issue ? `<a href="${esc(issue)}" target="_blank" rel="noopener">한글패치 정보 제보·수정</a>` : ''}
      </div>
    </div>`;
  if (!$('#detail').open) {
    detailFrom = { el: document.activeElement, id };
    $('#detail').showModal();
  }
}

// 상세를 닫으면 연 곳으로 초점을 돌려준다. 그 사이 목록을 다시 그렸으면 같은 게임의 표지로
let detailFrom = null;
function restoreDetailFocus() {
  if ($('#detail').open) return;   // 닫힘 알림이 오기 전에 다시 열렸으면 그대로 둔다
  const from = detailFrom; detailFrom = null;
  if (!from) return;
  let el = from.el && from.el.isConnected && from.el !== document.body ? from.el : null;
  if (!el) {
    const sel = `[data-open="${CSS.escape(from.id)}"]`;
    el = document.querySelector(`#grid ${sel}[tabindex], #pick button${sel}, #alert ${sel}`);
  }
  if (el) el.focus();
}

// GitHub Pages(owner.github.io/repo)에서 열리면 저장소 주소를 알아낸다
function repoUrl() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return '';
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return repo ? `https://github.com/${m[1]}/${repo}` : '';
}

// ---------- 좋았던 점 고르기 ----------

let aspectId = null; let aspectSel = new Set();
function openAspect(id) {
  const g = gameOf(id);
  if (!g) return;
  aspectId = id;
  const keys = Object.keys(featureKeys(g)).filter((k) => !k.startsWith('c:'));
  const a = S.anchors[id];
  aspectSel = new Set(a.aspects && a.aspects.length ? a.aspects : keys);
  // Steam 태그가 없는 게임의 k:는 세부 장르·특징에서 옮긴 추정이라 그렇게 표시한다
  const groups = [['k', steamTagsOf(g) ? 'Steam 태그' : 'Steam 태그 (추정)'], ['s', '세부 장르'], ['g', '장르'], ['t', '특징'], ['m', '플레이 방식'], ['d', '개발사'], ['p', '퍼블리셔']];
  $('#a-body').innerHTML = `<div class="a-content">
    <h2>「${esc(g.title)}」에서 ${a.kind === 'like' ? '좋았던' : '별로였던'} 점</h2>
    <p>고른 것만 취향에 반영돼요. 예를 들어 닌자 가이덴 4는 전투만 골라 두면 스토리·전략이 섞이지 않아요.</p>
    ${groups.map(([t, label]) => {
      const ks = keys.filter((k) => k.startsWith(t + ':'));
      return ks.length ? `<div class="a-group"><h3>${label}</h3><div class="chips">${ks.map((k) => `<button type="button" class="chip ${aspectSel.has(k) ? 'on' : ''}" data-ak="${esc(k)}">${esc(featureLabel(k))}</button>`).join('')}</div></div>` : '';
    }).join('')}
  </div>`;
  $('#aspect').showModal();
}

// ---------- 게임패스 밖 게임 ----------

// microsoft.com 스토어 검색(자동완성). 게임패스 목록에 없는 게임도 찾을 수 있다
async function storeSearch(q) {
  const url = `https://www.microsoft.com/msstoreapiprod/api/autosuggest?market=ko-kr&clientId=7F27B536-CF6B-4C65-8638-A0F8CBDFCA65&sources=DCatAll-Products&filter=+ClientType:StoreWeb&counts=8&query=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const data = await res.json();
  const out = [];
  for (const set of data.ResultSets || []) {
    for (const s of set.Suggests || []) {
      const meta = Object.fromEntries((s.Metas || []).map((m) => [m.Key, m.Value]));
      if (meta.ProductType !== 'Games' || !meta.BigCatalogId) continue;
      out.push({ storeId: meta.BigCatalogId, title: s.Title, image: s.ImageUrl ? 'https:' + s.ImageUrl.split('?')[0] : '' });
    }
  }
  return out;
}

async function fetchProducts(ids, lang = 'ko-kr') {
  const url = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.join(',')}&market=KR&languages=${lang}&fieldsTemplate=Details&MS-CV=DGU1mcuYo0WMMp+F.1`;
  return (await (await fetch(url)).json()).Products || [];
}

// 스토어 상품 하나를 게임패스 게임과 같은 모양으로 분석한다 (build-data.ps1과 같은 규칙: data.rules)
async function analyzeStoreProduct(storeId) {
  let [p] = await fetchProducts([storeId]);
  if (!p) throw new Error('상품 정보를 찾지 못했어요');
  let info = p;
  if (!(p.Properties.Categories || []).length) {
    const kids = (p.DisplaySkuAvailabilities || []).flatMap((a) => (a.Sku.Properties.BundledSkus || []).map((b) => b.BigId)).filter(Boolean);
    if (kids.length) { const ch = (await fetchProducts([...new Set(kids)].slice(0, 5))).find((c) => (c.Properties.Categories || []).length); if (ch) info = ch; }
  }
  const lp = p.LocalizedProperties[0]; const ilp = info.LocalizedProperties[0];
  const text = [lp.ProductTitle, lp.ShortDescription, lp.ProductDescription, ilp.ShortDescription, ilp.ProductDescription].join(' ');
  const R = S.rules;
  const tagW = {};
  for (const [k, re] of Object.entries(R.tags)) {
    const n = (text.match(new RegExp(re, 'gi')) || []).length;
    if (n >= R.tagMinHits) tagW[k] = Math.min(1, n / 4);
  }
  const genres = info.Properties.Categories || [];
  const hit = {};
  for (const [k, re] of Object.entries(R.styles)) hit[k] = new RegExp(re, 'i').test(text);
  const makers = `${lp.PublisherName} ${lp.DeveloperName}`;
  const rpg = genres.includes('Role playing'); const action = genres.includes('Action & adventure') || genres.includes('Fighting');
  const styles = [];
  if (rpg && (hit.jrpgword || new RegExp(R.japaneseMakers, 'i').test(makers))) styles.push('jrpg');
  if (hit.turnbased) styles.push('turnbased');
  if (rpg && (hit.arpgword || (action && !hit.turnbased))) styles.push('actionrpg');
  if (hit.srpg) styles.push('srpg');
  if (hit.soulslike) styles.push('soulslike');
  if (hit.metroid) styles.push('metroidvania');
  if (hit.openworld) styles.push('openworld');
  if (action && !rpg && hit.stylish) styles.push('stylish');
  const attrs = [...(p.Properties.Attributes || []), ...(info.Properties.Attributes || [])].map((a) => a.Name);
  const modes = [];
  if (attrs.includes('SinglePlayer')) modes.push('single');
  if (attrs.some((a) => /Coop|CoOp/.test(a))) modes.push('coop');
  if (attrs.some((a) => /OnlineMultiPlayer|CrossPlatformMultiPlayer|LocalMultiPlayer|LocalMultiplayer|SharedSplitScreen/.test(a))) modes.push('multi');
  const mp = (p.MarketProperties || [])[0] || {};
  const descs = (mp.ContentRatings || []).filter((c) => ['ESRB', 'PEGI', 'GRB'].includes(c.RatingSystem)).flatMap((c) => c.RatingDescriptors || []);
  const flags = Object.entries(R.content).filter(([, re]) => descs.some((d) => new RegExp(re).test(d))).map(([k]) => k);
  const poster = [...(lp.Images || [])].find((i) => i.ImagePurpose === 'Poster') || [...(lp.Images || [])].find((i) => i.ImagePurpose === 'BoxArt');
  const g = {
    id: 'ext:' + storeId, storeId, external: true, title: lp.ProductTitle, publisher: lp.PublisherName, developer: lp.DeveloperName,
    poster: poster ? 'https:' + poster.Uri : '', genres, styles, tagW, modes, content: { flags }
  };
  // Steam 태그 자료에 같은 게임(제목 기준)이 있으면 그 태그로 게임패스 게임과 같은 공간에 놓는다.
  // 자료는 영어 이름이라 한국어 제목으로 안 맞으면 영어 제목을 한 번 더 받아 본다 (실패해도 그냥 넘어간다)
  await loadExternal();
  let rec = steamByName(lp.ProductTitle);
  if (!rec && EXT.loaded) {
    try { const [en] = await fetchProducts([storeId], 'en-us'); rec = steamByName(en && en.LocalizedProperties[0].ProductTitle); } catch (e) { /* 없이 진행 */ }
  }
  if (rec) { g.steamTags = { ...rec.tags }; g.steamAppId = rec.appid; }
  return g;
}

async function addStoreGame(storeId, kind, aspects = null) {
  // 게임패스에 있는 게임이면 그쪽으로
  const inPass = S.games.find((g) => g.ids.includes(storeId));
  if (inPass) { S.anchors[inPass.id] = { kind, aspects }; return inPass; }
  return anchorExternal(await fillAppSteam(await analyzeStoreProduct(storeId)), kind, aspects);
}

// 게임패스에 있는 게임이면 밖 게임 대신 그 게임을 기준으로 (Steam ID나 판 표기를 뗀 제목이 같을 때)
function passGameFor(g) {
  const t = normTitle(g.title);
  return S.games.find((x) => (g.steamAppId && x.steamAppId === g.steamAppId) || (t && normTitle(x.title) === t));
}

function anchorExternal(g, kind, aspects = null) {
  const inPass = passGameFor(g);
  if (inPass) { S.anchors[inPass.id] = { kind, aspects }; return inPass; }
  S.external[g.id] = g;
  S.anchors[g.id] = { kind, aspects };
  return g;
}

// 기준 칩에 붙는 출처 ("위키데이터 · Steam 태그"처럼)
function extSource(g) {
  const src = g.source === 'wikidata' ? '위키데이터' : g.storeId ? 'MS 스토어' : g.source === 'steam' ? '' : '직접 추가';
  return [src, steamTagsOf(g) ? 'Steam 태그' : ''].filter(Boolean).join(' · ');
}

// 넣은 뒤 알림: 어떤 자료로 분석했는지 말해 준다
function addedMsg(g) {
  if (!g.external) return `「${g.title}」를 취향에 넣었어요. 눌러서 좋았던 점을 고를 수 있어요`;
  if (steamTagsOf(g) && g.steamVia === 'app') return `「${g.title}」를 Steam 태그로 분석했어요 (앱에서 직접). 눌러서 좋았던 점을 고를 수 있어요`;
  if (steamTagsOf(g)) return `「${g.title}」를 Steam 태그로 분석했어요. 눌러서 좋았던 점을 고를 수 있어요`;
  if (!g.genres.length && !g.styles.length && !Object.keys(g.tagW).length) return `「${g.title}」는 장르 정보가 거의 없어요. 직접 추가로 요소를 골라 주시면 더 정확해요`;
  return `「${g.title}」를 ${g.source === 'wikidata' ? '위키데이터 장르로' : '취향에'} 넣었어요. 눌러서 좋았던 점을 고를 수 있어요`;
}

// ---------- 다른 플랫폼 게임 (Steam 태그·위키데이터) ----------

// 판·플랫폼 표기를 떼고 비교한다 ("The Witcher 3: Wild Hunt – Complete Edition" = "The Witcher 3: Wild Hunt")
const EDITION_RE = /\b(?:digital\s+)?(?:complete|definitive|deluxe|standard|ultimate|gold|digital|enhanced|premium|launch)\s+edition\b|\bgame of the year(?: edition)?\b|\bgoty\b|\bfor windows(?: 10| 11)?\b|\bwindows(?: 10)? edition\b|\bxbox series x\|s\b|\bxbox one\b|\bpc\b|(?:디지털\s*)?(?:디럭스|컴플리트|얼티밋|스탠다드|골드|디지털|디피니티브)\s*에디션|[™®©]/gi;
const normTitle = (s) => norm(String(s || '').replace(EDITION_RE, ' '));
const steamPoster = (appid) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

// data/external.json: 게임패스 밖 게임의 Steam 사용자 태그. 처음 검색할 때 한 번만 받고, 없으면(404) 장르만으로 간다
const EXT = { list: [], byApp: new Map(), byName: new Map(), loaded: false };
let extJob = null; let extFailedAt = 0;
function loadExternal() {
  if (EXT.loaded) return Promise.resolve(EXT);
  if (extJob) return extJob;
  if (Date.now() - extFailedAt < 60000) return Promise.resolve(EXT);   // 방금 실패했으면 잠시 다시 묻지 않는다
  extJob = fetch('data/external.json', { cache: 'no-cache' }).then((res) => {
    if (!res.ok) throw new Error('external.json ' + res.status);
    return res.json();
  }).then((d) => {
    for (const r of (d && d.games) || []) {
      if (!Number.isInteger(r.appid) || !r.name || !r.tags) continue;
      const rec = { ...r, n: norm(r.name), nt: normTitle(r.name) };
      EXT.list.push(rec); EXT.byApp.set(r.appid, rec);
      if (!EXT.byName.has(rec.nt)) EXT.byName.set(rec.nt, rec);
    }
    EXT.loaded = true;
    return EXT;
  }).catch(() => { extFailedAt = Date.now(); return EXT; })   // 파일이 없거나 쓰는 중이어도 나머지는 동작
    .finally(() => { extJob = null; });
  return extJob;
}
const steamByName = (name) => (name ? EXT.byName.get(normTitle(name)) || null : null);
// 세부 장르를 고를 때 쓸 만큼 센 Steam 태그만
const strongTags = (rec) => Object.entries(rec.tags || {}).filter(([, w]) => Number(w) >= 0.5).map(([t]) => t);

// 위키데이터·Steam 장르(영어) -> 스토어 장르, 세부 장르
const GENRE_MAP = [
  [/role-?playing|\brpg\b/i, 'Role playing'], [/action|adventure/i, 'Action & adventure'], [/shoot/i, 'Shooter'],
  [/strateg|tactic/i, 'Strategy'], [/simulat/i, 'Simulation'], [/sport/i, 'Sports'], [/racing|driving|flight/i, 'Racing & flying'],
  [/puzzle|trivia/i, 'Puzzle & trivia'], [/fighting/i, 'Fighting'], [/platform/i, 'Platformer'], [/music|rhythm/i, 'Music']
];
const STYLE_MAP = [
  [/japanese role-?playing|\bjrpg\b/i, 'jrpg'], [/turn-?based/i, 'turnbased'], [/action role-?playing|action rpg/i, 'actionrpg'],
  [/tactical role-?playing|strategy role-?playing|strategy rpg|tactical rpg/i, 'srpg'], [/souls-?like/i, 'soulslike'],
  [/metroidvania/i, 'metroidvania'], [/open[- ]world/i, 'openworld'], [/hack and slash|hack-and-slash|character action/i, 'stylish']
];
function mapGenres(labels, makers = '', styleLabels = []) {
  const genres = new Set(); const styles = new Set();
  for (const l of labels) GENRE_MAP.forEach(([re, x]) => { if (re.test(l)) genres.add(x); });
  for (const l of [...labels, ...styleLabels]) STYLE_MAP.forEach(([re, x]) => { if (re.test(l)) styles.add(x); });
  // 스토어 분석과 같은 규칙: 일본 제작사의 RPG는 JRPG로 본다
  if (genres.has('Role playing') && makers.trim() && S.rules && new RegExp(S.rules.japaneseMakers, 'i').test(makers)) styles.add('jrpg');
  return { genres: [...genres], styles: [...styles] };
}

// external.json의 게임 하나(또는 앱에서 직접 받은 같은 모양의 자료)를 밖 게임으로
function steamGame(rec) {
  const { genres, styles } = mapGenres(rec.genres || [], '', strongTags(rec));
  const g = {
    id: 'steam:' + rec.appid, external: true, source: 'steam', steamAppId: rec.appid, title: rec.name, poster: steamPoster(rec.appid),
    publisher: '', developer: '', genres, styles, tagW: {}, modes: [], content: { flags: [] }, steamTags: { ...rec.tags }
  };
  if (rec.viaApp) g.steamVia = 'app';
  if (rec.metacritic) { g.metacritic = rec.metacritic; g.metacriticUrl = rec.metacriticUrl || ''; }
  return g;
}

async function addSteamGame(appid, kind) {
  await loadExternal();
  // 사전에 없으면 Windows 앱에서는 SteamSpy로 바로 받아 같은 모양으로 만든다
  const rec = EXT.byApp.get(appid) || (S.native ? await appSteamRec(appid, appNames.get(appid)) : null);
  if (!rec) throw new Error('Steam 자료에 없는 게임이에요');
  return anchorExternal(steamGame(rec), kind);
}

// ---------- Windows 앱 전용: Steam 프록시 ----------
// exe(WebView2) 안에서는 https://curator.app/proxy/ 가 Steam·SteamSpy를 대신 불러 준다 (app/README.md).
// 웹·PWA에는 이 주소가 없으므로 S.native일 때만 부른다

// 시작할 때 한 번: exe 안인지 알아본다 (2초 안에 답이 없으면 웹으로 본다). 시작을 막지 않는다
async function detectNative() {
  if (location.hostname !== 'curator.app') return;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 2000);
  try {
    const res = await fetch('/proxy/ping', { signal: ctl.signal, cache: 'no-store' });
    const d = res.ok ? await res.json() : null;
    S.native = !!(d && d.ok === true);
  } catch (e) { S.native = false; } finally { clearTimeout(timer); }
}

async function proxyJson(path, ms = 15000) {
  if (!S.native) throw new Error('앱 밖에서는 프록시가 없어요');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(path, { signal: ctl.signal });
    if (!res.ok) throw new Error('proxy ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Steam 상점 검색 결과 -> [{ appid, name, image }]. 같은 검색어는 다시 묻지 않는다
const appFound = new Map(); const appNames = new Map();
async function appSteamSearch(term) {
  if (appFound.has(term)) return appFound.get(term);
  const d = await proxyJson(`/proxy/steam-search?term=${encodeURIComponent(term)}`);
  const out = ((d && d.items) || []).filter((x) => x && Number.isInteger(Number(x.id)) && Number(x.id) > 0 && x.name)
    .map((x) => ({ appid: Number(x.id), name: String(x.name), image: typeof x.tiny_image === 'string' ? x.tiny_image : '' }));
  out.forEach((x) => appNames.set(x.appid, x.name));
  appFound.set(term, out);
  return out;
}

// SteamSpy 태그 -> 사전(fetch-external.ps1)과 같은 무게: 표가 많은 15개, 가장 많은 표를 1로 (소수 둘째 자리)
function topSteamTags(tags) {
  if (!isObj(tags)) return null;
  const top = Object.entries(tags).map(([t, v]) => [t, Number(v) || 0]).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!top.length) return null;
  const max = top[0][1];
  return Object.fromEntries(top.map(([t, v]) => [t, Math.round((v / max) * 100) / 100]));
}

// 앱에서 직접 받은 Steam 자료를 external.json 항목과 같은 모양으로 ({ appid, name, tags, genres } + 메타크리틱).
// 태그를 못 받으면 null. 상점 정보(steam-app)는 덤이라 실패해도 태그만으로 간다
const appRecs = new Map();
function appSteamRec(appid, name = '') {
  if (!S.native || !Number.isInteger(appid) || appid <= 0) return Promise.resolve(null);
  if (appRecs.has(appid)) return appRecs.get(appid);
  const job = (async () => {
    const spy = await proxyJson(`/proxy/steamspy?appid=${appid}`);
    const tags = topSteamTags(spy && spy.tags);
    if (!tags) return null;
    const genres = String((spy && spy.genre) || '').split(/\s*,\s*/).filter(Boolean);
    const rec = { appid, name: name || (spy && spy.name) || '', tags, genres, viaApp: true };
    try {
      const d = await proxyJson(`/proxy/steam-app?appid=${appid}`);
      const app = d && d[String(appid)];
      if (app && app.success && isObj(app.data)) {
        const a = app.data;
        if (!rec.name && a.name) rec.name = String(a.name);
        for (const x of Array.isArray(a.genres) ? a.genres : []) if (x && x.description && !rec.genres.includes(x.description)) rec.genres.push(String(x.description));
        const m = a.metacritic && Number(a.metacritic.score);
        if (m > 0) { rec.metacritic = m; rec.metacriticUrl = typeof a.metacritic.url === 'string' ? a.metacritic.url : ''; }
      }
    } catch (e) { /* 태그만으로 */ }
    if (!rec.name) rec.name = `Steam ${appid}`;
    return rec;
  })().catch(() => null);
  appRecs.set(appid, job);
  job.then((r) => { if (!r) appRecs.delete(appid); });   // 실패는 기억하지 않는다 (다음에 다시)
  return job;
}

// Steam ID는 있는데 태그가 없는 밖 게임(예: 사전에 없는 위키데이터 항목): 앱에서 태그를 받아 채운다. 실패하면 그대로
async function fillAppSteam(g) {
  if (!S.native || !g || steamTagsOf(g) || !Number.isInteger(g.steamAppId)) return g;
  const rec = await appSteamRec(g.steamAppId);
  if (!rec) return g;
  const s = steamGame(rec);
  g.steamTags = s.steamTags; g.steamVia = 'app';
  if (!g.genres.length && !g.styles.length) { g.genres = s.genres; g.styles = s.styles; }
  else g.styles = [...new Set([...g.styles, ...s.styles])];
  if (!g.poster || /wikimedia\.org/.test(g.poster)) g.poster = s.poster;
  if (s.metacritic && !metaOf(g)) { g.metacritic = s.metacritic; g.metacriticUrl = s.metacriticUrl; }
  return g;
}

// 위키데이터: 키 없이 브라우저에서 바로 부를 수 있다(origin=*). PS·스위치 독점작도 있다
const WD_API = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
// P31(무엇인가): 비디오 게임·오픈소스 게임·리마스터·확장팩·리메이크·DLC·합본. 시리즈·프랜차이즈·회사·인물은 뺀다
const WD_GAME = new Set(['Q7889', 'Q21125433', 'Q65963104', 'Q209163', 'Q4393107', 'Q1066707', 'Q16070115']);
const WD_NOT = new Set(['Q7058673', 'Q196600', 'Q1137109', 'Q210167', 'Q4830453', 'Q5']);
const wdEnt = new Map(); const wdLab = new Map(); const wdFound = new Map();
const wdVals = (e, p) => ((e.claims || {})[p] || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value)
  .filter(Boolean).map((v) => (typeof v === 'object' ? v.id : v));
const wdText = (e, key, lang) => (e[key] && e[key][lang] ? e[key][lang].value : '');

async function wdFetch(ids, props, langs) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(`${WD_API}&action=wbgetentities&ids=${ids.slice(i, i + 50).join('|')}&props=${props}&languages=${langs}`);
    Object.assign(out, (await res.json()).entities || {});
  }
  return out;
}

async function wdEntities(ids) {
  const need = [...new Set(ids)].filter((id) => !wdEnt.has(id));
  if (need.length) for (const [id, e] of Object.entries(await wdFetch(need, 'claims|labels|descriptions', 'ko|en|mul'))) wdEnt.set(id, e);
  return ids.map((id) => wdEnt.get(id)).filter((e) => e && !('missing' in e));
}

// 장르·제작사 항목의 이름만 (영어 우선: 장르 대응표와 스토어 제작사 이름이 영어라서).
// 회사 이름은 영어 칸 없이 공통 이름(mul)에만 있는 경우가 많다
async function wdLabels(ids) {
  const need = [...new Set(ids)].filter((id) => !wdLab.has(id));
  if (need.length) {
    for (const [id, e] of Object.entries(await wdFetch(need, 'labels', 'en|mul|ko'))) {
      wdLab.set(id, wdText(e, 'labels', 'en') || wdText(e, 'labels', 'mul') || wdText(e, 'labels', 'ko'));
    }
  }
  return (id) => wdLab.get(id) || '';
}

function wdIsGame(e) {
  const types = wdVals(e, 'P31');
  if (types.some((t) => WD_NOT.has(t))) return false;
  if (types.some((t) => WD_GAME.has(t))) return true;
  // 분류가 낯설어도 설명에 게임이라고 적혀 있으면 받는다 (회사·인물·시리즈는 빼고)
  const d = `${wdText(e, 'descriptions', 'ko')} ${wdText(e, 'descriptions', 'en')}`;
  return /video ?game|게임/i.test(d) && !/series|시리즈|franchise|프랜차이즈|company|회사|developer|개발사|publisher|배급사|designer|디자이너|character|캐릭터|등장인물|console|콘솔|engine|엔진/i.test(d);
}

const wdBrief = (e) => ({
  qid: e.id, label: wdText(e, 'labels', 'ko') || wdText(e, 'labels', 'en') || wdText(e, 'labels', 'mul') || e.id,
  en: wdText(e, 'labels', 'en') || wdText(e, 'labels', 'mul'),
  desc: wdText(e, 'descriptions', 'ko') || wdText(e, 'descriptions', 'en'),
  steamIds: wdVals(e, 'P1733').map(Number).filter(Number.isInteger)
});

// 한국어로 먼저 찾고, 3개가 안 되면 영어로도 찾는다
async function wdSearch(q) {
  if (wdFound.has(q)) return wdFound.get(q);
  const find = async (lang) => ((await (await fetch(`${WD_API}&action=wbsearchentities&language=${lang}&uselang=ko&type=item&limit=7&search=${encodeURIComponent(q)}`)).json()).search || []).map((h) => h.id);
  let ids = await find('ko');
  if (ids.length < 3) ids = [...new Set([...ids, ...(await find('en'))])];
  const out = (await wdEntities(ids)).filter(wdIsGame).map(wdBrief);
  wdFound.set(q, out);
  return out;
}

// 위키데이터 항목 하나를 밖 게임으로: Steam ID(P1733)가 Steam 태그 자료에 있으면 그 태그를, 없으면 장르로
async function analyzeWikidata(qid) {
  const [e] = await wdEntities([qid]);
  if (!e) throw new Error('위키데이터 항목을 찾지 못했어요');
  const b = wdBrief(e);
  let genreIds = wdVals(e, 'P136');
  // 리마스터·이식판처럼 장르가 비어 있으면 원작(P144)의 장르를 한 번만 따라간다
  if (!genreIds.length) {
    const base = wdVals(e, 'P144')[0];
    if (base) { const [o] = await wdEntities([base]); if (o) genreIds = wdVals(o, 'P136'); }
  }
  const devIds = wdVals(e, 'P178').slice(0, 2); const pubIds = wdVals(e, 'P123').slice(0, 2);
  const name = await wdLabels([...genreIds, ...devIds, ...pubIds]);
  const developer = devIds.map(name).find(Boolean) || ''; const publisher = pubIds.map(name).find(Boolean) || '';
  await loadExternal();
  const rec = b.steamIds.map((id) => EXT.byApp.get(id)).find(Boolean) || steamByName(b.en);
  const labels = genreIds.map(name).filter(Boolean);
  // 위키데이터에 장르가 없으면 Steam 장르로 채운다
  const { genres, styles } = mapGenres(labels.length ? labels : (rec && rec.genres) || [], `${developer} ${publisher}`, rec ? strongTags(rec) : []);
  const file = wdVals(e, 'P18')[0];
  const g = {
    id: 'wd:' + qid, wikidata: qid, external: true, source: 'wikidata', title: b.label,
    poster: rec ? steamPoster(rec.appid) : file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200` : '',
    publisher, developer, genres, styles, tagW: {}, modes: [], content: { flags: [] }
  };
  if (rec) { g.steamTags = { ...rec.tags }; g.steamAppId = rec.appid; }
  else if (b.steamIds.length) g.steamAppId = b.steamIds[0];
  return g;
}

async function addWikidataGame(qid, kind) {
  return anchorExternal(await fillAppSteam(await analyzeWikidata(qid)), kind);
}

// 스토어에도 없는 게임(예: PS 독점): 이름과 요소를 직접 고른다
let customSel = new Set();
function openCustom(name) {
  customSel = new Set();
  const sec = (title, obj, prefix) => `<div class="a-group"><h3>${title}</h3><div class="chips">${Object.entries(obj).map(([k, v]) => `<button type="button" class="chip" data-ck="${prefix}${k}">${esc(v)}</button>`).join('')}</div></div>`;
  $('#c-body').innerHTML = `<div class="a-content">
    <h2 id="c-title">직접 추가</h2>
    <p>스토어에서 못 찾은 게임은 이름과 좋았던 요소를 직접 골라 주세요.</p>
    <input class="c-name" id="c-name" value="${esc(name)}" aria-label="게임 이름">
    ${sec('세부 장르', STYLES, 's:')}${sec('장르', GENRES, 'g:')}${sec('특징', TAGS, 't:')}
  </div>`;
  $('#custom').showModal();
}

// ---------- 검색 ----------

let suggestTimer = null; let suggestSeq = 0;
function updateSuggest() {
  const raw = $('#t-search').value.trim();
  const q = norm(raw);
  const box = $('#t-suggest');
  if (!q) { box.hidden = true; return; }
  const local = S.games.filter((g) => norm(g.title).includes(q)).slice(0, 5);
  const row = (id, title, image, sub, attr) => `<div class="sg-row">
      ${image ? `<img src="${esc(image)}" alt="">` : '<span></span>'}
      <span class="sg-title">${esc(title)}<span class="sg-sub">${esc(sub)}</span></span>
      <span class="sg-btns"><button class="btn small" ${attr}="like" data-id="${esc(id)}">좋아요</button><button class="btn small" ${attr}="dislike" data-id="${esc(id)}">별로</button></span>
    </div>`;
  const localHtml = local.length ? `<div class="sg-head">게임패스</div>${local.map((g) => row(g.id, g.title, img(g.poster, 64), '게임패스에 있음', 'data-sug')).join('')}` : '';
  const customHtml = `<div class="sg-head">목록에 없나요?</div><div class="sg-row"><span></span><span class="sg-title">「${esc(raw)}」 직접 추가<span class="sg-sub">이름과 좋았던 요소를 골라요</span></span><span class="sg-btns"><button class="btn small" data-custom="${esc(raw)}">추가</button></span></div>`;
  const latin = /^[\x20-\x7e]+$/.test(raw) && q.length >= 2;   // Steam 자료는 영어 이름뿐이라 영어로 찾을 때만
  const useApp = S.native && q.length >= 2;   // Windows 앱에서만 Steam 상점을 직접 찾는다
  const st = { store: null, wd: null, app: null };   // null = 찾는 중, 'fail' = 실패
  const seq = ++suggestSeq;

  // 칸 순서: 게임패스 -> MS 스토어 -> Steam -> 위키데이터 -> (앱) Steam 직접 검색 -> 직접 추가. 결과가 오는 대로 다시 그린다
  const draw = () => {
    if (seq !== suggestSeq || box.hidden) return;
    // 같은 게임이 여러 칸에 나오지 않게: 앞 칸에 나온 제목(판 표기 뗀 것)·Steam ID는 뒤 칸에서 뺀다
    const titles = new Set(local.map((g) => normTitle(g.title)));
    const apps = new Set(local.map((g) => g.steamAppId).filter(Boolean));
    const take = (names, ids = []) => {
      const ts = names.map(normTitle).filter(Boolean);
      if (ts.some((t) => titles.has(t)) || ids.some((a) => apps.has(a))) return false;
      ts.forEach((t) => titles.add(t)); ids.forEach((a) => apps.add(a));
      return true;
    };
    const wait = '<div class="sg-empty">찾는 중…</div>';
    let html = localHtml + '<div class="sg-head">Microsoft 스토어 (게임패스 밖 게임 포함)</div>';
    if (st.store === null) html += wait;
    else if (st.store === 'fail') html += '<div class="sg-empty">스토어 검색에 실패했어요. 아래 다른 플랫폼 게임이나 직접 추가를 써 주세요.</div>';
    else {
      const found = st.store.filter((r) => !local.some((g) => g.ids.includes(r.storeId)) && take([r.title])).slice(0, 6);
      html += found.length ? found.map((r) => {
        const inPass = S.games.find((g) => g.ids.includes(r.storeId));
        return row(r.storeId, r.title, r.image ? r.image + '?w=64' : '', inPass ? '게임패스에 있음' : '게임패스에 없음', 'data-store');
      }).join('') : '<div class="sg-empty">스토어에서 찾지 못했어요</div>';
    }
    if (latin && EXT.loaded) {
      const hits = EXT.list.filter((r) => r.n.includes(q))
        .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || a.n.length - b.n.length)
        .slice(0, 12).filter((r) => take([r.name], [r.appid])).slice(0, 5);
      if (hits.length) {
        html += '<div class="sg-head">Steam 게임</div>' + hits.map((r) => row(r.appid, r.name, steamPoster(r.appid), 'Steam 사용자 태그로 비교해요', 'data-steam')).join('');
      }
    }
    html += '<div class="sg-head">다른 플랫폼 게임 (위키데이터)</div>';
    if (st.wd === null) html += wait;
    else if (st.wd === 'fail') html += '<div class="sg-empty">위키데이터 검색에 실패했어요</div>';
    else {
      const found = st.wd.filter((w) => take([w.label, w.en], w.steamIds)).slice(0, 6);
      html += found.length ? found.map((w) => {
        const tagged = w.steamIds.some((a) => EXT.byApp.has(a));
        return row(w.qid, w.label, '', [w.desc, tagged ? 'Steam 태그 있음' : ''].filter(Boolean).join(' · ') || '위키데이터', 'data-wd');
      }).join('') : '<div class="sg-empty">위키데이터에서 게임을 찾지 못했어요</div>';
    }
    // 앞 칸에 이미 나온 게임(Steam ID·제목)은 빼고 남은 것만
    if (useApp) {
      html += '<div class="sg-head">Steam (앱에서 직접 검색)</div>';
      if (st.app === null) html += wait;
      else if (st.app === 'fail') html += '<div class="sg-empty">Steam 검색에 실패했어요</div>';
      else {
        const found = st.app.filter((r) => take([r.name], [r.appid])).slice(0, 5);
        // 게임패스에 있는 게임이면 누를 때 그 게임으로 들어간다 (anchorExternal)
        const sub = (r) => (S.games.some((g) => g.steamAppId === r.appid) ? '게임패스에 있음'
          : EXT.byApp.has(r.appid) ? 'Steam 사용자 태그로 비교해요' : 'Steam 태그를 앱에서 받아 비교해요');
        html += found.length ? found.map((r) => row(r.appid, r.name, r.image, sub(r), 'data-steam')).join('')
          : '<div class="sg-empty">더 찾은 Steam 게임이 없어요</div>';
      }
    }
    box.innerHTML = html + customHtml;
  };
  box.hidden = false;
  draw();

  clearTimeout(suggestTimer);
  if (!EXT.loaded) loadExternal().then(draw);   // 처음 검색할 때 Steam 태그 자료를 받아 둔다
  suggestTimer = setTimeout(() => {
    if (seq !== suggestSeq) return;
    storeSearch(raw).then((r) => { st.store = r; }, () => { st.store = 'fail'; }).then(draw);
    wdSearch(raw).then((r) => { st.wd = r; }, () => { st.wd = 'fail'; }).then(draw);
    if (useApp) appSteamSearch(raw).then((r) => { st.app = r; }, () => { st.app = 'fail'; }).then(draw);
  }, 350);
}

// ---------- 취향 조작 ----------

function setAnchor(id, kind) {
  if (S.anchors[id] && S.anchors[id].kind === kind) delete S.anchors[id];
  else S.anchors[id] = { kind, aspects: S.anchors[id] ? S.anchors[id].aspects : null };
  S.shown = PAGE; render();
}

// 예시 게임 하나 찾기: 게임패스 -> Steam 태그 자료 -> MS 스토어 -> 위키데이터 순.
// Steam 태그가 붙는 곳을 앞에 둔다. 한 곳이 실패해도 다음으로 넘어간다
async function resolveExample({ ko, en }) {
  const inPass = S.games.find((g) => normTitle(g.title) === normTitle(en) || norm(g.title).includes(norm(ko)));
  if (inPass) { S.anchors[inPass.id] = { kind: 'like', aspects: null }; return inPass; }
  const rec = steamByName(en);
  if (rec) return anchorExternal(steamGame(rec), 'like');
  try {
    // 스토어 검색은 DLC·의상 세트가 먼저 나올 때가 많아, 그런 것은 빼고 이름이 들어간 것 중 가장 짧은 제목(본편)을 고른다.
    // 본편이 없으면 위키데이터로 넘어간다
    const addon = /dlc|팩|세트|의상|bgm|패스|pass|pack|set|확장|expansion|번들|bundle|사운드트랙|soundtrack|블러드 앤드 와인|하츠 오브 스톤/i;
    const r = (await storeSearch(ko)).filter((x) => norm(x.title).includes(norm(ko)) && !addon.test(x.title))
      .sort((a, b) => a.title.length - b.title.length)[0];
    if (r) return await addStoreGame(r.storeId, 'like');
  } catch (e) { /* 위키데이터로 */ }
  const w = (await wdSearch(en))[0];
  return w ? addWikidataGame(w.qid, 'like') : null;
}

// 프로젝트를 만든 사람의 취향 예시. 진 여신전생 V 벤전스·위쳐 3·페르소나 3 리로드는 Steam 태그 자료·스토어·위키데이터에서 불러오고,
// 닌자 가이덴 4는 전투만 좋았던 것으로 둔다. 페르소나 5 로열(긴 일상 파트가 루즈)은 JRPG·턴제 자체를 깎게 되므로 넣지 않는다
async function loadExample() {
  S.anchors = {}; S.keywords = { 's:jrpg': 1, 's:turnbased': 1, 't:explore': 1, 't:story': 1, 't:collect': 1, 't:growth': 1, 't:emotional': 1, 't:mystery': 1, 't:music': 1 };
  S.f.age = '15';
  syncFilterInputs(); render();
  toast('예시 취향을 불러오는 중이에요…');
  const wants = [
    { ko: '진 여신전생 V Vengeance', en: 'Shin Megami Tensei V: Vengeance' },
    { ko: '위쳐 3', en: 'The Witcher 3: Wild Hunt' },
    { ko: '페르소나 3 리로드', en: 'Persona 3 Reload' }
  ];
  const got = [];
  await loadExternal();
  for (const w of wants) {
    try {
      const g = await resolveExample(w);
      if (g) got.push(g.title);
    } catch (e) { /* 한 게임을 못 찾아도 나머지는 진행 */ }
  }
  const ng = S.games.find((g) => /ninja gaiden 4|닌자\s*가이덴\s*4/i.test(g.title));
  if (ng) {
    // 전투에 해당하는 Steam 태그도 같이 남긴다 (실제 태그든 옮긴 추정 태그든 그 게임에 있는 것만)
    const B = bridge();
    const combatTags = ['Combat', 'Hack and Slash', 'Character Action Game', "Beat 'em up", 'Fast-Paced', 'Difficult', B['t:combat'], B['s:stylish']];
    const has = featureKeys(ng);
    const aspects = ['t:combat', 's:stylish', ...combatTags.filter(Boolean).map((t) => 'k:' + t)].filter((k, i, a) => has[k] && a.indexOf(k) === i);
    S.anchors[ng.id] = { kind: 'like', aspects: aspects.length ? aspects : ['t:combat'] };
    got.push(ng.title + ' (전투만)');
  }
  S.shown = PAGE; render();
  toast(`예시 취향: ${got.join(', ') || '요소만'} · 15세 이용가까지`);
}

function shareLink() {
  const ext = {};
  for (const id of Object.keys(S.anchors)) if (S.external[id]) ext[id] = S.external[id];
  const payload = JSON.stringify({ a: S.anchors, k: S.keywords, e: ext });
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
    const t = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    S.anchors = t.a || {}; S.keywords = t.k || {}; Object.assign(S.external, t.e || {});
    toast('링크의 취향을 불러왔어요');
  } catch (e) { toast('취향 링크를 읽지 못했어요'); }
  history.replaceState(null, '', location.pathname);
}

// ---------- 내 데이터 내보내기·가져오기 ----------
// 웹·설치한 앱(PWA)·Windows 앱(WebView2)은 저장 공간이 따로라 파일로 옮긴다

const BACKUP_VERSION = 2;
function backupData() {
  const external = {};
  for (const id of Object.keys(S.anchors)) if (S.external[id]) external[id] = S.external[id];   // 기준으로 쓰는 밖 게임만
  return { version: BACKUP_VERSION, anchors: S.anchors, external, keywords: S.keywords, status: S.status, f: S.f };
}
const backupBlob = () => new Blob([JSON.stringify(backupData(), null, 1)], { type: 'application/json' });
const backupName = () => `gamepass-curator-backup-${todayStr().replace(/-/g, '')}.json`;

// Blob + a[download]: 브라우저와 WebView2(Windows 앱) 둘 다 내려받기가 된다
function exportBackup() {
  try {
    const url = URL.createObjectURL(backupBlob());
    const a = document.createElement('a');
    a.href = url; a.download = backupName(); a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`${backupName()} 파일로 내보냈어요`);
  } catch (e) { toast('내보내지 못했어요. 다시 해 주세요'); }
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// 파일 내용을 검사해 쓸 수 있는 것만 남긴다. 모양이 아예 다르면 null
function parseBackup(raw) {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isObj(d) || d.version !== BACKUP_VERSION) return null;
  if (!['anchors', 'keywords', 'status'].every((k) => isObj(d[k])) || (d.external != null && !isObj(d.external)) || (d.f != null && !isObj(d.f))) return null;
  const anchors = {}; const external = {}; const keywords = {}; const status = {};
  for (const [id, g] of Object.entries(d.external || {})) {
    if (isObj(g) && typeof g.title === 'string' && /^(ext|steam|wd|custom):/.test(id)) {
      external[id] = Object.assign({ genres: [], styles: [], tagW: {}, modes: [], content: { flags: [] } }, g, { id, external: true });
    }
  }
  for (const [id, a] of Object.entries(d.anchors)) {
    if (!isObj(a) || !['like', 'dislike'].includes(a.kind)) continue;
    const aspects = Array.isArray(a.aspects) ? a.aspects.filter((k) => typeof k === 'string') : null;
    anchors[id] = { kind: a.kind, aspects: aspects && aspects.length ? aspects : null };
  }
  for (const [k, v] of Object.entries(d.keywords)) if (v === 1 || v === -1) keywords[k] = v;
  for (const [id, v] of Object.entries(d.status)) if (STATUS[v]) status[id] = v;
  return { anchors, external, keywords, status, f: normFilters(d.f) };
}

// 지금 데이터를 파일 내용으로 바꾼다 (합치지 않는다). 바꾸기 전에 묻는다
function importBackup(raw) {
  let b = null;
  try { b = parseBackup(raw); } catch (e) { b = null; }
  if (!b) { toast('읽을 수 없는 파일이에요. 이 앱에서 내보낸 JSON 파일인지 확인해 주세요'); return false; }
  // 데이터에 없는 게임은 취향에서 뺀다 (main과 같은 규칙)
  if (S.games.length) for (const id of Object.keys(b.anchors)) if (!S.byId.has(id) && !b.external[id]) delete b.anchors[id];
  const nA = Object.keys(b.anchors).length; const nK = Object.keys(b.keywords).length; const nS = Object.keys(b.status).length;
  if (!confirm(`지금 취향·내 목록·필터를 파일 내용으로 바꿀까요?\n\n파일: 기준 게임 ${nA}개 · 요소 ${nK}개 · 내 목록 ${nS}개\n지금 데이터는 지워져요.`)) {
    toast('가져오기를 취소했어요'); return false;
  }
  S.anchors = b.anchors; S.external = b.external; S.keywords = b.keywords; S.status = b.status; S.f = b.f;
  S.shown = PAGE; S.showFar = false;
  syncFilterInputs(); render();
  toast(`가져왔어요: 기준 게임 ${nA}개 · 요소 ${nK}개 · 내 목록 ${nS}개`);
  return true;
}

// ---------- 이벤트 ----------

function bind() {
  const onFilter = (key, prop = 'value') => (e) => { S.f[key] = e.target[prop]; S.shown = PAGE; render(); };
  $('#f-plan').addEventListener('change', onFilter('plan'));
  $('#f-platform').addEventListener('change', onFilter('platform'));
  $('#f-korean').addEventListener('change', onFilter('korean'));
  $('#f-age').addEventListener('change', onFilter('age'));
  $('#f-time').addEventListener('change', onFilter('time'));
  $('#f-leaving').addEventListener('change', onFilter('leaving', 'checked'));
  $('#f-new').addEventListener('change', onFilter('fresh', 'checked'));
  $('#f-hidedone').addEventListener('change', onFilter('hidedone', 'checked'));
  $('#f-sort').addEventListener('change', onFilter('sort'));
  $('#f-reset').addEventListener('click', () => { S.f = defaultFilters(); syncFilterInputs(); S.shown = PAGE; render(); });
  $('#q').addEventListener('input', (e) => { S.q = e.target.value; S.shown = PAGE; render(); });
  $('#f-quick').addEventListener('click', () => { S.f.quick = !S.f.quick; S.shown = PAGE; render(); });
  $('#f-mix').addEventListener('click', () => { S.f.mix = !S.f.mix; S.shown = PAGE; render(); });
  // 곧 빠지는 게임 알림: 제목을 누르면 상세, 닫기는 이 게임 묶음을 기억한다
  $('#alert').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { openDetail(open.dataset.open); return; }
    const x = e.target.closest('[data-dismiss]');
    if (!x) return;
    try { localStorage.setItem(ALERT_KEY, x.dataset.dismiss); } catch (err) { /* 이번만 닫힌다 */ }
    $('#alert').hidden = true;
  });

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chipFilter = (sel, attr, key) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest(`[data-${attr}]`); if (!b) return;
    S.f[key] = toggleIn(S.f[key], b.dataset[attr]); renderFilterChips(); S.shown = PAGE; render();
  });
  chipFilter('#f-genres', 'genre', 'genres');
  chipFilter('#f-styles', 'style', 'styles');
  chipFilter('#f-modes', 'mode', 'modes');
  chipFilter('#f-features', 'feature', 'features');

  // 요소 칩: 없음 -> 좋아요 -> 별로예요 -> 없음
  $('#t-keywords').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kw]'); if (!b) return;
    const k = b.dataset.kw; const v = S.keywords[k];
    if (!v) S.keywords[k] = 1; else if (v > 0) S.keywords[k] = -1; else delete S.keywords[k];
    S.shown = PAGE; render();
  });
  $('#t-anchors').addEventListener('click', (e) => {
    const x = e.target.closest('[data-remove]');
    if (x) { delete S.anchors[x.dataset.remove]; render(); return; }
    const a = e.target.closest('[data-aspect]');
    if (a) openAspect(a.dataset.aspect);
  });

  $('#t-search').addEventListener('input', updateSuggest);
  $('#t-search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#t-search').value = ''; updateSuggest(); } });
  $('#t-suggest').addEventListener('click', async (e) => {
    const local = e.target.closest('[data-sug]');
    const store = e.target.closest('[data-store]');
    const custom = e.target.closest('[data-custom]');
    const wd = e.target.closest('[data-wd]');
    const steam = e.target.closest('[data-steam]');
    const ext = store || wd || steam;
    if (local) S.anchors[local.dataset.id] = { kind: local.dataset.sug, aspects: null };
    if (custom) { openCustom(custom.dataset.custom); }
    if (ext) {
      const label = ext.textContent;
      ext.disabled = true; ext.textContent = '분석 중…';
      try {
        const id = ext.dataset.id;
        const g = store ? await addStoreGame(id, store.dataset.store)
          : wd ? await addWikidataGame(id, wd.dataset.wd) : await addSteamGame(Number(id), steam.dataset.steam);
        toast(addedMsg(g));
      } catch (err) {
        ext.disabled = false; ext.textContent = label;
        toast(`${store ? '스토어' : wd ? '위키데이터' : 'Steam'} 정보를 불러오지 못했어요. 직접 추가를 써 주세요`);
        return;
      }
    }
    if (local || ext) { $('#t-search').value = ''; $('#t-suggest').hidden = true; S.shown = PAGE; render(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) $('#t-suggest').hidden = true; });

  $('#t-example').addEventListener('click', loadExample);
  $('#t-share').addEventListener('click', shareLink);
  $('#t-clear').addEventListener('click', () => { S.anchors = {}; S.keywords = {}; S.shown = PAGE; render(); });

  // 카드·1순위·상세의 버튼은 한 곳에서 처리한다
  const onAct = (e) => {
    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('[data-act]')) { openDetail(open.dataset.open); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { id, val } = b.dataset;
    if (b.dataset.act === 'anchor') setAnchor(id, val);
    else { if (S.status[id] === val) delete S.status[id]; else S.status[id] = val; render(); }
    if ($('#detail').open) openDetail(id);
  };
  $('#grid').addEventListener('click', onAct);
  $('#pick').addEventListener('click', onAct);
  $('#d-body').addEventListener('click', onAct);
  $('#more').addEventListener('click', () => { S.shown += PAGE; render(); });
  $('#far').addEventListener('click', () => { S.showFar = !S.showFar; render(); });

  $('#a-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ak]'); if (!b) return;
    const k = b.dataset.ak;
    if (aspectSel.has(k)) aspectSel.delete(k); else aspectSel.add(k);
    b.classList.toggle('on');
  });
  $('#a-all').addEventListener('click', () => { S.anchors[aspectId].aspects = null; $('#aspect').close(); render(); });
  $('#a-done').addEventListener('click', () => {
    const all = Object.keys(featureKeys(gameOf(aspectId))).filter((k) => !k.startsWith('c:'));
    S.anchors[aspectId].aspects = aspectSel.size && aspectSel.size < all.length ? [...aspectSel] : null;
    $('#aspect').close(); render();
  });

  $('#c-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ck]'); if (!b) return;
    const k = b.dataset.ck;
    if (customSel.has(k)) customSel.delete(k); else customSel.add(k);
    b.classList.toggle('on');
  });
  $('#c-cancel').addEventListener('click', () => $('#custom').close());
  $('#c-save').addEventListener('click', () => {
    const name = $('#c-name').value.trim();
    if (!name || !customSel.size) { toast('이름과 요소를 하나 이상 골라 주세요'); return; }
    const pick = (p) => [...customSel].filter((k) => k.startsWith(p)).map((k) => k.slice(2));
    const id = 'custom:' + Date.now();
    S.external[id] = { id, external: true, title: name, poster: '', genres: pick('g:'), styles: pick('s:'),
      tagW: Object.fromEntries(pick('t:').map((t) => [t, 1])), modes: [], content: { flags: [] } };
    S.anchors[id] = { kind: 'like', aspects: null };
    $('#custom').close(); $('#t-search').value = ''; $('#t-suggest').hidden = true; render();
  });

  document.querySelectorAll('.nav-item').forEach((t) => t.addEventListener('click', () => {
    setTab(t.dataset.tab); S.shown = PAGE; S.showFar = false; render();
    if (window.matchMedia('(max-width: 860px)').matches) toggleSide(false);
    window.scrollTo({ top: 0 });
  }));

  // 휴대폰: 사이드바(메뉴·필터)를 버튼으로 펼친다
  $('#side-toggle').addEventListener('click', () => toggleSide());

  // 켜 둔 필터 칩: 눌러서 하나씩 끄거나 모두 지운다
  $('#active-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear], [data-clear-all]'); if (!b) return;
    if (b.hasAttribute('data-clear-all')) { S.f = Object.assign(defaultFilters(), { sort: S.f.sort }); S.q = ''; $('#q').value = ''; }
    else clearFilter(b.dataset.clear);
    syncFilterInputs(); S.shown = PAGE; render();
    // 지운 칩이 사라지므로 초점을 남은 첫 칩으로
    const next = $('#active-filters [data-clear]');
    if (next) next.focus();
  });

  // 취향 패널 접기·펴기
  $('#t-fold').addEventListener('click', () => { setTasteFolded(true); $('#t-edit').focus(); });
  $('#t-edit').addEventListener('click', () => { setTasteFolded(false); $('#t-fold').focus(); });

  // 내 데이터 내보내기·가져오기
  $('#b-export').addEventListener('click', exportBackup);
  $('#b-import').addEventListener('click', () => { $('#b-file').value = ''; $('#b-file').click(); });
  $('#b-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    let text = '';
    try { text = await file.text(); } catch (err) { toast('파일을 읽지 못했어요'); return; }
    importBackup(text);
  });

  // 키보드: role="button"인 표지는 Enter·Space로 상세를 연다
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('[role="button"][data-open]');
    if (!el || el !== e.target) return;
    e.preventDefault();
    openDetail(el.dataset.open);
  });
  $('#detail').addEventListener('close', restoreDetailFocus);
}

function toggleSide(force) {
  const side = document.querySelector('.side');
  const open = force ?? !side.classList.contains('open');
  side.classList.toggle('open', open);
  $('#side-toggle').setAttribute('aria-expanded', String(open));
  sideToggleLabel();
}

// ---------- 앱 설치 (PWA) ----------

let installEvent = null;
function setupInstall() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 기능만 빠진다 */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null; $('#install').hidden = true;
  });
  window.addEventListener('appinstalled', () => toast('앱으로 설치했어요. 시작 메뉴에서 열 수 있어요'));
}

// ---------- 시작 ----------

async function main() {
  loadState();
  importFromHash();
  bind();
  setupInstall();
  detectNative();   // 기다리지 않는다 (Windows 앱이 아니면 아무것도 묻지 않는다)
  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    S.data = await res.json();
  } catch (e) {
    $('#grid').innerHTML = '<div class="empty">게임 데이터를 불러오지 못했어요. 로컬에서 열었다면 scripts/serve.ps1로 서버를 띄워 주세요.</div>';
    return;
  }
  S.games = S.data.games;
  S.rules = S.data.rules;
  S.games.forEach((g) => S.byId.set(g.id, g));
  S.firstMin = S.games.map(firstSeenOf).filter(Boolean).sort()[0] || '';
  // 데이터가 갱신되며 사라진 게임은 취향에서 뺀다 (게임패스 밖 게임은 남긴다)
  for (const id of Object.keys(S.anchors)) if (!gameOf(id)) delete S.anchors[id];
  $('#data-date').textContent = `한국 · ${S.data.generatedAt.slice(0, 10)} 기준`;
  const repo = repoUrl();
  if (repo) $('#repo-link').href = repo; else $('#repo-link').hidden = true;
  E = Recommend.create({ games: S.games, rules: S.rules });
  syncFilterInputs();
  render();
}

main();
