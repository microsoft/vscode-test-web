/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
interface UriComponents {
	scheme?: string;
	authority?: string;
	path?: string;
	query?: string;
	fragment?: string;
}

declare class URI implements UriComponents {
	/**
	 * Create an URI from a string, e.g. `http://www.example.com/some/path`,
	 * `file:///usr/home`, or `scheme:with/path`.
	 *
	 * *Note* that for a while uris without a `scheme` were accepted. That is not correct
	 * as all uris should have a scheme. To avoid breakage of existing code the optional
	 * `strict`-argument has been added. We *strongly* advise to use it, e.g. `Uri.parse('my:uri', true)`
	 *
	 * @see {@link Uri.toString}
	 * @param value The string value of an Uri.
	 * @param strict Throw an error when `value` is empty or when no `scheme` can be parsed.
	 * @return A new Uri instance.
	 */
	static parse(value: string, strict?: boolean): URI;

	/**
	 * Create an URI from a file system path. The {@link URI.scheme scheme}
	 * will be `file`.
	 *
	 * The *difference* between {@link URI.parse} and {@link URI.file} is that the latter treats the argument
	 * as path, not as stringified-uri. E.g. `Uri.file(path)` is *not* the same as
	 * `Uri.parse('file://' + path)` because the path might contain characters that are
	 * interpreted (# and ?). See the following sample:
	 * ```ts
	 * const good = URI.file('/coding/c#/project1');
	 * good.scheme === 'file';
	 * good.path === '/coding/c#/project1';
	 * good.fragment === '';
	 *
	 * const bad = URI.parse('file://' + '/coding/c#/project1');
	 * bad.scheme === 'file';
	 * bad.path === '/coding/c'; // path is now broken
	 * bad.fragment === '/project1';
	 * ```
	 *
	 * @param path A file system or UNC path.
	 * @return A new Uri instance.
	 */
	static file(path: string): URI;

	/**
	 * Create a new uri which path is the result of joining
	 * the path of the base uri with the provided path segments.
	 *
	 * - Note 1: `joinPath` only affects the path component
	 * and all other components (scheme, authority, query, and fragment) are
	 * left as they are.
	 * - Note 2: The base uri must have a path; an error is thrown otherwise.
	 *
	 * The path segments are normalized in the following ways:
	 * - sequences of path separators (`/` or `\`) are replaced with a single separator
	 * - for `file`-uris on windows, the backslash-character (`\`) is considered a path-separator
	 * - the `..`-segment denotes the parent segment, the `.` denotes the current segment
	 * - paths have a root which always remains, for instance on windows drive-letters are roots
	 * so that is true: `joinPath(Uri.file('file:///c:/root'), '../../other').fsPath === 'c:/other'`
	 *
	 * @param base An uri. Must have a path.
	 * @param pathSegments One more more path fragments
	 * @returns A new uri which path is joined with the given fragments
	 */
	static joinPath(base: URI, ...pathSegments: string[]): URI;

	/**
	 * Create an URI from its component parts
	 *
	 * @see {@link Uri.toString}
	 * @param components The component parts of an Uri.
	 * @return A new Uri instance.
	 */
	static from(components: {
		readonly scheme: string;
		readonly authority?: string;
		readonly path?: string;
		readonly query?: string;
		readonly fragment?: string;
	}): URI;

	/**
	 * Use the `file` and `parse` factory functions to create new `Uri` objects.
	 */
	private constructor(scheme: string, authority: string, path: string, query: string, fragment: string);

	/**
	 * Scheme is the `http` part of `http://www.example.com/some/path?query#fragment`.
	 * The part before the first colon.
	 */
	readonly scheme: string;

	/**
	 * Authority is the `www.example.com` part of `http://www.example.com/some/path?query#fragment`.
	 * The part between the first double slashes and the next slash.
	 */
	readonly authority: string;

	/**
	 * Path is the `/some/path` part of `http://www.example.com/some/path?query#fragment`.
	 */
	readonly path: string;

	/**
	 * Query is the `query` part of `http://www.example.com/some/path?query#fragment`.
	 */
	readonly query: string;

	/**
	 * Fragment is the `fragment` part of `http://www.example.com/some/path?query#fragment`.
	 */
	readonly fragment: string;

	/**
	 * The string representing the corresponding file system path of this Uri.
	 *
	 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
	 * uses the platform specific path separator.
	 *
	 * * Will *not* validate the path for invalid characters and semantics.
	 * * Will *not* look at the scheme of this Uri.
	 * * The resulting string shall *not* be used for display purposes but
	 * for disk operations, like `readFile` et al.
	 *
	 * The *difference* to the {@linkcode Uri.path path}-property is the use of the platform specific
	 * path separator and the handling of UNC paths. The sample below outlines the difference:
	 * ```ts
	 * const u = URI.parse('file://server/c$/folder/file.txt')
	 * u.authority === 'server'
	 * u.path === '/shares/c$/file.txt'
	 * u.fsPath === '\\server\c$\folder\file.txt'
	 * ```
	 */
	readonly fsPath: string;

	/**
	 * Derive a new Uri from this Uri.
	 *
	 * ```ts
	 * let file = Uri.parse('before:some/file/path');
	 * let other = file.with({ scheme: 'after' });
	 * assert.ok(other.toString() === 'after:some/file/path');
	 * ```
	 *
	 * @param change An object that describes a change to this Uri. To unset components use `null` or
	 *  the empty string.
	 * @return A new Uri that reflects the given change. Will return `this` Uri if the change
	 *  is not changing anything.
	 */
	with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI;

