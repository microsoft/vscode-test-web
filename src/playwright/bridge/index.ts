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
	return new Promise((c, e) => {
		try {
			const vscode = require('vscode');
			(globalThis as any).__vscodeApiForPlaywright = vscode;
			c();
		} catch (err) {
			console.error('[exposeVSCodeAPI] Error:', err);
			e(err);
		}
	});
}

/**
 * Default run function for the bridge module.
 * Automatically exposes the VSCode API when loaded as extensionTestsPath.
 */
export function run(): Promise<void> {
	return exposeVSCodeAPI();
}
