/**
 * DDO Saba - E2E Integration Test Suite
 *
 * 実環境（起動中のサーバー）に対して実行する統合テスト。
 * Nginx（ポート8088）経由でのOllama API、およびブロードキャストサーバーAPIを網羅する。
 *
 * 実行前提条件:
 *   1. Nginx が起動していること（ポート8088）
 *   2. PowerShell ブロードキャストサーバーが起動していること（ポート8089）
 *   3. Ollama が起動していること（ポート11434）
 *   4. 環境変数 DDO_TOKEN にトークンを設定するか、デフォルト値を書き換えること
 *
 * 実行方法:
 *   npm run test:e2e
 *   または
 *   DDO_TOKEN=yourtoken node scripts/test_e2e_integration.js
 *
 * スキップ可能なテスト:
 *   環境変数 SKIP_OLLAMA=1 を設定するとOllamaへの推論テスト（Test-5,6）をスキップ。
 *   推論テストはモデルのロード時間によって数分かかる場合がある。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 設定 ───────────────────────────────────────────────────────────────────
const NGINX_URL    = process.env.DDO_NGINX_URL    || 'http://127.0.0.1:8088';
const OLLAMA_URL   = process.env.DDO_OLLAMA_URL   || 'http://127.0.0.1:11434';
const ACCESS_TOKEN = process.env.DDO_TOKEN        || '1234567890abcdef1234567890abcdef';
const SKIP_OLLAMA  = process.env.SKIP_OLLAMA === '1';

// ─── ユーティリティ ─────────────────────────────────────────────────────────
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

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const results = [];

function pass(name) {
  passCount++;
  results.push({ status: 'PASS', name });
  console.log(c('green', `  ✓ PASS`) + ` ${name}`);
}

function fail(name, err) {
  failCount++;
  results.push({ status: 'FAIL', name, error: err.message });
  console.error(c('red', `  ✗ FAIL`) + ` ${name}`);
  console.error(c('gray',  `         ${err.message}`));
}

function skip(name, reason) {
  skipCount++;
  results.push({ status: 'SKIP', name });
  console.log(c('yellow', `  - SKIP`) + ` ${name}` + c('gray', `  (${reason})`));
}

function section(title) {
  console.log(`\n${c('cyan', '─'.repeat(50))}`);
  console.log(c('bold', ` ${title}`));
  console.log(c('cyan', '─'.repeat(50)));
}

/**
 * Nginx経由のリクエストを送るヘルパー。
 * @param {string} endpoint - /api/... 形式のパス
 * @param {object} opts - fetchオプション
 * @param {boolean} withToken - X-DDO-Tokenヘッダーを付けるか
 */
async function req(endpoint, opts = {}, withToken = true) {
  let activeUsername = 'E2ETestBot';
  if (opts.body) {
    try {
      const parsedBody = JSON.parse(opts.body);
      if (parsedBody.sender) {
        activeUsername = parsedBody.sender;
      } else if (parsedBody.username) {
        activeUsername = parsedBody.username;
      }
    } catch (e) {
      // Ignore JSON parse error
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(withToken ? { 
      'X-DDO-Token': ACCESS_TOKEN,
      'X-DDO-Client-Id': `e2e-test-client-id_${encodeURIComponent(activeUsername)}`,
      'X-DDO-Username': encodeURIComponent(activeUsername)
    } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${NGINX_URL}${endpoint}`, {
    ...opts,
    headers,
  });
  return res;
}

/**
 * ストリーミングレスポンス（NDJSON）を全行収集して返す。
 * @param {Response} res - fetchのResponse
 * @returns {Promise<object[]>} - 各行をパースしたオブジェクトの配列
 */
async function collectNDJSON(res) {
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line); }
      catch { return { raw: line }; }
    });
}

// ─── テスト群 ────────────────────────────────────────────────────────────────

/**
 * Section A: Nginx 認証レイヤーのテスト
 * Nginxの map ディレクティブによるトークン検証が正しく機能しているか確認する。
 */
async function testSection_A_Auth() {
  section('A. Nginx 認証レイヤー');

  // A-1: トークンなしで /api/tags にアクセス → 403 が返ること
  try {
    const res = await req('/api/tags', {}, false);
    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}. トークンなしでアクセスできてしまっている`);
    }
    pass('A-1: トークンなし → 403 Forbidden が返る');
  } catch (e) {
    fail('A-1: トークンなし → 403 Forbidden が返る', e);
  }

  // A-2: 不正なトークンで /api/tags にアクセス → 403 が返ること
  try {
    const res = await req('/api/tags', { headers: { 'X-DDO-Token': 'wrong_token_xxx' } }, false);
    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}. 不正なトークンでアクセスできてしまっている`);
    }
    pass('A-2: 不正なトークン → 403 Forbidden が返る');
  } catch (e) {
    fail('A-2: 不正なトークン → 403 Forbidden が返る', e);
  }

  // A-3: 正しいトークンで /api/tags にアクセス → 200 が返ること
  try {
    const res = await req('/api/tags');
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}.`);
    }
    pass('A-3: 正しいトークン → 200 OK が返る（認証通過）');
  } catch (e) {
    fail('A-3: 正しいトークン → 200 OK が返る（認証通過）', e);
  }
}

