#!/usr/bin/env node
/* eslint-disable header/header */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfig, runServer, Static, Sources } from './server/main';
import { downloadAndUnzipVSCode } from './server/download';

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
	 * The folder URI to open VSCode on
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
		folderUri: options.folderUri
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
		folderUri: options.folderUri
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

function isStringOrUndefined(value: unknown): value is string {
	return value === undefined || (typeof value === 'string');
}

function isBooleanOrUndefined(value: unknown): value is string {
	return value === undefined || (typeof value === 'boolean');
}

function isBrowserType(browserType: unknown): browserType is BrowserType {
	return (typeof browserType === 'string') && ['chromium', 'firefox', 'webkit'].includes(browserType);
}

function isValidVersion(version: unknown): version is VSCodeVersion {
	return version === undefined || ((typeof version === 'string') && ['insiders', 'stable', 'sources'].includes(version));
}

function getPortNumber(port: unknown): number | undefined {
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
}

if (require.main === module) {
	const options: minimist.Opts = { string: ['extensionDevelopmentPath', 'extensionTestsPath', 'browserType', 'version', 'waitForDebugger', 'folder-uri'], boolean: ['open-devtools', 'headless'] };
	const args = minimist<CommandLineOptions>(process.argv.slice(2), options);

	const { browserType, extensionDevelopmentPath, extensionTestsPath, version, waitForDebugger, headless } = args;
	const port = getPortNumber(waitForDebugger);

	if (!isBrowserType(browserType) || !isStringOrUndefined(extensionDevelopmentPath) || !isStringOrUndefined(extensionTestsPath) || !isValidVersion(version) || !isStringOrUndefined(args['folder-uri']) || !isBooleanOrUndefined(args['open-devtools']) || !isBooleanOrUndefined(headless)) {
		console.log('Usage:');
		console.log(`  --browserType 'chromium' | 'firefox' | 'webkit': The browser to launch`)
		console.log(`  --extensionDevelopmentPath path. [Optional]: A path pointing to a extension to include.`);
		console.log(`  --extensionTestsPath path.  [Optional]: A path to a test module to run`);
		console.log(`  --folder-uri.  [Optional]: The folder to open VS Code on`)
		console.log(`  --version. 'insiders' (Default) | 'stable' | 'sources' [Optional]`);
		console.log(`  --open-devtools. Opens the dev tools  [Optional]`);
		console.log(`  --headless. Whether to show the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. [Optional]`);
		process.exit(-1);
	}
	if (extensionTestsPath) {
		runTests({
			extensionTestsPath: extensionTestsPath && path.resolve(extensionTestsPath),
			extensionDevelopmentPath: extensionDevelopmentPath && path.resolve(extensionDevelopmentPath),
			browserType,
			version,
			devTools: args['open-devtools'],
			waitForDebugger: port,
			folderUri: args['folder-uri'],
			headless
		})
	} else {
		open({
			extensionDevelopmentPath: extensionDevelopmentPath && path.resolve(extensionDevelopmentPath),
			browserType,
			version,
			devTools: args['open-devtools'],
			waitForDebugger: port,
			folderUri: args['folder-uri'],
			headless
		})
	}
}
