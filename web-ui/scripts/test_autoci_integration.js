/**
 * DDO Saba - Auto CI Dynamic Integration Test
 * 
 * このスクリプトは、PowerShellサーバーをバックグラウンド起動し、
 * 複数の仮想クライアント（Alice, Bob）のキュー制御、二重起動防止仕様、
 * メッセージおよびモデル状態同期、さらに動的タイムアウト（TTL）仕様を
 * 実通信で自律検証する統合テストスクリプトです。
 * 
 * 実行方法:
 *   node scripts/test_autoci_integration.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = '8097';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TOKEN = '1234567890abcdef1234567890abcdef';

const COLOR = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32;1m',
  red:    '\x1b[31;1m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
};

const c = (color, text) => `${COLOR[color]}${text}${COLOR.reset}`;

async function req(endpoint, method = 'GET', body = null, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-DDO-Token': TOKEN,
    'X-DDO-Username': 'CI_Runner',
    'X-DDO-Client-Id': 'CI_Runner_Client',
    ...extraHeaders
  };
  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(c('cyan', '╔══════════════════════════════════════════════════╗'));
  console.log(c('cyan', '║') + c('bold', '       DDO Saba - Dynamic Auto CI Integration     ') + c('cyan', '║'));
  console.log(c('cyan', '╚══════════════════════════════════════════════════╝'));

  const serverScript = path.resolve(__dirname, '../../bin/broadcast_server.ps1');
  console.log(c('gray', `  PowerShell Server Path: ${serverScript}`));
  console.log(c('gray', `  Testing Port          : ${PORT}`));

  // 1. PowerShellサーバーの自動起動
  console.log(`\n${c('yellow', '  [1/4] PowerShellブロードキャストサーバーを起動中...')}`);
  
  const serverProcess = spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', serverScript,
    PORT
  ], {
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    // console.log(c('gray', `  [Server Stdout] ${data.toString().trim()}`));
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(c('red', `  [Server Error] ${data.toString().trim()}`));
  });

  let isServerUp = false;
  for (let i = 1; i <= 15; i++) {
    await sleep(600);
    try {
      await req('/api/queue');
      isServerUp = true;
      console.log(c('green', `  ✓ サーバー起動確認成功`));
      break;
    } catch (e) {
      process.stdout.write(c('gray', '.'));
    }
  }

  if (!isServerUp) {
    console.error(c('red', '\n  [FAIL] サーバーの自動起動に失敗しました。'));
    serverProcess.kill('SIGKILL');
    process.exit(1);
  }

  console.log(`\n${c('yellow', '  [2/4] 共有モード同期およびキュー検証シナリオを開始します。')}`);

  try {
    // シナリオ-1: 初期状態
    const initialQueue = await req('/api/queue');
    if (initialQueue && initialQueue.length > 0) {
      throw new Error(`初期状態でキューが空ではありません。`);
    }
    console.log(c('green', '  ✓ シナリオ-1: 初期状態でキューが空であることを確認。'));

    // シナリオ-2: Aliceがキューに参加
    const aliceId = 'alice_ci_job';
    console.log(c('gray', '         Aliceがキューに参加します...'));
    await req('/api/queue', 'POST', { action: 'join', id: aliceId, username: 'Alice' });

    // 重複起動防止テスト (同じジョブIDで再送信)
    console.log(c('gray', '         Aliceが重複してキュー登録を試みます(重複ガード検証)...'));
    await req('/api/queue', 'POST', { action: 'join', id: aliceId, username: 'Alice' });

    const qAfterAlice = await req('/api/queue');
    if (qAfterAlice.length !== 1) {
      throw new Error(`重複キューガードが動作していません。キュー件数: ${qAfterAlice.length}`);
    }
    const aliceJob = qAfterAlice[0];
    if (aliceJob.id !== aliceId || aliceJob.status !== 'running') {
      throw new Error(`Aliceのジョブが正常に登録されていないか、runningではありません。`);
    }
    console.log(c('green', '  ✓ シナリオ-2: Aliceのキュー登録と重複ガードの正常動作を確認。'));

    // シナリオ-3: Bobがキューに参加 (waitingになること)
    const bobId = 'bob_ci_job';
    console.log(c('gray', '         Bobがキューに参加します...'));
    await req('/api/queue', 'POST', { action: 'join', id: bobId, username: 'Bob' });

    const qAfterBob = await req('/api/queue');
    const bobJob = qAfterBob.find(j => j.id === bobId);
    if (!bobJob || bobJob.status !== 'waiting') {
      throw new Error(`Bobが正常にwaiting状態になっていません。`);
    }
    console.log(c('green', '  ✓ シナリオ-3: Bobの待機登録を確認。'));

    // シナリオ-4: モデルおよびメッセージ同期の検証
    console.log(c('gray', '         Aliceが生成モデル状態をブロードキャストします...'));
    await req('/api/model', 'POST', {
      model: 'llama3',
      username: 'Alice',
      timestamp: Date.now(),
      isGenerating: true,
      generatingText: 'Thinking...'
    });

    console.log(c('gray', '         Bobがモデル状態を取得して検証します...'));
    const modelState = await req('/api/model');
    if (!modelState || modelState.username !== 'Alice' || modelState.isGenerating !== true) {
      throw new Error(`モデル状態の同期が正しく行われていません。`);
    }

    console.log(c('gray', '         Aliceがメッセージを送信します...'));
    const testMsgId = 'msg_test_123';
    await req('/api/broadcast', 'POST', {
      sender: 'Alice',
      broadcaster: 'Alice',
      role: 'user',
      content: 'Hello from Alice',
      id: testMsgId
    });

    console.log(c('gray', '         Bobがメッセージをポーリング受信します...'));
    const polledMsgs = await req('/api/poll');
    const foundMsg = polledMsgs.find(m => m.id === testMsgId);
    if (!foundMsg || foundMsg.content !== 'Hello from Alice') {
      throw new Error(`メッセージ同期が失敗しています。`);
    }
    console.log(c('green', '  ✓ シナリオ-4: モデル状態およびチャットメッセージの同期を確認。'));

    // シナリオ-5: Alice完了に伴うBobのプロモート
    console.log(c('gray', '         Aliceのジョブを完了します...'));
    await req('/api/queue', 'POST', { action: 'complete', id: aliceId, username: 'Alice' });

    const qAfterAliceComplete = await req('/api/queue');
    const bobPromoted = qAfterAliceComplete.find(j => j.id === bobId);
    if (!bobPromoted || bobPromoted.status !== 'running') {
      throw new Error(`Bobが自動的にrunning状態に昇格していません。`);
    }
    console.log(c('green', '  ✓ シナリオ-5: ジョブ完了および待機ジョブの自動昇格を確認。'));

    // シナリオ-6: 動的タイムアウト (TTL) 仕様の検証
    console.log(c('gray', '         TTLタイムアウトを検証します。1.5秒待機します...'));
    await sleep(1500); // 1.5秒待機
    
    console.log(c('gray', '         X-DDO-Queue-Timeout: 1 を付与してキュー取得(強制TTL判定)...'));
    // Timeoutを1秒に指定してGETリクエスト。Bobは1.5秒経過しているので自動削除されるはず。
    const qAfterTimeout = await req('/api/queue', 'GET', null, {
      'X-DDO-Queue-Timeout': '1'
    });

    if (qAfterTimeout && qAfterTimeout.length > 0) {
      throw new Error(`タイムアウトしたジョブが自動削除されていません。残数: ${qAfterTimeout.length}`);
    }
    console.log(c('green', '  ✓ シナリオ-6: X-DDO-Queue-Timeout ヘッダーによるジョブの動的TTL自動解除を確認。'));

    console.log(`\n${c('green', '  [SUCCESS] すべてのCI統合シナリオテストに合格しました！')}`);

  } catch (err) {
    console.error(`\n${c('red', `  [FAIL] テストシナリオ中にエラーが発生しました: ${err.message}`)}`);
    process.exitCode = 1;
  } finally {
    // 4. サーバープロセスのシャットダウン
    console.log(`\n${c('yellow', '  [4/4] 起動したPowerShellサーバーをシャットダウン中...')}`);
    try {
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
      console.log(c('green', '  ✓ サーバープロセスを正常にクローズしました。'));
    } catch (e) {
      serverProcess.kill('SIGKILL');
    }
  }
}

main();
