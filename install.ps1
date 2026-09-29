$ErrorActionPreference = 'Stop'

if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'ARM64')) {
  throw "Alibi's Windows installer currently supports 64-bit Windows. See https://github.com/lohit-dev/alibi/releases for details."
}

$repo = 'lohit-dev/alibi'
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=10"
$asset = $null
foreach ($release in $releases) {
  $asset = $release.assets | Where-Object { $_.name -match '_x64-setup\.exe$' } | Select-Object -First 1
  if ($asset) { break }
}

if (-not $asset) {
  throw "No Windows installer is available yet. Check https://github.com/$repo/releases and try again when the preview finishes."
}

$installer = Join-Path $env:TEMP 'Alibi-Setup.exe'
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer
$process = Start-Process -FilePath $installer -Wait -PassThru
Remove-Item $installer -Force
if ($process.ExitCode -ne 0) {
  throw "The Alibi installer exited with code $($process.ExitCode)."
}
