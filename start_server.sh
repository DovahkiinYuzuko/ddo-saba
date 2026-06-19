#!/bin/bash

# DDO Saba Linux Boot Script

# Check Nginx and njs installation
if ! command -v nginx &> /dev/null; then
    echo "[ERROR] nginx is not installed."
    echo "Please install Nginx and njs module using your package manager."
    echo "Ubuntu/Debian: sudo apt update && sudo apt install nginx libnginx-mod-http-js"
    echo "CentOS/RHEL:   sudo dnf install nginx nginx-module-njs"
    exit 1
fi

# Locate njs module
NJS_SO="/usr/lib/nginx/modules/ngx_http_js_module.so"
if [ ! -f "$NJS_SO" ]; then
    # Try alternate location
    NJS_SO="/usr/share/nginx/modules/ngx_http_js_module.so"
    if [ ! -f "$NJS_SO" ]; then
        echo "[WARNING] njs module (ngx_http_js_module.so) not found in default paths."
        echo "Please ensure libnginx-mod-http-js or equivalent is installed."
    fi
fi

# Prompt or generate token
if [ -z "$DDO_SABA_TOKEN" ]; then
    read -p "Enter access token (Press Enter to auto-generate a random 6-digit token): " DDO_SABA_TOKEN
    if [ -z "$DDO_SABA_TOKEN" ]; then
        DDO_SABA_TOKEN=$(shuf -i 100000-999999 -n 1)
    fi
fi

echo "=============================================="
echo " DDO Saba Access Token: $DDO_SABA_TOKEN"
echo " Share this token with your clients!"
echo "=============================================="
echo

export DDO_SABA_TOKEN

# Check if Ollama is running (port 11434)
OLLAMA_RUNNING=""
if command -v ss &> /dev/null; then
    ss -lntp | grep -q 11434 && OLLAMA_RUNNING="yes"
elif command -v lsof &> /dev/null; then
    lsof -i :11434 &> /dev/null && OLLAMA_RUNNING="yes"
else
    pgrep -f "ollama" &> /dev/null && OLLAMA_RUNNING="yes"
fi

if [ -z "$OLLAMA_RUNNING" ]; then
    echo "Ollama is not running. Attempting to start Ollama..."
    if command -v ollama &> /dev/null; then
        ollama serve &
        echo "Waiting for Ollama to initialize..."
        sleep 5
    else
        echo "[WARNING] Ollama is not installed or not in PATH."
        echo "Please download and install Ollama from https://ollama.com"
        echo
    fi
else
    echo "Ollama is already running."
fi

# Setup cloudflared binary
CF_BIN="/tmp/cloudflared"
if [ ! -f "$CF_BIN" ]; then
    echo "cloudflared binary not found. Downloading..."
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        CF_ARCH="amd64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        CF_ARCH="arm64"
    else
        CF_ARCH="386"
    fi
    
    curl -L -o "$CF_BIN" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
    chmod +x "$CF_BIN"
    echo "Download complete."
fi

# Check for cloudflared update
echo "Checking for cloudflared updates..."
"$CF_BIN" update &>/dev/null || echo "Skipping cloudflared auto-update."

# Prepare temporary nginx config for Linux
TMP_CONF="/tmp/ddo_saba_nginx.conf"
sed "s|load_module modules/ngx_http_js_module.dll;|load_module $NJS_SO;|g" nginx/conf/nginx.conf > "$TMP_CONF"

# Cleanup trap on exit
cleanup() {
    echo
    echo "Stopping DDO Saba servers..."
    pkill -f "$CF_BIN"
    nginx -p "$(pwd)/nginx" -c "$TMP_CONF" -s stop 2>/dev/null
    rm -f "$TMP_CONF"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start Nginx
echo "Starting Nginx server..."
nginx -p "$(pwd)/nginx" -c "$TMP_CONF"
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start Nginx. Check configuration or port availability."
    exit 1
fi

# Start Cloudflare Tunnel
echo "Starting Cloudflare Tunnel..."
LOG_FILE="/tmp/ddo_saba_tunnel.log"
rm -f "$LOG_FILE"

"$CF_BIN" tunnel --url http://localhost:8088 > "$LOG_FILE" 2>&1 &

echo "Waiting for Cloudflare Tunnel to initialize..."
sleep 5

REGEX="https://[a-zA-Z0-9-]+\.trycloudflare\.com"
TUNNEL_URL=""

for i in {1..5}; do
    if [ -f "$LOG_FILE" ]; then
        TUNNEL_URL=$(grep -o -E "$REGEX" "$LOG_FILE" | head -n 1)
        if [ -not -z "$TUNNEL_URL" ]; then
            echo -e "\e[32mTunnel established! URL: $TUNNEL_URL\e[0m"
            # Try to open browser if xdg-open exists
            if command -v xdg-open &> /dev/null; then
                xdg-open "$TUNNEL_URL" &> /dev/null &
            fi
            break
        fi
    fi
    sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
    echo -e "\e[31mFailed to retrieve Tunnel URL. Please check $LOG_FILE\e[0m"
fi

# Keep script running
echo "Press [Ctrl+C] to stop the server."
while true; do
    sleep 1
done
