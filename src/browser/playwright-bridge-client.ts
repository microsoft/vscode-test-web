/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client-side code that gets injected into the main page to bridge communication
 * between Web Workers and the Playwright API
 */
(function() {
	// Flag to indicate the bridge is available
	(window as any).__playwrightBridgeReady = true;

	// Create a wrapper that can be called from anywhere (including workers via indirect access)
	// Use BroadcastChannel for worker communication
	const channel = new BroadcastChannel('playwright-bridge');

	channel.onmessage = async (event) => {
		if (event.data && event.data.__playwrightRequest) {
			const { id, message } = event.data;

			try {
				// Call the exposed function
				const result = await (window as any).__playwrightBridge(message);

				// Send result back via broadcast channel
				channel.postMessage({
					__playwrightResponse: true,
					id: id,
					result: result
				});
			} catch (error) {
				channel.postMessage({
					__playwrightResponse: true,
					id: id,
					result: { success: false, error: (error as Error).message }
				});
			}
		}
	};

	console.log('[Playwright Bridge] Ready - extension tests can use Playwright APIs via BroadcastChannel');
})();
