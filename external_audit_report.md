# External Audit Report (外部監査レポート)

このドキュメントは、モバイル環境（Pixel 8aのChrome等）におけるチャットUIのヘッダー見切れ・スクロールバグを他LLM（Grok、DeepSeek等）に提示し、根本的な解決策を得るためのレポートです。

---

## 1. Objective (目的)
スマートフォン（特にPixel 8aやiPhone等のモバイルブラウザ）でチャットUIを開いた際に、以下の挙動を完全に実現すること。
1. チャット画面のヘッダー（`.chat-header`）を画面上部に常に**固定表示**し、見切れることなく表示し続ける。
2. モバイル環境で画面全体の余計な縦スクロールが発生するのを防ぎ、メッセージ表示エリア（`.chat-messages-scroll`）のみをスクロール可能にする。

---

## 2. Approach (アプローチ内容)
これまでに実施したコード修正は以下の通りです。

### スタイルの修正 (`web-ui/src/components/ChatMessages.css`)
モバイル用のメディアクエリ（`@media (max-width: 1024px)`）内に以下の修正を行いました。
- `.chat-header` の高さを `auto`、`min-height: 60px` に設定し、`padding-top: calc(12px + env(safe-area-inset-top, 0px));` を追加してSafe Area（ステータスバーやノッチ）に対応。
- プルダウン（`.model-select`）が縮まないよう、親要素 `.model-selector-wrap` の `justify-content` を `flex-start` に変更し、`.model-select` の `max-width` を `240px` に拡張。
- アクションボタンの `gap` を `8px`、ボタンサイズを `32px` に拡張。

### レイアウトの親構造 (`web-ui/src/index.css` & `App.tsx`)
- `.app-container` に対して、モバイル時は以下が適用されています。
  ```css
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    position: relative;
    overflow: hidden;
  }
  ```
- `App.tsx` の末尾付近（`return`されるJSXの最後）にスクロール用のアカーポイントとして以下が設置されています。
  ```tsx
  <div ref={messagesEndRef} />
  ```
- メッセージ追加やアクティブチャット切り替え時に、以下のスクロール同期処理が実行されます。
  ```tsx
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);
  ```

---

## 3. Results (発生している問題・現象)
修正版をビルドしてモバイル環境でテストしたところ、以下の現象が発生しました。
1. アプリケーション読み込み直後に `App.tsx` 内の `messagesEndRef.current?.scrollIntoView` がトリガーされる。
2. スクロールターゲット（`messagesEndRef`）が `app-container` の外、またはチャットメッセージエリア外の最下部に定義されているため、**画面全体（ビューポート）が下方向に強制スクロール**されてしまう。
3. この結果、画面上部にあるヘッダー（`chat-header`）が上部にスクロールアウトし、画面から消えてしまう。
4. 全体コンテナに `overflow: hidden` が効いているため、またはモバイルブラウザのスクロール制御の影響により、ユーザーが手動で上にスワイプしても画面を上にスクロールして戻すことができず、ヘッダーにアクセスできない。

---

## 4. Trial History (試行履歴)
- **1回目のアプローチ (Safe Areaと要素の幅調整)**:
  - **内容**: `.chat-header` のSafe Area分のパディング追加、`height: auto` への変更、モデル選択ボックスの `max-width` 拡張。
  - **結果**: 要素個々の潰れやSafe Area不足による重なりは解消されたが、初期ロード時の `scrollIntoView` によって画面ごと下にずれてしまい、ヘッダーが消失し、上にスクロールして戻せない根本問題は未解決。

---

## 5. Request (解決への質問内容)
モバイル環境で画面全体がスクロールするのを防ぎ、かつメッセージエリアのみを綺麗にスクロールさせるための最適なCSSおよびJS（React）の構成（特に `scrollIntoView` の挙動やコンテナの高さ制限の正しいアプローチ）を提示してください。
