/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfig } from "./main";

import * as Koa from 'koa';
import * as kstatic from 'koa-static';
import * as kmount from 'koa-mount';
import * as Router from '@koa/router';

import { Dirent, promises as fs, Stats } from 'fs';
import * as path from 'path';

const mountPrefix = '/static/mount';
export const fsProviderExtensionPrefix = '/static/extensions/fs';
export const fsProviderFolderUri = 'vscode-test-web://mount/';

export function configureMounts(config: IConfig, app: Koa): void {
    const folderMountPath = config.folderMountPath;
    if (folderMountPath) {
        console.log(`Serving local content ${folderMountPath} at ${mountPrefix}`);
        app.use(fileOps(mountPrefix, folderMountPath));
        app.use(kmount(mountPrefix, kstatic(folderMountPath, { hidden: true })));

        app.use(kmount(fsProviderExtensionPrefix, kstatic(path.join(__dirname, '../../fs-provider'), { hidden: true })));
    }
}

function fileOps(mountPrefix: string, folderMountPath: string): Router.Middleware {
    const router = new Router();
    router.get(`${mountPrefix}(/.*)?`, async (ctx, next) => {
        if (ctx.query.stat !== undefined) {
            const p = path.join(folderMountPath, ctx.path.substring(mountPrefix.length));
            try {
                const stats = await fs.stat(p);
                ctx.body = {
                    type: getFileType(stats),
                    ctime: stats.ctime.getTime(),
                    mtime: stats.mtime.getTime(),
                    size: stats.size
                }
            } catch (e) {
                ctx.body = { error: (e as NodeJS.ErrnoException).code };
            }
        } else if (ctx.query.readdir !== undefined) {
            const p = path.join(folderMountPath, ctx.path.substring(mountPrefix.length));
            try {
                const entries = await fs.readdir(p, { withFileTypes: true });
                ctx.body = entries.map(d => ({ name: d.name, type: getFileType(d) }));
            } catch (e) {
                ctx.body = { error: (e as NodeJS.ErrnoException).code };
            }
        } else {
            return next();
        }
    });
    return router.routes();
}

enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

function getFileType(stats: Stats | Dirent) {
    if (stats.isFile()) {
        return FileType.File;
    } else if (stats.isDirectory()) {
        return FileType.Directory;
    } else if (stats.isSymbolicLink()) {
        return FileType.SymbolicLink;
    }
    return FileType.Unknown;
}