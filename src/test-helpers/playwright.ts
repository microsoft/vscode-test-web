/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Playwright Test integration for @vscode/test-web.
 *
 * This module provides @playwright/test style fixtures for extension tests running
 * in a Web Worker context. It communicates with the main page via BroadcastChannel
 * to access server-side Playwright instances.
 *
 * ## Usage Pattern
 *
 * Use the `test` function to define tests with fixtures:
 *
 * ```typescript
 * import { test, playwright } from '@vscode/test-web/playwright';
 *
 * test('UI element is visible', async ({ page }) => {
 *   const element = await page.$('.monaco-editor');
 *   assert.ok(element, 'Editor should be present');
 * });
 *
 * test('Use keyboard', async ({ page }) => {
 *   await page.keyboard.type('Hello');
 *   await page.keyboard.press('Enter');
 * });
 *
 * test('Make API requests with fixture', async ({ request }) => {
 *   const response = await request.get('https://api.example.com/data');
 *   assert.ok(response.ok());
 * });
 *
 * test('Create new request context', async () => {
 *   const request = await playwright.request.newContext();
 *   const response = await request.get('https://api.example.com/data');
 *   assert.ok(response.ok());
 *   await request.dispose();
 * });
 *
 * test('Use context', async ({ context }) => {
 *   await context.grantPermissions(['clipboard-read']);
 * });
 * ```
 *
 * ## Available Fixtures
 *
 * - `page`: Playwright Page instance for interacting with VS Code workbench
 * - `context`: Playwright BrowserContext instance for context-level operations
 * - `request`: Playwright APIRequestContext instance for making HTTP API requests
 * - `playwright`: Playwright library object for creating new contexts and accessing browser types
 *
 * All fixtures are dynamically proxied - any fixture property available on the
 * server-side context object will be accessible in tests.
 */

import type { ElementHandle } from 'playwright';
import type { PlaywrightTestArgs } from '@playwright/test';
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
 * Create a fixtures proxy that dynamically resolves fixture properties
 * from the server-side context object.
 */
function createFixturesProxy(): PlaywrightTestArgs {
	const cache = new Map<string | symbol, any>();

	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			// Handle special properties
			if (prop === 'then') {
				return undefined;
			}
			if (prop === Symbol.toStringTag) {
				return 'PlaywrightTestArgs';
			}

			// Check cache first to maintain identity
			if (cache.has(prop)) {
				return cache.get(prop);
			}

			// Create dynamic proxy for this fixture (e.g., 'page', 'browser')
			const fixtureProxy = createDynamicProxy(prop as string);
			cache.set(prop, fixtureProxy);
			return fixtureProxy;
		}
	};

	return new Proxy({}, handler) as PlaywrightTestArgs;
}

// Install a root-level beforeEach to clear server registry between tests (opaque to users)
// This preserves a clean handle space per test while reusing the same page proxy.
// Safe: runs before user-defined beforeEach hooks in nested suites.
// Ignore if mocha not present (e.g., outside test environment).
let __autoClearRegistry = true;

/**
 * Internal function to get registry size.
 */
async function __getRegistrySize(): Promise<number> {
	const result = await sendPlaywrightMessage('__registry', 'size');
	return checkResult<number>(result);
}

/**
 * Internal function to clear registry.
 */
async function clearRegistry(): Promise<void> {
	const result = await sendPlaywrightMessage('__registry', 'clear');
	checkResult<boolean>(result);
}

/**
 * Internal function to disable auto clear.
 */
function disableAutoClearRegistry(): void {
	__autoClearRegistry = false;
}

/**
 * Internal function to enable auto clear.
 */
function enableAutoClearRegistry(): void {
	__autoClearRegistry = true;
}

/**
 * Registry management API for diagnostics and testing.
 *
 * This object provides internal APIs for managing the server-side handle registry.
 * These are primarily useful for:
 * - Framework/integration testing
 * - Debugging handle leaks
 * - Advanced test scenarios requiring cross-test handle persistence
 *
 * **Note**: These are internal diagnostic APIs and not part of the standard Playwright
 * Test fixtures. Most users will never need to use these functions.
 *
 * @example
 * ```typescript
 * import { test, playwrightRegistry } from '@vscode/test-web/playwright';
 *
 * test('diagnostic test', async ({ page }) => {
 *   const sizeBefore = await playwrightRegistry.getSize();
 *   const element = await page.$('.selector');
 *   const sizeAfter = await playwrightRegistry.getSize();
 *   assert.strictEqual(sizeAfter, sizeBefore + 1);
 * });
 *
 * test('persist handles across tests', async ({ page }) => {
 *   playwrightRegistry.disableAutoClear();
 *   // handles will persist...
 *   playwrightRegistry.enableAutoClear(); // restore default
 * });
 * ```
 */
