/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Koa from 'koa';
import * as morgan from 'koa-morgan';
import * as kstatic from 'koa-static';
import * as kmount from 'koa-mount';
import { IConfig } from './main';
import workbench from './workbench';
import * as path from 'path';
import { configureMounts } from './mounts';

export default async function createApp(config: IConfig): Promise<Koa> {
	const app = new Koa();

	app.use(morgan('dev'));

	// this is here such that the iframe worker can fetch the extension files
	app.use((ctx, next) => {
		ctx.set('Access-Control-Allow-Origin', '*');
		return next();
	});

	app.use(kmount('/static', kstatic(path.join(__dirname, '../static'))));

	if (config.extensionPath) {
		console.log('Serving extensions from ' + config.extensionPath);
		app.use(kmount('/static/extensions', kstatic(config.extensionPath, { hidden: true })));
	}

	if (config.extensionDevelopmentPath) {
		console.log('Serving dev extensions from ' + config.extensionDevelopmentPath);
		app.use(kmount('/static/devextensions', kstatic(config.extensionDevelopmentPath, { hidden: true })));
	}

	if (config.build.type === 'static') {
		app.use(kmount('/static/build', kstatic(config.build.location, { hidden: true })));
	}

	configureMounts(config, app);

	app.use(workbench(config));

	return app;
}

