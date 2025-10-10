/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Playwright API bridge for extension tests
 *
 * This module provides access to Playwright capabilities from within extension tests
 * running in a Web Worker context. It communicates with the main page via BroadcastChannel.
 *
 * @example
 * ```typescript
 * import * as playwright from '@vscode/test-web/playwright';
 *
 * test('UI element is visible', async () => {
 *   const isVisible = await playwright.isVisible('.monaco-editor');
 *   assert.ok(isVisible, 'Editor should be visible');
 * });
 *
 * test('Take screenshot', async () => {
 *   const screenshot = await playwright.screenshot({ path: 'test.png' });
 *   // screenshot is base64 encoded PNG
 * });
 * ```
 */

// Re-export everything from the implementation
export * from './playwright-api';
