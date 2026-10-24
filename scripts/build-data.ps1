# 게임패스 큐레이터 데이터 빌드
# 1) 요금제별 게임 목록(catalog.gamepass.com sigls)  2) 상품 상세(displaycatalog)
# 3) PC 설치 형식(한글패치 적용 가능성)  4) 한글패치 검색 결과·수동 수정 병합
# 5) 게임패스 앱 상세(플레이 시간·가격·접근성·휴대기기·클라우드)  6) 출시 예정 목록(games[]와 별도)
# 결과: data/catalog.json (상품 단위, 한글패치 검색 입력용), docs/data/games.json (웹앱용, 게임 단위)
#
# 두 API 모두 Microsoft 비공식 엔드포인트(xbox.com 페이지가 쓰는 것)라 언제든 바뀔 수 있다.
# Windows PowerShell 5.1과 PowerShell 7 모두에서 돈다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/build-data.ps1 [-Market KR] [-Language ko-kr]

param(
    [string]$Market = "KR",
    [string]$Language = "ko-kr"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path $PSScriptRoot -Parent
$DataDir = Join-Path $Root "data"
$WebDataDir = Join-Path $Root "docs\data"
New-Item -ItemType Directory -Force $DataDir, $WebDataDir | Out-Null

# xbox.com/xbox-game-pass/games 페이지 스크립트(xgpcatPopulate-2025.js)에서 확인한 값 (2026-10-24)
$Tiers = [ordered]@{
    ultimate  = @{ Sigl = "97c6c862-d28a-4907-a3d5-c401f2296a53"; Sub = "cfq7ttc0khs0" }
    premium   = @{ Sigl = "09a72c0d-c466-426a-9580-b78955d8173a"; Sub = "cfq7ttc0p85b" }
    essential = @{ Sigl = "34031711-5a70-4196-bab7-45757dc2294e"; Sub = "cfq7ttc0k5dj" }
    pcgp      = @{ Sigl = "609d944c-d395-4c0a-9ea4-e9f39b52c1ad"; Sub = "cfq7ttc0kgq8" }
}
$Platforms = [ordered]@{ pc = "pc"; console = "ConsoleGen8;ConsoleGen9" }
# 특별 목록(sigls/v2). 콘솔·PC 목록이 따로 있어 합집합으로 쓴다
$ExtraLists = [ordered]@{
    recentlyAdded = @("06323672-b8c8-43cc-b0de-32d5a9834749")
    leavingSoon   = @("393f05bf-e596-4ef6-9487-6d4fa0eab987", "cc7fc951-d00f-410e-9e02-5e4628e04163")
    comingSoon    = @("095bda36-f5cd-43f2-9ee1-0a72f371fb96", "4165f752-d702-49c8-886b-fb57936f6bae")
    familyKids    = @("8e7cd765-1293-44e0-95bb-8257e2bf0221", "0f0bccc0-cdc8-4e1a-bfca-4b7da5c6c418")   # Xbox의 "가족 및 어린이" 모음
    eaPlay        = @("b8900d09-a491-44cc-916e-32b5acae621b", "1d33fbb9-b895-4732-a8ca-a55c8b99fa2c")
    ubisoft       = @("a5a535fb-d926-4141-9ce4-9f6af8ca22e7", "9c09d734-1c45-4740-ae7f-fd73ff629880", "66ec875c-a391-44f5-9a54-a28bd6f976ce")
}

# ---------- 공통 ----------

# PS 5.1은 응답 인코딩을 잘못 읽을 때가 있어 바이트를 UTF-8로 직접 디코딩한다. 일시적 연결 오류는 3번까지 재시도.
function Get-Json([string]$url) {
    foreach ($try in 1..3) {
        try {
            $res = Invoke-WebRequest -UseBasicParsing -Uri $url
            return [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray()) | ConvertFrom-Json
        } catch {
            if ($try -eq 3) { throw }
            Start-Sleep -Seconds (2 * $try)
        }
    }
}

# PowerShell 7은 JSON 날짜를 DateTime으로 바꾸므로 둘 다 처리한다
function Format-Day($v) {
    if (-not $v) { return $null }
    if ($v -is [datetime]) { return $v.ToUniversalTime().ToString("yyyy-MM-dd") }
    ([string]$v).Substring(0, 10)
}

function Get-Compact([string]$t) { ($t.ToLower() -replace '[^\p{L}\p{N}]', '') }

# PC판·콘솔판, 판본 이름이 달라도 같은 게임으로 묶기 위한 키
function Get-GroupKey([string]$t) {
    $t = $t -replace '[™®©]', '' -replace '\([^)]*\)', '' -replace '\[[^\]]*\]', ''
    $t = $t -replace "(?i)\s*[-–:]\s*([\w'’]+\s+){0,3}editions?\s*$", ''
    $t = $t -replace "(?i)\s+(standard|deluxe|definitive|complete|ultimate|gold|premium|enhanced|special|legendary|anniversary|game of the year|goty)\s+editions?\s*$", ''
    $t = $t -replace '\s*([가-힣]+\s+)?에디션\s*$', '' -replace '(?i)\s*-?\s*(PC|for windows|windows 10|windows)\s*$', ''
    Get-Compact $t
}

function Get-Products([string[]]$ids) {
    $out = @()
    for ($i = 0; $i -lt $ids.Count; $i += 20) {
        $batch = $ids[$i..([Math]::Min($i + 19, $ids.Count - 1))] -join ","
        $out += (Get-Json ("https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=$batch&market=$Market" +
                           "&languages=$Language&fieldsTemplate=Details&MS-CV=DGU1mcuYo0WMMp+F.1")).Products
        Write-Progress -Activity "상품 상세 조회" -PercentComplete ([Math]::Min(100, ($i + 20) * 100 / $ids.Count))
    }
    Write-Progress -Activity "상품 상세 조회" -Completed
    $out
}

# ---------- 게임패스 앱 상세(hydration) ----------
# Xbox PC 앱이 쓰는 엔드포인트. 플레이 시간(HowLongToBeat)·가격·접근성·휴대기기 검증 등 displaycatalog에 없는 값이 있다.
# 역시 비공식이라, 실패해도 빌드는 계속하고 해당 필드만 비운다.

function Invoke-JsonPost([string]$url, [string]$body, [hashtable]$headers) {
    foreach ($try in 1..3) {
        try {
            $res = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $url -ContentType "application/json" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body))
            return [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray()) | ConvertFrom-Json
        } catch {
            if ($try -eq 3) { throw }
            Start-Sleep -Seconds (2 * $try)
        }
    }
}

