# Variable and Function Specifications: `start_tunnel.ps1`

This document specifies the variables and flow logic used in `bin/start_tunnel.ps1`, which executes Cloudflare Quick Tunnel on Windows, logs the output, extracts the public URL, and writes the process ID.

---

## 1. Variables

### `$localPort`　
- **Type:** `Integer`
- **Description:** Port number of the local Nginx web server. Defaults to `8088`.
- **Scope:** Script-wide.

### `$logFile`
- **Type:** `String`
- **Description:** File path to temporarily store `cloudflared.exe` standard error logs. Defaults to `"tunnel_output.log"`.
- **Scope:** Script-wide.

### `$process`
- **Type:** `System.Diagnostics.Process`
- **Description:** Holds the process object of the launched `cloudflared.exe` instance. Used for process tracking.
- **Scope:** Script-wide.

### `$regex`
- **Type:** `String`
- **Description:** Regular expression pattern used to identify the TryCloudflare subdomain link. Matches `https://[a-zA-Z0-9-]+\.trycloudflare\.com`.
- **Scope:** Script-wide.

### `$output`
- **Type:** `String`
- **Description:** Temporarily stores the raw text content read from `$logFile`.
- **Scope:** Loop-local.

### `$tunnelUrl`
- **Type:** `String`
- **Description:** Holds the extracted TryCloudflare URL once parsed from the log file.
- **Scope:** Script-wide.

### `$cfVersion`
- **Type:** `String`
- **Description:** Pinned stable version of the cloudflared executable (e.g., `2026.2.0`).
- **Scope:** Script-wide.

---

## 2. Process Flow Description

Since this is a PowerShell script, it runs procedurally rather than using custom functions:
1. Verifies if `$logFile` exists and removes it to clean old sessions.
2. Checks if the pinned version of `cloudflared.exe` is present under `bin/`. If missing, downloads the pinned release version from GitHub instead of the `latest` tag.
3. Auto-update command (`cloudflared update`) is bypassed to prevent running unverified binaries.
4. Starts `bin/cloudflared.exe` with arguments `tunnel --url http://localhost:$localPort` using `Start-Process`. Redirects standard error output stream (`2>&1`) to `$logFile`.
5. Writes the PID of the launched `cloudflared` process to `bin/cloudflared.pid`.
6. Pauses script execution for 5 seconds using `Start-Sleep` to allow network handshake.
7. Enters a retry loop (runs up to 5 times, sleeping 2 seconds per cycle):
   - Reads `$logFile` content raw into `$output`.
   - Checks if `$output` matches `$regex`.
   - On match, stores the URL into `$tunnelUrl`, writes console notification in color, launches the URL in the default browser using `Start-Process $tunnelUrl`, and breaks the loop.

---

## 3. Dependency Mapping

```mermaid
graph TD
    StartProcess[Start-Process cloudflared] --> |Redirects stderr| LogFile[$logFile]
    StartProcess --> |Writes PID| PIDFile["bin/cloudflared.pid"]
    LogFile --> |Reads content| Output[$output]
    Output --> |Regex match| RegexMatch[$regex]
    RegexMatch --> |Saves matching group| TunnelURL[$tunnelUrl]
    TunnelURL --> |Starts browser| LaunchBrowser[Start-Process $tunnelUrl]
```

---

## 4. Impact Scope
- **`start_server.bat`:** Directly executes this script via `powershell -ExecutionPolicy Bypass -File bin/start_tunnel.ps1`.
- **`stop_server.bat`:** Reads `bin/cloudflared.pid` to safely terminate the tunnel process.
