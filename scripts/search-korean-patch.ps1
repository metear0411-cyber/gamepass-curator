# 한글패치 후보 검색 검증 스크립트 (네이버 검색 API)
# - build-data.ps1이 만든 data\catalog.json에서 한국어 미지원 게임을 골라
# - 네이버 블로그/카페/웹문서 검색으로 한글패치 관련 글 후보를 모은다.
# - 결과는 "후보"일 뿐이다. 검색 결과가 없어도 "패치 없음"이 아니라 "미확인"으로 남긴다.
#
# 준비: 네이버 클라우드 NAVER API HUB에서 검색 API 구독 후 Client ID/Secret을 환경변수로 설정
#   (developers.naver.com 검색 API는 API HUB로 이관됨. 기존 openapi.naver.com 키·주소는 쓰지 않는다)
#   $env:NAVER_CLIENT_ID = "..."; $env:NAVER_CLIENT_SECRET = "..."
# 사용: powershell -ExecutionPolicy Bypass -File scripts/search-korean-patch.ps1 [-Limit 5] [-DryRun] [-Refresh]

param(
    [string]$GamesPath = (Join-Path (Split-Path $PSScriptRoot -Parent) "data\catalog.json"),
    [string]$OutDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "data"),
    [int]$Limit = 0,          # 0이면 전체, 시험할 땐 -Limit 5
    [int]$Display = 20,       # 검색 1회당 결과 수 (최대 100)
    [switch]$DryRun,          # API 호출 없이 검색어만 출력
    [switch]$Refresh          # 캐시 무시하고 다시 검색
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Endpoints = [ordered]@{ blog = "blog"; cafe = "cafearticle"; web = "webkr" }
$PatchPattern = '한글\s*패치|한글화\s*패치|한국어\s*패치|한글\s*번역|유저\s*한글화'
$GamePassPattern = '게임\s*패스|game\s*pass|xbox\s*앱|엑스박스\s*앱|ms\s*스토어|마이크로소프트\s*스토어|windowsapps'

$MaxGap = 25         # 게임명과 한글패치 키워드 사이 최대 글자 수
$StatusWindow = 40   # 상태 문구를 찾는 범위: 한글패치 키워드 앞뒤 글자 수
$ListMaxGap = 8      # 목록형 글은 게임명 바로 옆에 붙은 패치 언급만 인정 (예: "Dead Static Drive (추후 한글패치 예정)")
$ListWindow = 12     # 목록형 글의 상태 문구 범위 (옆 줄의 다른 게임 내용이 섞이지 않게)

# 오탐 유형 1, 2: 글 자체를 버린다
$NoiseRules = [ordered]@{
    # 모든 게임 페이지에 "공략 · 트레이너 · 한글패치 다운로드"를 붙이는 사이트(겜스 등)와 링크 모음 사이트
    template = '공략\s*[·,]\s*트레이너\s*[·,]\s*한글\s*패치|한글\s*패치\s*지원\s*링크\s*업데이트'
    # 게임이 아니라 치트 프로그램(트레이너) 화면을 번역한 패치
    trainer  = '트레이너\s*(한글|한국어)\s*(번역\s*)?패치|트레이너\s*한글\s*번역|localpatcher'
    # 게임패스와 무관한 다른 기종판(롬·iso) 패치 글 (예: Wii 골든아이 iso, N64 롬 패치, PSP 이스6)
    retro    = '(?<![a-z])(iso|wbfs|psp|ps2|ps3|n64|nds|gba)(?![a-z])|롬\s*파일|에뮬'
}
# 오탐 유형 3: 여러 게임을 나열하는 글 (라인업, 할인·판매 목록, 태그 모음 등)
$ListTitlePattern = '(?i)라인업|주요\s*타이틀|할인|최저가|판매|번들|bundle|\d+\s*주차|archives|태그|모음|목록|리스트|소식\s*외'
# 오탐 유형 4: 게임명 바로 앞에 와도 되는 영어 단어 (그 밖의 단어가 붙으면 다른 게임, 예: "Doctor Pigeon Simulator")
$AllowedNeighbors = @('the', 'a', 'an', 'and', 'of', 'pc', 'xbox', 'steam', 'gog', 'epic', 'game', 'games', 'pass', 'ms', 'new', 'free', 'play', 'kor', 'ko',
                      'for', 'in', 'on', 'with', 'to', 'from', 'by', 'at', 'now', 'vs', 'is', 'my')