	/**
	 * Returns a string representation of this Uri. The representation and normalization
	 * of a URI depends on the scheme.
	 *
	 * * The resulting string can be safely used with {@link Uri.parse}.
	 * * The resulting string shall *not* be used for display purposes.
	 *
	 * *Note* that the implementation will encode _aggressive_ which often leads to unexpected,
	 * but not incorrect, results. For instance, colons are encoded to `%3A` which might be unexpected
	 * in file-uri. Also `&` and `=` will be encoded which might be unexpected for http-uris. For stability
	 * reasons this cannot be changed anymore. If you suffer from too aggressive encoding you should use
	 * the `skipEncoding`-argument: `uri.toString(true)`.
	 *
	 * @param skipEncoding Do not percentage-encode the result, defaults to `false`. Note that
	 *	the `#` and `?` characters occurring in the path will always be encoded.
		* @returns A string representation of this Uri.
		*/
	toString(skipEncoding?: boolean): string;

	/**
	 * Returns a JSON representation of this Uri.
	 *
	 * @return An object.
	 */
	toJSON(): any;

	static revive(data: UriComponents | URI): URI;
	static revive(data: UriComponents | URI | undefined): URI | undefined;
	static revive(data: UriComponents | URI | null): URI | null;
	static revive(data: UriComponents | URI | undefined | null): URI | undefined | null;
	static revive(data: UriComponents | URI | undefined | null): URI | undefined | null;
}

interface IAction extends IDisposable {
	readonly id: string;
	label: string;
	tooltip: string;
	class: string | undefined;
	enabled: boolean;
	checked?: boolean;
	run(event?: unknown): unknown;
}

interface TunnelPrivacy {
	themeIcon: string;
	id: string;
	label: string;
}

interface TunnelProviderFeatures {
	elevation: boolean;
	/**
	 * @deprecated
	 */
	public?: boolean;
	privacyOptions: TunnelPrivacy[];
}

interface IDisposable {
	dispose(): void;
}

declare abstract class Disposable implements IDisposable {
	static readonly None: IDisposable;
	constructor();
	dispose(): void;
}

/**
 * To an event a function with one or zero parameters
 * can be subscribed. The event is the subscriber function itself.
 */
interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

interface EmitterOptions {
	onFirstListenerAdd?: Function;
	onFirstListenerDidAdd?: Function;
	onListenerDidAdd?: Function;
	onLastListenerRemove?: Function;
}

declare class Emitter<T> {
	constructor(options?: EmitterOptions);
	readonly event: Event<T>;
	fire(event: T): void;
	dispose(): void;
}

interface IWebSocket {
	readonly onData: Event<ArrayBuffer>;
	readonly onOpen: Event<void>;
	readonly onClose: Event<void>;
	readonly onError: Event<any>;

	send(data: ArrayBuffer | ArrayBufferView): void;
	close(): void;
}

interface IWebSocketFactory {
	create(url: string): IWebSocket;
}

/**
 * A workspace to open in the workbench can either be:
 * - a workspace file with 0-N folders (via `workspaceUri`)
 * - a single folder (via `folderUri`)
 * - empty (via `undefined`)
 */
type IWorkspace = { workspaceUri: URI } | { folderUri: URI } | undefined;

interface IWorkspaceProvider {
	/**
	 * The initial workspace to open.
	 */
	readonly workspace: IWorkspace;

	/**
	 * Arbitrary payload from the `IWorkspaceProvider.open` call.
	 */
	readonly payload?: object;

	/**
	 * Return `true` if the provided [workspace](#IWorkspaceProvider.workspace) is trusted, `false` if not trusted, `undefined` if unknown.
	 */
	readonly trusted: boolean | undefined;

	/**
	 * Asks to open a workspace in the current or a new window.
	 *
	 * @param workspace the workspace to open.
	 * @param options optional options for the workspace to open.
	 * - `reuse`: whether to open inside the current window or a new window
	 * - `payload`: arbitrary payload that should be made available
	 * to the opening window via the `IWorkspaceProvider.payload` property.
	 * @param payload optional payload to send to the workspace to open.
	 */
	open(workspace: IWorkspace, options?: { reuse?: boolean; payload?: object }): Promise<boolean>;
}

interface ISecretStorageProvider {
	type: 'in-memory' | 'persisted' | 'unknown';
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

interface IURLCallbackProvider {
	/**
	 * Indicates that a Uri has been opened outside of VSCode. The Uri
	 * will be forwarded to all installed Uri handlers in the system.
	 */
	readonly onCallback: Event<URI>;

	/**
	 * Creates a Uri that - if opened in a browser - must result in
	 * the `onCallback` to fire.
	 *
	 * The optional `Partial<UriComponents>` must be properly restored for
	 * the Uri passed to the `onCallback` handler.
	 *
	 * For example: if a Uri is to be created with `scheme:"vscode"`,
	 * `authority:"foo"` and `path:"bar"` the `onCallback` should fire
	 * with a Uri `vscode://foo/bar`.
	 *
	 * If there are additional `query` values in the Uri, they should
	 * be added to the list of provided `query` arguments from the
	 * `Partial<UriComponents>`.
	 */
	create(options?: Partial<UriComponents>): URI;
}

interface IUpdate {
	version: string;
}

interface IUpdateProvider {
	/**
	 * Should return with the `IUpdate` object if an update is
	 * available or `null` otherwise to signal that there are
	 * no updates.
	 */
	checkForUpdate(): Promise<IUpdate | null>;
}

declare const enum LogLevel {
	Trace,
	Debug,
	Info,
	Warning,
	Error,
	Critical,
	Off,
}

interface IResourceUriProvider {
	(uri: URI): URI;
}

/**
 * The identifier of an extension in the format: `PUBLISHER.NAME`.
 * For example: `vscode.csharp`
 */
type ExtensionId = string;

export type MarketplaceExtension = ExtensionId | { readonly id: ExtensionId; preRelease?: boolean };

interface ICommonTelemetryPropertiesResolver {
	(): { [key: string]: any };
}
interface IExternalUriResolver {
	(uri: URI): Promise<URI>;
}

/**
 * External URL opener
 */
interface IExternalURLOpener {
	/**
	 * Overrides the behavior when an external URL is about to be opened.
	 * Returning false means that the URL wasn't handled, and the default
	 * handling behavior should be used: `window.open(href, '_blank', 'noopener');`
	 *
	 * @returns true if URL was handled, false otherwise.
	 */
	openExternal(href: string): boolean | Promise<boolean>;
}

interface ITunnelProvider {
	/**
	 * Support for creating tunnels.
	 */
	tunnelFactory?: ITunnelFactory;

