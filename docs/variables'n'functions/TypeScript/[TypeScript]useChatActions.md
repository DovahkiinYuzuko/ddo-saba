# 概要
`useChatActions` は、チャットの送信、推論の中止、キューへの参加およびキャンセルなど、推論APIとの対話に関するアクションを管理するカスタムフックである。

## 依存関係
```mermaid
graph TD
    A[useChatActions] --> B(chatMachine context)
    A --> C(api/ollama)
    A --> D(api/broadcast)
    A --> E(api/queue)
    A --> F(api/usage)
```

## 引数 (Props)

`UseChatActionsProps` に以下のパラメータが定義されている：
- `chats`: `ChatSession[]` - 現在のチャット履歴セッションの配列。
- `activeChatId`: `string | null` - アクティブなチャットセッションのID。
- `settings`: `DdoSettings` - 共有モードや認証情報を含む設定オブジェクト。
- `activeModel`: `string` - 選択されているアクティブモデル名。
- `systemPrompt`: `string` - 現在のシステムプロンプト。
- `pendingMessage`: `string` - キュー待機中の一時メッセージ。
- `parameters`: `DdoParameters` - 生成パラメータ。
- `thinkMode`: `'off' | 'on' | 'think'` - 思考プロセス出力モード。
- `numPredictEnabled`: `boolean` - 推論トークン数制限が有効か。
- `myJobId`: `string | null` - 自分のジョブID。
- `inputText`: `string` - 入力中のテキスト。
- `isGeneratingRef`: `React.MutableRefObject<boolean>` - 生成中フラグのRef。
- `abortControllerRef`: `React.MutableRefObject<AbortController | null>` - アボートコントローラのRef。
- `t`: `any` - 翻訳オブジェクト。
- `setChats`, `setIsGenerating`, `setModelLoadError`, `setPendingMessage`, `setMyJobId`, `setJobQueue`, `setInputText`, `setContextUsed`, `updateLastPolledMsgId` - 各状態更新用のコールバック。
- `startGenerate`: `() => void` - XStateに生成開始を通知する。
- `completeGenerate`: `() => void` - XStateに生成の正常終了を通知する。
- `abortGenerate`: `() => void` - XStateに生成の中止・エラーを通知する。

## 関数仕様

### `sendMessage` 
- **役割:** ユーザーからの入力を受け取り、チャットセッションにメッセージを追加。共有モードの場合はキューに参加し、推論の順番を待つか直ちにブロードキャストを行う。
- **引数:**
  - `inputText`: `string` - ユーザーが入力したテキスト。
- **戻り値:** `Promise<void>`

### `stopGeneration`
- **役割:** 現在実行中の推論プロセスを中止し、UI状態を待機状態へ戻す。また、使用量ログにステータス `cancelled` として推論処理時間等を記録する。
- **引数:** なし
- **戻り値:** `void`

### `handleCancelQueue`
- **役割:** 自分がキューに入って順番待ちをしている状態（推論開始前）に、待機をキャンセルする。
- **引数:** なし
- **戻り値:** `Promise<void>`

### `runInferenceStream`
- **役割:** 実際の推論ストリーム処理を実行し、UIのチャットログを更新しながらレスポンスを表示する。推論開始時および終了時にそれぞれ `startGenerate`, `completeGenerate`, `abortGenerate` コールバックを呼び出して XState マシンの状態遷移を行う。また、共有モードにおけるユーザーメッセージおよびアシスタントメッセージのブロードキャスト成功時に、`updateLastPolledMsgId` を呼び出して即座に自身の同期カーソルを前進させ、メッセージの重複受信を防ぐ。推論完了またはエラー終了時に `logUsage` を呼び出して使用量を記録する。また、`finally` ブロックでは `completeQueue` の非同期待ちを行う前に、同期的に `myJobId` および `pendingMessage` のクリア（クリーンアップ）を行うことで、完了中の重複発火バグを回避する。さらに、Ollamaのストリーム接続において、受信したテキストパケットを行バッファリングで制御し、不完全に分割されたJSONL行を結合パースすることで情報の欠落を防止する。
- **引数:**
  - `jobId`: `string` - 実行対象のジョブID。
- **戻り値:** `Promise<void>`