# 상태 문구 (우선순위 순서). 한글패치 키워드 주변에서만 찾는다
$StatusRules = [ordered]@{
    gp_unsupported = '(스팀|steam)\s*(판|버전)?\s*(에만|만)|게임\s*패스\S*\s*(는|에서는|판은|버전은)?\s*(안\s*되|안\s*됨|불가|적용\s*안|작동\s*안)'
    # 오탐 유형 5: 유저 패치가 아니라 공식 한국어 지원 소식 -> 스토어 언어 표기가 틀렸을 가능성
    official       = '(한국어|한글)\s*(공식\s*)?지원\s*(확인|추가|업데이트|소식|됨|됐|되었|합니다|해요|o)(?![a-z])|공식\s*(한국어|한글)\s*(지원|추가|업데이트|자막)|한글\s*자체\s*지원|정식\s*한글화|처음부터\s*한글화|한글화\s*지원(?!\s*(안|않|x|없))'
    none           = '패치\s*(또한|도|는)?\s*없|한글\s*(이|은|도|화)?\s*없|지원하지\s*않|지원\s*안\s*(함|해|됨)|미지원'
    planned        = '예정|진행\s*중|진행하려|작업\s*중|준비\s*중|구합니다'
    distributor    = '다이렉트\s*게임|디렉트\s*게임|directg'
    # "다운로드", "배포"만으로는 무료 배포 글(에픽 등)에도 걸려서 패치와 붙어 있을 때만 인정한다
    exists         = '적용|설치|덮어\s*쓰기|압축\s*해제|패치\s*(파일|다운|배포|방법)|v\s?\d+(\.\d+)?|잘\s*나옵|존재|패치\s*(가|는|도)?\s*있(음|습니다|어요|다|네)|나왔|나옴'
}
$StatusLabels = @{
    gp_unsupported = "게임패스 불가"; official = "공식 지원"; none = "패치 없음"; planned = "예정"
    distributor = "유통사 구매 시 제공"; exists = "패치 있음"; unclear = "불명확"
}

if (-not $DryRun -and (-not $env:NAVER_CLIENT_ID -or -not $env:NAVER_CLIENT_SECRET)) {
    Write-Host "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없습니다." -ForegroundColor Red
    Write-Host "키 없이 검색어만 확인하려면 -DryRun 을 붙이세요."
    exit 1
}
if (-not (Test-Path $GamesPath)) {
    Write-Host "$GamesPath 가 없습니다. build-data.ps1 을 먼저 실행하세요." -ForegroundColor Red
    exit 1
}

function Get-CoreTitle([string]$t) {
    $t = $t -replace '[™®©]', '' -replace '\([^)]*\)', '' -replace '\[[^\]]*\]', ''
    # "X Edition(s)", "Director's Cut" 같은 판본 이름은 검색어와 일치 판정에서 뺀다 (예: "ARK: Ultimate Survivor Edition" -> "ARK")
    # 구분자(: -) 뒤는 아무 단어나, 구분자가 없으면 알려진 판본 단어만 뺀다 ("Elite Dangerous Standard Edition" 보호)
    $t = $t -replace "(?i)\s*[-–:]\s*([\w'’]+\s+){0,3}editions?\s*$", ''
    $t = $t -replace "(?i)\s+(standard|deluxe|definitive|complete|ultimate|gold|premium|enhanced|special|legendary|anniversary|game of the year|goty)\s+editions?\s*$", ''
    $t = $t -replace "(?i)\s*[-–:]?\s*director'?s\s+cut\s*$", ''
    $t = $t -replace '\s*([가-힣]+\s+)?에디션\s*$', '' -replace '(?i)\s*-?\s*PC\s*$', ''
    ($t -replace '[‘’“”]', '' -replace '\s+', ' ').Trim()
}

# 비교용: 소문자, 공백·기호 제거
function Get-Compact([string]$t) { ($t.ToLower() -replace '[^\p{L}\p{N}]', '') }

