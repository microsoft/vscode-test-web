/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfig, IServer, runServer, Static, Sources } from './main';
import { downloadAndUnzipVSCode } from './download';
import * as path from 'path';

export interface StartServerOptions {
	/**
	 * Absolute path to folder that contains one or more extensions (in subfolders).
	 * Extension folders include a `package.json` extension manifest.
	 */
	extensionDevelopmentPath?: string;

	/**
	 * Absolute path to the extension tests runner module.
	 * Can be either a file path or a directory path that contains an `index.js`.
	 */
	extensionTestsPath?: string;

	/**
	 * The quality of the VS Code to use. Supported qualities are:
	 * - `'stable'` : The latest stable build will be used
	 * - `'insiders'` : The latest insiders build will be used
	 *
	 * Currently defaults to `insiders`, which is latest stable insiders.
	 *
	 * The setting is ignored when a vsCodeDevPath is provided.
	 */
	quality?: 'stable' | 'insiders';

	/**
	 * The commit of the VS Code build to use. If not set, the latest build is used.
	 *
	 * The setting is ignored when a vsCodeDevPath is provided.
	 */
	commit?: string;

	/**
	 * If set, opens the page with cross origin isolation enabled.
	 */
	coi?: boolean;

	/**
	 * If set, serves the page with ESM usage.
	 */
	esm?: boolean;

	/**
	 * If set, the server access log is printed to the console. Defaults to `false`.
	 */
	printServerLog?: boolean;

	/**
	 * A local path to open VSCode on. VS Code for the browser will open an a virtual
	 * file system ('vscode-test-web://mount') where the files of the local folder will served.
	 * The file system is read/write, but modifications are stored in memory and not written back to disk.
	 */
	folderPath?: string;

	/**
	 * The folder URI to open VSCode on. If 'folderPath' is set this will be ignored and 'vscode-test-web://mount'
	 * is used as folder URI instead.
	 */
	folderUri?: string;

	/**
	 * Absolute paths pointing to built-in extensions to include.
	 */
	extensionPaths?: string[];

	/**
	 * List of extensions to include. The id format is ${publisher}.${name}.
	 */
	extensionIds?: Array<{ readonly id: string; readonly preRelease?: boolean }>;

	/**
	 * Absolute path pointing to VS Code sources to use.
	 */
	vsCodeDevPath?: string;

	/**
	 * The port to start the server on. Defaults to `3000`.
	 */
	port?: number;

	/**
	 * The host name to start the server on. Defaults to `localhost`
	 */
	host?: string;

	/**
	 * The temporary folder for storing the VS Code builds used for running the tests. Defaults to `$CURRENT_WORKING_DIR/.vscode-test-web`.
	 */
	testRunnerDataDir?: string;
}

export interface VSCodeServerInfo {
	/**
	 * The server instance. Call `server.close()` to stop the server.
	 */
	server: IServer;

	/**
	 * The base URL where VS Code is served (e.g., 'http://localhost:3000')
	 */
	endpoint: string;

	/**
	 * The port the server is listening on
	 */
	port: number;

	/**
	 * The host the server is listening on
	 */
	host: string;
}

/**
 * Starts a local server that serves VS Code for the browser.
 * This is intended for use with Playwright Test's webServer configuration.
 *
 * @param options The options for configuring the server
 * @returns Server information including the endpoint URL
 *
 * @example
 * ```typescript
 * // In a standalone script (e.g., for Playwright's webServer config)
 * import { startVSCodeServer } from '@vscode/test-web/out/playwrightHelpers';
 * import * as path from 'path';
 *
 * const serverInfo = await startVSCodeServer({
 *   extensionDevelopmentPath: path.resolve(__dirname, '../'),
 *   folderPath: path.resolve(__dirname, '../test-workspace')
 * });
 *
 * console.log('Server started at:', serverInfo.endpoint);
 *
 * // Keep the server running
 * process.on('SIGTERM', () => {
 *   serverInfo.server.close();
 *   process.exit(0);
 * });
 * ```
 */
export async function startVSCodeServer(options: StartServerOptions = {}): Promise<VSCodeServerInfo> {
	// Reuse the exact same build logic from runTests()
	const build = await getBuild(options);

	const config: IConfig = {
		extensionDevelopmentPath: options.extensionDevelopmentPath,
		extensionTestsPath: options.extensionTestsPath,
		build,
		folderUri: options.folderUri,
		folderMountPath: options.folderPath,
		printServerLog: options.printServerLog ?? false,
		extensionPaths: options.extensionPaths,
		extensionIds: options.extensionIds,
		coi: options.coi ?? false,
		esm: options.esm ?? false,
	};

	const host = options.host ?? 'localhost';
	const port = options.port ?? 3000;

	// Reuse existing runServer() - zero duplication!
	const server = await runServer(host, port, config);

	return {
		server,
		endpoint: `http://${host}:${port}`,
		port,
		host,
	};
}

// Internal helper - extracted from runTests() to avoid duplication
async function getBuild(options: StartServerOptions): Promise<Static | Sources> {
	if (options.vsCodeDevPath) {
		return {
			type: 'sources',
			location: options.vsCodeDevPath,
		};
	}
	const quality = options.quality;
	const commit = options.commit;
	const testRunnerDataDir = options.testRunnerDataDir ?? path.resolve(process.cwd(), '.vscode-test-web');
	return await downloadAndUnzipVSCode(testRunnerDataDir, quality === 'stable' ? 'stable' : 'insider', commit);
}
