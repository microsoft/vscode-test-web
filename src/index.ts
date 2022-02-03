#!/usr/bin/env node
/* eslint-disable header/header */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfig, runServer, Static, Sources } from './server/main';
import { downloadAndUnzipVSCode, directoryExists, fileExists } from './server/download';

import * as playwright from 'playwright';
import * as minimist from 'minimist';
import * as path from 'path';

export type BrowserType = 'chromium' | 'firefox' | 'webkit' | 'none';
export type VSCodeQuality = 'insiders' | 'stable';

export type GalleryExtension = { readonly id: string; readonly preRelease?: boolean; }
export interface Options {

	/**
	 * Browser to open: 'chromium' | 'firefox' | 'webkit' | 'none'.
	 */
	browserType: BrowserType;

	/**
	 * Absolute path to folder that contains one or more extensions (in subfolders).
	 * Extension folders include a `package.json` extension manifest.
	 */
	extensionDevelopmentPath?: string;

	/**
	 * Absolute path to the extension tests runner module.
	 * Can be either a file path or a directory path that contains an `index.js`.
	 * The module is expected to have a `run` function of the following signature:
	 *
	 * ```ts
	 * function run(): Promise<void>;
	 * ```
	 *
	 * When running the extension test, the Extension Development Host will call this function
	 * that runs the test suite. This function should throws an error if any test fails.
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
	quality?: VSCodeQuality;

	/**
	 * @deprecated. Use `quality` or `vsCodeDevPath` instead.
	 */
	version?: string;

	/**
	 * Open the dev tools.
	 */
	devTools?: boolean;

	/**
	 * Do not show the browser. Defaults to `true` if a `extensionTestsPath` is provided, `false` otherwise.
	 */
	headless?: boolean;

	/**
	 * @deprecated. Use `printServerLog` instead.
	 */
	hideServerLog?: boolean;

	/**
	 * If set, the server access log is printed to the console. Defaults to `false`.
	 */
	printServerLog?: boolean;

	/**
	 * Expose browser debugging on this port number, and wait for the debugger to attach before running tests.
	 */
	waitForDebugger?: number;

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
	 * Permissions granted to the opened browser. An list of permissions can be found at
	 * https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions
	 * Example: [ 'clipboard-read', 'clipboard-write' ]
	 */
	permissions?: string[];

	/**
	 * Absolute paths pointing to built-in extensions to include.
	 */
	extensionPaths?: string[];

	/**
	 * List of extensions to include. The id format is ${publisher}.${name}.
	 */
	extensionIds?: GalleryExtension[];

	/**
	 * Absolute path pointing to VS Code sources to use.
	 */
	vsCodeDevPath?: string;

	/**
	 * Print out more information while the server is running, e.g. the console output in the browser
	 */
	verbose?: boolean;

	/**
	 * The port to start the server on. Defaults to `3000`.
	 */
	port?: number;

	/**
	 * The host name to start the server on. Defaults to `localhost`
	 */
	host?: string;
}

export interface Disposable {
	dispose(): void;
}

/**
 * Runs the tests in a browser.
 *
 * @param options The options defining browser type, extension and test location.
 */
export async function runTests(options: Options & { extensionTestsPath: string }): Promise<void> {
	const config: IConfig = {
		extensionDevelopmentPath: options.extensionDevelopmentPath,
		extensionTestsPath: options.extensionTestsPath,
		build: await getBuild(options),
		folderUri: options.folderUri,
		folderMountPath: options.folderPath,
		printServerLog: options.printServerLog ?? options.hideServerLog === false,
		extensionPaths: options.extensionPaths,
		extensionIds: options.extensionIds
	};


	const host = options.host ?? 'localhost';
	const port = options.port ?? 3000;
	const server = await runServer(host, port, config);

	return new Promise(async (s, e) => {

		const endpoint = `http://${host}:${port}`;
		const context = await openBrowser(endpoint, options);
		if (context) {
			context.once('close', () => server.close());
			await context.exposeFunction('codeAutomationLog', (type: 'warn' | 'error' | 'info', args: unknown[]) => {
				console[type](...args);
			});

			await context.exposeFunction('codeAutomationExit', async (code: number) => {
				try {
					await context.browser()?.close();
				} catch (error) {
					console.error(`Error when closing browser: ${error}`);
				}
				server.close();
				if (code === 0) {
					s();
				} else {
					e(new Error('Test failed'));
				}
			});
		} else {
			server.close();
			e(new Error('Can not run test as opening of browser failed.'));
		}
	});
}

