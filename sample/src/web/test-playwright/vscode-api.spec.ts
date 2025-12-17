// Import test and expect from local @playwright/test (not from parent package)
// This avoids the "requiring @playwright/test second time" error
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createVSCodeProxy } from '@vscode/test-web/out/playwright/vscode-proxy';
import type { Worker } from '@playwright/test';

// Create the vscode fixture locally to avoid double-import
const test = base.extend<{ vscode: any }>({
	vscode: async ({ page }: { page: Page }, use: (r: any) => Promise<void>) => {
		// Navigate to VSCode
		await page.goto('/');
		await page.locator('.monaco-workbench').waitFor({ timeout: 30000 });

		// Wait a bit for workers to initialize
		await page.waitForTimeout(3000);

		// Also wait for the bridge to initialize by checking console logs
		// The bridge logs "[Playwright Bridge] VSCode API exposed..."
		let bridgeInitialized = false;
		page.on('console', msg => {
			const text = msg.text();
			console.log('Browser console:', text);
			if (text.includes('[Playwright Bridge]')) {
				bridgeInitialized = true;
			}
		});

		// Wait up to 10 seconds for bridge to initialize
		const startTime = Date.now();
		while (!bridgeInitialized && (Date.now() - startTime) < 10000) {
			await page.waitForTimeout(100);
		}

		console.log('Bridge initialized:', bridgeInitialized);

		// Check all workers to find the one with vscode global
		const workers = page.workers();
		console.log(`Found ${workers.length} workers total`);

		let extensionHostWorker: Worker | null = null;
		for (const worker of workers) {
			console.log(`Checking worker: ${worker.url()}`);

			// Check if the bridge has exposed the vscode API
			const checks = await worker.evaluate(() => {
				// Try to manually call the bridge's run() function if it exists
				let runResult = 'not found';
				try {
					// Check if there's a run function we can call
					if (typeof (self as any).run === 'function') {
						runResult = 'found and callable';
						(self as any).run();
					}
				} catch (e) {
					runResult = `error: ${e}`;
				}

				return {
					hasVscodeApi: typeof (globalThis as any).__vscodeApiForPlaywright !== 'undefined',
					hasRequire: typeof (globalThis as any).require !== 'undefined',
					requireType: typeof (globalThis as any).require,
					vscodeApiType: typeof (globalThis as any).__vscodeApiForPlaywright,
					runFunctionCheck: runResult
				};
			});

			console.log(`  Worker checks:`, JSON.stringify(checks, null, 2));

			if (checks.hasVscodeApi) {
				extensionHostWorker = worker;
				break;
			}
		}

		if (!extensionHostWorker) {
			throw new Error('Could not find extension host worker with vscode API');
		}

		console.log('Found extension host worker:', extensionHostWorker.url());

		// Create the proxy
		const vscodeProxy = await createVSCodeProxy(extensionHostWorker);
		console.log('VSCode proxy created:', vscodeProxy);
		await use(vscodeProxy);
	}
});

test.describe('VSCode API Proxy - Phase 2', () => {
	test('should access workspace.workspaceFolders', async ({ vscode }) => {
		// Access workspace folders via proxied API
		const folders = await vscode.workspace.workspaceFolders;

		console.log('Workspace folders:', folders);

		// Verify we got an array
		expect(folders).toBeDefined();
		expect(Array.isArray(folders)).toBe(true);
		expect(folders.length).toBeGreaterThan(0);

		// Check folder structure
		const firstFolder = folders[0];
		expect(firstFolder).toHaveProperty('uri');
		expect(firstFolder).toHaveProperty('name');
		expect(firstFolder).toHaveProperty('index');
	});

	test('should access Uri.parse() static method', async ({ vscode }) => {
		// Call static method on Uri class
		const uri = await vscode.Uri.parse('file:///path/to/file.txt');

		console.log('Parsed URI:', uri);

		// Verify URI structure
		expect(uri).toBeDefined();
		expect(uri).toHaveProperty('scheme');
		expect(uri).toHaveProperty('path');
		expect(uri.scheme).toBe('file');
		expect(uri.path).toBe('/path/to/file.txt');
	});

	test('should access Uri.joinPath() with fluent chaining', async ({ vscode }) => {
		// Get workspace folder first
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;

		// Use Uri.joinPath to create new URI
		const fileUri = await vscode.Uri.joinPath(folderUri, 'test.txt');

		console.log('Joined URI:', fileUri);

		// Verify joined URI
		expect(fileUri).toBeDefined();
		expect(fileUri).toHaveProperty('path');
		expect(fileUri.path).toContain('test.txt');
	});

	test('should call workspace.fs.stat()', async ({ vscode }) => {
		// Get workspace folder URI
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;

		// Create a file URI
		const fileUri = await vscode.Uri.joinPath(folderUri, 'hello.txt');

		// Call fs.stat to get file stats
		const stats = await vscode.workspace.fs.stat(fileUri);

		console.log('File stats:', stats);

		// Verify stats structure
		expect(stats).toBeDefined();
		expect(stats).toHaveProperty('type');
		expect(stats).toHaveProperty('size');
		expect(stats).toHaveProperty('mtime');
		expect(stats).toHaveProperty('ctime');
	});

	test('should read file contents with workspace.fs.readFile()', async ({ vscode }) => {
		// Get workspace folder and create file URI
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;
		const fileUri = await vscode.Uri.joinPath(folderUri, 'hello.txt');

		// Read file contents
		const contentArray = await vscode.workspace.fs.readFile(fileUri);

		console.log('File content length:', contentArray.length);

		// Decode to string
		const decoder = new TextDecoder();
		const content = decoder.decode(contentArray);

		console.log('File content:', content);

		// Verify content
		expect(contentArray).toBeDefined();
		expect(contentArray.length).toBeGreaterThan(0);
		expect(content).toContain('hello');
	});
});
