/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Event, Uri, FileSystemProvider, Disposable, FileType, FileStat, FileSystemError, FileChangeType, FileChangeEvent } from 'vscode';
import { Utils } from 'vscode-uri';

export interface File {
	readonly type: FileType.File;
	name: string;
	stats: Promise<FileStat>;
	content: Promise<Uint8Array>;
}

export interface Directory {
	readonly type: FileType.Directory;
	name: string;
	stats: Promise<FileStat>;
	entries: Promise<Map<string, Entry>>;
}

export type Entry = File | Directory;


function newFileStat(type: FileType, size: number): Promise<FileStat> {
	return Promise.resolve({ type, ctime: Date.now(), mtime: Date.now(), size });
}

function modifiedFileStat(stats: FileStat, size?: number): Promise<FileStat> {
	return Promise.resolve({ type: stats.type, ctime: stats.ctime, mtime: Date.now(), size: size ?? stats.size });
}

export class MemFileSystemProvider implements FileSystemProvider {

	constructor(private readonly scheme: string, private readonly root: Directory) {
	}

	// --- manage file metadata

	async stat(resource: Uri): Promise<FileStat> {
		const entry = await this._lookup(resource, false);
		return entry.stats;
	}

	async readDirectory(resource: Uri): Promise<[string, FileType][]> {
		const entry = await this._lookupAsDirectory(resource, false);
		const entries = await entry.entries;
		const result: [string, FileType][] = [];
		entries.forEach((child, name) => result.push([name, child.type]));
		return result;
	}

	// --- manage file contents

	async readFile(resource: Uri): Promise<Uint8Array> {
		const entry = await this._lookupAsFile(resource, false);
		return entry.content;
	}

	async writeFile(uri: Uri, content: Uint8Array, opts: { create: boolean; overwrite: boolean; }): Promise<void> {
		const basename = Utils.basename(uri);
		const parent = await this._lookupParentDirectory(uri);
		const entries = await parent.entries;
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
			entry = { type: FileType.File, name: basename, stats, content: Promise.resolve(content) };
			entries.set(basename, entry);
			this._fireSoon({ type: FileChangeType.Created, uri });
		} else {
			entry.stats = stats;
			entry.content = Promise.resolve(content);
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

		const oldParentEntries = await oldParent.entries;

		oldParentEntries.delete(entry.name);

		entry.name = newName;

		const newParentEntries = await newParent.entries;
		newParentEntries.set(newName, entry);

		this._fireSoon(
			{ type: FileChangeType.Deleted, uri: from },
			{ type: FileChangeType.Created, uri: to }
		);
	}

	async delete(uri: Uri, opts: { recursive: boolean; }): Promise<void> {
		const dirname = Utils.dirname(uri);
		const basename = Utils.basename(uri);
		const parent = await this._lookupAsDirectory(dirname, false);
		const parentEntries = await parent.entries;
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
		const parentEntries = await parent.entries;

		const entry: Directory = { type: FileType.Directory, name: basename, stats: newFileStat(FileType.Directory, 0), entries: Promise.resolve(new Map()) };
		parentEntries.set(entry.name, entry);
		const stats = await parent.stats;
		parent.stats = modifiedFileStat(stats, stats.size + 1);
		this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
	}

	// --- lookup

	private async _lookup(uri: Uri, silent: false): Promise<Entry>;
	private async _lookup(uri: Uri, silent: boolean): Promise<Entry | undefined>;
	private async _lookup(uri: Uri, silent: boolean): Promise<Entry | undefined> {
		if (uri.scheme !== this.scheme) {
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
				child = (await entry.entries).get(part);
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