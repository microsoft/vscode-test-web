/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';
import { readFileInRepo } from './download';

/**
 * Serializable result from Playwright operations
 */
export interface PlaywrightResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

/**
 * Message types for Playwright API calls
 */
export type PlaywrightMessage =
	| { type: 'screenshot'; options?: playwright.PageScreenshotOptions }
	| { type: 'waitForSelector'; selector: string; options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' } }
	| { type: 'querySelector'; selector: string }
	| { type: 'querySelectorAll'; selector: string }
	| { type: 'click'; selector: string; options?: { timeout?: number; force?: boolean } }
	| { type: 'fill'; selector: string; value: string; options?: { timeout?: number; force?: boolean } }
	| { type: 'textContent'; selector: string }
	| { type: 'getAttribute'; selector: string; name: string }
	| { type: 'isVisible'; selector: string }
	| { type: 'isHidden'; selector: string }
	| { type: 'evaluate'; script: string; arg?: unknown }
	| { type: 'waitForTimeout'; timeout: number }
	| { type: 'keyboard.press'; key: string; options?: { delay?: number } }
	| { type: 'keyboard.type'; text: string; options?: { delay?: number } };

/**
 * Sets up the Playwright bridge by exposing functions that can be called from the browser
 */
export function setupPlaywrightBridge(page: playwright.Page, browser: playwright.Browser): void {
	// Expose a function that handles all Playwright API calls
	page.exposeFunction('__playwrightBridge', async (message: PlaywrightMessage): Promise<PlaywrightResult> => {
		try {
			switch (message.type) {
				case 'screenshot': {
					const screenshot = await page.screenshot(message.options);
					// Convert Buffer to base64 for transmission
					const base64 = screenshot.toString('base64');
					return { success: true, data: base64 };
				}

				case 'waitForSelector': {
					const element = await page.waitForSelector(message.selector, message.options as any);
					return { success: true, data: element !== null };
				}

				case 'querySelector': {
					const element = await page.$(message.selector);
					return { success: true, data: element !== null };
				}

				case 'querySelectorAll': {
					const elements = await page.$$(message.selector);
					return { success: true, data: elements.length };
				}

				case 'click': {
					await page.click(message.selector, message.options as any);
					return { success: true };
				}

				case 'fill': {
					await page.fill(message.selector, message.value, message.options as any);
					return { success: true };
				}

				case 'textContent': {
					const text = await page.textContent(message.selector);
					return { success: true, data: text };
				}

				case 'getAttribute': {
					const value = await page.getAttribute(message.selector, message.name);
					return { success: true, data: value };
				}

				case 'isVisible': {
					const visible = await page.isVisible(message.selector);
					return { success: true, data: visible };
				}

				case 'isHidden': {
					const hidden = await page.isHidden(message.selector);
					return { success: true, data: hidden };
				}

				case 'evaluate': {
					// eslint-disable-next-line no-new-func
					const fn = new Function('arg', `return (${message.script})(arg)`);
					const result = await page.evaluate(fn as any, message.arg);
					return { success: true, data: result };
				}

				case 'waitForTimeout': {
					await page.waitForTimeout(message.timeout);
					return { success: true };
				}

				case 'keyboard.press': {
					await page.keyboard.press(message.key, message.options);
					return { success: true };
				}

				case 'keyboard.type': {
					await page.keyboard.type(message.text, message.options);
					return { success: true };
				}

				default:
					return { success: false, error: `Unknown message type: ${(message as { type: string }).type}` };
			}
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	});
}

/**
 * Gets the client-side code that gets injected into the main page to bridge communication
 * between Web Workers and the Playwright API
 * 
 * @param esm Whether to use ESM or AMD version (defaults to AMD for compatibility)
 */
export async function getPlaywrightBridgeClientCode(esm: boolean = false): Promise<string> {
	// Read the compiled JavaScript file (similar to how workbench.ts reads main.js)
	const modulePath = esm ? 'out/browser/esm/playwright-bridge-client.js' : 'out/browser/amd/playwright-bridge-client.js';
	return await readFileInRepo(modulePath);
}