export const playwrightRegistry = {
	/**
	 * Get the current number of active Playwright handle entries stored on the server.
	 *
	 * Each ElementHandle / Locator (and any other non‑serializable Playwright object the
	 * bridge returns) is stored server‑side with a generated `handle_<n>` id. The size
	 * reported here reflects how many such entries are presently retained.
	 *
	 * Default behavior (with auto clear enabled) is that this returns 0 at the start of
	 * every test. It will grow as you obtain new element/locator handles inside a test.
	 *
	 * Use cases:
	 * - Diagnostics in tests (e.g. ensuring you are not leaking handles when auto clear is disabled)
	 * - Asserting expected handle creation in framework / integration tests.
	 *
	 * NOTE: If you have disabled auto clearing via {@link disableAutoClear}, the
	 * value can grow across tests until you manually call {@link clear}.
	 */
	getSize: __getRegistrySize,

	/**
	 * Clear (dispose) all server-side Playwright handles currently registered.
	 *
	 * This is invoked automatically before each test when auto clear is enabled
	 * (the default). You can call it manually when auto clear is disabled to
	 * reclaim memory and ensure stale handle ids are invalidated.
	 *
	 * After calling this, any previously obtained handle proxies will cease to
	 * function (future method calls will fail with a not-found error that includes
	 * guidance about auto clearing).
	 */
	clear: clearRegistry,

	/**
	 * Disable the automatic clearing of the server-side Playwright handle registry
	 * that normally runs before each test (root-level Mocha beforeEach).
	 *
	 * Use this when you intentionally want to keep handles (e.g. element / locator proxies)
	 * alive across multiple tests. Be aware that disabling this may allow the registry
	 * to grow unbounded if you keep creating new handles without manual cleanup.
	 *
	 * Re‑enable with {@link enableAutoClear} when done to restore default isolation.
	 */
	disableAutoClear: disableAutoClearRegistry,

	/**
	 * Re‑enable the default behavior of clearing the server-side handle registry
	 * before each test. This provides test isolation and prevents stale handle
	 * references from leaking across tests.
	 */
	enableAutoClear: enableAutoClearRegistry,
};

try {
	const mochaGlobal: any = (globalThis as any).mocha;
	if (mochaGlobal?.suite && !mochaGlobal.__playwrightRegistryHookInstalled) {
		mochaGlobal.suite.beforeEach(function () {
			if (__autoClearRegistry) {
				return clearRegistry();
			}
		});
		mochaGlobal.__playwrightRegistryHookInstalled = true;
	}
} catch {
	// Ignore errors if mocha not initialized yet
}

/**
 * Define a test with Playwright fixtures.
 *
 * This function wraps Mocha's `test` function to provide @playwright/test-style
 * fixtures. Fixtures are provided as an object parameter to the test function.
 *
 * @param name - Test name
 * @param testFn - Test function that receives fixtures as parameter
 *
 * @example
 * ```typescript
 * import { test } from '@vscode/test-web/playwright';
 * import * as assert from 'assert';
 *
 * test('can interact with page', async ({ page }) => {
 *   const element = await page.$('.monaco-editor');
 *   assert.ok(element, 'Editor should be present');
 * });
 *
 * test('can use multiple fixtures', async ({ page, browser }) => {
 *   const version = await browser.version();
 *   await page.screenshot({ path: 'screenshot.png' });
 * });
 * ```
 */
export function test(name: string, testFn: (fixtures: PlaywrightTestArgs) => Promise<void>): void {
	const mochaTest = (globalThis as any).test;
	if (!mochaTest) {
		throw new Error('Mocha test function not found. Make sure this is running in a Mocha test environment.');
	}

	mochaTest(name, async function (this: any) {
		const fixtures = createFixturesProxy();
		await testFn.call(this, fixtures);
	});
}

/**
 * Define a test suite with Playwright fixtures.
 *
 * This is a convenience wrapper around Mocha's `suite` function.
 *
 * @param name - Suite name
 * @param suiteFn - Suite function
 */
export function suite(name: string, suiteFn: () => void): void {
	const mochaSuite = (globalThis as any).suite;
	if (!mochaSuite) {
		throw new Error('Mocha suite function not found. Make sure this is running in a Mocha test environment.');
	}
	mochaSuite(name, suiteFn);
}

/**
 * Playwright library proxy for accessing the full Playwright API.
 *
 * This provides access to the Playwright library object, allowing you to:
 * - Create new request contexts: `playwright.request.newContext()`
 * - Access browser types: `playwright.chromium`, `playwright.firefox`, `playwright.webkit`
 * - Use other Playwright APIs not available through fixtures
 *
 * @example
 * ```typescript
 * import { playwright, test } from '@vscode/test-web/playwright';
 *
 * test('create independent request context', async () => {
 *   const request = await playwright.request.newContext();
 *   try {
 *     const response = await request.get('https://api.example.com/data');
 *     assert.ok(response.ok());
 *   } finally {
 *     await request.dispose();
 *   }
 * });
 * ```
 */
export const playwright = createDynamicProxy('playwright');
