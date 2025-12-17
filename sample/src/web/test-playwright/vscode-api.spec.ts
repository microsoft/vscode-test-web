/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect, type VSCodeAPI } from '@vscode/test-web/playwright';

test.describe('VSCode API Proxy', () => {
	test('should access workspace.workspaceFolders', async ({ vscode }: { vscode: VSCodeAPI }) => {
		// Access workspace folders via proxied API
		const folders = await vscode.workspace.workspaceFolders;

		// Verify we got an array
		expect(folders).toBeDefined();
		expect(Array.isArray(folders)).toBe(true);
		expect(folders.length).toBeGreaterThan(0);

		// Check folder structure
		const firstFolder = folders[0];
		expect(firstFolder).toHaveProperty('uri');
		expect(firstFolder).toHaveProperty('name');
		expect(firstFolder).toHaveProperty('index');
	});

	test('should access Uri.parse() static method', async ({ vscode }: { vscode: VSCodeAPI }) => {
		// Call static method on Uri class
		const uri = await vscode.Uri.parse('file:///path/to/file.txt');

		// Verify URI structure
		expect(uri).toBeDefined();
		expect(uri).toHaveProperty('scheme');
		expect(uri).toHaveProperty('path');
		expect(uri.scheme).toBe('file');
		expect(uri.path).toBe('/path/to/file.txt');
	});

	test('should access Uri.joinPath() with fluent chaining', async ({ vscode }: { vscode: VSCodeAPI }) => {
		// Get workspace folder first
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;

		// Use Uri.joinPath to create new URI
		const fileUri = await vscode.Uri.joinPath(folderUri, 'test.txt');

		// Verify joined URI
		expect(fileUri).toBeDefined();
		expect(fileUri).toHaveProperty('path');
		expect(fileUri.path).toContain('test.txt');
	});

	test('should call workspace.fs.stat()', async ({ vscode }: { vscode: VSCodeAPI }) => {
		// Get workspace folder URI
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;

		// Create a file URI
		const fileUri = await vscode.Uri.joinPath(folderUri, 'hello.txt');

		// Call fs.stat to get file stats
		const stats = await vscode.workspace.fs.stat(fileUri);

		// Verify stats structure
		expect(stats).toBeDefined();
		expect(stats).toHaveProperty('type');
		expect(stats).toHaveProperty('size');
		expect(stats).toHaveProperty('mtime');
		expect(stats).toHaveProperty('ctime');
	});

	test('should read file contents with workspace.fs.readFile()', async ({ vscode }: { vscode: VSCodeAPI }) => {
		// Get workspace folder and create file URI
		const folders = await vscode.workspace.workspaceFolders;
		const folderUri = folders[0].uri;
		const fileUri = await vscode.Uri.joinPath(folderUri, 'hello.txt');

		// Read file contents
		const contentArray = await vscode.workspace.fs.readFile(fileUri);

		// Decode to string
		const decoder = new TextDecoder();
		const content = decoder.decode(contentArray);

		// Verify content
		expect(contentArray).toBeDefined();
		expect(contentArray.length).toBeGreaterThan(0);
		expect(content).toContain('hello');
	});
});
