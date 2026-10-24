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