	/**
	 * Support for filtering candidate ports.
	 */
	showPortCandidate?: IShowPortCandidate;

	/**
	 * The features that the tunnel provider supports.
	 */
	features?: TunnelProviderFeatures;
}

interface ITunnelFactory {
	(tunnelOptions: ITunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<ITunnel> | undefined;
}

interface ITunnelOptions {
	remoteAddress: { port: number; host: string };

	/**
	 * The desired local port. If this port can't be used, then another will be chosen.
	 */
	localAddressPort?: number;

	label?: string;

	/**
	 * @deprecated Use privacy instead
	 */
	public?: boolean;

	privacy?: string;

	protocol?: string;
}

interface TunnelCreationOptions {
	/**
	 * True when the local operating system will require elevation to use the requested local port.
	 */
	elevationRequired?: boolean;
}

interface ITunnel {
	remoteAddress: { port: number; host: string };

	/**
	 * The complete local address(ex. localhost:1234)
	 */
	localAddress: string;

	/**
	 * @deprecated Use privacy instead
	 */
	public?: boolean;

	privacy?: string;

	/**
	 * If protocol is not provided, it is assumed to be http, regardless of the localAddress
	 */
	protocol?: string;

	/**
	 * Implementers of Tunnel should fire onDidDispose when dispose is called.
	 */
	onDidDispose: Event<void>;

	dispose(): Promise<void> | void;
}

interface IShowPortCandidate {
	(host: string, port: number, detail: string): Promise<boolean>;
}

declare const enum Menu {
	CommandPalette,
	StatusBarWindowIndicatorMenu,
}

interface ICommand {
	/**
	 * An identifier for the command. Commands can be executed from extensions
	 * using the `vscode.commands.executeCommand` API using that command ID.
	 */
	id: string;

	/**
	 * The optional label of the command. If provided, the command will appear
	 * in the command palette.
	 */
	label?: string;

	/**
	 * The optional menus to append this command to. Only valid if `label` is
	 * provided as well.
	 * @default Menu.CommandPalette
	 */
	menu?: Menu | Menu[];

	/**
	 * A function that is being executed with any arguments passed over. The
	 * return type will be send back to the caller.
	 *
	 * Note: arguments and return type should be serializable so that they can
	 * be exchanged across processes boundaries.
	 */
	handler: (...args: any[]) => unknown;
}

interface IHomeIndicator {
	/**
	 * The link to open when clicking the home indicator.
	 */
	href: string;

	/**
	 * The icon name for the home indicator. This needs to be one of the existing
	 * icons from our Codicon icon set. For example `sync`.
	 */
	icon: string;

	/**
	 * A tooltip that will appear while hovering over the home indicator.
	 */
	title: string;
}

interface IWelcomeBanner {
	/**
	 * Welcome banner message to appear as text.
	 */
	message: string;

	/**
	 * Optional icon for the banner. This needs to be one of the existing
	 * icons from our Codicon icon set. For example `code`. If not provided,
	 * a default icon will be used.
	 */
	icon?: string;

	/**
	 * Optional actions to appear as links after the welcome banner message.
	 */
	actions?: IWelcomeLinkAction[];
}

interface IWelcomeLinkAction {
	/**
	 * The link to open when clicking. Supports command invocation when
	 * using the `command:<commandId>` value.
	 */
	href: string;

	/**
	 * The label to show for the action link.
	 */
	label: string;

	/**
	 * A tooltip that will appear while hovering over the action link.
	 */
	title?: string;
}

interface IWindowIndicator {
	/**
	 * Triggering this event will cause the window indicator to update.
	 */
	onDidChange: Event<void>;

	/**
	 * Label of the window indicator may include octicons
	 * e.g. `$(remote) label`
	 */
	label: string;

	/**
	 * Tooltip of the window indicator should not include
	 * octicons and be descriptive.
	 */
	tooltip: string;

	/**
	 * If provided, overrides the default command that
	 * is executed when clicking on the window indicator.
	 */
	command?: string;
}

declare enum ColorScheme {
	DARK = 'dark',
	LIGHT = 'light',
	HIGH_CONTRAST_LIGHT = 'hcLight',
	HIGH_CONTRAST_DARK = 'hcDark',
}

interface IInitialColorTheme {
	/**
	 * Initial color theme type.
	 */
	themeType: ColorScheme;

	/**
	 * A list of workbench colors to apply initially.
	 */
	colors?: { [colorId: string]: string };
}

interface IWelcomeDialog {

	/**
	 * Unique identifier of the welcome dialog. The identifier will be used to determine
	 * if the dialog has been previously displayed.
	 */
	id: string;

	/**
	 * Title of the welcome dialog.
	 */
	title: string;

	/**
	 * Button text of the welcome dialog.
	 */
	buttonText: string;

	/**
	 * Button command to execute from the welcome dialog.
	 */
	buttonCommand: string;

	/**
	 * Message text for the welcome dialog.
	 */
	message: string;

	/**
	 * Media to include in the welcome dialog.
	 */
	media: { altText: string; path: string };
}

interface IDevelopmentOptions {
	/**
	 * Current logging level. Default is `LogLevel.Info`.
	 */
	readonly logLevel?: LogLevel;

	/**
	 * Location of a module containing extension tests to run once the workbench is open.
	 */
	readonly extensionTestsPath?: UriComponents;

	/**
	 * Add extensions under development.
	 */
	readonly extensions?: readonly UriComponents[];

