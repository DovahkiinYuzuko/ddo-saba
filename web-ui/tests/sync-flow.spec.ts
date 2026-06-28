/// <reference types="node" />
import { test, expect, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

declare const process: any;

const MODEL_NAME = process.env.TEST_MODEL || 'Gemma4-E4B-QAT-abliterated-Q4_K:latest';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), '../screenshots');

test.describe('DDO Saba - Shared Mode Chaos E2E Test with Visual Evidence', () => {

  test('Alice (PC) and Bob (Mobile) Chaos Test - Parameter sync, Queue block, Auto-promotion, Tab sync', async ({ browser }) => {
    
    // 1. Read configurations dynamically from active server files
    const nginxConfigPath = path.resolve(process.cwd(), '../nginx/conf/nginx_active.conf');
    console.log('Reading Nginx active config from:', nginxConfigPath);
    const nginxConfig = fs.readFileSync(nginxConfigPath, 'utf-8');
    const matchToken = nginxConfig.match(/"([^"]{32})"\s+"ok"/);
    const TOKEN = matchToken ? matchToken[1] : '';

    const tunnelLogPath = path.resolve(process.cwd(), '../tunnel_output.log');
    console.log('Reading Cloudflare Tunnel log from:', tunnelLogPath);
    const logContent = fs.readFileSync(tunnelLogPath, 'utf-8');
    const matchUrl = logContent.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    const TUNNEL_URL = matchUrl ? matchUrl[0] : '';

    // Define URLs matching Yuzuko's manual testing endpoints
    const ALICE_URL = `http://localhost:8088/?token=${TOKEN}&sharedMode=true`;
    const BOB_URL = `${TUNNEL_URL}/?token=${TOKEN}&sharedMode=true`;

    console.log('Resolved Alice URL:', ALICE_URL);
    console.log('Resolved Bob Tunnel URL:', BOB_URL);
    console.log('Using model name:', MODEL_NAME);

    // 2. Setup Alice (PC Context)
    console.log('Setting up Alice (PC)...');
    const contextAlice = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const pageAlice = await contextAlice.newPage();
    pageAlice.on('console', msg => console.log(`[Alice Browser LOG] ${msg.type()}: ${msg.text()}`));
    await pageAlice.goto(ALICE_URL);

    // Set Alice's username -> Alice(PC)
    await pageAlice.locator('button.icon-btn').last().click();
    await pageAlice.locator('.form-group').filter({ hasText: /ユーザー名|username/i }).locator('input[type="text"]').fill('Alice(PC)');
    await pageAlice.locator('.settings-modal button.btn-accent, .settings-modal button.close-btn').first().click();

    // Take screenshot: Initial connection
    console.log('Saving screenshot: step1_initial_state.png...');
    const path1 = path.join(SCREENSHOTS_DIR, 'step1_initial_state.png');
    await pageAlice.screenshot({ path: path1 });
    console.log('step1 exists:', fs.existsSync(path1));

    // 3. Alice selects model and starts loading (imitating PC starting model load first)
    console.log(`Alice selects model: ${MODEL_NAME}...`);
    const modelSelect = pageAlice.locator('.chat-header select.model-select');
    // Create case-insensitive regex to handle Ollama's lowercase model naming convention
    const modelRegex = new RegExp(MODEL_NAME, 'i');
    // Wait for the option to be populated in the dropdown (Ollama list loading)
    const matchingOption = modelSelect.locator('option', { hasText: modelRegex });
    await expect(matchingOption).toBeAttached({ timeout: 15000 });
    // Extract the text content to bypass Playwright's string validation on label selection
    const labelText = await matchingOption.textContent();
    if (!labelText) {
      throw new Error(`Model option matching "${MODEL_NAME}" not found in dropdown`);
    }
    await modelSelect.selectOption({ label: labelText.trim() });

    // Wait a brief moment to ensure model load state has initiated
    await pageAlice.waitForTimeout(3000);

    // 4. Setup Bob (Mobile Context with iPhone 12 Emulation)
    console.log('Setting up Bob (Mobile: iPhone 12 Emulated)...');
    const mobileDevice = devices['iPhone 12'];
    const contextBob = await browser.newContext({
      ...mobileDevice,
    });
    const pageBob = await contextBob.newPage();
    pageBob.on('console', msg => console.log(`[Bob Browser LOG] ${msg.type()}: ${msg.text()}`));
    // Bob connects via the tunnel URL (simulating real QR scan)
    await pageBob.goto(BOB_URL);

    // Set Bob's username -> Bob(スマホ版)
    await pageBob.locator('button.icon-btn').last().click();
    await pageBob.locator('.form-group').filter({ hasText: /ユーザー名|username/i }).locator('input[type="text"]').fill('Bob(スマホ版)');
    await pageBob.locator('.settings-modal button.btn-accent, .settings-modal button.close-btn').first().click();

    // 5. Bob changes parameters (requires opening parameters drawer on mobile layout)
    console.log('Bob changes parameters on the mobile interface...');
    await pageBob.locator('button[title*="Parameter"], button[title*="パラメータ"]').click();
    
    // Change temperature slider (or input field)
    const tempInput = pageBob.locator('.parameter-row').filter({ hasText: /temperature/i }).locator('input[type="number"]');
    await tempInput.fill('1.25');
    await tempInput.press('Enter');

    // Wait to sync, and check if Alice (PC) reflects this change
    await pageAlice.waitForTimeout(1500);
    const aliceTempInput = pageAlice.locator('.parameter-row').filter({ hasText: /temperature/i }).locator('input[type="number"]');
    await expect(aliceTempInput).toHaveValue('1.25');

    // Take screenshot: Parameter sync successful
    console.log('Saving screenshot: step2_parameter_sync.png...');
    const path2 = path.join(SCREENSHOTS_DIR, 'step2_parameter_sync.png');
    await pageAlice.screenshot({ path: path2 });
    console.log('step2 exists:', fs.existsSync(path2));

    // Close Bob's parameters panel
    await pageBob.locator('button[title*="Parameter"], button[title*="パラメータ"]').click();

    // 6. Alice sends a query to trigger inference
    console.log('Alice sends query to start inference...');
    const alicePrompt = 'Hi, please say hello in a single sentence.';
    await pageAlice.locator('textarea[placeholder*="message"], textarea[placeholder*="メッセージ"]').fill(alicePrompt);
    await pageAlice.locator('button[title*="Send"], button[title*="送信"]').click();

    // Wait 1.5 seconds to ensure inference has started and loader is visible
    await pageAlice.waitForTimeout(1500);
    
    // Take screenshot: Alice is generating (or model loading)
    console.log('Saving screenshot: step3_alice_generating.png...');
    const path3 = path.join(SCREENSHOTS_DIR, 'step3_alice_generating.png');
    await pageAlice.screenshot({ path: path3 });
    console.log('step3 exists:', fs.existsSync(path3));

    // 7. Bob interrupts by sending a message while Alice is busy
    console.log('Bob interrupts by sending another message...');
    const bobPrompt = 'Hello Alice, this is an interrupted message from Bob.';
    await pageBob.locator('textarea[placeholder*="message"], textarea[placeholder*="メッセージ"]').fill(bobPrompt);
    await pageBob.locator('button[title*="Send"], button[title*="送信"]').click();

    // Wait 1.5 seconds for Bob to join the queue and get blocked/waiting status
    await pageBob.waitForTimeout(1500);

    // Take screenshot: Bob is waiting in queue
    console.log('Saving screenshot: step4_bob_waiting_queue.png...');
    const path4 = path.join(SCREENSHOTS_DIR, 'step4_bob_waiting_queue.png');
    await pageBob.screenshot({ path: path4 });
    console.log('step4 exists:', fs.existsSync(path4));

    // 8. Wait for Alice to finish generation so Bob gets auto-promoted and starts generation
    console.log('Waiting for Alice to finish and Bob to get promoted...');
    const bobSendButton = pageBob.locator('button[title*="Send"], button[title*="送信"]');
    await expect(bobSendButton).toBeEnabled({ timeout: 120000 });

    // Take screenshot: Bob has completed his promoted generation
    console.log('Saving screenshot: step5_bob_promoted.png...');
    const path5 = path.join(SCREENSHOTS_DIR, 'step5_bob_promoted.png');
    await pageAlice.screenshot({ path: path5 });
    console.log('step5 exists:', fs.existsSync(path5));

    // 9. Alice creates a new chat tab to verify tab sync
    console.log('Alice creates a new chat tab...');
    const newTabButton = pageAlice.locator('button[title*="New Chat"], button[title*="新規チャット"], .new-chat-btn').first();
    await newTabButton.click();

    // Wait for tab sync to propagate
    await pageAlice.waitForTimeout(2000);

    // Take screenshot: Tab list sync
    console.log('Saving screenshot: step6_tab_sync.png...');
    const path6 = path.join(SCREENSHOTS_DIR, 'step6_tab_sync.png');
    await pageAlice.screenshot({ path: path6 });
    console.log('step6 exists:', fs.existsSync(path6));

    // Keep the browser open briefly for visual verification
    console.log('All tests completed. Keeping browser visible for 5 seconds...');
    await pageAlice.waitForTimeout(5000);

    // Clean up
    await contextAlice.close();
    await contextBob.close();
  });

});
