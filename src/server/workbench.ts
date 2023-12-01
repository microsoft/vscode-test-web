/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { promises as fs } from 'fs';
import { URI } from 'vscode-uri';
import * as Router from '@koa/router';

import { GalleryExtensionInfo, IConfig } from './main';
import { getScannedBuiltinExtensions, IScannedBuiltinExtension, scanForExtensions, URIComponents } from './extensions';
import { fetch } from './download';
import { fsProviderExtensionPrefix, fsProviderFolderUri } from './mounts';

interface IDevelopmentOptions {
	extensionTestsPath?: URIComponents;
	extensions?: URIComponents[];
}

interface IWorkbenchOptions {
	additionalBuiltinExtensions?: (string | URIComponents | GalleryExtensionInfo)[];
	developmentOptions?: IDevelopmentOptions;
	productConfiguration?: { [key: string]: any };

	// options of the builtin workbench (vs/code/browser/workbench/workbench)
	folderUri?: URIComponents;
	workspaceUri?: URIComponents;
}

function asJSON(value: unknown): string {
	return JSON.stringify(value).replace(/"/g, '&quot;');
}

class Workbench {
	constructor(readonly baseUrl: string, readonly dev: boolean, readonly esm: boolean, private readonly builtInExtensions: IScannedBuiltinExtension[] = [], private readonly productOverrides?: Record<string, any>) { }

	async render(workbenchWebConfiguration: IWorkbenchOptions): Promise<string> {
		if (this.productOverrides) {
			workbenchWebConfiguration.productConfiguration = { ...workbenchWebConfiguration.productConfiguration, ...this.productOverrides };
		}
		const values: { [key: string]: string } = {
			WORKBENCH_WEB_CONFIGURATION: asJSON(workbenchWebConfiguration),
			WORKBENCH_AUTH_SESSION: '',
			WORKBENCH_WEB_BASE_URL: this.baseUrl,
			WORKBENCH_BUILTIN_EXTENSIONS: asJSON(this.builtInExtensions),
			WORKBENCH_MAIN: this.getMain(),
		};

		try {
			const workbenchTemplate = (await fs.readFile(path.resolve(__dirname, `../../views/workbench${this.esm ? '-esm' : ''}.html`))).toString();
			return workbenchTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] ?? 'undefined');
		} catch (e) {
			return String(e);
		}
	}

	getMain() {
		if (this.esm) {
			return `<script type="module" src="${this.baseUrl}/out/vs/code/browser/workbench/workbench.js"></script>`;
		}
		if (this.dev) {
			return `<script> require(['vs/code/browser/workbench/workbench'], function() {}); </script>`;
		}
		return `<script src="${this.baseUrl}/out/vs/workbench/workbench.web.main.nls.js"></script>`
			+ `<script src="${this.baseUrl}/out/vs/workbench/workbench.web.main.js"></script>`
			+ `<script src="${this.baseUrl}/out/vs/code/browser/workbench/workbench.js"></script>`;
	}

	async renderCallback(): Promise<string> {
		return await fetch(`${this.baseUrl}/out/vs/code/browser/workbench/callback.html`);
	}
}

async function getWorkbenchOptions(
	ctx: { protocol: string; host: string },
	config: IConfig
): Promise<IWorkbenchOptions> {
	const options: IWorkbenchOptions = {};
	if (config.extensionPaths) {
		const extensionPromises = config.extensionPaths.map((extensionPath, index) => {
			return scanForExtensions(extensionPath, {
				scheme: ctx.protocol,
				authority: ctx.host,
				path: `/static/extensions/${index}`,
			});
		});
		options.additionalBuiltinExtensions = (await Promise.all(extensionPromises)).flat();
	}
	if (config.extensionIds) {
		if (!options.additionalBuiltinExtensions) {
			options.additionalBuiltinExtensions = [];
		}

		options.additionalBuiltinExtensions.push(...config.extensionIds);
	}
	if (config.extensionDevelopmentPath) {
		const developmentOptions: IDevelopmentOptions = (options.developmentOptions = {});

		developmentOptions.extensions = await scanForExtensions(
			config.extensionDevelopmentPath,
			{ scheme: ctx.protocol, authority: ctx.host, path: '/static/devextensions' },
		);
		if (config.extensionTestsPath) {
			let relativePath = path.relative(config.extensionDevelopmentPath, config.extensionTestsPath);
			if (process.platform === 'win32') {
				relativePath = relativePath.replace(/\\/g, '/');
			}
			developmentOptions.extensionTestsPath = {
				scheme: ctx.protocol,
				authority: ctx.host,
				path: path.posix.join('/static/devextensions', relativePath),
			};
		}
	}
	if (config.folderMountPath) {
		if (!options.additionalBuiltinExtensions) {
			options.additionalBuiltinExtensions = [];
		}
		options.additionalBuiltinExtensions.push({ scheme: ctx.protocol, authority: ctx.host, path: fsProviderExtensionPrefix });
		options.folderUri = URI.parse(fsProviderFolderUri);
	} else if (config.folderUri) {
		options.folderUri = URI.parse(config.folderUri);
	} else {
		options.workspaceUri = URI.from({ scheme: 'tmp', path: `/default.code-workspace` });
	}
	options.productConfiguration = { enableTelemetry: false };
	return options;
}

export default function (config: IConfig): Router.Middleware {
	const router = new Router<{ workbench: Workbench }>();

	router.use(async (ctx, next) => {
		if (config.build.type === 'sources') {
			const builtInExtensions = await getScannedBuiltinExtensions(config.build.location);
			const productOverrides = await getProductOverrides(config.build.location);
			ctx.state.workbench = new Workbench(`${ctx.protocol}://${ctx.host}/static/sources`, true, config.esm, builtInExtensions, {
				...productOverrides,
				webEndpointUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/sources`,
				webviewContentExternalBaseUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/sources/out/vs/workbench/contrib/webview/browser/pre/`
			});
		} else if (config.build.type === 'static') {
			const baseUrl = `${ctx.protocol}://${ctx.host}/static/build`;
			ctx.state.workbench = new Workbench(baseUrl, false, config.esm, [], {
				webEndpointUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/build`,
				webviewContentExternalBaseUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/build/out/vs/workbench/contrib/webview/browser/pre/`
			});
		} else if (config.build.type === 'cdn') {
			ctx.state.workbench = new Workbench(config.build.uri, false, config.esm);
		}
		await next();
	});

	router.get('/callback', async ctx => {
		ctx.body = await ctx.state.workbench.renderCallback();
	});

	router.get('/', async ctx => {
		const options = await getWorkbenchOptions(ctx, config);
		ctx.body = await ctx.state.workbench.render(options);
		if (config.coi) {
			ctx.set('Cross-Origin-Opener-Policy', 'same-origin');
			ctx.set('Cross-Origin-Embedder-Policy', 'require-corp');
		}
	});

	return router.routes();
}

async function getProductOverrides(vsCodeDevLocation: string): Promise<Record<string, any> | undefined> {
	try {
		return JSON.parse((await fs.readFile(path.join(vsCodeDevLocation, 'product.overrides.json'))).toString());
	} catch (e) {
		return undefined;
	}
}
