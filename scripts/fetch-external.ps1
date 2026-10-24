# 외부 게임 사전: 게임패스에 없는 게임(페르소나 5 로열, 메타포 등)도 사용자가 취향 기준으로 넣을 수 있게
# SteamSpy에서 인기 게임의 Steam 사용자 태그를 모아 docs/data/external.json으로 만든다.
# 브라우저는 Steam/SteamSpy를 직접 부를 수 없어서(CORS) 빌드할 때 미리 계산해 둔다.
#
# 후보: SteamSpy top100 목록 3종 + 장르 태그별 보유자 수 상위 N개. 상세(태그·평가)는 게임마다 appdetails로 따로 묻는다.
# SteamSpy는 IP당 초당 1회 정도만 허용하고 목록 요청은 무겁다 -> 목록 사이 60초, 상세 사이 2초 쉰다.
# 진행 상황은 data/external-cache.json에 쌓여 중단해도 이어서 돈다. 한 번 받은 게임은 60일 동안 다시 묻지 않는다.
# 보유자 수 순위로는 빠지는 명작은 data/external-seeds.txt(appid 또는 영어 제목)로 꼭 넣는다.
# 제목은 Steam 상점 검색으로 appid를 찾고, 그 결과도 캐시의 "seeds"에 남겨 매번 검색하지 않는다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/fetch-external.ps1 [-PerTag 150] [-Limit 0] [-Tags JRPG,RPG] [-Refresh] [-SeedsOnly]