# 상품 id -> hydration 상품. 응답은 { Products: { "<id>": {...} }, InvalidIds: [...] } 형태
function Get-Hydration([string[]]$ids) {
    $map = @{}
    $lp = $Language -split '-'
    $lang = if ($lp.Count -eq 2) { "$($lp[0])-$($lp[1].ToUpper())" } else { $Language }
    $url = "https://catalog.gamepass.com/products?market=$Market&language=$lang&hydration=PCLowAmber0"
    $failed = 0
    for ($i = 0; $i -lt $ids.Count; $i += 20) {
        $batch = @($ids[$i..([Math]::Min($i + 19, $ids.Count - 1))])
        $body = @{ Products = $batch } | ConvertTo-Json -Compress
        try {
            $r = Invoke-JsonPost $url $body @{ "calling-app-name" = "Garrison" }
            if ($r.Products) { foreach ($pr in $r.Products.PSObject.Properties) { if ($pr.Value) { $map[$pr.Name] = $pr.Value } } }
        } catch { $failed++ }
        Write-Progress -Activity "게임패스 앱 상세 조회" -PercentComplete ([Math]::Min(100, ($i + 20) * 100 / [Math]::Max(1, $ids.Count)))
    }
    Write-Progress -Activity "게임패스 앱 상세 조회" -Completed
    if ($failed) { Write-Host "  hydration 묶음 $failed 개 실패 (해당 게임은 플레이 시간·가격 등이 비게 됨)" -ForegroundColor Yellow }
    $map
}

# HowLongToBeat 초 -> 시간. 표본이 적은(isReliable 아님) 값은 크게 틀릴 수 있어 버린다
function Get-HydPlaytime($h) {
    $t = $h.howLongToBeat.time
    if (-not $t -or "$($t.isReliable)" -ne 'True') { return $null }
    $hours = { param($s) $v = 0.0; if ([double]::TryParse("$s", [ref]$v) -and $v -gt 0) { [Math]::Round($v / 3600, 1) } else { $null } }
    $o = [ordered]@{ main = (& $hours $t.main); mainPlus = (& $hours $t.mainPlus); completionist = (& $hours $t.completionist) }
    if ($null -eq $o.main -and $null -eq $o.mainPlus -and $null -eq $o.completionist) { return $null }
    $o
}

# 게임패스 가입자 가격은 PC·콘솔이 다를 수 있어, PC판이 있는 게임은 PC 가격을 쓴다
function Get-HydPrice($h, [bool]$pc) {
    $msrp = $h.prices.msrp
    if (-not $msrp -or $null -eq $msrp.value) { return $null }
    $gp = if ($pc) { $h.prices.pcGamePassPrice } else { $h.prices.consoleGamePassPrice }
    [ordered]@{
        msrp     = [double]$msrp.value
        gamePass = if ($gp -and $null -ne $gp.value) { [double]$gp.value } else { $null }
        discount = if ($gp -and $gp.discountPercentage) { [int]$gp.discountPercentage } else { $null }
        currency = if ($msrp.currencyCode) { [string]$msrp.currencyCode } else { "KRW" }
    }
}

# accessibilityFeatures는 { 분류: { 기능키: { tag: "현지화 이름" } } } 형태라 tag만 모은다
function Get-HydAccessibility($h) {
    $a = $h.accessibilityFeatures
    if (-not $a) { return @() }
    @($a.PSObject.Properties | ForEach-Object { $_.Value.PSObject.Properties } | ForEach-Object { $_.Value.tag } | Where-Object { $_ } | Sort-Object -Unique)
}

# 설치 크기는 maxInstallSizeInBytes가 0으로 오는 상품이 많아 다운로드 크기로 대신한다
function Get-HydSizeGB($h) {
    $b = [double]$h.maxInstallSizeInBytes
    if ($b -le 0) { $b = [double]$h.maxDownloadSizeInBytes }
    if ($b -le 0) { return $null }
    # 50MB 미만 게임이 0GB로 반올림되지 않게 최소 0.1GB
    [Math]::Max(0.1, [Math]::Round($b / 1e9, 1))
}

# 휴대기기(ROG Xbox Ally 등)에서 할 만한지. hhVerified.deviceEvaluation이 Verified/Playable이거나
# availablePlatforms에 "Handheld"가 있으면 true (평가가 없는 게임도 플랫폼 목록에는 들어 있는 경우가 있다)
function Test-HydHandheld($h) {
    if ($h.hhVerified -and "$($h.hhVerified.deviceEvaluation)" -match '^(Verified|Playable)$') { return $true }
    [bool](@($h.availablePlatforms) -contains 'Handheld')
}

# 게임패스 앱의 메타크리틱 점수. metascore가 0이면 점수 없음으로 본다. { score, url } 또는 $null
function Get-HydMetacritic($h) {
    $m = $h.metacritic
    $v = 0.0
    if (-not $m -or -not [double]::TryParse("$($m.metascore)", [ref]$v) -or $v -le 0) { return $null }
    [ordered]@{ score = [int][Math]::Round($v); url = if ($m.url) { [string]$m.url } else { $null } }
}

function Get-PcPackages($p) {
    @($p.DisplaySkuAvailabilities | ForEach-Object { $_.Sku.Properties.Packages } |
      Where-Object { $_ -and ($_.PlatformDependencies.PlatformName -contains 'Windows.Desktop') })
}

# ---------- 분류 규칙 ----------

# 설치 형식 -> 파일 교체형 한글패치 적용 가능성 (구조상 가능성일 뿐 실제 작동 여부는 아님)
function Get-InstallClass([string[]]$formats, [string]$publisher, [bool]$hasPc) {
    if (-not $hasPc) { return "console" }
    if ($formats.Count -eq 0 -and $publisher -match '(?i)electronic arts|ubisoft|blizzard|riot|라이엇') { return "launcher" }
    if ($formats.Count -eq 0) { return "unknown" }
    if ($formats | Where-Object { $_ -match '^(EAppx|EAppxBundle|EMsix|EMsixBundle)$' }) { return "protected" }
    if ($formats -contains 'MSIXVC') { return "accessible" }
    if ($formats | Where-Object { $_ -match '^(Appx|AppxBundle|Msix|MsixBundle)$' }) { return "uwp" }
    "unknown"
}

# 등급 기관 내용 기술자(ESRB/PEGI/GRAC) -> 가족 필터 항목
$ContentRules = [ordered]@{
    blood    = '^ESRB:(Blo|BloGor|AniBlo)$'
    gore     = '^(ESRB:BloGor|PEGI:ExtVio)$'
    violence = '^(ESRB:IntVio|PEGI:StrVio|PEGI:ExtVio)$'
    sexual   = '^(ESRB:(SexCon|StrSexCon|SexThe|SugThe|MilSexThe|MilSugThe)|GRB:Sxu|PEGI:(Sex|SexInn))$'
    nudity   = '^ESRB:(Nud|ParNud)$'
    horror   = '^(PEGI:(Fea|Hor)|GRB:FeaHorThr)$'
    language = '^(ESRB:StrLan|PEGI:(BadLan|StrLang))$'
    drugs    = '^(ESRB:(UseDru|UseDruAndAlc|DruRef)|PEGI:Dru|GRB:AlcTobDru)$'
    gambling = '^(GRB:Gmb|ESRB:SimGam|PEGI:SimGam)$'
}

