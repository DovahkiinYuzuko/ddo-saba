$localPort = 8088
$logFile = "tunnel_output.log"
$regex = "https://[a-zA-Z0-9-]+\.trycloudflare\.com"
$tunnelUrl = $null
$cfVersion = "2026.2.0"

# Ensure bin directory exists
$binDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force
}

# Download cloudflared.exe if it doesn't exist
$cloudflaredPath = Join-Path $binDir "cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "cloudflared.exe not found. Downloading version $cfVersion..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/download/$cfVersion/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath
    Write-Host "Download complete." -ForegroundColor Green
}

# Auto-updates disabled to ensure environment predictability
Write-Host "Checking for cloudflared updates... (Bypassed by policy)" -ForegroundColor Gray

if (Test-Path $logFile) {
    Remove-Item $logFile -Force
}

# Start cloudflared
$process = Start-Process -FilePath $cloudflaredPath -ArgumentList "tunnel", "--url", "http://localhost:$localPort" -NoNewWindow -RedirectStandardError $logFile -PassThru

# Save PID for targeted shutdown
$pidFile = Join-Path $binDir "cloudflared.pid"
[System.IO.File]::WriteAllText($pidFile, $process.Id.ToString())

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
            if ($env:DDO_SABA_TOKEN) {
                Write-Host "Auto-Auth client URL: $tunnelUrl?token=$env:DDO_SABA_TOKEN" -ForegroundColor Cyan
            }
            # Start-Process $tunnelUrl
            break
        }
    }
    Start-Sleep -Seconds 2
}

if (-not $tunnelUrl) {
    Write-Host "Failed to retrieve Tunnel URL. Please check $logFile" -ForegroundColor Red
}