/**
 * Section B: Ollama システムステータス API のテスト
 * Nginx経由でOllamaの情報系エンドポイントが正しくプロキシされているか確認する。
 */
async function testSection_B_OllamaStatus() {
  section('B. Ollama システムステータス API（Nginx経由）');

  // B-1: /api/tags でモデル一覧が取得できること
  try {
    const res = await req('/api/tags');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.models)) {
      throw new Error(`"models" フィールドが配列でない。実際の値: ${JSON.stringify(data)}`);
    }
    const modelNames = data.models.map(m => m.name || m.model || '(unnamed)');
    console.log(c('gray', `         検出されたモデル数: ${modelNames.length} 件`));
    if (modelNames.length > 0) {
      console.log(c('gray', `         モデル例: ${modelNames.slice(0, 3).join(', ')}`));
    }
    pass('B-1: /api/tags → モデル一覧が取得できる');
  } catch (e) {
    fail('B-1: /api/tags → モデル一覧が取得できる', e);
  }

  // B-2: /api/ps で現在のロード状態が取得できること
  try {
    const res = await req('/api/ps');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.models)) {
      throw new Error(`"models" フィールドが配列でない。実際の値: ${JSON.stringify(data)}`);
    }
    const loaded = data.models.map(m => m.name || m.model || '(unnamed)');
    console.log(c('gray', `         現在ロード中のモデル数: ${loaded.length} 件`));
    if (loaded.length > 0) {
      console.log(c('gray', `         ロード中: ${loaded.join(', ')}`));
    }
    pass('B-2: /api/ps → 現在のモデルロード状態が取得できる');
  } catch (e) {
    fail('B-2: /api/ps → 現在のモデルロード状態が取得できる', e);
  }
}

/**
 * Section C: Ollama 推論 API のテスト
 * 実際にモデルへのリクエストを送る。SKIP_OLLAMA=1 でスキップ可能。
 */
