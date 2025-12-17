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
 * import { test, expect, startVSCodeServer } from '@vscode/test-web/playwright';
 *
 * test('workspace folders', async ({ vscode }) => {
 *   const folders = await vscode.workspace.workspaceFolders;
 *   expect(folders).toBeDefined();
 *   expect(folders.length).toBeGreaterThan(0);
 * });
 * ```
 */

export { test, expect } from './fixtures';
export { createVSCodeProxy } from './vscode-proxy';
export type { VSCodeAPI, Promisify } from './vscode-types';
export { startVSCodeServer, type StartServerOptions, type VSCodeServerInfo } from './server';