async function getBuild(options: Options): Promise<Static | Sources> {
	if (options.vsCodeDevPath) {
		return {
			type: 'sources',
			location: options.vsCodeDevPath
		};
	}
	const quality = options.quality || options.version;
	return await downloadAndUnzipVSCode(quality === 'stable' ? 'stable' : 'insider');
}

export async function open(options: Options): Promise<Disposable> {
	const config: IConfig = {
		extensionDevelopmentPath: options.extensionDevelopmentPath,
		extensionTestsPath: options.extensionTestsPath,
		build: await getBuild(options),
		folderUri: options.folderUri,
		folderMountPath: options.folderPath,
		printServerLog: options.printServerLog ?? options.hideServerLog === false,
		extensionPaths: options.extensionPaths,
		extensionIds: options.extensionIds
	};

	const host = options.host ?? 'localhost';
	const port = options.port ?? 3000;
	const server = await runServer(host, port, config);

	const endpoint = `http://${host}:${port}`;
	const context = await openBrowser(endpoint, options);
	context?.once('close', () => server.close());

	return {
		dispose: () => {
			server.close();
			context?.browser()?.close();
		}
	}

}

async function openBrowser(endpoint: string, options: Options): Promise<playwright.BrowserContext | undefined> {
	if (options.browserType === 'none') {
		return undefined;
	}

	const browserType = await playwright[options.browserType];
	if (!browserType) {
		console.error(`Can not open browser type: ${options.browserType}`);
		return undefined;
	}

	const args: string[] = []
	if (process.platform === 'linux' && options.browserType === 'chromium') {
		args.push('--no-sandbox');
	}

	if (options.waitForDebugger) {
		args.push(`--remote-debugging-port=${options.waitForDebugger}`);
	}

	const headless = options.headless ?? options.extensionTestsPath !== undefined;

	const browser = await browserType.launch({ headless, args, devtools: options.devTools });
	const context = await browser.newContext({ viewport: null });
	if (options.permissions) {
		context.grantPermissions(options.permissions);
	}

	// forcefully close browser if last page is closed. workaround for https://github.com/microsoft/playwright/issues/2946
	let openPages = 0;
	context.on('page', page => {
		openPages++;
		page.once('close', () => {
			openPages--;
			if (openPages === 0) {
				browser.close();
			}
		})
	});


	const page = context.pages()[0] ?? await context.newPage();
	if (options.waitForDebugger) {
		await page.waitForFunction(() => '__jsDebugIsReady' in globalThis);
	}
	if (options.verbose) {
		page.on('console', (message) => {
			console.log(message.text());
		})
	}

	await page.goto(endpoint);

	return context;
}

function validateStringOrUndefined(options: CommandLineOptions, name: keyof CommandLineOptions): string | undefined {
	const value = options[name];
	if (value === undefined || (typeof value === 'string')) {
		return value;
	}
	console.log(`'${name}' needs to be a string value.`);
	showHelp();
	process.exit(-1);
}


async function validatePathOrUndefined(options: CommandLineOptions, name: keyof CommandLineOptions, isFile?: boolean): Promise<string | undefined> {
	const loc = validateStringOrUndefined(options, name);
	return loc && validatePath(loc, isFile);
}

function validateBooleanOrUndefined(options: CommandLineOptions, name: keyof CommandLineOptions): boolean | undefined {
	const value = options[name];
	if (value === undefined || (typeof value === 'boolean')) {
		return value;
	}
	console.log(`'${name}' needs to be a boolean value.`);
	showHelp();
	process.exit(-1);
}

function validatePrintServerLog(options: CommandLineOptions): boolean {
	const printServerLog = validateBooleanOrUndefined(options, 'printServerLog');
	if (printServerLog !== undefined) {
		return printServerLog;
	}
	const hideServerLog = validateBooleanOrUndefined(options, 'hideServerLog');
	if (hideServerLog !== undefined) {
		return !hideServerLog;
	}
	return false;
}


function valdiateBrowserType(options: CommandLineOptions): BrowserType {
	const browserType = options.browser || options.browserType;
	if (browserType === undefined) {
		return 'chromium';
	}
	if (options.browserType && options.browser) {
		console.log(`Ignoring browserType option '${options.browserType}' as browser option '${options.browser}' is set.`);
	}

	if ((typeof browserType === 'string') && ['chromium', 'firefox', 'webkit', 'none'].includes(browserType)) {
		return browserType as BrowserType;
	}
	console.log(`Invalid browser option ${browserType}.`);
	showHelp();
	process.exit(-1);
}

