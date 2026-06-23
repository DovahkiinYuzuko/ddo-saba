# Variable and Function Specifications: `api/ollama.ts`

This document specifies the helper functions for communicating with the Ollama server endpoints via Nginx proxying.

---

## 1. Functions

### `loadModelOnSelection` (L11-41)
- **Description:** Sends background POST requests to initialize target model loading directly in host Ollama VRAM. Specifically calls `fetchAPI1` to hit the `/api/generate` endpoint, configuring `stream: false` and waiting until the response body is completely read to ensure the connection isn't aborted early.
- **Arguments:**
  - `modelName` (`string`): Target model configuration string.
  - `settings` (`DdoSettings`): App settings.
  - `parameters` (`DdoParameters`): Generation parameters.
  - `numPredictEnabled` (`boolean`): Whether to send num_predict option.
- **Return Value:** `Promise<void>`

### `fetchModels` (L43-57)
- **Description:** Pulls local model tags from `/api/tags`.
- **Arguments:**
  - `connectionUrl` (`string`): Ollama API host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<OllamaModelInfo[]>`

### `fetchPs` (L59-79)
- **Description:** Pulls running models and VRAM usage statistics from `/api/ps`.
- **Arguments:**
  - `connectionUrl` (`string`): Ollama API host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<PsModelInfo | null>`

### `keepAliveModel` (L81-96)
- **Description:** Refreshes model VRAM allocation using `/api/chat` with empty payloads.
- **Arguments:**
  - `modelName` (`string`): Active model name.
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<void>`

### `unloadModel` (L98-148)
- **Description:** Unloads a model from VRAM by calling `fetchAPI2` to hit the `/api/chat` endpoint with `keep_alive: 0` and `stream: false`, waiting until the response body is fully read. If Nginx returns a 503 Service Unavailable error, it waits for 1 second and retries up to 3 times before throwing an error.
- **Arguments:**
  - `modelName` (`string`): Model name.
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<void>`

---

## 2. Dependency Mapping

```mermaid
graph TD
    App.tsx --> loadModelOnSelection
    App.tsx --> unloadModel
    
    loadModelOnSelection --> fetchAPI1[fetch /api/generate]
    unloadModel --> fetchAPI2[fetch /api/chat]
    
    fetchAPI1 --> res1[stream: false + await res.json()]
    fetchAPI2 --> res2[stream: false + await res.json()]
```

---

## 3. Impact Scope

- `App.tsx`: The async actions `loadModelOnSelection` and `handleUnloadModel` now reliably wait for Ollama to finish its operations before resuming state updates (like setting `isModelLoading` to false). This prevents premature state updates where the client thinks the model is loaded/unloaded before the server has processed it.