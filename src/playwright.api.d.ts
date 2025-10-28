/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared type definitions for Playwright bridge communication
 * Used across browser, server, and test-helper contexts
 */

/**
 * Serializable result from Playwright operations
 */
export interface PlaywrightResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

/**
 * Generic message for any Playwright API call
 * Supports calling any method on page, browser, handles, or nested objects like page.keyboard
 */
export interface PlaywrightMessage {
	/** The target object path (e.g., 'page', 'browser', 'page.keyboard') or a handleId */
	target: string;
	/** The method name to call */
	method: string;
	/** Arguments to pass to the method */
	args?: unknown[];
}

/**
 * Request envelope sent from worker to main page via BroadcastChannel
 */
export interface PlaywrightRequest {
	__playwrightRequest: true;
	id: number;
	message: PlaywrightMessage;
}

/**
 * Response envelope sent from main page back to worker via BroadcastChannel
 */
export interface PlaywrightResponse {
	__playwrightResponse: true;
	id: number;
	result: PlaywrightResult;
}

/**
 * Reference to a handle (ElementHandle, JSHandle, etc.) that's stored in the registry
 */
export interface HandleReference {
	__handleId: string;
}

/**
 * Serialized function for transmission across the bridge
 */
export interface SerializedFunction {
	__function: string;
}
