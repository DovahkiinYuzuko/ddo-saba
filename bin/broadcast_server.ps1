$port = 8089
$pidFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "broadcast.pid"
[System.IO.File]::WriteAllText($pidFile, $pid.ToString())

# Message Cache
$cachedMessage = ""
$cachedId = ""
$cachedTime = 0
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

        # Get client username from header and update active users
        $clientUsername = $request.Headers["X-DDO-Username"]
        if ($clientUsername) {
            $currentTime = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
            $activeUsers[$clientUsername] = $currentTime
        }

        # Clean up users inactive for more than 10 seconds
        $now = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
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
        if ($activeCount -lt 1) { $activeCount = 1 }

        # CORS Headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-DDO-Token, X-DDO-Username")
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
                if ($clientLastId) {
                    $found = $false
                    foreach ($msg in $messageHistory) {
                        if ($found) {
                            $diffMessages += $msg
                        }
                        elseif ($msg.id -eq $clientLastId) {
                            $found = $true
                        }
                    }
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
                
                # Update cache
                try {
                    $data = ConvertFrom-Json $body
                    
                    # Ensure the message has an ID and timestamp (auto-generate if missing)
                    if (-not $data.id) {
                        $autoId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + "_" + [Guid]::NewGuid().ToString().Substring(0,8)
                        $data = $data | Add-Member -NotePropertyName "id" -NotePropertyValue $autoId -PassThru
                        $autoTime = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        $data = $data | Add-Member -NotePropertyName "timestamp" -NotePropertyValue $autoTime -PassThru
                        $body = ConvertTo-Json $data -Compress
                    }
                    
                    $cachedMessage = $body
                    $cachedId = $data.id
                    $cachedTime = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
                    
                    # Append message to session history (limit to last 100 to save memory)
                    $messageHistory += $data
                    if ($messageHistory.Count -gt 100) {
                        $messageHistory = @($messageHistory | Select-Object -Last 100)
                    }
                    
                    Write-Host "[BROADCAST] Received msg from '$($data.sender)' (broadcaster: '$($data.broadcaster)', role: '$($data.role)', id: '$($data.id)')" -ForegroundColor Yellow
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
            $nowEpoch = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
            $newQueue = @()
            $hasChanges = $false
            
            # Find the running job and see if it timed out (120 seconds limit)
            foreach ($job in $jobQueue) {
                if ($job.status -eq "running") {
                    $jobStart = $job.timestamp
                    if ($nowEpoch - $jobStart -gt 120) {
                        # Eject due to timeout
                        $hasChanges = $true
                        Write-Host "Job $($job.id) of $($job.username) timed out (120s) and was ejected." -ForegroundColor Yellow
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
                    $nowEpoch = [double]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())

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
        else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        # Catch connection resets and other non-fatal request errors
        Write-Host "Request error: $_" -ForegroundColor Yellow
    }
}
