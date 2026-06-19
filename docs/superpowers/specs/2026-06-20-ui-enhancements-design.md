# Design Specification: Web UI Enhancements

This document specifies the design and behavior changes for the DDO Saba Web UI, targeting improved usability, localization, Ollama model VRAM lifecycle management, and setting management.

---

## 1. Features & Architectural Designs

### 1.1 Max Output Tokens (`num_predict`) Toggle & Expansion
- **Objective**: Allow users to remove limits on response length (unlimited output) and increase the maximum slider limit to support long text generation.
- **State Changes**:
  - `numPredictEnabled` (`boolean`, default: `true`): Tracks whether token limit should be enforced.
- **UI Controls**:
  - A checkbox/toggle switch placed next to the "Max Tokens" parameter label.
  - When unchecked, the slider input becomes `disabled` and the displayed value changes to "無制限 / Unlimited" (based on locale).
  - The maximum bound of the slider is increased from `4096` to `16384`.
- **API Payload Integration**:
  - If `numPredictEnabled` is `false`, the `num_predict` key is omitted from the options payload in `/api/chat` (Ollama defaults to unlimited/model limit when omitted).

### 1.2 Model Size Display, Automatic VRAM Load & Selection Blocking
- **Objective**: Display model files sizes in the UI, trigger pre-loading on selection, and safely manage loading states to prevent concurrent request conflicts.
- **State Changes**:
  - `models` (`Array<{ name: string; size?: number }>`): Updated from `string[]` to hold size metadata.
  - `isModelLoading` (`boolean`, default: `false`): Tracks active background model load operations.
  - `modelLoadError` (`string | null`, default: `null`): Holds load error messages to display when load fetches fail (e.g. Nginx 503/504 errors).
- **Formatting Helper**:
  - `formatBytes(bytes: number)`: Utility function converting raw bytes into a human-readable format (`MB`, `GB`, `TB`).
- **UI Dropdown & Unselected State**:
  - Initial `activeModel` is set to `""` (empty string).
  - The dropdown features a default unselected option: `モデルを選択してください (Select a model)` with a value of `""`.
  - Option text formatted as `${model.name} (${formatBytes(model.size)})`.
  - While `isModelLoading` is `true`, the dropdown select input itself is `disabled` to prevent rapid switching.
- **Auto-Load & Block Trigger**:
  - Selecting a valid model (value != `""`) triggers an immediate background POST to `${settings.connectionUrl}/api/chat` with an empty message array `messages: []` and the target model name.
  - Sets `isModelLoading` to `true` and clears `modelLoadError`.
  - While `isModelLoading` is `true`, the chat input text box, "Send" button, and model select dropdown are `disabled`. The Send button label displays "Loading Model..." with a spinning loading icon.
  - Reverts `isModelLoading` to `false` when the load request resolves.
  - If the load request returns a non-OK status (e.g. Nginx 503/504), sets `modelLoadError` to a descriptive error message and resets `activeModel` to `""`.

### 1.3 Localization (ja) Completeness
- **Objective**: Ensure parameters labels are fully translated into Japanese.
- **Change**:
  - Update `locales.ja` in `App.tsx` to include translation for "Context Limit (num_ctx)", showing "コンテキスト制限 (num_ctx)".
  - Bind the label in the JSX layout to utilize this localized string instead of static English text.

### 1.4 Active Session Keep-Alive
- **Objective**: Keep the active model in VRAM as long as the user has the browser tab open, preventing Ollama's default 5-minute timeout.
- **Mechanism**:
  - A background interval timer running every 240 seconds (4 minutes) when `activeModel` is set, `activeModel !== ""`, and `isGenerating` is `false`.
  - Sends a background POST to `${settings.connectionUrl}/api/chat` with an empty message array (`messages: []`) to reset Ollama's internal keep-alive timer.

### 1.5 Parameter Preset Export & Import
- **Objective**: Save, name, and restore system prompt and parameters configurations independently from message histories.
- **State Changes**:
  - `presetName` (`string`, default: `"My Preset"`): Tracks the custom name of the current parameters preset configuration.
- **Format**:
  - A JSON structure including the preset name:
    ```json
    {
      "version": "1.0-preset",
      "presetName": "string",
      "systemPrompt": "string",
      "parameters": {
        "temperature": "number",
        "num_ctx": "number",
        "min_p": "number",
        "top_p": "number",
        "top_k": "number",
        "num_predict": "number",
        "repeat_penalty": "number"
      },
      "thinkMode": "boolean",
      "sendOnEnter": "boolean",
      "numPredictEnabled": "boolean"
    }
    ```
- **UI Elements**:
  - A text input field at the top of the parameter settings section to allow users to edit the `presetName`.
  - "Export Preset" and "Import Preset" buttons placed at the bottom of the parameter sidebar.
  - File download named dynamically using the slugified `presetName` (e.g., `preset-my-preset.json`).

---

## 2. Impact & Dependencies

- **`web-ui/src/App.tsx`**: Governs state initialization, REST fetch updates for loading, background keep-alive interval loops, and JSON file parsing/writing.
- **`web-ui/src/index.css`**: CSS updates for disabled slider UI styles and preset buttons.
- **`docs/variables'n'functions/[TypeScript]app.md`**: Variable specifications must be updated to match the final implemented states once designed.
