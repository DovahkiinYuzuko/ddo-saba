$localPort = 8088
$logFile = "tunnel_output.log"
$regex = "https://[a-zA-Z0-9-]+\.trycloudflare\.com"
$tunnelUrl = $null

# Ensure bin directory exists
$binDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force
}

# Download cloudflared.exe if it doesn't exist
$cloudflaredPath = Join-Path $binDir "cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "cloudflared.exe not found. Downloading..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath
    Write-Host "Download complete." -ForegroundColor Green
}

# Check for cloudflared update
Write-Host "Checking for cloudflared updates..." -ForegroundColor Gray
try {
    Start-Process -FilePath $cloudflaredPath -ArgumentList "update" -NoNewWindow -Wait -ErrorAction SilentlyContinue
} catch {
    Write-Host "Skipping cloudflared auto-update (could not connect or execute)." -ForegroundColor Yellow
}

if (Test-Path $logFile) {
    Remove-Item $logFile -Force
}

# Start cloudflared
$process = Start-Process -FilePath $cloudflaredPath -ArgumentList "tunnel", "--url", "http://localhost:$localPort" -NoNewWindow -RedirectStandardError $logFile -PassThru

Write-Host "Launched cloudflared process (PID: $($process.Id))." -ForegroundColor Gray
if ($process.HasExited) {
    Write-Host "cloudflared process exited immediately with code: $($process.ExitCode)" -ForegroundColor Red
}

Write-Host "Waiting for Cloudflare Tunnel to initialize..."
Start-Sleep -Seconds 5

# Retry loop to find TryCloudflare URL
for ($i = 0; $i -lt 5; $i++) {
    if (Test-Path $logFile) {
        $output = Get-Content $logFile -Raw
        if ($output -match $regex) {
            $tunnelUrl = $Matches[0]
            Write-Host "Tunnel established! URL: $tunnelUrl" -ForegroundColor Green
            Start-Process $tunnelUrl
            break
        }
    }
    Start-Sleep -Seconds 2
}

if (-not $tunnelUrl) {
    Write-Host "Failed to retrieve Tunnel URL. Please check $logFile" -ForegroundColor Red
}
