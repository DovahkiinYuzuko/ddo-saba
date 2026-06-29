/// <reference types="node" />
import { test, expect, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

declare const process: any;

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

    // 2. Setup Alice (PC Context)
    console.log('Setting up Alice (PC)...');
    const contextAlice = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const pageAlice = await contextAlice.newPage();
    pageAlice.on('console', msg => console.log(`[Alice Browser LOG] ${msg.type()}: ${msg.text()}`));
    await pageAlice.goto(ALICE_URL);

    // Set Alice's username -> Alice(PC)
    // In sharedMode with a default name, the modal auto-opens, so a backdrop might cover the button. Use force: true.
    await pageAlice.getByRole('button', { name: /^(設定|Settings)$/i }).click({ force: true });
    await pageAlice.getByLabel(/ユーザー名|username/i).fill('Alice(PC)');
    await pageAlice.getByRole('button', { name: /^(閉じる|Close)$/i }).click();

    // Take screenshot: Initial connection
    console.log('Saving screenshot: step1_initial_state.png...');
    const path1 = path.join(SCREENSHOTS_DIR, 'step1_initial_state.png');
    await pageAlice.screenshot({ path: path1 });
    console.log('step1 exists:', fs.existsSync(path1));

    // 3. Alice waits for model loading and selects model if necessary
    console.log(`Alice waiting for model loading to complete (can take ~30s if model is being pre-loaded)...`);
    const modelSelect = pageAlice.getByRole('combobox');
    
    // Wait for the combobox to be enabled (meaning isEffectivelyLoading is false)
    // Note: We use 60000ms because Ollama's empty generate call for keep_alive can take ~28s.
    await expect(modelSelect).toBeEnabled({ timeout: 60000 });

    // Check currently selected option
    // We need to evaluate the selected text label to determine if it's already a valid model
    const selectedText = await modelSelect.evaluate((sel: HTMLSelectElement) => sel.options[sel.selectedIndex]?.text || '');
    
    const isPlaceholder = selectedText.trim() === '' || 
        selectedText.includes('モデルを選択') || 
        selectedText.includes('Select a model') ||
        selectedText.includes('Loading Model...') ||
        selectedText.includes('No models detected');

    if (isPlaceholder) {
      console.log(`No model auto-selected. Dynamically picking the first available one...`);
      const options = await modelSelect.locator('option').allTextContents();
      const validOptions = options.filter(opt => 
          opt.trim() !== '' && 
          !opt.includes('モデルを選択') && 
          !opt.includes('Select a model') &&
          !opt.includes('Loading Model...') &&
          !opt.includes('No models detected')
      );
      if (validOptions.length === 0) {
        throw new Error(`No models found in dropdown`);
      }
      const labelText = validOptions[0];
      console.log(`Selected model: ${labelText}`);
      await modelSelect.selectOption({ label: labelText.trim() });

      // Wait a brief moment to ensure model load state has initiated
      await pageAlice.waitForTimeout(3000);
    } else {
      console.log(`Model is already auto-selected: ${selectedText}. Proceeding...`);
    }

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
    await pageBob.getByRole('button', { name: /^(設定|Settings)$/i }).click();
    await pageBob.getByLabel(/ユーザー名|username/i).fill('Bob(スマホ版)');
    await pageBob.getByRole('button', { name: /^(閉じる|Close)$/i }).click();

    // 5. Bob changes parameters (requires opening parameters drawer on mobile layout)
    console.log('Bob changes parameters on the mobile interface...');
    await pageBob.getByRole('button', { name: /Parameter|パラメータ/i }).click();
    
    // Change temperature slider (or input field)
    const tempInput = pageBob.getByLabel(/Temperature|温度/i);
    await tempInput.fill('1.25');
    await tempInput.press('Enter');

    // Bob explicitly clicks "Sync Settings to Room"
    await pageBob.getByRole('button', { name: /Sync Settings to Room|現在の設定を全員に同期/i }).click();

    // Alice receives the sync request and accepts it
    await pageAlice.getByRole('button', { name: /Accept|承認/i }).click();

    // Wait to sync, and check if Alice (PC) reflects this change
    await pageAlice.waitForTimeout(1500);
    const aliceTempInput = pageAlice.getByLabel(/Temperature|温度/i);
    await expect(aliceTempInput).toHaveValue('1.25');

    // Take screenshot: Parameter sync successful
    console.log('Saving screenshot: step2_parameter_sync.png...');
    const path2 = path.join(SCREENSHOTS_DIR, 'step2_parameter_sync.png');
    await pageAlice.screenshot({ path: path2 });
    console.log('step2 exists:', fs.existsSync(path2));

    // Close Bob's parameters panel by clicking the mobile overlay
    await pageBob.locator('.mobile-overlay').click({ position: { x: 10, y: 10 } });

    // 5.5 Alice must create a New Chat to type a message (if none exists)
    console.log('Alice creates a New Chat...');
    // The "New Chat" button is usually in the sidebar or header.
    await pageAlice.getByRole('button', { name: /New Chat|新規チャット/i }).first().click({ force: true });

    // Wait a brief moment for the chat to be active
    await pageAlice.waitForTimeout(1000);

    // 6. Alice sends a query to trigger inference
    console.log('Alice sends query to start inference...');
    const alicePrompt = 'Hi, please say hello in a single sentence.';
    await pageAlice.getByPlaceholder(/message|メッセージ/i).fill(alicePrompt);
    await pageAlice.getByRole('button', { name: /^(Send|送信)$/i }).click();

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
    await pageBob.getByPlaceholder(/message|メッセージ/i).fill(bobPrompt);
    await pageBob.getByRole('button', { name: /^(Send|送信)$/i }).click();

    // Wait 1.5 seconds for Bob to join the queue and get blocked/waiting status
    await pageBob.waitForTimeout(1500);

    // Take screenshot: Bob is waiting in queue
    console.log('Saving screenshot: step4_bob_waiting_queue.png...');
    const path4 = path.join(SCREENSHOTS_DIR, 'step4_bob_waiting_queue.png');
    await pageBob.screenshot({ path: path4 });
    console.log('step4 exists:', fs.existsSync(path4));

    // 8. Wait for Alice to finish generation so Bob gets auto-promoted and starts generation
    console.log('Waiting for Alice to finish and Bob to get promoted...');
    const bobSendButton = pageBob.getByRole('button', { name: /^(Send|送信)$/i });
    await expect(bobSendButton).toBeEnabled({ timeout: 120000 });

    // Take screenshot: Bob has completed his promoted generation
    console.log('Saving screenshot: step5_bob_promoted.png...');
    const path5 = path.join(SCREENSHOTS_DIR, 'step5_bob_promoted.png');
    await pageAlice.screenshot({ path: path5 });
    console.log('step5 exists:', fs.existsSync(path5));

    // 9. Alice creates a new chat tab to verify tab sync
    console.log('Alice creates a new chat tab...');
    const newTabButton = pageAlice.getByRole('button', { name: /New Chat|新規チャット/i }).first();
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
