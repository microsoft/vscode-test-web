/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
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
