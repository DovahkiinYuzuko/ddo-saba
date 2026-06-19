# Web UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Web UI usability improvements, including Max Token limit toggle/expansion, model size display, auto-loading on selection, background keep-alive pinging, preset export/import with names, and localization fixes.

**Architecture:** Extend React states in `web-ui/src/App.tsx` to handle parameter options (`presetName`, `numPredictEnabled`, `isModelLoading`), append utility helpers (`formatBytes`, `loadModelOnSelection`), bind interval timers for keep-alive pings, and add file reader/writer triggers for settings presets.

**Tech Stack:** React 19, TypeScript, Vanilla CSS, Vite, Ollama API.

---

### Task 1: Localization & App States Initialization

**Files:**
- Modify: `web-ui/src/App.tsx` (Add Japanese translation key, extend `models` state type, and initialize new states)

- [ ] **Step 1: Update Japanese localization dict for context limit**
  Modify the `locales.ja` translation block around line 117 to use the correct translation for `num_ctx`.
  *Code changes:*
  ```typescript
  // Around line 137 in App.tsx (locales.ja)
  maxTokens: "最大出力トークン数",
  contextLimit: "コンテキスト制限 (num_ctx)", // Add this key
  repeatPenalty: "繰り返しペナルティ",
  ```
  Ensure English `locales.en` also has the key `contextLimit: "Context Limit (num_ctx)"`.

- [ ] **Step 2: Update `models` state type and define new UI parameter states**
  Update the `models` state definition to allow objects with `name` and optional `size`. Define `presetName`, `numPredictEnabled`, and `isModelLoading` states.
  *Code changes:*
  ```typescript
  // Around line 198 in App.tsx
  const [models, setModels] = useState<{ name: string; size?: number }[]>([]);
  const [presetName, setPresetName] = useState<string>("My Preset");
  const [numPredictEnabled, setNumPredictEnabled] = useState<boolean>(true);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  ```

- [ ] **Step 3: Update model lists fetch logic to store model size**
  Modify `fetchModelsAndPs` to extract both `name` and `size` from the `/api/tags` response payload.
  *Code changes:*
  ```typescript
  // Around line 304 in App.tsx
  if (tagsRes.ok) {
    const data = await tagsRes.json();
    const modelObjects = data.models?.map((m: any) => ({
      name: m.name,
      size: m.size
    })) || [];
    
    setModels(prev => {
      if (JSON.stringify(prev) === JSON.stringify(modelObjects)) return prev;
      return modelObjects;
    });
  }
  ```

- [ ] **Step 4: Update active model automatic selection hook**
  Modify the model fallback `useEffect` hook to work with the updated `models` object structure.
  *Code changes:*
  ```typescript
  // Around line 229 in App.tsx
  useEffect(() => {
    if (models.length > 0) {
      const modelNames = models.map(m => m.name);
      if (!activeModel || !modelNames.includes(activeModel)) {
        setActiveModel(models[0].name);
      }
    } else {
      setActiveModel('');
    }
  }, [models, activeModel]);
  ```

- [ ] **Step 5: Verify typescript compilation**
  Run: `npm run build` inside `web-ui` directory.
  Expected: Success without TS errors.

- [ ] **Step 6: Commit**
  ```bash
  git add web-ui/src/App.tsx
  git commit -m "[feat] localesと新規ステートの定義、モデル取得処理の型拡張"
  ```

---

### Task 2: Model Size Format Helper & Selection Auto-Load

**Files:**
- Modify: `web-ui/src/App.tsx` (Add size formatter, auto-load trigger, keep-alive effect, and omit disable prediction check)

- [ ] **Step 1: Write `formatBytes` formatter utility**
  Add the formatting utility before the `App` component definition.
  *Code changes:*
  ```typescript
  // Around line 170 in App.tsx
  function formatBytes(bytes?: number) {
    if (bytes === undefined || bytes === null) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  ```

