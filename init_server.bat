@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion

:: Check arguments
if /i "%1"=="start" goto start
if /i "%1"=="stop" goto stop
if /i "%1"=="restart" goto restart
if /i "%1"=="status" goto status
if /i "%1"=="--help" goto help
if /i "%1"=="-h" goto help
if /i "%1"=="/?" goto help
if not "%1"=="" (
    echo [ERROR] Unknown option: %1
    echo Use "init_server.bat --help" for usage.
    exit /b 1
)

:menu
cls
echo ==============================================
echo  DDO Saba Server Control Panel
echo ==============================================
echo  [1] Start Server
echo  [2] Stop Server
echo  [3] Restart Server
echo  [4] Server Status
echo  [5] Exit
echo ==============================================
set /p opt="Choose an option (1-5): "
if "%opt%"=="1" goto start
if "%opt%"=="2" goto stop
if "%opt%"=="3" goto restart
if "%opt%"=="4" goto status
if "%opt%"=="5" goto :eof
goto menu

:start
echo Starting DDO Saba servers...

:: Check if DDO_SABA_TOKEN is already set. If not, generate.
if "%DDO_SABA_TOKEN%"=="" (
    set /p DDO_SABA_TOKEN="Enter access token (Press Enter to auto-generate a secure random 32-character token): "
    if "!DDO_SABA_TOKEN!"=="" (
        for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$b=New-Object byte[] 16; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [BitConverter]::ToString($b).Replace('-','').ToLower()"` ) do (
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

:: Generate Active Nginx Configuration
echo Generating active Nginx configuration...
powershell -NoProfile -Command "$c = Get-Content 'nginx/conf/nginx_win.conf.template' -Raw; $c = $c -replace '__DDO_SABA_TOKEN__', '!DDO_SABA_TOKEN!'; [System.IO.File]::WriteAllText('nginx/conf/nginx_active.conf', $c)"

:: Start PowerShell Broadcast Server in background
echo Starting PowerShell Broadcast Server...
start /B powershell -NoProfile -ExecutionPolicy Bypass -File bin\broadcast_server.ps1

:: Start Nginx Server using the active config
echo Starting Nginx server...
start /B nginx\nginx.exe -p nginx -c conf\nginx_active.conf

if !ERRORLEVEL! neq 0 (
    echo [ERROR] Failed to start Nginx. 
    echo Please make sure 'nginx/nginx.exe' exists in the workspace.
    if "%1"=="" pause
    exit /b 1
)

:: Start Cloudflare Tunnel
echo Starting Cloudflare Tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File bin\start_tunnel.ps1

echo DDO Saba servers started successfully.
if "%1"=="" pause
goto :eof

:stop
echo Stopping DDO Saba servers...
set "any_stopped=0"

:: Stop Nginx gracefully
if exist "nginx\nginx.exe" (
    if exist "nginx\conf\nginx_active.conf" (
        nginx\nginx.exe -p nginx -c conf\nginx_active.conf -s stop >nul 2>&1
        set "any_stopped=1"
    ) else (
        nginx\nginx.exe -p nginx -s stop >nul 2>&1
        set "any_stopped=1"
    )
)

:: Read Nginx PID and kill it
if exist "nginx\logs\nginx.pid" (
    set /p NGINX_PID=<nginx\logs\nginx.pid
    if not "!NGINX_PID!"=="" (
        taskkill /f /pid !NGINX_PID! >nul 2>&1
        set "any_stopped=1"
    )
)

:: Kill Cloudflare Tunnel by PID
if exist "bin\cloudflared.pid" (
    set /p CF_PID=<bin\cloudflared.pid
    if not "!CF_PID!"=="" (
        taskkill /f /pid !CF_PID! >nul 2>&1
        set "any_stopped=1"
    )
)

:: Kill PowerShell Broadcast Server by PID
if exist "bin\broadcast.pid" (
    set /p BC_PID=<bin\broadcast.pid
    if not "!BC_PID!"=="" (
        taskkill /f /pid !BC_PID! >nul 2>&1
        set "any_stopped=1"
    )
)

:: Terminate residual processes
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im nginx.exe >nul 2>&1

:: Force terminate any lingering processes on port 8088 (Nginx)
powershell -NoProfile -Command "netstat -ano | Select-String 'LISTENING' | Select-String ':8088' | ForEach-Object { if ($_ -match '(\d+)$') { Stop-Process -Id $Matches[1] -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

:: Force terminate any lingering broadcast server processes
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | ForEach-Object { if ($_.CommandLine -like '*broadcast_server.ps1*') { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

:: Clean up files
if exist "nginx\conf\nginx_active.conf" del "nginx\conf\nginx_active.conf"
if exist "bin\cloudflared.pid" del "bin\cloudflared.pid"
if exist "bin\broadcast.pid" del "bin\broadcast.pid"
if exist "nginx\logs\nginx.pid" del "nginx\logs\nginx.pid"
if exist "tunnel_output.log" del "tunnel_output.log"

if "!any_stopped!"=="0" (
    echo Servers are already stopped.
) else (
    echo DDO Saba servers stopped successfully.
)
if "%1"=="" pause
goto :eof

:restart
echo Restarting DDO Saba servers...
call :stop
timeout /t 2 >nul
call :start
goto :eof

:status
echo ==============================================
echo  DDO Saba Server Status
echo ==============================================

:: Check Ollama
netstat -ano | findstr 11434 >nul
if !ERRORLEVEL! equ 0 (
    echo  Ollama Server               : RUNNING [Port 11434]
) else (
    echo  Ollama Server               : STOPPED
)

:: Check Nginx
set "nginx_status=STOPPED"
if exist "nginx\logs\nginx.pid" (
    set /p NGINX_PID=<nginx\logs\nginx.pid
    if not "!NGINX_PID!"=="" (
        tasklist /FI "PID eq !NGINX_PID!" 2>nul | findstr /i "nginx.exe" >nul
        if !ERRORLEVEL! equ 0 set "nginx_status=RUNNING [PID !NGINX_PID!]"
    )
)
if "!nginx_status!"=="STOPPED" (
    tasklist | findstr /i "nginx.exe" >nul
    if !ERRORLEVEL! equ 0 set "nginx_status=RUNNING [Residual]"
)
echo  Nginx Server                : !nginx_status!

:: Check PowerShell Broadcast Server
set "bc_status=STOPPED"
if exist "bin\broadcast.pid" (
    set /p BC_PID=<bin\broadcast.pid
    if not "!BC_PID!"=="" (
        tasklist /FI "PID eq !BC_PID!" 2>nul | findstr /i "powershell" >nul
        if !ERRORLEVEL! equ 0 set "bc_status=RUNNING [PID !BC_PID!]"
    )
)
if "!bc_status!"=="STOPPED" (
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | ForEach-Object { if ($_.CommandLine -like '*broadcast_server.ps1*') { exit 0 } }; exit 1"
    if !ERRORLEVEL! equ 0 set "bc_status=RUNNING [Residual]"
)
echo  PowerShell Broadcast Server : !bc_status!

:: Check Cloudflare Tunnel
set "cf_status=STOPPED"
if exist "bin\cloudflared.pid" (
    set /p CF_PID=<bin\cloudflared.pid
    if not "!CF_PID!"=="" (
        tasklist /FI "PID eq !CF_PID!" 2>nul | findstr /i "cloudflared" >nul
        if !ERRORLEVEL! equ 0 set "cf_status=RUNNING [PID !CF_PID!]"
    )
)
if "!cf_status!"=="STOPPED" (
    tasklist | findstr /i "cloudflared" >nul
    if !ERRORLEVEL! equ 0 set "cf_status=RUNNING [Residual]"
)
echo  Cloudflare Tunnel           : !cf_status!
echo ==============================================
if "%1"=="" pause
goto :eof

:help
echo DDO Saba Server Control Script
echo.
echo Usage:
echo   init_server.bat [command]
echo.
echo Commands:
echo   start     Start all DDO Saba servers (Ollama, Nginx, Broadcast, Cloudflare Tunnel).
echo   stop      Stop all running servers and clean up temporary files.
echo   restart   Restart all servers.
echo   status    Display the status of each server process.
echo   --help    Display this help message.
echo.
echo Running without a command starts the interactive control panel.
goto :eof
