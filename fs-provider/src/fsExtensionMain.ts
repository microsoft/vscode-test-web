/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { xhr } from 'request-light';
import { Uri, FileStat, FileType, workspace, ExtensionContext, FileSystemError } from 'vscode';
import { Entry, MemFileSystemProvider, File, Directory } from './fsProvider';

const SCHEME = 'vscode-test-web';

export function activate(context: ExtensionContext) {
	const serverUri = context.extensionUri.with({ path: '/static/mount', query: undefined });
	const serverBackedRootDirectory = new ServerBackedDirectory(serverUri, '');

	const disposable = workspace.registerFileSystemProvider(SCHEME, new MemFileSystemProvider(SCHEME, serverBackedRootDirectory));
	context.subscriptions.push(disposable);

	console.log(`vscode-test-web-support fs provider registers for ${SCHEME}, initial content from ${serverUri.toString()}`);
}

class ServerBackedFile implements File {
	readonly type = FileType.File;
	private _stats: Promise<FileStat> | undefined;
	private _content: Promise<Uint8Array> | undefined;
	constructor(private readonly _serverUri: Uri, public name: string) {
	}
	get stats(): Promise<FileStat> {
		if (this._stats === undefined) {
			this._stats = getStats(this._serverUri);
		}
		return this._stats;
	}
	set stats(stats: Promise<FileStat>) {
		this._stats = stats;
	}
	get content(): Promise<Uint8Array> {
		if (this._content === undefined) {
			this._content = getContent(this._serverUri);
		}
		return this._content;
	}
	set content(content: Promise<Uint8Array>) {
		this._content = content;
	}
}

class ServerBackedDirectory implements Directory {
	readonly type = FileType.Directory;
	private _stats: Promise<FileStat> | undefined;
	private _entries: Promise<Map<string, Entry>> | undefined;
	constructor(private readonly _serverUri: Uri, public name: string) {
	}
	get stats(): Promise<FileStat> {
		if (this._stats === undefined) {
			this._stats = getStats(this._serverUri);
		}
		return this._stats;
	}
	set stats(stats: Promise<FileStat>) {
		this._stats = stats;
	}
	get entries(): Promise<Map<string, Entry>> {
		if (this._entries === undefined) {
			this._entries = getEntries(this._serverUri);
		}
		return this._entries;
	}
	set entries(entries: Promise<Map<string, Entry>>) {
		this._entries = entries;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEntry(e: any): e is Entry {
	return e && (e.type === FileType.Directory || e.type === FileType.File) && typeof e.name === 'string' && e.name.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isStat(e: any): e is FileStat {
	return e && (e.type === FileType.Directory || e.type === FileType.File) && typeof e.ctime === 'number' && typeof e.mtime === 'number' && typeof e.size === 'number';
}

async function getEntries(serverUri: Uri): Promise<Map<string, Entry>> {
	const url = serverUri.with({ query: 'readdir' }).toString();
	const response = await xhr({ url });
	if (response.status === 200 && response.status <= 204) {
		try {
			const res = JSON.parse(response.responseText);
			if (Array.isArray(res)) {
				const entries = new Map();
				for (const r of res) {
					if (isEntry(r)) {
						const childPath = Uri.joinPath(serverUri, r.name);
						const newEntry: Entry = r.type === FileType.Directory ? new ServerBackedDirectory(childPath, r.name) : new ServerBackedFile(childPath, r.name);
						entries.set(newEntry.name, newEntry);
					}
				}
				return entries;
			}
		} catch {
			// ignore
		}
		console.log(`Invalid server response format for ${url.toString()}.`);
	} else {
		console.log(`Invalid server response for ${url.toString()}. Status ${response.status}`);
	}
	return new Map();
}

async function getStats(serverUri: Uri): Promise<FileStat> {
	const url = serverUri.with({ query: 'stat' }).toString();
	const response = await xhr({ url });
	if (response.status === 200 && response.status <= 204) {
		const res = JSON.parse(response.responseText);
		if (isStat(res)) {
			return res;
		}
		throw FileSystemError.FileNotFound(`Invalid server response for ${serverUri.toString()}.`);
	}
	throw FileSystemError.FileNotFound(`Invalid server response for ${serverUri.toString()}. Status ${response.status}.`);
}

async function getContent(serverUri: Uri): Promise<Uint8Array> {
	const response = await xhr({ url: serverUri.toString() });
	if (response.status >= 200 && response.status <= 204) {
		return response.body;
	}
	throw FileSystemError.FileNotFound(`Invalid server response for ${serverUri.toString()}. Status ${response.status}.`);
}