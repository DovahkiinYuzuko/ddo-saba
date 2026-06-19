@echo off
setlocal enabledelayedexpansion

:: Check if DDO_SABA_TOKEN is already set. If not, generate or prompt.
if "%DDO_SABA_TOKEN%"=="" (
    set /p DDO_SABA_TOKEN="Enter access token (Press Enter to auto-generate a random 6-digit token): "
    if "!DDO_SABA_TOKEN!"=="" (
        :: Generate random 6-character numeric token
        set /a rand1=%RANDOM% * 9 / 32768 + 1
        set /a rand2=%RANDOM% * 10 / 32768
        set /a rand3=%RANDOM% * 10 / 32768
        set /a rand4=%RANDOM% * 10 / 32768
        set /a rand5=%RANDOM% * 10 / 32768
        set /a rand6=%RANDOM% * 10 / 32768
        set DDO_SABA_TOKEN=!rand1!!rand2!!rand3!!rand4!!rand5!!rand6!
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

:: Start Nginx Server
echo Starting Nginx server...
if not exist "nginx\modules\ngx_http_js_module.dll" goto FALLBACK_NGINX

:FULL_NGINX
echo [INFO] Found njs module. Starting Nginx with full features...
start /B nginx\nginx.exe -p nginx
goto NGINX_STARTED

:FALLBACK_NGINX
echo [WARNING] njs module (ngx_http_js_module.dll) not found.
echo Starting Nginx in fallback mode (No Shared Room / Access Token)...

:: Generate no-njs fallback configuration
powershell -Command "$c = Get-Content 'nginx/conf/nginx.conf' -Raw; $c = $c -replace '(?m)^(\s*load_module\s+)', '# `$1' -replace '(?m)^(\s*js_shared_dict_zone\s+)', '# `$1' -replace '(?m)^(\s*js_import\s+)', '# `$1' -replace '(?m)^(\s*js_content\s+)', '# `$1' -replace '(?m)^(\s*auth_request\s+)', '# `$1'; [System.IO.File]::WriteAllText('nginx/conf/nginx_no_njs.conf', $c)"

start /B nginx\nginx.exe -p nginx -c conf/nginx_no_njs.conf

:NGINX_STARTED

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