	/**
	 * Whether to enable the smoke test driver.
	 */
	readonly enableSmokeTestDriver?: boolean;
}

interface IDefaultView {
	/**
	 * The identifier of the view to show by default.
	 */
	readonly id: string;
}

declare enum EditorActivation {
	/**
	 * Activate the editor after it opened. This will automatically restore
	 * the editor if it is minimized.
	 */
	ACTIVATE = 1,

	/**
	 * Only restore the editor if it is minimized but do not activate it.
	 *
	 * Note: will only work in combination with the `preserveFocus: true` option.
	 * Otherwise, if focus moves into the editor, it will activate and restore
	 * automatically.
	 */
	RESTORE,

	/**
	 * Preserve the current active editor.
	 *
	 * Note: will only work in combination with the `preserveFocus: true` option.
	 * Otherwise, if focus moves into the editor, it will activate and restore
	 * automatically.
	 */
	PRESERVE,
}

declare enum EditorResolution {
	/**
	 * Displays a picker and allows the user to decide which editor to use.
	 */
	PICK,

	/**
	 * Disables editor resolving.
	 */
	DISABLED,

	/**
	 * Only exclusive editors are considered.
	 */
	EXCLUSIVE_ONLY,
}

declare enum EditorOpenSource {
	/**
	 * Default: the editor is opening via a programmatic call
	 * to the editor service API.
	 */
	API,

	/**
	 * Indicates that a user action triggered the opening, e.g.
	 * via mouse or keyboard use.
	 */
	USER,
}

interface IEditorOptions {
	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened.
	 *
	 * Will also not activate the group the editor opens in unless the group is already
	 * the active one. This behaviour can be overridden via the `activation` option.
	 */
	preserveFocus?: boolean;

	/**
	 * This option is only relevant if an editor is opened into a group that is not active
	 * already and allows to control if the inactive group should become active, restored
	 * or preserved.
	 *
	 * By default, the editor group will become active unless `preserveFocus` or `inactive`
	 * is specified.
	 */
	activation?: EditorActivation;

	/**
	 * Tells the editor to reload the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not reload the input if it is identical to the
	 * one showing.
	 */
	forceReload?: boolean;

	/**
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	revealIfVisible?: boolean;

	/**
	 * Will reveal the editor if it is already opened (even when not visible) in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	revealIfOpened?: boolean;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	pinned?: boolean;

	/**
	 * An editor that is sticky moves to the beginning of the editors list within the group and will remain
	 * there unless explicitly closed. Operations such as "Close All" will not close sticky editors.
	 */
	sticky?: boolean;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	index?: number;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background without loading its contents.
	 *
	 * Will also not activate the group the editor opens in unless the group is already
	 * the active one. This behaviour can be overridden via the `activation` option.
	 */
	inactive?: boolean;

	/**
	 * Will not show an error in case opening the editor fails and thus allows to show a custom error
	 * message as needed. By default, an error will be presented as notification if opening was not possible.
	 */

	/**
	 * In case of an error opening the editor, will not present this error to the user (e.g. by showing
	 * a generic placeholder in the editor area). So it is up to the caller to provide error information
	 * in that case.
	 *
	 * By default, an error when opening an editor will result in a placeholder editor that shows the error.
	 * In certain cases a modal dialog may be presented to ask the user for further action.
	 */
	ignoreError?: boolean;

	/**
	 * Allows to override the editor that should be used to display the input:
	 * - `undefined`: let the editor decide for itself
	 * - `string`: specific override by id
	 * - `EditorResolution`: specific override handling
	 */
	override?: string | EditorResolution;

	/**
	 * A optional hint to signal in which context the editor opens.
	 *
	 * If configured to be `EditorOpenSource.USER`, this hint can be
	 * used in various places to control the experience. For example,
	 * if the editor to open fails with an error, a notification could
	 * inform about this in a modal dialog. If the editor opened through
	 * some background task, the notification would show in the background,
	 * not as a modal dialog.
	 */
	source?: EditorOpenSource;

	/**
	 * An optional property to signal that certain view state should be
	 * applied when opening the editor.
	 */
	viewState?: object;
}

interface ITextEditorSelection {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber?: number;
	readonly endColumn?: number;
}

declare const enum TextEditorSelectionRevealType {
	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically.
	 */
	Center = 0,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	CenterIfOutsideViewport = 1,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
	 */
	NearTop = 2,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
	 * Only if it lies outside the viewport
	 */
	NearTopIfOutsideViewport = 3,
}

declare const enum TextEditorSelectionSource {
	/**
	 * Programmatic source indicates a selection change that
	 * was not triggered by the user via keyboard or mouse
	 * but through text editor APIs.
	 */
	PROGRAMMATIC = 'api',

	/**
	 * Navigation source indicates a selection change that
	 * was caused via some command or UI component such as
	 * an outline tree.
	 */
	NAVIGATION = 'code.navigation',

	/**
	 * Jump source indicates a selection change that
	 * was caused from within the text editor to another
	 * location in the same or different text editor such
	 * as "Go to definition".
	 */
	JUMP = 'code.jump',
}

interface ITextEditorOptions extends IEditorOptions {
	/**
	 * Text editor selection.
	 */
	selection?: ITextEditorSelection;

	/**
	 * Option to control the text editor selection reveal type.
	 * Defaults to TextEditorSelectionRevealType.Center
	 */
	selectionRevealType?: TextEditorSelectionRevealType;

	/**
	 * Source of the call that caused the selection.
	 */
	selectionSource?: TextEditorSelectionSource | string;
}

interface IDefaultEditor {
	/**
	 * The location of the editor in the editor grid layout.
	 * Editors are layed out in editor groups and the view
	 * column is counted from top left to bottom right in
	 * the order of appearance beginning with `1`.
	 *
	 * If not provided, the editor will open in the active
	 * group.
	 */
	readonly viewColumn?: number;

