@echo off
echo Stopping DDO Saba servers...

:: Stop Nginx
echo Stopping Nginx...
if exist "nginx\nginx.exe" (
    nginx\nginx.exe -p nginx -s stop >nul 2>&1
)

:: Kill Cloudflare Tunnel
echo Killing Cloudflare Tunnel...
taskkill /f /im cloudflared.exe >nul 2>&1

:: Clean up Nginx zombies
echo Cleaning up Nginx processes...
taskkill /f /im nginx.exe >nul 2>&1

echo DDO Saba servers stopped successfully.
pause
