# Changelog
## 0.0.58
 * new option `--commit` to specify the build of VS Code to use. By default the latest build is used.

## 0.0.37
 * new option `--testRunnerDataDir` to set the temporary folder for storing the VS Code builds used for running the tests

## 0.0.28
 * new option `--coi` to enable cross origin isolation.

## 0.0.22
 * new option `--printServerLog` replacing `--hideServerLog`.
 * new option `--browser` replacing `--browserType`.

## 0.0.20
 * new option `--extensionId publisher.name[@prerelease]` to include one or more extensions.

## 0.0.18
 * new option `--browserType none` to start the server without opening a browser.

## 0.0.17
 * new options `--host` and `--port`: If provided runs the server from the given host and port.
 * new option `--verbose` to print out the browser console log.

## 0.0.16
 * new option `--sourcesPath`: If provided, runs the server from VS Code sources at the given location.
 * option `--version` is deprecated and replaced with `quality`. Supported values: `stable`, `insiders`. Instead of `sources` use `--insiders`.

## 0.0.14
 * new option `--extensionPath` : A path pointing to a folder containing additional extensions to include. Argument can be provided multiple times.
 * new option `--permission`: Permission granted to the opened browser: e.g. clipboard-read, clipboard-write. See full list of options [here](https://playwright.dev/docs/1.14/emulation#permissions). Argument can be provided multiple times.
 * new option `--hideServerLog`: If set, hides the server log. Defaults to true when an extensionTestsPath is provided, otherwise false.
 * close server when browser is closed

## 0.0.9

 * new option `folderPath`:	A local folder to open VS Code on. The folder content will be available as a virtual file system and opened as workspace.


### 0.0.1 |

- Initial version


