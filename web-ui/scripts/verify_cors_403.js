// verify_cors_403.js
// This script verifies that DDO Saba's Nginx server correctly returns CORS headers on 403 Forbidden responses.

import http from 'http';

const targetUrl = 'http://localhost:8088/api/tags';

console.log(`Sending unauthenticated request to ${targetUrl} to verify CORS on 403...`);

const req = http.request(targetUrl, {
  method: 'GET',
  headers: {
    // Intentionally omitting 'X-DDO-Token' to trigger 403 Forbidden
    'X-DDO-Client-Id': 'verify-script-id',
  }
}, (res) => {
  console.log(`Response Status Code: ${res.statusCode} (Expected: 403)`);
  
  if (res.statusCode !== 403) {
    console.error(`[FAIL] Unexpected status code: ${res.statusCode}. Expected: 403`);
    process.exit(1);
  }

  const headers = res.headers;
  const expectedCorsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  };

  let failed = false;

  for (const [header, expectedValue] of Object.entries(expectedCorsHeaders)) {
    const value = headers[header];
    console.log(`Header '${header}': '${value}' (Expected: '${expectedValue}')`);
    if (value !== expectedValue) {
      console.error(`[FAIL] Header '${header}' does not match expected value.`);
      failed = true;
    }
  }

  const allowHeaders = headers['access-control-allow-headers'];
  console.log(`Header 'access-control-allow-headers': '${allowHeaders}'`);
  if (!allowHeaders || !allowHeaders.includes('X-DDO-Token')) {
    console.error(`[FAIL] Header 'access-control-allow-headers' is missing or does not include 'X-DDO-Token'`);
    failed = true;
  }

  if (failed) {
    console.error('[FAIL] CORS verification failed on 403 response.');
    process.exit(1);
  } else {
    console.log('[SUCCESS] CORS verification passed successfully on 403 response!');
    process.exit(0);
  }
});

req.on('error', (e) => {
  console.error(`[FAIL] Request failed with error: ${e.message}`);
  process.exit(1);
});

req.end();
