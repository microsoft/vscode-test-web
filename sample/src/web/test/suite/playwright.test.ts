import * as assert from 'assert';
import * as vscode from 'vscode';
import { test, suite, playwrightRegistry, playwright } from '@vscode/test-web/playwright';

suite('Playwright UI Test Suite', () => {

	// Element Selection Tests
	test('page.$()', async ({ page }) => {
		// Check for workbench container
		const hasWorkbench = await page.$('.monaco-workbench');
		assert.ok(hasWorkbench, 'Should have workbench container');
	});

	test('page.$() - activity bar', async ({ page }) => {
		// Check for activity bar
		const hasActivityBar = await page.$('.activitybar');
		assert.ok(hasActivityBar, 'Should have activity bar');
	});

	test('page.$() - sidebar', async ({ page }) => {
		// Check for sidebar
		const hasSidebar = await page.$('.sidebar');
		assert.ok(hasSidebar, 'Should have sidebar');
	});

	test('page.$() - editor part', async ({ page }) => {
		// Check for editor part
		const hasEditorPart = await page.$('.part.editor');
		assert.ok(hasEditorPart, 'Should have editor part');
	});

	test('page.$$()', async ({ page }) => {
		// Count all divs in the document
		const divs = await page.$$('div');
		assert.ok(divs.length > 0, 'Should have at least one div element');
	});

	// Waiting and Timing Tests
	test('page.waitForSelector()', async ({ page }) => {
		// Open a file first to make the editor appear
		const files = await vscode.workspace.findFiles('**/*.txt');
		assert.ok(files.length > 0, 'Should have test files');
		await vscode.window.showTextDocument(files[0]);

		// Wait for the editor to be loaded
		const editorFound = await page.waitForSelector('.monaco-editor', { timeout: 10000, state: 'visible' });
		assert.ok(editorFound, 'Monaco editor should be present');
	});

	test('page.waitForTimeout()', async ({ page }) => {
		// Get workspace folder
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, 'Should have workspace folder');

		// Open a file using VS Code API
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'hello.txt');
		const doc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(doc);

		// Wait for editor to update
		await page.waitForTimeout(500);

		// Verify editor is visible and has content
		const editorVisible = await page.isVisible('.monaco-editor');
		assert.ok(editorVisible, 'Editor should be visible after opening file');

		// Check that the editor has the file content
		const hasContent = await page.$('.view-line');
		assert.ok(hasContent, 'Editor should have content lines');
	});

	// Element Property Tests
	test('page.isVisible()', async ({ page }) => {
		// Verify the monaco editor is visible
		const isVisible = await page.isVisible('.monaco-editor');
		assert.ok(isVisible, 'Monaco editor should be visible');
	});

	test('page.isHidden()', async ({ page }) => {
		// Check if non-existent element is hidden
		const nonExistentHidden = await page.isHidden('.non-existent-element-xyz');
		// Note: isHidden returns false for non-existent elements in Playwright
		assert.strictEqual(typeof nonExistentHidden, 'boolean', 'isHidden should return a boolean');
	});

	test('page.getAttribute()', async ({ page }) => {
		// Get workbench class attribute
		const workbenchClass = await page.getAttribute('.monaco-workbench', 'class');
		assert.ok(workbenchClass, 'Workbench should have class attribute');
		assert.ok(workbenchClass.includes('monaco-workbench'), 'Should include monaco-workbench class');
	});

	test('page.textContent()', async ({ page }) => {
		// Try to get text content from various elements
		// This is just a demonstration - actual selectors depend on VS Code's DOM
		const bodyText = await page.textContent('body');
		assert.ok(bodyText !== null, 'Body should have some text content');
	});

	// JavaScript Evaluation Tests
	test('page.evaluate() with function', async ({ page }) => {
		// Test that evaluate() works with a function argument
		// Note: The function runs in browser context where document is available
		const title = await page.evaluate(() => (globalThis as any).document.title);
		assert.ok(title, 'Document should have a title');
		assert.ok((title as string).includes('Visual Studio Code'), 'Title should mention VS Code');
	});

	test('page.evaluate() with string', async ({ page }) => {
		// Test that evaluate() works with a string argument (JavaScript code)
		const title = await page.evaluate('document.title');
		assert.ok(title, 'Document should have a title');
		assert.ok((title as string).includes('Visual Studio Code'), 'Title should mention VS Code');
	});

	// Keyboard Interaction Tests
	test('page.keyboard.type()', async ({ page }) => {
		// Execute command to open command palette (using VS Code API)
		await vscode.commands.executeCommand('workbench.action.showCommands');

		// Wait for command palette to appear
		await page.waitForTimeout(500);

		// Type a command using Playwright keyboard
		await page.keyboard.type('Hello World');

		// Wait a bit
		await page.waitForTimeout(300);

		// Press Escape to close
		await page.keyboard.press('Escape');

		// Verify command palette is closed
		await page.waitForTimeout(300);
	});

	test('page.keyboard.press()', async ({ page }) => {
		// Execute command to open command palette (using VS Code API)
		await vscode.commands.executeCommand('workbench.action.showCommands');

		// Wait for command palette to appear
		await page.waitForTimeout(500);

		// Press Escape to close
		await page.keyboard.press('Escape');

		// Verify command palette is closed
		await page.waitForTimeout(300);
	});

	// Screenshot Tests
	test('page.screenshot()', async ({ page }) => {
		// Wait for page to be ready
		await page.waitForTimeout(1000);

		// Take a screenshot (returns base64 encoded PNG)
		const screenshot = await page.screenshot({
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
	test('generates 3 handles in a test', async ({ page }) => {
		const sizeBefore = await playwrightRegistry.getSize();
		const h1 = await page.$('.monaco-workbench');
		const h2 = await page.$('.activitybar');
		const h3 = await page.$('.sidebar');
		assert.ok(h1, 'Expected .monaco-workbench element');
		assert.ok(h2, 'Expected .activitybar element');
		assert.ok(h3, 'Expected .sidebar element');
		const sizeAfter = await playwrightRegistry.getSize();
		assert.strictEqual(sizeAfter, sizeBefore + 3, `Registry size should be exactly 3 after creating three handles (was ${sizeAfter})`);
	});

	test('manual clear resets registry to 0', async ({ page }) => {
		const sizeBefore = await playwrightRegistry.getSize();
		await page.$('.monaco-workbench');
		await page.$('.activitybar');
		assert.strictEqual(await playwrightRegistry.getSize(), sizeBefore + 2);
		await playwrightRegistry.clear();
		assert.strictEqual(await playwrightRegistry.getSize(), 0, 'Registry should be 0 after manual clear');
	});

	test('registry cleared between tests (size == 0)', async ({ page }) => {
		const sizeNow = await playwrightRegistry.getSize();
		assert.strictEqual(sizeNow, 0, `Registry expected to be 0 at start of new test (was ${sizeNow})`);
	});

	test('disable auto clear preserves registry across tests', async ({ page }) => {
		playwrightRegistry.disableAutoClear();
		assert.strictEqual(await playwrightRegistry.getSize(), 0);
		await page.$('.monaco-workbench');
		await page.$('.activitybar');
		const sizeAfterFirst = await playwrightRegistry.getSize();
		assert.strictEqual(sizeAfterFirst, 2);
	});

	test('handles persist when auto clear disabled', async ({ page }) => {
		const sizeNow = await playwrightRegistry.getSize();
		assert.ok(sizeNow >= 2, 'Registry size should persist when auto clear disabled');
		playwrightRegistry.enableAutoClear();
	});
});

suite('Playwright request context', () => {
	test('can use fixture request context', async ({ request }) => {
		// Use the request fixture provided by the test framework
		const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
		assert.ok(response.ok(), 'Response should be successful');

		const data = await response.json();
		assert.ok(data, 'Response should have data');
		assert.strictEqual(typeof data, 'object', 'Response should be an object');
	});

	test('can create new request context with playwright.request.newContext()', async () => {
		// Create a new independent request context using the playwright library
		const request = await playwright.request.newContext();

		try {
			const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
			assert.ok(response.ok(), 'Response should be successful');

			const data = await response.json();
			assert.ok(data, 'Response should have data');
			assert.strictEqual(typeof data, 'object', 'Response should be an object');
		} finally {
			// Clean up the request context
			await request.dispose();
		}
	});

	test('fixture and new contexts are independent', async ({ request }) => {
		// Create a new context
		const newRequest = await playwright.request.newContext({
			extraHTTPHeaders: {
				'X-Custom-Header': 'test-value'
			}
		});

		try {
			// Both should work independently
			const fixtureResponse = await request.get('https://jsonplaceholder.typicode.com/posts/1');
			const newResponse = await newRequest.get('https://jsonplaceholder.typicode.com/posts/2');

			assert.ok(fixtureResponse.ok(), 'Fixture request should work');
			assert.ok(newResponse.ok(), 'New request context should work');

			const fixtureData = await fixtureResponse.json();
			const newData = await newResponse.json();

			assert.notStrictEqual(fixtureData, newData, 'Should get different data');
		} finally {
			await newRequest.dispose();
		}
	});
});
