@echo off
setlocal enabledelayedexpansion

echo Stopping DDO Saba servers...

:: Stop Nginx
echo Stopping Nginx...
if exist "nginx\nginx.exe" (
    nginx\nginx.exe -p nginx -s stop >nul 2>&1
)

:: Read Nginx PID and kill it if it is still running
if exist "nginx\logs\nginx.pid" set /p NGINX_PID=<nginx\logs\nginx.pid
if exist "nginx\logs\nginx.pid" if not "!NGINX_PID!"=="" taskkill /f /pid !NGINX_PID! >nul 2>&1

:: Kill Cloudflare Tunnel by PID
if exist "bin\cloudflared.pid" set /p CF_PID=<bin\cloudflared.pid
if exist "bin\cloudflared.pid" if not "!CF_PID!"=="" echo Killing Cloudflare Tunnel (PID: !CF_PID!)...
if exist "bin\cloudflared.pid" if not "!CF_PID!"=="" taskkill /f /pid !CF_PID! >nul 2>&1

:: Kill PowerShell Broadcast Server by PID
if exist "bin\broadcast.pid" set /p BC_PID=<bin\broadcast.pid
if exist "bin\broadcast.pid" if not "!BC_PID!"=="" echo Killing PowerShell Broadcast Server (PID: !BC_PID!)...
if exist "bin\broadcast.pid" if not "!BC_PID!"=="" taskkill /f /pid !BC_PID! >nul 2>&1

:: Clean up files
echo Cleaning up temporary files...
if exist "nginx\conf\nginx_active.conf" del "nginx\conf\nginx_active.conf"
if exist "bin\cloudflared.pid" del "bin\cloudflared.pid"
if exist "bin\broadcast.pid" del "bin\broadcast.pid"
if exist "nginx\logs\nginx.pid" del "nginx\logs\nginx.pid"
if exist "tunnel_output.log" del "tunnel_output.log"

echo DDO Saba servers stopped successfully.
pause
