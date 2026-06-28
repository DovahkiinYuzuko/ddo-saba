param(
    [int]$port = 8089
)
$pidFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "broadcast.pid"
[System.IO.File]::WriteAllText($pidFile, $pid.ToString())

# Message Cache
$messageHistory = @()
$cachedModelData = $null
$jobQueue = @()
$activeUsers = @{}


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

        # Get client unique ID from header and update active users
        $clientId = $request.Headers["X-DDO-Client-Id"]
        if (-not $clientId) {
            $token = $request.Headers["X-DDO-Token"]
            $username = $request.Headers["X-DDO-Username"]
            if (-not $token) { $token = "anonymous" }
            if (-not $username) { $username = "guest" }
            $clientId = $token + "_" + $username
        }
        $currentTime = [double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000.0
        $activeUsers[$clientId] = $currentTime

        # Clean up users inactive for more than 10 seconds
        $now = [double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000.0
        $keysToRemove = @()
        foreach ($key in $activeUsers.Keys) {
            if ($now - $activeUsers[$key] -gt 10) {
                $keysToRemove += $key
            }
        }
        foreach ($key in $keysToRemove) {
            $activeUsers.Remove($key)
        }
        $activeCount = $activeUsers.Count

        # CORS Headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-DDO-Token, X-DDO-Username, X-DDO-Client-Id, X-DDO-Since-Id, x-ddo-client-id, x-ddo-since-id")
        $response.Headers.Add("X-DDO-Active-Count", $activeCount.ToString())

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $url = $request.Url.LocalPath
        if ($url -eq "/api/poll") {
            if ($request.HttpMethod -eq "GET") {
                $clientLastId = $request.Headers["X-DDO-Since-Id"]
                if (-not $clientLastId) {
                    $clientLastId = $request.QueryString["lastId"]
                }
                
                $diffMessages = @()
                if ($clientLastId -and $clientLastId -ne "") {
                    $found = $false
                    foreach ($msg in $messageHistory) {
                        if ($found) {
                            $diffMessages += $msg
                        }
                        elseif ($msg.id -eq $clientLastId) {
                            $found = $true
                        }
                    }
                } else {
                    $diffMessages = $messageHistory
                }
                
                if ($diffMessages.Count -gt 0) {
                    Write-Host "[POLL] User '$clientUsername' polled. Returned $($diffMessages.Count) messages (LastId: $clientLastId)" -ForegroundColor Cyan
                    $pollJson = ConvertTo-Json $diffMessages -Compress
                    if (-not $pollJson.StartsWith("[")) {
                        $pollJson = "[" + $pollJson + "]"
                    }
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($pollJson)
                    $response.ContentType = "application/json"
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.StatusCode = 200
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
                
                try {
                    $data = ConvertFrom-Json $body
                    
                    if (-not $data.id -or $data.id -eq "") {
                        $autoId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + "_" + [Guid]::NewGuid().ToString().Substring(0,8)
                        $data = $data | Add-Member -NotePropertyName "id" -NotePropertyValue $autoId -Force -PassThru
                    }
                    if (-not $data.timestamp -or $data.timestamp -eq "") {
                        $autoTime = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        $data = $data | Add-Member -NotePropertyName "timestamp" -NotePropertyValue $autoTime -Force -PassThru
                    }
                    
                    $messageHistory += $data
                    if ($messageHistory.Count -gt 100) {
                        $messageHistory = @($messageHistory | Select-Object -Last 100)
                    }
                    
                    Write-Host "[BROADCAST] Received msg from '$($data.sender)' (broadcaster: '$($data.broadcaster)', role: '$($data.role)', id: '$($data.id)')" -ForegroundColor Yellow
                    
                    $responseJson = ConvertTo-Json @{ status = "success"; id = $data.id } -Compress
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseJson)
                    $response.ContentType = "application/json"
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.StatusCode = 200
                } catch {
                    $response.StatusCode = 400
                }
            } else {
                $response.StatusCode = 405
            }
        }
        elseif ($url -eq "/api/history") {
            if ($request.HttpMethod -eq "GET") {
                $historyJson = ConvertTo-Json $messageHistory -Compress
                if (-not $historyJson) {
                    $historyJson = "[]"
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($historyJson)
                $response.ContentType = "application/json"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.StatusCode = 200
            } else {
                $response.StatusCode = 405
            }
        }
        elseif ($url -eq "/api/model") {
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                try {
                    $data = ConvertFrom-Json $body
                    if (-not $data.timestamp) {
                        # Add member dynamically (PowerShell 5.1/7.x safe approach)
                        $data = $data | Add-Member -NotePropertyName "timestamp" -NotePropertyValue [double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -PassThru
                    }
                    $cachedModelData = $data
                    Write-Host "[MODEL] Sync selected model: '$($data.model)' (sender: '$($data.sender)', isGenerating: $($data.isGenerating))" -ForegroundColor Green
                    $response.StatusCode = 200
                } catch {
                    $response.StatusCode = 400
                }
            } elseif ($request.HttpMethod -eq "GET") {
                $modelJson = "{}"
                if ($cachedModelData) {
                    $modelJson = ConvertTo-Json $cachedModelData -Compress
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($modelJson)
                $response.ContentType = "application/json"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.StatusCode = 200
            } else {
                $response.StatusCode = 405
            }
        }
        elseif ($url -eq "/api/queue") {
            # Check for expired running jobs
            $nowEpoch = [double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000.0
            $newQueue = @()
            $hasChanges = $false
            
            # Find the running job and see if it timed out (120 seconds limit by default, dynamic via header)
            $timeoutLimit = 300
            $clientTimeoutHeader = $request.Headers["X-DDO-Queue-Timeout"]
            if ($clientTimeoutHeader) {
                try {
                    $timeoutLimit = [int]$clientTimeoutHeader
                } catch {}
            }
            
            # Find the running job and see if it timed out
            foreach ($job in $jobQueue) {
                if ($job.status -eq "running") {
                    $jobStart = $job.timestamp
                    if ($nowEpoch - $jobStart -gt $timeoutLimit) {
                        # Eject due to timeout
                        $hasChanges = $true
                        Write-Host "Job $($job.id) of $($job.username) timed out ($($timeoutLimit)s) and was ejected." -ForegroundColor Yellow
                        continue
                    }
                }
                $newQueue += $job
            }
            
            if ($hasChanges) {
                $jobQueue = $newQueue
                # If the first job is now waiting, promote it to running and update its timestamp
                if ($jobQueue.Count -gt 0 -and $jobQueue[0].status -eq "waiting") {
                    $jobQueue[0].status = "running"
                    $jobQueue[0].timestamp = $nowEpoch
                }
            }

            if ($request.HttpMethod -eq "GET") {
                $queueJson = "[]"
                if ($jobQueue.Count -gt 0) {
                    $queueJson = ConvertTo-Json $jobQueue -Compress
                    if (-not $queueJson.StartsWith("[")) {
                        $queueJson = "[" + $queueJson + "]"
                    }
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($queueJson)
                $response.ContentType = "application/json"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.StatusCode = 200
            }
            elseif ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                try {
                    $data = ConvertFrom-Json $body
                    $action = $data.action
                    $id = $data.id
                    $username = $data.username
                    $nowEpoch = [double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000.0

                    if ($action -eq "join") {
                        # Avoid duplicates
                        $exists = $false
                        foreach ($job in $jobQueue) {
                            if ($job.id -eq $id) { $exists = $true }
                        }
                        if (-not $exists) {
                            $newJob = [PSCustomObject]@{
                                id = $id
                                username = $username
                                timestamp = $nowEpoch
                                status = "waiting"
                            }
                            if ($jobQueue.Count -eq 0) {
                                $newJob.status = "running"
                            }
                            $jobQueue += $newJob
                            Write-Host "[QUEUE] User '$username' joined queue (id: $id, status: $($newJob.status))" -ForegroundColor Magenta
                        }
                        $response.StatusCode = 200
                    }
                    elseif ($action -eq "cancel") {
                        $newQueue = @()
                        $wasRunning = $false
                        foreach ($job in $jobQueue) {
                            if ($job.id -eq $id) {
                                if ($job.status -eq "running") { $wasRunning = $true }
                                continue
                            }
                            $newQueue += $job
                        }
                        $jobQueue = $newQueue
                        if ($wasRunning -and $jobQueue.Count -gt 0) {
                            $jobQueue[0].status = "running"
                            $jobQueue[0].timestamp = $nowEpoch
                        }
                        Write-Host "[QUEUE] User '$username' cancelled job (id: $id)" -ForegroundColor Magenta
                        $response.StatusCode = 200
                    }
                    elseif ($action -eq "complete") {
                        $newQueue = @()
                        foreach ($job in $jobQueue) {
                            if ($job.id -eq $id) { continue }
                            $newQueue += $job
                        }
                        $jobQueue = $newQueue
                        if ($jobQueue.Count -gt 0) {
                            $jobQueue[0].status = "running"
                            $jobQueue[0].timestamp = $nowEpoch
                        }
                        Write-Host "[QUEUE] Job completed (id: $id)" -ForegroundColor Magenta
                        $response.StatusCode = 200
                    }
                    else {
                        $response.StatusCode = 400
                    }
                } catch {
                    $response.StatusCode = 400
                }
            }
            else {
                $response.StatusCode = 405
            }
        }
        elseif ($url -eq "/api/usage") {
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                try {
                    $data = ConvertFrom-Json $body
                    $csvPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "../data/token_usage.csv"
                    $csvDir = Split-Path $csvPath
                    if (-not (Test-Path $csvDir)) {
                        $null = New-Item -ItemType Directory -Path $csvDir -Force
                    }

                    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                    $token = $request.Headers["X-DDO-Token"]
                    $username = $request.Headers["X-DDO-Username"]
                    if (-not $username) { $username = "anonymous" }

                    $model = $data.model
                    $promptTokens = $data.promptTokens
                    $completionTokens = $data.completionTokens
                    $totalDurationSec = $data.totalDurationSec
                    $loadDurationSec = $data.loadDurationSec
                    $evalDurationSec = $data.evalDurationSec
                    $status = $data.status

                    # Escape CSV values
                    $escapedToken = $token -replace '"', '""'
                    $escapedUsername = $username -replace '"', '""'
                    $escapedModel = $model -replace '"', '""'
                    $escapedStatus = $status -replace '"', '""'

                    $line = """$timestamp"",""$escapedToken"",""$escapedUsername"",""$escapedModel"",$promptTokens,$completionTokens,$totalDurationSec,$loadDurationSec,$evalDurationSec,""$escapedStatus"""

                    $headers = "Timestamp,Token,Username,Model,PromptTokens,CompletionTokens,TotalDurationSec,LoadDurationSec,EvalDurationSec,Status"
                    if (-not (Test-Path $csvPath)) {
                        [System.IO.File]::WriteAllText($csvPath, "$headers`r`n")
                    }
                    [System.IO.File]::AppendAllText($csvPath, "$line`r`n")

                    Write-Host "[USAGE] Logged usage for user '$username' (model: $model, tokens: $promptTokens/$completionTokens, status: $status)" -ForegroundColor Cyan
                    $response.StatusCode = 200
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
