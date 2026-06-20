@echo off
setlocal enabledelayedexpansion

:: Check if DDO_SABA_TOKEN is already set. If not, generate.
if "%DDO_SABA_TOKEN%"=="" (
    set /p DDO_SABA_TOKEN="Enter access token (Press Enter to auto-generate a secure random 32-character token): "
    if "!DDO_SABA_TOKEN!"=="" (
        :: Generate secure 32-character hex token via PowerShell RNG
        for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[Convert]::ToHexString((System.Security.Cryptography.RandomNumberGenerator::GetBytes(16))).ToLower()"` ) do (
            set DDO_SABA_TOKEN=%%i
        )
    )
)

echo ==============================================
echo  DDO Saba Access Token: !DDO_SABA_TOKEN!
echo  Share this token with your clients!
echo ==============================================
echo.

:: Check and start Ollama if not running
netstat -ano | findstr 11434 >nul
if !ERRORLEVEL! neq 0 (
    echo Ollama is not running. Attempting to start Ollama...
    where ollama >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        start /B ollama serve
        echo Waiting for Ollama to initialize...
        timeout /t 5 >nul
    ) else (
        echo [WARNING] Ollama is not installed or not in PATH.
        echo Please download and install Ollama from https://ollama.com
        echo.
    )
) else (
    echo Ollama is already running.
)

:: Generate Active Nginx Configuration by replacing placeholder with token
echo Generating active Nginx configuration...
powershell -NoProfile -Command "$c = Get-Content 'nginx/conf/nginx_win.conf.template' -Raw; $c = $c -replace '__DDO_SABA_TOKEN__', '!DDO_SABA_TOKEN!'; [System.IO.File]::WriteAllText('nginx/conf/nginx_active.conf', $c)"

:: Start PowerShell Broadcast Server in background
echo Starting PowerShell Broadcast Server...
start /B powershell -NoProfile -ExecutionPolicy Bypass -File bin\broadcast_server.ps1

:: Start Nginx Server using the active config
echo Starting Nginx server...
start /B nginx\nginx.exe -p nginx -c conf\nginx_active.conf

if !ERRORLEVEL! neq 0 (
    echo.
    echo [ERROR] Failed to start Nginx. 
    echo Please make sure 'nginx/nginx.exe' exists in the workspace.
    pause
    exit /b %ERRORLEVEL%
)

:: Start Cloudflare Tunnel
echo Starting Cloudflare Tunnel...
powershell -ExecutionPolicy Bypass -File bin\start_tunnel.ps1

:: Keep batch open so users can read output
pause
