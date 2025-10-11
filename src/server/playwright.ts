/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 * Check if a value is an ElementHandle or other Playwright handle type
 */
function isHandle(value: any): boolean {
	// Check if it's an ElementHandle, JSHandle, or has an evaluate method
	// This is a heuristic - Playwright handles typically have these methods
	return value && typeof value === 'object' &&
		(typeof value.evaluate === 'function' ||
		 typeof value.asElement === 'function' ||
		 value.constructor?.name?.includes('Handle'));
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
	if (isHandle(data)) {
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
			// eslint-disable-next-line no-new-func
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
export function setupPlaywrightBridge(page: playwright.Page, browser: playwright.Browser): void {
	// Create a context object with available APIs
	const context = { page, browser };

	// Create a handle registry for storing ElementHandles and other non-serializable objects
	const registry = new HandleRegistry();

	// Expose a function that handles all Playwright API calls dynamically
	page.exposeFunction('__playwrightBridge', async (message: PlaywrightMessage): Promise<PlaywrightResult> => {
		try {
			// Validate message format
			if (!message || typeof message !== 'object') {
				return { success: false, error: 'Invalid message format' };
			}

			const { target, method, args = [] } = message;

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
				return { success: false, error: `Target '${target}' not found` };
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
	const modulePath = esm ? 'out/browser/esm/playwright-bridge.js' : 'out/browser/amd/playwright-bridge.js';
	return await readFileInRepo(modulePath);
}