function Remove-Html([string]$s) {
    if (-not $s) { return "" }
    [Net.WebUtility]::HtmlDecode(($s -replace '<[^>]+>', ''))
}

# PS 5.1의 Invoke-RestMethod는 응답 인코딩을 잘못 읽을 때가 있어 바이트를 UTF-8로 직접 디코딩한다
function Invoke-Utf8Json([string]$url, [hashtable]$headers) {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers $headers
    $bytes = $res.RawContentStream.ToArray()
    [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
}

function Get-CacheKey([string]$s) {
    $sha = [Security.Cryptography.SHA1]::Create()
    -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s)) | ForEach-Object { $_.ToString("x2") })
}

$CacheDir = Join-Path $OutDir "naver-cache"
New-Item -ItemType Directory -Force $CacheDir | Out-Null
$script:ApiCalls = 0

function Search-Naver([string]$endpoint, [string]$query) {
    $cacheFile = Join-Path $CacheDir ("{0}.json" -f (Get-CacheKey "$endpoint|$query|$Display"))
    if (-not $Refresh -and (Test-Path $cacheFile)) {
        return (Get-Content -Raw -Encoding UTF8 $cacheFile | ConvertFrom-Json)
    }
    $url = "https://naverapihub.apigw.ntruss.com/search/v1/$endpoint" + "?query=$([uri]::EscapeDataString($query))&display=$Display&sort=sim"
    $headers = @{ "X-NCP-APIGW-API-KEY-ID" = $env:NAVER_CLIENT_ID; "X-NCP-APIGW-API-KEY" = $env:NAVER_CLIENT_SECRET }
    $data = Invoke-Utf8Json $url $headers
    $script:ApiCalls++
    $data | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $cacheFile
    Start-Sleep -Milliseconds 120   # 초당 호출 제한 여유
    $data
}

# compact 키("stateofdecay2")를 원문 위치를 찾는 정규식으로 바꾼다: 글자 사이 공백·기호 허용
function Get-KeyRegex([string]$k) {
    $body = ($k.ToCharArray() | ForEach-Object { [regex]::Escape([string]$_) }) -join '[^\p{L}\p{N}]*'
    # 짧은 키(예: "ark")는 "dark", "park"에도 걸리므로 단어 단위로만 찾는다
    if ($k.Length -lt 5) { "(?i)(?<![\p{L}\p{N}])$body(?![\p{L}\p{N}])" } else { "(?i)$body" }
}

# 게임명 매치가 다른 게임을 가리키는지 본다 (오탐 유형 4)
#  - 앞에 허용되지 않은 영어 단어가 붙음: "Doctor Pigeon Simulator", "Dynamic Contrast"
#  - 뒤에 제목에 없는 번호가 붙음(속편): "Psychonauts 2", "Pillars of Eternity 2"
#  - 짧은 제목 뒤에 이 게임 제목에 없는 영어 단어가 붙음: "Ark Nova", "ARK Server", "Ark of Napishtim"
function Test-KeyContext([string]$text, $m, [string[]]$allowed, [string[]]$titleWords, [string]$compactTitle) {
    $before = $text.Substring(0, $m.Index)
    $after = $text.Substring($m.Index + $m.Length)
    if ($before -match '([A-Za-z]+)[ ]?$' -and $Matches[1].ToLower() -notin $allowed) { return $false }
    if ($after -match '^[ \-]?(\d+|ii|iii|iv)(?![\p{L}\p{N}])' -and -not $compactTitle.Contains($Matches[1].ToLower())) { return $false }
    if ($m.Length -lt 6 -and $after -match '^[ ]([A-Za-z]{2,})' -and $Matches[1].ToLower() -notin $titleWords) { return $false }
    $true
}

# 한글패치 키워드 주변 구간에서 가장 우선순위가 높은 상태를 고른다
function Get-PatchStatus([string]$text, $patchMatches, [int]$window = $StatusWindow) {
    $found = @{}
    foreach ($p in $patchMatches) {
        $s = [Math]::Max(0, $p.Index - $window)
        $e = [Math]::Min($text.Length, $p.Index + $p.Length + $window)
        $w = $text.Substring($s, $e - $s)
        foreach ($k in $StatusRules.Keys) { if ($w -match $StatusRules[$k]) { $found[$k] = $true } }
    }
    foreach ($k in $StatusRules.Keys) { if ($found[$k]) { return $k } }
    "unclear"
}

