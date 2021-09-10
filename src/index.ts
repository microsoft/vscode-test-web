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
	 * Do not show the browser. Defaults to `true` if a extensionTestsPath is provided, `false` otherwise.
	 */
	headless?: boolean;

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
		folderMountPath: options.folderPath
	};

	const port = 3000;
	const server = await runServer(port, config);

	const endpoint = `http://localhost:${port}`;

	const result = await openInBrowser({
		browserType: options.browserType,
		endpoint,
		headless: options.headless ?? true,
		devTools: options.devTools,
		waitForDebugger: options.waitForDebugger,
	});

	server.close();
	if (result) {
		return;
	}
	throw new Error('Test failed')
}

async function getBuild(version: VSCodeVersion | undefined): Promise<Static | Sources> {
	if (version === 'sources') {
		return { type: 'sources' };
	}
	return await downloadAndUnzipVSCode(version === 'stable' ? 'stable' : 'insider');
}

export async function open(options: Options): Promise<void> {

	const config: IConfig = {
		extensionDevelopmentPath: options.extensionDevelopmentPath,
		build: await getBuild(options.version),
		folderUri: options.folderUri,
		folderMountPath: options.folderPath
	};

	const port = 3000;
	await runServer(port, config);

	const endpoint = `http://localhost:${port}`;

	await openInBrowser({
		browserType: options.browserType,
		endpoint,
		headless: options.headless ?? false,
		devTools: options.devTools
	});
}

const width = 1200;
const height = 800;

interface BrowserOptions {
	browserType: BrowserType;
	endpoint: string;
	headless?: boolean;
	devTools?: boolean;
	waitForDebugger?: number;
}

function openInBrowser(options: BrowserOptions): Promise<boolean> {
	return new Promise(async (s) => {
		const args: string[] = []
		if (process.platform === 'linux' && options.browserType === 'chromium') {
			args.push('--no-sandbox');
		}

		if (options.waitForDebugger) {
			args.push(`--remote-debugging-port=${options.waitForDebugger}`);
		}

		const browser = await playwright[options.browserType].launch({ headless: options.headless, args, devtools: options.devTools });
		const context = await browser.newContext();

		const page = context.pages()[0] ?? await context.newPage();
		if (options.waitForDebugger) {
			await page.waitForFunction(() => '__jsDebugIsReady' in globalThis);
		}

		await page.setViewportSize({ width, height });

		await page.goto(options.endpoint);
		await page.exposeFunction('codeAutomationLog', (type: 'warn' | 'error' | 'info', args: unknown[]) => {
			console[type](...args);
		});

		await page.exposeFunction('codeAutomationExit', async (code: number) => {
			try {
				await browser.close();
			} catch (error) {
				console.error(`Error when closing browser: ${error}`);
			}

			s(code === 0);
		});
	});
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
	if (browserType === 'undefined') {
		return 'chromium';
	}
	if ((typeof browserType === 'string') && ['chromium', 'firefox', 'webkit'].includes(browserType)) {
		return browserType as BrowserType;
	}
	console.log(`Invalid browser type.`);
	showHelp();
	process.exit(-1);
}

async function validatePath(loc: string, isFile?: boolean): Promise<string | undefined> {
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
	'folder-uri'?: string;
}

function showHelp() {
	console.log('Usage:');
	console.log(`  --browserType 'chromium' | 'firefox' | 'webkit': The browser to launch`)
	console.log(`  --extensionDevelopmentPath path. [Optional]: A path pointing to a extension to include.`);
	console.log(`  --extensionTestsPath path.  [Optional]: A path to a test module to run`);
	console.log(`  --version. 'insiders' (Default) | 'stable' | 'sources' [Optional]`);
	console.log(`  --open-devtools. Opens the dev tools  [Optional]`);
	console.log(`  --headless. Whether to show the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. [Optional]`);
	console.log(`  folderPath. A local folder to open VS Code on. The folder content will be available as a virtual file system`);
}

async function cliMain(): Promise<void> {
	const options: minimist.Opts = { string: ['extensionDevelopmentPath', 'extensionTestsPath', 'browserType', 'version', 'waitForDebugger', 'folder-uri', 'mount'], boolean: ['open-devtools', 'headless'] };
	const args = minimist<CommandLineOptions>(process.argv.slice(2), options);

	const browserType = valdiateBrowserType(args.browserType);
	const version = validateVersion(args.version);
	const extensionTestsPath = await validatePathOrUndefined(args, 'extensionTestsPath', true);
	const extensionDevelopmentPath = await validatePathOrUndefined(args, 'extensionDevelopmentPath');
	const headless = validateBooleanOrUndefined(args, 'headless');
	const devTools = validateBooleanOrUndefined(args, 'open-devtools');

	const port = validatePortNumber(args.waitForDebugger);

	let folderUri = validateStringOrUndefined(args, 'folder-uri');
	let folderPath: string | undefined;

	const inputs = args._;
	if (inputs.length) {
		const input = await validatePath(inputs[0]);
		if (input) {
			folderPath = input;
			if (folderUri) {
				console.log(`Local folder provided as input, ignoring 'folder-uri'`)
			}
			folderUri = `vscode-test-web://mount/`;
		}
	}

	if (extensionTestsPath) {
		runTests({
			extensionTestsPath,
			extensionDevelopmentPath,
			browserType,
			version,
			devTools,
			waitForDebugger: port,
			folderUri,
			folderPath,
			headless
		})
	} else {
		open({
			extensionDevelopmentPath,
			browserType,
			version,
			devTools,
			waitForDebugger: port,
			folderUri,
			folderPath,
			headless
		})
	}
}

if (require.main === module) {
	cliMain();
}
