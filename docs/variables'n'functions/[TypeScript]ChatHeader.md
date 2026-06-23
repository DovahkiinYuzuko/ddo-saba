# 概要
`ChatHeader` は、チャット画面の上部に表示されるヘッダー領域のコンポーネントである。モデルの選択、稼働状況の表示、VRAM解放ボタン、設定モーダルを開くボタンなどを提供する。

# プロパティ (Props)
- `activeModel`: `string` - 現在選択中のモデル名。
- `models`: `OllamaModelInfo[]` - サーバーから取得した利用可能なモデル一覧。
- `psInfo`: `PsModelInfo | null` - 現在VRAMにロードされているモデル情報。
- `activeUserCount`: `number` - 接続中のユーザー数。
- `isSharedMode`: `boolean` - 共有モードかどうかのフラグ。
- `isModelLoading`: `boolean` - モデルのロード中かどうか。
- `modelLoadError`: `string` - モデルロード時のエラーメッセージ。
- `lastModelSender`: `string` - 最後にモデルを変更したユーザーの名前。
- `username`: `string` - 自分のユーザー名。
- `onSelectModel`: `(modelName: string) => void` - モデル選択時のコールバック。
- `onUnloadModel`: `() => void` - モデルのVRAMアンロード時のコールバック。
- `onToggleSidebar`: `() => void` - サイドバー（チャットリスト）の開閉トグル。
- `onToggleParams`: `() => void` - パラメータパネルの開閉トグル。
- `onOpenSettings`: `() => void` - 設定モーダルを開く関数。
- `t`: `LocaleStrings` - 多言語対応辞書オブジェクト。

# 依存関係
```mermaid
graph TD
    A[ChatHeader] --> B(OllamaModelInfo)
    A --> C(PsModelInfo)
    A --> D(LocaleStrings)
```
