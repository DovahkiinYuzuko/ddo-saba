# DDO Saba (誰でもOllamaオンラインサーバー) / DDO Saba (Ollama Online Server for Everyone)

Ollamaを安全にオンライン公開し、複数クライアントでリアルタイム同期・共同利用するためのWebUIおよびプロキシゲートウェイ / Web UI and proxy gateway to securely publish Ollama online for real-time synchronization and collaborative use across multiple clients.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE.MIT)

[日本語](#日本語) | [English](#english)

## 日本語

### 概要
DDO Sabaは、ローカル環境で動作するOllamaの推論サーバーを、安全にインターネット上に公開して複数人で共同利用するためのWebクライアントUIおよびリバースプロキシシステムです。セキュリティ保護、並列推論アクセスの制御、およびリアルタイムでのクライアント間同期に特化しており、簡単な操作で安全なオンライン推論サーバー環境を構築できます。

### 主な機能
- **安全なオンライン公開と自動セットアップ**: 
  - NginxによるBearerトークン認証とカスタムヘッダー認証（`X-DDO-Token`）に対応しています。
  - 起動スクリプトを実行するだけで、実行環境（x86_64, arm64等）に適した `cloudflared` を自動ダウンロードし、Cloudflare Tunnelを自動的に構成して一時パブリックURL（`https://*.trycloudflare.com`）を発行します。
  - トンネルが確立されると、認証トークンを自動で付加したURL（`https://*.trycloudflare.com?token=xxx`）をコンソールに出力し、対応プラットフォームであればブラウザで自動起動します。
  - 認証トークンが未定義の場合は、OpenSSLやPythonを用いて32文字のセキュアなランダムヘックストークンを自動生成します。
- **OpenAI互換APIプロキシ**: 
  - Nginx経由で `/v1/` エンドポイントを公開しており、認証を通すことで、Continue等の外部エディタ拡張機能やOpenAI互換APIに対応した各種アプリケーションから安全に接続して利用できます。
- **共有部屋モード（Shared Room Mode）**:
  - **リアルタイム・パラメータ同期**: 接続している全クライアント間で、LLMの生成パラメータ（温度、最小P、Top P、Top K、Reasoning Mode、Collapse Thinking Processなど）をリアルタイムに同期します。
  - **自動プロモート機能付き推論キュー制御**: Ollamaサーバーへの同時アクセスによるVRAMハングや高負荷を防ぐため、リクエストを一時的にキューに収容します。先行するユーザーの推論が完了またはキャンセルされると、待機中のユーザーが自動的にプロモート（生成開始）されます。
  - **キューのタイムアウト・自動イジェクト**: 一定時間（デフォルト120秒、クライアントヘッダーで動的に変更可能）応答のない実行中ジョブをキューから自動的に排除し、システムのデッドロックを防止します。
  - **アクティブ接続数カウント**: クライアントのポーリング状況を監視し、10秒以上応答のない無効な接続を自動クリーンアップした上で、リアルタイムの接続人数（`X-DDO-Active-Count`）を算出・表示します。
  - **タブ同期**: 共有されている部屋の中で、新しく作成されたタブ、削除されたタブ、および現在選択されているアクティブタブの情報をリアルタイムに同期します。
- **詳細な推論ログ収集**:
  - 推論の完了時に、使用されたモデル名、プロンプトトークン数、出力トークン数、総推論時間、モデルロード時間、評価時間などをCSV形式（`data/token_usage.csv`）でローカルに自動記録します。
- **エラーハンドリング**:
  - 認証エラー（403 Forbidden）発生時でも、クライアント側でCORSエラーによるハングアップが発生しないよう、Nginxレベルで確実にCORSヘッダーを保証する設計となっています。
- **リッチなWebUI**:
  - Markdownレンダリング、KaTeXによる数式ブロック描画、およびソースコードのシンタックスハイライトに対応しています。

### 起動・実行手順

#### サーバーの起動
プロジェクトルートで `init_server.sh` (Linux) または `init_server.bat` (Windows) を使用してサーバーを起動します。

1. **対話型（インタラクティブ）モード**
   引数を指定せずに実行すると、ターミナル上にメニュー選択UIが表示されます。
   ```bash
   ./init_server.sh
   ```
   メニューから以下のオプションを選択して操作します。
   - `[1] Start Server` (サーバーの起動)
   - `[2] Stop Server` (サーバーの停止)
   - `[3] Restart Server` (サーバーの再起動)
   - `[4] Server Status` (サーバーの動作状況確認)
   - `[5] Exit` (パネルの終了)

2. **コマンド直接実行モード**
   引数を渡すことで、特定の操作を直接実行できます。
   ```bash
   ./init_server.sh [command]
   ```
   利用可能なコマンドは以下の通りです。
   - `start`: すべてのDDO Sabaサーバー（Ollama, Nginx, 中継サーバー, Cloudflare Tunnel）を起動します。
   - `stop`: 実行中のサーバーをすべて停止し、一時ファイルをクリーンアップします。
   - `restart`: すべてのサーバーを停止した後に再起動します。
   - `status`: 各サーバープロセスの動作状況（稼働中か停止中か）を表示します。
   - `--help` / `-h` (Windowsの場合は `/?` も可): ヘルプメッセージを表示します。

#### 環境変数によるカスタマイズ
サーバー起動時に以下の環境変数を設定することで、動作を制御できます。
- `DDO_SABA_TOKEN`: クライアント接続用のアクセス認証トークンを固定します。未設定の場合は、起動時にセキュアなランダムトークンが自動生成されます。

#### 中継サーバーの個別起動とポート変更
中継サーバー（PowerShell Broadcast Server）を単体で起動する際、ポート番号を指定して起動できます。
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File bin/broadcast_server.ps1 [PortNumber]
```
*Note: デフォルトのポート番号は `8089` です。*

#### Web UIのビルドと起動
`web-ui` ディレクトリで依存関係をインストールし、本番用ビルドまたは開発サーバーを起動します。
```bash
cd web-ui
npm run build
```

#### テストの実行
- **Playwright E2Eテスト（ブラウザ統合検証）**:
  ```bash
  npm run test:e2e:browser
  ```
- **CI自動統合テスト（キュー・同期の自律動作検証）**:
  ```bash
  node scripts/test_autoci_integration.js
  ```

### LICENSE
このプロジェクトのライセンスはMITです。詳しくは[LICENSE.MIT](LICENSE.MIT)をお読みください。また、サードパーティライセンスはNOTICE.mdに表記してあります。

---

## English

### Overview
DDO Saba is a Web client UI and reverse proxy system designed to securely publish local Ollama inference servers online for multi-user collaboration. It specializes in security protection, concurrent inference access control, and real-time client-to-client synchronization, allowing you to build a secure online inference environment with simple operations.

### Key Features
- **Secure Online Publishing and Auto-Setup**: 
  - Supports Bearer token authentication and custom header authentication (`X-DDO-Token`) via Nginx.
  - Simply running the startup script automatically downloads the appropriate `cloudflared` binary for the environment (x86_64, arm64, etc.), configures a Cloudflare Tunnel, and issues a temporary public URL (`https://*.trycloudflare.com`).
  - Upon establishing the tunnel, outputs the URL with the authentication token automatically appended (`https://*.trycloudflare.com?token=xxx`) to the console and automatically launches the browser on supported platforms.
  - Automatically generates a 32-character secure random hex token using OpenSSL or Python if the access token is undefined.
- **OpenAI-Compatible API Proxy**: 
  - Exposes the `/v1/` endpoint through Nginx, enabling secure connections and utilization from external editor extensions like Continue or any application compatible with the OpenAI API.
- **Shared Room Mode**:
  - **Real-Time Parameter Sync**: Synchronizes LLM generation parameters (temperature, min P, Top P, Top K, Reasoning Mode, Collapse Thinking Process, etc.) in real-time across all connected clients.
  - **Inference Queue Control with Auto-Promotion**: Places requests into a temporary queue to prevent VRAM hangs and high load on the Ollama server caused by concurrent requests. When the preceding user's inference finishes or is canceled, the waiting user is automatically promoted (starts generation).
  - **Queue Timeout & Auto-Ejection**: Automatically ejects running jobs from the queue if they show no activity for a specified period (default 120 seconds, dynamically configurable via client headers), preventing system deadlocks.
  - **Active Connection Count**: Monitors client polling status, automatically cleans up inactive connections (no activity for 10+ seconds), and calculates/displays the real-time active user count (`X-DDO-Active-Count`).
  - **Tab Sync**: Synchronizes newly created tabs, deleted tabs, and the currently active tab selection in real-time across the shared room.
- **Detailed Inference Usage Logging**:
  - Automatically records the utilized model name, prompt tokens, completion tokens, total duration, model load duration, and evaluation duration in a CSV format (`data/token_usage.csv`) upon inference completion.
- **Error Handling**:
  - Designed to guarantee CORS headers at the Nginx level even on authentication errors (403 Forbidden), preventing client-side application hangs due to CORS issues.
- **Rich Web UI**:
  - Supports Markdown rendering, KaTeX math block drawing, and source code syntax highlighting.

### Setup and Execution

#### Server Management
Manage the servers using `init_server.sh` (Linux) or `init_server.bat` (Windows) at the project root.

1. **Interactive Control Panel Mode**
   Running the script without arguments starts the terminal-based menu UI.
   ```bash
   ./init_server.sh
   ```
   Select from the following menu options:
   - `[1] Start Server`
   - `[2] Stop Server`
   - `[3] Restart Server`
   - `[4] Server Status`
   - `[5] Exit`

2. **Direct Command Mode**
   Execute specific actions directly by passing arguments.
   ```bash
   ./init_server.sh [command]
   ```
   Available commands:
   - `start`: Starts all DDO Saba servers (Ollama, Nginx, Broadcast Server, Cloudflare Tunnel).
   - `stop`: Gracefully stops all running servers and cleans up temporary files.
   - `restart`: Stops all servers and restarts them.
   - `status`: Displays the current running/stopped status of each server process.
   - `--help` / `-h` (or `/?` on Windows): Displays the help message.

#### Customization via Environment Variables
Control the startup behavior by setting the following environment variables:
- `DDO_SABA_TOKEN`: Fixes the authentication token for client connections. If not set, a secure random token is automatically generated on startup.

#### Custom Port for Broadcast Server
You can specify a custom port number when starting the PowerShell Broadcast Server individually.
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File bin/broadcast_server.ps1 [PortNumber]
```
*Note: The default port number is `8089`.*

#### Build and Run Web UI
Install dependencies and build or run the development server in the `web-ui` directory.
```bash
cd web-ui
npm run build
```

#### Run Tests
- **Playwright E2E Tests (Browser Verification)**:
  ```bash
  npm run test:e2e:browser
  ```
- **CI Auto-Integration Tests (Autonomous Queue & Sync Verification)**:
  ```bash
  node scripts/test_autoci_integration.js
  ```

### LICENSE
The license for this project is MIT. For details, please read [LICENSE.MIT](LICENSE.MIT). Third-party licenses are also noted in NOTICE.md.