param(
    [string]$SeedsPath = "data\external-seeds.txt",
    [switch]$SeedsOnly,
    [int]$PerTag = 150,
    [int]$Limit = 0,
    [switch]$Refresh,
    [int]$MaxAgeDays = 60,
    [string[]]$Tags = @('JRPG', 'RPG', 'Action RPG', 'Turn-Based Combat', 'Turn-Based Strategy', 'Story Rich', 'Souls-like',
        'Metroidvania', 'Open World', 'Strategy', 'Simulation', 'Racing', 'Puzzle', 'Roguelike', 'Survival', 'Horror',
        'Shooter', 'Sports', 'Fighting', 'Hack and Slash', 'Party-Based RPG', 'Visual Novel', 'Platformer', 'Adventure')
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path $PSScriptRoot -Parent
$CachePath = Join-Path $Root "data\external-cache.json"
$OutPath = Join-Path $Root "docs\data\external.json"
$UA = @{ 'User-Agent' = 'gamepass-curator (github.com/metear0411-cyber/gamepass-curator)' }
$Api = "https://steamspy.com/api.php"
# -File로 실행하면 "JRPG,RPG"가 문자열 하나로 들어온다
$Tags = @($Tags | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

function Get-Json([string]$url) {
    foreach ($try in 1..4) {
        try {
            $res = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers $UA
            return [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray()) | ConvertFrom-Json
        } catch {
            # 429(요청 과다)이면 길게 쉰다
            $wait = if ($_.Exception.Message -match '429') { 60 } else { 3 * $try }
            if ($try -eq 4) { throw }
            Start-Sleep -Seconds $wait
        }
    }
}

# owners는 "1,000,000 .. 2,000,000" 같은 범위 문자열이라 아래쪽 값으로 정렬한다
function Get-OwnersLow($s) {
    if ("$s" -match '^\s*([\d,]+)') { [long]($Matches[1] -replace ',', '') } else { 0 }
}

$BadName = '(?i)soundtrack|\bdemo\b|\bOST\b|\bSDK\b|dedicated server'
$BadTag = @('Software', 'Utilities', 'Soundtrack', 'Video Production', 'Audio Production', 'Design & Illustration', 'Animation & Modeling', 'Game Development')

# 게임이 아닌 것(소프트웨어·사운드트랙). 사용자 태그는 아래쪽에 "Soundtrack" 같은 게 섞이기 쉬워(페르소나 5 로열 등)
# 상위 3개 태그와 장르만 본다. $tagNames는 득표 많은 순.
function Test-Excluded($tagNames, $genres, $name) {
    $top3 = @($tagNames | Select-Object -First 3)
    [bool](@(@($top3) + @($genres) | Where-Object { $BadTag -contains $_ }).Count) -or ("$name" -match $BadName)
}

# 캐시 (appid -> 기록, "seeds"는 제목 -> appid 검색 결과)
$cache = @{}
$seedCache = @{}
if (Test-Path $CachePath) {
    $old = Get-Content -Raw -Encoding UTF8 $CachePath | ConvertFrom-Json
    foreach ($p in $old.PSObject.Properties) {
        if ($p.Name -eq 'seeds') { foreach ($s in $p.Value.PSObject.Properties) { $seedCache[$s.Name] = $s.Value } }
        else { $cache[$p.Name] = $p.Value }
    }
}
function Save-Cache {
    $ordered = [ordered]@{}
    foreach ($k in ($cache.Keys | Sort-Object { [int]$_ })) { $ordered[$k] = $cache[$k] }
    $so = [ordered]@{}
    foreach ($k in ($seedCache.Keys | Sort-Object)) { $so[$k] = $seedCache[$k] }
    $ordered['seeds'] = $so
    $ordered | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $CachePath
}

# 제목 비교용: 소문자로 바꾸고 글자·숫자만 남긴다 (™, 콜론, 공백 차이 무시)
function Get-NormName([string]$s) { ($s.ToLowerInvariant() -replace '[^\p{L}\p{N}]', '') }

$now = Get-Date
$cand = [ordered]@{}

# [0] 시드: 목록보다 먼저 넣어 -Limit으로 일부만 돌 때도 꼭 처리되게 한다
$seedFile = if ([IO.Path]::IsPathRooted($SeedsPath)) { $SeedsPath } else { Join-Path $Root $SeedsPath }
$seedOk = @(); $seedMiss = @()
if (Test-Path $seedFile) {
    $seeds = @(Get-Content -Encoding UTF8 $seedFile | ForEach-Object { ($_ -replace '^\s*#.*$', '' -replace '\s+#.*$', '').Trim() } | Where-Object { $_ })
    Write-Host "`n[0] 시드 $($seeds.Count)개 (제목 검색 사이 1.5초 대기)" -ForegroundColor Cyan
    $searched = 0
    foreach ($s in $seeds) {
        if ($s -match '^\d+$') {
            $name = if ($cache[$s]) { $cache[$s].name } else { "appid $s" }
            if (-not $cand.Contains($s)) { $cand[$s] = $name }
            $seedOk += "$s ($name)"
            continue
        }
        $sc = $seedCache[$s]
        $stale = $Refresh -or -not $sc -or ((-not $sc.appid) -and (($now - [datetime]$sc.checkedAt).TotalDays -gt $MaxAgeDays))
        if ($stale) {
            $q = Get-NormName $s
            # 긴 제목은 Steam 검색이 비어 오기도 해서, 못 찾으면 ':' / ' - ' 앞부분으로 한 번 더 찾는다 (비교는 전체 제목으로)
            $terms = @($s)
            $short = ($s -split '\s*:\s*|\s+[-–]\s+')[0].Trim()
            if ($short -and $short -ne $s) { $terms += $short }
            $hit = $null; $failed = $false
            foreach ($term in $terms) {
                if ($searched -gt 0) { Start-Sleep -Milliseconds 1500 }
                $searched++
                try {
                    $r = Get-Json "https://store.steampowered.com/api/storesearch/?term=$([uri]::EscapeDataString($term))&cc=kr&l=english"
                } catch {
                    Write-Host "  검색 실패: $s - $($_.Exception.Message)" -ForegroundColor Yellow
                    $failed = $true; break
                }
                $items = @($r.items | Where-Object { $_.id })
                $hit = $items | Where-Object { (Get-NormName $_.name) -eq $q } | Select-Object -First 1
                if (-not $hit) { $hit = $items | Where-Object { (Get-NormName $_.name).StartsWith($q) } | Select-Object -First 1 }
                if ($hit) { break }
            }
            if ($failed) {
                $seedMiss += $s
                continue   # 기록하지 않아 다음 실행에서 다시 찾는다
            }
            $sc = [ordered]@{
                appid = $(if ($hit) { [int]$hit.id } else { $null }); name = $(if ($hit) { $hit.name } else { $null })
                checkedAt = $now.ToString("yyyy-MM-dd")
            }
            $seedCache[$s] = $sc
        }
        if ($sc.appid) {
            $k = "$($sc.appid)"
            if (-not $cand.Contains($k)) { $cand[$k] = $sc.name }
            $seedOk += "$s -> $k ($($sc.name))"
        } else {
            Write-Host "  찾지 못함: $s" -ForegroundColor Yellow
            $seedMiss += $s
        }
    }
    Save-Cache
    Write-Host ("  시드 결과: 찾음 {0}, 못 찾음 {1} (새로 검색 {2})" -f $seedOk.Count, $seedMiss.Count, $searched)
} else {
    Write-Host "`n[0] 시드 파일 없음: $seedFile" -ForegroundColor Yellow
}

# [1] 후보 목록. 태그 목록을 먼저 모아야 -Limit으로 일부만 돌 때도 장르 게임이 앞에 온다
$lists = @()
if ($SeedsOnly) {
    Write-Host "`n[1] -SeedsOnly: 목록 요청은 건너뛴다" -ForegroundColor Cyan
} else {
    Write-Host "`n[1] 후보 목록 (목록 요청 사이 60초 대기)" -ForegroundColor Cyan
    $lists = @($Tags | ForEach-Object { @{ label = "태그 $_"; url = "$Api`?request=tag&tag=$([uri]::EscapeDataString($_))"; top = $PerTag } })
    $lists += @('top100forever', 'top100owned', 'top100in2weeks' | ForEach-Object { @{ label = $_; url = "$Api`?request=$_"; top = 0 } })
}
$first = $true
foreach ($l in $lists) {
    if (-not $first) { Start-Sleep -Seconds 60 }
    $first = $false
    try { $res = Get-Json $l.url } catch {
        Write-Host "  실패: $($l.label) - $($_.Exception.Message)" -ForegroundColor Yellow
        continue
    }
    $items = @($res.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object { $_.appid -and $_.name -notmatch $BadName })
    $items = @($items | Sort-Object { Get-OwnersLow $_.owners } -Descending)
    if ($l.top -gt 0) { $items = @($items | Select-Object -First $l.top) }
    $new = 0
    foreach ($it in $items) {
        $k = "$($it.appid)"
        if (-not $cand.Contains($k)) { $cand[$k] = $it.name; $new++ }
    }
    Write-Host ("  {0}: {1}개 (새 후보 {2}, 누적 {3})" -f $l.label, $items.Count, $new, $cand.Count)
}

# [2] 상세 조회
$todo = @($cand.Keys | Where-Object {
    $rec = $cache[$_]
    $Refresh -or -not $rec -or (($now - [datetime]$rec.checkedAt).TotalDays -gt $MaxAgeDays)
})
if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }
Write-Host "`n[2] 상세 조회: $($todo.Count)개 (후보 $($cand.Count)개 중, 나머지는 캐시 사용)" -ForegroundColor Cyan

$n = 0; $ok = 0; $skipped = 0
foreach ($id in $todo) {
    $n++
    if ($n -gt 1) { Start-Sleep -Seconds 2 }
    try {
        $d = Get-Json "$Api`?request=appdetails&appid=$id"
    } catch {
        Write-Host "  실패: $($cand[$id]) - $($_.Exception.Message)" -ForegroundColor Yellow
        continue   # 기록하지 않아 다음 실행에서 다시 묻는다
    }
    # 태그가 없으면 SteamSpy는 빈 배열을 준다
    $tv = [ordered]@{}
    if ($d.tags -and $d.tags -isnot [array]) {
        $d.tags.PSObject.Properties | Sort-Object { [int]$_.Value } -Descending | Select-Object -First 20 | ForEach-Object { $tv[$_.Name] = [int]$_.Value }
    }
    $genres = @("$($d.genre)" -split '\s*,\s*' | Where-Object { $_ })
    # 소프트웨어·사운드트랙은 게임 사전에 넣지 않되, 기록은 남겨 다시 묻지 않는다
    $excluded = Test-Excluded @($tv.Keys) $genres $d.name
    $cache[$id] = [ordered]@{
        appid = [int]$id; name = $(if ($d.name) { $d.name } else { $cand[$id] })
        tags = $tv; genre = $genres; positive = [int]$d.positive; negative = [int]$d.negative
        excluded = $excluded; checkedAt = $now.ToString("yyyy-MM-dd")
    }
    if ($excluded) { $skipped++ } else { $ok++ }
    $mark = if ($excluded) { "제외(게임 아님)" } else { "태그 $($tv.Count)개 · $(($tv.Keys | Select-Object -First 3) -join ', ')" }
    Write-Host ("  [{0}/{1}] {2} -> {3}" -f $n, $todo.Count, $cache[$id].name, $mark)
    if ($n % 25 -eq 0) { Save-Cache }
}
Save-Cache

# [3] 캐시 전체로 사전을 만든다 (일부만 돈 실행이어도 쓸 수 있게)
$games = foreach ($k in ($cache.Keys | Sort-Object { [int]$_ })) {
    $r = $cache[$k]
    $props = @($r.tags.PSObject.Properties | ForEach-Object { $_ })
    if ($r.tags -is [Collections.IDictionary]) { $props = @($r.tags.GetEnumerator() | ForEach-Object { [pscustomobject]@{ Name = $_.Key; Value = $_.Value } }) }
    if (-not $props.Count) { continue }   # 태그가 없으면 취향 비교에 쓸 수 없다
    $props = @($props | Sort-Object { [int]$_.Value } -Descending)
    # 제외 여부는 저장된 값 대신 다시 판단한다 (예전 기준으로 잘못 빠진 게임 복구)
    $r.excluded = Test-Excluded @($props | ForEach-Object { $_.Name }) $r.genre $r.name
    if ($r.excluded) { continue }
    $top = @($props | Select-Object -First 15)
    $max = [double]$top[0].Value
    $tw = [ordered]@{}
    foreach ($t in $top) { $tw[$t.Name] = [Math]::Round([double]$t.Value / $max, 2) }
    $votes = [int]$r.positive + [int]$r.negative
    [ordered]@{
        appid = [int]$r.appid; name = $r.name; tags = $tw; genres = @($r.genre | Where-Object { $_ })
        score = $(if ($votes -ge 50) { [int][Math]::Round(100.0 * [int]$r.positive / $votes) } else { $null })
    }
}
Save-Cache   # 다시 판단한 제외 여부도 남긴다
$out = [ordered]@{ generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); source = "SteamSpy"; games = @($games) }
$out | ConvertTo-Json -Depth 5 -Compress | Out-File -Encoding utf8 $OutPath

Write-Host "`n이번 실행: 받음 $ok, 제외 $skipped / $($todo.Count). 사전 $(@($games).Count)개 저장: docs/data/external.json"
if ($seedMiss.Count) { Write-Host "시드 못 찾음($($seedMiss.Count)): $($seedMiss -join ' / ')" -ForegroundColor Yellow }
