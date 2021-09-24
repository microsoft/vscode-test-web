/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import createApp from './app';

export interface IConfig {
	readonly extensionPaths?: string[];
	readonly extensionDevelopmentPath?: string;
	readonly extensionTestsPath?: string;
	readonly build: Sources | Static | CDN;
	readonly folderUri?: string;
	readonly folderMountPath?: string;
	readonly hideServerLog?: boolean;
}

export interface Sources {
	type: 'sources';
}

export interface Static {
	type: 'static';
	location: string;
}

export interface CDN {
	type: 'cdn';
	uri: string;
}

export interface IServer {
	close(): void;
}

export async function runServer(port: number | undefined, config: IConfig): Promise<IServer> {
	const app = await createApp(config);
	const server = app.listen(port);
	console.log(`Listening on http://localhost:${port}`);
	return server;
}

