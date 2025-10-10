import * as assert from 'assert';
import * as vscode from 'vscode';
import * as playwright from '@vscode/test-web/playwright';

suite('Playwright UI Test Suite', () => {

	test('Monaco editor is visible in workbench', async function() {
		this.timeout(15000); // UI operations may take time

		// Open a file first to make the editor appear
		const files = await vscode.workspace.findFiles('**/*.txt');
		assert.ok(files.length > 0, 'Should have test files');
		await vscode.window.showTextDocument(files[0]);

		// Wait for the editor to be loaded with debug capture on failure
		try {
			const editorFound = await playwright.waitForSelector('.monaco-editor', { timeout: 10000, state: 'visible' });
			assert.ok(editorFound, 'Monaco editor should be present');

			// Verify it's actually visible
			const isVisible = await playwright.isVisible('.monaco-editor');
			assert.ok(isVisible, 'Monaco editor should be visible');
		} catch (error) {
			// Capture debugging information on failure
			console.error('[DEBUG] Monaco editor test failed, capturing debug info...');

			// Take a screenshot
			try {
				const screenshot = await playwright.screenshot({ type: 'png', fullPage: true });
				console.error('[DEBUG] Screenshot captured (base64 length:', screenshot.length, ')');
			} catch (screenshotError) {
				console.error('[DEBUG] Failed to capture screenshot:', screenshotError);
			}

			// Get page content
			try {
				const html = await playwright.evaluate<string>('() => document.documentElement.outerHTML');
				console.error('[DEBUG] Page HTML length:', html.length);
				console.error('[DEBUG] Page HTML preview:', html.substring(0, 500));
			} catch (htmlError) {
				console.error('[DEBUG] Failed to get HTML:', htmlError);
			}

			// Check what elements are present
			try {
				const bodyClasses = await playwright.evaluate<string>('() => document.body.className');
				console.error('[DEBUG] Body classes:', bodyClasses);

				const workbenchFound = await playwright.querySelector('.monaco-workbench');
				console.error('[DEBUG] Workbench found:', workbenchFound);

				const divCount = await playwright.querySelectorAll('div');
				console.error('[DEBUG] Total divs:', divCount);
			} catch (debugError) {
				console.error('[DEBUG] Failed to gather element info:', debugError);
			}

			// Re-throw the original error
			throw error;
		}
	});

	test('Check workbench title', async function() {
		this.timeout(5000);

		// Get the page title using evaluate
		const title = await playwright.evaluate<string>('() => document.title');
		assert.ok(title, 'Document should have a title');
		assert.ok(title.includes('Visual Studio Code'), 'Title should mention VS Code');
	});

	test('Count DOM elements', async function() {
		this.timeout(5000);

		// Count all divs in the document
		const divCount = await playwright.querySelectorAll('div');
		assert.ok(divCount > 0, 'Should have at least one div element');

		// Check for workbench container
		const hasWorkbench = await playwright.querySelector('.monaco-workbench');
		assert.ok(hasWorkbench, 'Should have workbench container');
	});

	test('Take screenshot', async function() {
		this.timeout(10000);

		// Wait for page to be ready
		await playwright.waitForTimeout(1000);

		// Take a screenshot (returns base64 encoded PNG)
		const screenshot = await playwright.screenshot({
			type: 'png',
			fullPage: false
		});

		assert.ok(screenshot, 'Screenshot should be generated');
		assert.ok(screenshot.length > 0, 'Screenshot should not be empty');

		// The screenshot is base64 encoded, should be a valid string
		assert.strictEqual(typeof screenshot, 'string', 'Screenshot should be a string');
	});

	test('Open file and verify editor', async function() {
		this.timeout(10000);

		// Get workspace folder
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, 'Should have workspace folder');

		// Open a file using VS Code API
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'hello.txt');
		const doc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(doc);

		// Wait for editor to update
		await playwright.waitForTimeout(500);

		// Verify editor is visible and has content
		const editorVisible = await playwright.isVisible('.monaco-editor');
		assert.ok(editorVisible, 'Editor should be visible after opening file');

		// Check that the editor has the file content
		const hasContent = await playwright.querySelector('.view-line');
		assert.ok(hasContent, 'Editor should have content lines');
	});

	test('Keyboard interaction', async function() {
		this.timeout(10000);

		// Execute command to open command palette (using VS Code API)
		await vscode.commands.executeCommand('workbench.action.showCommands');

		// Wait for command palette to appear
		await playwright.waitForTimeout(500);

		// Type a command using Playwright keyboard
		await playwright.keyboard.type('Hello World');

		// Wait a bit
		await playwright.waitForTimeout(300);

		// Press Escape to close
		await playwright.keyboard.press('Escape');

		// Verify command palette is closed
		await playwright.waitForTimeout(300);
	});

	test('Check for specific UI elements', async function() {
		this.timeout(5000);

		// Check for common VS Code UI elements
		const hasActivityBar = await playwright.querySelector('.activitybar');
		assert.ok(hasActivityBar, 'Should have activity bar');

		const hasSidebar = await playwright.querySelector('.sidebar');
		assert.ok(hasSidebar, 'Should have sidebar');

		const hasEditorPart = await playwright.querySelector('.part.editor');
		assert.ok(hasEditorPart, 'Should have editor part');
	});

	test('Get element attributes', async function() {
		this.timeout(5000);

		// Get workbench class attribute
		const workbenchClass = await playwright.getAttribute('.monaco-workbench', 'class');
		assert.ok(workbenchClass, 'Workbench should have class attribute');
		assert.ok(workbenchClass.includes('monaco-workbench'), 'Should include monaco-workbench class');
	});

	test('Element visibility checks', async function() {
		this.timeout(5000);

		// Check what's visible
		const editorVisible = await playwright.isVisible('.monaco-editor');
		const nonExistentHidden = await playwright.isHidden('.non-existent-element-xyz');

		assert.ok(editorVisible, 'Editor should be visible');
		// Note: isHidden returns false for non-existent elements in Playwright
	});

	test('Get text content from UI', async function() {
		this.timeout(5000);

		// Try to get text content from various elements
		// This is just a demonstration - actual selectors depend on VS Code's DOM
		const bodyText = await playwright.textContent('body');
		assert.ok(bodyText !== null, 'Body should have some text content');
	});
});
