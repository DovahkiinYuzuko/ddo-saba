#!/bin/bash

# DDO Saba Linux Boot/Control Script

DIR="$(cd "$(dirname "$0")" && pwd)"
ACTIVE_CONF="$DIR/nginx/conf/nginx_active.conf"

show_help() {
    echo "DDO Saba Server Control Script"
    echo
    echo "Usage:"
    echo "  ./init_server.sh [command]"
    echo
    echo "Commands:"
    echo "  start     Start all DDO Saba servers (Ollama, Nginx, Cloudflare Tunnel)."
    echo "  stop      Stop all running servers and clean up temporary files."
    echo "  restart   Restart all servers."
    echo "  status    Display the status of each server process."
    echo "  --help    Display this help message."
    echo
    echo "Running without a command starts the interactive control panel."
}

start_server() {
    echo "Starting DDO Saba servers..."

    # Check Nginx and njs installation
    if ! command -v nginx &> /dev/null; then
        echo "[ERROR] nginx is not installed."
        echo "Please install Nginx and njs module using your package manager:"
        echo "  Ubuntu/Debian: sudo apt install nginx libnginx-mod-njs"
        echo "  CentOS/RHEL:   sudo dnf install nginx nginx-module-njs"
        echo "  macOS:         brew install nginx"
        exit 1
    fi

    # Locate njs module
    NJS_PATHS=(
        "/usr/lib/nginx/modules/ngx_http_js_module.so"
        "/usr/share/nginx/modules/ngx_http_js_module.so"
        "/usr/lib64/nginx/modules/ngx_http_js_module.so"
        "/opt/homebrew/opt/njs/lib/nginx/modules/ngx_http_js_module.so"
        "/opt/homebrew/lib/nginx/modules/ngx_http_js_module.so"
        "/usr/local/lib/nginx/modules/ngx_http_js_module.so"
    )
    NJS_SO=""
    for path in "${NJS_PATHS[@]}"; do
        if [ -f "$path" ]; then
            NJS_SO="$path"
            break
        fi
    done

    if [ -z "$NJS_SO" ]; then
        echo "[WARNING] njs module (ngx_http_js_module.so) not found in default paths."
        echo "Please make sure Nginx njs module is installed."
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
                DDO_SABA_TOKEN=$(head -c 16 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || echo "1234567890abcdef1234567890abcdef")
            fi
        fi
    fi

    echo "=============================================="
    echo " DDO Saba Access Token: $DDO_SABA_TOKEN"
    echo " Share this token with your clients!"
    echo "=============================================="
    echo

    export DDO_SABA_TOKEN

    # Check if Ollama is running
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
        fi
    else
        echo "Ollama is already running."
    fi

    # Detect OS and architecture
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        CF_ARCH="amd64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        CF_ARCH="arm64"
    else
        CF_ARCH="386"
    fi

    if [ "$OS" = "darwin" ]; then
        CF_OS="darwin"
    else
        CF_OS="linux"
    fi

    # Setup cloudflared binary
    CF_VER="2026.2.0"
    CF_BIN="/tmp/cloudflared"
    if [ ! -f "$CF_BIN" ]; then
        echo "cloudflared binary not found. Downloading version $CF_VER for $CF_OS-$CF_ARCH..."
        curl -L -o "$CF_BIN" "https://github.com/cloudflare/cloudflared/releases/download/${CF_VER}/cloudflared-${CF_OS}-${CF_ARCH}"
        chmod +x "$CF_BIN"
    fi

    # Prepare active nginx configuration
    sed -e "s|load_module __NJS_SO__;|load_module $NJS_SO;|g" \
        -e "s|__DDO_SABA_TOKEN__|${DDO_SABA_TOKEN}|g" \
        "$DIR/nginx/conf/nginx_linux.conf.template" > "$ACTIVE_CONF"

    # Start Nginx
    echo "Starting Nginx server..."
    nginx -p "$DIR/nginx" -c "conf/nginx_active.conf"
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to start Nginx."
        exit 1
    fi

    # Locate and store Nginx PID
    if [ -f "$DIR/nginx/logs/nginx.pid" ]; then
        cp "$DIR/nginx/logs/nginx.pid" /tmp/ddo_saba_nginx.pid
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
    if [ -f "$LOG_FILE" ]; then
        TUNNEL_URL=$(grep -o -E "$REGEX" "$LOG_FILE" | head -n 1)
    fi

    if [ ! -z "$TUNNEL_URL" ]; then
        echo -e "\e[32mTunnel established! URL: $TUNNEL_URL\e[0m"
        if command -v xdg-open &> /dev/null; then
            xdg-open "$TUNNEL_URL" &> /dev/null &
        fi
    else
        echo -e "\e[31mFailed to retrieve Tunnel URL. Please check $LOG_FILE\e[0m"
    fi
}

