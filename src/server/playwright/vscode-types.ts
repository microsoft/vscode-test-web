/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type definitions for the proxied VSCode API.
 *
 * The FluentJSHandle type wraps a JSHandle to provide fluent property access
 * while maintaining type safety. It exposes the underlying JSHandle methods
 * (like jsonValue(), evaluate(), etc.) while also allowing chained property
 * access that returns new FluentJSHandle instances.
 *
 * This allows for fluent API usage:
 *   const folders = await vscode.workspace.workspaceFolders.jsonValue();
 *   const uri = vscode.Uri.parse('file:///path');
 *   const content = await vscode.workspace.fs.readFile(uri).jsonValue();
 */

import type * as vscode from 'vscode';
import type { JSHandle } from '@playwright/test';

/**
 * A JSHandle wrapper that provides fluent property access with full type safety.
 *
 * - Extends JSHandle<T> so you can call jsonValue(), evaluate(), getProperty(), etc.
 * - Property access returns FluentJSHandle of that property's type
 * - Method calls return FluentJSHandle of the return type
 *
 * To get the serialized value, explicitly call jsonValue() - this makes
 * the serialization boundary visible and keeps the API type-safe.
 */
export type FluentJSHandle<T> = Promisified<JSHandle<T>> & Fluentify<T>;

// Converts every property to return a promise and every function to return a promise
// Uses Awaited to unwrap any existing Promise before wrapping, avoiding Promise<Promise<T>>
type Promisified<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : Promise<Awaited<T[K]>>
}

type Fluentify<T> = {
	// Exclude JSHandle keys to avoid conflicts. Escape hatch is to use .getProperty().
  [K in keyof T as K extends keyof JSHandle<any> ? never : K]:
    T[K] extends (...args: infer Args) => infer R
      ? (...args: Args) => FluentJSHandle<R>
      : FluentJSHandle<T[K]>;
};

/**
 * The proxied VSCode API type.
 *
 * This is the type of the `vscode` fixture provided to Playwright tests.
 */
export type VSCode = FluentJSHandle<typeof vscode>;
