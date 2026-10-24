# 게임패스 큐레이터

게임패스에 있는 600개 넘는 게임 중에서 내가 재미있게 할 만한 게임을 골라 주는 웹페이지예요. 재미있게 한 게임 몇 개를 고르면 비슷한 게임을 추천하고(왓챠처럼), 한국어로 할 수 있는지, 내 요금제로 되는지, 아이 옆에서 해도 되는지를 같이 보여 줘요.

[xKorean](https://play.google.com/store/apps/details?id=com.mg2000.xkorean)이 한국어 지원 여부를 알려 준다면, 이 프로젝트는 그 위에 "그래서 나는 뭘 하면 되나"를 얹는 쪽이에요.

> Microsoft·Xbox·네이버와 관계없는 개인 오픈소스 프로젝트예요.

## 할 수 있는 것

- **취향 기반 추천**: 좋아한 게임·별로였던 게임을 고르면 장르, 특징, 플레이 방식이 비슷한 게임에 점수를 매기고 이유를 붙여 줘요. 게임패스에 없는 인생 게임은 "탐험", "스토리", "감성·여운" 같은 요소로 표현하면 돼요.
- **한국어 판정**: 공식 지원(스토어 표기), 유저 한글패치(검색 추정), 한국어 추가 예정, 없음을 구분해요. 한글패치는 근거 글 링크를 같이 보여 줘요.
- **게임패스판에서 한글패치가 되는지**: 게임패스 PC판은 게임마다 설치 형식이 달라요. 2026년 10월 기준 PC 게임 550개 중 394개(MSIXVC)는 파일에 접근할 수 있고, 23개(EAppx·UWP)는 막혀 있어요. 뉴 슈퍼 럭키즈 테일처럼 "스팀판 패치는 게임패스판에 안 먹힌다"는 경우를 미리 걸러요.
- **요금제 필터**: Essential, Premium, PC Game Pass, Ultimate, 그리고 **네이버플러스 멤버십**(PC 게임패스 혜택)으로 할 수 있는지.
- **아이 옆 모드**: ESRB·PEGI·GRAC 내용 기술자를 기준으로 유혈, 잔혹, 강한 폭력, 선정성, 노출이 있는 게임을 빼요. 공포는 따로 끌 수 있어요.
- **내 목록**: 관심, 플레이 중, 완료, 포기. 브라우저에만 저장되고 서버로 가지 않아요.
- **곧 종료 / 최근 추가** 표시, **취향 링크 공유**.

## 데이터를 믿어도 되는 정도

각 정보 옆에 출처를 적어 두었어요. 지어낸 값은 없고, 모르는 건 "미확인"으로 둬요.

| 정보 | 출처 | 신뢰도 |
|---|---|---|
| 게임 목록, 요금제, 출시일, 장르, 평점 | Microsoft 스토어 (비공식 API) | 스토어와 같음 |
| 한국어 공식 지원 | 스토어의 지원 언어 목록 | 대체로 맞지만 틀릴 때가 있어요 (공식 한국어인 Stardew Valley가 미지원으로 나오는 등) |
| 유저 한글패치 | 네이버 검색 결과를 규칙으로 분류 | **추정**. 근거 글을 꼭 확인하세요 |
| 게임패스판 설치 형식 | 스토어의 PC 패키지 형식 | 구조상 가능성이지, 실제 작동 확인은 아니에요 |
| 특징 태그 (탐험, 스토리 등) | 스토어 설명문 키워드 | **추정** |
| 가족 필터 항목 | ESRB·PEGI·GRAC 내용 기술자 | 등급 기관 표기 그대로 |
| 메인 플레이타임 | 아직 없음 | 미확인으로 표시 |

## 추천은 이렇게 계산해요

1. 게임마다 특성 벡터를 만들어요. 장르(1.0) > 특징 태그(0.8) > 플레이 방식(0.4) > 내용 기술자·퍼블리셔(0.3) 순으로 무게를 주고, 많은 게임에 흔한 특성(전투는 403개 게임에 있어요)일수록 IDF로 덜 중요하게 봐요.
2. 좋아한 게임 벡터는 더하고, 별로였던 게임은 0.8배로 빼고, 고른 요소를 더해 내 취향 벡터를 만들어요.
3. 취향 벡터와 각 게임의 코사인 유사도가 점수예요. 1등을 100으로 맞춰 보여 줘요.
4. 이유는 점수에 가장 크게 기여한 특성과, 가장 닮은 "좋아한 게임"에서 나와요.

전부 브라우저 안에서 계산하고, AI API는 쓰지 않아요. 코드는 [docs/app.js](docs/app.js)에 있어요.

## 로컬에서 실행

Windows라면 따로 설치할 게 없어요. PowerShell에서:

```powershell
# 1. 게임패스 데이터 받기 (2~3분)
powershell -ExecutionPolicy Bypass -File scripts/build-data.ps1

# 2. 웹페이지 띄우기 -> http://localhost:8080
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

`docs/index.html`을 그냥 더블클릭하면 브라우저가 데이터 파일을 못 읽어서 2번이 필요해요.

### 한글패치 검색 (선택)

네이버 검색 API는 네이버 클라우드의 **NAVER API HUB**로 옮겨갔어요. 예전 developers.naver.com 키는 안 돼요.

1. [네이버 클라우드 콘솔](https://console.ncloud.com/naver-api-hub/subscription)에서 검색 API를 구독하고 Client ID·Secret을 받아요.
2. 키를 넣고 검색 → 데이터 다시 빌드:

```powershell
$env:NAVER_CLIENT_ID = "..."; $env:NAVER_CLIENT_SECRET = "..."
powershell -ExecutionPolicy Bypass -File scripts/search-korean-patch.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-data.ps1
```

한국어 미지원 게임 59개를 검색하는 데 API 호출이 약 180번 들어요. 한 번 검색한 결과는 `data/naver-cache/`에 남아서 다음에는 새 게임만 검색해요. 검색 결과 검토표는 `data/patch-candidates.md`에 나와요.

검색 결과에서 걸러내는 오탐은 이런 것들이에요: 모든 게임 페이지에 "공략·트레이너·한글패치"를 붙이는 사이트, 트레이너(치트 프로그램) 번역, 라인업·할인 목록 글, 다른 기종판(iso·롬) 글, 이름이 겹치는 다른 게임("Ark Nova", "Psychonauts 2").

## GitHub에 올려서 쓰기

1. 이 저장소를 GitHub에 올려요.
2. **Settings → Pages**에서 Source를 `Deploy from a branch`, 브랜치 `main`, 폴더 `/docs`로 정해요. `https://<아이디>.github.io/<저장소>/`에서 열려요.
3. **Settings → Secrets and variables → Actions**에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 넣으면 한글패치 검색도 자동으로 돌아요. 안 넣으면 카탈로그만 갱신해요.
4. [데이터 갱신 워크플로](.github/workflows/update-data.yml)가 매일 한국 시간 새벽 3시에 데이터를 새로 받아 커밋해요. Actions 탭에서 손으로 돌려도 돼요.

## 기여하기

가장 도움이 되는 건 **한글패치가 게임패스 PC판에서 실제로 되는지** 알려 주시는 거예요. 검색으로는 끝까지 알 수 없는 부분이라서요.

- 웹페이지에서 게임을 열고 "한글패치 정보 제보·수정"을 누르면 이슈 양식이 열려요.
- 직접 고치려면 [data/overrides.json](data/overrides.json)에 항목을 추가하는 PR을 보내 주세요. 형식은 파일 안에 예시가 있어요. 사람이 확인한 정보는 자동 수집보다 우선해요.
- 패치 파일 자체는 올리지 말고 원래 배포처 링크만 남겨 주세요.

## 폴더 구성

```
docs/                 웹페이지 (GitHub Pages가 이 폴더를 그대로 배포)
  data/games.json     웹페이지가 읽는 게임 데이터 (빌드 결과)
scripts/
  build-data.ps1      게임패스 목록·상세·설치 형식 수집, 한글패치·수동 수정 병합
  search-korean-patch.ps1  네이버 검색으로 한글패치 후보 찾기
  serve.ps1           로컬 웹서버
data/
  catalog.json        상품 단위 목록 (한글패치 검색 입력)
  patch-candidates.*  한글패치 검색 결과와 검토표
  overrides.json      사람이 바로잡은 한국어 정보
```

## 알려진 한계

- 게임 목록 API(`catalog.gamepass.com`, `displaycatalog.mp.microsoft.com`)는 xbox.com이 내부적으로 쓰는 비공식 주소예요. Microsoft가 바꾸면 수집이 깨져요. 목록이 100개 미만으로 나오면 빌드를 멈추고 기존 데이터를 덮어쓰지 않아요.
- 한국어 미지원 게임은 스토어에 영어 제목만 있어서 "Stardew Valley 한글패치"처럼 영어로만 검색해요. 한국어 제목으로 쓴 글은 놓칠 수 있어요.
- 메인 플레이타임, 메타스코어, 게임 템포는 아직 없어요. HowLongToBeat·OpenCritic·IGDB 연동이 다음 후보예요.
- 같은 게임의 PC판·콘솔판은 제목으로 묶어서, 이름이 많이 다르면 따로 나올 수 있어요.

## 라이선스

[MIT](LICENSE). 게임 이름, 이미지, 설명의 권리는 각 게임사와 Microsoft에 있어요.