# 스토어 상품 속성(Attributes) -> 기능 키. 같은 뜻의 속성 이름이 여러 개라 묶는다 (웹앱 필터가 이 키를 쓴다)
$FeatureRules = [ordered]@{
    playAnywhere    = @('XPA')
    cloudSaves      = @('XblCloudSaves')
    seriesOptimized = @('ConsoleGen9Optimized')
    '4k'            = @('Capability4k')
    hdr             = @('CapabilityHDR')
    '120fps'        = @('120fps')
    raytracing      = @('RayTracing')
    couch           = @('XblLocalCoop', 'CoopSupportLocal', 'SharedSplitScreen', 'XblLocalMultiPlayer', 'LocalMultiplayer')
    crossplay       = @('XblCrossPlatformMultiPlayer', 'XblCrossPlatformCoop', 'CrossPlatformMultiPlayer', 'CrossPlatformCoOp')
    controller      = @('PcGamePad')
    onlineCoop      = @('XblOnlineCoop', 'CoopSupportOnline')
    onlineMulti     = @('XblOnlineMultiPlayer', 'OnlineMultiplayerWithGold')
}

# 키 순서를 규칙 순서로 고정해 빌드마다 결과가 같게 한다
function Get-Features($attrs) {
    $a = @($attrs)
    @($FeatureRules.Keys | Where-Object { $names = $FeatureRules[$_]; $a | Where-Object { $names -contains $_ } })
}

# 우리 스타일·태그 키 -> Steam 태그. 웹앱이 Steam에 없는 게임도 Steam 태그와 같은 축으로 비교하게 한다
$SteamBridge = [ordered]@{
    's:jrpg' = 'JRPG'; 's:turnbased' = 'Turn-Based Combat'; 's:actionrpg' = 'Action RPG'; 's:srpg' = 'Tactical RPG'
    's:soulslike' = 'Souls-like'; 's:metroidvania' = 'Metroidvania'; 's:openworld' = 'Open World'; 's:stylish' = 'Hack and Slash'
    't:explore' = 'Exploration'; 't:story' = 'Story Rich'; 't:combat' = 'Combat'; 't:strategy' = 'Strategy'; 't:growth' = 'RPG'
    't:collect' = 'Crafting'; 't:survival' = 'Survival'; 't:horror' = 'Horror'; 't:puzzle' = 'Puzzle'; 't:coop' = 'Co-op'
    't:roguelike' = 'Roguelike'; 't:simulation' = 'Simulation'; 't:racing' = 'Racing'; 't:sports' = 'Sports'
    't:emotional' = 'Emotional'; 't:mystery' = 'Mystery'; 't:family' = 'Family Friendly'; 't:shooter' = 'Shooter'
    't:stealth' = 'Stealth'; 't:music' = 'Great Soundtrack'
}

