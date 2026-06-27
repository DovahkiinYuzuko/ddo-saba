/**
 * DDO Saba - Queue System CI Integration Test
 * 
 * このスクリプトは、実際のPowerShellブロードキャストサーバーを自動でバックグラウンド起動し、
 * 複数の仮想クライアント（Alice, Bob）を用いてキューの並行ロック・プロモート・クリーンアップ動作を
 * 実通信で自動検証した後、サーバーを安全に自動シャットダウンする自律型テストスクリプトです。
 * 
 * 実行方法:
 *   node scripts/test_queue_integration.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const PORT = '8095'; // テスト用の空きポートを使用
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

async function req(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-DDO-Token': TOKEN,
    'X-DDO-Username': 'TestRunner',
    'X-DDO-Client-Id': 'TestRunnerClient'
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
  console.log(c('cyan', '║') + c('bold', '   DDO Saba - Queue Auto CI Integration Test      ') + c('cyan', '║'));
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
    console.log(c('gray', `  [Server Stdout] ${data.toString().trim()}`));
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(c('red', `  [Server Error] ${data.toString().trim()}`));
  });

  let isServerUp = false;
  // 最大15回、接続リトライ
  for (let i = 1; i <= 15; i++) {
    await sleep(600);
    try {
      // キューAPIを叩いて応答を確認
      await req('/api/queue');
      isServerUp = true;
      console.log(c('green', `  ✓ サーバー起動確認成功 (HTTP 200/204 on /api/queue)`));
      break;
    } catch (e) {
      process.stdout.write(c('gray', '.'));
    }
  }

  if (!isServerUp) {
    console.error(c('red', '\n  [FAIL] サーバーの自動起動に失敗しました。プロセスを終了します。'));
    serverProcess.kill('SIGKILL');
    process.exit(1);
  }

  console.log(`\n${c('yellow', '  [2/4] キュー動作シナリオテストを開始します。')}`);

  try {
    // シナリオ-1: 初期状態でキューが空であることを確認
    const initialQueue = await req('/api/queue');
    if (initialQueue && initialQueue.length > 0) {
      throw new Error(`初期状態でキューが空ではありません。残数: ${initialQueue.length}`);
    }
    console.log(c('green', '  ✓ シナリオ-1: 初期キューの空状態を確認しました。'));

    // シナリオ-2: Aliceがキューに参加 (ID: alice_test)
    const aliceId = 'alice_test';
    console.log(c('gray', '         Aliceがキューに参加します...'));
    await req('/api/queue', 'POST', { action: 'join', id: aliceId, username: 'Alice' });

    const qAfterAlice = await req('/api/queue');
    const aliceJob = qAfterAlice.find(j => j.id === aliceId);
    if (!aliceJob) throw new Error('Aliceのジョブがキューに登録されていません。');
    if (aliceJob.status !== 'running') {
      throw new Error(`Aliceのジョブ状態が running ではありません。実際: ${aliceJob.status}`);
    }
    console.log(c('green', '  ✓ シナリオ-2: Aliceがキューの先頭に参加し、即座に running になりました。'));

    // シナリオ-3: Bobがキューに参加 (ID: bob_test) - 待機状態になるべき
    const bobId = 'bob_test';
    console.log(c('gray', '         Bobがキューに参加します...'));
    await req('/api/queue', 'POST', { action: 'join', id: bobId, username: 'Bob' });

    const qAfterBob = await req('/api/queue');
    const bobJob = qAfterBob.find(j => j.id === bobId);
    if (!bobJob) throw new Error('Bobのジョブがキューに登録されていません。');
    if (bobJob.status !== 'waiting') {
      throw new Error(`Bobのジョブ状態が waiting ではありません。実際: ${bobJob.status}`);
    }
    console.log(c('green', '  ✓ シナリオ-3: Bobがキューに追加され、ロック競合のため正常に waiting になりました。'));

    // シナリオ-4: Aliceが生成完了 (ID: alice_test) -> Bobが自動的に running に昇格すること
    console.log(c('gray', '         Aliceのジョブを完了(complete)します...'));
    await req('/api/queue', 'POST', { action: 'complete', id: aliceId, username: 'Alice' });

    const qAfterAliceComplete = await req('/api/queue');
    const bobPromotedJob = qAfterAliceComplete.find(j => j.id === bobId);
    if (!bobPromotedJob) throw new Error('Aliceの完了後、Bobのジョブがキューから消えてしまいました。');
    if (bobPromotedJob.status !== 'running') {
      throw new Error(`Bobのジョブが自動昇格していません。実際: ${bobPromotedJob.status}`);
    }
    console.log(c('green', '  ✓ シナリオ-4: Aliceの完了に伴い、Bobが自動的に running へプロモートされました。'));

    // シナリオ-5: Bobが完了 -> キューが空になること
    console.log(c('gray', '         Bobのジョブを完了します...'));
    await req('/api/queue', 'POST', { action: 'complete', id: bobId, username: 'Bob' });

    const finalQueue = await req('/api/queue');
    if (finalQueue && finalQueue.length > 0) {
      throw new Error(`すべてのジョブが完了したにも関わらず、キューが空ではありません。残数: ${finalQueue.length}`);
    }
    console.log(c('green', '  ✓ シナリオ-5: すべてのジョブ完了後、キューが完全に空になりました。'));

    console.log(`\n${c('green', '  [SUCCESS] すべてのキューシナリオテストに合格しました！')}`);

  } catch (err) {
    console.error(`\n${c('red', `  [FAIL] テストシナリオ中にエラーが発生しました: ${err.message}`)}`);
    // テスト失敗時はエラーコードで終了
    process.exitCode = 1;
  } finally {
    // 4. サーバープロセスの終了処理
    console.log(`\n${c('yellow', '  [4/4] 起動したPowerShellサーバーをシャットダウン中...')}`);
    try {
      // Windows環境で確実に子プロセスツリーを殺すために taskkill を使用
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
      console.log(c('green', '  ✓ サーバープロセスを正常にクローズしました。'));
    } catch (e) {
      serverProcess.kill('SIGKILL');
    }
  }
}

main();