function Get-Bigrams([string]$s) {
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    for ($i = 0; $i -lt $s.Length - 1; $i++) { [void]$set.Add($s.Substring($i, 2)) }
    , $set
}

function Test-Duplicate($a, $b) {
    if ((Get-Compact $a.title) -eq (Get-Compact $b.title)) { return $true }   # 카페 교차 게시
    $x = Get-Bigrams (Get-Compact "$($a.title) $($a.snippet)")
    $y = Get-Bigrams (Get-Compact "$($b.title) $($b.snippet)")
    $inter = New-Object 'System.Collections.Generic.HashSet[string]' (, [string[]]$x); $inter.IntersectWith($y)
    $union = New-Object 'System.Collections.Generic.HashSet[string]' (, [string[]]$x); $union.UnionWith($y)
    if ($union.Count -and $inter.Count / $union.Count -ge 0.45) { return $true }
    # 같은 사건(예: 에픽 무료 배포)을 다룬 글: 같은 상태, 게시일 7일 이내
    if ($a.status -eq $b.status -and $a.postDate -and $b.postDate) {
        return ([Math]::Abs(([datetime]$a.postDate - [datetime]$b.postDate).TotalDays) -le 7)
    }
    $false
}

# 점수 순으로 정렬된 후보를 받아, 중복 글은 대표 글의 duplicates에 링크만 남긴다
function Merge-Duplicates($sorted) {
    $reps = New-Object System.Collections.ArrayList
    foreach ($c in $sorted) {
        $rep = $null
        foreach ($r in $reps) { if (Test-Duplicate $r $c) { $rep = $r; break } }
        if ($rep) { $rep.duplicates += $c.link } else { [void]$reps.Add($c) }
    }
    $reps.ToArray()
}

# 게임별 요약 상태. 결과가 없으면 절대 "패치 없음"이 아니라 "미확인"
function Get-GameSummary($list) {
    if ($list.Count -eq 0) { return @{ code = "unverified_no_results"; label = "미확인 (검색 결과 없음)" } }
    # 묶인 비슷한 글도 같은 상태의 근거로 센다 (대표 글 하나만 세면 "패치 없음" 글 여러 개가 1표로 줄어든다)
    $cnt = @{}; foreach ($c in $list) { $cnt[$c.status] = 1 + $c.duplicates.Count + [int]$cnt[$c.status] }
    if ($cnt.gp_unsupported) { return @{ code = "gp_unsupported_suspected"; label = "게임패스 불가 의심" } }
    if ($cnt.official) { return @{ code = "official_likely"; label = "공식 한국어 가능성 (스토어 표기 확인 필요)" } }
    if ($cnt.exists -and $cnt.exists -ge [int]$cnt.none) { return @{ code = "patch_likely"; label = "패치 있음 추정" } }
    if ($cnt.none) {
        # 유저 패치는 없고 유통사(다이렉트게임즈 등) 구매자 전용 패치만 있는 경우 (예: 디스아너드 방관자의 죽음)
        $label = if ($cnt.distributor) { "패치 없음 추정 (유통사 전용 패치 있음)" } else { "패치 없음 추정" }
        return @{ code = "no_patch_likely"; label = $label }
    }
    if ($cnt.planned) { return @{ code = "planned"; label = "예정" } }
    @{ code = "unverified"; label = "미확인" }
}

# 1) 대상 게임: 한국어 미지원, PC판/콘솔판 중복은 제목 기준으로 묶는다
$games = Get-Content -Raw -Encoding UTF8 $GamesPath | ConvertFrom-Json
$targets = @($games | Where-Object { $_.korean -eq "no" } | Group-Object { Get-Compact (Get-CoreTitle $_.title) } |
             ForEach-Object { $_.Group[0] | Add-Member -NotePropertyName ids -NotePropertyValue @($_.Group.id) -PassThru })
if ($Limit -gt 0) { $targets = @($targets | Select-Object -First $Limit) }
Write-Host "`n[1] 대상: 한국어 미지원 $($targets.Count)개 (제목 기준 중복 제거)" -ForegroundColor Cyan

