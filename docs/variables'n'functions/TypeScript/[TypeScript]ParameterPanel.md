# Variable and Function Specifications: `components/ParameterPanel.tsx`

This document specifies the properties, configurations, and callbacks governing the right-hand side panel containing inference controls and loaded model VRAM indicators.

## Stylesheet
- `ParameterPanel.css` [NEW]: Contains styles for the right-hand side parameters column, custom sliders, toggle switches, and model status card.


---

## 1. Props

### Props
- `parameters` (`DdoParameters`): Object holding active generation options.
- `onChangeParameters` (`(params: DdoParameters) => void`): Callback when numeric slider thresholds update.
- `presetName` (`string`): Named label for the active parameter presets bundle.
- `onChangePresetName` (`(name: string) => void`): Handler updating the preset name string.
- `systemPrompt` (`string`): Core prompt injected globally at session start.
- `onChangeSystemPrompt` (`(prompt: string) => void`): Handler modifying the core prompt value.
- `thinkMode` (`boolean`): Toggle for the CoT parameter.
- `onChangeThinkMode` (`(val: boolean) => void`): Callback modifying reasoning flag state.
- `collapseThinking` (`boolean`): Flag designating if CoT blocks start minimized.
- `onChangeCollapseThinking` (`(val: boolean) => void`): Callback toggling default folding behavior.
- `numPredictEnabled` (`boolean`): Toggle governing token limit inclusions.
- `onChangeNumPredictEnabled` (`(val: boolean) => void`): Callback modifying predicted token configurations.
- `psInfo` (`PsModelInfo | null`): Object containing details of models currently in VRAM.
- `onUnloadModel` (`() => void`): Callback for manually unloading model allocations.
- `contextUsed` (`number`): Tracking value for total session memory limit.
- `onExportPreset` (`() => void`): Bundles configuration fields into local JSON outputs.
- `onImportPreset` (`(e: React.ChangeEvent<HTMLInputElement>) => void`): Handler loading saved JSON settings profiles.
- `t` (`LocaleStrings`): Target localization mapping dictionary.
- `lang` (`'en' | 'ja'`): Active UI locale string.

---

## 2. Configurations & Constant Variables

### `PARAMETER_SPECS`
- **Description:** A metadata config object defining `min`, `max`, and `step` values for each inference parameter (`temperature`, `min_p`, `top_p`, `top_k`, `num_predict`, `num_ctx`, `repeat_penalty`). Used to perform validation and clamping.

---

## 3. State Variables

### `tempValues`
- **Description:** Local React state (`Record<string, string>`) holding temporary string representations of manual input values. It prevents cursor jump issues during text entry, syncing from `parameters` only when the target input field does not have focus.

---

## 4. Functions

### `handleInputChange`
- **Description:** Handler for editing events on numerical parameter input fields. Updates the `tempValues` state buffer.
- **Arguments:**
  - `key` (`keyof DdoParameters`)
  - `valStr` (`string`)
- **Return Value:** `void`

### `handleInputConfirm`
- **Description:** Performs numeric validation and clamping on `tempValues[key]` based on bounds defined in `PARAMETER_SPECS`. Resolves `NaN` values, rounds integer fields (`top_k`, `num_predict`, `num_ctx`), updates parent context using `onChangeParameters`, and updates local `tempValues` state.
- **Arguments:**
  - `key` (`keyof DdoParameters`)
- **Return Value:** `void`

### `handleKeyDown`
- **Description:** Listens to `KeyDown` events on number input components. Triggers `handleInputConfirm` and blurs focus if the `Enter` key is pressed.
- **Arguments:**
  - `e` (`React.KeyboardEvent<HTMLInputElement>`)
  - `key` (`keyof DdoParameters`)
- **Return Value:** `void`
