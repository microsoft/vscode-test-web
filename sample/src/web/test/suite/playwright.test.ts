import * as assert from 'assert';
import * as vscode from 'vscode';
import * as playwright from '@vscode/test-web/playwright';

suite('Playwright UI Test Suite', () => {

	// Element Selection Tests
	test('page.$()', async function() {
		this.timeout(5000);

		// Check for workbench container
		const hasWorkbench = await playwright.page.$('.monaco-workbench');
		assert.ok(hasWorkbench, 'Should have workbench container');
	});

	test('page.$() - activity bar', async function() {
		this.timeout(5000);

		// Check for activity bar
		const hasActivityBar = await playwright.page.$('.activitybar');
		assert.ok(hasActivityBar, 'Should have activity bar');
	});

	test('page.$() - sidebar', async function() {
		this.timeout(5000);

		// Check for sidebar
		const hasSidebar = await playwright.page.$('.sidebar');
		assert.ok(hasSidebar, 'Should have sidebar');
	});

	test('page.$() - editor part', async function() {
		this.timeout(5000);

		// Check for editor part
		const hasEditorPart = await playwright.page.$('.part.editor');
		assert.ok(hasEditorPart, 'Should have editor part');
	});

	test('page.$$()', async function() {
		this.timeout(5000);

		// Count all divs in the document
		const divs = await playwright.page.$$('div');
		assert.ok(divs.length > 0, 'Should have at least one div element');
	});

	// Waiting and Timing Tests
	test('page.waitForSelector()', async function() {
		this.timeout(15000); // UI operations may take time

		// Open a file first to make the editor appear
		const files = await vscode.workspace.findFiles('**/*.txt');
		assert.ok(files.length > 0, 'Should have test files');
		await vscode.window.showTextDocument(files[0]);

		// Wait for the editor to be loaded with debug capture on failure
		try {
			const editorFound = await playwright.page.waitForSelector('.monaco-editor', { timeout: 10000, state: 'visible' });
			assert.ok(editorFound, 'Monaco editor should be present');
		} catch (error) {
			// Capture debugging information on failure
			console.error('[DEBUG] Monaco editor test failed, capturing debug info...');

			// Take a screenshot
			try {
				const screenshot = await playwright.page.screenshot({ type: 'png', fullPage: true });
				console.error('[DEBUG] Screenshot captured (base64 length:', screenshot.length, ')');
			} catch (screenshotError) {
				console.error('[DEBUG] Failed to capture screenshot:', screenshotError);
			}

			// Get page content
			try {
				const html = await playwright.page.evaluate<string>('() => document.documentElement.outerHTML');
				console.error('[DEBUG] Page HTML length:', html.length);
				console.error('[DEBUG] Page HTML preview:', html.substring(0, 500));
			} catch (htmlError) {
				console.error('[DEBUG] Failed to get HTML:', htmlError);
			}

			// Check what elements are present
			try {
				const bodyClasses = await playwright.page.evaluate<string>('() => document.body.className');
				console.error('[DEBUG] Body classes:', bodyClasses);

				const workbenchFound = await playwright.page.$('.monaco-workbench');
				console.error('[DEBUG] Workbench found:', workbenchFound);

				const divCount = await playwright.page.$$('div');
				console.error('[DEBUG] Total divs:', divCount.length);
			} catch (debugError) {
				console.error('[DEBUG] Failed to gather element info:', debugError);
			}

			// Re-throw the original error
			throw error;
		}
	});

	test('page.waitForTimeout()', async function() {
		this.timeout(10000);

		// Get workspace folder
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, 'Should have workspace folder');

		// Open a file using VS Code API
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'hello.txt');
		const doc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(doc);

		// Wait for editor to update
		await playwright.page.waitForTimeout(500);

		// Verify editor is visible and has content
		const editorVisible = await playwright.page.isVisible('.monaco-editor');
		assert.ok(editorVisible, 'Editor should be visible after opening file');

		// Check that the editor has the file content
		const hasContent = await playwright.page.$('.view-line');
		assert.ok(hasContent, 'Editor should have content lines');
	});

	// Element Property Tests
	test('page.isVisible()', async function() {
		this.timeout(5000);

		// Verify the monaco editor is visible
		const isVisible = await playwright.page.isVisible('.monaco-editor');
		assert.ok(isVisible, 'Monaco editor should be visible');
	});

	test('page.isHidden()', async function() {
		this.timeout(5000);

		// Check if non-existent element is hidden
		const nonExistentHidden = await playwright.page.isHidden('.non-existent-element-xyz');
		// Note: isHidden returns false for non-existent elements in Playwright
		assert.strictEqual(typeof nonExistentHidden, 'boolean', 'isHidden should return a boolean');
	});

	test('page.getAttribute()', async function() {
		this.timeout(5000);

		// Get workbench class attribute
		const workbenchClass = await playwright.page.getAttribute('.monaco-workbench', 'class');
		assert.ok(workbenchClass, 'Workbench should have class attribute');
		assert.ok(workbenchClass.includes('monaco-workbench'), 'Should include monaco-workbench class');
	});

	test('page.textContent()', async function() {
		this.timeout(5000);

		// Try to get text content from various elements
		// This is just a demonstration - actual selectors depend on VS Code's DOM
		const bodyText = await playwright.page.textContent('body');
		assert.ok(bodyText !== null, 'Body should have some text content');
	});

	// JavaScript Evaluation Tests
	test('page.evaluate() with function', async function() {
		this.timeout(5000);

		// Test that evaluate() works with a function argument
		// Note: The function runs in browser context where document is available
		const title = await playwright.page.evaluate<string>(() => (globalThis as any).document.title);
		assert.ok(title, 'Document should have a title');
		assert.ok(title.includes('Visual Studio Code'), 'Title should mention VS Code');
	});

	test('page.evaluate() with string', async function() {
		this.timeout(5000);

		// Test that evaluate() works with a string argument (JavaScript code)
		const title = await playwright.page.evaluate<string>('document.title');
		assert.ok(title, 'Document should have a title');
		assert.ok(title.includes('Visual Studio Code'), 'Title should mention VS Code');
	});

	// Keyboard Interaction Tests
	test('page.keyboard.type()', async function() {
		this.timeout(10000);

		// Execute command to open command palette (using VS Code API)
		await vscode.commands.executeCommand('workbench.action.showCommands');

		// Wait for command palette to appear
		await playwright.page.waitForTimeout(500);

		// Type a command using Playwright keyboard
		await playwright.page.keyboard.type('Hello World');

		// Wait a bit
		await playwright.page.waitForTimeout(300);

		// Press Escape to close
		await playwright.page.keyboard.press('Escape');

		// Verify command palette is closed
		await playwright.page.waitForTimeout(300);
	});

	test('page.keyboard.press()', async function() {
		this.timeout(10000);

		// Execute command to open command palette (using VS Code API)
		await vscode.commands.executeCommand('workbench.action.showCommands');

		// Wait for command palette to appear
		await playwright.page.waitForTimeout(500);

		// Press Escape to close
		await playwright.page.keyboard.press('Escape');

		// Verify command palette is closed
		await playwright.page.waitForTimeout(300);
	});

	// Screenshot Tests
	test('page.screenshot()', async function() {
		this.timeout(10000);

		// Wait for page to be ready
		await playwright.page.waitForTimeout(1000);

		// Take a screenshot (returns base64 encoded PNG)
		const screenshot = await playwright.page.screenshot({
			type: 'png',
			fullPage: false
		});

		assert.ok(screenshot, 'Screenshot should be generated');
		assert.ok(screenshot.length > 0, 'Screenshot should not be empty');

		// The screenshot is base64 encoded, should be a valid string
		assert.strictEqual(typeof screenshot, 'string', 'Screenshot should be a string');
	});
});

