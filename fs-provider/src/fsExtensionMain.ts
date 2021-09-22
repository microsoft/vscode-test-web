/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MountsFileSystemProvider, SCHEME } from './fsProvider';

export function activate(context: vscode.ExtensionContext) {
	const serverUri = context.extensionUri.with({ path: '/static/mount', query: undefined });

	const disposable = vscode.workspace.registerFileSystemProvider(SCHEME, new MountsFileSystemProvider(serverUri));
	context.subscriptions.push(disposable);

	console.log(`vscode-test-web-support fs provider registeres for ${SCHEME}, mount ${serverUri.toString()}`);
}
