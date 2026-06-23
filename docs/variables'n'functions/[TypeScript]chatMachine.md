# Variable and Function Specifications: `chatMachine.ts`

This document specifies the states, context, and functions used in `web-ui/src/machines/chatMachine.ts`, which is a Hierarchical Finite State Machine (HFSM) implemented using XState v5. This machine governs the complex states of local generation, model loading, and remote synchronization via polling.

---

## 1. Machine Context

The `context` holds the quantitative data previously managed by multiple `useState` and `useRef` hooks in `App.tsx`.

### `activeModel` (L7-7)
- **Type:** `string`
- **Description:** The currently selected active model. Automatically cleared when unloaded successfully.

### `activeUserCount` (L12-12)
- **Type:** `number`
- **Description:** Tracks the current number of active users connected to the shared room.
- **Default:** `1`

### `jobQueue` (L8-8)
- **Type:** `Array<QueueJob>`
- **Description:** Holds the list of active jobs in the inference queue.

### `myJobId` (L9-9)
- **Type:** `string | null`
- **Description:** Tracks the unique ID of the user's active job in the queue.

### `chats` (L10-10)
- **Type:** `Array<ChatSession>`
- **Description:** Holds all active temporary chat tabs.

### `syncRequestPending` (L13-13)
- **Type:** `SyncRequestData | null`
- **Description:** Holds pending settings sync request data received from other clients.

---

## 2. Machine States (Parallel Architecture)

The machine consists of two parallel (orthogonal) state regions: `local` and `sync`.

### `local` Region
Manages user-initiated local operations.

- **`idle`**: The resting state. It listens for `SELECT_MODEL`, `START_GENERATE`, and `UNLOAD_MODEL` events.
- **`loadingModel`**: Entered when a model is selected. Transitions to `idle` on `LOAD_SUCCESS` or `LOAD_FAILURE`.
- **`generating`**: Entered when the queue processes a prompt. Transitions to `idle` on `GENERATE_COMPLETE` or `GENERATE_ABORT`. It rejects new `START_GENERATE` events to prevent race conditions (double execution).
- **`unloadingModel`**: Entered when the unload action is triggered. On `UNLOAD_SUCCESS`, clears the `activeModel` in context.

### `sync` Region
Manages real-time polling synchronization with the server in Shared Room Mode.

- **`idle`**: The polling loop is inactive (e.g., Private Mode).
- **`polling`**: Active polling mode. Polls for `activeModel`, `jobQueue`, and `isGenerating` statuses of other clients.
- **`remoteGenerating`**: Entered when another client broadcasts `isGenerating: true`. Prevents local keep-alive pings and local `activeModel` resets. Transitions back to `polling` automatically when the peer signals completion (`isGenerating: false`).

---

## 3. Events

- **`SELECT_MODEL`**: Triggered when a user selects a model from the dropdown. payload: `{ modelName: string }`
- **`START_GENERATE`**: Triggered when the queue is ready to execute a prompt.
- **`GENERATE_COMPLETE`**: Emitted when the inference stream finishes successfully.
- **`UNLOAD_MODEL`**: Triggered by the unload button.
- **`UNLOAD_SUCCESS`**: Indicates the VRAM was successfully cleared.
- **`PEER_START_GENERATE`**: Detected via polling; signals that a remote client has started generation.
- **`PEER_COMPLETE_GENERATE`**: Detected via polling; signals that a remote client has finished generation.
- **`UPDATE_CONTEXT`**: Generic event to update context fields (e.g., `chats`, `jobQueue`, `activeUserCount`).

---

## 4. Dependency Mapping

```mermaid
graph TD
    App --> useMachine[useMachine hook]
    useMachine --> chatMachine

    chatMachine --> localState[Local State]
    chatMachine --> syncState[Sync State]

    localState --> loadingModelAction[api/generate call]
    localState --> generatingAction[runInferenceStream logic]
    localState --> unloadAction[unload VRAM logic]

    syncState --> pollingAction[pollModel API]

    localState -.-> context[Machine Context]
    syncState -.-> context
```