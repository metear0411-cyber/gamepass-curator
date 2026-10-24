# 데이터 검증: 빌드한 docs/data/games.json·external.json을 커밋하기 전에 확인한다.
# 비공식 API가 바뀌거나 Steam이 멈추면 빈 값·반쪽 데이터가 그대로 커밋될 수 있어서,
# 구조(스키마)와 직전 커밋 대비 급변을 보고 실패(FAIL)면 종료 코드 1을 돌려준다. 경고(WARN)는 출력만 한다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/validate-data.ps1 [-GamesPath docs/data/games.json] [-ExternalPath docs/data/external.json] [-PreviousRef HEAD] [-HistoryPath data/history.json]

param(
    [string]$GamesPath = "docs/data/games.json",
    [string]$ExternalPath = "docs/data/external.json",
    [string]$PreviousRef = "HEAD",
    [string]$HistoryPath = "data/history.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path $PSScriptRoot -Parent

function Resolve-InRoot([string]$p) { if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $Root $p } }
$GamesFull = Resolve-InRoot $GamesPath
$ExternalFull = Resolve-InRoot $ExternalPath
$HistoryFull = Resolve-InRoot $HistoryPath
$GenDay = $null   # generatedAt의 한국 날짜. build-data가 등록 기록 날짜를 한국 시간으로 매기므로 같은 기준으로 비교한다

# ---------- 결과 모음 ----------

$Results = New-Object System.Collections.ArrayList
function Add-Result([string]$group, [string]$item, [string]$level, [string]$detail) {
    [void]$Results.Add([pscustomobject]@{ 구분 = $group; 항목 = $item; 결과 = $level; 내용 = $detail })
}

# 게임 680개마다 같은 오류를 찍으면 읽을 수 없어서, 검사 항목별로 개수와 예시 3개만 모은다
$Issues = [ordered]@{}
function Add-Issue([string]$key, [string]$example) {
    if (-not $Issues.Contains($key)) { $Issues[$key] = @{ Count = 0; Examples = New-Object System.Collections.ArrayList } }
    $Issues[$key].Count++
    if ($Issues[$key].Examples.Count -lt 3) { [void]$Issues[$key].Examples.Add($example) }
}

# ---------- 타입 도우미 (PS 5.1 ConvertFrom-Json 결과 기준) ----------

function Test-Has($o, [string]$name) { $null -ne $o -and $null -ne $o.PSObject -and $null -ne $o.PSObject.Properties[$name] }
function Test-Str($v) { $v -is [string] }
function Test-Num($v) { $v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal] }
function Test-Int($v) { $v -is [int] -or $v -is [long] -or (($v -is [double] -or $v -is [decimal]) -and [Math]::Floor($v) -eq $v) }
function Test-Bool($v) { $v -is [bool] }
function Test-Arr($v) { $v -is [array] }
function Test-Obj($v) { $v -is [Management.Automation.PSCustomObject] }
function Test-StrArr($v) { (Test-Arr $v) -and -not (@($v) | Where-Object { -not (Test-Str $_) }) }
# 가중치 객체: { "이름": 0~1 } 형태인지
function Test-Weights($v) {
    if (-not (Test-Obj $v)) { return $false }
    foreach ($p in $v.PSObject.Properties) { if (-not (Test-Num $p.Value) -or $p.Value -lt 0 -or $p.Value -gt 1) { return $false } }
    $true
}

function Read-JsonText([string]$text) { $text | ConvertFrom-Json }

function Test-Day($v) { (Test-Str $v) -and $v -match '^\d{4}-\d{2}-\d{2}$' }
function ConvertTo-DayDate([string]$s) { [datetime]::ParseExact($s, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) }

# PowerShell 7은 generatedAt을 DateTime으로 읽으므로 문자열·DateTime 둘 다 받는다
function Get-KstDay($v) {
    try {
        $dt = if ($v -is [datetime]) { $v } else { [datetime]::Parse([string]$v, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) }
        $dt.ToUniversalTime().AddHours(9).Date
    } catch { $null }
}

# ---------- git: 직전 커밋 버전 읽기 ----------

function Get-GitExe {
    $c = "C:\Program Files\Git\cmd\git.exe"
    if (Test-Path $c) { return $c }
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $null
}

