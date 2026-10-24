# Steam 정보 보강: 게임패스 게임마다 Steam에서 같은 게임을 찾아
#  - 메타크리틱 점수 (Steam 상점 정보에 들어 있는 값)
#  - Steam 사용자 태그와 투표 수 (SteamSpy) : "JRPG", "Turn-Based Combat", "Story Rich" 같은, 플레이어가 붙인 태그
# 를 data/steam.json에 쌓는다. build-data.ps1이 이 파일을 읽어 추천 특성과 메타 점수로 쓴다.
#
# Steam은 요청 수 제한이 있어 천천히 돈다 (약 1.5초에 1번). 처음엔 680개에 약 50분, 이후엔 새 게임만.
# 한 번 찾은 게임은 30일 동안 다시 묻지 않는다 (-Refresh로 무시).
# 사용: powershell -ExecutionPolicy Bypass -File scripts/fetch-steam.ps1 [-Limit 20] [-Refresh]

param(
    [int]$Limit = 0,
    [switch]$Refresh,
    [int]$MaxAgeDays = 30
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path $PSScriptRoot -Parent
$CatalogPath = Join-Path $Root "data\catalog.json"
$OutPath = Join-Path $Root "data\steam.json"
$UA = @{ 'User-Agent' = 'gamepass-curator (github.com/metear0411-cyber/gamepass-curator)' }

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

# 판본 이름·기호를 뺀 제목 (build-data.ps1의 Get-GroupKey와 같은 생각). Steam 검색어로도 쓴다
function Get-Core([string]$t) {
    $t = $t -replace '[™®©]', '' -replace '\([^)]*\)', '' -replace '\[[^\]]*\]', ''
    $t = $t -replace "(?i)\s*[-–:]\s*([\w'’]+\s+){0,3}editions?\s*$", ''
    $t = $t -replace "(?i)\s+(standard|deluxe|definitive|complete|ultimate|gold|premium|enhanced|special|legendary|anniversary|game of the year|goty)\s+editions?\s*$", ''
    $t = $t -replace '(?i)\s*-?\s*(PC|for windows|windows 10|windows|xbox series x\|s|xbox one)\s*$', ''
    ($t -replace '\s+', ' ').Trim()
}
function Get-Key([string]$t) { ((Get-Core $t).ToLower() -replace '[^\p{L}\p{N}]', '') }

if (-not (Test-Path $CatalogPath)) { throw "$CatalogPath 가 없습니다. build-data.ps1 을 먼저 실행하세요." }
$catalog = @(Get-Content -Raw -Encoding UTF8 $CatalogPath | ConvertFrom-Json | ForEach-Object { $_ })

# 기존 결과
$store = @{}
if (Test-Path $OutPath) {
    $old = Get-Content -Raw -Encoding UTF8 $OutPath | ConvertFrom-Json
    foreach ($p in $old.PSObject.Properties) { $store[$p.Name] = $p.Value }
}

# Steam 검색은 영어 제목이 정확하다 (한국 스토어 제목은 한글인 경우가 많음)
Write-Host "`n[1] 영어 제목 조회" -ForegroundColor Cyan
$en = @{}
$ids = @($catalog.id)
for ($i = 0; $i -lt $ids.Count; $i += 20) {
    $batch = $ids[$i..([Math]::Min($i + 19, $ids.Count - 1))] -join ","
    foreach ($p in (Get-Json "https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=$batch&market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp+F.1").Products) {
        $en[$p.ProductId] = $p.LocalizedProperties[0].ProductTitle
    }
}

# 같은 제목(PC판·콘솔판)은 한 번만 묻는다
$groups = $catalog | Group-Object { Get-Key $(if ($en[$_.id]) { $en[$_.id] } else { $_.title }) }
$now = Get-Date
$todo = @($groups | Where-Object {
    $rec = $store[$_.Group[0].id]
    $Refresh -or -not $rec -or (($now - [datetime]$rec.checkedAt).TotalDays -gt $MaxAgeDays)
})
if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }
Write-Host "`n[2] Steam 조회: $($todo.Count)개 (전체 $($groups.Count)개 중, 나머지는 저장된 결과 사용)" -ForegroundColor Cyan

function Save-Store {
    $ordered = [ordered]@{}
    foreach ($k in ($store.Keys | Sort-Object)) { $ordered[$k] = $store[$k] }
    $ordered | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $OutPath
}

$n = 0; $found = 0
foreach ($grp in $todo) {
    $n++
    $first = $grp.Group[0]
    $title = if ($en[$first.id]) { $en[$first.id] } else { $first.title }
    $key = $grp.Name
    $rec = [ordered]@{ appid = $null; name = $null; metacritic = $null; metacriticUrl = $null; tags = $null; checkedAt = $now.ToString("yyyy-MM-dd") }
    try {
        $q = Get-Core $title
        $s = Get-Json "https://store.steampowered.com/api/storesearch/?term=$([uri]::EscapeDataString($q))&cc=kr&l=english"
        Start-Sleep -Milliseconds 1500
        # 제목이 같은 것만 같은 게임으로 본다 (데모·사운드트랙·가이드북 오탐 방지)
        $hit = @($s.items | Where-Object { (Get-Key $_.name) -eq $key }) | Select-Object -First 1
        if ($hit) {
            $rec.appid = $hit.id; $rec.name = $hit.name
            $d = Get-Json "https://store.steampowered.com/api/appdetails?appids=$($hit.id)&cc=kr&filters=basic,metacritic"
            Start-Sleep -Milliseconds 1500
            $mc = $d."$($hit.id)".data.metacritic
            if ($mc) { $rec.metacritic = [int]$mc.score; $rec.metacriticUrl = $mc.url }
            $sp = Get-Json "https://steamspy.com/api.php?request=appdetails&appid=$($hit.id)"
            Start-Sleep -Milliseconds 1100
            if ($sp.tags) {
                $tags = [ordered]@{}
                $sp.tags.PSObject.Properties | Sort-Object { [int]$_.Value } -Descending | Select-Object -First 20 | ForEach-Object { $tags[$_.Name] = [int]$_.Value }
                $rec.tags = $tags
            }
            $found++
        }
    } catch {
        Write-Host "  실패: $title - $($_.Exception.Message)" -ForegroundColor Yellow
        continue   # 실패한 게임은 기록하지 않아 다음 실행에서 다시 묻는다
    }
    foreach ($item in $grp.Group) { $store[$item.id] = $rec }
    $mark = if ($rec.appid) { "Steam $($rec.appid)$(if ($rec.metacritic) { " · 메타 $($rec.metacritic)" })" } else { "Steam에 없음" }
    Write-Host ("  [{0}/{1}] {2} -> {3}" -f $n, $todo.Count, $title, $mark)
    if ($n % 20 -eq 0) { Save-Store }
}
Save-Store
Write-Host "`n찾음 $found / $($todo.Count). 저장: data/steam.json"
