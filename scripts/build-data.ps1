# 게임패스 큐레이터 데이터 빌드
# 1) 요금제별 게임 목록(catalog.gamepass.com sigls)  2) 상품 상세(displaycatalog)
# 3) PC 설치 형식(한글패치 적용 가능성)  4) 한글패치 검색 결과·수동 수정 병합
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
$ExtraLists = @{ leavingSoon = "393f05bf-e596-4ef6-9487-6d4fa0eab987"; recentlyAdded = "f13cf6b4-57e6-4459-89df-6aec18cf0538" }

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

# 설명문 키워드 -> 취향 태그. 스토어 설명에서 뽑은 것이라 "추정" 데이터다.
$TagRules = [ordered]@{
    explore    = '탐험|탐색|미지의|광활한|open[- ]world|오픈\s*월드|explore'
    story      = '스토리|이야기|서사|운명|모험을\s*떠|narrative|story'
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
    mystery    = '신비|미스터리|비밀|수수께끼|mystery|mysterious'
    family     = '가족|아이들|누구나|모두가\s*즐|family|kids'
    shooter    = '슈팅|총격|사격|저격|shooter|shoot'
    stealth    = '잠입|은신|암살|stealth|assassin'
    music      = '음악|사운드트랙|리듬|music|rhythm'
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
foreach ($k in $ExtraLists.Keys) {
    try { $extra[$k] = @((Get-Json "https://catalog.gamepass.com/sigls/v2?id=$($ExtraLists[$k])&language=$Language&market=$Market") | Where-Object { $_.id } | ForEach-Object { $_.id }) }
    catch { $extra[$k] = @(); Write-Host "  $k 목록 실패: $($_.Exception.Message)" -ForegroundColor Yellow }
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
        tags         = @($TagRules.Keys | Where-Object { $fullText -match "(?i)$($TagRules[$_])" })
    }
}

# 한글패치 검색(scripts/search-korean-patch.ps1)의 입력. 상품 단위
$rows | Select-Object id, title, releaseDate, korean, tiers, installClass, publisher |
    ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $DataDir "catalog.json")

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
        tags         = @($items.tags | ForEach-Object { $_ } | Sort-Object -Unique)
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
    }
}

$out = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    market      = $Market
    sources     = [ordered]@{
        catalog = "catalog.gamepass.com (비공식)"
        details = "displaycatalog.mp.microsoft.com (비공식)"
        patches = "NAVER API HUB 검색 (추정)"
    }
    games       = @($games | Sort-Object { $_.title })
}
$out | ConvertTo-Json -Depth 6 -Compress | Out-File -Encoding utf8 (Join-Path $WebDataDir "games.json")

Write-Host "`n[3] 결과" -ForegroundColor Cyan
Write-Host "  상품 $($rows.Count)개 -> 게임 $($games.Count)개"
$games | Group-Object { $_.korean.status } | Sort-Object Count -Descending | ForEach-Object { Write-Host ("  한국어 {0,-16} {1,4}개" -f $_.Name, $_.Count) }
Write-Host "  네이버플러스 가능: $(@($games | Where-Object { $_.naverPlus }).Count)개"
Write-Host "  곧 종료: $(@($games | Where-Object { $_.leavingSoon }).Count)개, 최근 추가: $(@($games | Where-Object { $_.recentlyAdded }).Count)개"
Write-Host "`n저장: data/catalog.json, docs/data/games.json"
