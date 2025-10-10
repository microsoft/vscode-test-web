/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Playwright API bridge for extension tests
 *
 * This module provides access to Playwright capabilities from within extension tests
 * running in a Web Worker context. It communicates with the main page via postMessage.
 *
 * @example
 * ```typescript
 * import * as playwright from '@vscode/test-web/out/test-helpers/playwright';
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

let requestId = 0;

interface PlaywrightMessage {
	type: string;
	[key: string]: any;
}

interface PlaywrightResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

// Initialize BroadcastChannel for communication with main page
// @ts-ignore - BroadcastChannel is available in worker context
const channel = new BroadcastChannel('playwright-bridge');

/**
 * Send a message to the Playwright bridge and wait for response
 */
function sendPlaywrightMessage(message: PlaywrightMessage): Promise<PlaywrightResult> {
	return new Promise((resolve, reject) => {
		const id = ++requestId;
		const timeout = setTimeout(() => {
			reject(new Error('Playwright bridge timeout - is the bridge initialized?'));
		}, 30000);

		const handler = (event: MessageEvent) => {
			if (event.data && event.data.__playwrightResponse && event.data.id === id) {
				clearTimeout(timeout);
				channel.removeEventListener('message', handler);
				resolve(event.data.result);
			}
		};

		channel.addEventListener('message', handler);

		// Send message via BroadcastChannel
		channel.postMessage({
			__playwrightRequest: true,
			id,
			message
		});
	});
}

/**
 * Check if response was successful, throw error if not
 */
function checkResult<T>(result: PlaywrightResult): T {
	if (!result.success) {
		throw new Error(`Playwright operation failed: ${result.error}`);
	}
	return result.data as T;
}

export interface ScreenshotOptions {
	/**
	 * The file path to save the image to. If not specified, image is returned as base64.
	 */
	path?: string;

	/**
	 * The type of screenshot, defaults to 'png'.
	 */
	type?: 'png' | 'jpeg';

	/**
	 * The quality of the image, between 0-100. Not applicable to png images.
	 */
	quality?: number;

	/**
	 * Hides default white background and allows capturing screenshots with transparency.
	 */
	omitBackground?: boolean;

	/**
	 * An object which specifies clipping of the resulting image.
	 */
	clip?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};

	/**
	 * When true, takes a screenshot of the full scrollable page. Defaults to false.
	 */
	fullPage?: boolean;
}

/**
 * Takes a screenshot of the page
 * @returns base64-encoded PNG image
 */
export async function screenshot(options?: ScreenshotOptions): Promise<string> {
	const result = await sendPlaywrightMessage({ type: 'screenshot', options });
	return checkResult<string>(result);
}

/**
 * Waits for a selector to appear in the DOM
 * @param selector CSS selector
 * @param options Options for waiting
 * @returns true if element was found
 */
export async function waitForSelector(
	selector: string,
	options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'waitForSelector', selector, options });
	return checkResult<boolean>(result);
}

/**
 * Checks if an element matching the selector exists
 * @param selector CSS selector
 * @returns true if element exists
 */
export async function querySelector(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'querySelector', selector });
	return checkResult<boolean>(result);
}

/**
 * Counts elements matching the selector
 * @param selector CSS selector
 * @returns number of matching elements
 */
export async function querySelectorAll(selector: string): Promise<number> {
	const result = await sendPlaywrightMessage({ type: 'querySelectorAll', selector });
	return checkResult<number>(result);
}

/**
 * Clicks an element matching the selector
 * @param selector CSS selector
 * @param options Click options
 */
export async function click(
	selector: string,
	options?: { timeout?: number; force?: boolean }
): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'click', selector, options });
	checkResult<void>(result);
}

/**
 * Fills an input element
 * @param selector CSS selector
 * @param value Value to fill
 * @param options Fill options
 */
export async function fill(
	selector: string,
	value: string,
	options?: { timeout?: number; force?: boolean }
): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'fill', selector, value, options });
	checkResult<void>(result);
}

/**
 * Gets the text content of an element
 * @param selector CSS selector
 * @returns text content or null
 */
export async function textContent(selector: string): Promise<string | null> {
	const result = await sendPlaywrightMessage({ type: 'textContent', selector });
	return checkResult<string | null>(result);
}

/**
 * Gets an attribute value from an element
 * @param selector CSS selector
 * @param name Attribute name
 * @returns attribute value or null
 */
export async function getAttribute(selector: string, name: string): Promise<string | null> {
	const result = await sendPlaywrightMessage({ type: 'getAttribute', selector, name });
	return checkResult<string | null>(result);
}

/**
 * Checks if an element is visible
 * @param selector CSS selector
 * @returns true if visible
 */
export async function isVisible(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'isVisible', selector });
	return checkResult<boolean>(result);
}

/**
 * Checks if an element is hidden
 * @param selector CSS selector
 * @returns true if hidden
 */
export async function isHidden(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'isHidden', selector });
	return checkResult<boolean>(result);
}

/**
 * Evaluates a function in the page context
 * @param pageFunction Function to evaluate (as string)
 * @param arg Argument to pass to the function
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const title = await evaluate('() => document.title');
 * const computed = await evaluate('(x) => x * 2', 5);
 * ```
 */
export async function evaluate<T = unknown>(pageFunction: string, arg?: unknown): Promise<T> {
	const result = await sendPlaywrightMessage({ type: 'evaluate', script: pageFunction, arg });
	return checkResult<T>(result);
}

/**
 * Waits for a specified timeout
 * @param timeout Timeout in milliseconds
 */
export async function waitForTimeout(timeout: number): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'waitForTimeout', timeout });
	checkResult<void>(result);
}

/**
 * Keyboard utilities
 */
export const keyboard = {
	/**
	 * Presses a key
	 * @param key Key name (e.g., 'Enter', 'ArrowDown', 'Control')
	 * @param options Press options
	 */
	async press(key: string, options?: { delay?: number }): Promise<void> {
		const result = await sendPlaywrightMessage({ type: 'keyboard.press', key, options });
		checkResult<void>(result);
	},

	/**
	 * Types text
	 * @param text Text to type
	 * @param options Type options
	 */
	async type(text: string, options?: { delay?: number }): Promise<void> {
		const result = await sendPlaywrightMessage({ type: 'keyboard.type', text, options });
		checkResult<void>(result);
	}
};