async function testSection_C_OllamaInference() {
  section('C. Ollama 推論 API（Nginx経由 / 実推論）');

  if (SKIP_OLLAMA) {
    skip('C-1: /api/generate プリロードリクエスト', 'SKIP_OLLAMA=1');
    skip('C-2: /api/chat ストリーミング推論', 'SKIP_OLLAMA=1');
    return;
  }

  // まずモデル一覧を取得してテスト対象モデルを選定する
  let targetModel = null;
  try {
    const res = await req('/api/tags');
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      // 最もサイズの小さいモデルを選ぶ（高速テストのため）
      const sorted = [...data.models].sort((a, b) => (a.size || 0) - (b.size || 0));
      targetModel = sorted[0].name || sorted[0].model;
    }
  } catch {
    // タグ取得に失敗してもスキップで続行
  }

  if (!targetModel) {
    skip('C-1: /api/generate プリロードリクエスト', 'Ollamaにモデルが1つも登録されていない');
    skip('C-2: /api/chat ストリーミング推論', 'Ollamaにモデルが1つも登録されていない');
    return;
  }

  console.log(c('gray', `         テスト対象モデル: ${targetModel}`));

  // C-1: /api/generate でモデルのプリロードリクエストが通ること
  //      keep_alive: "0s" でプリロード後すぐアンロードさせる
  try {
    const res = await req('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: targetModel,
        prompt: '',
        keep_alive: 0,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    pass(`C-1: /api/generate → プリロードリクエスト成功 (model: ${targetModel})`);
  } catch (e) {
    fail(`C-1: /api/generate → プリロードリクエスト成功 (model: ${targetModel})`, e);
  }

  // C-2: /api/chat でストリーミング推論が流れてくること
  //      最短応答のためのシンプルなプロンプト、stream: true
  try {
    const res = await req('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        stream: true,
        options: {
          num_predict: 5,   // 最大5トークンで打ち切り
          temperature: 0,
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const chunks = await collectNDJSON(res);
    if (chunks.length === 0) {
      throw new Error('ストリーミングレスポンスが空だった');
    }

    // 最終チャンクに done: true が含まれているか確認
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.done !== true) {
      throw new Error(`最終チャンクに done:true がない。実際: ${JSON.stringify(lastChunk)}`);
    }

    const fullText = chunks
      .filter(c => c.message?.content)
      .map(c => c.message.content)
      .join('');
    console.log(c('gray', `         受信チャンク数: ${chunks.length} / 生成テキスト: "${fullText.trim()}"`));
    pass(`C-2: /api/chat → ストリーミング推論が正常に完了 (${chunks.length} chunks)`);
  } catch (e) {
    fail('C-2: /api/chat → ストリーミング推論が正常に完了', e);
  }
}

/**
 * Section D: ブロードキャストサーバー API のテスト
 * PowerShell サーバー（ポート8089）へのNginxプロキシが正しく機能しているか確認する。
 */
async function testSection_D_BroadcastServer() {
  section('D. ブロードキャストサーバー API（Nginx経由）');

  // D-1: /api/history が配列を返すこと
  try {
    const res = await req('/api/history');
    if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) {
      pass('D-1: /api/history → 204 No Content（空の履歴、正常）');
    } else {
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error(`配列が返ってこない。実際: ${JSON.stringify(data)}`);
      console.log(c('gray', `         現在の履歴件数: ${data.length} 件`));
      pass('D-1: /api/history → 履歴配列が取得できる');
    }
  } catch (e) {
    fail('D-1: /api/history → 履歴/空のレスポンスが取得できる', e);
  }

  // D-2: /api/poll が応答すること（since_idヘッダーありで新規メッセージなし → 204）
  try {
    const res = await req('/api/poll', {
      headers: { 'X-DDO-Since-Id': 'nonexistent_id_' + Date.now() },
    });
    // 204（新着なし）または200（何か返ってきた）どちらでもOK
    if (res.status !== 204 && res.status !== 200) {
      throw new Error(`Expected 200 or 204, got ${res.status}`);
    }
    const activeCountHeader = res.headers.get('X-DDO-Active-Count');
    console.log(c('gray', `         X-DDO-Active-Count: ${activeCountHeader ?? '(ヘッダーなし)'}`));
    pass(`D-2: /api/poll → 正常応答 (HTTP ${res.status})`);
  } catch (e) {
    fail('D-2: /api/poll → 正常応答', e);
  }

  // D-3: /api/broadcast に POST してメッセージを送信 → history に反映されること
  try {
    const testMsgId = `e2e_test_msg_${Date.now()}`;
    const postRes = await req('/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        id:          testMsgId,
        sender:      'E2ETestBot',
        broadcaster: 'E2ETestBot',
        role:        'user',
        content:     'E2E Integration Test Message',
      }),
    });
    if (!postRes.ok) throw new Error(`POST /api/broadcast: HTTP ${postRes.status}`);

    // /api/history から該当IDのメッセージを探す
    const histRes = await req('/api/history');
    if (!histRes.ok && histRes.status !== 204) throw new Error(`GET /api/history: HTTP ${histRes.status}`);

    if (histRes.status === 204) {
      throw new Error('/api/history が 204 を返した（ブロードキャスト後なのに空）');
    }

    const history = await histRes.json();
    const found = history.find(m => m.id === testMsgId);
    if (!found) {
      throw new Error(`送信したメッセージID(${testMsgId})が履歴に見つからない`);
    }
    if (found.content !== 'E2E Integration Test Message') {
      throw new Error(`content不一致。実際: "${found.content}"`);
    }
    pass('D-3: /api/broadcast POST → /api/history に即時反映される');
  } catch (e) {
    fail('D-3: /api/broadcast POST → /api/history に即時反映される', e);
  }

  // D-4: /api/model GET/POST サイクルが正しく動くこと
  try {
    const testModel = 'e2e-test-model:latest';
    const ts = Date.now();

    const postRes = await req('/api/model', {
      method: 'POST',
      body: JSON.stringify({
        sender:          'E2ETestBot',
        model:           testModel,
        timestamp:       ts,
        isGenerating:    false,
        generatingText:  '',
      }),
    });
    if (!postRes.ok) throw new Error(`POST /api/model: HTTP ${postRes.status}`);

    const getRes = await req('/api/model');
    if (!getRes.ok && getRes.status !== 204) throw new Error(`GET /api/model: HTTP ${getRes.status}`);

    if (getRes.status === 204) {
      throw new Error('POST直後なのに /api/model が 204 を返した');
    }

    const modelData = await getRes.json();
    if (modelData.model !== testModel) {
      throw new Error(`model不一致。Expected: "${testModel}", Got: "${modelData.model}"`);
    }
    if (modelData.sender !== 'E2ETestBot') {
      throw new Error(`sender不一致。Expected: "E2ETestBot", Got: "${modelData.sender}"`);
    }
    pass('D-4: /api/model POST→GET サイクル → モデル同期が正確に動く');
  } catch (e) {
    fail('D-4: /api/model POST→GET サイクル → モデル同期が正確に動く', e);
  }
}

