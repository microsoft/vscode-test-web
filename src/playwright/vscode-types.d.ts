/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type definitions for the proxied VSCode API.
 *
 * The Promisify type transforms the VSCode API to work with the proxy pattern:
 * - Every value becomes a Promise (since we're crossing the Node.js → Worker boundary)
 * - Every object also retains its properties for fluent chaining
 * - Methods return promisified versions of their return types
 *
 * This allows for fluent API usage:
 *   const folders = await vscode.workspace.workspaceFolders;
 *   const uri = await vscode.Uri.parse('file:///path');
 *   const content = await vscode.workspace.fs.readFile(uri);
 */

import type * as vscode from 'vscode';

/**
 * Recursively transforms a type to be both a Promise and retain its structure.
 *
 * For objects: The type is both Promise<T> and has all properties as Promisify<prop>
 * For functions: Returns are promisified
 * For primitives: Becomes Promise<primitive>
 *
 * This dual nature (Promise + properties) enables the fluent API pattern.
 */
export type Promisify<T> = Promise<T> & {
	[K in keyof T]: T[K] extends (...args: infer Args) => infer R
		? (...args: Args) => Promisify<R>
		: Promisify<T[K]>;
};

/**
 * The proxied VSCode API type.
 *
 * This is the type of the `vscode` fixture provided to Playwright tests.
 */
export type VSCodeAPI = Promisify<typeof vscode>;
