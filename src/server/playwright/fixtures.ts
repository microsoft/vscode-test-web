/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test as base, expect } from '@playwright/test';
import type { Worker } from '@playwright/test';
import { createVSCodeProxy } from './vscode-proxy';
import type { VSCode } from './vscode-types';

/**
 * Extended Playwright fixtures that provide VSCode API access.
 */
export type VSCodeFixtures = {
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
	vscode: VSCode;
};

/**
 * Extended Playwright test with VSCode fixtures.
 *
 * Import this instead of @playwright/test to get VSCode API access in your tests.
 * The vscode fixture is automatically typed, so no type annotations are needed.
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
	 * Creates and provides the proxied VSCode API.
	 *
	 * This fixture:
	 * 1. Navigates to the VSCode page
	 * 2. Waits for the workbench to load
	 * 3. Waits for the extension host worker to be created
	 * 4. Creates a proxy that accesses the vscode global in the worker
	 * 5. Returns the proxy with Promisified types for fluent API usage
	 */
	vscode: async ({ page }, use) => {
		// Navigate to VSCode and wait for workbench to load
		await page.goto('/');
		await page.locator('.monaco-workbench').waitFor({ timeout: 30000 });

		// Wait for the extension host worker to be created
		// The extension host is where the vscode global API lives
		// Extension host worker name is defined by VSCode in
		// https://github.com/microsoft/vscode/blob/aac80a7d058f79fd273f8890c7711c35af7ea3e2/src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html#L17
		// The worker URL is a blob URL, so we need to check the worker's name property

		let extensionHostWorker: Worker | null = null;

		// Helper to check if a worker is the extension host
		const checkWorker = async (w: Worker): Promise<boolean> => {
			try {
				// @ts-expect-error - self is available in worker context
				const workerName = await w.evaluate(() => (self as any).name);
				if (workerName === 'ExtensionHostWorker') {
					extensionHostWorker = w;
					return true;
				}
			} catch (e) {
				// Worker might be closing, ignore
			}
			return false;
		};

		// First check existing workers
		for (const worker of page.workers()) {
			if (await checkWorker(worker)) {
				break;
			}
		}

		// If not found, listen for new workers
		if (!extensionHostWorker) {
			const workerHandler = async (w: Worker) => {
				await checkWorker(w);
			};

			page.on('worker', workerHandler);

			// Wait for the extension host worker to be found
			const startTime = Date.now();
			const timeout = 30000;

			while (!extensionHostWorker && (Date.now() - startTime) < timeout) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			page.off('worker', workerHandler);
		}

		if (!extensionHostWorker) {
			throw new Error('Extension host worker not found within timeout');
		}

		const vscodeProxy: VSCode = await createVSCodeProxy(extensionHostWorker);
		await use(vscodeProxy);

		// TODO: Cleanup handles if needed
	}
});

// Re-export expect for convenience
export { expect };
