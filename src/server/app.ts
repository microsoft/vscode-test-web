/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Koa from 'koa';
import * as morgan from 'koa-morgan';
import * as kstatic from 'koa-static';
import * as kmount from 'koa-mount';
import * as cors from '@koa/cors';
import { join } from 'path';
import { IConfig } from './main';
import workbench from './workbench';
import { configureMounts } from './mounts';
import { prebuiltExtensionsLocation } from './extensions';

export default async function createApp(config: IConfig): Promise<Koa> {
	const app = new Koa();

	app.use(morgan('dev', { skip: (req, res) => res.statusCode >= 200 && res.statusCode < 300 }));

	// CORS
	app.use(
		cors({
			allowMethods: ['GET'],
			credentials: true,
			origin: (ctx: Koa.Context) => {
				if (
					/^https:\/\/[^.]+\.vscode-webview\.net$/.test(ctx.get('Origin'))
				) {
					return ctx.get('Origin');
				}

				return undefined as any;
			},
		})
	);

	// this is here such that the iframe worker can fetch the extension files
	app.use((ctx, next) => {
		ctx.set('Access-Control-Allow-Origin', '*');
		return next();
	});

	const serveOptions: kstatic.Options = { hidden: true };

	if (config.extensionDevelopmentPath) {
		console.log('Serving dev extensions from ' + config.extensionDevelopmentPath);
		app.use(kmount('/static/devextensions', kstatic(config.extensionDevelopmentPath, serveOptions)));
	}

	if (config.build.type === 'static') {
		app.use(kmount('/static/build', kstatic(config.build.location, serveOptions)));
	} else if (config.build.type === 'sources') {
		console.log('Serving VS Code sources from ' + config.build.location);
		app.use(kmount('/static/sources', kstatic(config.build.location, serveOptions)));
		app.use(kmount('/static/sources', kstatic(join(config.build.location, 'resources', 'server'), serveOptions))); // for manifest.json, favicon and code icons.

		// built-in extension are at 'extensions` as well as prebuilt extensions dowloaded from the marketplace
		app.use(kmount(`/static/sources/extensions`, kstatic(join(config.build.location, prebuiltExtensionsLocation), serveOptions)));
	}

	configureMounts(config, app);

	if (config.extensionPaths) {
		config.extensionPaths.forEach((extensionPath, index) => {
			console.log('Serving additional built-in extensions from ' + extensionPath);
			app.use(kmount(`/static/extensions/${index}`, kstatic(extensionPath, serveOptions)));
		});
	}

	app.use(workbench(config));

	return app;
}

