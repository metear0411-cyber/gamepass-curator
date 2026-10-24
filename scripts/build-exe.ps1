<#
  게임패스 큐레이터 Windows 앱(.exe) 빌드
  - .NET SDK 없이 Windows에 기본으로 있는 .NET Framework 4.x 컴파일러(csc.exe)를 쓴다
  - WebView2 NuGet 패키지는 app\.build 에 한 번만 받아 두고 재사용한다
  결과: dist\GamepassCurator\GamepassCurator.exe, dist\GamepassCurator-win-x64.zip

  사용법: .\scripts\build-exe.ps1 [-Version 1.2.3]
#>
param(
  [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WebView2Version = '1.0.4314.35'

$root   = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root 'app'
$build  = Join-Path $appDir '.build'
$dist   = Join-Path $root 'dist'
$out    = Join-Path $dist 'GamepassCurator'
$zip    = Join-Path $dist 'GamepassCurator-win-x64.zip'

# 버전은 숫자 a.b.c(.d) 만 받는다 (태그 v1.2.3 → 1.2.3)
$Version = $Version.Trim().TrimStart('v', 'V')
if ($Version -notmatch '^\d+(\.\d+){0,3}$') {
  Write-Host "버전 형식이 이상해서 1.0.0으로 빌드합니다: $Version"
  $Version = '1.0.0'
}
$parts = @($Version.Split('.')); while ($parts.Count -lt 4) { $parts += '0' }
$fileVersion = ($parts[0..3] -join '.')

New-Item -ItemType Directory -Force $build | Out-Null

# 1) WebView2 SDK 패키지 (캐시)
$pkgDir = Join-Path $build "Microsoft.Web.WebView2.$WebView2Version"
$libDir = Join-Path $pkgDir 'lib\net462'
$coreDll = Join-Path $libDir 'Microsoft.Web.WebView2.Core.dll'
$formsDll = Join-Path $libDir 'Microsoft.Web.WebView2.WinForms.dll'
$loaderDll = Join-Path $pkgDir 'runtimes\win-x64\native\WebView2Loader.dll'
if (-not ((Test-Path $coreDll) -and (Test-Path $formsDll) -and (Test-Path $loaderDll))) {
  Write-Host "WebView2 SDK $WebView2Version 받는 중..."
  $nupkg = Join-Path $build "Microsoft.Web.WebView2.$WebView2Version.zip"
  Invoke-WebRequest "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WebView2Version" -OutFile $nupkg -UseBasicParsing
  if (Test-Path $pkgDir) { Remove-Item -Recurse -Force $pkgDir }
  Expand-Archive $nupkg $pkgDir -Force
  Remove-Item $nupkg -Force
} else {
  Write-Host "WebView2 SDK $WebView2Version (캐시 사용)"
}

# 2) 아이콘: docs\icons\icon-512.png → app\.build\app.ico (16~256px, 256은 PNG 압축)
Add-Type -AssemblyName System.Drawing
$ico = Join-Path $build 'app.ico'
$srcPng = Join-Path $root 'docs\icons\icon-512.png'
if (-not (Test-Path $ico) -or (Get-Item $srcPng).LastWriteTimeUtc -gt (Get-Item $ico).LastWriteTimeUtc) {
  Write-Host '아이콘 만드는 중...'
  $src = [System.Drawing.Image]::FromFile($srcPng)
  try {
    $sizes = 16, 24, 32, 48, 64, 128, 256
    $images = @()
    foreach ($s in $sizes) {
      $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($src, 0, 0, $s, $s)
      $g.Dispose()

      $ms = New-Object System.IO.MemoryStream
      if ($s -ge 256) {
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      } else {
        # 32비트 DIB: BITMAPINFOHEADER + 아래에서 위로 BGRA + AND 마스크(전부 0)
        $bw = New-Object System.IO.BinaryWriter($ms)
        $maskRow = [int]([Math]::Ceiling($s / 32.0) * 4)
        $bw.Write([int]40); $bw.Write([int]$s); $bw.Write([int]($s * 2))
        $bw.Write([int16]1); $bw.Write([int16]32); $bw.Write([int]0)
        $bw.Write([int]($s * $s * 4 + $maskRow * $s))
        $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0)
        $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
        $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $pix = New-Object byte[] ($data.Stride * $s)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pix, 0, $pix.Length)
        $bmp.UnlockBits($data)
        for ($y = $s - 1; $y -ge 0; $y--) { $bw.Write($pix, $y * $data.Stride, $s * 4) }
        $bw.Write((New-Object byte[] ($maskRow * $s)))
        $bw.Flush()
      }
      $bmp.Dispose()
      $images += , @($s, $ms.ToArray())
    }

    $fs = [System.IO.File]::Create($ico)
    $w = New-Object System.IO.BinaryWriter($fs)
    $w.Write([int16]0); $w.Write([int16]1); $w.Write([int16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($img in $images) {
      $s = $img[0]; $bytes = $img[1]
      $dim = if ($s -ge 256) { 0 } else { $s }
      $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
      $w.Write([int16]1); $w.Write([int16]32)
      $w.Write([int]$bytes.Length); $w.Write([int]$offset)
      $offset += $bytes.Length
    }
    foreach ($img in $images) { $w.Write([byte[]]$img[1]) }
    $w.Close()
  } finally {
    $src.Dispose()
  }
}

# 3) 컴파일
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw "csc.exe를 찾을 수 없습니다 (.NET Framework 4.x 필요)" }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$asmInfo = Join-Path $build 'AssemblyInfo.cs'
$asmText = @"
using System.Reflection;
[assembly: AssemblyTitle("게임패스 큐레이터")]
[assembly: AssemblyProduct("게임패스 큐레이터")]
[assembly: AssemblyDescription("Xbox 게임패스 게임 추천")]
[assembly: AssemblyVersion("$fileVersion")]
[assembly: AssemblyFileVersion("$fileVersion")]
[assembly: AssemblyInformationalVersion("$Version")]
"@
[System.IO.File]::WriteAllText($asmInfo, $asmText, (New-Object System.Text.UTF8Encoding($true)))

$exe = Join-Path $out 'GamepassCurator.exe'
Write-Host "컴파일 중 (v$Version)..."
$cscArgs = @(
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
  "/out:$exe",
  "/win32icon:$ico",
  "/resource:$ico,GamepassCurator.app.ico",
  '/reference:System.dll', '/reference:System.Core.dll',
  '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  "/reference:$coreDll", "/reference:$formsDll",
  (Join-Path $appDir 'GamepassCurator.cs'), $asmInfo
)
& $csc $cscArgs
if ($LASTEXITCODE -ne 0) { throw "컴파일 실패 (exit $LASTEXITCODE)" }

# 4) 실행에 필요한 DLL과 웹 파일 복사
Copy-Item $coreDll, $formsDll, $loaderDll $out
Copy-Item -Recurse (Join-Path $root 'docs') (Join-Path $out 'web')
$license = Join-Path $root 'LICENSE'
if (Test-Path $license) { Copy-Item $license $out }

# 5) 압축 (폴더째로)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zip) { Remove-Item -Force $zip }
# CreateFromDirectory는 .NET Framework에서 경로 구분자를 \로 넣으므로 직접 / 로 만든다
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $base = (Get-Item $out).FullName.TrimEnd('\')
  $prefix = Split-Path -Leaf $base
  foreach ($f in Get-ChildItem $out -Recurse -File) {
    $name = $prefix + '/' + $f.FullName.Substring($base.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}

$exeKb = [Math]::Round((Get-Item $exe).Length / 1KB, 1)
$zipMb = [Math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host ""
Write-Host "완료"
Write-Host "  실행 파일: $exe ($exeKb KB)"
Write-Host "  배포 압축: $zip ($zipMb MB)"
