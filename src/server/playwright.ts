/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PlaywrightTestArgs } from '@playwright/test';
import * as playwright from 'playwright';
import { readFileInRepo } from './download';
import type {
	PlaywrightResult,
	PlaywrightMessage,
	HandleReference,
	SerializedFunction
} from '../playwright.api';

/**
 * Registry to store ElementHandles and other non-serializable objects
 * so they can be referenced from the worker
 */
class HandleRegistry {
	private handles = new Map<string, any>();
	private nextId = 1;

	/**
	 * Store a handle and return its ID
	 */
	register(handle: any): string {
		const id = `handle_${this.nextId++}`;
		this.handles.set(id, handle);
		return id;
	}

	/**
	 * Retrieve a handle by ID
	 */
	get(id: string): any {
		return this.handles.get(id);
	}

	/**
	 * Check if an ID exists
	 */
	has(id: string): boolean {
		return this.handles.has(id);
	}

	/**
	 * Remove a handle (for cleanup)
	 */
	delete(id: string): boolean {
		return this.handles.delete(id);
	}

	/**
	 * Clear all handles
	 */
	clear(): void {
		this.handles.clear();
	}
}

/**
 * Helper to safely access nested properties on an object
 */
function getNestedProperty(obj: any, path: string): any {
	const parts = path.split('.');
	let current = obj;
	for (const part of parts) {
		if (current && typeof current === 'object' && part in current) {
			current = current[part];
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * Check if a value should be stored as a handle
 *
 * Based on Playwright's serialization algorithm - a value needs to be stored as a handle
 * if it cannot be serialized directly. This recursively checks arrays and objects
 * to see if they contain any non-serializable values.
 */
function needsHandle(value: any, visited = new Set<any>()): boolean {
	// Top-level functions should throw an error - they can't be serialized or stored as handles
	// Nested functions (inside objects/arrays) mean the container needs to be a handle
	if (typeof value === 'function') {
		if (visited.size === 0) {
			throw new Error('Attempting to serialize unexpected value: function');
		}
		return true;
	}

	// Primitives and simple values can be serialized
	if (typeof value === 'symbol') return false;
	if (Object.is(value, undefined)) return false;
	if (Object.is(value, null)) return false;
	if (Object.is(value, NaN)) return false;
	if (Object.is(value, Infinity)) return false;
	if (Object.is(value, -Infinity)) return false;
	if (Object.is(value, -0)) return false;
	if (typeof value === 'boolean') return false;
	if (typeof value === 'number') return false;
	if (typeof value === 'string') return false;
	if (typeof value === 'bigint') return false;

	// Serializable built-in types
	if (value instanceof Error) return false;
	if (value instanceof Date) return false;
	if (value instanceof RegExp) return false;
	if (typeof URL !== 'undefined' && value instanceof URL) return false;

	// Buffers and typed arrays are serializable
	if (Buffer.isBuffer(value)) return false;
	if (ArrayBuffer.isView(value)) return false;

	// Avoid infinite recursion on circular references
	if (visited.has(value)) return false;
	visited.add(value);

	// Arrays can be serialized but the caller needs to convert the contents
	if (Array.isArray(value)) {
		return false;
	}

	// Objects: check their properties recursively
	// If any property contains a function or other non-serializable value, this object needs a handle
	if (typeof value === 'object') {
		for (const key of Object.keys(value)) {
			if (needsHandle(value[key], visited)) {
				return true;
			}
		}
		return false;
	}

	// Fallback: anything else needs to be stored as a handle
	return true;
}

/**
 * Helper to serialize data for transmission (handles Buffers, ElementHandles, etc.)
 */
function serializeResult(data: unknown, registry: HandleRegistry): unknown {
	// Convert Buffers to base64 for transmission (e.g., screenshots)
	if (Buffer.isBuffer(data)) {
		return data.toString('base64');
	}

	// If it's a handle, register it and return a handle reference
	if (needsHandle(data)) {
		const handleId = registry.register(data);
		const handleRef: HandleReference = { __handleId: handleId };
		return handleRef;
	}

	// If it's an array, serialize each element
	if (Array.isArray(data)) {
		return data.map(item => serializeResult(item, registry));
	}

	// Return everything else as-is
	return data;
}

/**
 * Type guard to check if an object is a HandleReference
 */
function isHandleReference(arg: unknown): arg is HandleReference {
	return arg !== null && typeof arg === 'object' && '__handleId' in arg;
}

/**
 * Type guard to check if an object is a SerializedFunction
 */
function isSerializedFunction(arg: unknown): arg is SerializedFunction {
	return arg !== null && typeof arg === 'object' && '__function' in arg;
}

/**
 * Helper to deserialize arguments (convert handle references back to actual handles, function strings to functions)
 */
function deserializeArgs(args: unknown[], registry: HandleRegistry): unknown[] {
	return args.map(arg => {
		// Check if it's a handle reference
		if (isHandleReference(arg)) {
			return registry.get(arg.__handleId);
		}
		// Check if it's a serialized function
		if (isSerializedFunction(arg)) {
			// Convert the function string back to a function
			return new Function(`return (${arg.__function})`)();
		}
		// If it's an array, deserialize recursively
		if (Array.isArray(arg)) {
			return deserializeArgs(arg, registry);
		}
		return arg;
	});
}

/**
 * Sets up the Playwright bridge by exposing functions that can be called from the browser
 */
export function setupPlaywrightBridge(fixtures: PlaywrightTestArgs): void {
	// Use the fixtures object directly as the context for the bridge
	// Add the playwright library to the context so tests can access it
	const context: any = { ...fixtures, playwright };

	// Create a handle registry for storing ElementHandles and other non-serializable objects
	const registry = new HandleRegistry();

	// Expose a function that handles all Playwright API calls dynamically
	fixtures.page.exposeFunction('__playwrightBridge', async (message: PlaywrightMessage): Promise<PlaywrightResult> => {
		try {
			// Validate message format
			if (!message || typeof message !== 'object') {
				return { success: false, error: 'Invalid message format' };
			}

			const { target, method, args = [] } = message;

			// Special internal registry/maintenance commands
			if (target === '__registry') {
				if (method === 'size') {
					return { success: true, data: registry['handles']?.size ?? 0 } as PlaywrightResult; // size only
				}
				if (method === 'clear') {
					registry.clear();
					return { success: true, data: true } as PlaywrightResult;
				}
				return { success: false, error: `Unknown registry method '${method}'` };
			}

			if (!target || !method) {
				return { success: false, error: 'Message must include target and method' };
			}

			// Deserialize arguments (convert handle references to actual handles)
			const deserializedArgs = deserializeArgs(args, registry);

			// Determine the target object
			let targetObj: any;

			// Check if target is a handle ID
			if (registry.has(target)) {
				targetObj = registry.get(target);
			} else {
				// Otherwise, get from context (e.g., 'page', 'browser', 'page.keyboard')
				targetObj = getNestedProperty(context, target);
			}

			if (!targetObj) {
				let hint = '';
				if (target.startsWith('handle_')) {
					hint = " (Possibly cleared between tests. Disable auto clear via disableAutoClearRegistry() if you need to retain handles.)";
				}
				return { success: false, error: `Target '${target}' not found${hint}` };
			}

			// Get the method
			const fn = targetObj[method];

			if (typeof fn !== 'function') {
				return { success: false, error: `Method '${method}' is not a function on target '${target}'` };
			}

			// Call the method with the provided arguments
			const result = await fn.apply(targetObj, deserializedArgs);

			// Serialize the result for transmission
			const serializedData = serializeResult(result, registry);

			return { success: true, data: serializedData };
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
	const modulePath = esm ? 'out/browser/esm/playwright.js' : 'out/browser/amd/playwright.js';
	return await readFileInRepo(modulePath);
}