/**
 * Section E: キューイングシステムのテスト
 * 推論ロックの競合制御（先着順キュー）が正しく機能しているか確認する。
 */
async function testSection_E_Queue() {
  section('E. キューイングシステム（推論ロック制御）');

  // まずキューをクリーンアップ
  try {
    const queueRes = await req('/api/queue');
    if (queueRes.ok && queueRes.status !== 204) {
      const queue = await queueRes.json();
      for (const job of queue) {
        await req('/api/queue', {
          method: 'POST',
          body: JSON.stringify({ action: 'complete', id: job.id }),
        });
      }
    }
  } catch {
    // クリーンアップ失敗は無視
  }

  // E-1: Aliceがキューに参加 → status: running になること
  const aliceId = `e2e_alice_${Date.now()}`;
  try {
    await req('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', id: aliceId, username: 'Alice' }),
    });

    const queueRes = await req('/api/queue');
    if (!queueRes.ok && queueRes.status !== 204) throw new Error(`GET /api/queue: HTTP ${queueRes.status}`);

    const queue = queueRes.status === 204 ? [] : await queueRes.json();
    const aliceJob = queue.find(j => j.id === aliceId);
    if (!aliceJob) throw new Error('AliceのジョブがQueueに存在しない');
    if (aliceJob.status !== 'running') {
      throw new Error(`Aliceのステータスが "running" でない。実際: "${aliceJob.status}"`);
    }
    pass('E-1: Alice がキューに参加 → status: running になる（先頭で即実行）');
  } catch (e) {
    fail('E-1: Alice がキューに参加 → status: running になる', e);
  }

  // E-2: Bobが後から参加 → status: waiting になること
  const bobId = `e2e_bob_${Date.now()}`;
  try {
    await req('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', id: bobId, username: 'Bob' }),
    });

    const queueRes = await req('/api/queue');
    if (!queueRes.ok && queueRes.status !== 204) throw new Error(`GET /api/queue: HTTP ${queueRes.status}`);

    const queue = queueRes.status === 204 ? [] : await queueRes.json();
    const bobJob = queue.find(j => j.id === bobId);
    if (!bobJob) throw new Error('BobのジョブがQueueに存在しない');
    if (bobJob.status !== 'waiting') {
      throw new Error(`Bobのステータスが "waiting" でない。実際: "${bobJob.status}"`);
    }
    pass('E-2: Bob が後から参加 → status: waiting になる（ロック待ち）');
  } catch (e) {
    fail('E-2: Bob が後から参加 → status: waiting になる', e);
  }

  // E-3: Aliceが完了 → Bobが自動プロモートされること
  try {
    await req('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ action: 'complete', id: aliceId, username: 'Alice' }),
    });

    const queueRes = await req('/api/queue');
    if (!queueRes.ok && queueRes.status !== 204) throw new Error(`GET /api/queue: HTTP ${queueRes.status}`);

    const queue = queueRes.status === 204 ? [] : await queueRes.json();
    const bobPromoted = queue.find(j => j.id === bobId);
    if (!bobPromoted) throw new Error('AliceのComplete後、BobのジョブがQueueから消えた');
    if (bobPromoted.status !== 'running') {
      throw new Error(`Bob が自動プロモートされていない。実際: "${bobPromoted.status}"`);
    }
    pass('E-3: Alice が complete → Bob が自動プロモートされ status: running になる');
  } catch (e) {
    fail('E-3: Alice が complete → Bob が自動プロモートされる', e);
  }

  // E-4: Bobも完了 → キューが空になること
  try {
    await req('/api/queue', {
      method: 'POST',
      body: JSON.stringify({ action: 'complete', id: bobId, username: 'Bob' }),
    });

    const queueRes = await req('/api/queue');
    // 204（空）または 200 で空配列どちらでもOK
    if (queueRes.status === 204) {
      pass('E-4: Bob が complete → キューが空（204 No Content）');
      return;
    }
    if (!queueRes.ok) throw new Error(`GET /api/queue: HTTP ${queueRes.status}`);

    const queue = await queueRes.json();
    if (queue.length !== 0) {
      throw new Error(`キューに残留ジョブがある。残数: ${queue.length}`);
    }
    pass('E-4: Bob が complete → キューが空になる');
  } catch (e) {
    fail('E-4: Bob が complete → キューが空になる', e);
  }
}

