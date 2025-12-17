import { exposeVSCodeAPI } from '@vscode/test-web/playwright/bridge';

/**
 * Test runner entry point for Playwright tests.
 * This exposes the VSCode API to Playwright tests via globalThis.__vscodeApiForPlaywright
 */
export function run(): Promise<void> {
	return exposeVSCodeAPI();
}
