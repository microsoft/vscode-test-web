/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Playwright Test support for @vscode/test-web
 *
 * This module provides Playwright Test fixtures and utilities for testing VSCode web extensions
 * from Node.js using the standard @playwright/test framework.
 *
 * @example
 * ```typescript
 * import { test, expect } from '@vscode/test-web/playwright';
 *
 * test('workspace folders', async ({ vscode }) => {
 *   const folders = await vscode.workspace.workspaceFolders.jsonValue();
 *   expect(folders).toBeDefined();
 *   expect(folders.length).toBeGreaterThan(0);
 * });
 *
 * test('command execution with notification', async ({ vscode, page }) => {
 *   await vscode.commands.executeCommand('myExtension.helloWorld');
 *
 *   // Wait for the notification message to appear
 *   const notification = page.locator('.notification-toast-container');
 *   await expect(notification).toContainText('Hello World');
 * });
 * ```
 */

export { test, expect } from './fixtures';
export { createVSCodeProxy } from './vscode-proxy';
export type { VSCode, FluentJSHandle } from './vscode-types';
export type { VSCodeFixtures } from './fixtures';
export { startVSCodeServer, type StartServerOptions, type VSCodeServerInfo } from './server';
