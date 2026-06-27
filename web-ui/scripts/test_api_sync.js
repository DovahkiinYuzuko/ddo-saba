const connectionUrl = 'http://127.0.0.1:8089';
const accessToken = '1234567890abcdef1234567890abcdef';

async function runTests() {
  console.log('\x1b[36m%s\x1b[0m', 'Starting API Sync Integration Tests...');

  // Helper for requests
  const request = async (path, method = 'GET', body = null, username = null, extraHeaders = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-DDO-Token': accessToken,
      ...extraHeaders
    };
    if (username) {
      headers['X-DDO-Username'] = username;
    }
    const res = await fetch(`${connectionUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} on ${method} ${path}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Model Sync
    // ----------------------------------------------------
    console.log('\nRunning Test 1: Model Synchronization...');
    const now = Date.now();
    await request('/api/model', 'POST', {
      sender: 'Alice',
      model: 'Gemma4-E4B-QAT-abliterated-Q4_K:latest',
      timestamp: now,
      isGenerating: false,
      generatingText: ''
    });

    const modelStatus = await request('/api/model', 'GET');
    if (modelStatus.model !== 'Gemma4-E4B-QAT-abliterated-Q4_K:latest') {
      throw new Error(`Model mismatch. Expected Gemma4..., got ${modelStatus.model}`);
    }
    if (modelStatus.sender !== 'Alice') {
      throw new Error(`Sender mismatch. Expected Alice, got ${modelStatus.sender}`);
    }
    console.log('\x1b[32m%s\x1b[0m', '✓ Test 1 Passed: Model Sync Success');

    // ----------------------------------------------------
    // TEST 2: Chat Message ID Sync
    // ----------------------------------------------------
    console.log('\nRunning Test 2: Message ID Sync...');
    const testMsgId = 'test_message_' + Date.now();
    await request('/api/broadcast', 'POST', {
      id: testMsgId,
      sender: 'Alice',
      broadcaster: 'Alice',
      role: 'user',
      content: 'Hello from Alice'
    });

    const history = await request('/api/history', 'GET');
    const myMsg = history.find(m => m.id === testMsgId);
    if (!myMsg) {
      throw new Error(`Message with ID ${testMsgId} not found in history`);
    }
    if (myMsg.content !== 'Hello from Alice') {
      throw new Error(`Message content mismatch. Got ${myMsg.content}`);
    }
    console.log('\x1b[32m%s\x1b[0m', '✓ Test 2 Passed: Message ID sync preserved successfully');

    // ----------------------------------------------------
    // TEST 3: Concurrency Queue & Lock
    // ----------------------------------------------------
    console.log('\nRunning Test 3: Concurrency Queue Lock & Promotion...');
    
    // Clear queue if any leftover
    let queue = await request('/api/queue', 'GET');
    for (const job of queue) {
      await request('/api/queue', 'POST', { action: 'complete', id: job.id });
    }

    // Alice joins queue
    const aliceJobId = 'job_alice_' + Date.now();
    await request('/api/queue', 'POST', { action: 'join', id: aliceJobId, username: 'Alice' });
    
    // Bob joins queue
    const bobJobId = 'job_bob_' + Date.now();
    await request('/api/queue', 'POST', { action: 'join', id: bobJobId, username: 'Bob' });

    // Check queue status
    queue = await request('/api/queue', 'GET');
    const aliceJob = queue.find(j => j.id === aliceJobId);
    const bobJob = queue.find(j => j.id === bobJobId);

    if (!aliceJob || aliceJob.status !== 'running') {
      throw new Error(`Alice job expected running, got ${aliceJob ? aliceJob.status : 'null'}`);
    }
    if (!bobJob || bobJob.status !== 'waiting') {
      throw new Error(`Bob job expected waiting, got ${bobJob ? bobJob.status : 'null'}`);
    }

    // Alice completes job, promoting Bob
    await request('/api/queue', 'POST', { action: 'complete', id: aliceJobId, username: 'Alice' });

    // Check if Bob promoted
    queue = await request('/api/queue', 'GET');
    const bobJobPromoted = queue.find(j => j.id === bobJobId);
    if (!bobJobPromoted || bobJobPromoted.status !== 'running') {
      throw new Error(`Bob job expected promoted to running, got ${bobJobPromoted ? bobJobPromoted.status : 'null'}`);
    }

    // Bob completes job
    await request('/api/queue', 'POST', { action: 'complete', id: bobJobId, username: 'Bob' });
    queue = await request('/api/queue', 'GET');
    if (queue.length !== 0) {
      throw new Error(`Queue not empty after all jobs completed`);
    }

    console.log('\x1b[32m%s\x1b[0m', '✓ Test 3 Passed: Queue lock and promotion success');

    // ----------------------------------------------------
    // TEST 4: Model Unload (Clear) Sync
    // ----------------------------------------------------
    console.log('\nRunning Test 4: Model Unload Synchronization...');
    await request('/api/model', 'POST', {
      sender: 'Alice',
      model: '',
      timestamp: Date.now(),
      isGenerating: false,
      generatingText: ''
    });

    const unloadedStatus = await request('/api/model', 'GET');
    if (unloadedStatus.model !== '') {
      throw new Error(`Model expected to be empty after unload, got ${unloadedStatus.model}`);
    }
    console.log('\x1b[32m%s\x1b[0m', '✓ Test 4 Passed: Model Unload Sync Success');

    // ----------------------------------------------------
    // TEST 5: Queue Timeout Ejection
    // ----------------------------------------------------
    console.log('\nRunning Test 5: Queue Timeout Ejection...');
    
    const timeoutAliceJobId = 'job_alice_timeout_' + Date.now();
    await request('/api/queue', 'POST', { action: 'join', id: timeoutAliceJobId, username: 'Alice' });

    const timeoutBobJobId = 'job_bob_timeout_' + Date.now();
    await request('/api/queue', 'POST', { action: 'join', id: timeoutBobJobId, username: 'Bob' });

    console.log('Waiting 2.1 seconds for timeout...');
    await new Promise(resolve => setTimeout(resolve, 2100));

    queue = await request('/api/queue', 'GET', null, null, { 'X-DDO-Queue-Timeout': '1' });
    
    const checkAliceJob = queue.find(j => j.id === timeoutAliceJobId);
    const checkBobJob = queue.find(j => j.id === timeoutBobJobId);

    if (checkAliceJob) {
      throw new Error(`Alice job expected to be ejected due to timeout`);
    }
    if (!checkBobJob || checkBobJob.status !== 'running') {
      throw new Error(`Bob job expected promoted to running, got ${checkBobJob ? checkBobJob.status : 'null'}`);
    }

    await request('/api/queue', 'POST', { action: 'complete', id: timeoutBobJobId, username: 'Bob' });
    console.log('\x1b[32m%s\x1b[0m', '✓ Test 5 Passed: Queue Timeout Ejection and Auto-Promotion Success');

    console.log('\n\x1b[32;1m%s\x1b[0m', '======================================');
    console.log('\x1b[32;1m%s\x1b[0m', '  ALL API SYNC TESTS PASSED SUCCESSFULLY!  ');
    console.log('\x1b[32;1m%s\x1b[0m', '======================================');
  } catch (err) {
    console.error('\n\x1b[31;1m%s\x1b[0m', '======================================');
    console.error('\x1b[31;1m%s\x1b[0m', '  TEST FAILED:');
    console.error('\x1b[31m%s\x1b[0m', err.message);
    console.error('\x1b[31;1m%s\x1b[0m', '======================================');
    process.exit(1);
  }
}

runTests();
