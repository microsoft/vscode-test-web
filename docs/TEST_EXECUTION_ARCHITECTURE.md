# VSCode Test Web - Test Execution Architecture

## Overview

This document provides a comprehensive explanation of how tests are executed in `@vscode/test-web`, covering the entire pipeline from Node.js test runner through Playwright, the browser, web workers, bundled test scripts, and the vscode global API.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Test Execution Flow](#test-execution-flow)
3. [Component Details](#component-details)
4. [Sample Test Walkthrough](#sample-test-walkthrough)
5. [Key Files and Their Roles](#key-files-and-their-roles)
6. [Communication Channels](#communication-channels)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Node.js Test Process                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  runTest.ts - Entry point that calls runTests()                   │  │
│  │  • Configures test paths                                          │  │
│  │  • Sets browser type (chromium/firefox/webkit)                    │  │
│  │  • Specifies workspace folder                                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               ↓                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  src/server/index.ts - runTests() function                        │  │
│  │  • Downloads VSCode build (if needed)                             │  │
│  │  • Starts Koa web server on localhost:3000                        │  │
│  │  • Launches Playwright browser                                    │  │
│  │  • Exposes codeAutomationLog() and codeAutomationExit()          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               ↓                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Playwright Browser Control                                        │  │
│  │  • Opens browser in headless/headed mode                          │  │
│  │  • Navigates to http://localhost:3000                             │  │
│  │  • Injects communication bridge functions                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓ HTTP
┌─────────────────────────────────────────────────────────────────────────┐
│                          Koa Web Server                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  src/server/main.ts + app.ts + workbench.ts                       │  │
│  │  • Serves VSCode static files                                     │  │
│  │  • Serves extension development files                             │  │
│  │  • Serves bundled test files                                      │  │
│  │  • Configures workbench with extensionTestsPath                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓ HTML/JS
┌─────────────────────────────────────────────────────────────────────────┐
│                       Browser Window (Playwright)                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  VSCode Web Workbench UI                                          │  │
│  │  src/browser/main.ts                                              │  │
│  │  • Loads workbench configuration from data-settings attribute     │  │
│  │  • Initializes VSCode UI in browser                               │  │
│  │  • Creates WorkspaceProvider                                       │  │
│  │  • Sets up virtual file system (if folderPath provided)          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               ↓                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Extension Host Web Worker                                         │  │
│  │  • Runs in separate worker thread                                 │  │
│  │  • Loads extension code (from extensionDevelopmentPath)           │  │
│  │  • Exposes vscode.* API                                           │  │
│  │  • When extensionTestsPath is set:                                │  │
│  │    - Loads bundled test/suite/index.js                            │  │
│  │    - Executes test suite in worker context                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                               ↓                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Test Execution (Inside Worker)                                   │  │
│  │  • test/suite/index.js runs (bundled with webpack)                │  │
│  │  • Mocha test framework initialized (mocha.setup)                 │  │
│  │  • Test files loaded via require.context                          │  │
│  │  • Tests execute with full vscode.* API access                    │  │
│  │  • Results communicated via window.codeAutomationLog()            │  │
│  │  • Test completion via window.codeAutomationExit(code)            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Test Execution Flow

### Phase 1: Node.js Test Initialization

**File: `sample/src/web/test/runTest.ts`**

```typescript
import { runTests } from '../../../..'; // @vscode/test-web

async function main() {
  // 1. Define paths
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const folderPath = path.resolve(__dirname, '../../../test-workspace');

  // 2. Call runTests() - This is the main entry point
  await runTests({
    browserType: 'chromium',
    extensionDevelopmentPath,   // Where the extension lives
    extensionTestsPath,          // Where the test runner lives
    folderPath,                  // Workspace to open
    waitForDebugger: undefined   // Optional debugging port
  });
}
```

**What happens:**
- The test runner script is invoked (e.g., `node sample/dist/web/test/runTest.js`)
- Paths are resolved to absolute locations
- `runTests()` is called with configuration

### Phase 2: Server Setup & Browser Launch

**File: `src/server/index.ts`**

```typescript
export async function runTests(options: Options): Promise<void> {
  // 1. Download/locate VSCode build
  const build = await downloadAndUnzipVSCode(
    testRunnerDataDir,
    quality === 'stable' ? 'stable' : 'insider',
    commit
  );

  // 2. Create server configuration
  const config: IConfig = {
    extensionDevelopmentPath: options.extensionDevelopmentPath,
    extensionTestsPath: options.extensionTestsPath,  // CRITICAL: tells VSCode to run tests
    build: build,
    folderUri: options.folderUri,
    folderMountPath: options.folderPath,
    printServerLog: options.printServerLog,
    extensionPaths: options.extensionPaths,
    extensionIds: options.extensionIds,
    coi: !!options.coi,
    esm: !!options.esm,
  };

  // 3. Start web server
  const host = options.host ?? 'localhost';
  const port = options.port ?? 3000;
  const server = await runServer(host, port, config);

  // 4. Set up communication bridge functions
  const configPage = async (page: playwright.Page, browser: playwright.Browser) => {
    // Expose function for logging from worker to Node.js
    await page.exposeFunction('codeAutomationLog', (type: Severity, args: unknown[]) => {
      console[type](...args);
    });

    // Expose function for test completion from worker to Node.js
    await page.exposeFunction('codeAutomationExit', async (code: number) => {
      await browser.close();
      server.close();
      if (code === 0) {
        resolve(); // Tests passed
      } else {
        reject(new Error('Test failed')); // Tests failed
      }
    });
  };

  // 5. Launch browser with Playwright
  const endpoint = `http://${host}:${port}`;
  const context = await openBrowser(endpoint, options, configPage);
}
```

**Key Points:**
- The `extensionTestsPath` in config tells VSCode to run tests automatically
- `codeAutomationLog()` and `codeAutomationExit()` are exposed via `page.exposeFunction()`
- These functions create a bridge between the browser worker and Node.js

### Phase 3: Workbench Configuration

**File: `src/server/workbench.ts`**

```typescript
async function getWorkbenchOptions(
  ctx: { protocol: string; host: string },
  config: IConfig
): Promise<IWorkbenchOptions> {
  const options: IWorkbenchOptions = {};

  // Configure extension development
  if (config.extensionDevelopmentPath) {
    const developmentOptions: IDevelopmentOptions = (options.developmentOptions = {});

    developmentOptions.extensions = await scanForExtensions(
      config.extensionDevelopmentPath,
      { scheme: ctx.protocol, authority: ctx.host, path: '/static/devextensions' }
    );

    // Configure test path - This is how VSCode knows to run tests!
    if (config.extensionTestsPath) {
      let relativePath = path.relative(
        config.extensionDevelopmentPath,
        config.extensionTestsPath
      );
      developmentOptions.extensionTestsPath = {
        scheme: ctx.protocol,
        authority: ctx.host,
        path: path.posix.join('/static/devextensions', relativePath),
      };
    }
  }

  // Configure workspace
  if (config.folderMountPath) {
    options.folderUri = URI.parse(fsProviderFolderUri);
    // Enable file system provider extension
    options.additionalBuiltinExtensions.push({
      scheme: ctx.protocol,
      authority: ctx.host,
      path: fsProviderExtensionPrefix
    });
  }

  return options;
}
```

**Key Points:**
- The `extensionTestsPath` is converted to a URI accessible via the web server
- VSCode workbench receives this configuration via `data-settings` attribute in HTML
- When VSCode sees `extensionTestsPath`, it automatically loads and runs tests

### Phase 4: Browser Initialization

**File: `src/browser/main.ts`**

```typescript
(function () {
  // 1. Extract configuration from HTML element
  const configElement = window.document.getElementById('vscode-workbench-web-configuration');
  const configElementAttribute = configElement.getAttribute('data-settings');
  const config: IWorkbenchConstructionOptions = JSON.parse(configElementAttribute);

  // 2. Create workbench
  create(window.document.body, {
    ...config,
    workspaceProvider: WorkspaceProvider.create(config),
    urlCallbackProvider: new LocalStorageURLCallbackProvider(config.callbackRoute)
  });
})();
```

**What happens:**
- Browser loads the main HTML page from the server
- The HTML contains a `<script>` tag with `data-settings` attribute
- This attribute contains JSON configuration including `extensionTestsPath`
- The workbench is initialized with this configuration

### Phase 5: Extension Host & Test Loading

**Context: Extension Host Web Worker**

When VSCode sees that `developmentOptions.extensionTestsPath` is set, it:

1. **Loads the extension** from `extensionDevelopmentPath`
2. **Loads the test runner** from `extensionTestsPath`
3. **Executes the test runner** in the worker context

**File: `sample/dist/web/test/suite/index.js` (bundled by webpack)**

```javascript
// This file runs INSIDE the extension host web worker

// 1. Import mocha for the browser
require('mocha/mocha');

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 2. Configure Mocha
    mocha.setup({
      ui: 'tdd',        // Test-driven development style (suite/test)
      reporter: undefined
    });

    // 3. Load all test files using webpack's require.context
    // This bundles all *.test.ts files into the bundle
    const importAll = (r: __WebpackModuleApi.RequireContext) => r.keys().forEach(r);
    importAll(require.context('.', true, /\.test$/));

    // 4. Run the tests
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
```

**Key Points:**
- This code runs in the **web worker**, not in the browser's main thread
- Mocha is the test framework used (browser-compatible version)
- `require.context` is a webpack feature that bundles all test files
- The `run()` function is called by VSCode's test infrastructure

### Phase 6: Test Execution

**File: `sample/src/web/test/suite/extension.test.ts`**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Web Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });
});
```

**What happens:**
1. The test file is executed in the worker context
2. `vscode` is available as a global (provided by VSCode's extension host)
3. All `vscode.*` APIs work natively (workspace, window, commands, etc.)
4. Tests run synchronously or asynchronously using Mocha's framework

**File: `sample/src/web/test/suite/fs.test.ts` - More complex example**

```typescript
import * as vscode from 'vscode';

suite('Workspace folder access', () => {
  // Access workspace folders via vscode API
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceFolderUri = workspaceFolder.uri;

  test('File contents', async () => {
    // Use vscode file system API
    const uri = vscode.Uri.joinPath(workspaceFolderUri, '/hello.txt');
    const content = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(content);
    assert.strictEqual(text, '// hello');
  });

  test('Create and delete file', async () => {
    // Create file
    const uri = vscode.Uri.joinPath(workspaceFolderUri, '/more.txt');
    const arr = new TextEncoder().encode('content');
    await vscode.workspace.fs.writeFile(uri, arr);

    // Read file
    const content = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(content);
    assert.strictEqual(text, 'content');

    // Delete file
    await vscode.workspace.fs.delete(uri);
  });
});
```

**Key Points:**
- Tests have **full access** to the `vscode` global object
- All VSCode APIs work: `vscode.workspace`, `vscode.window`, `vscode.commands`, etc.
- File system operations use VSCode's virtual file system (backed by the server)
- Tests can be async (using promises/async-await)

### Phase 7: Test Results Communication

**Communication Flow:**

```
Web Worker (Test)  →  Browser Window  →  Node.js
    ↓
  mocha.run() completes
    ↓
  suite/index.js: resolve() or reject()
    ↓
  VSCode Extension Host catches result
    ↓
  window.codeAutomationLog('info', ['Test passed'])  ← Logging
  window.codeAutomationExit(0)                       ← Exit with code
    ↓
  Playwright page.exposeFunction receives call
    ↓
  Node.js: console.log() or process.exit()
```

**How it works:**

1. **During test execution**: Tests can log to Node.js console
   ```typescript
   // This logs to Node.js console, not browser console
   console.log('Test running...');
   ```

2. **On test completion**: VSCode calls `codeAutomationExit()`
   ```typescript
   // From src/server/index.ts
   await page.exposeFunction('codeAutomationExit', async (code: number) => {
     await browser.close();
     server.close();
     if (code === 0) {
       resolve(); // Tests passed
     } else {
       reject(new Error('Test failed')); // Tests failed
     }
   });
   ```

3. **Node.js receives result**: The promise from `runTests()` resolves or rejects

---

## Component Details

### 1. The `vscode` Global Object

**Where it comes from:**
- Provided by VSCode's extension host running in the web worker
- Available to all extension code and test code
- Typed by `@types/vscode` package

**What it contains:**
```typescript
declare module 'vscode' {
  export namespace workspace {
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export const fs: FileSystem;
    export function openTextDocument(uri: Uri): Thenable<TextDocument>;
    // ... hundreds more APIs
  }

  export namespace window {
    export function showInformationMessage(message: string): Thenable<string | undefined>;
    export const activeTextEditor: TextEditor | undefined;
    // ... many more APIs
  }

  export namespace commands {
    export function executeCommand<T>(command: string, ...args: any[]): Thenable<T | undefined>;
    // ... more APIs
  }

  // ... many more namespaces
}
```

**How it's used in tests:**
```typescript
import * as vscode from 'vscode';

// Direct access to VSCode APIs
const folders = vscode.workspace.workspaceFolders;
await vscode.window.showInformationMessage('Hello!');
await vscode.commands.executeCommand('workbench.action.files.openFile');
```

### 2. Bundled Test Scripts (Webpack)

**File: `sample/webpack.config.js`**

```javascript
const webExtensionConfig = {
  mode: 'none',
  target: 'webworker',  // ← Critical: Bundles for web worker environment
  entry: {
    'extension': './src/web/extension.ts',
    'test/suite/index': './src/web/test/suite/index.ts'  // ← Test entry
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist/web'),
    libraryTarget: 'commonjs',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      'assert': require.resolve('assert')  // ← Browser-compatible assert
    }
  },
  externals: {
    'vscode': 'commonjs vscode',  // ← vscode is provided externally
  },
};
```

**What gets bundled:**
1. **Test suite entry point** (`test/suite/index.ts`)
   - Mocha setup code
   - Test file loader (via `require.context`)

2. **All test files** (matched by `/\.test$/`)
   - `extension.test.ts`
   - `fs.test.ts`
   - `search.test.ts`
   - Any other `*.test.ts` files

3. **Dependencies**
   - `mocha/mocha` (browser version)
   - `assert` (browser-compatible polyfill)
   - All test utilities and helpers

**Output:**
- `sample/dist/web/test/suite/index.js` - Single bundled file
- This file is served by the web server at `/static/devextensions/dist/web/test/suite/index.js`
- VSCode loads and executes this file in the worker

### 3. The Browser Environment

**Playwright Control:**
```typescript
// From src/server/index.ts
const browser = await playwright.chromium.launch({
  headless: true,          // No visible window
  args: ['--no-sandbox'],  // Required on Linux
  devtools: false          // Don't open DevTools
});

const context = await browser.newContext({
  viewport: null  // Use default viewport
});

const page = await context.newPage();
await page.goto('http://localhost:3000');
```

**What's in the browser:**
- **Main Window**: VSCode workbench UI
- **Web Worker**: Extension host running extension + tests
- **Virtual File System**: Backed by server, powered by fs-provider extension
- **Communication Bridge**: `page.exposeFunction()` creates `window.codeAutomationLog` and `window.codeAutomationExit`

### 4. Virtual File System

When `folderPath` is provided:

1. **Server side** (`src/server/mounts.ts`):
   - Mounts local folder to virtual path
   - Serves files via HTTP endpoints

2. **Browser side** (fs-provider extension):
   - Implements `FileSystemProvider` interface
   - Fetches files from server on demand
   - Provides read/write access (writes stored in memory)

3. **Test side**:
   ```typescript
   // Tests see files as vscode-test-web://mount/hello.txt
   const workspaceFolder = vscode.workspace.workspaceFolders[0];
   // workspaceFolder.uri.scheme === 'vscode-test-web'
   // workspaceFolder.uri.path === '/hello.txt'
   ```

---

## Sample Test Walkthrough

Let's trace a complete test execution:

### Step-by-Step Execution

**1. Developer runs:**
```bash
npm run sample-tests
```

**2. This expands to:**
```bash
node sample/dist/web/test/runTest.js
```

**3. `runTest.js` calls:**
```typescript
await runTests({
  browserType: 'chromium',
  extensionDevelopmentPath: '/path/to/sample',
  extensionTestsPath: '/path/to/sample/dist/web/test/suite/index.js',
  folderPath: '/path/to/sample/test-workspace'
});
```

**4. Server starts:**
- Koa server listens on `http://localhost:3000`
- Serves VSCode static files
- Serves extension files from `/path/to/sample`
- Serves test bundle from `/path/to/sample/dist/web/test/suite/index.js`

**5. Playwright launches browser:**
```typescript
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000');
```

**6. Browser loads VSCode:**
- HTML page with workbench configuration
- Configuration includes `extensionTestsPath`
- VSCode initializes in browser

**7. Extension host starts (in worker):**
- Loads extension from `/static/devextensions/extension.js`
- Sees `extensionTestsPath` is set
- Loads test bundle from `/static/devextensions/dist/web/test/suite/index.js`

**8. Test bundle executes:**
```typescript
// Inside worker
require('mocha/mocha');

export function run(): Promise<void> {
  mocha.setup({ ui: 'tdd' });

  // Loads all *.test.ts files (bundled by webpack)
  importAll(require.context('.', true, /\.test$/));

  // Runs tests
  mocha.run(failures => {
    if (failures > 0) {
      reject(new Error(`${failures} tests failed.`));
    } else {
      resolve();
    }
  });
}
```

**9. Individual test runs:**
```typescript
test('Sample test', () => {
  // This code runs in the worker
  assert.strictEqual(-1, [1, 2, 3].indexOf(5));  // Passes
});
```

**10. Test completes:**
- `mocha.run()` callback fires
- `run()` promise resolves
- VSCode extension host catches result
- Calls `window.codeAutomationExit(0)`

**11. Node.js receives result:**
```typescript
// From configPage in src/server/index.ts
await page.exposeFunction('codeAutomationExit', async (code: number) => {
  await browser.close();
  server.close();
  if (code === 0) {
    resolve(); // ← Tests passed!
  } else {
    reject(new Error('Test failed'));
  }
});
```

**12. Process exits:**
```typescript
// In runTest.ts
try {
  await runTests({ ... });
  // Success - process.exit(0) implicit
} catch (err) {
  console.error('Failed to run tests');
  process.exit(1);
}
```

---

## Key Files and Their Roles

### Node.js Side

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/server/index.ts` | Main API entry point | `runTests()`, `open()` |
| `src/server/main.ts` | Server creation | `runServer()`, `createApp()` |
| `src/server/app.ts` | Koa app setup | HTTP routes, static file serving |
| `src/server/workbench.ts` | Workbench config | `getWorkbenchOptions()` |
| `src/server/extensions.ts` | Extension scanning | `scanForExtensions()` |
| `src/server/mounts.ts` | Virtual FS mounts | Mount local folders |
| `src/server/download.ts` | VSCode download | `downloadAndUnzipVSCode()` |

### Browser Side

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/browser/main.ts` | Workbench initialization | IIFE that calls `create()` |
| `src/browser/workbench.api.d.ts` | Type definitions | VSCode workbench API types |

### Test Side (Sample)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `sample/src/web/test/runTest.ts` | Test runner entry | `main()` calls `runTests()` |
| `sample/src/web/test/suite/index.ts` | Test suite loader | `run()` sets up Mocha |
| `sample/src/web/test/suite/*.test.ts` | Actual tests | Mocha `suite()` and `test()` |
| `sample/webpack.config.js` | Bundler config | Webpack configuration |

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Scripts: `sample-tests`, dependencies |
| `sample/package.json` | Sample extension manifest |
| `sample/tsconfig.json` | TypeScript config for sample |
| `sample/webpack.config.js` | Webpack config for bundling tests |

---

## Communication Channels

### 1. HTTP (Server ↔ Browser)

**Purpose:** Serve static files and VSCode application

```
Node.js Server          Browser
     ↓                     ↓
  Koa App    ←──HTTP──   Chromium
     ↓                     ↓
/static/*    ──────→   Downloads
/workbench/  ──────→   workbench files
```

**Key Routes:**
- `/` - Main workbench HTML
- `/static/sources/` - VSCode source files
- `/static/devextensions/` - Extension files
- `/static/devextensions/dist/web/test/suite/index.js` - Test bundle
- `/vscode-test-web/` - Virtual file system provider

### 2. Playwright Bridge (Node.js ↔ Browser)

**Purpose:** Communication between test orchestrator and browser

```typescript
// Node.js → Browser
await page.exposeFunction('codeAutomationLog', (type, args) => {
  console[type](...args);
});

await page.exposeFunction('codeAutomationExit', async (code) => {
  await browser.close();
  server.close();
  // Resolve/reject promise
});

// Browser/Worker → Node.js
window.codeAutomationLog('info', ['Test passed']);
window.codeAutomationExit(0);
```

**Mechanism:**
- `page.exposeFunction()` creates global functions in browser
- These functions are implemented in Node.js
- When called from browser/worker, they execute in Node.js
- Enables worker → Node.js communication

### 3. Worker Context (Browser ↔ Worker)

**Purpose:** VSCode runs extension host in web worker

```
Browser Main Thread     Web Worker
        ↓                    ↓
   Workbench UI    ←───→  Extension Host
        ↓                    ↓
   postMessage()  ────→  onmessage
   onmessage      ←────  postMessage()
```

**What runs in worker:**
- Extension code (`extension.ts`)
- Test code (bundled `test/suite/index.js`)
- `vscode` global API (provided by VSCode)
- Mocha test framework

**Key Point:**
- Worker has **direct access** to `vscode` APIs
- Worker can call `window.codeAutomationLog()` (reaches Node.js)
- Worker can call `window.codeAutomationExit()` (reaches Node.js)

### 4. Virtual File System (Browser ↔ Server)

**Purpose:** Provide file system access to tests

```
Test Code (Worker)      VSCode FS API      Server
       ↓                      ↓               ↓
vscode.workspace.fs.readFile()
       ↓                      ↓
FileSystemProvider.readFile()
       ↓                      ↓
HTTP GET → /vscode-test-web/readFile?path=/hello.txt
       ↓                      ↓
   Response ←─────────── Reads local file
       ↓
Returns Uint8Array to test
```

**Flow:**
1. Test calls `vscode.workspace.fs.readFile(uri)`
2. VSCode routes to `FileSystemProvider` (fs-provider extension)
3. Provider makes HTTP request to server
4. Server reads local file from `folderPath`
5. Returns file contents
6. Provider returns to test

---

## Summary

**Test execution in `@vscode/test-web` involves:**

1. **Node.js orchestration**: Starts server, launches browser, waits for results
2. **Playwright automation**: Controls browser, injects communication bridge
3. **Koa web server**: Serves VSCode, extensions, and test bundles
4. **Browser workbench**: Runs VSCode UI in browser
5. **Web worker**: Runs extension host with full `vscode` API
6. **Bundled tests**: Webpack bundles tests for worker execution
7. **Mocha framework**: Executes tests in worker context
8. **Communication bridge**: `page.exposeFunction()` enables worker → Node.js communication
9. **Virtual file system**: Provides file access backed by local disk

**Key insight:** Tests run **inside** the VSCode extension host worker, giving them **native access** to the `vscode` global API. This is what makes VSCode web extension testing possible - tests run in the same context as the extension code.
