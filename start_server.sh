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

# Prompt or generate token securely
if [ -z "$DDO_SABA_TOKEN" ]; then
    read -p "Enter access token (Press Enter to auto-generate a secure random token): " DDO_SABA_TOKEN
    if [ -z "$DDO_SABA_TOKEN" ]; then
        if command -v openssl &> /dev/null; then
            DDO_SABA_TOKEN=$(openssl rand -hex 16)
        elif command -v python3 &> /dev/null; then
            DDO_SABA_TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(16))")
        else
            DDO_SABA_TOKEN=$(head -c 16 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || shuf -i 10000000-99999999 -n 1)
        fi
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

# Setup cloudflared binary (pinned version)
CF_VER="2026.2.0"
CF_BIN="/tmp/cloudflared"
if [ ! -f "$CF_BIN" ]; then
    echo "cloudflared binary not found. Downloading version $CF_VER..."
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        CF_ARCH="amd64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        CF_ARCH="arm64"
    else
        CF_ARCH="386"
    fi
    
    curl -L -o "$CF_BIN" "https://github.com/cloudflare/cloudflared/releases/download/${CF_VER}/cloudflared-linux-${CF_ARCH}"
    chmod +x "$CF_BIN"
    echo "Download complete."
fi

# Auto-updates bypassed to guarantee reproducibility
echo "Checking for cloudflared updates... (Bypassed by policy)"

# Prepare active nginx configuration from Linux template
ACTIVE_CONF="nginx/conf/nginx_active.conf"
sed -e "s|load_module __NJS_SO__;|load_module $NJS_SO;|g" \
    -e "s|__DDO_SABA_TOKEN__|${DDO_SABA_TOKEN}|g" \
    nginx/conf/nginx_linux.conf.template > "$ACTIVE_CONF"

# Cleanup trap on exit using target PIDs
cleanup() {
    echo
    echo "Stopping DDO Saba servers..."
    if [ -f "/tmp/ddo_saba_cloudflared.pid" ]; then
        kill -TERM $(cat /tmp/ddo_saba_cloudflared.pid) 2>/dev/null
        rm -f "/tmp/ddo_saba_cloudflared.pid"
    fi
    if [ -f "/tmp/ddo_saba_nginx.pid" ]; then
        kill -TERM $(cat /tmp/ddo_saba_nginx.pid) 2>/dev/null
        rm -f "/tmp/ddo_saba_nginx.pid"
    fi
    rm -f "$ACTIVE_CONF"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start Nginx
echo "Starting Nginx server..."
nginx -p "$(pwd)/nginx" -c "conf/nginx_active.conf"
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start Nginx. Check configuration or port availability."
    exit 1
fi

# Locate and store Nginx PID
if [ -f "$(pwd)/nginx/logs/nginx.pid" ]; then
    cp "$(pwd)/nginx/logs/nginx.pid" /tmp/ddo_saba_nginx.pid
fi

# Start Cloudflare Tunnel
echo "Starting Cloudflare Tunnel..."
LOG_FILE="/tmp/ddo_saba_tunnel.log"
rm -f "$LOG_FILE"

"$CF_BIN" tunnel --url http://localhost:8088 > "$LOG_FILE" 2>&1 &
echo $! > /tmp/ddo_saba_cloudflared.pid

echo "Waiting for Cloudflare Tunnel to initialize..."
sleep 5

REGEX="https://[a-zA-Z0-9-]+\.trycloudflare\.com"
TUNNEL_URL=""

for i in {1..5}; do
    if [ -f "$LOG_FILE" ]; then
        TUNNEL_URL=$(grep -o -E "$REGEX" "$LOG_FILE" | head -n 1)
        if [ ! -z "$TUNNEL_URL" ]; then
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