- [ ] **Step 2: Add `loadModelOnSelection` background fetch function**
  Define a function to load the selected model into VRAM immediately upon selection.
  *Code changes:*
  ```typescript
  // Inside App component
  const loadModelOnSelection = async (modelName: string) => {
    if (!modelName) return;
    setIsModelLoading(true);
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (settings.accessToken) {
        headers['X-DDO-Token'] = settings.accessToken;
      }
      await fetch(`${settings.connectionUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [],
          keep_alive: 300
        })
      });
    } catch (e) {
      console.error("Failed to pre-load model into VRAM", e);
    } finally {
      setIsModelLoading(false);
    }
  };
  ```

- [ ] **Step 3: Update model selector handler to trigger auto-load**
  Update the select onChange dropdown handler in JSX to trigger `loadModelOnSelection`.
  *Code changes:*
  ```typescript
  // Around line 800 in App.tsx (Inside select element onChange)
  onChange={(e) => {
    const selected = e.target.value;
    setActiveModel(selected);
    loadModelOnSelection(selected);
  }}
  ```

- [ ] **Step 4: Implement background keep-alive refresh pings**
  Add a `useEffect` hook to ping the API every 4 minutes (240s) for the selected model.
  *Code changes:*
  ```typescript
  // Inside App component
  useEffect(() => {
    if (!activeModel || isGenerating) return;
    const interval = setInterval(async () => {
      try {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (settings.accessToken) {
          headers['X-DDO-Token'] = settings.accessToken;
        }
        await fetch(`${settings.connectionUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: activeModel,
            messages: [],
            keep_alive: 300
          })
        });
      } catch (e) {
        console.error("Keep alive refresh failed", e);
      }
    }, 240000);
    return () => clearInterval(interval);
  }, [activeModel, settings.connectionUrl, settings.accessToken, isGenerating]);
  ```

- [ ] **Step 5: Omit `num_predict` from `/api/chat` payload if disabled**
  Modify the payload object construction in the `sendMessage` function.
  *Code changes:*
  ```typescript
  // Inside sendMessage in App.tsx
  const optionsPayload: Record<string, any> = { ...parameters };
  if (!numPredictEnabled) {
    delete optionsPayload.num_predict;
  }

  const res = await fetch(`${settings.connectionUrl}/api/chat`, {
    method: 'POST',
    headers,
    signal: abortControllerRef.current.signal,
    body: JSON.stringify({
      model: activeModel,
      messages: requestMessages,
      options: optionsPayload, // Use the dynamically managed options object
      think: thinkMode,
      stream: true
    })
  });
  ```

- [ ] **Step 6: Verify build**
  Run: `npm run build` inside `web-ui` directory.
  Expected: Success without TS errors.

- [ ] **Step 7: Commit**
  ```bash
  git add web-ui/src/App.tsx
  git commit -m "[feat] モデルのサイズ変換、選択時自動ロード、キープアライブ制御の実装"
  ```

---

### Task 3: Settings Preset Export & Import

**Files:**
- Modify: `web-ui/src/App.tsx` (Add exportPreset and importPreset methods)

- [ ] **Step 1: Implement `exportPreset` function**
  Define a function to bundle and download current parameter presets.
  *Code changes:*
  ```typescript
  // Inside App component
  const exportPreset = () => {
    const presetData = {
      version: "1.0-preset",
      presetName,
      systemPrompt,
      parameters,
      thinkMode,
      sendOnEnter,
      numPredictEnabled
    };

    const blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Format filename using slugified preset name
    const sanitizedPresetName = presetName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    a.download = `preset-${sanitizedPresetName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  ```

- [ ] **Step 2: Implement `importPreset` function**
  Define a function to load and apply parameter presets from a JSON file.
  *Code changes:*
  ```typescript
  // Inside App component
  const importPreset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.version === "1.0-preset") {
          if (data.presetName) setPresetName(data.presetName);
          if (data.systemPrompt) setSystemPrompt(data.systemPrompt);
          if (data.options) {
            setParameters(prev => ({ ...prev, ...data.options }));
          } else if (data.parameters) {
            setParameters(prev => ({ ...prev, ...data.parameters }));
          }
          if (data.thinkMode !== undefined) setThinkMode(data.thinkMode);
          if (data.sendOnEnter !== undefined) setSendOnEnter(data.sendOnEnter);
          if (data.numPredictEnabled !== undefined) setNumPredictEnabled(data.numPredictEnabled);
        } else {
          alert("Invalid preset file format. Make sure version matches.");
        }
      } catch (err) {
        alert("Failed to parse preset JSON file.");
      }
    };
    reader.readAsText(file);
  };
  ```

- [ ] **Step 3: Verify build**
  Run: `npm run build` inside `web-ui` directory.
  Expected: Success without TS errors.

- [ ] **Step 4: Commit**
  ```bash
  git add web-ui/src/App.tsx
  git commit -m "[feat] パラメータプリセットのエクスポート・インポート機能の実装"
  ```

---

### Task 4: Layout and UI Elements Updates

**Files:**
- Modify: `web-ui/src/App.tsx` (Update JSX elements for sliders, input fields, dropdown rendering, spinners, and buttons)
- Modify: `web-ui/src/index.css` (Update design styles for disabled inputs, preset name textbox, and button spacing)

- [ ] **Step 1: Update localized label for Context Limit (num_ctx)**
  Find the "Context Limit" slider component inside App.tsx and update the label translation text using the new key `t.contextLimit`.
  *Code changes:*
  ```html
  <div className="slider-group">
    <div className="slider-header">
      <label>{t.contextLimit || "Context Limit (num_ctx)"}</label>
      <span>{parameters.num_ctx}</span>
    </div>
    <!-- input range slider -->
  </div>
  ```

- [ ] **Step 2: Update model selector dropdown options to include size**
  Change option elements in select to render the formatted size next to the model names.
  *Code changes:*
  ```html
  <select value={activeModel} onChange={(e) => { ... }}>
    {models.map(m => (
      <option key={m.name} value={m.name}>
        {m.name} {m.size ? `(${formatBytes(m.size)})` : ''}
      </option>
    ))}
  </select>
  ```

- [ ] **Step 3: Update central Send Message button and input field during model loading**
  Wrap inputs with `disabled` check for `isModelLoading`. Also change Send button behavior to show spinning icon and text "Loading Model...".
  *Code changes:*
  ```html
  <!-- Message TextArea -->
  <textarea
    disabled={isGenerating || isModelLoading}
    ...
  />
  
  <!-- Send Button -->
  <button 
    disabled={!inputText.trim() || isGenerating || isModelLoading}
    onClick={sendMessage}
    ...
  >
    {isModelLoading ? (
      <>
        <Loader2 className="animate-spin" size={16} />
        <span>Loading...</span>
      </>
    ) : isGenerating ? (
      <>
        <Square size={16} />
        <span>{t.stop}</span>
      </>
    ) : (
      <>
        <Send size={16} />
        <span>{t.send}</span>
      </>
    )}
  </button>
  ```

- [ ] **Step 4: Update Max Output Tokens parameter with Toggle and expanded slider**
  Increase slider max value to `16384`. Embed a toggle checkbox for `numPredictEnabled` alongside.
  *Code changes:*
  ```html
  <div className="slider-group">
    <div className="slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input 
          type="checkbox" 
          checked={numPredictEnabled} 
          onChange={(e) => setNumPredictEnabled(e.target.checked)} 
        />
        {t.maxTokens}
      </label>
      <span>{numPredictEnabled ? parameters.num_predict : "無制限 (Unlimited)"}</span>
    </div>
    <input 
      type="range" min="128" max="16384" step="128" 
      value={parameters.num_predict} 
      disabled={!numPredictEnabled}
      onChange={(e) => setParameters(prev => ({ ...prev, num_predict: parseInt(e.target.value) }))}
    />
  </div>
  ```

- [ ] **Step 5: Insert editable Preset Name field and Export/Import buttons**
  Position a text input box at the top of the parameter sidebar for editing `presetName`. Add export/import buttons at the bottom.
  *Code changes:*
  ```html
  <!-- At the top of Sidebar Parameters (around line 830) -->
  <div className="parameter-section-header">
    <h3>{t.modelParameters}</h3>
    <div className="preset-name-input-group" style={{ margin: '8px 0' }}>
      <input
        type="text"
        className="preset-name-input"
        value={presetName}
        onChange={(e) => setPresetName(e.target.value)}
        placeholder="Preset Name"
        style={{
          width: '100%',
          padding: '6px 10px',
          backgroundColor: 'hsl(var(--bg-input))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius-md)',
          color: 'hsl(var(--text-primary))',
          fontSize: '0.9em'
        }}
      />
    </div>
  </div>

  <!-- At the bottom of Sidebar Parameters (around line 930) -->
  <div className="preset-actions-group" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
    <button className="btn-secondary" onClick={exportPreset} style={{ flex: 1, fontSize: '0.85em', padding: '6px' }}>
      Preset Export (JSON)
    </button>
    <label className="btn-secondary" style={{ flex: 1, fontSize: '0.85em', padding: '6px', textAlign: 'center', cursor: 'pointer' }}>
      Preset Import
      <input type="file" accept=".json" onChange={importPreset} style={{ display: 'none' }} />
    </label>
  </div>
  ```

- [ ] **Step 6: Update CSS for disabled ranges and text boxes**
  Add visual feedback to index.css for disabled elements.
  *Code changes:*
  ```css
  /* Inside index.css */
  input[disabled], select[disabled], textarea[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }
  input[type="range"][disabled]::-webkit-slider-thumb {
    background-color: hsl(var(--border));
    cursor: not-allowed;
  }
  ```

- [ ] **Step 7: Verify build**
  Run: `npm run build` inside `web-ui` directory.
  Expected: Success without TS errors.

- [ ] **Step 8: Commit**
  ```bash
  git add web-ui/src/App.tsx web-ui/src/index.css
  git commit -m "[feat] パラメータUIのトグルチェック、プリセット名編集欄、サイズ表示、エクスポート/インポート用UIボタンの追加"
  ```

---

### Task 5: Variable Specification Update

**Files:**
- Modify: `docs/variables'n'functions/[TypeScript]app.md` (Update new states and components)

- [ ] **Step 1: Document `presetName` and `numPredictEnabled` in State Variables section**
  Add the variable definitions to [[TypeScript]app.md](file:///c:/Users/rikui/Documents/VSCode/DDO%20Saba/docs/variables'n'functions/%5BTypeScript%5Dapp.md).
  *Code changes:*
  ```markdown
  ### `presetName`
  - **Type:** `string`
  - **Description:** Tracks custom name assigned to current model generation configuration parameters.

  ### `numPredictEnabled`
  - **Type:** `boolean`
  - **Description:** Toggles the enforcement of `num_predict` values within generating API options payload.
  ```

- [ ] **Step 2: Document `exportPreset` and `importPreset` in Functions section**
  Add the function descriptions to the specification document.
  *Code changes:*
  ```markdown
  ### `exportPreset`
  - **Description:** Bundles system prompts, parameters, think mode, key shortcut configurations, and preset names into a JSON object and triggers local browser file download.
  - **Arguments:** None.
  - **Return Value:** `void`

  ### `importPreset`
  - **Description:** Parses an uploaded JSON file and applies configured system prompt, parameters, and preset names.
  - **Arguments:**
    - `e` (`React.ChangeEvent<HTMLInputElement>`): Trigger event containing target file metadata.
  - **Return Value:** `void`
  ```

- [ ] **Step 3: Document `formatBytes` and `loadModelOnSelection` in Functions section**
  Add the format converter and load function descriptions to the specification document.
  *Code changes:*
  ```markdown
  ### `formatBytes`
  - **Description:** Helper utility converting numeric byte values to readable size text formats (MB, GB, TB).
  - **Arguments:**
    - `bytes` (`number`): The raw byte size value.
  - **Return Value:** `string`

  ### `loadModelOnSelection`
  - **Description:** Sends background dummy POST requests to initialize target model loading directly in host Ollama VRAM.
  - **Arguments:**
    - `modelName` (`string`): Target model configuration string.
  - **Return Value:** `Promise<void>`
  ```

- [ ] **Step 4: Update Dependency mapping diagram**
  Embed the new functions (`exportPreset`, `importPreset`, `loadModelOnSelection`, `formatBytes`) inside the Mermaid diagram flow.
  *Code changes:*
  ```mermaid
  exportPreset --> presetName
  exportPreset --> systemPrompt
  exportPreset --> parameters
  exportPreset --> thinkMode

  importPreset --> presetName
  importPreset --> systemPrompt
  importPreset --> parameters
  importPreset --> thinkMode

  loadModelOnSelection --> settings

  formatBytes
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add docs/variables'n'functions/\[TypeScript\]app.md
  git commit -m "[docs] 仕様書[TypeScript]app.mdにプリセット、サイズフォーマット、自動ロード、キープアライブ機能の定義を追記"
  ```

---

### Task 6: Testing & Verification

**Files:**
- Test: Manual Verification through browser interface.

- [ ] **Step 1: Run the Nginx server and Ollama**
  Ensure Ollama is running and start Nginx on port `8088`.
  Run: `nginx\nginx.exe -p nginx -c conf/nginx_no_njs.conf`

- [ ] **Step 2: Load the Web UI**
  Open `http://localhost:8088` in the browser.

- [ ] **Step 3: Verify Model dropdown list displays size**
  Check the select box. Ensure each model displays size correctly (e.g. `(3.5 GB)`).

- [ ] **Step 4: Verify auto-loading on model change**
  Change active model. Verify the textarea/input/send button are disabled, showing "Loading Model..." loader spinner.
  Wait for it to resolve and enable the input form.

- [ ] **Step 5: Verify Max token toggle logic**
  Uncheck "Max Tokens" check box. Ensure slider range becomes disabled and the value displays "無制限 (Unlimited)".
  Send a message like "Write a very long article about space." Verify output continues beyond default length.
  Check "Max Tokens" and slide it to `16384`. Verify it saves.

- [ ] **Step 6: Verify Japanese text localized labels**
  Change language to Japanese. Verify the slider label displays "コンテキスト制限 (num_ctx)" instead of "Context Limit (num_ctx)".

- [ ] **Step 7: Verify Preset Export & Import**
  Edit "Preset Name" to "Space Writer". Change temperature to `0.9` and min_p to `0.08`.
  Click "Preset Export (JSON)". Check file downloaded is named `preset-space_writer.json`.
  Reset fields back to defaults. Click "Preset Import" and upload the downloaded JSON.
  Verify the name changes back to "Space Writer", temperature restores to `0.9`, and min_p to `0.08`.
