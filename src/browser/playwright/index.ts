/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Declare require for webpack/AMD module loading
declare const require: {
	(moduleId: string): any;
};

/**
 * Exposes the VSCode API on globalThis for Playwright tests.
 * Call this from your test runner's run() function.
 *
 * @example
 * ```typescript
 * import { exposeVSCodeAPI } from '@vscode/test-web/out/playwright/bridge';
 *
 * export function run(): Promise<void> {
 *   return exposeVSCodeAPI();
 * }
 * ```
 */
export function exposeVSCodeAPI(): Promise<void> {
	return new Promise(() => {
		const vscode = require('vscode');
		(globalThis as any).__vscodeApiForPlaywright = vscode;
	});
}
