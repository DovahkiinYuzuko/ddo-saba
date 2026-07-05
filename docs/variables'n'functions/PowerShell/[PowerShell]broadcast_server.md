# broadcast_server.ps1 Specification

This script runs a lightweight in-memory broadcast relay server for Windows environments, acting as a dynamic njs fallback.

## Variables

### `$port`
- **Type:** `Int`
- **Description:** The local port number the HTTP Listener listens on. Default is `8089`.

### `$listener`
- **Type:** `System.Net.HttpListener`
- **Description:** The .NET HttpListener instance that listens for HTTP requests.

### `$messageHistory`
- **Type:** `Array`
- **Description:** An in-memory list storing the chronological sequence of all messages broadcasted within the active session. Used to sync client history.

### `$cachedModelName`
- **Type:** `String`
- **Description:** The name of the currently active model selected by any peer.

### `$cachedModelSender`
- **Type:** `String`
- **Description:** The username of the peer who made the last model selection.

### `$cachedModelTime`
- **Type:** `Double`
- **Description:** The epoch timestamp when the active model was updated.

### `$jobQueue`
- **Type:** `Array`
- **Description:** An in-memory queue containing the sequence of jobs currently waiting for execution.

### `$activeUsers`
- **Type:** `System.Collections.Hashtable`
- **Description:** Keeps track of each client's session ID (`X-DDO-Client-Id`) and their last active Unix epoch timestamp. If the client ID is missing from headers, it falls back to a concatenated ID using `X-DDO-Token` and `X-DDO-Username` headers (formatted as `$token + "_" + $username`) to count concurrent users without duplicates or omissions. Note: The `X-DDO-Username` and `X-DDO-Client-Id` headers are URL-decoded using `[System.Uri]::UnescapeDataString` upon arrival.
- **Active Timeout:** Clean up users inactive for more than 10 seconds. (Note: Automatic reset of `$cachedModelData` when the sender becomes inactive has been removed to prevent state synchronization loss across peers).
- **Active Count Header:** The response header `X-DDO-Active-Count` returns the exact number of active users, removing any minimum value constraints (which previously forced it to `1`).

## Functions

### `Start-BroadcastServer`
- **Description:** Initializes and starts the HTTP Listener loop, routing requests based on URLs.
- **Routes:**
  - `GET /api/poll`: `X-DDO-Since-Id` ヘッダーまたは `lastId` クエリパラメータから取得した `sinceId` 以降のメッセージ履歴（`$messageHistory` からフィルタされた配列）を JSON 配列で返す。`sinceId` が指定されていない場合は `$messageHistory` 全件を返す。差分メッセージがない場合は `204 No Content` を返す。
  - `POST /api/broadcast`: Reads the incoming JSON message body, appends the message to `$messageHistory` (automatically adding timestamp if missing), updates `$activeUsers`, and returns JSON `{ "status": "success", "id": "..." }`.
  - `GET /api/history`: Returns `$messageHistory` JSON, updates `$activeUsers` last active timestamp.
  - `POST /api/model`: Receives model change event `{ model, sender, timestamp, isGenerating }` and updates `$cachedModelName`, `$cachedModelSender`, and `$cachedModelTime`. If `isGenerating` is `true`, it also updates the `timestamp` of the currently running job for the same sender in `$jobQueue` to the current time, preventing false timeout ejections during active inference.
  - `GET /api/model`: Returns the active model cache JSON, updates `$activeUsers`.
  - `GET /api/queue`: Returns the current `$jobQueue` array. Automatically ejects expired running jobs (300s limit by default, or customizable via `X-DDO-Queue-Timeout` request header). Updates `$activeUsers`. Timestamps are managed with millisecond precision (fractions of seconds).
  - `POST /api/queue`: Accepts a JSON payload `{ action, id, username }` and updates `$jobQueue` accordingly. Automatically ejects expired running jobs before processing the payload (uses `X-DDO-Queue-Timeout` header if provided, default is 300s). Updates `$activeUsers`.
  - `POST /api/usage`: Accepts a JSON payload containing Ollama token counts and durations, and appends the usage record to the main local CSV file `../data/token_usage.csv` as well as three split CSV files (monthly, per-model, and per-user) for simplified metrics management. Sanitizes model names and usernames to prevent forbidden file characters.
  - `OPTIONS /api/poll` & `OPTIONS /api/broadcast` & `OPTIONS /api/history` & `OPTIONS /api/model` & `OPTIONS /api/queue` & `OPTIONS /api/usage`: Handles CORS preflight by returning CORS headers with `200 OK` or `204 No Content`.

## Impact Scope
- **`bin/broadcast_server.ps1`:** Handles `/api/usage` requests to log token counts and execution times into `data/token_usage.csv` and three split CSV files. Also provides detailed `Write-Host` logs in PowerShell terminal. Incoming `X-DDO-Username` and `X-DDO-Client-Id` headers are URL-decoded using `[System.Uri]::UnescapeDataString` to support non-ASCII characters (e.g. Japanese).
- **`web-ui`:** Submits API usage metrics upon prompt completion or cancellation.
- **`data/token_usage.csv`:** Output file for performance and token auditing, along with monthly, per-model, and per-user split CSVs.

## Dependency Map

```mermaid
graph TD
    start[Start-BroadcastServer] --> listener[$listener]
    start --> port[$port]
    start --> loop[Request Loop]
    loop --> poll[GET /api/poll]
    loop --> broadcast[POST /api/broadcast]
    loop --> history[GET /api/history]
    loop --> model[GET/POST /api/model]
    loop --> queue[GET/POST /api/queue]
    loop --> usage[POST /api/usage]
    poll --> cacheMsg[$cachedMessage]
    poll --> cacheId[$cachedId]
    poll --> cacheTime[$cachedTime]
    broadcast --> cacheMsg
    broadcast --> cacheId
    broadcast --> cacheTime
    broadcast --> cacheHist[$messageHistory]
    history --> cacheHist
    model --> cacheModelName[$cachedModelName]
    model --> cacheModelSender[$cachedModelSender]
    model --> cacheModelTime[$cachedModelTime]
    queue --> jobQueue[$jobQueue]
    usage --> csvFile["../data/token_usage.csv"]
```
