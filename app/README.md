# 게임패스 큐레이터 — Windows 앱

웹 페이지(`docs/`)를 그대로 담은 Windows 데스크톱 프로그램입니다. 브라우저를 열지 않고 일반 프로그램처럼 실행할 수 있어요.

## 실행

1. [Releases](../../releases)에서 `GamepassCurator-win-x64.zip`을 받아 원하는 곳에 압축을 풉니다.
2. `GamepassCurator\GamepassCurator.exe`를 실행합니다. 바탕화면이나 시작 메뉴에 두고 싶으면 exe의 바로 가기를 만들면 됩니다.

- `web` 폴더와 DLL 파일은 exe 옆에 그대로 있어야 합니다.
- **Microsoft Edge WebView2 런타임**이 필요합니다. Windows 11에는 기본으로 들어 있고, 없으면 실행할 때 다운로드 안내 창이 뜹니다.
- 코드 서명을 하지 않은 exe라서 처음 실행할 때 SmartScreen 경고("Windows의 PC 보호")가 뜰 수 있습니다. **추가 정보 → 실행**을 누르면 됩니다.

## 하는 일

- exe 안에는 빌드할 때의 `docs/` 사본(`web` 폴더)이 들어 있어서 인터넷이 없어도 바로 열립니다.
- 시작할 때마다 GitHub Pages에서 최신 `games.json`을 받아 `%LOCALAPPDATA%\GamepassCurator`에 저장하고, 내장 데이터보다 새것이면 그걸 보여 줍니다. 오프라인이면 내장 데이터를 씁니다.
- 외부 링크는 기본 브라우저로, "Xbox 앱에서 열기"는 Xbox 앱으로 엽니다.
- 취향·목록 같은 설정과 로그(`app.log`)도 `%LOCALAPPDATA%\GamepassCurator`에 저장됩니다. 지우면 처음 상태로 돌아갑니다.

## Steam 프록시 (exe 전용)

브라우저에서는 CORS 때문에 Steam API를 직접 부를 수 없지만, exe 안의 페이지는 `https://curator.app/proxy/`로 부를 수 있습니다. 미리 계산된 데이터에 없는 게임을 찾아볼 때 씁니다.

| 주소 (GET) | 실제로 부르는 곳 |
|---|---|
| `/proxy/ping` | 없음. `{"ok":true,"version":"1.0.0"}`을 돌려줍니다. 페이지가 exe 안에서 열렸는지 알아볼 때 씁니다. |
| `/proxy/steam-search?term=텍스트` | `store.steampowered.com/api/storesearch/?term=…&cc=kr&l=koreana` |
| `/proxy/steamspy?appid=숫자` | `steamspy.com/api.php?request=appdetails&appid=…` |
| `/proxy/steam-app?appid=숫자` | `store.steampowered.com/api/appdetails?appids=…&cc=kr&l=koreana&filters=basic,metacritic,genres` |

- 받은 JSON을 손대지 않고 그대로 돌려줍니다.
- 위 세 곳 말고는 부르지 않습니다. `term`은 100자 이하, `appid`는 숫자만 받고, 같은 이름의 파라미터가 두 번 오면 거절합니다(400).
- 같은 요청은 10분 동안 메모리에 캐시합니다. SteamSpy는 1.1초, store.steampowered.com은 1.5초 간격을 지키도록 요청을 줄 세워 기다립니다.
- 시간 제한은 10초이고, Steam 쪽에서 실패하거나 JSON이 아닌 응답이 오면 `502`와 `{"error":"..."}`를 돌려줍니다.
- 페이지에서는 `fetch('/proxy/ping')`이 성공하면 exe 안이라고 보면 됩니다.

점검: `GamepassCurator.exe --selftest`는 창을 띄우지 않고 프록시 경로(입력 검사·캐시·간격 제한 포함)로 "Persona 5 Royal" / appid 1687950을 실제로 조회한 뒤, 결과를 `app.log`에 남기고 종료 코드 0(통과)/1(실패)로 끝납니다.

## 빌드

.NET SDK가 없어도 됩니다. Windows에 기본으로 있는 .NET Framework 4.x 컴파일러를 씁니다.

```powershell
.\scripts\build-exe.ps1            # 버전 1.0.0
.\scripts\build-exe.ps1 -Version 1.2.0
```

- 처음 한 번 WebView2 SDK(NuGet 패키지)를 `app\.build`에 받아 두고 다음부터 재사용합니다.
- 결과물: `dist\GamepassCurator\` 폴더와 `dist\GamepassCurator-win-x64.zip`
- `v*` 태그를 푸시하면 GitHub Actions(`.github/workflows/release.yml`)가 같은 스크립트로 빌드해 Release에 zip을 올립니다.

```powershell
git tag v1.0.0
git push origin v1.0.0
```
