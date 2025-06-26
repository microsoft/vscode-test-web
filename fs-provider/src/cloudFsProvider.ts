/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Uri, FileSystemProvider, Disposable, FileType, FileStat, FileChangeEvent, FileSearchQuery, FileSearchOptions, CancellationToken, FileSearchProvider } from 'vscode';
import { MemFileSystemProvider, Directory } from './fsProvider';
import { config } from './config';

function formatPath(path: string): string {
	return path.substring(1, path.length);
}

function commonHeaders(): Headers {
	return new Headers({
		'Content-Type': 'application/json',
	});
}

function formatBody(body: any): string {
	return JSON.stringify(body);
}

export class CloudFileSystemProvider implements FileSystemProvider, FileSearchProvider {
	private memProvider: MemFileSystemProvider;
	readonly onDidChangeFile: Event<FileChangeEvent[]>;
	constructor(private readonly scheme: string, private readonly extensionUri: Uri, private readonly root: Directory, private readonly repoName: string) {
		this.memProvider = new MemFileSystemProvider(scheme, root, extensionUri);
		this.onDidChangeFile = this.memProvider.onDidChangeFile;
	}

	async stat(resource: Uri): Promise<FileStat> {
		return this.memProvider.stat(resource);
	}

	async readDirectory(resource: Uri): Promise<[string, FileType][]> {
		const result = await fetch(`${config.serverUri}/files/list`, {
			method: 'POST',
			headers: commonHeaders(),
			body: formatBody({
				path: formatPath(resource.path),
				repo_name: this.repoName,
			}),
		});
		const json = await result.json() as { items: { name: string, is_dir: boolean }[] };
		return json.items.map((item) => [item.name, item.is_dir ? FileType.Directory : FileType.File]);

		// return this.memProvider.readDirectory(resource);
	}


	async readFile(resource: Uri): Promise<Uint8Array> {
		const result = await fetch(`${config.serverUri}/files/content`, {
			method: 'POST',
			headers: commonHeaders(),
			body: formatBody({
				path: formatPath(resource.path),
				repo_name: this.repoName,
			}),
		});
		const json = await result.json() as { content: string };
		return new TextEncoder().encode(json.content);

		// return this.memProvider.readFile(resource);
	}

	async writeFile(uri: Uri, content: Uint8Array, opts: { create: boolean; overwrite: boolean; }): Promise<void> {
		this.memProvider.writeFile(uri, content, opts);
	}

	// --- manage files/folders

	async rename(from: Uri, to: Uri, opts: { overwrite: boolean; }): Promise<void> {
		this.memProvider.rename(from, to, opts);
	}

	async delete(uri: Uri, opts: { recursive: boolean; }): Promise<void> {
		this.memProvider.delete(uri, opts);
	}

	async createDirectory(uri: Uri): Promise<void> {
		this.memProvider.createDirectory(uri);
	}

	// --- search

	async provideFileSearchResults(query: FileSearchQuery, options: FileSearchOptions, token: CancellationToken): Promise<Uri[]> {
		return this.memProvider.provideFileSearchResults(query, options, token);
	}

	// --- manage file events

	watch(resource: Uri, opts: { recursive: boolean; excludes: string[]; }): Disposable {
		return this.memProvider.watch(resource, opts);
	}

	dispose() {
		this.memProvider.dispose();
	}
}