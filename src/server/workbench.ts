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
import { fsProviderExtensionPrefix, fsProviderFolderUri } from './mounts';
import { readFileInRepo } from './download';

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
	constructor(readonly baseUrl: string, readonly dev: boolean, readonly esm: boolean, private devCSSModules: string[], private readonly builtInExtensions: IScannedBuiltinExtension[] = [], private readonly productOverrides?: Record<string, any>) { }

	async render(workbenchWebConfiguration: IWorkbenchOptions): Promise<string> {
		if (this.productOverrides) {
			workbenchWebConfiguration.productConfiguration = { ...workbenchWebConfiguration.productConfiguration, ...this.productOverrides };
		}
		const values: { [key: string]: string } = {
			WORKBENCH_WEB_CONFIGURATION: asJSON(workbenchWebConfiguration),
			WORKBENCH_AUTH_SESSION: '',
			WORKBENCH_WEB_BASE_URL: this.baseUrl,
			WORKBENCH_BUILTIN_EXTENSIONS: asJSON(this.builtInExtensions),
			WORKBENCH_MAIN: await this.getMain()
		};

		try {
			const workbenchTemplate = await readFileInRepo(`views/workbench${this.esm ? '-esm' : ''}.html`);
			return workbenchTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] ?? 'undefined');
		} catch (e) {
			return String(e);
		}
	}

	async getMain() {
		const lines: string[] = [];
		if (this.esm) {
			let workbenchMain = await readFileInRepo(`out/browser/esm/main.js`);
			if (this.dev) {
				lines.push(
					"<script>",
					`globalThis._VSCODE_CSS_MODULES = ${JSON.stringify(this.devCSSModules)};`,
					"</script>",
					"<script>",
					"const sheet = document.getElementById('vscode-css-modules').sheet;",
					"globalThis._VSCODE_CSS_LOAD = function (url) { sheet.insertRule(`@import url(${url});`); };",
					"",
					"const importMap = { imports: {} };",
					"for (const cssModule of globalThis._VSCODE_CSS_MODULES) {",
					"  const cssUrl = new URL(cssModule, globalThis._VSCODE_FILE_ROOT).href;",
					"  const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');\\n`;",
					"  const blob = new Blob([jsSrc], { type: 'application/javascript' });",
					"  importMap.imports[cssUrl] = URL.createObjectURL(blob);",
					"}",
					"const importMapElement = document.createElement('script');",
					"importMapElement.type = 'importmap';",
					"importMapElement.setAttribute('nonce', '1nline-m4p');",
					"importMapElement.textContent = JSON.stringify(importMap, undefined, 2);",
					"document.head.appendChild(importMapElement);",
					"</script>");
				workbenchMain = workbenchMain.replace('./workbench.api', `${this.baseUrl}/out/vs/workbench/workbench.web.main.js`);
				lines.push(`<script type="module">${workbenchMain}</script>`);
			} else {
				workbenchMain = workbenchMain.replace('./workbench.api', `${this.baseUrl}/out/vs/workbench/workbench.web.main.internal.js`);
				lines.push(`<script src="${this.baseUrl}/out/nls.messages.js"></script>`);
				lines.push(`<script type="module">${workbenchMain}</script>`);
			}
			return lines.join('\n');
		} else {
			let workbenchMain = await readFileInRepo(`out/browser/amd/main.js`); // defines a AMD module `vscode-web-browser-main`
			workbenchMain = workbenchMain.replace('./workbench.api', `vs/workbench/workbench.web.main`);
			workbenchMain = workbenchMain + '\nrequire(["vscode-web-browser-main"], function() { });';
			if (this.dev) {

			} else {
				lines.push(`<script src="${this.baseUrl}/out/nls.messages.js"></script>`);
				lines.push(`<script src="${this.baseUrl}/out/vs/workbench/workbench.web.main.nls.js"></script>`);
				lines.push(`<script src="${this.baseUrl}/out/vs/workbench/workbench.web.main.js"></script>`);
			}
			lines.push(`<script>${workbenchMain}</script>`);
		}
		return lines.join('\n');
	}

	async renderCallback(): Promise<string> {
		return await readFileInRepo(`views/callback.html`);
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
			const esm = config.esm || await isESM(config.build.location);
			console.log('Using ESM loader:', esm);
			const devCSSModules = esm ? await getDevCssModules(config.build.location) : [];
			ctx.state.workbench = new Workbench(`${ctx.protocol}://${ctx.host}/static/sources`, true, esm, devCSSModules, builtInExtensions, {
				...productOverrides,
				webEndpointUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/sources`,
				webviewContentExternalBaseUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/sources/out/vs/workbench/contrib/webview/browser/pre/`
			});
		} else if (config.build.type === 'static') {
			const baseUrl = `${ctx.protocol}://${ctx.host}/static/build`;
			ctx.state.workbench = new Workbench(baseUrl, false, config.esm, [], [], {
				webEndpointUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/build`,
				webviewContentExternalBaseUrlTemplate: `${ctx.protocol}://{{uuid}}.${ctx.host}/static/build/out/vs/workbench/contrib/webview/browser/pre/`
			});
		} else if (config.build.type === 'cdn') {
			ctx.state.workbench = new Workbench(config.build.uri, false, config.esm, []);
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

async function getDevCssModules(vsCodeDevLocation: string): Promise<string[]> {
	const glob = await import('glob')
	return glob.glob('**/*.css', { cwd: path.join(vsCodeDevLocation, 'out') });
}

async function isESM(vsCodeDevLocation: string): Promise<boolean> {
	try {
		const packageJSON = await fs.readFile(path.join(vsCodeDevLocation, 'out', 'package.json'));
		return JSON.parse(packageJSON.toString()).type === 'module';
	} catch (e) {
		return false;
	}
}
