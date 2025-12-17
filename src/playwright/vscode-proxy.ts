/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Worker, JSHandle } from '@playwright/test';

/**
 * Creates a proxy that provides fluent access to the VSCode API running in the extension host worker.
 *
 * The proxy uses Playwright's worker.evaluateHandle() to access the real vscode global in the worker,
 * and returns promisified proxies that allow chaining before awaiting.
 *
 * @example
 * ```typescript
 * const vscode = await createVSCodeProxy(worker);
 *
 * // Fluent API - chain then await
 * const folders = await vscode.workspace.workspaceFolders;
 *
 * // Method calls
 * const uri = await vscode.Uri.parse('file:///path/to/file');
 *
 * // Nested access
 * const content = await vscode.workspace.fs.readFile(uri);
 * ```
 */
export async function createVSCodeProxy(worker: Worker): Promise<any> {
	// Get handle to the vscode module in the worker
	// The bridge module (loaded via extensionTestsPath) exposes this global
	const vscodeHandle = await worker.evaluateHandle(() => {
		return (globalThis as any).__vscodeApiForPlaywright;
	});

	// Create the root proxy wrapping the vscode handle
	return createProxiedPromise(vscodeHandle);
}

/**
 * Creates a proxy that wraps a Promise<JSHandle> and allows both property access and awaiting.
 *
 * Key behaviors:
 * - Property access returns a new proxied promise (enables chaining)
 * - Accessing 'then' makes it awaitable (Promise interface)
 * - Method calls (with arguments) invoke the method and return proxied result
 * - Final await evaluates and serializes the result
 */
function createProxiedPromise(promiseOrHandle: Promise<JSHandle> | JSHandle): any {
	// Normalize to promise
	const promise = promiseOrHandle instanceof Promise
		? promiseOrHandle
		: Promise.resolve(promiseOrHandle);

	// Create proxy that intercepts property access
	return new Proxy(function() {}, {
		// Handle property access and method calls
		get(target, prop: string | symbol) {
			// Special handling for 'then' - makes the proxy awaitable
			if (prop === 'then') {
				return (
					onFulfilled?: (value: any) => any,
					onRejected?: (reason: any) => any
				) => {
					return promise
						.then(async (handle) => {
							// Serialize the final value
							return await handle.jsonValue();
						})
						.then(onFulfilled, onRejected);
				};
			}

			// Special handling for 'catch' - makes the proxy catchable
			if (prop === 'catch') {
				return (onRejected?: (reason: any) => any) => {
					return promise
						.then(async (handle) => {
							return await handle.jsonValue();
						})
						.catch(onRejected);
				};
			}

			// Special handling for 'finally' - makes the proxy finallable
			if (prop === 'finally') {
				return (onFinally?: () => void) => {
					return promise
						.then(async (handle) => {
							return await handle.jsonValue();
						})
						.finally(onFinally);
				};
			}

			// For any other property/method access, return a function that can be:
			// 1. Called as a method (with arguments)
			// 2. Accessed as a property (no arguments)
			return (...args: any[]) => {
				const nextPromise = promise.then(async (handle) => {
					if (args.length > 0) {
						// Method call - invoke the method with arguments
						return await handle.evaluateHandle(
							(obj: any, { prop, args }: any) => {
								const method = obj[prop];
								if (typeof method !== 'function') {
									throw new Error(`${String(prop)} is not a function`);
								}
								return method.apply(obj, args);
							},
							{ prop, args }
						);
					} else {
						// Property access - get the property value
						return await handle.evaluateHandle(
							(obj: any, prop: any) => obj[prop],
							prop
						);
					}
				});

				// Return a new proxied promise for chaining
				return createProxiedPromise(nextPromise);
			};
		},

		// Handle direct calls to the proxy (e.g., treating namespace as callable)
		apply(target, thisArg, args: any[]) {
			const nextPromise = promise.then(async (handle) => {
				return await handle.evaluateHandle(
					(fn: any, args: any) => {
						if (typeof fn !== 'function') {
							throw new Error('Cannot call non-function');
						}
						return fn(...args);
					},
					args
				);
			});

			return createProxiedPromise(nextPromise);
		}
	});
}
