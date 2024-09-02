import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Workspace search', () => {
	// tests findFiles operation against the current workspace folder
	// when running with `@vscode/test-web`, this will be a virtual file system, powered
	// by the vscoe-web-test file system provider

	const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	assert.ok(workspaceFolder, 'Expecting an open folder');

	const workspaceFolderUri = workspaceFolder.uri;

	function getUri(path: string): vscode.Uri {
		return vscode.Uri.joinPath(workspaceFolderUri, path);
	}

	async function assertEntries(path: string, expectedFiles: string[], expectedFolders: string[]) {
		const entrySorter = (e1: [string, vscode.FileType], e2: [string, vscode.FileType]) => {
			const d = e1[1] - e2[1];
			if (d === 0) {
				return e1[0].localeCompare(e2[0]);
			}
			return d;
		};

		let entries = await vscode.workspace.fs.readDirectory(getUri(path));
		entries = entries.sort(entrySorter);

		let expected = expectedFolders
			.map<[string, vscode.FileType]>((name) => [name, vscode.FileType.Directory])
			.concat(expectedFiles.map((name) => [name, vscode.FileType.File]))
			.sort(entrySorter);

		assert.deepStrictEqual(entries, expected);
	}

	async function assertFindsFiles(pattern: string, expectedFiles: string[]) {
		let entries = await vscode.workspace.findFiles(pattern);
		let foundFiles = entries.map((uri) => uri.path.substring(uri.path.lastIndexOf('/') + 1));

		assert.deepStrictEqual(foundFiles, expectedFiles);
	}

	// commented out because of https://github.com/microsoft/vscode/issues/227248
	test('Find files', async () => {
		debugger;
		await assertEntries('/folder', ['x.txt'], ['.bar']);
		await assertEntries('/folder/', ['x.txt'], ['.bar']);
		await assertEntries('/', ['hello.txt', 'world.txt'], ['folder', 'folder_with_utf_8_🧿']);

		await assertFindsFiles('**/*.txt', ['x.txt', 'hello.txt', 'world.txt']);
	});
});
