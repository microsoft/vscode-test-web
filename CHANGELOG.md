# Changelog

## 0.0.14
 * new option `--extensionPath` : A path pointing to a folder containing additional extensions to include. Argument can be provided multiple times.
 * new option `--permission`: Permission granted to the opened browser: e.g. clipboard-read, clipboard-write. See full list of options [here](https://playwright.dev/docs/1.14/emulation#permissions). Argument can be provided multiple times.
 * new option `--hideServerLog`: If set, hides the server log. Defaults to true when an extensionTestsPath is provided, otherwise false.
 * close server when browser is closed

## 0.0.9

 * new option `folderPath`:	A local folder to open VS Code on. The folder content will be available as a virtual file system and opened as workspace.


### 0.0.1 |

- Initial version