	/**
	 * The resource of the editor to open.
	 */
	readonly uri: UriComponents;

	/**
	 * Optional extra options like which editor
	 * to use or which text to select.
	 */
	readonly options?: ITextEditorOptions;

	/**
	 * Will not open an untitled editor in case
	 * the resource does not exist.
	 */
	readonly openOnlyIfExists?: boolean;
}

declare const enum GroupOrientation {
	HORIZONTAL,
	VERTICAL,
}

interface GroupLayoutArgument {
	/**
	 * Only applies when there are multiple groups
	 * arranged next to each other in a row or column.
	 * If provided, their sum must be 1 to be applied
	 * per row or column.
	 */
	size?: number;

	/**
	 * Editor groups  will be laid out orthogonal to the
	 * parent orientation.
	 */
	groups?: GroupLayoutArgument[];
}

interface EditorGroupLayout {
	/**
	 * The initial orientation of the editor groups at the root.
	 */
	orientation: GroupOrientation;

	/**
	 * The editor groups at the root of the layout.
	 */
	groups: GroupLayoutArgument[];
}

interface IDefaultLayout {
	/**
	 * A list of views to show by default.
	 */
	readonly views?: IDefaultView[];

	/**
	 * A list of editors to show by default.
	 */
	readonly editors?: IDefaultEditor[];

	/**
	 * The layout to use for the workbench.
	 */
	readonly layout?: {
		/**
		 * The layout of the editor area.
		 */
		readonly editors?: EditorGroupLayout;
	};

	/**
	 * Forces this layout to be applied even if this isn't
	 * the first time the workspace has been opened
	 */
	readonly force?: boolean;
}

interface IProductQualityChangeHandler {
	/**
	 * Handler is being called when the user wants to switch between
	 * `insider` or `stable` product qualities.
	 */
	(newQuality: 'insider' | 'stable'): void;
}

/**
 * Settings sync options
 */
interface ISettingsSyncOptions {
	/**
	 * Is settings sync enabled
	 */
	readonly enabled: boolean;

	/**
	 * Version of extensions sync state.
	 * Extensions sync state will be reset if version is provided and different from previous version.
	 */
	readonly extensionsSyncStateVersion?: string;

	/**
	 * Handler is being called when the user changes Settings Sync enablement.
	 */
	enablementHandler?(enablement: boolean): void;
}

interface IWorkbenchConstructionOptions {
	//#region Connection related configuration

	/**
	 * The remote authority is the IP:PORT from where the workbench is served
	 * from. It is for example being used for the websocket connections as address.
	 */
	readonly remoteAuthority?: string;

	/**
	 * The connection token to send to the server.
	 */
	readonly connectionToken?: string | Promise<string>;

	/**
	 * An endpoint to serve iframe content ("webview") from. This is required
	 * to provide full security isolation from the workbench host.
	 */
	readonly webviewEndpoint?: string;

	/**
	 * A factory for web sockets.
	 */
	readonly webSocketFactory?: IWebSocketFactory;

	/**
	 * A provider for resource URIs.
	 */
	readonly resourceUriProvider?: IResourceUriProvider;

	/**
	 * Resolves an external uri before it is opened.
	 */
	readonly resolveExternalUri?: IExternalUriResolver;

	/**
	 * A provider for supplying tunneling functionality,
	 * such as creating tunnels and showing candidate ports to forward.
	 */
	readonly tunnelProvider?: ITunnelProvider;

	/**
	 * Endpoints to be used for proxying authentication code exchange calls in the browser.
	 */
	readonly codeExchangeProxyEndpoints?: { [providerId: string]: string };

	/**
	 * The identifier of an edit session associated with the current workspace.
	 */
	readonly editSessionId?: string;

	/**
	 * Resource delegation handler that allows for loading of resources when
	 * using remote resolvers.
	 *
	 * This is exclusive with {@link resourceUriProvider}. `resourceUriProvider`
	 * should be used if a {@link webSocketFactory} is used, and will be preferred.
	 */
	readonly remoteResourceProvider?: IRemoteResourceProvider;

	/**
	 * [TEMPORARY]: This will be removed soon.
	 * Endpoints to be used for proxying repository tarball download calls in the browser.
	 */
	readonly _tarballProxyEndpoints?: { [providerId: string]: string };

	//#endregion

	//#region Workbench configuration

	/**
	 * A handler for opening workspaces and providing the initial workspace.
	 */
	readonly workspaceProvider?: IWorkspaceProvider;

	/**
	 * Settings sync options
	 */
	readonly settingsSyncOptions?: ISettingsSyncOptions;

	/**
	 * The secret storage provider to store and retrieve secrets.
	 */
	readonly secretStorageProvider?: ISecretStorageProvider;

	/**
	 * Additional builtin extensions those cannot be uninstalled but only be disabled.
	 * It can be one of the following:
	 * 	- an extension in the Marketplace
	 * 	- location of the extension where it is hosted.
	 */
	readonly additionalBuiltinExtensions?: readonly (MarketplaceExtension | UriComponents)[];

	/**
	 * List of extensions to be enabled if they are installed.
	 * Note: This will not install extensions if not installed.
	 */
	readonly enabledExtensions?: readonly ExtensionId[];

	/**
	 * Additional domains allowed to open from the workbench without the
	 * link protection popup.
	 */
	readonly additionalTrustedDomains?: string[];

	/**
	 * Enable workspace trust feature for the current window
	 */
	readonly enableWorkspaceTrust?: boolean;

	/**
	 * Urls that will be opened externally that are allowed access
	 * to the opener window. This is primarily used to allow
	 * `window.close()` to be called from the newly opened window.
	 */
	readonly openerAllowedExternalUrlPrefixes?: string[];

	/**
	 * Support for URL callbacks.
	 */
	readonly urlCallbackProvider?: IURLCallbackProvider;

