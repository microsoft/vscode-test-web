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

export type BrowserType = 'chromium' | 'firefox' | 'webkit';
export type VSCodeVersion = 'insiders' | 'stable' | 'sources';

export interface Options {

	/**
	 * Browser to run the test against: 'chromium' | 'firefox' | 'webkit'
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
	 * The VS Code version to use. Valid versions are:
	 * - `'stable'` : The latest stable build
	 * - `'insiders'` : The latest insiders build
	 * - `'sources'`: From sources, served at localhost:8080 by running `yarn web` in the vscode repo
	 *
	 * Currently defaults to `insiders`, which is latest stable insiders.
	 */
	version?: VSCodeVersion;

	/**
	 * Open the dev tools.
	 */
	devTools?: boolean;

	/**
	 * Do not show the browser. Defaults to `true` if a `extensionTestsPath` is provided, `false` otherwise.
	 */
	headless?: boolean;

	/**
	 * Do not show the server log. Defaults to `true` if a extensionTestsPath is provided, `false` otherwise.
	 */
	hideServerLog?: boolean;

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


	verbose?: boolean;
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
		build: await getBuild(options.version),
		folderUri: options.folderUri,
		folderMountPath: options.folderPath,
		hideServerLog: true,
		extensionPaths: options.extensionPaths
	};

	const port = 3000;
	const server = await runServer(port, config);

	return new Promise(async (s, e) => {

		const endpoint = `http://localhost:${port}`;
		const context = await openBrowser(endpoint, options);
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
	});
}

async function getBuild(version: VSCodeVersion | undefined): Promise<Static | Sources> {
	if (version === 'sources') {
		return { type: 'sources' };
	}
	return await downloadAndUnzipVSCode(version === 'stable' ? 'stable' : 'insider');
}

export async function open(options: Options): Promise<Disposable> {
	const config: IConfig = {
		extensionDevelopmentPath: options.extensionDevelopmentPath,
		extensionTestsPath: options.extensionTestsPath,
		build: await getBuild(options.version),
		folderUri: options.folderUri,
		folderMountPath: options.folderPath,
		extensionPaths: options.extensionPaths
	};

	const port = 3000;
	const server = await runServer(port, config);

	const endpoint = `http://localhost:${port}`;
	const context = await openBrowser(endpoint, options);
	context.once('close', () => server.close());

	return {
		dispose: () => {
			server.close();
			context.browser()?.close();
		}
	}

}

const width = 1200;
const height = 800;

async function openBrowser(endpoint: string, options: Options): Promise<playwright.BrowserContext> {
	const args: string[] = []
	if (process.platform === 'linux' && options.browserType === 'chromium') {
		args.push('--no-sandbox');
	}

	if (options.waitForDebugger) {
		args.push(`--remote-debugging-port=${options.waitForDebugger}`);
	}

	const headless = options.headless ?? options.extensionTestsPath !== undefined;

	const browser = await playwright[options.browserType].launch({ headless, args, devtools: options.devTools });
	const context = await browser.newContext();
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


	await page.setViewportSize({ width, height });

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

function valdiateBrowserType(browserType: unknown): BrowserType {
	if (browserType === undefined) {
		return 'chromium';
	}
	if ((typeof browserType === 'string') && ['chromium', 'firefox', 'webkit'].includes(browserType)) {
		return browserType as BrowserType;
	}
	console.log(`Invalid browser type.`);
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

function validateVersion(version: unknown): VSCodeVersion | undefined {
	if (version === undefined || ((typeof version === 'string') && ['insiders', 'stable', 'sources'].includes(version))) {
		return version as VSCodeVersion;
	}
	console.log(`Invalid version.`);
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
	browserType?: string;
	extensionDevelopmentPath?: string;
	extensionTestsPath: string;
	type?: string;
	'open-devtools'?: boolean;
	headless?: boolean;
	hideServerLog?: boolean;
	'folder-uri'?: string;
	permission?: string | string[];
	extensionPath: string | string[];
	help?: boolean;
	verbose?: boolean;
}

function showHelp() {
	console.log('Usage:');
	console.log(`  --browserType 'chromium' | 'firefox' | 'webkit': The browser to launch. [Optional, default 'chromium']`)
	console.log(`  --extensionDevelopmentPath path: A path pointing to an extension under development to include. [Optional]`);
	console.log(`  --extensionTestsPath path: A path to a test module to run. [Optional]`);
	console.log(`  --version 'insiders' | 'stable' | 'sources' [Optional, default 'insiders']`);
	console.log(`  --open-devtools: If set, opens the dev tools  [Optional]`);
	console.log(`  --headless: Whether to hide the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. [Optional]`);
	console.log(`  --hideServerLog: Whether to hide the server log. Defaults to true when an extensionTestsPath is provided, otherwise false. [Optional]`);
	console.log(`  --permission: Permission granted in the opened browser: e.g. 'clipboard-read', 'clipboard-write':  [Optional, Multiple]`);
	console.log(`  --folder-uri: workspace to open VS Code on. Ignored when folderPath is provided [Optional]`);
	console.log(`  --extensionPath: A path pointing to a folder containing additional extensions to include [Optional, Multiple]`);
	console.log(`  folderPath. A local folder to open VS Code on. The folder content will be available as a virtual file system. [Optional]`);
}

async function cliMain(): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const manifest = require('../package.json');
	console.log(`${manifest.name}: ${manifest.version}`);

	const options: minimist.Opts = {
		string: ['extensionDevelopmentPath', 'extensionTestsPath', 'browserType', 'version', 'waitForDebugger', 'folder-uri', 'permission', 'extensionPath'],
		boolean: ['open-devtools', 'headless', 'hideServerLog', 'help', 'verbose'],
		unknown: arg => {
			if (arg.startsWith('-')) {
				console.log(`Unknown argument ${arg}`);
				showHelp();
				return false;
			}
			return true;
		}
	};
	const args = minimist<CommandLineOptions>(process.argv.slice(2), options);
	if (args.help) {
		showHelp();
		process.exit();
	}

	const browserType = valdiateBrowserType(args.browserType);
	const extensionTestsPath = await validatePathOrUndefined(args, 'extensionTestsPath', true);
	const extensionDevelopmentPath = await validatePathOrUndefined(args, 'extensionDevelopmentPath');
	const extensionPaths = await valdiateExtensionPaths(args.extensionPath);
	const version = validateVersion(args.version);
	const devTools = validateBooleanOrUndefined(args, 'open-devtools');
	const headless = validateBooleanOrUndefined(args, 'headless');
	const permissions = valdiatePermissions(args.permission);
	const hideServerLog = validateBooleanOrUndefined(args, 'hideServerLog');
	const verbose = validateBooleanOrUndefined(args, 'verbose');

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
			version,
			devTools,
			waitForDebugger,
			folderUri,
			folderPath,
			headless,
			hideServerLog,
			permissions,
			extensionPaths,
			verbose
		})
	} else {
		open({
			extensionDevelopmentPath,
			browserType,
			version,
			devTools,
			waitForDebugger,
			folderUri,
			folderPath,
			headless,
			hideServerLog,
			permissions,
			extensionPaths,
			verbose
		})
	}
}

if (require.main === module) {
	cliMain();
}