stop_server() {
    echo "Stopping DDO Saba servers..."
    any_stopped=0

    # Stop Nginx
    if [ -f "/tmp/ddo_saba_nginx.pid" ]; then
        kill -TERM $(cat /tmp/ddo_saba_nginx.pid) 2>/dev/null
        rm -f "/tmp/ddo_saba_nginx.pid"
        any_stopped=1
    else
        if [ -f "$ACTIVE_CONF" ]; then
            nginx -p "$DIR/nginx" -c "conf/nginx_active.conf" -s stop 2>/dev/null
            any_stopped=1
        else
            nginx -p "$DIR/nginx" -s stop 2>/dev/null
        fi
    fi

    # Kill Cloudflare Tunnel
    if [ -f "/tmp/ddo_saba_cloudflared.pid" ]; then
        kill -TERM $(cat /tmp/ddo_saba_cloudflared.pid) 2>/dev/null
        rm -f "/tmp/ddo_saba_cloudflared.pid"
        any_stopped=1
    fi
    
    if pgrep -f cloudflared &>/dev/null; then
        pkill -f cloudflared 2>/dev/null
        any_stopped=1
    fi

    # Clean up files
    rm -f "$ACTIVE_CONF"

    if [ "$any_stopped" -eq 0 ]; then
        echo "Servers are already stopped."
    else
        echo "DDO Saba servers stopped successfully."
    fi
}

server_status() {
    echo "=============================================="
    echo " DDO Saba Server Status"
    echo "=============================================="

    # Ollama
    if pgrep -f "ollama" &> /dev/null; then
        echo " Ollama Server               : RUNNING"
    else
        echo " Ollama Server               : STOPPED"
    fi

    # Nginx
    if [ -f "/tmp/ddo_saba_nginx.pid" ] && kill -0 $(cat /tmp/ddo_saba_nginx.pid) 2>/dev/null; then
        echo " Nginx Server                : RUNNING (PID $(cat /tmp/ddo_saba_nginx.pid))"
    else
        echo " Nginx Server                : STOPPED"
    fi

    # Cloudflare Tunnel
    if [ -f "/tmp/ddo_saba_cloudflared.pid" ] && kill -0 $(cat /tmp/ddo_saba_cloudflared.pid) 2>/dev/null; then
        echo " Cloudflare Tunnel           : RUNNING (PID $(cat /tmp/ddo_saba_cloudflared.pid))"
    else
        echo " Cloudflare Tunnel           : STOPPED"
    fi
    echo "=============================================="
}

# Process actions
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 2
        start_server
        ;;
    status)
        server_status
        ;;
    --help|-h)
        show_help
        ;;
    "")
        # Interactive mode
        while true; do
            clear
            echo "=============================================="
            echo " DDO Saba Server Control Panel"
            echo "=============================================="
            echo " [1] Start Server   (起動)"
            echo " [2] Stop Server    (停止)"
            echo " [3] Restart Server (再起動)"
            echo " [4] Server Status  (ステータス確認)"
            echo " [5] Exit           (終了)"
            echo "=============================================="
            read -p "Choose an option (1-5): " opt
            case "$opt" in
                1) start_server; read -p "Press Enter to continue...";;
                2) stop_server; read -p "Press Enter to continue...";;
                3) stop_server; sleep 2; start_server; read -p "Press Enter to continue...";;
                4) server_status; read -p "Press Enter to continue...";;
                5) exit 0;;
                *) ;;
            esac
        done
        ;;
    *)
        echo "[ERROR] Unknown option: $1"
        show_help
        exit 1
        ;;
esac
