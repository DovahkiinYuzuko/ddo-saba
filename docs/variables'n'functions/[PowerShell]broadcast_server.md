# broadcast_server.ps1 Specification

This script runs a lightweight in-memory broadcast relay server for Windows environments, acting as a dynamic njs fallback.

## Variables

### `$port`
- **Type:** `Int`
- **Description:** The local port number the HTTP Listener listens on. Default is `8089`.

### `$listener`
- **Type:** `System.Net.HttpListener`
- **Description:** The .NET HttpListener instance that listens for HTTP requests.

### `$cachedMessage`
- **Type:** `String` (JSON)
- **Description:** The last message posted to the broadcast API. Cached in memory.

### `$cachedId`
- **Type:** `String`
- **Description:** The unique ID of the last cached message.

### `$cachedTime`
- **Type:** `Double` (Unix timestamp)
- **Description:** The epoch timestamp when the message was cached. Used to expire messages after 5 seconds.

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

## Functions

### `Start-BroadcastServer`
- **Description:** Initializes and starts the HttpListener loop, routing requests based on URLs.
- **Routes:**
  - `GET /api/poll`: Returns the cached message if it has a newer ID than the client's query parameter, and if it has not expired (within 5 seconds).
  - `POST /api/broadcast`: Reads the incoming JSON message body, updates `$cachedMessage`, `$cachedId`, and `$cachedTime`, appends the message to `$messageHistory`, then returns `200 OK`.
  - `GET /api/history`: Returns the entire array in `$messageHistory` as a JSON payload to allow newly connected peers to sync full chat session logs.
  - `POST /api/model`: Receives model change event `{ model, sender, timestamp }` and updates `$cachedModelName`, `$cachedModelSender`, and `$cachedModelTime` (using the provided timestamp or auto-generated epoch if missing).
  - `GET /api/model`: Returns the active model cache JSON `{ model: $cachedModelName, sender: $cachedModelSender, timestamp: $cachedModelTime }`.
  - `GET /api/queue`: Returns the current `$jobQueue` array. Automatically checks if the current `running` job has exceeded 120 seconds timeout and ejects it if necessary.
  - `POST /api/queue`: Accepts a JSON payload `{ action, id, username }` and updates `$jobQueue` accordingly (join, cancel, complete actions).
  - `OPTIONS /api/poll` & `OPTIONS /api/broadcast` & `OPTIONS /api/history` & `OPTIONS /api/model` & `OPTIONS /api/queue`: Handles CORS preflight by returning CORS headers with `200 OK` or `204 No Content`.

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
```
