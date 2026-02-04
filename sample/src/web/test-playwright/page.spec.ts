/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@vscode/test-web/playwright';

test.describe('Page Interactions', () => {

	test('command execution with notification', async ({ vscode, page }) => {
		await vscode.commands.executeCommand('vscode-test-web-sample.helloWorld');

		// Wait for the notification message to appear
		const notification = page.locator('.notification-toast-container');
		await expect(notification).toContainText('Hello World from vscode-test-web-sample in a web extension host!');
	});

});
