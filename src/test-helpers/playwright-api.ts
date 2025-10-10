/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This module provides the implementation of the Playwright API that gets
 * injected into the vscode namespace. It communicates with the Playwright
 * bridge running on the main page via BroadcastChannel.
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
	path?: string;
	type?: 'png' | 'jpeg';
	quality?: number;
	omitBackground?: boolean;
	clip?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	fullPage?: boolean;
}

export async function screenshot(options?: ScreenshotOptions): Promise<string> {
	const result = await sendPlaywrightMessage({ type: 'screenshot', options });
	return checkResult<string>(result);
}

export async function waitForSelector(
	selector: string,
	options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'waitForSelector', selector, options });
	return checkResult<boolean>(result);
}

export async function querySelector(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'querySelector', selector });
	return checkResult<boolean>(result);
}

export async function querySelectorAll(selector: string): Promise<number> {
	const result = await sendPlaywrightMessage({ type: 'querySelectorAll', selector });
	return checkResult<number>(result);
}

export async function click(
	selector: string,
	options?: { timeout?: number; force?: boolean }
): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'click', selector, options });
	checkResult<void>(result);
}

export async function fill(
	selector: string,
	value: string,
	options?: { timeout?: number; force?: boolean }
): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'fill', selector, value, options });
	checkResult<void>(result);
}

export async function textContent(selector: string): Promise<string | null> {
	const result = await sendPlaywrightMessage({ type: 'textContent', selector });
	return checkResult<string | null>(result);
}

export async function getAttribute(selector: string, name: string): Promise<string | null> {
	const result = await sendPlaywrightMessage({ type: 'getAttribute', selector, name });
	return checkResult<string | null>(result);
}

export async function isVisible(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'isVisible', selector });
	return checkResult<boolean>(result);
}

export async function isHidden(selector: string): Promise<boolean> {
	const result = await sendPlaywrightMessage({ type: 'isHidden', selector });
	return checkResult<boolean>(result);
}

export async function evaluate<T = unknown>(pageFunction: string, arg?: unknown): Promise<T> {
	const result = await sendPlaywrightMessage({ type: 'evaluate', script: pageFunction, arg });
	return checkResult<T>(result);
}

export async function waitForTimeout(timeout: number): Promise<void> {
	const result = await sendPlaywrightMessage({ type: 'waitForTimeout', timeout });
	checkResult<void>(result);
}

export const keyboard = {
	async press(key: string, options?: { delay?: number }): Promise<void> {
		const result = await sendPlaywrightMessage({ type: 'keyboard.press', key, options });
		checkResult<void>(result);
	},

	async type(text: string, options?: { delay?: number }): Promise<void> {
		const result = await sendPlaywrightMessage({ type: 'keyboard.type', text, options });
		checkResult<void>(result);
	}
};
