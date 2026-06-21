# Variable and Function Specifications: `api/broadcast.ts`

This document specifies the helper functions for room broadcasting (sharing messages) using Nginx's custom dict endpoints.

---

## 1. Functions

### `pollMessage` (L9-19)
- **Description:** Pulls the latest room message from `/api/poll`.
- **Arguments:**
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Access token (added for auth verification).
- **Return Value:** `Promise<any>`

### `broadcastMessage` (L21-37)
- **Description:** Sends local user or assistant message to `/api/broadcast` for other peers to capture.
- **Arguments:**
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Access token (added for auth verification).
  - `sender` (`string`): Username signature.
  - `role` (`string`): Message owner ('user' or 'assistant').
  - `content` (`string`): Message body.
- **Return Value:** `Promise<void>`

### `fetchHistory` (L39-49)
- **Description:** Requests the full chronological list of messages broadcasted in the shared room from `/api/history`.
- **Arguments:**
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Access token (added for auth verification).
- **Return Value:** `Promise<any>`

### `broadcastModel` (L51-67)
- **Description:** Notifies other peers of a model selection change by posting `{ model, sender, timestamp }` to `/api/model`.
- **Arguments:**
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Access token (added for auth verification).
  - `sender` (`string`): Username signature.
  - `model` (`string`): Selected model name.
  - `timestamp` (`number`): Millisecond timestamp of the model change.
- **Return Value:** `Promise<void>`

### `pollModel` (L69-79)
- **Description:** Pulls the current active model and selection meta (including the millisecond timestamp) from `/api/model`.
- **Arguments:**
  - `connectionUrl` (`string`): Host URL.
  - `accessToken` (`string`): Access token (added for auth verification).
- **Return Value:** `Promise<{ model?: string; sender?: string; timestamp?: number }>`