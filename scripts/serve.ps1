# docs 폴더를 로컬 웹서버로 띄운다 (Node·Python 없이 Windows 기본 기능만 사용)
# 브라우저는 file:// 로 연 페이지에서 data/games.json을 읽지 못하므로 서버가 필요하다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 [-Port 8080]   -> http://localhost:8080

param([int]$Port = 8080)

$Root = Join-Path (Split-Path $PSScriptRoot -Parent) "docs"
$Types = @{
    ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "http://localhost:$Port 에서 열었어요. 끝내려면 Ctrl+C"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        # 요청 하나가 실패해도 서버는 계속 돈다
        try {
            $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
            if (-not $path) { $path = "index.html" }
            $file = [IO.Path]::GetFullPath((Join-Path $Root $path))
            # docs 폴더 밖 파일은 내주지 않는다
            if ($file.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $file -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($file)
                $ext = [IO.Path]::GetExtension($file).ToLower()
                $ctx.Response.ContentType = if ($Types[$ext]) { $Types[$ext] } else { "application/octet-stream" }
                $ctx.Response.ContentLength64 = $bytes.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
            } else {
                $ctx.Response.StatusCode = 404
            }
        } catch {
            Write-Host "요청 처리 실패: $($ctx.Request.Url) - $($_.Exception.Message)"
        } finally {
            $ctx.Response.Close()
        }
    }
} finally {
    $listener.Stop()
}
