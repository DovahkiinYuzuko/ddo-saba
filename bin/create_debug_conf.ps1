$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$inputPath = Join-Path $projectDir "nginx\conf\nginx.conf"
$outputPath = Join-Path $projectDir "nginx\conf\nginx_debug.conf"

$content = Get-Content $inputPath -Raw
# Comment out load_module line
$content = $content -replace '(?m)^(\s*)(load_module\s+modules/ngx_http_js_module\.dll;)', '$1# $2'
# Ensure LF line endings
$content = $content -replace "`r`n", "`n"

# Write with UTF8 (No BOM)
[System.IO.File]::WriteAllText($outputPath, $content)
Write-Host "Created nginx_debug.conf at $outputPath" -ForegroundColor Green
