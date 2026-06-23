# Variable and Function Specifications: `app.tsx`

This document specifies the states, variables, and functions used in `web-ui/src/app.tsx`, which governs the main ChatUI coordination, tab management, and Ollama integration stream flows.

---

## 1. State Variables

All states defined below use React's `useState` or `useRef`.

### `chats`
- **Type:** `Array` of `ChatSession` objects
- **Description:** Holds all active temporary chat tabs.

### `activeChatId`
- **Type:** `string | null`
- **Description:** Tracks the ID of the currently selected and active chat tab.

### `settings`
- **Type:** `DdoSettings`
- **Description:** Tracks host configurations (connectionUrl, accessToken, isSharedMode, username). On initial load, parses `token` or `accessToken` from the URL query parameters to auto-populate the `accessToken`. Additionally, parses `sharedMode` or `isSharedMode` from the query parameters to auto-populate `isSharedMode`.

### `models`
- **Type:** `Array` of `OllamaModelInfo`
- **Description:** List of installed models fetched from Ollama tags endpoint.

### `activeModel`
- **Type:** `string`
- **Description:** The currently selected active model.

### `systemPrompt`
- **Type:** `string`
- **Description:** Prompt instructions configured in the parameters column.

### `parameters`
- **Type:** `DdoParameters`
- **Description:** Model generation settings passed inside options payload.

### `thinkMode`
- **Type:** `boolean`
- **Description:** Toggles the global `"think"` parameter in the API payload.

### `psInfo`
- **Type:** `PsModelInfo | null`
- **Description:** Loaded VRAM/running metrics.

### `isGenerating`
- **Type:** `boolean`
- **Description:** Tracks if an inference streaming fetch is currently in progress.

### `isGeneratingRef`
- **Type:** `React.MutableRefObject<boolean>`
- **Description:** A React `useRef` holding the active `isGenerating` boolean value to prevent keep-alive resetting.

### `abortControllerRef`
- **Type:** `React.MutableRefObject<AbortController | null>`
- **Description:** Ref holding the `AbortController` instance to cancel ongoing fetch requests.

### `sendOnEnter`
- **Type:** `boolean`
- **Description:** Toggles the Enter key behavior shortcut.

### `contextUsed`
- **Type:** `number`
- **Description:** Tracks total token usage of the current chat message.

### `presetName`
- **Type:** `string`
- **Description:** Name assigned to the current preset parameters.

### `numPredictEnabled`
- **Type:** `boolean`
- **Description:** Toggles whether the `num_predict` parameter is included.

### `isModelLoading`
- **Type:** `boolean`
- **Description:** Tracks background model loading state.

### `modelLoadError`
- **Type:** `string`
- **Description:** Holds error messages when model loading fails.

### `collapseThinking`
- **Type:** `boolean`
- **Description:** Toggles whether CoT blocks default to collapsed.

### `lastPolledMsgId`
- **Type:** `string`
- **Description:** Tracks the ID of the last polled message in shared room mode.

### `lastPolledMsgIdRef`
- **Type:** `React.MutableRefObject<string>`
- **Description:** A React `useRef` holding `lastPolledMsgId` to avoid interval resets.

### `isSidebarOpen`
- **Type:** `boolean`
- **Description:** Tracks mobile left sidebar status.

### `isParamsOpen`
- **Type:** `boolean`
- **Description:** Tracks mobile right panel status.

### `messagesContainerRef`
- **Type:** `React.MutableRefObject<HTMLDivElement | null>`
- **Description:** Tracks the HTMLDivElement scroll container of the chat message list to directly manipulate `scrollTop` for scroll synchronization.

### `lastModelChangeTime`
- **Type:** `number`
- **Description:** Holds the millisecond timestamp of the last local model change (selection or unload) to prevent poll echoes.

### `syncRequestPending`
- **Type:** `object | null`
- **Description:** Holds pending settings sync request data received from other clients (`activeModel`, `systemPrompt`, `parameters`, `thinkMode`, `sender`).
- **Default:** `null`

### `isRemoteGenerating`
- **Type:** `boolean`
- **Description:** Tracks whether another client is currently running an inference stream.
- **Default:** `false`

### `isRemoteGeneratingRef`
- **Type:** `React.MutableRefObject<boolean>`
- **Description:** A React `useRef` holding the active `isRemoteGenerating` boolean value to prevent keep-alive and selection resetting during remote generation.


### `remoteGeneratingText`
- **Type:** `string`
- **Description:** Stores the real-time generated content streamed from another client.
- **Default:** `""`

### `lastModelSender`
- **Type:** `string`
- **Description:** Tracks the username of the peer who last changed or loaded the active model. Used to determine ownership for handling VRAM unloading cleanups.

### `jobQueue`
- **Type:** `Array` of `QueueJob` objects
- **Description:** Holds the list of active jobs in the inference queue.
- **Default:** `[]`

### `myJobId`
- **Type:** `string | null`
- **Description:** Tracks the unique ID of the user's active job in the queue.
- **Default:** `null`