# 2) 영문 제목 (ko-kr 응답에는 한국어 제목만 오므로 en-us로 한 번 더 조회)
$enTitles = @{}
$ids = @($targets | ForEach-Object { $_.id })
for ($i = 0; $i -lt $ids.Count; $i += 20) {
    $batch = $ids[$i..([Math]::Min($i + 19, $ids.Count - 1))] -join ","
    $url = "https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=$batch&market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp+F.1"
    foreach ($p in (Invoke-Utf8Json $url @{}).Products) { $enTitles[$p.ProductId] = $p.LocalizedProperties[0].ProductTitle }
}

# 3) 검색
Write-Host "`n[2] 네이버 검색$(if ($DryRun) { ' (DryRun: 호출 안 함)' })" -ForegroundColor Cyan
$results = @()
$n = 0
foreach ($g in $targets) {
    $n++
    $ko = Get-CoreTitle $g.title
    $en = if ($enTitles[$g.id]) { Get-CoreTitle $enTitles[$g.id] } else { $ko }
    $queries = @("$ko 한글패치") + $(if ((Get-Compact $en) -ne (Get-Compact $ko)) { "$en 한글패치" } else { @() })

    # 제목 일치 판정용 키: 전체 제목, 그리고 콜론 앞부분(시리즈명)은 부분 일치로만 인정
    $fullKeys = @((Get-Compact $ko), (Get-Compact $en)) | Where-Object { $_.Length -ge 3 } | Sort-Object -Unique
    $partKeys = @(($ko -split ':')[0], ($en -split ':')[0]) | ForEach-Object { Get-Compact $_ } |
                Where-Object { $_.Length -ge 4 -and $_ -notin $fullKeys } | Sort-Object -Unique

    if ($DryRun) {
        Write-Host ("  [{0}/{1}] {2}" -f $n, $targets.Count, $g.title)
        $queries | ForEach-Object { Write-Host "      검색어: $_" }
        continue
    }

    $rel = ([string]$g.releaseDate) -replace '^(\d{4}-\d{2}-\d{2}).*', '$1'
    $keyRes = @($fullKeys | ForEach-Object { @{ re = Get-KeyRegex $_; type = "full" } }) +
              @($partKeys | ForEach-Object { @{ re = Get-KeyRegex $_; type = "partial" } })
    # 게임명 앞뒤에 와도 되는 단어: 공통 허용어 + 이 게임 제목에 들어 있는 영어 단어
    $titleWords = @("$($g.title) $($enTitles[$g.id])".ToLower() -split '[^a-z]+' | Where-Object { $_ })
    $allowed = @($AllowedNeighbors) + $titleWords
    $titleCompact = Get-Compact "$ko $en"
    $cands = @{}
    $dropped = 0
    $noise = @{ template = 0; trainer = 0; retro = 0; list = 0; collision = 0 }
    foreach ($q in $queries) {
        foreach ($src in $Endpoints.Keys) {
            try { $data = Search-Naver $Endpoints[$src] $q }
            catch { Write-Host "    검색 실패 ($src, $q): $($_.Exception.Message)" -ForegroundColor Red; continue }
            foreach ($it in $data.items) {
                if ($cands.ContainsKey($it.link)) { continue }
                $title = Remove-Html $it.title
                $desc = Remove-Html $it.description
                $text = "$title $desc"
                $patchMs = @([regex]::Matches($text, $PatchPattern))
                if ($patchMs.Count -eq 0) { continue }

                # 오탐 유형 1, 2: 공략 템플릿 페이지, 트레이너 번역
                $noiseKind = $null
                foreach ($k in $NoiseRules.Keys) { if ($text -match "(?i)$($NoiseRules[$k])") { $noiseKind = $k; break } }
                if ($noiseKind) { $noise[$noiseKind]++; continue }

                # 게임명 위치: 전체 제목을 우선, 없으면 시리즈명(콜론 앞부분). 다른 게임을 가리키는 매치는 뺀다
                $match = $null; $keyMs = @(); $rawHits = 0
                foreach ($kind in "full", "partial") {
                    $raw = @($keyRes | Where-Object { $_.type -eq $kind } | ForEach-Object { [regex]::Matches($text, $_.re) } | ForEach-Object { $_ })
                    $rawHits += $raw.Count
                    $keyMs = @($raw | Where-Object { Test-KeyContext $text $_ $allowed $titleWords $titleCompact })
                    if ($keyMs.Count) { $match = $kind; break }
                }
                if (-not $match) { if ($rawHits) { $noise.collision++ }; continue }

                # 거리 조건: 게임명과 한글패치 키워드 사이 글자 수 (겹치면 0)
                $gap = [int]::MaxValue
                foreach ($k in $keyMs) {
                    foreach ($p in $patchMs) {
                        $d = if ($k.Index + $k.Length -le $p.Index) { $p.Index - ($k.Index + $k.Length) }
                             elseif ($p.Index + $p.Length -le $k.Index) { $k.Index - ($p.Index + $p.Length) } else { 0 }
                        if ($d -lt $gap) { $gap = $d }
                    }
                }
                # 오탐 유형 3: 목록형 글은 게임명 바로 옆의 패치 언급만, 좁은 범위의 상태 문구로만 판단한다
                $isList = $title -match $ListTitlePattern
                if ($isList -and $gap -gt $ListMaxGap) { $noise.list++; continue }
                $status = if ($isList) {
                    # 게임명과 가장 가까운 패치 키워드 하나만 본다 (옆 줄 다른 게임의 패치 언급 제외)
                    $nearest = $patchMs | Sort-Object { $p = $_; ($keyMs | ForEach-Object { [Math]::Abs($p.Index - $_.Index) } | Measure-Object -Minimum).Minimum } | Select-Object -First 1
                    Get-PatchStatus $text @($nearest) $ListWindow
                } elseif ($text -match $StatusRules.official) {
                    # 공식 지원 소식은 "한글패치"와 멀리 떨어져 쓰이는 경우가 많아 글 전체에서 찾는다 (목록형 글 제외)
                    $s = Get-PatchStatus $text $patchMs
                    if ($s -eq "gp_unsupported") { $s } else { "official" }
                } else { Get-PatchStatus $text $patchMs }
                $near = $gap -le $MaxGap
                # 멀리 떨어져 있으면 목록형 글(험블번들 목록 등)일 가능성이 커서, 패치 주변에 상태 문구가 있을 때만 남긴다
                if (-not $near -and $status -eq "unclear") { $dropped++; continue }

                $date = if ($it.postdate) { "{0}-{1}-{2}" -f $it.postdate.Substring(0,4), $it.postdate.Substring(4,2), $it.postdate.Substring(6,2) } else { $null }
                $gpMention = [bool]($text -match $GamePassPattern)
                $score = 2 + $(if ($match -eq "full") { 2 } else { 0 }) + $(if ($gpMention) { 1 } else { 0 }) +
                         $(if ($near) { 1 } else { 0 }) + $(if ($status -ne "unclear") { 1 } else { 0 })
                $cands[$it.link] = [pscustomobject]@{
                    source            = $src
                    title             = $title
                    link              = $it.link
                    # 남의 글 요약을 저장소에 길게 남기지 않도록 짧게 자른다 (판정은 이미 끝났고 근거는 link로 본다)
                    snippet           = if ($desc.Length -gt 80) { $desc.Substring(0, 80) + "…" } else { $desc }
                    postDate          = $date
                    titleMatch        = $match
                    listPost          = [bool]$isList
                    gap               = $gap
                    status            = $status
                    statusLabel       = $StatusLabels[$status]
                    mentionsGamePass  = $gpMention
                    beforeRelease     = [bool]($date -and $rel -and $date -lt $rel)
                    score             = $score
                    duplicates        = @()
                }
            }
        }
    }

    $sorted = @($cands.Values | Sort-Object @{ e = "score"; Descending = $true }, @{ e = "postDate"; Descending = $true })
    $list = @(Merge-Duplicates $sorted | Select-Object -First 10)
    $summary = Get-GameSummary $list
    $results += [pscustomobject]@{
        ids          = $g.ids
        title        = $g.title
        enTitle      = $enTitles[$g.id]
        queries      = $queries
        status       = if ($list.Count -eq 0) { "unverified_no_results" } else { "candidates_found" }
        summary      = $summary.code           # 결과 없음은 절대 "패치 없음"으로 쓰지 않는다
        summaryLabel = $summary.label
        verification = "search_estimate"       # 사람이 확인하기 전까지는 추정
        droppedFar   = $dropped                # 거리 조건으로 제외한 글 수
        droppedNoise = [pscustomobject]$noise  # 오탐 유형별 제외 글 수 (template, trainer, list, collision)
        candidates   = $list
        source       = "NAVER API HUB search (blog, cafearticle, webkr)"
        checkedAt    = (Get-Date).ToString("yyyy-MM-dd")
    }
    $merged = ($list | ForEach-Object { $_.duplicates.Count } | Measure-Object -Sum).Sum
    $noiseTotal = ($noise.Values | Measure-Object -Sum).Sum
    Write-Host ("  [{0}/{1}] {2,-45} {3,-16} 후보 {4,2}개 (묶음 {5}, 거리 제외 {6}, 오탐 제외 {7})" -f $n, $targets.Count, $g.title, $summary.label, $list.Count, [int]$merged, $dropped, [int]$noiseTotal)
}

