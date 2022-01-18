/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import createApp from './app';

export interface IConfig {
	readonly extensionPaths: string[] | undefined;
	readonly extensionDevelopmentPath: string | undefined;
	readonly extensionTestsPath: string | undefined;
	readonly build: Sources | Static | CDN;
	readonly folderUri: string | undefined;
	readonly folderMountPath: string | undefined;
	readonly hideServerLog: boolean;
}

export interface Sources {
	type: 'sources';
	location: string;
}

export interface Static {
	type: 'static';
	location: string;
	quality: 'stable' | 'insider';
	version: string;
}

export interface CDN {
	type: 'cdn';
	uri: string;
}

export interface IServer {
	close(): void;
}

export async function runServer(host: string, port: number | undefined, config: IConfig): Promise<IServer> {
	const app = await createApp(config);
	const server = app.listen(port, host);
	console.log(`Listening on http://${host}:${port}`);
	return server;
}