	/**
	 * Support adding additional properties to telemetry.
	 */
	readonly resolveCommonTelemetryProperties?: ICommonTelemetryPropertiesResolver;

	/**
	 * A set of optional commands that should be registered with the commands
	 * registry.
	 *
	 * Note: commands can be called from extensions if the identifier is known!
	 */
	readonly commands?: readonly ICommand[];

	/**
	 * Optional default layout to apply on first time the workspace is opened (unless `force` is specified).
	 */
	readonly defaultLayout?: IDefaultLayout;

	/**
	 * Optional configuration default overrides contributed to the workbench.
	 */
	readonly configurationDefaults?: Record<string, any>;

	//#endregion

	//#region Profile options

	/**
	 * Profile to use for the workbench.
	 */
	readonly profile?: { readonly name: string; readonly contents?: string | UriComponents };

	/**
	 * URI of the profile to preview.
	 */
	readonly profileToPreview?: UriComponents;

	//#endregion

	//#region Update/Quality related

	/**
	 * Support for update reporting
	 */
	readonly updateProvider?: IUpdateProvider;

	/**
	 * Support for product quality switching
	 */
	readonly productQualityChangeHandler?: IProductQualityChangeHandler;

	//#endregion

	//#region Branding

	/**
	 * Optional home indicator to appear above the hamburger menu in the activity bar.
	 */
	readonly homeIndicator?: IHomeIndicator;

	/**
	 * Optional welcome banner to appear above the workbench. Can be dismissed by the
	 * user.
	 */
	readonly welcomeBanner?: IWelcomeBanner;

	/**
	 * Optional override for the product configuration properties.
	 */
	readonly productConfiguration?: any;

	/**
	 * Optional override for properties of the window indicator in the status bar.
	 */
	readonly windowIndicator?: IWindowIndicator;

	/**
	 * Specifies the default theme type (LIGHT, DARK..) and allows to provide initial colors that are shown
	 * until the color theme that is specified in the settings (`editor.colorTheme`) is loaded and applied.
	 * Once there are persisted colors from a last run these will be used.
	 *
	 * The idea is that the colors match the main colors from the theme defined in the `configurationDefaults`.
	 */
	readonly initialColorTheme?: IInitialColorTheme;

	/**
	 *  Welcome view dialog on first launch. Can be dismissed by the user.
	*/
	readonly welcomeDialog?: IWelcomeDialog;

	//#endregion

	//#region IPC

	readonly messagePorts?: ReadonlyMap<ExtensionId, MessagePort>;

	//#endregion

	//#region Authentication Providers

	/**
	 * Optional authentication provider contributions. These will be used over
	 * any authentication providers contributed via extensions.
	 */
	readonly authenticationProviders?: readonly IAuthenticationProvider[];

	//#endregion

	//#region Development options

	readonly developmentOptions?: IDevelopmentOptions;

	//#endregion
}

//#region Authentication Providers

// Copied from https://github.com/microsoft/vscode/blob/83f9d6b3a2d425b4b1617dc6142538151caa7866/src/vs/workbench/services/authentication/common/authentication.ts#L13

export interface IAuthenticationSessionAccount {
	label: string;
	id: string;
}

export interface IAuthenticationSession {
	id: string;
	accessToken: string;
	account: IAuthenticationSessionAccount;
	scopes: ReadonlyArray<string>;
	idToken?: string;
}

export interface IAuthenticationSessionsChangeEvent {
	added?: ReadonlyArray<IAuthenticationSession>;
	removed?: ReadonlyArray<IAuthenticationSession>;
	changed?: ReadonlyArray<IAuthenticationSession>;
}

export interface IAuthenticationProviderCreateSessionOptions {
	sessionToRecreate?: IAuthenticationSession;
}

export interface IAuthenticationProviderSessionOptions {
	/**
	 * The account that is being asked about. If this is passed in, the provider should
	 * attempt to return the sessions that are only related to this account.
	 */
	account?: IAuthenticationSessionAccount;
}

/**
 * Represents an authentication provider.
 */
export interface IAuthenticationProvider {
	/**
	 * The unique identifier of the authentication provider.
	 */
	readonly id: string;

	/**
	 * The display label of the authentication provider.
	 */
	readonly label: string;

	/**
	 * Indicates whether the authentication provider supports multiple accounts.
	 */
	readonly supportsMultipleAccounts: boolean;

	/**
	 * An {@link Event} which fires when the array of sessions has changed, or data
	 * within a session has changed.
	 */
	readonly onDidChangeSessions: Event<IAuthenticationSessionsChangeEvent>;

	/**
	 * Retrieves a list of authentication sessions.
	 * @param scopes - An optional list of scopes. If provided, the sessions returned should match these permissions, otherwise all sessions should be returned.
	 * @returns A promise that resolves to an array of authentication sessions.
	 */
	getSessions(scopes: string[] | undefined, options: IAuthenticationProviderSessionOptions): Promise<readonly IAuthenticationSession[]>;

	/**
	 * Prompts the user to log in.
	 * If login is successful, the `onDidChangeSessions` event should be fired.
	 * If login fails, a rejected promise should be returned.
	 * If the provider does not support multiple accounts, this method should not be called if there is already an existing session matching the provided scopes.
	 * @param scopes - A list of scopes that the new session should be created with.
	 * @param options - Additional options for creating the session.
	 * @returns A promise that resolves to an authentication session.
	 */
	createSession(scopes: string[], options: IAuthenticationProviderSessionOptions): Promise<IAuthenticationSession>;

	/**
	 * Removes the session corresponding to the specified session ID.
	 * If the removal is successful, the `onDidChangeSessions` event should be fired.
	 * If a session cannot be removed, the provider should reject with an error message.
	 * @param sessionId - The ID of the session to remove.
	 */
	removeSession(sessionId: string): Promise<void>;
}

//#endregion

/**
 * Utility provided in the {@link WorkbenchOptions} which allows loading resources
 * when remote resolvers are used in the web.
 */
export interface IRemoteResourceProvider {
	/**
	 * Path the workbench should delegate requests to. The embedder should
	 * install a service worker on this path and emit {@link onDidReceiveRequest}
	 * events when requests come in for that path.
	 */
	readonly path: string;

