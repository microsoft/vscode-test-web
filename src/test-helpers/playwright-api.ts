/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This module provides the implementation of the Playwright API that gets
 * injected into the vscode namespace. It communicates with the Playwright
 * bridge running on the main page via BroadcastChannel.
 *
 * Uses Playwright types to ensure 100% API compatibility.
 */

import type { Page, ElementHandle } from 'playwright';

let requestId = 0;

interface PlaywrightMessage {
	target: string;
	method: string;
	args?: unknown[];
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
 * Serialize arguments for transmission (convert functions to strings)
 */
function serializeArgs(args: unknown[]): unknown[] {
	return args.map(arg => {
		// Convert functions to their string representation
		if (typeof arg === 'function') {
			return { __function: arg.toString() };
		}
		// Recursively serialize arrays
		if (Array.isArray(arg)) {
			return serializeArgs(arg);
		}
		return arg;
	});
}

/**
 * Send a message to the Playwright bridge and wait for response
 */
function sendPlaywrightMessage(target: string, method: string, args: unknown[] = []): Promise<PlaywrightResult> {
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

		// Serialize arguments (convert functions to strings)
		const serializedArgs = serializeArgs(args);

		// Send message via BroadcastChannel
		const message: PlaywrightMessage = { target, method, args: serializedArgs };
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

/**
 * Helper to unwrap results and convert handle references to proxies
 */
function unwrapResult(data: unknown): unknown {
	// Check if it's a handle reference
	if (data && typeof data === 'object' && '__handleId' in data) {
		return createElementHandleProxy((data as any).__handleId);
	}

	// If it's an array, unwrap each element
	if (Array.isArray(data)) {
		return data.map(unwrapResult);
	}

	return data;
}

/**
 * Creates a proxy for an ElementHandle that dynamically forwards all method calls
 */
function createElementHandleProxy(handleId: string): ElementHandle {
	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			// Handle special properties
			if (prop === 'then') {
				// Not a promise
				return undefined;
			}
			if (prop === Symbol.toStringTag) {
				return 'ElementHandle';
			}

			// Return a function that forwards the method call
			return async (...args: unknown[]) => {
				const result = await sendPlaywrightMessage(handleId, prop as string, args);
				return unwrapResult(checkResult(result));
			};
		}
	};

	return new Proxy({}, handler) as ElementHandle;
}

/**
 * Creates a proxy for the Page object that dynamically forwards all method calls
 */
function createPageProxy(): Page {
	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			// Handle special properties
			if (prop === 'then') {
				return undefined;
			}
			if (prop === Symbol.toStringTag) {
				return 'Page';
			}

			// Return nested proxies for objects like keyboard, mouse, etc.
			if (prop === 'keyboard' || prop === 'mouse' || prop === 'touchscreen') {
				return createNestedProxy(`page.${prop as string}`);
			}

			// Return a function that forwards the method call
			return async (...args: unknown[]) => {
				const result = await sendPlaywrightMessage('page', prop as string, args);
				return unwrapResult(checkResult(result));
			};
		}
	};

	return new Proxy({}, handler) as Page;
}

/**
 * Creates a proxy for nested objects like page.keyboard
 */
function createNestedProxy(target: string): any {
	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			if (prop === 'then') {
				return undefined;
			}

			return async (...args: unknown[]) => {
				const result = await sendPlaywrightMessage(target, prop as string, args);
				return unwrapResult(checkResult(result));
			};
		}
	};

	return new Proxy({}, handler);
}

/**
 * The main page object that provides access to all Playwright Page APIs
 * Use this to access any Playwright Page method dynamically
 *
 * @example
 * ```typescript
 * import { page } from '@vscode/test-web/playwright';
 *
 * // Query elements
 * const elements = await page.$$('.selector');
 * const element = await page.$('.selector');
 *
 * // Interact with page
 * await page.click('.button');
 * await page.fill('input', 'text');
 *
 * // Use keyboard
 * await page.keyboard.press('Enter');
 *
 * // Take screenshot
 * const screenshot = await page.screenshot({ fullPage: true });
 * ```
 */
export const page: Page = createPageProxy();
