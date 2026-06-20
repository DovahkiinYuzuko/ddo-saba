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

### `Message` (L9-15)
- **Description:** Represents a single chat message in a session.
- **Fields:**
  - `id?: string`
  - `role`: `'user' | 'assistant' | 'system'`
  - `content`: `string`
  - `sender?: string`
  - `metrics?: MessageMetrics`

### `ChatSession` (L17-21)
- **Description:** A group of messages representing a chat tab.
- **Fields:**
  - `id`: `string`
  - `title`: `string`
  - `messages`: `Message[]`

### `PsModelInfo` (L23-28)
- **Description:** Ollama VRAM/process status information.
- **Fields:**
  - `name`: `string`
  - `size`: `number`
  - `processor`: `string`
  - `until`: `string`

### `OllamaModelInfo` (L30-33)
- **Description:** Local model installed tag information.
- **Fields:**
  - `name`: `string`
  - `size?: number`

### `DdoSettings` (L35-40)
- **Description:** Configurations inside the settings modal.
- **Fields:**
  - `connectionUrl`: `string`
  - `accessToken`: `string`
  - `isSharedMode`: `boolean`
  - `username`: `string`

### `DdoParameters` (L42-50)
- **Description:** Hyperparameters passed to Ollama options.
- **Fields:**
  - `temperature`: `number`
  - `num_ctx`: `number`
  - `min_p`: `number`
  - `top_p`: `number`
  - `top_k`: `number`
  - `num_predict`: `number`
  - `repeat_penalty`: `number`