@echo off
setlocal enabledelayedexpansion

echo Stopping DDO Saba servers...

:: Stop Nginx
echo Stopping Nginx...
if exist "nginx\nginx.exe" (
    if exist "nginx\conf\nginx_active.conf" (
        nginx\nginx.exe -p nginx -c conf\nginx_active.conf -s stop >nul 2>&1
    ) else (
        nginx\nginx.exe -p nginx -s stop >nul 2>&1
    )
)

:: Read Nginx PID and kill it if it is still running
if exist "nginx\logs\nginx.pid" set /p NGINX_PID=<nginx\logs\nginx.pid
if exist "nginx\logs\nginx.pid" if not "!NGINX_PID!"=="" taskkill /f /pid !NGINX_PID! >nul 2>&1

:: Kill Cloudflare Tunnel by PID
if exist "bin\cloudflared.pid" set /p CF_PID=<bin\cloudflared.pid
if exist "bin\cloudflared.pid" if not "!CF_PID!"=="" echo Killing Cloudflare Tunnel (PID: !CF_PID!)...
if exist "bin\cloudflared.pid" if not "!CF_PID!"=="" taskkill /f /pid !CF_PID! >nul 2>&1
echo Terminating residual Cloudflare Tunnel processes...
taskkill /f /im cloudflared.exe >nul 2>&1
echo Terminating residual Nginx processes...
taskkill /f /im nginx.exe >nul 2>&1


:: Kill PowerShell Broadcast Server by PID
if exist "bin\broadcast.pid" set /p BC_PID=<bin\broadcast.pid
if exist "bin\broadcast.pid" if not "!BC_PID!"=="" echo Killing PowerShell Broadcast Server (PID: !BC_PID!)...
if exist "bin\broadcast.pid" if not "!BC_PID!"=="" taskkill /f /pid !BC_PID! >nul 2>&1

:: Force terminate any lingering processes on port 8088 (Nginx)
echo Scanning and terminating residual processes on port 8088...
powershell -NoProfile -Command "netstat -ano | Select-String 'LISTENING' | Select-String ':8088' | ForEach-Object { if ($_ -match '(\d+)$') { Stop-Process -Id $Matches[1] -Force -ErrorAction SilentlyContinue } }"

:: Force terminate any lingering broadcast server processes
echo Scanning and terminating residual broadcast server processes...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | ForEach-Object { if ($_.CommandLine -like '*broadcast_server.ps1*') { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"

:: Clean up files
echo Cleaning up temporary files...
if exist "nginx\conf\nginx_active.conf" del "nginx\conf\nginx_active.conf"
if exist "bin\cloudflared.pid" del "bin\cloudflared.pid"
if exist "bin\broadcast.pid" del "bin\broadcast.pid"
if exist "nginx\logs\nginx.pid" del "nginx\logs\nginx.pid"
if exist "tunnel_output.log" del "tunnel_output.log"

echo DDO Saba servers stopped successfully.
pause
