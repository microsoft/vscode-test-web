/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@vscode/test-web/playwright';

test.describe('Visual Regression', () => {

	test('workbench screenshot', async ({ vscode: _vscode, page }) => {
		// vscode fixture ensures page is loaded and workbench is ready
		// Take a screenshot of the full workbench
		await expect(page).toHaveScreenshot('workbench.png', { maxDiffPixels: 100 });
	});

	test('activity bar screenshot', async ({ vscode: _vscode, page }) => {
		// vscode fixture ensures page is loaded
		// Locate the activity bar
		const activityBar = page.locator('.activitybar');
		await expect(activityBar).toBeVisible();

		// Take a screenshot of just the activity bar
		await expect(activityBar).toHaveScreenshot('activity-bar.png', { maxDiffPixels: 100 });
	});

	test('notification toast screenshot', async ({ vscode, page }) => {
		// Trigger a command that shows a notification
		await vscode.commands.executeCommand('vscode-test-web-sample.helloWorld');

		// Wait for notification to appear
		const notification = page.locator('.notification-toast-container');
		await expect(notification).toBeVisible();

		// Take a screenshot of the notification
		await expect(notification).toHaveScreenshot('notification-toast.png', { maxDiffPixels: 100 });
	});

	test('sidebar snapshot', async ({ vscode: _vscode, page }) => {
		// vscode fixture ensures page is loaded
		// Locate the sidebar
		const sidebar = page.locator('.sidebar');
		await expect(sidebar).toBeVisible();

		// Take a snapshot to verify DOM structure
		const sidebarContent = await sidebar.textContent();
		expect(sidebarContent).toBeTruthy();

		// Screenshot for visual comparison
		await expect(sidebar).toHaveScreenshot('sidebar.png', { maxDiffPixels: 100 });
	});

	test('editor area screenshot', async ({ vscode: _vscode, page }) => {
		// vscode fixture ensures page is loaded
		// Take screenshot of editor/welcome area
		const editorPart = page.locator('.part.editor');
		await expect(editorPart).toBeVisible();
		await expect(editorPart).toHaveScreenshot('editor-area.png', { maxDiffPixels: 100 });
	});

});