# PS 5.1은 네이티브 명령 출력을 콘솔 코드페이지로 읽어 한글이 깨지므로, 프로세스를 직접 띄워 UTF-8로 받는다
function Invoke-Git([string]$git, [string[]]$gitArgs) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $git
    $psi.Arguments = ($gitArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $psi.WorkingDirectory = Split-Path $GamesFull -Parent   # games.json이 속한 저장소 기준
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $pr = [Diagnostics.Process]::Start($psi)
    $errTask = $pr.StandardError.ReadToEndAsync()   # stderr가 가득 차서 멈추지 않도록 동시에 읽는다
    $out = $pr.StandardOutput.ReadToEnd()
    $pr.WaitForExit()
    [pscustomobject]@{ Code = $pr.ExitCode; Out = $out; Err = $errTask.Result.Trim() }
}

function Get-PreviousGames {
    $git = Get-GitExe
    if (-not $git) { return @{ Skip = "git을 찾을 수 없음" } }
    $top = Invoke-Git $git @("rev-parse", "--show-toplevel")
    if ($top.Code -ne 0) { return @{ Skip = "git 저장소가 아님 ($($top.Err))" } }
    $topDir = [IO.Path]::GetFullPath($top.Out.Trim()).TrimEnd('\', '/')
    $full = [IO.Path]::GetFullPath($GamesFull)
    if (-not $full.StartsWith($topDir, [StringComparison]::OrdinalIgnoreCase)) { return @{ Skip = "games.json이 저장소 밖에 있음" } }
    $rel = $full.Substring($topDir.Length).TrimStart('\', '/') -replace '\\', '/'
    $show = Invoke-Git $git @("show", "${PreviousRef}:$rel")
    if ($show.Code -ne 0) { return @{ Skip = "$PreviousRef 에 $rel 이 없음" } }
    try { return @{ Data = (Read-JsonText $show.Out) } }
    catch { return @{ Skip = "직전 버전 JSON 읽기 실패: $($_.Exception.Message)" } }
}

# ---------- 지표 (현재·직전 비교용) ----------

$KoreanStatuses = @('official', 'official_likely', 'patch', 'patch_blocked', 'planned', 'none', 'none_found', 'unknown')
$InstallClasses = @('accessible', 'launcher', 'protected', 'uwp', 'console', 'unknown')

function Get-Stats($data) {
    $gs = @($data.games | Where-Object { $_ })
    $n = $gs.Count
    $official = @($gs | Where-Object { (Test-Has $_ 'korean') -and $_.korean.status -eq 'official' }).Count
    $hasMc = @($gs | Where-Object { (Test-Has $_ 'metacritic') -and $null -ne $_.metacritic }).Count
    $hasTags = @($gs | Where-Object { (Test-Has $_ 'steamTags') -and (Test-Obj $_.steamTags) -and @($_.steamTags.PSObject.Properties).Count -gt 0 }).Count
    [pscustomobject]@{
        Count      = $n
        Official   = $official
        OfficialPct = if ($n) { 100.0 * $official / $n } else { 0 }
        Metacritic = $hasMc
        SteamTags  = $hasTags
        Playtime   = @($gs | Where-Object { (Test-Has $_ 'playtime') -and $null -ne $_.playtime }).Count
        Price      = @($gs | Where-Object { (Test-Has $_ 'price') -and $null -ne $_.price }).Count
        GamepassMc = @($gs | Where-Object { (Test-Has $_ 'metacriticSource') -and $_.metacriticSource -eq 'gamepass' }).Count
        Handheld   = @($gs | Where-Object { (Test-Has $_ 'handheldReady') -and $_.handheldReady -eq $true }).Count
    }
}

# ---------- 1) games.json 스키마 ----------

function Test-Game($g, [int]$i) {
    $name = if ((Test-Has $g 'title') -and (Test-Str $g.title)) { "$($g.title)" } else { "#$i" }
    $check = {
        param([string]$field, [scriptblock]$ok, [string]$what)
        if (-not (Test-Has $g $field)) { Add-Issue "필드 없음: $field" $name; return }
        $v = $g.$field
        if (-not (& $ok $v)) { Add-Issue "형식 오류: $field ($what)" $name }
    }
    & $check 'id' { param($v) (Test-Str $v) -and $v } "빈 값이 아닌 문자열"
    & $check 'ids' { param($v) (Test-StrArr $v) -and @($v).Count -gt 0 -and -not (@($v) | Where-Object { -not $_ }) } "빈 값 없는 문자열 배열 1개 이상"
    & $check 'title' { param($v) (Test-Str $v) -and $v.Trim() } "빈 값이 아닌 문자열"
    & $check 'publisher' { param($v) $null -eq $v -or (Test-Str $v) } "문자열"
    & $check 'developer' { param($v) $null -eq $v -or (Test-Str $v) } "문자열"
    & $check 'releaseDate' { param($v) $null -eq $v -or ((Test-Str $v) -and $v -match '^\d{4}-\d{2}-\d{2}$') } "null 또는 yyyy-MM-dd"
    & $check 'poster' { param($v) $null -eq $v -or ((Test-Str $v) -and $v -match '^https://') } "https 주소"
    & $check 'hero' { param($v) $null -eq $v -or ((Test-Str $v) -and $v -match '^https://') } "null 또는 https 주소"
    & $check 'description' { param($v) $null -eq $v -or (Test-Str $v) } "문자열"
    & $check 'genres' { param($v) Test-StrArr $v } "문자열 배열"
    & $check 'tagW' { param($v) Test-Weights $v } "값이 0~1인 객체"
    & $check 'styles' { param($v) Test-StrArr $v } "문자열 배열"
    & $check 'modes' { param($v) Test-StrArr $v } "문자열 배열"
    & $check 'rating' { param($v) $null -eq $v -or ((Test-Num $v) -and $v -ge 0 -and $v -le 5) } "null 또는 0~5"
    & $check 'ratingCount' { param($v) (Test-Int $v) -and $v -ge 0 } "0 이상 정수"
    & $check 'plans' { param($v) (Test-Obj $v) -and (Test-StrArr $v.ultimate) -and (Test-StrArr $v.premium) -and (Test-StrArr $v.essential) -and (Test-Bool $v.pcgp) } "ultimate/premium/essential 배열 + pcgp 참거짓"
    & $check 'naverPlus' { param($v) Test-Bool $v } "참거짓"
    & $check 'korean' { param($v) (Test-Obj $v) -and (Test-Str $v.label) -and (Test-Str $v.source) -and ($null -eq $v.link -or (Test-Str $v.link)) -and (Test-Bool $v.verified) } "status/label/source/link/verified"
    & $check 'install' { param($v) (Test-Obj $v) -and (Test-Bool $v.officialMods) } "class/officialMods"
    & $check 'content' { param($v) (Test-Obj $v) -and ($null -eq $v.grac -or (Test-Str $v.grac)) -and (Test-StrArr $v.flags) } "grac/flags"
    & $check 'leavingSoon' { param($v) Test-Bool $v } "참거짓"
    & $check 'recentlyAdded' { param($v) Test-Bool $v } "참거짓"
    & $check 'steamAppId' { param($v) $null -eq $v -or ((Test-Int $v) -and $v -gt 0) } "null 또는 양의 정수"
    & $check 'metacritic' { param($v) $null -eq $v -or ((Test-Num $v) -and $v -ge 1 -and $v -le 100) } "null 또는 1~100"
    & $check 'metacriticSource' { param($v) $null -eq $v -or @('steam', 'gamepass') -ccontains $v } "null, steam, gamepass"
    & $check 'metacriticUrl' { param($v) $null -eq $v -or (Test-Str $v) } "null 또는 문자열"
    & $check 'steamTags' { param($v) Test-Weights $v } "값이 0~1인 객체"
    & $check 'features' { param($v) Test-StrArr $v } "문자열 배열"
    & $check 'addedRank' { param($v) $null -eq $v -or ((Test-Int $v) -and $v -ge 0) } "null 또는 0 이상 정수"
    & $check 'familyKids' { param($v) Test-Bool $v } "참거짓"
    & $check 'partner' { param($v) $null -eq $v -or @('ea', 'ubisoft') -ccontains $v } "null, ea, ubisoft"
    & $check 'playtime' { param($v) $null -eq $v -or ((Test-Obj $v) -and (Test-Has $v 'main') -and (Test-Has $v 'mainPlus') -and (Test-Has $v 'completionist') -and -not (@($v.main, $v.mainPlus, $v.completionist) | Where-Object { $null -ne $_ -and -not ((Test-Num $_) -and $_ -ge 0) })) } "null 또는 main/mainPlus/completionist(null 또는 0 이상)"
    & $check 'price' { param($v) $null -eq $v -or ((Test-Obj $v) -and (Test-Num $v.msrp) -and (Test-Has $v 'gamePass') -and ($null -eq $v.gamePass -or (Test-Num $v.gamePass)) -and (Test-Has $v 'discount') -and ($null -eq $v.discount -or ((Test-Int $v.discount) -and $v.discount -ge 0 -and $v.discount -le 100)) -and (Test-Str $v.currency)) } "null 또는 msrp/gamePass/discount(0~100)/currency"
    & $check 'accessibility' { param($v) Test-StrArr $v } "문자열 배열"
    & $check 'handheld' { param($v) $null -eq $v -or (Test-Str $v) } "null 또는 문자열"
    & $check 'cloud' { param($v) Test-Bool $v } "참거짓"
    & $check 'cloudTouch' { param($v) Test-Bool $v } "참거짓"
    & $check 'installSizeGB' { param($v) $null -eq $v -or ((Test-Num $v) -and $v -gt 0) } "null 또는 0보다 큰 수"
    & $check 'minAge' { param($v) $null -eq $v -or ((Test-Int $v) -and $v -ge 0) } "null 또는 0 이상 정수"
    & $check 'handheldReady' { param($v) Test-Bool $v } "참거짓"
    & $check 'firstSeen' { param($v) Test-Day $v } "yyyy-MM-dd"
    & $check 'daysOnPass' { param($v) (Test-Int $v) -and $v -ge 0 } "0 이상 정수"

    # 점수와 출처는 짝이 맞아야 웹앱이 "Steam/게임패스 앱 기준"을 제대로 표시한다
    if ((Test-Has $g 'metacritic') -and (Test-Has $g 'metacriticSource') -and (($null -eq $g.metacritic) -ne ($null -eq $g.metacriticSource))) { Add-Issue "metacritic과 metacriticSource 짝 불일치" $name }
    if ($GenDay -and (Test-Has $g 'firstSeen') -and (Test-Day $g.firstSeen) -and (ConvertTo-DayDate $g.firstSeen) -gt $GenDay) { Add-Issue "firstSeen이 생성일보다 뒤" "$name ($($g.firstSeen))" }

    # 값 범위는 필드가 있을 때만 따로 본다 (필드 없음과 섞이지 않게)
    if ((Test-Has $g 'korean') -and (Test-Obj $g.korean) -and $KoreanStatuses -notcontains $g.korean.status) { Add-Issue "허용되지 않은 korean.status" "$name ($($g.korean.status))" }
    if ((Test-Has $g 'install') -and (Test-Obj $g.install) -and $InstallClasses -notcontains $g.install.class) { Add-Issue "허용되지 않은 install.class" "$name ($($g.install.class))" }
    if ((Test-Has $g 'poster') -and $null -eq $g.poster) { Add-Issue "포스터 없음(null)" $name }
    if ((Test-Has $g 'id') -and (Test-Has $g 'ids') -and (Test-Arr $g.ids) -and @($g.ids) -notcontains $g.id) { Add-Issue "id가 ids 안에 없음" $name }
}

$games = $null
$cur = $null
if (-not (Test-Path $GamesFull)) {
    Add-Result "games.json" "파일" "FAIL" "$GamesPath 파일이 없습니다"
} else {
    try { $games = Read-JsonText ([IO.File]::ReadAllText($GamesFull, [Text.Encoding]::UTF8)) }
    catch { Add-Result "games.json" "JSON 읽기" "FAIL" "JSON 파싱 실패: $($_.Exception.Message)" }
}

if ($games) {
    # 최상위 구조
    $top = @()
    if (Test-Has $games 'generatedAt') { $GenDay = Get-KstDay $games.generatedAt }
    if (-not $GenDay) { $top += "generatedAt(날짜)" }
    if (-not ((Test-Has $games 'market') -and (Test-Str $games.market))) { $top += "market" }
    if (-not ((Test-Has $games 'sources') -and (Test-Obj $games.sources))) { $top += "sources" }
    if (-not ((Test-Has $games 'games') -and (Test-Arr $games.games))) { $top += "games(배열)" }
    if (-not ((Test-Has $games 'rules') -and (Test-Obj $games.rules))) { $top += "rules" }
    else {
        $r = $games.rules
        if (-not (Test-Obj $r.tags)) { $top += "rules.tags" }
        if (-not (Test-Int $r.tagMinHits)) { $top += "rules.tagMinHits" }
        if (-not (Test-Obj $r.styles)) { $top += "rules.styles" }
        if (-not (Test-Str $r.japaneseMakers)) { $top += "rules.japaneseMakers" }
        if (-not (Test-Obj $r.content)) { $top += "rules.content" }
        if (-not (Test-Obj $r.steamBridge)) { $top += "rules.steamBridge" }
    }
    if (-not ((Test-Has $games 'comingSoon') -and (Test-Arr $games.comingSoon))) { $top += "comingSoon(배열)" }
    if (-not ((Test-Has $games 'recentlyLeft') -and (Test-Arr $games.recentlyLeft))) { $top += "recentlyLeft(배열)" }
    if ((Test-Has $games 'rules') -and (Test-Obj $games.rules)) {
        # Steam 태그 한국어 이름표: 비어 있으면 영어 태그로 보이기만 하므로 경고
        $sk = $games.rules.steamKo
        if (-not ((Test-Has $games.rules 'steamKo') -and (Test-Obj $sk))) { $top += "rules.steamKo" }
        elseif (@($sk.PSObject.Properties | Where-Object { -not (Test-Str $_.Value) }).Count) { $top += "rules.steamKo(값은 문자열)" }
        elseif (-not @($sk.PSObject.Properties).Count) { Add-Result "games.json" "rules.steamKo" "WARN" "비어 있음 (Steam 태그가 영어로 보임)" }
        else { Add-Result "games.json" "rules.steamKo" "PASS" "$(@($sk.PSObject.Properties).Count)개" }
    }
    if ($top.Count) { Add-Result "games.json" "최상위 구조" "FAIL" ("없거나 형식이 틀림: " + ($top -join ", ")) }
    else { Add-Result "games.json" "최상위 구조" "PASS" "generatedAt $($games.generatedAt), market $($games.market)" }

    # 출시 예정 목록: 웹앱이 카드로 그리므로 게임과 같은 기준으로 본다
    if ((Test-Has $games 'comingSoon') -and (Test-Arr $games.comingSoon)) {
        $csBad = @()
        $ci = 0
        foreach ($c in @($games.comingSoon)) {
            $ci++
            $cn = if ((Test-Has $c 'title') -and (Test-Str $c.title)) { $c.title } else { "#$ci" }
            $ok = (Test-Obj $c) -and (Test-Str $c.id) -and $c.id -and (Test-Str $c.title) -and
                  (Test-Has $c 'poster') -and ($null -eq $c.poster -or ((Test-Str $c.poster) -and $c.poster -match '^https://')) -and
                  (Test-Has $c 'releaseDate') -and ($null -eq $c.releaseDate -or ((Test-Str $c.releaseDate) -and $c.releaseDate -match '^\d{4}-\d{2}-\d{2}$')) -and
                  (Test-StrArr $c.genres)
            if (-not $ok) { $csBad += $cn }
        }
        if ($csBad.Count) { Add-Result "games.json" "comingSoon 형식" "FAIL" ("{0}개 (예: {1}) - id/title 문자열, poster null|https, releaseDate null|yyyy-MM-dd, genres 배열" -f $csBad.Count, (($csBad | Select-Object -First 3) -join ", ")) }
        else { Add-Result "games.json" "comingSoon 형식" "PASS" "$(@($games.comingSoon).Count)개" }
    }

    $list = @($games.games | Where-Object { $null -ne $_ })

    # 최근 빠진 게임: 아직 목록에 있는 게임이 섞이면 등록 기록 키가 꼬인 것이다
    if ((Test-Has $games 'recentlyLeft') -and (Test-Arr $games.recentlyLeft)) {
        $curTitles = @{}; foreach ($g in $list) { if (Test-Str $g.title) { $curTitles[$g.title] = $true } }
        $rlBad = @(); $rlDup = @(); $ri = 0
        foreach ($e in @($games.recentlyLeft)) {
            $ri++
            $en = if ((Test-Has $e 'title') -and (Test-Str $e.title)) { $e.title } else { "#$ri" }
            $ok = (Test-Obj $e) -and (Test-Str $e.title) -and (Test-Day $e.lastSeen)
            if ($ok -and $GenDay) { $d = ($GenDay - (ConvertTo-DayDate $e.lastSeen)).Days; $ok = $d -ge 0 -and $d -le 30 }
            if (-not $ok) { $rlBad += "$en ($($e.lastSeen))" }
            if ((Test-Str $e.title) -and $curTitles.ContainsKey($e.title)) { $rlDup += $en }
        }
        $rlN = @($games.recentlyLeft).Count
        if ($rlBad.Count) { Add-Result "games.json" "recentlyLeft 형식" "FAIL" ("{0}개 (예: {1}) - title 문자열, lastSeen이 생성일 30일 이내" -f $rlBad.Count, (($rlBad | Select-Object -First 3) -join ", ")) }
        if ($rlDup.Count) { Add-Result "games.json" "recentlyLeft 현재 게임과 겹침" "FAIL" ("{0}개 (예: {1})" -f $rlDup.Count, (($rlDup | Select-Object -First 3) -join ", ")) }
        if ($rlN -gt 60) { Add-Result "games.json" "recentlyLeft 개수" "WARN" "$($rlN)개 (60개 초과: 목록 일부를 못 읽었을 수 있음)" }
        elseif (-not $rlBad.Count -and -not $rlDup.Count) { Add-Result "games.json" "recentlyLeft" "PASS" "$($rlN)개" }
    }

    $i = 0
    foreach ($g in $list) {
        $i++
        try { Test-Game $g $i } catch { Add-Issue "검사 중 오류" "#$i $($_.Exception.Message)" }
    }

    # 게임별 문제: 포스터 없음은 웹앱이 대체 이미지로 버티므로 경고, 나머지는 실패
    foreach ($k in $Issues.Keys) {
        $lv = if ($k -eq "포스터 없음(null)") { "WARN" } else { "FAIL" }
        Add-Result "games.json" $k $lv ("{0}개 게임 (예: {1})" -f $Issues[$k].Count, ($Issues[$k].Examples -join ", "))
    }
    if (-not $Issues.Count) { Add-Result "games.json" "게임별 필드·형식" "PASS" "$($list.Count)개 게임 모두 통과" }

    # 같은 상품 id가 두 게임에 들어가면 웹앱의 id 조회가 엉뚱한 게임을 가리킨다
    $owner = @{}; $dupIds = New-Object System.Collections.ArrayList
    foreach ($g in $list) {
        foreach ($x in @($g.ids)) {
            if (-not $x) { continue }
            if ($owner.ContainsKey($x)) { [void]$dupIds.Add("$x ($($owner[$x]) / $($g.title))") } else { $owner[$x] = $g.title }
        }
    }
    if ($dupIds.Count) { Add-Result "games.json" "ids 중복" "FAIL" ("{0}건 (예: {1})" -f $dupIds.Count, (@($dupIds)[0..([Math]::Min(2, $dupIds.Count - 1))] -join ", ")) }
    else { Add-Result "games.json" "ids 중복" "PASS" "게임 사이에 겹치는 상품 id 없음" }

    $seen = @{}; $dupGames = @()
    foreach ($g in $list) {
        $key = "$($g.title)|" + ((@($g.ids) | Sort-Object) -join ",")
        if ($seen.ContainsKey($key)) { $dupGames += "$($g.title)" } else { $seen[$key] = $true }
    }
    if ($dupGames.Count) { Add-Result "games.json" "중복 게임" "FAIL" ("제목·ids가 같은 게임 {0}건 (예: {1})" -f $dupGames.Count, (($dupGames | Select-Object -First 3) -join ", ")) }
    else { Add-Result "games.json" "중복 게임" "PASS" "제목·ids가 같은 게임 없음" }

    $cur = Get-Stats $games
    if ($cur.Count -lt 300) { Add-Result "games.json" "게임 수" "FAIL" "$($cur.Count)개 (최소 300개)" }
    else { Add-Result "games.json" "게임 수" "PASS" "$($cur.Count)개" }
}

# ---------- 2) 직전 커밋 대비 ----------

if ($cur) {
    $prevRes = Get-PreviousGames
    if ($prevRes.Skip) {
        Add-Result "직전 대비" "비교" "SKIP" $prevRes.Skip
    } else {
        $prev = Get-Stats $prevRes.Data
        if ($prev.Count -gt 0) {
            $drop = 100.0 * ($prev.Count - $cur.Count) / $prev.Count
            $lv = if ($drop -gt 15) { "FAIL" } else { "PASS" }
            Add-Result "직전 대비" "게임 수" $lv ("{0} -> {1}개 ({2:+0.0;-0.0;0}%)" -f $prev.Count, $cur.Count, -$drop)

            # 공식 한국어 비율이 크게 흔들리면 스토어 언어 목록을 못 읽은 것 (예: 전부 unknown)
            $diff = $cur.OfficialPct - $prev.OfficialPct
            $lv = if ([Math]::Abs($diff) -gt 20) { "FAIL" } else { "PASS" }
            Add-Result "직전 대비" "공식 한국어 비율" $lv ("{0:0.0}% -> {1:0.0}% ({2:+0.0;-0.0;0}%p)" -f $prev.OfficialPct, $cur.OfficialPct, $diff)

            # Steam·플레이타임·가격은 외부 서비스라 일시 장애가 흔해 경고만 한다
            foreach ($m in @(@{ N = "메타크리틱 보유"; K = "Metacritic" }, @{ N = "Steam 태그 보유"; K = "SteamTags" },
                             @{ N = "플레이타임 보유"; K = "Playtime" }, @{ N = "가격 보유"; K = "Price" },
                             @{ N = "메타크리틱(게임패스 앱)"; K = "GamepassMc" }, @{ N = "휴대기기 가능"; K = "Handheld" })) {
                $p = $prev.($m.K); $c = $cur.($m.K)
                if ($p -eq 0) { Add-Result "직전 대비" $m.N "SKIP" "직전 버전에 값이 없어 비교 안 함 (현재 $($c)개)"; continue }
                $d = 100.0 * ($p - $c) / $p
                $lv = if ($d -gt 30) { "WARN" } else { "PASS" }
                Add-Result "직전 대비" $m.N $lv ("{0} -> {1}개 ({2:+0.0;-0.0;0}%)" -f $p, $c, -$d)
            }
        } else {
            Add-Result "직전 대비" "비교" "SKIP" "직전 버전에 게임이 없음"
        }
    }
}

# ---------- 2-1) 등록 기록 data/history.json ----------
# { "<대표 상품 id>": { firstSeen, lastSeen, title } }. 이번 빌드가 기록을 제대로 남겼다면 지금 게임은 모두 lastSeen이 생성일(한국 날짜)이다

if ($games) {
    $hgames = @($games.games | Where-Object { $null -ne $_ })
    $hasFirstSeen = [bool]@($hgames | Where-Object { Test-Has $_ 'firstSeen' }).Count
    if (-not (Test-Path $HistoryFull)) {
        if ($hasFirstSeen) { Add-Result "history.json" "파일" "FAIL" "$HistoryPath 이 없는데 games.json에는 firstSeen이 있음" }
        else { Add-Result "history.json" "파일" "SKIP" "파일 없음, games.json에도 firstSeen 없음 (등록 기록 이전 빌드)" }
    } else {
        $hist = $null
        try { $hist = Read-JsonText ([IO.File]::ReadAllText($HistoryFull, [Text.Encoding]::UTF8)) }
        catch { Add-Result "history.json" "JSON 읽기" "FAIL" "JSON 파싱 실패: $($_.Exception.Message)" }
        if ($hist -and -not (Test-Obj $hist)) { Add-Result "history.json" "구조" "FAIL" "id를 키로 하는 객체가 아님"; $hist = $null }
        if ($hist -and -not $GenDay) { Add-Result "history.json" "lastSeen" "SKIP" "games.json의 generatedAt을 읽을 수 없어 비교 안 함" }
        elseif ($hist) {
            $want = $GenDay.ToString("yyyy-MM-dd")
            $missing = @(); $stale = @()
            foreach ($g in $hgames) {
                $e = if (Test-Str $g.id) { $hist.PSObject.Properties[$g.id] } else { $null }
                if (-not $e -or -not (Test-Obj $e.Value)) { $missing += "$($g.title)"; continue }
                $ls = $e.Value.lastSeen
                if ($ls -is [datetime]) { $ls = $ls.ToString("yyyy-MM-dd") }
                if ($ls -ne $want) { $stale += "$($g.title) ($ls)" }
            }
            if ($missing.Count) { Add-Result "history.json" "기록 없음" "FAIL" ("{0}개 게임 (예: {1})" -f $missing.Count, (($missing | Select-Object -First 3) -join ", ")) }
            if ($stale.Count) { Add-Result "history.json" "lastSeen 불일치" "FAIL" ("{0}개 게임이 {1}이 아님 (예: {2})" -f $stale.Count, $want, (($stale | Select-Object -First 3) -join ", ")) }
            if (-not $missing.Count -and -not $stale.Count) { Add-Result "history.json" "lastSeen" "PASS" "$($hgames.Count)개 게임 모두 $want ($(@($hist.PSObject.Properties).Count)개 기록)" }
        }
    }
}

# ---------- 3) external.json ----------

if (-not (Test-Path $ExternalFull)) {
    Add-Result "external.json" "파일" "SKIP" "파일 없음 (외부 게임 사전은 선택 사항)"
} else {
    $ext = $null
    try { $ext = Read-JsonText ([IO.File]::ReadAllText($ExternalFull, [Text.Encoding]::UTF8)) }
    catch { Add-Result "external.json" "JSON 읽기" "FAIL" "JSON 파싱 실패: $($_.Exception.Message)" }
    if ($ext) {
        $top = @()
        if (-not ((Test-Has $ext 'generatedAt') -and (Test-Str $ext.generatedAt))) { $top += "generatedAt" }
        if (-not ((Test-Has $ext 'source') -and (Test-Str $ext.source))) { $top += "source" }
        if (-not ((Test-Has $ext 'games') -and (Test-Arr $ext.games))) { $top += "games(배열)" }
        if ($top.Count) { Add-Result "external.json" "최상위 구조" "FAIL" ("없거나 형식이 틀림: " + ($top -join ", ")) }
        else { Add-Result "external.json" "최상위 구조" "PASS" "generatedAt $($ext.generatedAt), source $($ext.source)" }

        $eg = @($ext.games | Where-Object { $null -ne $_ })
        if ($eg.Count -eq 0) { Add-Result "external.json" "게임 수" "FAIL" "0개 (수집이 비어 있음)" }
        else {
            Add-Result "external.json" "게임 수" "PASS" "$($eg.Count)개"
            $bad = @{}; $appids = @{}; $dupApp = 0
            foreach ($e in $eg) {
                $nm = if (Test-Str $e.name) { $e.name } else { "appid $($e.appid)" }
                if (-not ((Test-Int $e.appid) -and $e.appid -gt 0)) { $bad["appid(양의 정수)"] += @($nm) }
                elseif ($appids.ContainsKey([string]$e.appid)) { $dupApp++ } else { $appids[[string]$e.appid] = $true }
                if (-not ((Test-Str $e.name) -and $e.name)) { $bad["name(문자열)"] += @($nm) }
                if (-not (Test-Weights $e.tags)) { $bad["tags(0~1 객체)"] += @($nm) }
                if (-not (Test-StrArr $e.genres)) { $bad["genres(문자열 배열)"] += @($nm) }
                if (-not ($null -eq $e.score -or (Test-Num $e.score))) { $bad["score(숫자)"] += @($nm) }
            }
            foreach ($k in $bad.Keys) { Add-Result "external.json" "형식 오류: $k" "FAIL" ("{0}개 (예: {1})" -f $bad[$k].Count, (($bad[$k] | Select-Object -First 3) -join ", ")) }
            if ($dupApp) { Add-Result "external.json" "appid 중복" "WARN" "$dupApp 건" }
            if (-not $bad.Count) { Add-Result "external.json" "게임별 형식" "PASS" "모두 통과" }
        }
    }
}

# ---------- 요약 ----------

$label = @{ PASS = "통과"; WARN = "경고"; FAIL = "실패"; SKIP = "건너뜀" }
$rows = $Results | ForEach-Object { [pscustomobject]@{ 구분 = $_.구분; 항목 = $_.항목; 결과 = $label[$_.결과]; 내용 = $_.내용 } }
Write-Host "`n[데이터 검증] $GamesPath, $ExternalPath (기준: $PreviousRef)" -ForegroundColor Cyan
Write-Host ($rows | Format-Table -AutoSize -Wrap | Out-String -Width 220)

$nFail = @($Results | Where-Object 결과 -eq 'FAIL').Count
$nWarn = @($Results | Where-Object 결과 -eq 'WARN').Count

# GitHub Actions에서는 실행 요약 화면에도 표를 남긴다
if ($env:GITHUB_STEP_SUMMARY) {
    $md = @("## 데이터 검증", "", "| 구분 | 항목 | 결과 | 내용 |", "|---|---|---|---|")
    $md += $rows | ForEach-Object { "| $($_.구분) | $($_.항목) | $($_.결과) | $(($_.내용 -replace '\|', '/')) |" }
    $md += "", "실패 $nFail, 경고 $nWarn"
    [IO.File]::AppendAllText($env:GITHUB_STEP_SUMMARY, ($md -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
}

if ($nFail) {
    Write-Host "실패 $nFail 건, 경고 $nWarn 건 -> 이 데이터는 커밋하면 안 됩니다." -ForegroundColor Red
    exit 1
}
Write-Host "실패 0건, 경고 $nWarn 건 -> 통과" -ForegroundColor Green
exit 0
