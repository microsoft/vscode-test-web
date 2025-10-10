/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Proposed API for Playwright integration in VS Code extension tests
 *
 * This API allows extension tests running in a Web Worker context to interact
 * with Playwright for UI testing, screenshots, and DOM manipulation.
 */

declare module 'vscode' {

	export namespace playwright {

		export interface ScreenshotOptions {
			/**
			 * The file path to save the image to. If not specified, image is returned as base64.
			 */
			path?: string;

			/**
			 * The type of screenshot, defaults to 'png'.
			 */
			type?: 'png' | 'jpeg';

			/**
			 * The quality of the image, between 0-100. Not applicable to png images.
			 */
			quality?: number;

			/**
			 * Hides default white background and allows capturing screenshots with transparency.
			 */
			omitBackground?: boolean;

			/**
			 * An object which specifies clipping of the resulting image.
			 */
			clip?: {
				x: number;
				y: number;
				width: number;
				height: number;
			};

			/**
			 * When true, takes a screenshot of the full scrollable page. Defaults to false.
			 */
			fullPage?: boolean;
		}

		/**
		 * Takes a screenshot of the page
		 * @returns base64-encoded PNG image
		 */
		export function screenshot(options?: ScreenshotOptions): Promise<string>;

		/**
		 * Waits for a selector to appear in the DOM
		 * @param selector CSS selector
		 * @param options Options for waiting
		 * @returns true if element was found
		 */
		export function waitForSelector(
			selector: string,
			options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
		): Promise<boolean>;

		/**
		 * Checks if an element matching the selector exists
		 * @param selector CSS selector
		 * @returns true if element exists
		 */
		export function querySelector(selector: string): Promise<boolean>;

		/**
		 * Counts elements matching the selector
		 * @param selector CSS selector
		 * @returns number of matching elements
		 */
		export function querySelectorAll(selector: string): Promise<number>;

		/**
		 * Clicks an element matching the selector
		 * @param selector CSS selector
		 * @param options Click options
		 */
		export function click(
			selector: string,
			options?: { timeout?: number; force?: boolean }
		): Promise<void>;

		/**
		 * Fills an input element
		 * @param selector CSS selector
		 * @param value Value to fill
		 * @param options Fill options
		 */
		export function fill(
			selector: string,
			value: string,
			options?: { timeout?: number; force?: boolean }
		): Promise<void>;

		/**
		 * Gets the text content of an element
		 * @param selector CSS selector
		 * @returns text content or null
		 */
		export function textContent(selector: string): Promise<string | null>;

		/**
		 * Gets an attribute value from an element
		 * @param selector CSS selector
		 * @param name Attribute name
		 * @returns attribute value or null
		 */
		export function getAttribute(selector: string, name: string): Promise<string | null>;

		/**
		 * Checks if an element is visible
		 * @param selector CSS selector
		 * @returns true if visible
		 */
		export function isVisible(selector: string): Promise<boolean>;

		/**
		 * Checks if an element is hidden
		 * @param selector CSS selector
		 * @returns true if hidden
		 */
		export function isHidden(selector: string): Promise<boolean>;

		/**
		 * Evaluates a function in the page context
		 * @param pageFunction Function to evaluate (as string)
		 * @param arg Argument to pass to the function
		 * @returns Result of the function
		 *
		 * @example
		 * ```typescript
		 * const title = await vscode.playwright.evaluate('() => document.title');
		 * const computed = await vscode.playwright.evaluate('(x) => x * 2', 5);
		 * ```
		 */
		export function evaluate<T = unknown>(pageFunction: string, arg?: unknown): Promise<T>;

		/**
		 * Waits for a specified timeout
		 * @param timeout Timeout in milliseconds
		 */
		export function waitForTimeout(timeout: number): Promise<void>;

		/**
		 * Keyboard utilities
		 */
		export namespace keyboard {
			/**
			 * Presses a key
			 * @param key Key name (e.g., 'Enter', 'ArrowDown', 'Control')
			 * @param options Press options
			 */
			export function press(key: string, options?: { delay?: number }): Promise<void>;

			/**
			 * Types text
			 * @param text Text to type
			 * @param options Type options
			 */
			export function type(text: string, options?: { delay?: number }): Promise<void>;
		}
	}
}
