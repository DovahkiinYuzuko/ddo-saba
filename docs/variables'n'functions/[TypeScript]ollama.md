# Variable and Function Specifications: `api/ollama.ts`

This document specifies the helper functions for communicating with the Ollama server endpoints via Nginx proxying.

---

## 1. Functions

### `loadModelOnSelection` (L11-38)
- **Description:** Sends background dummy POST requests to initialize target model loading directly in host Ollama VRAM.
- **Arguments:**
  - `modelName` (`string`): Target model configuration string.
  - `settings` (`DdoSettings`): App settings.
  - `parameters` (`DdoParameters`): Generation parameters.
  - `numPredictEnabled` (`boolean`): Whether to send num_predict option.
- **Return Value:** `Promise<void>`

### `fetchModels` (L40-54)
- **Description:** Pulls local model tags from `/api/tags`.
- **Arguments:**
  - `connectionUrl` (`string`): Ollama API host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<OllamaModelInfo[]>`

### `fetchPs` (L56-76)
- **Description:** Pulls running models and VRAM usage statistics from `/api/ps`.
- **Arguments:**
  - `connectionUrl` (`string`): Ollama API host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<PsModelInfo | null>`

### `keepAliveModel` (L78-93)
- **Description:** Refreshes model VRAM allocation using `/api/chat` with empty payloads.
- **Arguments:**
  - `modelName` (`string`): Active model name.
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<void>`

### `unloadModel` (L95-110)
- **Description:** Unloads a model from VRAM by calling `/api/chat` with `keep_alive: 0`.
- **Arguments:**
  - `modelName` (`string`): Model name.
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Token.
- **Return Value:** `Promise<void>`