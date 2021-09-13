import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Workspace folder access', () => {

	// tests various file system operation against the current workspace folder
	// when running with `@vscode/test-web`, this will be a virtual file system, powered
	// by the vscoe-web-test file system provider

	const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	assert.ok(workspaceFolder, 'Expecting an open folder');

	const workspaceFolderUri = workspaceFolder.uri;

	function getUri(path: string): vscode.Uri {
		return vscode.Uri.joinPath(workspaceFolderUri, path);
	}

	async function createFile(path: string, content: string) {
		const arr = new TextEncoder().encode(content);
		await vscode.workspace.fs.writeFile(getUri(path), arr);
		await assertStats(path, true, arr.length);
	}

	async function createFolder(path: string) {
		await vscode.workspace.fs.createDirectory(getUri(path));
		await assertStats(path, false);
	}

	async function deleteEntry(path: string, isFile: boolean) {
		await assertStats(path, isFile);
		await vscode.workspace.fs.delete(getUri(path), { recursive: true });
		await assertNotExisting(path, isFile);
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

		let expected = expectedFolders.map<[string, vscode.FileType]>(name => [name, vscode.FileType.Directory])
			.concat(expectedFiles.map(name => [name, vscode.FileType.File]))
			.sort(entrySorter);

		assert.deepStrictEqual(entries, expected);
	}

	async function assertContent(path: string, expected: string) {
		let array = await vscode.workspace.fs.readFile(getUri(path));
		const content = new TextDecoder().decode(array);
		assert.deepStrictEqual(content, expected);
		await assertStats(path, true, content.length);
	}

	async function assertStats(path: string, isFile: boolean, expectedSize?: number) {
		let stats = await vscode.workspace.fs.stat(getUri(path));
		assert.deepStrictEqual(stats.type, isFile ? vscode.FileType.File : vscode.FileType.Directory);
		assert.deepStrictEqual(typeof stats.mtime, 'number');
		assert.deepStrictEqual(typeof stats.ctime, 'number');
		if (expectedSize !== undefined) {
			assert.deepStrictEqual(stats.size, expectedSize);
		} else {
			assert.deepStrictEqual(typeof stats.size, 'number');
		}
	}

	async function assertNotExisting(path: string, isFile: boolean) {
		await assert.rejects(async () => {
			await assertStats(path, isFile);
		});
	}

	test('Folder contents', async () => {
		await assertEntries('/folder', ['x.txt'], ['.bar']);
		await assertEntries('/folder/', ['x.txt'], ['.bar']);
		await assertEntries('/', ['hello.txt', 'world.txt'], ['folder']);
		await assertEntries('/folder/.bar', ['.foo'], []);
	});

	test('File contents', async () => {
		await assertContent('/hello.txt', '// hello');
		await assertContent('/world.txt', '// world');
		await assertContent('/folder/x.txt', '// x');
	});

	test('File stats', async () => {
		await assertStats('/hello.txt', true, 8);
		await assertStats('/world.txt', true, 8);
		await assertStats('/folder/x.txt', true, 4);
		await assertStats('/folder/', false);
		await assertStats('/folder/.bar', false);
		await assertStats('/folder/.bar/.foo', true, 3);
		await assertStats('/', false);
	});

	test('Create and delete directory', async () => {
		await createFolder('/more');
		await assertEntries('/', ['hello.txt', 'world.txt'], ['folder', 'more']);
		await deleteEntry('/more', false);
		await assertEntries('/', ['hello.txt', 'world.txt'], ['folder']);
	});

	test('Create and delete file', async () => {
		await createFile('/more.txt', 'content');
		await assertEntries('/', ['hello.txt', 'world.txt', 'more.txt'], ['folder']);
		await assertContent('/more.txt', 'content');

		await deleteEntry('/more.txt', true);
		await assertEntries('/', ['hello.txt', 'world.txt'], ['folder']);

		await createFile('/folder/more.txt', 'moreContent');
		await assertEntries('/folder', ['x.txt', 'more.txt'], ['.bar']);
		await assertContent('/folder/more.txt', 'moreContent');
		await deleteEntry('/folder/more.txt', true);
		await assertEntries('/folder', ['x.txt'], ['.bar']);

	});

	test('Rename', async () => {
		await createFolder('/folder/testing');
		await createFile('/folder/testing/doc.txt', 'more');
		await createFolder('/folder/testing/inner');
		await assertEntries('/folder', ['x.txt'], ['testing', '.bar']);
		await assertEntries('/folder/testing', ['doc.txt'], ['inner']);

		await vscode.workspace.fs.rename(getUri('/folder/testing'), getUri('/folder/newTesting'));
		await assertEntries('/folder', ['x.txt'], ['newTesting', '.bar']);
		await assertEntries('/folder/newTesting', ['doc.txt'], ['inner']);
		await assertEntries('/folder/newTesting/inner', [], []);
		await assertNotExisting('/folder/testing', false);

		await deleteEntry('/folder/newTesting', false);
	});

	test('Copy', async () => {

		await vscode.workspace.fs.copy(getUri('/folder'), getUri('/copyOf/archive/'));
		await assertEntries('/folder', ['x.txt'], ['.bar']);
		await assertEntries('/copyOf', [], ['archive']);
		await assertEntries('/copyOf/archive', ['x.txt'], ['.bar']);

		await deleteEntry('/copyOf', false);
	});

});