function valdiatePermissions(permissions: unknown): string[] | undefined {
	if (permissions === undefined) {
		return undefined
	}
	function isValidPermission(p: unknown): p is string {
		return typeof p === 'string';
	}
	if (isValidPermission(permissions)) {
		return [permissions];
	}
	if (Array.isArray(permissions) && permissions.every(isValidPermission)) {
		return permissions;
	}

	console.log(`Invalid permission`);
	showHelp();
	process.exit(-1);
}

async function valdiateExtensionPaths(extensionPaths: unknown): Promise<string[] | undefined> {
	if (extensionPaths === undefined) {
		return undefined
	}
	if (!Array.isArray(extensionPaths)) {
		extensionPaths = [extensionPaths];
	}
	if (Array.isArray(extensionPaths)) {
		const res: string[] = [];
		for (const extensionPath of extensionPaths) {
			if (typeof extensionPath === 'string') {
				res.push(await validatePath(extensionPath));
			} else {
				break;
			}
		}
		return res;
	}

	console.log(`Invalid extensionPath`);
	showHelp();
	process.exit(-1);
}

const EXTENSION_IDENTIFIER_PATTERN = /^([a-z0-9A-Z][a-z0-9-A-Z]*\.[a-z0-9A-Z][a-z0-9-A-Z]*)(@prerelease)?$/;

async function valdiateExtensionIds(extensionIds: unknown): Promise<GalleryExtension[] | undefined> {
	if (extensionIds === undefined) {
		return undefined
	}
	if (!Array.isArray(extensionIds)) {
		extensionIds = [extensionIds];
	}
	if (Array.isArray(extensionIds)) {
		const res: GalleryExtension[] = [];
		for (const extensionId of extensionIds) {
			const m = (typeof extensionId === 'string' && extensionId.match(EXTENSION_IDENTIFIER_PATTERN));
			if (m) {
				if (m[2]) {
					res.push({ id: m[1], preRelease: true });
				} else {
					res.push({ id: m[1] });
				}
			} else {
				console.log(`Invalid extension id: ${extensionId}. Format is publisher.name[@prerelease].`);
				break;
			}
		}
		return res;
	} else {
		console.log(`Invalid extensionId`);
	}

	showHelp();
	process.exit(-1);
}

async function validatePath(loc: string, isFile?: boolean): Promise<string> {
	loc = path.resolve(loc);
	if (isFile) {
		if (!await fileExists(loc)) {
			console.log(`'${loc}' must be an existing file.`);
			process.exit(-1);
		}
	} else {
		if (!await directoryExists(loc)) {
			console.log(`'${loc}' must be an existing folder.`);
			process.exit(-1);
		}
	}
	return loc;
}

function validateQuality(quality: unknown, version: unknown, vsCodeDevPath: string | undefined): VSCodeQuality | undefined {
	if (version) {
		console.log(`--version has been replaced by --quality`);
		quality = quality || version;
	}

	if (vsCodeDevPath && quality) {
		console.log(`Sources folder is provided as input, quality is ignored.`);
		return undefined;
	}
	if (quality === undefined || ((typeof quality === 'string') && ['insiders', 'stable'].includes(quality))) {
		return quality as VSCodeQuality;
	}
	if (version === 'sources') {
		console.log(`Instead of version=sources use 'sourcesPath' with the location of the VS Code repository.`);
	} else {
		console.log(`Invalid quality.`);
	}
	showHelp();
	process.exit(-1);
}

function validatePortNumber(port: unknown): number | undefined {
	if (typeof port === 'string') {
		const number = Number.parseInt(port);
		if (!Number.isNaN(number) && number >= 0) {
			return number;
		}
	}
	return undefined;
}


interface CommandLineOptions {
	browser?: string;
	browserType?: string;
	extensionDevelopmentPath?: string;
	extensionTestsPath?: string;
	quality?: string;
	sourcesPath?: string;
	'open-devtools'?: boolean;
	headless?: boolean;
	hideServerLog?: boolean;
	printServerLog?: boolean;
	permission?: string | string[];
	'folder-uri'?: string;
	extensionPath?: string | string[];
	extensionId?: string | string[];
	host?: string;
	port?: string;
	verbose?: boolean;
	help?: boolean;
}

