#!/bin/bash
echo "Stopping DDO Saba servers..."

# Discovers directory where script runs
DIR="$(cd "$(dirname "$0")" && pwd)"

# Stop Nginx
echo "Stopping Nginx..."
if [ -f "/tmp/ddo_saba_nginx.conf" ]; then
    nginx -p "$DIR/nginx" -c "/tmp/ddo_saba_nginx.conf" -s stop 2>/dev/null
    rm -f "/tmp/ddo_saba_nginx.conf"
else
    nginx -p "$DIR/nginx" -s stop 2>/dev/null
fi

# Kill Cloudflare Tunnel
echo "Killing Cloudflare Tunnel..."
pkill -f "cloudflared"

# Fallback kill Nginx
pkill -f "nginx"

echo "DDO Saba servers stopped successfully."
