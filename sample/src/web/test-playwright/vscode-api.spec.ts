/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@vscode/test-web/playwright';

// Type guard that fails compilation if T is 'any'
// If T is any, both branches are valid so it returns never
// If T is a specific type, it returns that type
type NoAny<T> = 0 extends (1 & T) ? never : T;

// This will fail to compile if vscode.workspace resolves to 'any'
function assertNotAny<T>(_value: NoAny<T>): void {}

test.describe('VSCode API Proxy', () => {

	test.describe('Type Safety', () => {
		test('vscode.workspace should be properly typed (not any)', async ({ vscode }) => {
			// This test verifies that the vscode fixture is properly typed.
			// If vscode were typed as 'any', the NoAny check would pass (incorrectly).
			// With proper typing, this assertion confirms vscode.workspace has the correct type.
			assertNotAny<typeof vscode.workspace>(vscode.workspace);
		});
	});

	test.describe('FluentJSHandle', () => {

		test.describe('JSHandle methods', () => {
			test('jsonValue() on root handle', async ({ vscode }) => {
				const jsonValueMethod = vscode.jsonValue;
				const value = await jsonValueMethod();
				expect(value).toBeDefined();
			});

			test('evaluate() on root handle', async ({ vscode }) => {
				const result = await vscode.evaluate((v) => typeof v);
				expect(result).toBe('object');
			});

			test('getProperty() escape hatch', async ({ vscode }) => {
				const prop = await vscode.getProperty('workspace');
				const value = await prop.jsonValue();
				expect(value).toBeDefined();
			});
		});

		test.describe('Property access', () => {
			test('single level (vscode.workspace)', async ({ vscode }) => {
				const value = await vscode.workspace.jsonValue();
				expect(value).toBeDefined();
			});

			test('two levels (vscode.workspace.fs)', async ({ vscode }) => {
				const value = await vscode.workspace.fs.jsonValue();
				expect(value).toBeDefined();
			});

			test('three levels (vscode.workspace.workspaceFolders)', async ({ vscode }) => {
				const value = await vscode.workspace.workspaceFolders.jsonValue();
				// Can be undefined if no workspace, that's ok
			});
		});

		test.describe('Method calls', () => {
			test('static method (Uri.parse)', async ({ vscode }) => {
				const value = await vscode.Uri.parse('file:///test').jsonValue();
				expect(value.scheme).toBe('file');
			});

			test('instance method with this binding (Uri.joinPath)', async ({ vscode }) => {
				const value = await vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'test.txt').jsonValue();
				expect(value.path).toContain('test.txt');
			});

			test('nested method (workspace.fs.stat)', async ({ vscode }) => {
				const stats = await vscode.workspace.fs.stat(
					vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'hello.txt')
				).jsonValue();
				expect(stats).toHaveProperty('type');
				expect(stats).toHaveProperty('size');
			});

			test('nested method (workspace.fs.readFile)', async ({ vscode }) => {
				const content = await vscode.workspace.fs.readFile(
					vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'hello.txt')
				).jsonValue();
				expect(content).toBeDefined();
				expect(content.length).toBeGreaterThan(0);
			});

			test('command execution (commands.executeCommand)', async ({ vscode, page }) => {
				await vscode.commands.executeCommand('vscode-test-web-sample.helloWorld');

				// Wait for the notification message to appear
				const notification = page.locator('.notification-toast-container');
				await expect(notification).toContainText('Hello World from vscode-test-web-sample in a web extension host!');
			});
		});

	});

});