function showHelp() {
	console.log('Usage:');
	console.log(`  --browser 'chromium' | 'firefox' | 'webkit' | 'none': The browser to launch. [Optional, defaults to 'chromium']`)
	console.log(`  --extensionDevelopmentPath path: A path pointing to an extension under development to include. [Optional]`);
	console.log(`  --extensionTestsPath path: A path to a test module to run. [Optional]`);
	console.log(`  --quality 'insiders' | 'stable' [Optional, default 'insiders', ignored when running from sources]`);
	console.log(`  --sourcesPath path: If provided, running from VS Code sources at the given location. [Optional]`);
	console.log(`  --open-devtools: If set, opens the dev tools. [Optional]`);
	console.log(`  --headless: Whether to hide the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. [Optional]`);
	console.log(`  --permission: Permission granted in the opened browser: e.g. 'clipboard-read', 'clipboard-write'. [Optional, Multiple]`);
	console.log(`  --folder-uri: workspace to open VS Code on. Ignored when folderPath is provided. [Optional]`);
	console.log(`  --extensionPath: A path pointing to a folder containing additional extensions to include [Optional, Multiple]`);
	console.log(`  --extensionId: The id of an extension include. The format is '\${publisher}.\${name}'. Append '@prerelease' to use a prerelease version [Optional, Multiple]`);
	console.log(`  --host: The host name the server is opened on. [Optional, defaults to localhost]`);
	console.log(`  --port: The port the server is opened on. [Optional, defaults to 3000]`);
	console.log(`  --open-devtools: If set, opens the dev tools. [Optional]`);
	console.log(`  --verbose: If set, prints out more information when running the server. [Optional]`);
	console.log(`  --printServerLog: If set, prints the server access log. [Optional]`);
	console.log(`  folderPath. A local folder to open VS Code on. The folder content will be available as a virtual file system. [Optional]`);
}

async function cliMain(): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const manifest = require('../package.json');
	console.log(`${manifest.name}: ${manifest.version}`);

	const options: minimist.Opts = {
		string: ['extensionDevelopmentPath', 'extensionTestsPath', 'browser', 'browserType', 'quality', 'version', 'waitForDebugger', 'folder-uri', 'permission', 'extensionPath', 'extensionId', 'sourcesPath', 'host', 'port'],
		boolean: ['open-devtools', 'headless', 'hideServerLog', 'printServerLog', 'help', 'verbose'],
		unknown: arg => {
			if (arg.startsWith('-')) {
				console.log(`Unknown argument ${arg}`);
				showHelp();
				process.exit();
			}
			return true;
		}
	};
	const args = minimist<CommandLineOptions>(process.argv.slice(2), options);
	if (args.help) {
		showHelp();
		process.exit();
	}

	const browserType = valdiateBrowserType(args);
	const extensionTestsPath = await validatePathOrUndefined(args, 'extensionTestsPath', true);
	const extensionDevelopmentPath = await validatePathOrUndefined(args, 'extensionDevelopmentPath');
	const extensionPaths = await valdiateExtensionPaths(args.extensionPath);
	const extensionIds = await valdiateExtensionIds(args.extensionId);
	const vsCodeDevPath = await validatePathOrUndefined(args, 'sourcesPath');
	const quality = validateQuality(args.quality, args.version, vsCodeDevPath);
	const devTools = validateBooleanOrUndefined(args, 'open-devtools');
	const headless = validateBooleanOrUndefined(args, 'headless');
	const permissions = valdiatePermissions(args.permission);
	const printServerLog = validatePrintServerLog(args);
	const verbose = validateBooleanOrUndefined(args, 'verbose');
	const port = validatePortNumber(args.port);
	const host = validateStringOrUndefined(args, 'host');

	const waitForDebugger = validatePortNumber(args.waitForDebugger);

	let folderUri = validateStringOrUndefined(args, 'folder-uri');
	let folderPath: string | undefined;

	const inputs = args._;
	if (inputs.length) {
		const input = await validatePath(inputs[0]);
		if (input) {
			folderPath = input;
			if (folderUri) {
				console.log(`Local folder provided as input, ignoring 'folder-uri'`);
				folderUri = undefined;
			}
		}
	}

	if (extensionTestsPath) {
		runTests({
			extensionTestsPath,
			extensionDevelopmentPath,
			browserType,
			quality,
			devTools,
			waitForDebugger,
			folderUri,
			folderPath,
			headless,
			printServerLog: printServerLog,
			permissions,
			extensionPaths,
			extensionIds,
			vsCodeDevPath,
			verbose,
			host,
			port
		}).catch(e => {
			console.log(e.message);
			process.exit(1);
		})
	} else {
		open({
			extensionDevelopmentPath,
			browserType,
			quality,
			devTools,
			waitForDebugger,
			folderUri,
			folderPath,
			headless,
			printServerLog: printServerLog,
			permissions,
			extensionPaths,
			extensionIds,
			vsCodeDevPath,
			verbose,
			host,
			port
		})
	}
}

if (require.main === module) {
	cliMain();
}
