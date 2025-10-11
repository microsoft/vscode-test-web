/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client-side code that gets injected into the main page to bridge communication
 * between Web Workers and the Playwright API
 */
(function() {
	// Import types - compile-time only, no runtime code generated
	type PlaywrightRequest = import('../playwright.api').PlaywrightRequest;
	type PlaywrightResponse = import('../playwright.api').PlaywrightResponse;
	type PlaywrightResult = import('../playwright.api').PlaywrightResult;

	/**
	 * Type guard to check if data is a PlaywrightRequest
	 */
	function isPlaywrightRequest(data: unknown): data is PlaywrightRequest {
		return data !== null &&
			typeof data === 'object' &&
			'__playwrightRequest' in data &&
			data.__playwrightRequest === true &&
			'id' in data &&
			'message' in data;
	}

	// Use BroadcastChannel for worker communication
	const channel = new BroadcastChannel('playwright-bridge');

	channel.onmessage = async (event: MessageEvent) => {
		// Check if this is a PlaywrightRequest
		if (isPlaywrightRequest(event.data)) {
			const { id, message } = event.data;

			try {
				// Call the exposed function (returns PlaywrightResult)
				const result: PlaywrightResult = await (window as any).__playwrightBridge(message);

				// Send PlaywrightResponse back via broadcast channel
				const response: PlaywrightResponse = {
					__playwrightResponse: true,
					id: id,
					result: result
				};
				channel.postMessage(response);
			} catch (error) {
				// Send error PlaywrightResponse
				const errorResponse: PlaywrightResponse = {
					__playwrightResponse: true,
					id: id,
					result: { success: false, error: (error as Error).message }
				};
				channel.postMessage(errorResponse);
			}
		}
	};

	console.log('[Playwright Bridge] Ready - extension tests can use Playwright APIs via BroadcastChannel');
})();
