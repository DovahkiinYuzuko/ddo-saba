#!/bin/bash
echo "Stopping DDO Saba servers..."

# Discovers directory where script runs
DIR="$(cd "$(dirname "$0")" && pwd)"

# Target configuration to delete
ACTIVE_CONF="$DIR/nginx/conf/nginx_active.conf"

# Stop Nginx by PID
echo "Stopping Nginx..."
if [ -f "/tmp/ddo_saba_nginx.pid" ]; then
    kill -TERM $(cat /tmp/ddo_saba_nginx.pid) 2>/dev/null
    rm -f "/tmp/ddo_saba_nginx.pid"
else
    # Fallback to config stop if PID not found
    if [ -f "$ACTIVE_CONF" ]; then
        nginx -p "$DIR/nginx" -c "conf/nginx_active.conf" -s stop 2>/dev/null
    else
        nginx -p "$DIR/nginx" -s stop 2>/dev/null
    fi
fi

# Kill Cloudflare Tunnel by PID
echo "Killing Cloudflare Tunnel..."
if [ -f "/tmp/ddo_saba_cloudflared.pid" ]; then
    kill -TERM $(cat /tmp/ddo_saba_cloudflared.pid) 2>/dev/null
    rm -f "/tmp/ddo_saba_cloudflared.pid"
fi
pkill -f cloudflared 2>/dev/null

# Clean up active config
rm -f "$ACTIVE_CONF"

echo "DDO Saba servers stopped successfully."
