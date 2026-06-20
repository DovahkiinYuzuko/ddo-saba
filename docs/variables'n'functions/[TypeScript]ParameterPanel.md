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
