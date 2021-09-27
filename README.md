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

```
vscode-test-web --browserType=chromium --extensionDevelopmentPath=$extensionLocation $testDataLocation
```

VS Code for the Web will open on a virtual workspace (scheme `vscode-test-web`), backed by a file system provider that gets the file/folder data from the local disk. Changes to the file system are kept in memory and are not written back to disk.

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

CLI options:

 |Option|Argument Description|
 |-----|-----|
 | --browserType | The browser to launch: `chromium` (default), `firefox` or `webkit` |
| --extensionDevelopmentPath | A path pointing to an extension under development to include. |
| --extensionTestsPath |  A path to a test module to run. |
| --version | `insiders` (default),  `stable` or  `sources`.<br>For sources, also run `yarn web` in a vscode repo   |
| --open-devtools|  If set, opens the dev tools  |
| --headless|  If set, hides the browser. Defaults to true when an extensionTestsPath is provided, otherwise false. |
| --hideServerLog| If set, hides the server log. Defaults to true when an extensionTestsPath is provided, otherwise false. |
| --permission|  Permission granted to the opened browser: e.g. `clipboard-read`, `clipboard-write`.  See [full list of options](https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions). Argument can be provided multiple times.  |
| --folder-uri | URI of the workspace to open VS Code on. Ignored when `folderPath` is provided |
| --extensionPath | A path pointing to a folder containing additional extensions to include. Argument can be provided multiple times. |
| folderPath |  A local folder to open VS Code on. The folder content will be available as a virtual file system and opened as workspace. |

Corresponding options are available in the API.

## Development

- `yarn && yarn install-extensions`
- Make necessary changes in [`src`](./src)
- `yarn compile` (or `yarn watch`)

- run `yarn sample` to launch VS Code Browser with the `sample` extension bundled in this repo.

- run `yarn sample-tests` to launch VS Code Browser running the extension tests of the  `sample` extension bundled in this repo.


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
