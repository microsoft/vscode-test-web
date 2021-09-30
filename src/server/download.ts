/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs, existsSync, createWriteStream } from 'fs';
import * as path from 'path';

import * as https from 'https';
import * as http from 'http';
import * as createHttpsProxyAgent from 'https-proxy-agent';
import * as createHttpProxyAgent from 'http-proxy-agent';
import { URL } from 'url';

import * as decompress from 'decompress';
import * as decompressTargz from 'decompress-targz';
import { Static } from './main';

interface DownloadInfo {
	url: string;
	version: string;
}

const extensionRoot = process.cwd();
const vscodeTestDir = path.resolve(extensionRoot, '.vscode-test-web');


async function getLatestVersion(quality: 'stable' | 'insider'): Promise<DownloadInfo> {
	const update: DownloadInfo = await fetchJSON(`https://update.code.visualstudio.com/api/update/web-standalone/${quality}/latest`);
	return update;
}

const reset = '\x1b[G\x1b[0K';

async function download(downloadUrl: string, destination: string, message: string) {
	process.stdout.write(message);

	return new Promise((resolve, reject) => {
		const httpLibrary = downloadUrl.startsWith('https') ? https : http;

		httpLibrary.get(downloadUrl, getAgent(downloadUrl), res => {
			const total = Number(res.headers['content-length']);
			let received = 0;
			let timeout: NodeJS.Timeout | undefined;

			const outStream = createWriteStream(destination);
			outStream.on('close', () => resolve(destination));
			outStream.on('error', reject);

			res.on('data', chunk => {
				if (!timeout) {
					timeout = setTimeout(() => {
						process.stdout.write(`${reset}${message}: ${received}/${total} (${(received / total * 100).toFixed()}%)`);
						timeout = undefined;
					}, 100);
				}

				received += chunk.length;
			});
			res.on('end', () => {
				if (timeout) {
					clearTimeout(timeout);
				}

				process.stdout.write(`${reset}${message}: complete\n`);
			});


			res.on('error', reject);
			res.pipe(outStream);
		});
	});
}

async function unzip(source: string, destination: string, message: string) {
	process.stdout.write(message);
	if (!existsSync(destination)) {
		await fs.mkdir(destination, { recursive: true });
	}

	await decompress(source, destination, {
		plugins: [
			decompressTargz()
		],
		strip: 1
	});
	process.stdout.write(`${reset}${message}: complete\n`);
}

export async function downloadAndUnzipVSCode(quality: 'stable' | 'insider'): Promise<Static> {
	const info = await getLatestVersion(quality);

	const folderName = `vscode-web-${quality}-${info.version}`;

	const downloadedPath = path.resolve(vscodeTestDir, folderName);
	if (existsSync(downloadedPath) && existsSync(path.join(downloadedPath, 'version'))) {
		return { type: 'static', location: downloadedPath, quality, version: info.version };
	}

	if (existsSync(vscodeTestDir)) {
		await fs.rmdir(vscodeTestDir, { recursive: true, maxRetries: 5 });
	}

	await fs.mkdir(vscodeTestDir, { recursive: true });

	const productName = `VS Code ${quality === 'stable' ? 'Stable' : 'Insiders'}`;

	const tmpArchiveName = `vscode-web-${quality}-${info.version}-tmp`;
	try {
		await download(info.url, tmpArchiveName, `Downloading ${productName}`);
		await unzip(tmpArchiveName, downloadedPath, `Unpacking ${productName}`);
		await fs.writeFile(path.join(downloadedPath, 'version'), folderName);
	} catch (err) {
		console.error(err);
		throw Error(`Failed to download and unpack ${productName}`);
	} finally {
		try {
			fs.unlink(tmpArchiveName);
		} catch (e) {
			// ignore
		}

	}
	return { type: 'static', location: downloadedPath, quality, version: info.version };
}

export async function fetch(api: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const httpLibrary = api.startsWith('https') ? https : http;
		httpLibrary.get(api, getAgent(api), res => {
			if (res.statusCode !== 200) {
				reject('Failed to get content from ');
			}

			let data = '';

			res.on('data', chunk => {
				data += chunk;
			});

			res.on('end', () => {
				resolve(data);
			});

			res.on('error', err => {
				reject(err);
			});
		});
	});
}

export async function fetchJSON<T>(api: string): Promise<T> {
	const data = await fetch(api);
	try {
		return JSON.parse(data);
	} catch (err) {
		throw new Error(`Failed to parse response from ${api}`);
	}
}

let PROXY_AGENT: createHttpProxyAgent.HttpProxyAgent | undefined = undefined;
let HTTPS_PROXY_AGENT: createHttpsProxyAgent.HttpsProxyAgent | undefined = undefined;

if (process.env.npm_config_proxy) {
	PROXY_AGENT = createHttpProxyAgent(process.env.npm_config_proxy);
	HTTPS_PROXY_AGENT = createHttpsProxyAgent(process.env.npm_config_proxy);
}
if (process.env.npm_config_https_proxy) {
	HTTPS_PROXY_AGENT = createHttpsProxyAgent(process.env.npm_config_https_proxy);
}

function getAgent(url: string): https.RequestOptions {
	const parsed = new URL(url);
	const options: https.RequestOptions = {};
	if (PROXY_AGENT && parsed.protocol.startsWith('http:')) {
		options.agent = PROXY_AGENT;
	}

	if (HTTPS_PROXY_AGENT && parsed.protocol.startsWith('https:')) {
		options.agent = HTTPS_PROXY_AGENT;
	}

	return options;
}

export async function directoryExists(path: string): Promise<boolean> {
	try {
		const stats = await fs.stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		const stats = await fs.stat(path);
		return stats.isFile();
	} catch {
		return false;
	}
}