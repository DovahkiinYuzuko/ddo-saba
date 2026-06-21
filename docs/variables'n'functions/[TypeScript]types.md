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

### `Message` (L9-16)
- **Description:** Represents a single chat message in a session.
- **Fields:**
  - `id?: string`
  - `role`: `'user' | 'assistant' | 'system'`
  - `content`: `string`
  - `sender?: string`
  - `metrics?: MessageMetrics`
  - `timestamp?: string`

### `ChatSession` (L18-22)
- **Description:** A group of messages representing a chat tab.
- **Fields:**
  - `id`: `string`
  - `title`: `string`
  - `messages`: `Message[]`

### `PsModelInfo` (L24-29)
- **Description:** Ollama VRAM/process status information.
- **Fields:**
  - `name`: `string`
  - `size`: `number`
  - `processor`: `string`
  - `until`: `string`

### `OllamaModelInfo` (L31-34)
- **Description:** Local model installed tag information.
- **Fields:**
  - `name`: `string`
  - `size?: number`

### `DdoSettings` (L36-41)
- **Description:** Configurations inside the settings modal.
- **Fields:**
  - `connectionUrl`: `string`
  - `accessToken`: `string`
  - `isSharedMode`: `boolean`
  - `username`: `string`

### `DdoParameters` (L43-51)
- **Description:** Hyperparameters passed to Ollama options.
- **Fields:**
  - `temperature`: `number`
  - `num_ctx`: `number`
  - `min_p`: `number`
  - `top_p`: `number`
  - `top_k`: `number`
  - `num_predict`: `number`
  - `repeat_penalty`: `number`