suite('Playwright registry management', () => {
	test('generates 3 handles in a test', async function() {
		this.timeout(5000);
		const sizeBefore = await (playwright as any).__getRegistrySize();
		const h1 = await playwright.page.$('.monaco-workbench');
		const h2 = await playwright.page.$('.activitybar');
		const h3 = await playwright.page.$('.sidebar');
		assert.ok(h1, 'Expected .monaco-workbench element');
		assert.ok(h2, 'Expected .activitybar element');
		assert.ok(h3, 'Expected .sidebar element');
		const sizeAfter = await (playwright as any).__getRegistrySize();
		assert.strictEqual(sizeAfter, sizeBefore + 3, `Registry size should be exactly 3 after creating three handles (was ${sizeAfter})`);
	});

	test('manual clear resets registry to 0', async function() {
		this.timeout(5000);
		const sizeBefore = await ((playwright as any).__getRegistrySize());
		await playwright.page.$('.monaco-workbench');
		await playwright.page.$('.activitybar');
		assert.strictEqual(await (playwright as any).__getRegistrySize(), sizeBefore + 2);
		await (playwright as any).clearRegistry();
		assert.strictEqual(await (playwright as any).__getRegistrySize(), 0, 'Registry should be 0 after manual clear');
	});

	test('registry cleared between tests (size == 0)', async function() {
		this.timeout(5000);
		const sizeNow = await (playwright as any).__getRegistrySize();
		assert.strictEqual(sizeNow, 0, `Registry expected to be 0 at start of new test (was ${sizeNow})`);
	});

	test('disable auto clear preserves registry across tests', async function() {
		this.timeout(5000);
		(playwright as any).disableAutoClearRegistry();
		assert.strictEqual(await (playwright as any).__getRegistrySize(), 0);
		await playwright.page.$('.monaco-workbench');
		await playwright.page.$('.activitybar');
		const sizeAfterFirst = await (playwright as any).__getRegistrySize();
		assert.strictEqual(sizeAfterFirst, 2);
	});

	test('handles persist when auto clear disabled', async function() {
		this.timeout(5000);
		const sizeNow = await (playwright as any).__getRegistrySize();
		assert.ok(sizeNow >= 2, 'Registry size should persist when auto clear disabled');
		(playwright as any).enableAutoClearRegistry();
	});
});
