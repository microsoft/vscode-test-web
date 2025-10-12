# @vscode/test-web

This module helps testing VS Code web extensions locally.

[![Test Status Badge](https://github.com/microsoft/vscode-test-web/workflows/Tests/badge.svg)](https://github.com/microsoft/vscode-test-web/actions/workflows/tests.yml)
[![npm Package](https://img.shields.io/npm/v/@vscode/test-web.svg?style=flat-square)](https://www.npmjs.org/package/@vscode/test-web)
[![NPM Downloads](https://img.shields.io/npm/dm/@vscode/test-web.svg)](https://npmjs.org/package/@vscode/test-web)

See the [web extensions guide](https://code.visualstudio.com/api/extension-guides/web-extensions) to learn about web extensions.

The node module runs a local web server that serves VS Code in the browser including the extension under development. Additionally the extension tests are automatically run.

The node module provides a command line as well as an API.

## Usage

Via command line:

Test a web extension in a browser:

```sh
vscode-test-web --browserType=chromium --extensionDevelopmentPath=$extensionLocation
```

Run web extension tests:

```sh
vscode-test-web --browserType=chromium --extensionDevelopmentPath=$extensionLocation --extensionTestsPath=$extensionLocation/dist/web/test/suite/index.js
```

Open VS Code in the Browser on a folder with test data from the local disk:

```sh
vscode-test-web --browserType=chromium --extensionDevelopmentPath=$extensionLocation $testDataLocation
```

VS Code for the Web will open on a virtual workspace (scheme `vscode-test-web`), backed by a file system provider that gets the file/folder data from the local disk. Changes to the file system are kept in memory and are not written back to disk.

Open VS Code in the Browser with external network access:

```sh
vscode-test-web --browserType=chromium --browserOption=--disable-web-security extensionDevelopmentPath=$extensionLocation
```

This allows the extension being tested to make network requests to external hosts.

Via API:

```ts
async function go() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to module with the test runner and tests
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Start a web server that serves VSCode in a browser, run the tests
    await runTests({
		browserType: 'chromium',
		extensionDevelopmentPath
		extensionTestsPath
	});
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

go()
```

### Using Playwright for UI Testing

Extension tests can use Playwright's full API via fixtures for DOM queries, screenshots, and UI interactions:

```ts
import { test } from '@vscode/test-web/playwright';
import * as assert from 'assert';

test('Verify editor is visible', async ({ page }) => {
  const element = await page.$('.monaco-editor');
  assert.ok(element, 'Editor should be visible');
});

test('Take screenshot', async ({ page }) => {
  await page.screenshot({ path: 'screenshot.png' });
});

test('Query DOM elements', async ({ page }) => {
  const divs = await page.$$('div');
  const title = await page.evaluate(() => document.title);
  const workbench = await page.$('.monaco-workbench');
});

test('Use keyboard', async ({ page }) => {
  await page.keyboard.type('Hello');
  await page.keyboard.press('Enter');
});

test('Make API requests', async ({ request }) => {
  const response = await request.get('https://api.example.com/data');
  const data = await response.json();
  assert.ok(response.ok());
});

test('Use context', async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const cookies = await context.cookies();
});
```

#### Available Fixtures

Tests receive Playwright fixtures as parameters, following the `@playwright/test` pattern:

- **`page`**: Playwright [Page](https://playwright.dev/docs/api/class-page) instance for interacting with VS Code workbench
  - All standard Page methods: `$()`, `$$()`, `click()`, `fill()`, `screenshot()`, `waitForSelector()`, etc.
  - Nested objects: `keyboard`, `mouse`, `touchscreen`
  - Navigation: `goto()`, `reload()`, `goBack()`, `goForward()`
  - Evaluation: `evaluate()`, `evaluateHandle()`
  - Screenshots: `screenshot()`

- **`context`**: Playwright [BrowserContext](https://playwright.dev/docs/api/class-browsercontext) instance
  - Methods: `newPage()`, `cookies()`, `addCookies()`, `clearCookies()`, `grantPermissions()`, `setGeolocation()`
  - Context-level operations and state management

- **`request`**: Playwright [APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext) instance
  - Methods: `get()`, `post()`, `put()`, `delete()`, `fetch()`, `head()`, `patch()`
  - Make HTTP API requests from tests

All fixtures are dynamically proxied - any fixture property available on the server-side context object will be accessible in tests.

#### Registry Management (Advanced)

For diagnostic purposes and advanced scenarios, use the `playwrightRegistry` export:

```ts
import { test, playwrightRegistry } from '@vscode/test-web/playwright';

test('diagnostic test', async ({ page }) => {
  const sizeBefore = await playwrightRegistry.getSize();
  const element = await page.$('.selector');
  const sizeAfter = await playwrightRegistry.getSize();
  assert.strictEqual(sizeAfter, sizeBefore + 1);
});

test('persist handles across tests', async ({ page }) => {
  playwrightRegistry.disableAutoClear();
  // handles will persist...
  playwrightRegistry.enableAutoClear(); // restore default
});
```

See `sample/src/web/test/suite/playwright.test.ts` for complete examples.

CLI options:

|Option|Argument Description|
|-----|-----|
| --browser | The browser to launch: `chromium` (default), `firefox`, `webkit` or `none`. |
| --browserOption | Command line argument to use when launching the browser instance. Argument can be provided multiple times. |
| --extensionDevelopmentPath | A path pointing to an extension under development to include. |
| --extensionTestsPath | A path to a test module to run. |
| --quality | `insiders` (default),  or `stable`. Ignored when sourcesPath is provided. |
| --commit | commitHash The servion of the server to use. Defaults to latest build version of the given quality. Ignored when sourcesPath is provided. |
| --sourcesPath | If set, runs the server from VS Code sources located at the given path. Make sure the sources and extensions are compiled (`npm run compile` and `npm run compile-web`). |
| --headless | If set, hides the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. |
| --permission | Permission granted to the opened browser: e.g. `clipboard-read`, `clipboard-write`.  See [full list of options](https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions). Argument can be provided multiple times. |
| --coi | If set, enables cross origin isolation. Defaults to false. |
| --folder-uri | URI of the workspace to open VS Code on. Ignored when `folderPath` is provided. |
| --extensionPath | A path pointing to a folder containing additional extensions to include. Argument can be provided multiple times. |
| --extensionId | The id of an extension include. The format is `${publisher}.${name}`. Append `@prerelease` to use the prerelease version. |
| --host | The host name the server is opened on. Defaults to `localhost`. |
| --port | The port the server is opened on. Defaults to `3000`. |
| --open-devtools | If set, opens the dev tools in the browser. |
| --verbose | If set, prints out more information when running the server. |
| --printServerLog | If set, prints the server access log. |
| --testRunnerDataDir | If set, the temporary folder for storing the VS Code builds used for running the tests |
| folderPath |  A local folder to open VS Code on. The folder content will be available as a virtual file system and opened as workspace. |

Corresponding options are available in the API.

## Development

- `npm i && npm run install-extensions`
- Make necessary changes in [`src`](./src)
- `npm run compile` (or `npm run watch`)

- run `npm run sample` to launch VS Code Browser with the `sample` extension bundled in this repo.

- run `npm run sample-tests` to launch VS Code Browser running the extension tests of the  `sample` extension bundled in this repo.


## License

[MIT](LICENSE)

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