### `pendingMessage`
- **Type:** `string`
- **Description:** Stores the prompt text temporarily in client memory while waiting in the queue.
- **Default:** `""`

---

## 2. Functions

### `formatTimestamp`
- **Description:** Formats a date object or an ISO timestamp string into `yyyy/MM/dd-HH:mm`.
- **Arguments:**
  - `dateInput` (`string | Date`): Input date.
- **Return Value:** `string`

### `sendMessage`
- **Description:** Sends a user prompt. If in Shared Room Mode, it first issues a `joinQueue` request to register in the queue. Only after successful queue confirmation does it clear the input field (`setInputText('')`), set `pendingMessage` to the prompt text, set `myJobId` to the generated job ID, and poll the queue. Unlike Private Mode, it does not append the user message bubble to `chats` or broadcast it immediately. If not in Shared Room Mode, it immediately clears the input field, appends the user bubble, and calls `runInferenceStream`.
- **Arguments:** None.
- **Return Value:** `Promise<void>`

### `runInferenceStream`
- **Description:** Initiates the Ollama chat stream. In Shared Room Mode, if Nginx returns a 503 Service Unavailable error due to concurrent connection limits, it waits for 1 second and retries (up to 3 times) before throwing an error. Upon completion or abort, it clears the queue status by calling `completeQueue` and resetting queue-related states.
- **Arguments:**
  - `jobIdToComplete` (`string | null`, optional): The active queue job ID to complete upon termination.
- **Return Value:** `Promise<void>`

### `stopGeneration`
- **Description:** Aborts the current streaming API request.
- **Arguments:** None.
- **Return Value:** `void`

### `addNewTab`
- **Description:** Spawns a new chat tab with a default blank history. If in Shared Room Mode, broadcasts a `tab_create:ID:Title` system message.
- **Arguments:** None.
- **Return Value:** `void`

### `deleteTab`
- **Description:** Closes and deletes a specific chat session. If in Shared Room Mode, broadcasts a `tab_delete:ID` system message.
- **Arguments:**
  - `id` (`string`): Target chat session ID.
- **Return Value:** `void`

### `handleUnloadModel`
- **Description:** Unloads the currently active model from Ollama VRAM by hitting the API, then updates state `psInfo` to null, triggers `fetchModelsAndPs`, clears state `activeModel` to resetting the UI select element back to "Select a model...", updates `lastModelChangeTime`, and broadcasts model clear command if Shared Room Mode is enabled.
- **Arguments:** None.
- **Return Value:** `Promise<void>`

### `broadcastSettings`
- **Description:** Broadcasts current parameters and active model to all connected clients under a `sync_request` message event.
- **Arguments:** None.
- **Return Value:** `Promise<void>`

### `handleAcceptSyncRequest`
- **Description:** Approves the pending sync request, updates local settings/parameters state, and initiates model loading if the synchronized model differs from active.
- **Arguments:** None.
- **Return Value:** `void`

### `Model Synchronization, VRAM Cleanups & 503 Bypass`
- **Description:** When the model selection is synchronized automatically via polling (`pollModel`), only `activeModel` is updated. Unlike manual selection, `loadModelOnSelection` (calling `/api/generate`) is bypassed to prevent redundant network pre-loads that trigger Nginx's concurrent connection limit (`503 Service Unavailable`). Additionally, when Ollama's active VRAM state changes, `activeModel` is cleared automatically. However, to prevent premature selection resets when Ollama is temporarily loading or busy, this cleanup is bypassed if either local generation (`isGenerating`) or remote generation (`isRemoteGenerating`) is active.

### `Shared Room Mode Tab Synchronization`
- **Description:** When `settings.isSharedMode` transitions from `false` to `true`, the local client automatically serializes and broadcasts all existing chat tabs and histories (`chats`) to the broadcast server so they are fully synchronized with newly connected clients (e.g. mobile phones).

---

## 3. Dependency Mapping

```mermaid
graph TD
    App --> sendMessage
    App --> runInferenceStream
    App --> stopGeneration
    App --> addNewTab
    App --> deleteTab
    App --> handleUnloadModel
    App --> SettingsModal
    App --> ParameterPanel
    App --> ChatMessages

    App --> isSidebarOpen
    App --> isParamsOpen
    App --> lastModelChangeTime

    App --> broadcastModel[broadcastModel API]
    App --> pollModel[pollModel API]

    sendMessage --> activeModel
    sendMessage --> settings
    sendMessage --> joinQueue[joinQueue API]

    runInferenceStream --> activeModel
    runInferenceStream --> systemPrompt
    runInferenceStream --> parameters
    runInferenceStream --> thinkMode
    runInferenceStream --> chats
    runInferenceStream --> settings
    runInferenceStream --> abortControllerRef
    runInferenceStream --> completeQueue[completeQueue API]
    runInferenceStream --> broadcastMessage[broadcastMessage API]

    addNewTab --> settings
    deleteTab --> settings
```
