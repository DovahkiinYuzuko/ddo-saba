$tempZip = Join-Path $env:TEMP "nginx.zip"
$tempDir = Join-Path $env:TEMP "nginx_extracted"

Write-Host "Downloading Nginx 1.26.1..."
Invoke-WebRequest -Uri "https://nginx.org/download/nginx-1.26.1.zip" -OutFile $tempZip

Write-Host "Extracting Nginx..."
Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force

$nginxFolder = Get-ChildItem -Path $tempDir -Filter "nginx-*" | Select-Object -First 1
if ($nginxFolder) {
    Copy-Item -Path (Join-Path $nginxFolder.FullName "nginx.exe") -Destination "nginx/nginx.exe" -Force
    # Copy mime.types if not exist
    if (-not (Test-Path "nginx/conf/mime.types")) {
        Copy-Item -Path (Join-Path $nginxFolder.FullName "conf/mime.types") -Destination "nginx/conf/mime.types" -Force
    }
    Write-Host "Nginx executable successfully copied to nginx/nginx.exe" -ForegroundColor Green
} else {
    Write-Host "Failed to find extracted Nginx folder" -ForegroundColor Red
}

# Clean up
if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
