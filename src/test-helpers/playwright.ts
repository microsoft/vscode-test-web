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
 * Uses Playwright types to ensure 100% API compatibility.
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

import type { Page, ElementHandle } from 'playwright';
import type {
	PlaywrightResult,
	PlaywrightMessage,
	PlaywrightRequest,
	PlaywrightResponse,
	HandleReference,
	SerializedFunction
} from '../playwright.api';

let requestId = 0;

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
			const serializedFunc: SerializedFunction = { __function: arg.toString() };
			return serializedFunc;
		}
		// Recursively serialize arrays
		if (Array.isArray(arg)) {
			return serializeArgs(arg);
		}
		return arg;
	});
}

/**
 * Type guard to check if message data is a PlaywrightResponse
 */
function isPlaywrightResponse(data: unknown): data is PlaywrightResponse {
	return data !== null && typeof data === 'object' && '__playwrightResponse' in data;
}

/**
 * Send a message to the Playwright bridge and wait for response
 */
function sendPlaywrightMessage(target: string, method: string, args: unknown[] = []): Promise<PlaywrightResult> {
	return new Promise((resolve, reject) => {
		const id = ++requestId;

		let handler: (event: MessageEvent) => void;

		const timeout = setTimeout(() => {
			channel.removeEventListener('message', handler);
			reject(new Error('Playwright bridge timeout - is the bridge initialized?'));
		}, 30000);

		handler = (event: MessageEvent) => {
			if (isPlaywrightResponse(event.data) && event.data.id === id) {
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
		const request: PlaywrightRequest = {
			__playwrightRequest: true,
			id,
			message
		};
		channel.postMessage(request);
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
 * Type guard to check if data is a HandleReference
 */
function isHandleReference(data: unknown): data is HandleReference {
	return data !== null && typeof data === 'object' && '__handleId' in data;
}

/**
 * Helper to unwrap results and convert handle references to proxies
 */
function unwrapResult(data: unknown): unknown {
	// Check if it's a handle reference
	if (isHandleReference(data)) {
		return createElementHandleProxy(data.__handleId);
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
 * Creates a dynamic proxy that can handle both method calls and nested property access
 * This detects at runtime whether a property is a method or a nested object
 */
function createDynamicProxy(target: string): any {
	const cache = new Map<string | symbol, any>();

	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			// Handle special properties
			if (prop === 'then') {
				return undefined;
			}
			if (prop === Symbol.toStringTag) {
				return target.split('.').pop() || 'Object';
			}

			// Check cache first to maintain identity for nested objects
			if (cache.has(prop)) {
				return cache.get(prop);
			}

			// Create a function that calls the method on the target
			const methodFunction = async (...args: unknown[]) => {
				const result = await sendPlaywrightMessage(target, prop as string, args);
				return unwrapResult(checkResult(result));
			};

			// Wrap the function in a proxy that can also handle nested property access
			// This allows both: page.click() AND page.keyboard.type()
			const proxiedFunction = new Proxy(methodFunction, {
				get(_funcTarget, nestedProp) {
					// Handle special properties on the function itself
					if (nestedProp === 'then') {
						return undefined;
					}
					if (nestedProp === Symbol.toStringTag) {
						return 'Function';
					}

					// For nested property access, create a new proxy for the nested target
					// This handles cases like page.keyboard.type()
					const nestedTarget = `${target}.${prop as string}`;
					return createDynamicProxy(nestedTarget)[nestedProp];
				}
			});

			cache.set(prop, proxiedFunction);
			return proxiedFunction;
		}
	};

	return new Proxy({}, handler);
}

/**
 * The main page object that provides access to all Playwright Page APIs
 * Use this to access any Playwright Page method dynamically
 *
 * All properties and methods are resolved at runtime, making this 100% forward-compatible
 * with any future Playwright API additions. Works recursively for nested objects like
 * keyboard, mouse, touchscreen, request, etc.
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
 * // Use keyboard (dynamically proxied)
 * await page.keyboard.press('Enter');
 *
 * // Use any nested API (dynamically proxied)
 * await page.mouse.click(100, 200);
 * await page.touchscreen.tap(100, 200);
 *
 * // Take screenshot
 * const screenshot = await page.screenshot({ fullPage: true });
 * ```
 */
export const page: Page = createDynamicProxy('page') as Page;

/** Internal: get current server registry size */
export async function __registrySize(): Promise<number> {
	const result = await sendPlaywrightMessage('__registry', 'size');
	return checkResult<number>(result);
}

/** Internal: clear server registry */
export async function __clearRegistry(): Promise<void> {
	const result = await sendPlaywrightMessage('__registry', 'clear');
	checkResult<boolean>(result);
}

// Install a root-level beforeEach to clear server registry between tests (opaque to users)
// This preserves a clean handle space per test while reusing the same page proxy.
// Safe: runs before user-defined beforeEach hooks in nested suites.
// Ignore if mocha not present (e.g., outside test environment).
try {
	const mochaGlobal: any = (globalThis as any).mocha;
	if (mochaGlobal?.suite && !mochaGlobal.__playwrightRegistryHookInstalled) {
		mochaGlobal.suite.beforeEach(function () {
			return __clearRegistry();
		});
		mochaGlobal.__playwrightRegistryHookInstalled = true;
	}
} catch {
	// Ignore errors if mocha not initialized yet
}
