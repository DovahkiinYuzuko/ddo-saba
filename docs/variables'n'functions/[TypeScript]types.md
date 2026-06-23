# Variable and Function Specifications: `types.ts`

This document defines the common TypeScript interfaces and types shared across the DDO Saba Web UI components and API modules.

---

## 1. Type and Interface Definitions

### `MessageMetrics` (L1-7)
- **Description:** Tracks performance statistics of inference generation.
- **Fields:**
  - `totalDurationSec?: number`
  - `promptTokens?: number`
  - `evalTokens?: number`
  - `tokensPerSec?: number`
  - `thinkDurationSec?: number`

### `Message` (L9-17)
- **Description:** Represents a single chat message in a session.
- **Fields:**
  - `id?: string`
  - `role`: `'user' | 'assistant' | 'system'`
  - `content`: `string`
  - `sender?: string`
  - `broadcaster?: string`
  - `metrics?: MessageMetrics`
  - `timestamp?: string`

### `ChatSession` (L19-23)
- **Description:** A group of messages representing a chat tab.
- **Fields:**
  - `id`: `string`
  - `title`: `string`
  - `messages`: `Message[]`

### `PsModelInfo` (L25-30)
- **Description:** Ollama VRAM/process status information.
- **Fields:**
  - `name`: `string`
  - `size`: `number`
  - `processor`: `string`
  - `until`: `string`

### `OllamaModelInfo` (L32-35)
- **Description:** Local model installed tag information.
- **Fields:**
  - `name`: `string`
  - `size?: number`

### `DdoSettings` (L37-42)
- **Description:** Configurations inside the settings modal.
- **Fields:**
  - `connectionUrl`: `string`
  - `accessToken`: `string`
  - `isSharedMode`: `boolean`
  - `username`: `string`

### `DdoParameters` (L44-52)
- **Description:** Hyperparameters passed to Ollama options.
- **Fields:**
  - `temperature`: `number`
  - `num_ctx`: `number`
  - `min_p`: `number`
  - `top_p`: `number`
  - `top_k`: `number`
  - `num_predict`: `number`
  - `repeat_penalty`: `number`

### `LocaleStrings` (L54-97)
- **Description:** Contains translation keys for language localization.
- **Fields:** Includes multiple localization key strings, including standard UI text and specific HTTP error mappings (`error400`, `error403`, `error404`, `error503`, `errorGeneric`).

### `QueueJob` (L99-104)
- **Description:** Represents a job in the shared inference room queue.
- **Fields:**
  - `id`: `string`
  - `username`: `string`
  - `timestamp`: `number`
  - `status`: `'waiting' | 'running'`