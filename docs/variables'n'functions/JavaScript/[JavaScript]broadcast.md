# Variable and Function Specifications: `broadcast.js`

This document specifies the variables and functions used in `nginx/conf/broadcast.js`, which handles temporary, stateless message exchanges and client authentication via Nginx JavaScript (njs).

---

## 1. Variables

### `ngx` (L2-2)
- **Type:** `Object` (NGINX Global Object)
- **Description:** The global Nginx object provided by the njs runtime. Accesses the shared dictionary zone `shared.broadcast_zone` which is allocated in memory to temporarily cache the latest broadcasted chat message. Key-value pairs in this zone automatically expire after 5 seconds.
- **Scope:** Global.

### `process` (L276-276)
- **Type:** `Object` (Global Process Object)
- **Description:** The process object provided by njs to access environmental variables. Accesses `env.DDO_SABA_TOKEN` to retrieve the access credential set by the server host.
- **Scope:** Global.

---

## 2. Functions

### `post_message` (L39-75)
- **Description:** Receives a HTTP `POST` request containing a chat message from a client, generates an ID and timestamp, stores it in the `ngx.shared.broadcast_zone` as `"latest"`, and appends it to the in-memory array under the key `"history"` (capped at 100 items).
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP response code `200` with confirmation JSON, or `400` on error).
- **Behavior:**
  1. Parses `r.requestBody` as JSON.
  2. Extracts `sender`, `broadcaster`, `role`, and `content`.
  3. Formulates a JSON string containing an `id` (using `body.id` if provided by the client, falling back to `Date.now().toString()`), the input message, and `timestamp`.
  4. Stores the string into `ngx.shared.broadcast_zone` under the key `"latest"`.
  5. Retrieves `"history"` JSON from `ngx.shared.broadcast_zone`, parses it (defaults to `[]`), pushes the new message, caps the array to the last 100 items, and serializes it back to the `"history"` key.
  6. Returns HTTP `200` with the resolved message ID.

### `get_message` (L77-112)
- **Description:** Receives a HTTP `GET` request and returns new messages since the message ID specified by the `X-DDO-Since-Id` header.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP response code `200` with the filtered JSON payload array).
- **Behavior:**
  1. Retrieves the string under `"history"` from `ngx.shared.broadcast_zone` and parses it as an array.
  2. Inspects the `X-DDO-Since-Id` header.
  3. If the header is empty or undefined, returns the entire session history array with status `200` to allow initial client synchronization.
  4. If the header is set, filters the history array to include only messages appended after the matching ID.
  5. Returns the resulting array with HTTP status `200`.

### `get_history` (L114-120)
- **Description:** Receives a HTTP `GET` request and returns the entire active session history array.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP response code `200` with history array JSON, or `[]` if none).
- **Behavior:**
  1. Retrieves the string under `"history"` from `ngx.shared.broadcast_zone`.
  2. Sets response `Content-Type` header to `application/json`.
  3. Returns the payload or `[]` with status `200`.

### `post_model` (L122-135)
- **Description:** Receives a HTTP `POST` request containing model details and real-time generation/sync status, and stores the raw JSON object string under the `"model"` key. If `isGenerating` is `true`, it also updates the `timestamp` of the currently running job for the same sender in the `"queue"` JSON to the current time, preventing false timeout ejections.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP `200` or `400`).

### `get_model` (L137-143)
- **Description:** Receives a HTTP `GET` request and returns the stored raw JSON object representing the active model and real-time status details.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP `200`).

### `auth_check` (L275-290)
- **Description:** Authenticates request headers targeting `/api/` endpoints by comparing the incoming token with the host-configured token.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Return Value:** None (Sends HTTP response code `200` if authenticated, or `403` if unauthorized).
- **Behavior:**
  1. Retrieves `process.env.DDO_SABA_TOKEN`.
  2. If the expected token is empty, sends HTTP `200` (bypassed).
  3. Inspects header `X-DDO-Token`. If it matches the expected token, sends HTTP `200`.
  4. Otherwise, returns HTTP `403` with a forbidden message.

### `handle_queue` (L153-273)
- **Description:** Manages the shared inference queue in Mac/Linux environments using `ngx.shared.broadcast_zone` with `"queue"` key.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Behavior:** Handles `GET` to list queue (with 300s timeout cleanup) and `POST` to `join`, `cancel`, and `complete` jobs.

### `handle_usage` (L275-325)
- **Description:** Receives a HTTP `POST` request containing token usage and inference duration statistics and appends the record to the main local CSV file `../data/token_usage.csv` as well as three split CSV files (monthly, per-model, and per-user) for simplified metrics management.
- **Arguments:**
  - `r` (`Object`): The Nginx HTTP request object.
- **Behavior:**
  1. Parses `r.requestBody` to extract `model`, `promptTokens`, `completionTokens`, `totalDurationSec`, `loadDurationSec`, `evalDurationSec`, and `status`.
  2. Extracts token and username from headers.
  3. Uses the `fs` module to check for/create the `../data` directory.
  4. Appends a comma-separated, escaped string representing the usage event to `../data/token_usage.csv` (generating headers if new).
  5. Generates three split file paths:
     - Monthly: `../data/token_usage_YYYY_MM.csv`
     - Per-Model: `../data/token_usage_model_modelName.csv`
     - Per-User: `../data/token_usage_user_userName.csv`
     - *Note: `modelName` and `userName` are sanitized to replace forbidden OS filename characters (like `:` or `/`) with `_`.*
  6. Appends the same record to these three split CSV files (generating headers if new).
  7. Returns HTTP `200` on success, or `500` on internal write error.

### `update_active_users` (L1-40)
- **Description:** On every API endpoint request, this function reads the client's unique session identifier (`X-DDO-Client-Id`) from headers. If not present, it falls back to a concatenated ID using `X-DDO-Token` and `X-DDO-Username` headers (formatted as `token + "_" + username`). It updates their last active timestamp in a JSON string stored in `ngx.shared.broadcast_zone` under the `"active_users"` key (using this client ID as the key to prevent duplicates when multiple users share the same token), cleans up entries older than 10 seconds, and includes the active count in the response.
- **Active Timeout:** Performs a sweep of active users. (Note: Automatic reset of `"model"` cache when the sender becomes inactive has been removed to prevent state synchronization loss across peers).
- **Active Count Header:** The response header `X-DDO-Active-Count` returns the exact number of active users, removing any minimum value constraints (which previously forced it to `1`).

---

## 3. Dependency Mapping

```mermaid
graph TD
    post_message --> ngx
    get_message --> ngx
    get_history --> ngx
    post_model --> ngx
    get_model --> ngx
    handle_queue --> ngx
    update_active_users --> ngx
    auth_check --> process
    handle_usage --> fs["require('fs')"]
```

---

## 4. Impact Scope
- **`nginx.conf`:** Relies on this file to be imported via `js_import conf/broadcast.js` and maps locations `/api/poll`, `/api/broadcast`, `/api/history`, `/api/model`, `/api/queue`, and `/api/usage` to the exported functions.
- **`app.tsx` / `useChatActions.ts`:** Client-side React app executes HTTP requests targeting `/api/poll`, `/api/broadcast`, `/api/history`, `/api/model`, `/api/queue`, and `/api/usage`.
- **`data/token_usage.csv`:** Output log file that records the metrics on host machine disk.