	/**
	 * Event that should fire when requests are made on the {@link pathPrefix}.
	 */
	readonly onDidReceiveRequest: Event<IRemoteResourceRequest>;
}

/**
 * todo@connor4312: this may eventually gain more properties like method and
 * headers, but for now we only deal with GET requests.
 */
export interface IRemoteResourceRequest {
	/**
	 * Request URI. Generally will begin with the current
	 * origin and {@link IRemoteResourceProvider.pathPrefix}.
	 */
	uri: URI;

	/**
	 * A method called by the editor to issue a response to the request.
	 */
	respondWith(statusCode: number, body: Uint8Array, headers: Record<string, string>): void;
}

interface IPerformanceMark {
	/**
	 * The name of a performace marker.
	 */
	readonly name: string;

	/**
	 * The UNIX timestamp at which the marker has been set.
	 */
	readonly startTime: number;
}

interface IObservableValue<T> {
	onDidChange: Event<T>;
	readonly value: T;
}

declare const enum TelemetryLevel {
	NONE = 0,
	CRASH = 1,
	ERROR = 2,
	USAGE = 3,
}

declare const enum ProgressLocation {
	Explorer = 1,
	Scm = 3,
	Extensions = 5,
	Window = 10,
	Notification = 15,
	Dialog = 20,
}

interface IProgressOptions {
	readonly location: ProgressLocation | string;
	readonly title?: string;
	readonly source?: string | { label: string; id: string };
	readonly total?: number;
	readonly cancellable?: boolean;
	readonly buttons?: string[];
}

interface IProgressNotificationOptions extends IProgressOptions {
	readonly location: ProgressLocation.Notification;
	readonly primaryActions?: readonly IAction[];
	readonly secondaryActions?: readonly IAction[];
	readonly delay?: number;
	readonly silent?: boolean;
	readonly type?: 'syncing' | 'loading';
}

interface IProgressDialogOptions extends IProgressOptions {
	readonly delay?: number;
	readonly detail?: string;
	readonly sticky?: boolean;
}

interface IProgressWindowOptions extends IProgressOptions {
	readonly location: ProgressLocation.Window;
	readonly command?: string;
	readonly type?: 'syncing' | 'loading';
}

interface IProgressCompositeOptions extends IProgressOptions {
	readonly location: ProgressLocation.Explorer | ProgressLocation.Extensions | ProgressLocation.Scm | string;
	readonly delay?: number;
}

interface IProgressStep {
	message?: string;
	increment?: number;
	total?: number;
}

interface IProgress<T> {
	report(item: T): void;
}

interface IWorkbench {
	commands: {
		/**
		 * Allows to execute any command if known with the provided arguments.
		 *
		 * @param command Identifier of the command to execute.
		 * @param rest Parameters passed to the command function.
		 * @return A promise that resolves to the returned value of the given command.
		 */
		executeCommand(command: string, ...args: any[]): Promise<unknown>;
	};

	logger: {
		/**
		 * Logging for embedder.
		 *
		 * @param level The log level of the message to be printed.
		 * @param message Message to be printed.
		 */
		log(level: LogLevel, message: string): void;
	};

	env: {
		/**
		 * @returns the scheme to use for opening the associated desktop
		 * experience via protocol handler.
		 */
		getUriScheme(): Promise<string>;

		/**
		 * Retrieve performance marks that have been collected during startup. This function
		 * returns tuples of source and marks. A source is a dedicated context, like
		 * the renderer or an extension host.
		 *
		 * *Note* that marks can be collected on different machines and in different processes
		 * and that therefore "different clocks" are used. So, comparing `startTime`-properties
		 * across contexts should be taken with a grain of salt.
		 *
		 * @returns A promise that resolves to tuples of source and marks.
		 */
		retrievePerformanceMarks(): Promise<[string, readonly PerformanceMark[]][]>;

		/**
		 * Allows to open a `URI` with the standard opener service of the
		 * workbench.
		 */
		openUri(target: URI): Promise<boolean>;

		/**
		 * Current workbench telemetry level.
		 */
		readonly telemetryLevel: IObservableValue<TelemetryLevel>;
	};

	window: {
		/**
		 * Show progress in the editor. Progress is shown while running the given callback
		 * and while the promise it returned isn't resolved nor rejected.
		 *
		 * @param task A callback returning a promise.
		 * @return A promise that resolves to the returned value of the given task result.
		 */
		withProgress<R>(
			options:
				| IProgressOptions
				| IProgressDialogOptions
				| IProgressNotificationOptions
				| IProgressWindowOptions
				| IProgressCompositeOptions,
			task: (progress: IProgress<IProgressStep>) => Promise<R>
		): Promise<R>;

		/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		showInformationMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined>;
	};

	workspace: {
		/**
		 * Resolves once the remote authority has been resolved.
		 */
		didResolveRemoteAuthority(): Promise<void>;

		/**
		 * Forwards a port. If the current embedder implements a tunnelFactory then that will be used to make the tunnel.
		 * By default, openTunnel only support localhost; however, a tunnelFactory can be used to support other ips.
		 *
		 * @throws When run in an environment without a remote.
		 *
		 * @param tunnelOptions The `localPort` is a suggestion only. If that port is not available another will be chosen.
		 */
		openTunnel(tunnelOptions: ITunnelOptions): Promise<ITunnel>;
	};