/**
 * Section F: トークン使用量ロギング（CSV）のテスト
 * /api/usage へのPOSTがdata/token_usage.csvに書き込まれることを確認する。
 */
async function testSection_F_UsageLogging() {
  section('F. トークン使用量ロギング（CSV）');

  const testPayload = {
    model:              'e2e-test-model:latest',
    promptTokens:       42,
    completionTokens:   99,
    totalDurationSec:   7.77,
    loadDurationSec:    0.11,
    evalDurationSec:    7.66,
    status:             'success',
  };

  // F-1: /api/usage への POST が成功すること
  try {
    const res = await req('/api/usage', {
      method: 'POST',
      body: JSON.stringify(testPayload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    pass('F-1: /api/usage POST → 正常応答');
  } catch (e) {
    fail('F-1: /api/usage POST → 正常応答', e);
    return; // CSVテストはF-1が通らないと意味ないのでここで打ち切る
  }

  // F-2: 書き込まれたCSVに送信データが含まれること
  try {
    const csvPath = path.join(__dirname, '../../data/token_usage.csv');
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSVファイルが存在しない: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1];

    // モデル名とトークン数・ステータスの存在確認
    if (!lastLine.includes('e2e-test-model')) {
      throw new Error(`CSVの最終行にモデル名が含まれていない。最終行: "${lastLine}"`);
    }
    if (!lastLine.includes('42') || !lastLine.includes('99')) {
      throw new Error(`CSVの最終行にpromptTokens/completionTokensが含まれていない。最終行: "${lastLine}"`);
    }
    if (!lastLine.includes('success')) {
      throw new Error(`CSVの最終行にstatusが含まれていない。最終行: "${lastLine}"`);
    }

    console.log(c('gray', `         CSV最終行: ${lastLine}`));
    pass('F-2: token_usage.csv → 送信データが正確に書き込まれている');
  } catch (e) {
    fail('F-2: token_usage.csv → 送信データが正確に書き込まれている', e);
  }
}

// ─── メインエントリ ───────────────────────────────────────────────────────────
async function main() {
  console.log(c('cyan', '╔══════════════════════════════════════════════════╗'));
  console.log(c('cyan', '║') + c('bold', '   DDO Saba - E2E Integration Test Suite          ') + c('cyan', '║'));
  console.log(c('cyan', '╚══════════════════════════════════════════════════╝'));
  console.log(c('gray', `  Nginx URL   : ${NGINX_URL}`));
  console.log(c('gray', `  Ollama URL  : ${OLLAMA_URL}`));
  console.log(c('gray', `  Skip Ollama : ${SKIP_OLLAMA ? 'YES' : 'NO'}`));

  // サーバーの起動確認（プリフライトチェック）
  console.log(`\n${c('yellow', '  Preflight: サーバー起動確認中...')}`);
  try {
    const res = await fetch(`${NGINX_URL}/api/tags`, {
      headers: { 'X-DDO-Token': ACCESS_TOKEN },
    });
    // 200 or 403（トークン不正）どちらでもNginxが起動中と判断
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(`Nginx起動済みだがバックエンドが応答しない (HTTP ${res.status})`);
    }
    console.log(c('green', `  Nginx is up (HTTP ${res.status})`));
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
      console.error(c('red', `\n  [ERROR] Nginxに接続できない (${NGINX_URL})`));
      console.error(c('red', `  サーバーを起動してから再実行してください。`));
      console.error(c('gray', `  Windows: start_server.bat`));
      process.exit(1);
    }
    console.error(c('yellow', `  [WARN] プリフライト: ${e.message}`));
  }

  const start = Date.now();

  await testSection_A_Auth();
  await testSection_B_OllamaStatus();
  await testSection_C_OllamaInference();
  await testSection_D_BroadcastServer();
  await testSection_E_Queue();
  await testSection_F_UsageLogging();

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  // ─── 結果サマリー ─────────────────────────────────────────────────────────
  console.log(`\n${c('cyan', '═'.repeat(52))}`);
  console.log(c('bold', ' Test Results Summary'));
  console.log(c('cyan', '═'.repeat(52)));

  const maxLen = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    const badge =
      r.status === 'PASS' ? c('green', ' PASS ') :
      r.status === 'SKIP' ? c('yellow', ' SKIP ') :
      c('red', ' FAIL ');
    const padding = ' '.repeat(Math.max(0, maxLen - r.name.length));
    console.log(` [${badge}] ${r.name}${padding}${r.error ? c('gray', `  → ${r.error}`) : ''}`);
  }

  console.log(c('cyan', '─'.repeat(52)));
  console.log(
    c('bold', ` Total: ${results.length} tests`) +
    `  ${c('green', `${passCount} passed`)}` +
    (failCount  > 0 ? `  ${c('red',    `${failCount} failed`)}` : '') +
    (skipCount  > 0 ? `  ${c('yellow', `${skipCount} skipped`)}` : '') +
    `  ${c('gray', `(${elapsed}s)`)}`
  );
  console.log(c('cyan', '═'.repeat(52)));

  if (failCount > 0) {
    console.error(`\n${c('red', '  一部のテストが失敗しました。上記のエラーを確認してください。')}`);
    process.exit(1);
  } else {
    console.log(`\n${c('green', '  全テスト通過！お疲れ様です。')}`);
  }
}

main();
