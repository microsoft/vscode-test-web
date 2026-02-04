/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Worker, JSHandle } from '@playwright/test';
import type { FluentJSHandle, VSCode } from './vscode-types';

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
export async function createVSCodeProxy(worker: Worker): Promise<VSCode> {
	// Wait for the bridge to initialize and expose the vscode API
	// The bridge module (loaded via extensionTestsPath) exposes this global
	const vscodeHandle = await worker.evaluateHandle(async () => {
		// Poll for the API to be available (with timeout)
		const maxWaitTime = 30000; // 30 seconds
		const pollInterval = 100; // 100ms
		const startTime = Date.now();

		while (!(globalThis.__vscodeApiForPlaywright)) {
			if (Date.now() - startTime > maxWaitTime) {
				throw new Error('Timeout waiting for VSCode API to be exposed by bridge');
			}
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		return globalThis.__vscodeApiForPlaywright as typeof import('vscode');
	});

	// Create the root proxy wrapping the vscode handle
	return createFluentJSHandle(vscodeHandle) as VSCode;
}

// Derive the expected member type from the actual JSHandle interface
type JSHandleMemberTypes = {
  readonly [K in keyof JSHandle]: JSHandle[K] extends (...args: any[]) => any
    ? 'function'
    : 'property'
};

// Define the constant with satisfies to catch missing keys and wrong value types
const jsHandleMembers = {
  evaluate: 'function',
  evaluateHandle: 'function',
  jsonValue: 'function',
  asElement: 'function',
  dispose: 'function',
  getProperties: 'function',
  getProperty: 'function',
  [Symbol.asyncDispose]: 'function',
} as const satisfies JSHandleMemberTypes;

/**
 * Creates a proxy that exposes a JSHandle with fluent property access.
 *
 * The proxy wraps a JSHandle and provides:
 * - Property access via getProperty() returning a new FluentJSHandle
 * - Method calls via evaluateHandle() returning a new FluentJSHandle
 * - All JSHandle methods (jsonValue, evaluate, etc.) forwarded to the underlying handle
 *
 * @param promiseOrHandle - The JSHandle or Promise of JSHandle to wrap
 * @param parentHandlePromise - The parent handle (for method invocation with correct 'this' binding)
 * @param propertyName - The property name used to access this handle from the parent
 */
function createFluentJSHandle<T>(
  promiseOrHandle: Promise<JSHandle<T>> | JSHandle<T>,
  parentHandlePromise?: Promise<JSHandle<unknown>>,
  propertyName?: string
): FluentJSHandle<T> {
  // Function target so the proxy can be callable (for function properties).
  const target = function () {} as any;

	const handlePromise = Promise.resolve(promiseOrHandle);

	const proxy = new Proxy(target, {
		// TODO: There are way more functions on ProxyHandler to consider implementing for full coverage.

		// Prevent the proxy from being treated as thenable
		has(_target, prop: string | symbol) {
			console.log(`[PROXY HAS] prop=${String(prop)}`);
			// TODO: Is this correct in all cases or only for our outermost proxy?
			// Don't claim to have 'then' - we're not a Promise
			if (prop === 'then') {
				return false;
			}
			// For JSHandle methods, claim we have them
			if (prop in jsHandleMembers) {
				return true;
			}
			// Can't check the handle synchronously, so assume we have it
			// The get trap will handle it properly
			return true;
		},

		// Define property descriptor to satisfy proxy invariants
		getOwnPropertyDescriptor(_target, prop: string | symbol) {
			console.log(`[PROXY getOwnPropertyDescriptor] prop=${String(prop)}`);
			// TODO: Is this correct in all cases or only for our outermost proxy?
			// Don't claim 'then' as own property
			if (prop === 'then') {
				return undefined;
			}
			// For JSHandle methods, reflect from target to satisfy invariants
			if (prop in jsHandleMembers) {
				return Reflect.getOwnPropertyDescriptor(target, prop);
			}
			// For other properties (vscode API properties), return configurable descriptor
			return {
				configurable: true,
				enumerable: true,
				writable: false,
				value: undefined // Will be resolved via get trap
			};
		},

		// Handle property access
		get(_target, prop: string | symbol) {
			console.log(`[PROXY GET] prop=${String(prop)}, in jsHandleMembers=${prop in jsHandleMembers}`);

			// Return undefined for 'then' to prevent being treated as thenable
			if (prop === 'then') {
				console.log('[PROXY GET] Returning undefined for then');
				return undefined;
			}

			// Forward JSHandle methods to the underlying handle
			if (prop in jsHandleMembers) {
				console.log(`[PROXY GET] Forwarding JSHandle method: ${String(prop)}`);

				if (jsHandleMembers[prop] === 'function') {
					// Cache the function reference after first access
					// This avoids an edge case where if the property is a getter that returns a new function each time,
					// calling our returned function multiple times would call the getter multiple times,
					// returning a new function each time, which would change the semantics.
					let func: ((...args: any[]) => any) | undefined = undefined;

					return (...args: any[]) =>
						handlePromise.then(handle => {
							if (func === undefined) {
								func = (handle as any)[prop];
							}
							if (func !== undefined) {
								// Apply the function with the handle as 'this'
								return func.apply(handle, args);
							}
						})
				} else {
					return handlePromise.then(handle => (handle as any)[prop]);
				}
			}

			if (typeof prop === 'symbol') {
				throw new Error(`Cannot access symbol property ${String(prop)} on FluentJSHandle`);
			}

			// Pass current handle as parent and prop as property name for correct 'this' binding
			return createFluentJSHandle(
				handlePromise.then(handle => handle.getProperty(prop)),
				handlePromise,
				prop
			);
		},

		// Handle function calls
		apply(_target, _thisArg, argArray: any[]) {
			console.log(`[PROXY APPLY] parentHandlePromise=${!!parentHandlePromise}, propertyName=${propertyName}, args.length=${argArray.length}`);
			console.log(`[PROXY APPLY] args types:`, argArray.map(a => typeof a));

			// If we have parent + propertyName, invoke via parent to preserve 'this' binding
			// getProperty() returns a handle to the function itself, but loses the 'this' binding.
			// To preserve 'this', we must invoke the method via the parent object.
			if (parentHandlePromise && propertyName) {
				return createFluentJSHandle(
					parentHandlePromise.then(parent =>
						parent.evaluateHandle((obj: any, params: { methodName: string; args: any[] }) => {
							return obj[params.methodName](...params.args);
						}, { methodName: propertyName, args: argArray })
					)
				);
			}

			// Fallback: direct invocation (for root-level functions or when no parent context)
			return createFluentJSHandle(
				handlePromise.then(handle => {
					const fnHandle = handle as unknown as JSHandle<(...args: any[]) => any>;

					return fnHandle.evaluateHandle((fn: (...args: any[]) => any, args: any[]) => {
						return fn(...args);
					}, argArray)
				})
			);
		}
	});

	return proxy as FluentJSHandle<T>;
}
