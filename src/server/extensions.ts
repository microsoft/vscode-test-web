/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileExists } from './download';

export interface URIComponents {
	scheme: string;
	authority: string;
	path: string;
}

export async function scanForExtensions(
	rootPath: string,
	serverURI: URIComponents
): Promise<URIComponents[]> {
	const result: URIComponents[] = [];
	async function getExtension(relativePosixFolderPath: string): Promise<URIComponents | undefined> {
		try {
			const packageJSONPath = path.join(rootPath, relativePosixFolderPath, 'package.json');
			if ((await fs.stat(packageJSONPath)).isFile()) {
				return {
					scheme: serverURI.scheme,
					authority: serverURI.authority,
					path: path.posix.join(serverURI.path, relativePosixFolderPath),
				}
			}
		} catch {
			return undefined;
		}
	}

	async function processFolder(relativePosixFolderPath: string) {
		const extension = await getExtension(relativePosixFolderPath);
		if (extension) {
			result.push(extension);
		} else {
			const folderPath = path.join(rootPath, relativePosixFolderPath);
			const entries = await fs.readdir(folderPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name.charAt(0) !== '.') {
					await processFolder(path.posix.join(relativePosixFolderPath, entry.name));
				}
			}
		}
	}

	await processFolder('');
	return result;
}

/** running from VS Code sources */

export interface IScannedBuiltinExtension {
	extensionPath: string; // name of the folder
	packageJSON: any;
	packageNLS?: any;
	readmePath?: string;
	changelogPath?: string;
}

export const prebuiltExtensionsLocation = '.build/builtInExtensions';

export async function getScannedBuiltinExtensions(vsCodeDevLocation: string): Promise<IScannedBuiltinExtension[]> {
	// use the build utility as to not duplicate the code
	const extensionsUtil = await import(path.join(vsCodeDevLocation, 'build', 'lib', 'extensions.js'));

	const localExtensions : IScannedBuiltinExtension[] =  extensionsUtil.scanBuiltinExtensions(path.join(vsCodeDevLocation, 'extensions'));
	const prebuiltExtensions : IScannedBuiltinExtension[] =  extensionsUtil.scanBuiltinExtensions(path.join(vsCodeDevLocation, prebuiltExtensionsLocation));
	for (const ext of localExtensions) {
		let browserMain : string | undefined = ext.packageJSON.browser;
		if (browserMain) {
			if (!browserMain.endsWith('.js')) {
				browserMain = browserMain + '.js';
			}
			const browserMainLocation = path.join(vsCodeDevLocation, 'extensions', ext.extensionPath, browserMain);
			if (!await fileExists(browserMainLocation)) {
				console.log(`${browserMainLocation} not found. Make sure all extensions are compiled (use 'yarn watch-web').`);
			}
		}
	}
	return localExtensions.concat(prebuiltExtensions);
}