	/**
	 * Triggers shutdown of the workbench programmatically. After this method is
	 * called, the workbench is not usable anymore and the page needs to reload
	 * or closed.
	 *
	 * This will also remove any `beforeUnload` handlers that would bring up a
	 * confirmation dialog.
	 *
	 * The returned promise should be awaited on to ensure any data to persist
	 * has been persisted.
	 */
	shutdown: () => Promise<void>;
}

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
declare function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable;

//#region API Facade

declare namespace commands {
	/**
	 * Allows to execute any command if known with the provided arguments.
	 *
	 * @param command Identifier of the command to execute.
	 * @param rest Parameters passed to the command function.
	 * @return A promise that resolves to the returned value of the given command.
	 */
	function executeCommand(command: string, ...args: any[]): Promise<unknown>;
}

declare namespace logger {
	/**
	 * Record log messages to be displayed in `Log (vscode.dev)`
	 *
	 * @param level The log level of the message to be printed.
	 * @param message The log to be printed.
	 */
	function log(level: LogLevel, message: string): void;
}

declare namespace env {
	/**
	 * @returns the scheme to use for opening the associated desktop
	 * experience via protocol handler.
	 */
	function getUriScheme(): Promise<string>;

	/**
	 * Retrieve performance marks that have been collected during startup. This function
	 * returns tuples of source and marks. A source is a dedicated context, like
	 * the renderer or an extension host.
	 *
	 * *Note* that marks can be collected on different machines and in different processes
	 * and that therefore "different clocks" are used. So, comparing `startTime`-properties
	 * across contexts should be taken with a grain of salt.
	 *
	 * @returns A promise that resolves to tuples of source and marks.
	 */
	function retrievePerformanceMarks(): Promise<[string, readonly IPerformanceMark[]][]>;

	/**
	 * Allows to open a `URI` with the standard opener service of the
	 * workbench.
	 */
	function openUri(target: URI): Promise<boolean>;

	/**
	 * Current workbench telemetry level.
	 */
	const telemetryLevel: Promise<IObservableValue<TelemetryLevel>>;
}

declare namespace window {
	/**
	 * Show progress in the editor. Progress is shown while running the given callback
	 * and while the promise it returned isn't resolved nor rejected.
	 *
	 * @param task A callback returning a promise.
	 * @return A promise that resolves to the returned value of the given task result.
	 */
	function withProgress<R>(
		options:
			| IProgressOptions
			| IProgressDialogOptions
			| IProgressNotificationOptions
			| IProgressWindowOptions
			| IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>
	): Promise<R>;

	/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
	function showInformationMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined>;
}

declare namespace workspace {
	/**
	 * Resolves once the remote authority has been resolved.
	 */
	function didResolveRemoteAuthority(): Promise<void>;

	/**
	 * Forwards a port. If the current embedder implements a tunnelFactory then that will be used to make the tunnel.
	 * By default, openTunnel only support localhost; however, a tunnelFactory can be used to support other ips.
	 *
	 * @throws When run in an environment without a remote.
	 *
	 * @param tunnelOptions The `localPort` is a suggestion only. If that port is not available another will be chosen.
	 */
	function openTunnel(tunnelOptions: ITunnelOptions): Promise<ITunnel>;
}

declare const enum RemoteAuthorityResolverErrorCode {
	Unknown = 'Unknown',
	NotAvailable = 'NotAvailable',
	TemporarilyNotAvailable = 'TemporarilyNotAvailable',
	NoResolverFound = 'NoResolverFound',
}

declare class RemoteAuthorityResolverError extends Error {
	static isNotAvailable(err: any): boolean;
	static isTemporarilyNotAvailable(err: any): boolean;
	static isNoResolverFound(err: any): err is RemoteAuthorityResolverError;
	static isHandled(err: any): boolean;
	constructor(message?: string, code?: RemoteAuthorityResolverErrorCode, detail?: any);
}

export {
	// Factory
	create,
	IWorkbenchConstructionOptions,
	IWorkbench,
	// Basic Types
	URI,
	UriComponents,
	Event,
	Emitter,
	IDisposable,
	Disposable,
	IObservableValue,
	// Workspace
	IWorkspace,
	IWorkspaceProvider,
	// WebSockets
	IWebSocketFactory,
	IWebSocket,
	// Resources
	IResourceUriProvider,
	// Secret Storage
	ISecretStorageProvider,
	// Callbacks
	IURLCallbackProvider,
	// SettingsSync
	ISettingsSyncOptions,
	// Updates/Quality
	IUpdateProvider,
	IUpdate,
	IProductQualityChangeHandler,
	// Telemetry
	ICommonTelemetryPropertiesResolver,
	// External Uris
	IExternalUriResolver,
	// External URL Opener
	IExternalURLOpener,
	// Tunnel
	ITunnelProvider,
	TunnelProviderFeatures,
	TunnelPrivacy,
	ITunnelFactory,
	ITunnel,
	ITunnelOptions,
	// Ports
	IShowPortCandidate,
	// Commands
	ICommand,
	commands,
	Menu,
	// Logger
	logger,
	LogLevel,
	// Window
	window,
	// Workspace
	workspace,
	// Progress
	IProgress,
	ProgressLocation,
	IProgressStep,
	IProgressOptions,
	IProgressNotificationOptions,
	IProgressDialogOptions,
	IProgressWindowOptions,
	IProgressCompositeOptions,
	// Branding
	IHomeIndicator,
	IWindowIndicator,
	IInitialColorTheme,
	// Default layout
	IDefaultView,
	IDefaultEditor,
	IEditorOptions,
	ITextEditorOptions,
	ITextEditorSelection,
	IDefaultLayout,
	EditorGroupLayout,
	GroupOrientation,
	GroupLayoutArgument,
	// Env
	IPerformanceMark,
	env,
	// Nav Bar
	IWelcomeBanner,
	// Telemetry
	TelemetryLevel,
	// Remote authority resolver error,
	RemoteAuthorityResolverError,
	RemoteAuthorityResolverErrorCode,
	// Welcome dialog
	IWelcomeDialog
};
