/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test as base, expect } from '@playwright/test';
import type { Worker } from '@playwright/test';
import { createVSCodeProxy } from './vscode-proxy';
import type { VSCodeAPI } from './vscode-types';

/**
 * Extended Playwright fixtures that provide VSCode API access.
 */
type VSCodeFixtures = {
	/**
	 * The proxied VSCode API.
	 *
	 * This provides access to the vscode global from the extension host worker,
	 * proxied to work in Node.js with a fluent async API.
	 *
	 * @example
	 * ```typescript
	 * test('workspace test', async ({ vscode }) => {
	 *   const folders = await vscode.workspace.workspaceFolders;
	 *   expect(folders.length).toBeGreaterThan(0);
	 * });
	 * ```
	 */
	vscode: VSCodeAPI;

	/**
	 * The VSCode extension host worker.
	 *
	 * This is the web worker where VSCode's extension host runs.
	 * The vscode fixture is created from this worker.
	 */
	vscodeWorker: Worker;
};

/**
 * Extended Playwright test with VSCode fixtures.
 *
 * Import this instead of @playwright/test to get VSCode API access in your tests.
 *
 * @example
 * ```typescript
 * import { test, expect } from '@vscode/test-web/playwright';
 *
 * test('workspace folders', async ({ vscode }) => {
 *   const folders = await vscode.workspace.workspaceFolders;
 *   expect(folders).toBeDefined();
 * });
 * ```
 */
export const test = base.extend<VSCodeFixtures>({
	/**
	 * Detects and provides the VSCode extension host worker.
	 *
	 * This fixture:
	 * 1. Navigates to the VSCode page
	 * 2. Waits for the workbench to load
	 * 3. Waits for the extension host worker to be created
	 * 4. Returns the worker for use by other fixtures
	 */
	vscodeWorker: async ({ page }, use) => {
		// Navigate to VSCode (server started by playwright.config.ts)
		await page.goto('/');

		// Wait for VSCode workbench to load
		await page.locator('.monaco-workbench').waitFor({ timeout: 30000 });

		// Wait for the extension host worker to be created
		// The extension host is where the vscode global API lives
		const worker = await page.waitForEvent('worker', {
			predicate: (w: Worker) => {
				const url = w.url();
				// Extension host workers typically have these patterns in their URL
				return url.includes('extensionHost') ||
				       url.includes('workbench') ||
				       url.startsWith('blob:');
			},
			timeout: 30000
		});

		await use(worker);
	},

	/**
	 * Creates and provides the proxied VSCode API.
	 *
	 * This fixture:
	 * 1. Takes the extension host worker from the vscodeWorker fixture
	 * 2. Creates a proxy that accesses the vscode global in the worker
	 * 3. Returns the proxy with Promisified types for fluent API usage
	 */
	vscode: async ({ vscodeWorker }, use) => {
		const vscodeProxy = await createVSCodeProxy(vscodeWorker);
		await use(vscodeProxy);
		// TODO: Cleanup handles if needed
	}
});

// Re-export expect for convenience
export { expect };