if ($DryRun) { Write-Host "`nDryRun 끝. 키를 설정한 뒤 -DryRun 없이 실행하세요."; exit 0 }

# 4) 저장: 기계용 JSON + 사람이 검토할 Markdown
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $OutDir "patch-candidates.json")

$md = @("# 한글패치 후보 검토표", "", "생성: $(Get-Date -Format 'yyyy-MM-dd HH:mm') · 네이버 검색 기반 추정, 사람 확인 전", "",
        "검색 결과가 없는 게임은 '패치 없음'이 아니라 '미확인'입니다.", "")
foreach ($r in $results | Sort-Object { -$_.candidates.Count }) {
    $md += "## $($r.title)$(if ($r.enTitle -and $r.enTitle -ne $r.title) { " ($($r.enTitle))" })"
    $md += "", "요약 상태: **$($r.summaryLabel)** (검색 기반 추정)$(if ($r.droppedFar) { " · 거리 조건으로 제외 $($r.droppedFar)개" })"
    if ($r.candidates.Count -eq 0) { $md += ""; continue }
    $md += ""
    foreach ($c in $r.candidates) {
        $flags = @()
        if ($c.mentionsGamePass) { $flags += "게임패스 언급" }
        if ($c.titleMatch -eq "partial") { $flags += "시리즈명만 일치" }
        if ($c.beforeRelease) { $flags += "출시일 이전 글" }
        if ($c.duplicates.Count) { $flags += "비슷한 글 $($c.duplicates.Count)개 묶음" }
        $md += "- [ ] **[$($c.statusLabel)]** [$($c.title -replace '[\[\]]', '')]($($c.link)) · $($c.source)$(if ($c.postDate) { " · $($c.postDate)" })$(if ($flags) { " · " + ($flags -join ', ') })"
    }
    $md += ""
}
$md -join "`n" | Out-File -Encoding utf8 (Join-Path $OutDir "patch-candidates.md")

Write-Host "`n[3] 요약" -ForegroundColor Cyan
$results | Group-Object summaryLabel | Sort-Object Count -Descending | ForEach-Object { Write-Host ("  {0,-22} {1,3}개" -f $_.Name, $_.Count) }
Write-Host "  게임패스판 언급 후보가 있는 게임: $(@($results | Where-Object { $_.candidates | Where-Object mentionsGamePass }).Count)개"
foreach ($k in 'template', 'trainer', 'retro', 'list', 'collision') {
    $label = @{ template = "공략 템플릿"; trainer = "트레이너 번역"; retro = "다른 기종판"; list = "목록형 글"; collision = "다른 게임명 충돌" }[$k]
    Write-Host ("  오탐 제외 - {0,-10} {1,3}건" -f $label, ($results | ForEach-Object { $_.droppedNoise.$k } | Measure-Object -Sum).Sum)
}
Write-Host "  API 호출: $($script:ApiCalls)회 (나머지는 캐시)"
Write-Host "`n저장: $OutDir\patch-candidates.json, patch-candidates.md"