# data/steam.json(scripts/fetch-steam.ps1 결과)을 상품 id -> 기록으로 읽는다. 없거나 수집 중이라 깨져 있으면 빈 표
function Read-SteamMap([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    try { $j = Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json }
    catch { Write-Host "  steam.json 읽기 실패(무시): $($_.Exception.Message)" -ForegroundColor Yellow; return $map }
    if ($j) { foreach ($pr in $j.PSObject.Properties) { if ($pr.Value) { $map[$pr.Name] = $pr.Value } } }
    $map
}

# ---------- 게임패스 등록 기록(data/history.json) ----------
# { "<대표 상품 id>": { firstSeen, lastSeen, title } }. 빌드마다 지금 목록에 있는 게임의 lastSeen을 오늘로 바꾸고,
# 처음 보는 게임은 firstSeen도 오늘로 넣는다. 목록에서 빠진 게임은 lastSeen이 그대로 남아 "최근 빠진 게임"이 된다.
# 주의: 이 기록을 처음 만드는 빌드에서는 모든 게임의 firstSeen이 그날이 된다 (실제 추가일을 알 방법이 없음).
# 그래서 daysOnPass는 기록을 시작한 날부터 센 값이고, 시간이 지나야 의미가 생긴다.
# 날짜는 한국 시간 기준 (워크플로는 UTC 18시 = 한국 새벽 3시에 돈다)
$HistoryRegap = 14   # 빠졌다가 이 일수보다 오래 지나 다시 들어온 게임은 새로 추가된 것으로 보고 firstSeen을 다시 잡는다

function Get-KstToday { (Get-Date).ToUniversalTime().AddHours(9).Date }

function Read-History([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    try { $j = Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json }
    catch { Write-Host "  history.json 읽기 실패(새로 시작): $($_.Exception.Message)" -ForegroundColor Yellow; return $map }
    if ($j) {
        foreach ($pr in $j.PSObject.Properties) {
            $v = $pr.Value
            if (-not $v -or -not $v.firstSeen -or -not $v.lastSeen) { continue }
            $map[$pr.Name] = [ordered]@{ firstSeen = Format-Day $v.firstSeen; lastSeen = Format-Day $v.lastSeen; title = [string]$v.title }
        }
    }
    $map
}

# 키 순서를 고정해 커밋 diff가 바뀐 항목만 보이게 한다
function Write-History([hashtable]$map, [string]$path) {
    $o = [ordered]@{}
    foreach ($k in $map.Keys | Sort-Object) { $o[$k] = $map[$k] }
    $o | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 $path
}

# Steam 태그 영어 이름 -> 한국어 이름. GetTagList(공개, 키 불필요)는 { response: { version_hash, tags: [{ tagid, name }] } } 형태라
# 언어별로 두 번 받아 tagid로 잇는다. 크기를 줄이려고 $names에 있는 태그만 남긴다. 실패하면 빈 표
function Get-SteamKoMap([string[]]$names) {
    $out = [ordered]@{}
    try {
        $url = "https://api.steampowered.com/IStoreService/GetTagList/v1/?language="
        $ko = @{}
        foreach ($t in @((Get-Json "${url}koreana").response.tags)) { if ($t.name) { $ko["$($t.tagid)"] = [string]$t.name } }
        $want = @{}; foreach ($n in $names) { if ($n) { $want[$n] = $true } }
        foreach ($t in @((Get-Json "${url}english").response.tags) | Sort-Object name) {
            if ($t.name -and $want.ContainsKey([string]$t.name) -and $ko["$($t.tagid)"]) { $out[[string]$t.name] = $ko["$($t.tagid)"] }
        }
    } catch { Write-Host "  Steam 태그 한국어 이름 실패(빈 값): $($_.Exception.Message)" -ForegroundColor Yellow; return [ordered]@{} }
    $out
}

# Steam 태그 투표 수 -> 게임 안에서의 상대 세기(최다 득표 태그 = 1). 게임마다 투표 인원이 달라 절대값은 비교가 안 된다
function Get-SteamTagWeights($tags) {
    $w = [ordered]@{}
    if (-not $tags) { return $w }
    $props = if ($tags -is [Collections.IDictionary]) { @($tags.GetEnumerator() | ForEach-Object { [pscustomobject]@{ Name = $_.Key; Value = $_.Value } }) }
             else { @($tags.PSObject.Properties) }
    $props = @($props | Where-Object { [int]$_.Value -gt 0 })
    if (-not $props.Count) { return $w }
    $max = ($props | ForEach-Object { [int]$_.Value } | Measure-Object -Maximum).Maximum
    foreach ($pr in $props | Sort-Object @{ e = { [int]$_.Value }; Descending = $true }, @{ e = { $_.Name } } | Select-Object -First 20) {
        $w[$pr.Name] = [Math]::Round([int]$pr.Value / $max, 2)
    }
    $w
}

# 설명문 키워드 -> 취향 태그. 스토어 설명에서 뽑은 것이라 "추정" 데이터다.
# 광고 문구는 거의 모든 게임에 "운명", "전략", "비밀"을 쓰므로, 키워드가 2번 이상 나와야 태그를 붙이고
# 나온 횟수로 세기(0.5~1)를 매긴다 (예: 닌자 가이덴 4는 "운명" 2번, "전략" 1번으로 스토리·전략이 붙었었다).
$TagMinHits = 2
$TagRules = [ordered]@{
    explore    = '탐험|탐색|미지의|광활한|open[- ]world|오픈\s*월드|explore'
    story      = '스토리|서사|이야기를|줄거리|narrative|storytelling|story-driven'
    combat     = '전투|격투|액션|싸우|싸움|무찌|combat|fight|hack'
    strategy   = '전략|전술|턴제|지휘|strategy|tactic|turn-based'
    growth     = '육성|성장|레벨\s*업|업그레이드|스킬|강화|unlock|upgrade'
    collect    = '수집|합체|모으|collect|craft|제작|건설|건축'
    survival   = '생존|살아남|survival|survive'
    horror     = '공포|호러|좀비|괴물|악몽|horror|zombie'
    puzzle     = '퍼즐|수수께끼|두뇌|puzzle'
    coop       = '협동|함께\s*플레이|친구와|co-?op|파티'
    roguelike  = '로그라이크|로그라이트|roguelike|roguelite|매번\s*다른'
    simulation = '시뮬레이션|경영|운영|관리하|농장|simulat|management|tycoon'
    racing     = '레이싱|레이스|자동차|드라이빙|racing|race'
    sports     = '스포츠|축구|농구|야구|골프|sports|football'
    emotional  = '감동|감성|여운|아름다운|따뜻한|마음|emotional|heartfelt'
    mystery    = '신비|미스터리|수수께끼|mystery|mysterious'
    family     = '가족|아이들|누구나|모두가\s*즐|family|kids'
    shooter    = '슈팅|총격|사격|저격|shooter|shoot'
    stealth    = '잠입|은신|암살|stealth|assassin'
    music      = '음악|사운드트랙|리듬|music|rhythm'
}

# 세부 장르: 다른 뜻으로 거의 안 쓰는 말이라 1번만 나와도 인정한다. 스토어 장르("RPG")가 너무 넓어
# 진 여신전생 V와 닌자 가이덴 4가 같은 칸에 들어가는 것을 막는다.
$StyleRules = [ordered]@{
    turnbased  = '턴제|턴\s*방식|커맨드\s*배틀|커맨드\s*전투|turn-based|turn based'
    soulslike  = '소울\s*라이크|soulslike|souls-like'
    metroid    = '메트로배니아|metroidvania'
    openworld  = '오픈\s*월드|open[- ]world'
    srpg       = 'srpg|택티컬\s*rpg|전략\s*rpg|시뮬레이션\s*rpg|tactical\s*rpg|tactics'
    jrpgword   = 'jrpg'
    arpgword   = '액션\s*rpg|action\s*rpg|arpg'
    stylish    = '콤보|핵\s*앤\s*슬래시|hack\s*(and|&|n)\s*slash|하이\s*스피드|스타일리시'
}
# JRPG 판단용 일본 퍼블리셔·개발사 (퍼블리셔나 개발사 이름에 들어 있으면)
$JapaneseMakers = 'atlus|sega|square enix|bandai namco|koei|tecmo|falcom|nihon falcom|capcom|konami|spike chunsoft|nis america|nippon ichi|marvelous|xseed|aquaplus|gust|idea factory|compile heart|level-5|kemco|arc system works|team ninja|platinumgames|fromsoftware|아틀러스|세가|스퀘어|반다이|코에이|팔콤|캡콤|코나미'

# 세부 장르 판정. 스토어 장르, 제작사, 설명문 단서를 조합한다 (모두 추정)
function Get-Styles($genres, [string]$makers, [string]$text) {
    $hit = @{}
    foreach ($k in $StyleRules.Keys) { if ($text -match "(?i)$($StyleRules[$k])") { $hit[$k] = $true } }
    $rpg = $genres -contains 'Role playing'
    $action = $genres -contains 'Action & adventure' -or $genres -contains 'Fighting'
    $s = @()
    if ($rpg -and ($hit.jrpgword -or $makers -match "(?i)$JapaneseMakers")) { $s += 'jrpg' }
    if ($hit.turnbased) { $s += 'turnbased' }
    if ($rpg -and ($hit.arpgword -or ($action -and -not $hit.turnbased))) { $s += 'actionrpg' }
    if ($hit.srpg) { $s += 'srpg' }
    if ($hit.soulslike) { $s += 'soulslike' }
    if ($hit.metroid) { $s += 'metroidvania' }
    if ($hit.openworld) { $s += 'openworld' }
    if ($action -and -not $rpg -and $hit.stylish) { $s += 'stylish' }
    $s
}

# 태그별 키워드 등장 횟수 (웹앱의 외부 게임 분석도 같은 방식: docs/app.js)
function Get-TagHits([string]$text) {
    $hits = [ordered]@{}
    foreach ($k in $TagRules.Keys) {
        $n = [regex]::Matches($text, "(?i)$($TagRules[$k])").Count
        if ($n) { $hits[$k] = $n }
    }
    $hits
}

# 같은 게임의 여러 상품(PC판·콘솔판)은 가장 많이 나온 횟수를 쓰고, 2번 미만은 버리고, 세기는 2번 0.5 ~ 4번 이상 1
function Get-TagWeights($hitList) {
    $max = @{}
    foreach ($h in $hitList) { foreach ($k in $h.Keys) { if ($h[$k] -gt [int]$max[$k]) { $max[$k] = $h[$k] } } }
    $w = [ordered]@{}
    foreach ($k in $TagRules.Keys) { if ($max[$k] -ge $TagMinHits) { $w[$k] = [Math]::Min(1.0, $max[$k] / 4) } }
    $w
}

# ---------- 1) 목록 ----------

Write-Host "`n[1] 요금제별 목록 ($Market / $Language)" -ForegroundColor Cyan
$lists = [ordered]@{}
foreach ($t in $Tiers.Keys) {
    foreach ($pl in $Platforms.Keys) {
        if ($t -eq "pcgp" -and $pl -eq "console") { continue }
        $url = "https://catalog.gamepass.com/sigls/v3?id=$($Tiers[$t].Sigl)&language=$Language&market=$Market" +
               "&platformContext=$([uri]::EscapeDataString($Platforms[$pl]))&subscriptionContext=$($Tiers[$t].Sub)"
        $lists["$t/$pl"] = @((Get-Json $url) | Where-Object { $_.id } | ForEach-Object { $_.id })
        Write-Host ("  {0,-20} {1,4}개" -f "$t/$pl", $lists["$t/$pl"].Count)
    }
}
$extra = @{}
# 특별 목록은 없어도 빌드가 되도록 목록마다 따로 실패를 삼킨다. 순서는 유지 (최근 추가는 순서가 곧 추가 순서)
foreach ($k in $ExtraLists.Keys) {
    $seen = @{}; $listIds = New-Object System.Collections.ArrayList
    foreach ($sigl in $ExtraLists[$k]) {
        try {
            # PS 5.1의 ConvertFrom-Json은 배열을 한 덩어리로 내보내므로 괄호로 풀어서 넘긴다
            $got = @((Get-Json "https://catalog.gamepass.com/sigls/v2?id=$sigl&language=$Language&market=$Market") | Where-Object { $_.id })
            # 그 시장에 없는 모음은 전체 카탈로그(수백 개)를 돌려준다 (KR의 Ubisoft+ Classics는 805개 = 전 게임). 특별 목록이 이만큼 클 리 없으니 버린다
            if ($got.Count -gt 400) { Write-Host "  $k 목록($sigl) $($got.Count)개 = 전체 카탈로그로 보임, 무시" -ForegroundColor Yellow; continue }
            foreach ($x in $got) {
                if (-not $seen.ContainsKey($x.id)) { $seen[$x.id] = $true; [void]$listIds.Add($x.id) }
            }
        } catch { Write-Host "  $k 목록($sigl) 실패: $($_.Exception.Message)" -ForegroundColor Yellow }
    }
    $extra[$k] = @($listIds)
    if (-not $extra[$k].Count) { Write-Host "  $k 목록이 비어 있음 (해당 필드는 모두 false/빈 값)" -ForegroundColor Yellow }
    Write-Host ("  {0,-20} {1,4}개" -f $k, $extra[$k].Count)
}

# 목록이 비정상적으로 작으면 엔드포인트가 바뀐 것으로 보고 멈춘다 (기존 데이터를 덮어쓰지 않도록)
if ($lists["pcgp/pc"].Count -lt 100) { throw "PC Game Pass 목록이 $($lists['pcgp/pc'].Count)개뿐입니다. 엔드포인트가 바뀌었는지 확인하세요." }

$allIds = @($lists.Values + $extra.Values | ForEach-Object { $_ } | Sort-Object -Unique)
$catalogIds = @($lists.Values | ForEach-Object { $_ } | Sort-Object -Unique)

# ---------- 2) 상세 ----------

Write-Host "`n[2] 상품 상세 ($($catalogIds.Count)개)" -ForegroundColor Cyan
$products = @(Get-Products $catalogIds)

# 번들 상품(예: "Avowed Standard Edition")은 패키지가 없고 하위 상품(BundledSkus)에 있다
$childOf = @{}
foreach ($p in $products) {
    if ((Get-PcPackages $p).Count) { continue }
    $kids = @($p.DisplaySkuAvailabilities | ForEach-Object { $_.Sku.Properties.BundledSkus } | ForEach-Object { $_.BigId } | Where-Object { $_ } | Sort-Object -Unique)
    if ($kids) { $childOf[$p.ProductId] = $kids }
}
$children = @{}
if ($childOf.Count) {
    Write-Host "  번들 상품 $($childOf.Count)개의 하위 상품 조회"
    foreach ($c in Get-Products @($childOf.Values | ForEach-Object { $_ } | Sort-Object -Unique)) { $children[$c.ProductId] = $c }
}

$rows = @()
foreach ($p in $products) {
    $id = $p.ProductId
    $lp = $p.LocalizedProperties[0]
    $mp = $p.MarketProperties | Select-Object -First 1
    $tiers = @($lists.Keys | Where-Object { $lists[$_] -contains $id })
    $langs = @($p.DisplaySkuAvailabilities | ForEach-Object { $_.Sku.MarketProperties } | ForEach-Object { $_.SupportedLanguages } | Where-Object { $_ } | Sort-Object -Unique)

    $pkgs = Get-PcPackages $p
    if ($pkgs.Count -eq 0 -and $childOf[$id]) { $pkgs = @($childOf[$id] | ForEach-Object { if ($children[$_]) { Get-PcPackages $children[$_] } }) }
    $formats = @($pkgs.PackageFormat | Where-Object { $_ } | Sort-Object -Unique)
    $caps = @($pkgs | ForEach-Object { $_.Capabilities } | Where-Object { $_ } | Sort-Object -Unique)
    $hasPc = [bool]($tiers | Where-Object { $_ -like '*/pc' })

    $descriptors = @($mp.ContentRatings | Where-Object { $_.RatingSystem -in 'ESRB', 'PEGI', 'GRB' } | ForEach-Object { $_.RatingDescriptors } | Sort-Object -Unique)
    $grac = ($mp.ContentRatings | Where-Object RatingSystem -eq 'GRB' | Select-Object -First 1).RatingId
    $usage = $mp.UsageData | Where-Object AggregateTimeSpan -eq 'AllTime' | Select-Object -First 1

    $poster = $lp.Images | Where-Object ImagePurpose -eq 'Poster' | Select-Object -First 1
    if (-not $poster) { $poster = $lp.Images | Where-Object ImagePurpose -eq 'BoxArt' | Select-Object -First 1 }
    $hero = $lp.Images | Where-Object ImagePurpose -eq 'SuperHeroArt' | Select-Object -First 1

    # 번들 상품은 장르·속성·긴 설명이 비어 있어 실제 게임 상품(하위 상품)에서 가져온다
    $info = $p
    if (-not $p.Properties.Categories -and $childOf[$id]) {
        $kid = $childOf[$id] | ForEach-Object { $children[$_] } | Where-Object { $_ -and $_.Properties.Categories } | Select-Object -First 1
        if ($kid) { $info = $kid }
    }
    $ilp = $info.LocalizedProperties[0]

    $desc = if ($lp.ShortDescription) { $lp.ShortDescription } elseif ($ilp.ShortDescription) { $ilp.ShortDescription } else { $lp.ProductDescription }
    $desc = ($desc -replace '\s+', ' ').Trim()
    $fullText = "$($lp.ProductTitle) $($lp.ShortDescription) $($lp.ProductDescription) $($ilp.ShortDescription) $($ilp.ProductDescription)"

    $rows += [pscustomobject]@{
        id           = $id
        title        = $lp.ProductTitle
        groupKey     = Get-GroupKey $lp.ProductTitle
        publisher    = $lp.PublisherName
        developer    = $lp.DeveloperName
        releaseDate  = Format-Day $mp.OriginalReleaseDate
        categories   = @($info.Properties.Categories | Where-Object { $_ })
        attributes   = @(@($p.Properties.Attributes.Name) + @($info.Properties.Attributes.Name) | Where-Object { $_ } | Sort-Object -Unique)
        languages    = $langs
        korean       = if ($langs.Count -eq 0) { "unknown" } elseif ($langs -match '^ko(-|$)') { "yes" } else { "no" }
        tiers        = $tiers
        installClass = Get-InstallClass $formats $lp.PublisherName $hasPc
        formats      = $formats
        officialMods = [bool]($caps -contains 'modifiableApp')
        descriptors  = $descriptors
        grac         = $grac
        rating       = if ($usage -and $usage.RatingCount -gt 0) { [Math]::Round([double]$usage.AverageRating, 1) } else { $null }
        ratingCount  = if ($usage) { [int]$usage.RatingCount } else { 0 }
        poster       = if ($poster) { "https:$($poster.Uri)" } else { $null }
        hero         = if ($hero) { "https:$($hero.Uri)" } else { $null }
        description  = if ($desc.Length -gt 200) { $desc.Substring(0, 200) + "…" } else { $desc }
        tagHits      = Get-TagHits $fullText
        styles       = @(Get-Styles @($info.Properties.Categories) "$($lp.PublisherName) $($lp.DeveloperName)" $fullText)
    }
}

# 한글패치 검색(scripts/search-korean-patch.ps1)의 입력. 상품 단위
$rows | Select-Object id, title, releaseDate, korean, tiers, installClass, publisher |
    ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $DataDir "catalog.json")

# 출시 예정 게임은 아직 요금제 목록에 없어 따로 상세를 받고, games[]와 섞지 않는다
$comingSoon = @()
if ($extra.comingSoon.Count) {
    Write-Host "`n[2-1] 출시 예정 상세 ($($extra.comingSoon.Count)개)" -ForegroundColor Cyan
    try {
        $csRows = foreach ($p in @(Get-Products $extra.comingSoon)) {
            $lp = $p.LocalizedProperties[0]
            $poster = $lp.Images | Where-Object ImagePurpose -eq 'Poster' | Select-Object -First 1
            if (-not $poster) { $poster = $lp.Images | Where-Object ImagePurpose -eq 'BoxArt' | Select-Object -First 1 }
            [pscustomobject]@{
                id          = $p.ProductId
                title       = $lp.ProductTitle
                groupKey    = Get-GroupKey $lp.ProductTitle
                poster      = if ($poster) { "https:$($poster.Uri)" } else { $null }
                releaseDate = Format-Day ($p.MarketProperties | Select-Object -First 1).OriginalReleaseDate
                genres      = @($p.Properties.Categories | Where-Object { $_ })
                publisher   = $lp.PublisherName
                developer   = $lp.DeveloperName
            }
        }
        # PC판·콘솔판이 따로 올라오므로 본 목록과 같은 키로 묶어 하나만 남긴다
        $comingSoon = @($csRows | Group-Object groupKey | ForEach-Object {
            $c = $_.Group | Sort-Object @{ e = { $_.title.Length } } | Select-Object -First 1
            [ordered]@{
                id = $c.id; title = $c.title; poster = $c.poster
                releaseDate = @($_.Group.releaseDate | Where-Object { $_ } | Sort-Object)[0]
                genres = @($_.Group.genres | ForEach-Object { $_ } | Sort-Object -Unique)
                publisher = $c.publisher; developer = $c.developer
            }
        } | Sort-Object @{ e = { if ($_.releaseDate) { 0 } else { 1 } } }, @{ e = { $_.releaseDate } }, @{ e = { $_.title } })
    } catch { $comingSoon = @(); Write-Host "  출시 예정 상세 실패: $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "`n[2-2] 게임패스 앱 상세(플레이 시간·가격·접근성) ($($catalogIds.Count)개)" -ForegroundColor Cyan
$hydById = @{}
try { $hydById = Get-Hydration $catalogIds }
catch { Write-Host "  hydration 실패: $($_.Exception.Message)" -ForegroundColor Yellow }
if (-not $hydById.Count) { Write-Host "  hydration 결과 없음 -> playtime/price 등은 모두 빈 값" -ForegroundColor Yellow }
else { Write-Host "  $($hydById.Count)개 상품 받음" }

# ---------- 3) 한글패치·수동 수정 병합 ----------

$patchById = @{}
$patchPath = Join-Path $DataDir "patch-candidates.json"
if (Test-Path $patchPath) {
    foreach ($pc in @(Get-Content -Raw -Encoding UTF8 $patchPath | ConvertFrom-Json | ForEach-Object { $_ })) {
        foreach ($i in $pc.ids) { $patchById[$i] = $pc }
    }
}
$overrides = @()
$ovPath = Join-Path $DataDir "overrides.json"
if (Test-Path $ovPath) { $overrides = @((Get-Content -Raw -Encoding UTF8 $ovPath | ConvertFrom-Json).games | Where-Object { $_ }) }
$steamById = Read-SteamMap (Join-Path $DataDir "steam.json")
$historyPath = Join-Path $DataDir "history.json"
$history = Read-History $historyPath
$today = Get-KstToday
$todayStr = $today.ToString("yyyy-MM-dd")
$currentKeys = @{}
# 최근 추가 목록은 최신순이라 위치가 곧 추가 순서다
$addedRankById = @{}
for ($i = 0; $i -lt @($extra.recentlyAdded).Count; $i++) { $rid = @($extra.recentlyAdded)[$i]; if (-not $addedRankById.ContainsKey($rid)) { $addedRankById[$rid] = $i } }

$games = @()
foreach ($grp in $rows | Group-Object groupKey) {
    $items = @($grp.Group)
    # 대표 상품: PC판이 있으면 PC판, 제목이 가장 짧은 것
    $main = $items | Sort-Object @{ e = { if ($_.installClass -ne 'console') { 0 } else { 1 } } }, @{ e = { $_.title.Length } } | Select-Object -First 1
    $ids = @($items.id)
    $tiers = @($items.tiers | ForEach-Object { $_ } | Sort-Object -Unique)
    $pcItem = $items | Where-Object installClass -ne 'console' | Select-Object -First 1

    # 한국어: 공식(스토어 표기) > 한글패치 검색 결과 > 미확인. 수동 수정이 있으면 그것이 최우선
    $koreanStore = if ($items | Where-Object korean -eq 'yes') { 'yes' } elseif ($items | Where-Object korean -eq 'no') { 'no' } else { 'unknown' }
    $patch = $ids | ForEach-Object { $patchById[$_] } | Where-Object { $_ } | Select-Object -First 1
    $korean = [ordered]@{ status = "unknown"; label = "미확인"; source = "store"; link = $null; verified = $false }
    if ($koreanStore -eq 'yes') { $korean.status = "official"; $korean.label = "공식 지원 (스토어 표기)" }
    elseif ($patch) {
        $top = @($patch.candidates)[0]
        $map = @{
            patch_likely             = @("patch", "한글패치 있음 (검색 추정)")
            gp_unsupported_suspected = @("patch_blocked", "한글패치 게임패스판 불가 의심")
            official_likely          = @("official_likely", "공식 한국어 가능성 (확인 필요)")
            planned                  = @("planned", "한국어 추가 예정 (검색 추정)")
            no_patch_likely          = @("none", "한글패치 없음 (검색 추정)")
        }
        $m = $map[$patch.summary]
        if ($m) { $korean.status = $m[0]; $korean.label = $m[1] } else { $korean.status = "none_found"; $korean.label = "한국어 미지원 · 패치 정보 없음" }
        $korean.source = "naver-search"; $korean.link = $top.link; $korean.checkedAt = $patch.checkedAt
    }
    elseif ($koreanStore -eq 'no') { $korean.status = "none_found"; $korean.label = "한국어 미지원 (스토어 표기)" }
    $ov = $overrides | Where-Object { ($_.id -and $ids -contains $_.id) -or ($_.title -and (Get-GroupKey $_.title) -eq $grp.Name) } | Select-Object -First 1
    if ($ov -and $ov.korean) {
        $korean.status = $ov.korean; $korean.label = $ov.label; $korean.source = "override"; $korean.link = $ov.link
        $korean.verified = [bool]$ov.verified; $korean.note = $ov.note
    }

    $descs = @($items.descriptors | ForEach-Object { $_ } | Sort-Object -Unique)
    $content = @($ContentRules.Keys | Where-Object { $rule = $ContentRules[$_]; $descs | Where-Object { $_ -match $rule } })

    $modes = @()
    $attrs = @($items.attributes | ForEach-Object { $_ } | Sort-Object -Unique)
    if ($attrs -contains 'SinglePlayer') { $modes += "single" }
    if ($attrs | Where-Object { $_ -match 'Coop|CoOp' }) { $modes += "coop" }
    if ($attrs | Where-Object { $_ -match 'OnlineMultiPlayer|CrossPlatformMultiPlayer|LocalMultiPlayer|LocalMultiplayer|SharedSplitScreen' }) { $modes += "multi" }

    # Steam: 묶음 안에서 appid가 있는 첫 상품의 기록을 쓴다 (PC판·콘솔판은 같은 Steam 게임)
    $steam = $ids | ForEach-Object { $steamById[$_] } | Where-Object { $_ -and $_.appid } | Select-Object -First 1
    $ranks = @($ids | Where-Object { $addedRankById.ContainsKey($_) } | ForEach-Object { $addedRankById[$_] })

    # hydration: 대표 상품부터 보고, 값이 있는 첫 상품을 쓴다
    $hyd = @(@($main.id) + @($ids | Where-Object { $_ -ne $main.id }) | ForEach-Object { $hydById[$_] } | Where-Object { $_ })
    $playtime = $hyd | ForEach-Object { Get-HydPlaytime $_ } | Where-Object { $_ } | Select-Object -First 1
    $price = $hyd | ForEach-Object { Get-HydPrice $_ ([bool]$pcItem) } | Where-Object { $_ } | Select-Object -First 1
    $access = $hyd | ForEach-Object { , @(Get-HydAccessibility $_) } | Where-Object { $_.Count } | Select-Object -First 1
    $handheld = $hyd | ForEach-Object { $_.hhVerified.deviceEvaluation } | Where-Object { $_ } | Select-Object -First 1
    $sizeGB = $hyd | ForEach-Object { Get-HydSizeGB $_ } | Where-Object { $null -ne $_ } | Select-Object -First 1
    $minAge = $hyd | ForEach-Object { $_.minimumUserAge } | Where-Object { $null -ne $_ } | Select-Object -First 1
    # 결과가 없으면 PS 5.1은 "빈 값(AutomationNull)"을 남기고 ConvertTo-Json이 그걸 {}로 쓴다. 진짜 null로 바꿔 둔다
    if ($null -eq $playtime) { $playtime = $null }
    if ($null -eq $price) { $price = $null }
    if ($null -eq $sizeGB) { $sizeGB = $null }
    $accessList = New-Object System.Collections.ArrayList
    if ($access) { foreach ($a in $access) { [void]$accessList.Add([string]$a) } }
    $partner = if ($ids | Where-Object { $extra.eaPlay -contains $_ }) { "ea" } elseif ($ids | Where-Object { $extra.ubisoft -contains $_ }) { "ubisoft" } else { $null }
    $handheldReady = [bool]($hyd | Where-Object { Test-HydHandheld $_ })
    # 메타크리틱: Steam 값이 우선, 없으면 게임패스 앱 값 (Steam에 없는 게임·콘솔 전용 게임도 점수가 생긴다)
    $mcSource = $null; $mcScore = $null; $mcUrl = $null
    if ($steam -and $null -ne $steam.metacritic) {
        $mcSource = "steam"; $mcScore = [int]$steam.metacritic; $mcUrl = if ($steam.metacriticUrl) { [string]$steam.metacriticUrl } else { $null }
    } else {
        $hmc = $hyd | ForEach-Object { Get-HydMetacritic $_ } | Where-Object { $_ } | Select-Object -First 1
        if ($hmc) { $mcSource = "gamepass"; $mcScore = $hmc.score; $mcUrl = $hmc.url }
    }

    # 등록 기록: 키는 대표 상품 id. 대표 상품이 바뀌었으면(PC판이 새로 생기는 등) 묶음 안 다른 id의 기록을 옮겨 온다
    $hkey = $main.id
    $hist = $history[$hkey]
    if (-not $hist) {
        $alt = $ids | Where-Object { $_ -ne $hkey -and $history.ContainsKey($_) -and -not $currentKeys.ContainsKey($_) } | Select-Object -First 1
        if ($alt) { $hist = $history[$alt]; $history.Remove($alt) }
    }
    if ($hist -and ($today - [datetime]::ParseExact($hist.lastSeen, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)).Days -gt $HistoryRegap) { $hist.firstSeen = $todayStr }
    if (-not $hist) { $hist = [ordered]@{ firstSeen = $todayStr; lastSeen = $todayStr; title = "" } }
    $hist.lastSeen = $todayStr; $hist.title = [string]$main.title
    $history[$hkey] = $hist; $currentKeys[$hkey] = $true
    $daysOnPass = [Math]::Max(0, ($today - [datetime]::ParseExact($hist.firstSeen, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)).Days)

    $games += [ordered]@{
        id           = $main.id
        ids          = $ids
        title        = $main.title
        publisher    = $main.publisher
        developer    = $main.developer
        releaseDate  = @($items.releaseDate | Where-Object { $_ } | Sort-Object)[0]
        poster       = $main.poster
        hero         = $main.hero
        description  = $main.description
        genres       = @($items.categories | ForEach-Object { $_ } | Sort-Object -Unique)
        tagW         = Get-TagWeights @($items.tagHits)
        styles       = @($items.styles | ForEach-Object { $_ } | Sort-Object -Unique)
        modes        = $modes
        rating       = ($items | Where-Object rating | Sort-Object ratingCount -Descending | Select-Object -First 1).rating
        ratingCount  = ($items | Measure-Object ratingCount -Maximum).Maximum
        plans        = [ordered]@{
            ultimate  = @($tiers | Where-Object { $_ -like 'ultimate/*' } | ForEach-Object { ($_ -split '/')[1] })
            premium   = @($tiers | Where-Object { $_ -like 'premium/*' } | ForEach-Object { ($_ -split '/')[1] })
            essential = @($tiers | Where-Object { $_ -like 'essential/*' } | ForEach-Object { ($_ -split '/')[1] })
            pcgp      = [bool]($tiers -contains 'pcgp/pc')
        }
        naverPlus    = [bool]($tiers -contains 'pcgp/pc')   # 네이버플러스 멤버십 혜택 = PC 게임패스
        korean       = $korean
        install      = [ordered]@{ class = if ($pcItem) { $pcItem.installClass } else { "console" }; officialMods = [bool]($items | Where-Object officialMods) }
        content      = [ordered]@{ grac = $main.grac; flags = $content }
        leavingSoon  = [bool]($ids | Where-Object { $extra.leavingSoon -contains $_ })
        recentlyAdded = [bool]($ids | Where-Object { $extra.recentlyAdded -contains $_ })
        addedRank    = if ($ranks.Count) { [int]($ranks | Measure-Object -Minimum).Minimum } else { $null }
        features     = @(Get-Features $attrs)
        steamAppId   = if ($steam) { [int]$steam.appid } else { $null }
        metacritic   = $mcScore
        metacriticUrl = $mcUrl
        metacriticSource = $mcSource   # "steam" | "gamepass" | null
        steamTags    = if ($steam) { Get-SteamTagWeights $steam.tags } else { [ordered]@{} }
        familyKids   = [bool]($ids | Where-Object { $extra.familyKids -contains $_ })
        partner      = $partner   # EA Play·Ubisoft+ 게임은 EA 앱·Ubisoft Connect 계정 연결이 따로 필요하다
        playtime     = $playtime
        price        = $price
        accessibility = $accessList
        handheld     = if ($handheld) { [string]$handheld } else { $null }
        handheldReady = $handheldReady
        cloud        = [bool]($hyd | Where-Object { $_.xCloudOfferings -and @($_.xCloudOfferings.PSObject.Properties).Count })
        cloudTouch   = [bool]($hyd | Where-Object { @($_.supportedXCloudInputs) -match 'touch' })
        installSizeGB = $sizeGB
        minAge       = if ($null -ne $minAge) { [int]$minAge } else { $null }
        firstSeen    = $hist.firstSeen
        daysOnPass   = [int]$daysOnPass
    }
}

# 최근 30일 안에 목록에서 빠진 게임 (빠진 날에 가까운 순)
$leftSince = $today.AddDays(-30).ToString("yyyy-MM-dd")
$recentlyLeft = @($history.Keys | Where-Object { -not $currentKeys.ContainsKey($_) -and $history[$_].lastSeen -ge $leftSince } |
    ForEach-Object { [ordered]@{ title = $history[$_].title; lastSeen = $history[$_].lastSeen } } |
    Sort-Object @{ e = { $_.lastSeen }; Descending = $true }, @{ e = { $_.title } })

# 웹앱이 Steam 태그를 한국어로 보여 주도록. 게임의 steamTags, 외부 게임 캐시, steamBridge에 나오는 태그만 넣는다
$tagNames = @{}
foreach ($g in $games) { foreach ($k in $g.steamTags.Keys) { $tagNames[$k] = $true } }
foreach ($v in $SteamBridge.Values) { $tagNames[$v] = $true }
$extCachePath = Join-Path $DataDir "external-cache.json"
if (Test-Path $extCachePath) {
    try {
        $ext = Get-Content -Raw -Encoding UTF8 $extCachePath | ConvertFrom-Json
        foreach ($pr in $ext.PSObject.Properties) { if ($pr.Value.tags) { foreach ($t in $pr.Value.tags.PSObject.Properties) { $tagNames[$t.Name] = $true } } }
    } catch { Write-Host "  external-cache.json 읽기 실패(무시): $($_.Exception.Message)" -ForegroundColor Yellow }
}
$steamKo = Get-SteamKoMap @($tagNames.Keys)

$out = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    market      = $Market
    sources     = [ordered]@{
        catalog = "catalog.gamepass.com (비공식)"
        details = "displaycatalog.mp.microsoft.com (비공식)"
        patches = "NAVER API HUB 검색 (추정)"
    }
    # 웹앱이 게임패스 밖 게임(외부 게임)을 같은 규칙으로 분석하도록 분류 규칙을 같이 내보낸다
    rules       = [ordered]@{ tags = $TagRules; tagMinHits = $TagMinHits; styles = $StyleRules; japaneseMakers = $JapaneseMakers; content = $ContentRules; steamBridge = $SteamBridge; steamKo = $steamKo }
    games       = @($games | Sort-Object { $_.title })
    comingSoon  = @($comingSoon)
    recentlyLeft = $recentlyLeft
}
$out | ConvertTo-Json -Depth 6 -Compress | Out-File -Encoding utf8 (Join-Path $WebDataDir "games.json")
# games.json을 다 쓴 뒤에만 기록을 저장한다 (중간에 멈춘 빌드가 기록을 어긋나게 하지 않도록)
Write-History $history $historyPath

Write-Host "`n[3] 결과" -ForegroundColor Cyan
Write-Host "  상품 $($rows.Count)개 -> 게임 $($games.Count)개"
$games | Group-Object { $_.korean.status } | Sort-Object Count -Descending | ForEach-Object { Write-Host ("  한국어 {0,-16} {1,4}개" -f $_.Name, $_.Count) }
Write-Host "  네이버플러스 가능: $(@($games | Where-Object { $_.naverPlus }).Count)개"
Write-Host "  곧 종료: $(@($games | Where-Object { $_.leavingSoon }).Count)개, 최근 추가: $(@($games | Where-Object { $_.recentlyAdded }).Count)개"
Write-Host "  Steam 연결: $(@($games | Where-Object { $_.steamAppId }).Count)개, 메타크리틱: $(@($games | Where-Object { $null -ne $_.metacritic }).Count)개, Steam 태그: $(@($games | Where-Object { $_.steamTags.Count }).Count)개"
Write-Host "  플레이 시간: $(@($games | Where-Object { $_.playtime }).Count)개, 가입자 할인: $(@($games | Where-Object { $_.price -and $_.price.discount }).Count)개, 클라우드: $(@($games | Where-Object { $_.cloud }).Count)개, 휴대기기 평가: $(@($games | Where-Object { $_.handheld }).Count)개"
Write-Host "  가족·어린이: $(@($games | Where-Object { $_.familyKids }).Count)개, 제휴(EA/Ubisoft): $(@($games | Where-Object { $_.partner }).Count)개, 출시 예정: $($comingSoon.Count)개"
Write-Host "  휴대기기 가능: $(@($games | Where-Object { $_.handheldReady }).Count)개, 메타크리틱(게임패스 앱 보충): $(@($games | Where-Object { $_.metacriticSource -eq 'gamepass' }).Count)개, 최근 빠진 게임: $($recentlyLeft.Count)개, Steam 태그 한국어: $($steamKo.Count)개"
Write-Host "`n저장: data/catalog.json, data/history.json, docs/data/games.json"
