/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Event, Uri, FileSystemProvider, Disposable, FileType, FileStat, FileSystemError, FileChangeType, FileChangeEvent } from 'vscode';
import { Utils } from 'vscode-uri'
import { xhr } from 'request-light';

export const SCHEME = 'vscode-test-web';

interface File {
	readonly type: FileType.File;
	readonly name: string;
	serverUri?: Uri | undefined;
	stats?: FileStat;
	content?: Uint8Array;
}

interface Directory {
	readonly type: FileType.Directory;
	readonly name: string;
	serverUri?: Uri | undefined;
	stats?: FileStat;
	entries?: Map<string, File | Directory>;
}

type Entry = File | Directory;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEntry(e: any): e is Entry {
	return e && (e.type == FileType.Directory || e.type == FileType.File) && typeof e.name === 'string' && e.name.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isStat(e: any): e is FileStat {
	return e && (e.type == FileType.Directory || e.type == FileType.File) && typeof e.ctime === 'number' && typeof e.mtime === 'number' && typeof e.size === 'number';
}

function newFileStat(type: FileType, size: number): FileStat {
	return { type, ctime: Date.now(), mtime: Date.now(), size };
}

function modifiedFileStat(stats: FileStat, size?: number): FileStat {
	return { type: stats.type, ctime: stats.ctime, mtime: Date.now(), size: size ?? stats.size };
}

async function getStats(entry: Entry): Promise<FileStat> {
	let stats = entry.stats;
	if (stats === undefined) {
		if (entry.serverUri) {
			const url = entry.serverUri.with({ query: 'stat' }).toString();
			const response = await xhr({ url: url.toString() });
			if (response.status === 200) {
				try {
					const res = JSON.parse(response.responseText);
					if (isStat(res)) {
						stats = res;
					}
				} catch {
					// ignore
				}
			}
		}
		if (!stats) {
			stats = newFileStat(entry.type, 0);
		}
		entry.stats = stats;
	}
	return stats;
}

async function getEntries(entry: Directory): Promise<Map<string, Entry>> {
	if (entry.entries === undefined) {
		entry.entries = new Map();
		if (entry.serverUri) {
			const url = entry.serverUri.with({ query: 'readdir' }).toString();
			const response = await xhr({ url });
			if (response.status === 200) {
				try {
					const res = JSON.parse(response.responseText);
					if (Array.isArray(res)) {
						for (const r of res) {
							if (isEntry(r)) {
								const newEntry: Entry = { type: r.type, name: r.name, serverUri: Utils.joinPath(entry.serverUri, r.name) };
								entry.entries.set(newEntry.name, newEntry);
							}
						}
					}
				} catch {
					// ignore
				}
			}
		}
	}
	return entry.entries;
}

export class MountsFileSystemProvider implements FileSystemProvider {

	root: Directory;

	constructor(serverUri: Uri) {
		this.root = { type: FileType.Directory, name: '', serverUri };
	}

	// --- manage file metadata

	async stat(resource: Uri): Promise<FileStat> {
		const entry = await this._lookup(resource, false)
		return getStats(entry);
	}

	async readDirectory(resource: Uri): Promise<[string, FileType][]> {
		const entry = await this._lookupAsDirectory(resource, false);
		const entries = await getEntries(entry);
		const result: [string, FileType][] = [];
		entries.forEach((child, name) => result.push([name, child.type]));
		return result;
	}

	// --- manage file contents

	async readFile(resource: Uri): Promise<Uint8Array> {
		const entry = await this._lookupAsFile(resource, false);
		let content = entry.content;
		if (content) {
			return content;
		}
		const serverUri = entry.serverUri;
		if (serverUri) {
			const response = await xhr({ url: serverUri.toString() });
			if (response.status >= 200 && response.status <= 204) {
				content = entry.content = response.body;
			}
		}
		if (!content) {
			throw FileSystemError.FileNotFound(resource);
		}
		return content;
	}

	async writeFile(uri: Uri, content: Uint8Array, opts: { create: boolean; overwrite: boolean; }): Promise<void> {
		const basename = Utils.basename(uri);
		const parent = await this._lookupParentDirectory(uri);
		const entries = await getEntries(parent);
		let entry = entries.get(basename);
		if (entry && entry.type === FileType.Directory) {
			throw FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !opts.create) {
			throw FileSystemError.FileNotFound(uri);
		}
		if (entry && opts.create && !opts.overwrite) {
			throw FileSystemError.FileExists(uri);
		}
		const stats = newFileStat(FileType.File, content.byteLength);
		if (!entry) {
			entry = { type: FileType.File, name: basename, stats, content };
			entries.set(basename, entry);
			this._fireSoon({ type: FileChangeType.Created, uri });
		} else {
			entry.stats = stats;
			entry.content = content;
		}
		this._fireSoon({ type: FileChangeType.Changed, uri });
	}

	// --- manage files/folders

	async rename(from: Uri, to: Uri, opts: { overwrite: boolean; }): Promise<void> {
		if (!opts.overwrite && await this._lookup(to, true)) {
			throw FileSystemError.FileExists(to);
		}

		const entry = await this._lookup(from, false);
		const oldParent = await this._lookupParentDirectory(from);

		const newParent = await this._lookupParentDirectory(to);
		const newName = Utils.basename(to);

		const oldParentEntries = await getEntries(oldParent);

		oldParentEntries.delete(entry.name);

		let newEntry: Entry;
		if (entry.type === FileType.File) {
			newEntry = { type: FileType.File, name: newName, stats: entry.stats, serverUri: entry.serverUri, content: entry.content };
		} else {
			newEntry = { type: FileType.Directory, name: newName, stats: entry.stats, serverUri: entry.serverUri, entries: entry.entries };
		}

		const newParentEntries = await getEntries(newParent);
		newParentEntries.set(newName, newEntry);

		this._fireSoon(
			{ type: FileChangeType.Deleted, uri: from },
			{ type: FileChangeType.Created, uri: to }
		);
	}

	async delete(uri: Uri, opts: { recursive: boolean; }): Promise<void> {
		const dirname = Utils.dirname(uri);
		const basename = Utils.basename(uri);
		const parent = await this._lookupAsDirectory(dirname, false);
		const parentEntries = await getEntries(parent);
		if (parentEntries.has(basename)) {
			parentEntries.delete(basename);
			parent.stats = newFileStat(parent.type, -1);
			this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { uri, type: FileChangeType.Deleted });
		}
	}

	async createDirectory(uri: Uri): Promise<void> {
		const basename = Utils.basename(uri);
		const dirname = Utils.dirname(uri);
		const parent = await this._lookupAsDirectory(dirname, false);
		const parentEntries = await getEntries(parent);

		const entry: Directory = { type: FileType.Directory, name: basename, stats: newFileStat(FileType.Directory, 0) };
		parentEntries.set(entry.name, entry);
		const stats = await getStats(parent);
		parent.stats = modifiedFileStat(stats, stats.size + 1);
		this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
	}

	// --- lookup

	private async _lookup(uri: Uri, silent: false): Promise<Entry>;
	private async _lookup(uri: Uri, silent: boolean): Promise<Entry | undefined>;
	private async _lookup(uri: Uri, silent: boolean): Promise<Entry | undefined> {
		if (uri.scheme !== SCHEME) {
			if (!silent) {
				throw FileSystemError.FileNotFound(uri);
			} else {
				return undefined;
			}
		}
		let entry: Entry | undefined = this.root;
		const parts = uri.path.split('/');
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry.type === FileType.Directory) {
				child = (await getEntries(entry)).get(part);
			}
			if (!child) {
				if (!silent) {
					throw FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}

	private async _lookupAsDirectory(uri: Uri, silent: boolean): Promise<Directory> {
		const entry = await this._lookup(uri, silent);
		if (entry?.type === FileType.Directory) {
			return entry;
		}
		throw FileSystemError.FileNotADirectory(uri);
	}

	private async _lookupAsFile(uri: Uri, silent: boolean): Promise<File> {
		const entry = await this._lookup(uri, silent);
		if (!entry) {
			throw FileSystemError.FileNotFound(uri);
		}
		if (entry.type === FileType.File) {
			return entry;
		}
		throw FileSystemError.FileIsADirectory(uri);
	}

	private _lookupParentDirectory(uri: Uri): Promise<Directory> {
		const dirname = Utils.dirname(uri);
		return this._lookupAsDirectory(dirname, false);
	}

	// --- manage file events

	private readonly _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event;

	private _bufferedChanges: FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timeout;

	watch(resource: Uri, opts: { recursive: boolean; excludes: string[]; }): Disposable {
		// ignore, fires for all changes...
		return Disposable.from();
	}

	private _fireSoon(...changes: FileChangeEvent[]): void {
		this._bufferedChanges.push(...changes);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._onDidChangeFile.fire(this._bufferedChanges);
			this._bufferedChanges.length = 0;
		}, 5);
	}

	dispose() {
		this._onDidChangeFile.dispose();
	}
}