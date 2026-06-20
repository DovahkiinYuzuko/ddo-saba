# Variable and Function Specifications: `components/ChatMessages.tsx`

This document specifies the chat messages display layout, empty-state landing triggers, and parsed CoT (Chain of Thought) accordion renderer logic.

## Stylesheet
- `ChatMessages.css` [NEW]: Contains styles for the central column, conversation logs, message bubbles, reasoning accordion, and input bars.


---

## 1. Props and Functions

### Props
- `messages` (`Message[]`): Chat log list to iterate and display in the UI.
- `activeModel` (`string`): Selected model string.
- `isGenerating` (`boolean`): Rendering toggle during streaming runs.
- `isModelLoading` (`boolean`): Background connection status indicator.
- `modelsCount` (`number`): Count of local tags installed.
- `onImportCassette` (`(e: React.ChangeEvent<HTMLInputElement>) => void`): Ingest callback when JSON chat lists upload.
- `expandedThinking` (`Record<string, boolean>`): Dictionary storing accordion toggle state.
- `onToggleThinking` (`(msgKey: string, isOpen: boolean) => void`): Callback toggling expanded states.
- `collapseThinking` (`boolean`): Default state configurations.
- `t` (`LocaleStrings`): Target localized language dictionaries.
- `lang` (`'en' | 'ja'`): Active locale.

---

## 2. Functions

### `parseMessageContent`
- **Description:** Scans raw contents to detect `<think>` tags and splits messages into details-accordion rendering components.
- **Arguments:**
  - `content` (`string`): Target string value.
  - `msgKey` (`string`): Unique tracking ID key.
- **Return Value:** JSX Element

### `renderMarkdownContent`
- **Description:** Intercepts raw strings and prints parsed HTML/math symbols using plugins.
- **Arguments:**
  - `txt` (`string`): Raw text string.
- **Return Value:** JSX Element
