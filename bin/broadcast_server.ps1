$port = 8089
$pidFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "broadcast.pid"
[System.IO.File]::WriteAllText($pidFile, $pid.ToString())

# Message Cache
$cachedMessage = ""
$cachedId = ""
$cachedTime = 0

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
try {
    $listener.Start()
    Write-Host "PowerShell Broadcast Server started on http://127.0.0.1:$port" -ForegroundColor Green
} catch {
    Write-Host "Failed to start Broadcast Server: $_" -ForegroundColor Red
    exit 1
}

# Cleanup helper
function Stop-Server {
    $listener.Stop()
    $listener.Close()
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
    exit 0
}

# Handle exiting
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-Server }

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # CORS Headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-DDO-Token")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $url = $request.Url.LocalPath
        if ($url -eq "/api/poll") {
            if ($request.HttpMethod -eq "GET") {
                $clientLastId = $request.QueryString["lastId"]
                $currentTime = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
                
                # Check expiration (5 seconds)
                if ($cachedId -and $cachedId -ne $clientLastId -and ($currentTime - $cachedTime -le 5)) {
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($cachedMessage)
                    $response.ContentType = "application/json"
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                } else {
                    $response.StatusCode = 204 # No Content
                }
            } else {
                $response.StatusCode = 405
            }
        }
        elseif ($url -eq "/api/broadcast") {
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                
                # Update cache
                try {
                    $data = ConvertFrom-Json $body
                    if ($data.id) {
                        $cachedMessage = $body
                        $cachedId = $data.id
                        $cachedTime = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
                        $response.StatusCode = 200
                    } else {
                        $response.StatusCode = 400
                    }
                } catch {
                    $response.StatusCode = 400
                }
            } else {
                $response.StatusCode = 405
            }
        }
        else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        # Catch connection resets and other non-fatal request errors
        Write-Host "Request error: $_" -ForegroundColor Yellow
    }
}
