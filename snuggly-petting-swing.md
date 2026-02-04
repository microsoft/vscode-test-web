# Implementation Plan: Playwright Test Support for vscode-test-web

## Overview

Add full @playwright/test support to vscode-test-web, allowing tests to run in Node.js with the standard Playwright Test runner while proxying VSCode API calls to the actual VSCode instance running in the browser worker.

## Goals

1. Tests run in Node.js using @playwright/test as the test runner
2. Tests access the full VSCode API via a `vscode` fixture
3. Tests have access to native Playwright APIs (page, browser, context)
4. Support both old style (Mocha in worker) and new style (Playwright Test in Node.js) side-by-side
5. Leverage Playwright's built-in serialization and handle management - no custom protocol

## Architecture

### Current Flow
```
Node.js (runTests) → Playwright → Browser → Worker (Mocha tests + VSCode)
```

### New Flow
```
Node.js (@playwright/test + tests)
    ↓ worker.evaluate() / worker.evaluateHandle()
Worker (VSCode Extension Host)
```

### Key Technical Decision: Use Playwright's Worker API Directly

**Critical Insight:** VSCode's extension host IS a web worker, and Playwright exposes it via `page.workers()`. We can call `worker.evaluate()` and `worker.evaluateHandle()` directly!

**Benefits:**
- No need for BroadcastChannel or message passing through browser window
- Playwright handles ALL serialization automatically (including JSHandles)
- Direct access to worker context where `vscode` global exists
- Simpler architecture - no bridge code needed

**How it works:**
1. Tests in Node.js get reference to VSCode worker: `const worker = page.workers().find(w => w.url().includes('extensionHost'))`
2. Create proxy that uses `worker.evaluateHandle()`: `await worker.evaluateHandle(() => vscode.workspace)`
3. Playwright returns JSHandle to the workspace object
4. Property access on proxy chains evaluateHandle calls
5. Final values extracted with `.evaluate()`

**Proxy behavior:**
```typescript
// Test code
const folders = await vscode.workspace.workspaceFolders;

// Internally becomes:
const workspaceHandle = await worker.evaluateHandle(() => vscode.workspace);
const foldersHandle = await workspaceHandle.evaluateHandle(ws => ws.workspaceFolders);
const folders = await foldersHandle.evaluate(f => f); // Serialize to plain object
```

## Implementation Phases

### Phase 1: Basic Infrastructure + Dual Test Support

**Goal:** Get @playwright/test running with VSCode launching in browser, side-by-side with existing Mocha tests

**What we're building:**
- Playwright Test config that starts the VSCode web server
- Basic test that launches VSCode and waits for it to load
- Prove we can access the extension host worker via Playwright
- **Maintain existing Mocha tests working alongside Playwright tests**

**Dual Test Support:**
- Mocha tests: `sample/src/web/test/` (existing, unchanged)
- Playwright tests: `sample/tests/` (new)
- Two separate npm scripts: `npm run test:mocha` and `npm run test:playwright`
- Two separate entry points: existing `runTests()` and new Playwright config

**Files to Create:**
- `src/runTestsWithPlaywright.ts` - New entry point (exports helpers for Playwright setup)
- `src/playwrightHelpers.ts` - Helper to launch VSCode and get worker reference
- Example in `sample/`:
  - `sample/playwright.config.ts` - Playwright config
  - `sample/tests/basic.spec.ts` - Basic test that proves VSCode loads

**Changes:**
- `package.json` - Add @playwright/test as peer dependency
- `sample/package.json` - Add new test script for Playwright

**What the test looks like:**
```typescript
// sample/tests/basic.spec.ts
import { test, expect } from '@playwright/test';

test('VSCode loads', async ({ page }) => {
  // page is already at VSCode thanks to globalSetup
  await expect(page.locator('.monaco-workbench')).toBeVisible();

  // Verify worker exists
  const workers = page.workers();
  expect(workers.length).toBeGreaterThan(0);
});
```

**Deliverable:**
- Can run `npm run test:playwright` and VSCode launches (new)
- Can run `npm run test:mocha` and existing tests still work (unchanged)
- Both test types work in same `sample/` directory

---

### Phase 2: VSCode API Proxy (Make `import * as vscode` work)

**Goal:** Make `import * as vscode from 'vscode'` work in Node.js test files with fluent API

**Key Insight:** Use proxied Promises that maintain the fluent API while being awaitable. Each property access returns a proxy wrapping a Promise<JSHandle>, allowing chaining before evaluation.

**Technical Approach:**

**1. The Proxied Promise Pattern**
- Each property access returns a **proxy** that wraps a **Promise<JSHandle>**
- The proxy intercepts both property access (for chaining) and `then` (for awaiting)
- Property access chains onto the stored promise without evaluating
- Only when you `await` does the entire chain execute

**2. How it works:**
```typescript
// In test file (Node.js)
import * as vscode from 'vscode';

test('workspace API', async () => {
  // Fluent API: vscode.workspace.workspaceFolders
  // Returns proxy wrapping chained promises
  const folders = await vscode.workspace.workspaceFolders;

  // Each step:
  // - vscode.workspace → Proxy(Promise<JSHandle(workspace)>)
  // - .workspaceFolders → Proxy(Promise<JSHandle(workspaceFolders)>)
  // - await → Executes chain, serializes result

  expect(folders.length).toBeGreaterThan(0);
});
```

**3. TypeScript Types:**
```typescript
// Recursive type that makes every object both a Promise and preserves properties
type Promisify<T> = Promise<T> & {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer R
    ? (...args: Args) => Promisify<R>  // Methods return promisified results
    : Promisify<T[K]>;                  // Properties are promisified
};

type VSCodeAPI = Promisify<typeof import('vscode')>;
```

This allows:
- `await vscode.workspace` → Get workspace object
- `vscode.workspace.then(...)` → Use as Promise
- `vscode.workspace.workspaceFolders` → Continue chaining
- Full type safety with IntelliSense

**4. Proxy Implementation:**
```typescript
function createProxy(promiseOrHandle: Promise<JSHandle> | JSHandle) {
  let promise = promiseOrHandle instanceof Promise
    ? promiseOrHandle
    : Promise.resolve(promiseOrHandle);

  return new Proxy({}, {
    get(_, prop: string | symbol) {
      // Make proxy awaitable
      if (prop === 'then') {
        return (onFulfilled?: any, onRejected?: any) => {
          return promise
            .then(async (handle) => handle.evaluate(x => x)) // Serialize
            .then(onFulfilled, onRejected);
        };
      }

      // Handle property/method access - chain and return new proxy
      return (...args: any[]) => {
        const nextPromise = promise.then(async (handle) => {
          if (args.length > 0) {
            // Method call
            return handle.evaluateHandle(
              (obj, { prop, args }) => obj[prop](...args),
              { prop, args }
            );
          } else {
            // Property access
            return handle.evaluateHandle((obj, prop) => obj[prop], prop);
          }
        });

        return createProxy(nextPromise); // Chain continues
      };
    }
  });
}
```

**Files to Create:**
- `src/vscodeShim.ts` - The vscode module shim with proxy implementation
- `src/vscodeShim.d.ts` - TypeScript types (Promisify<typeof vscode>)
- Configure module resolution so `import * as vscode from 'vscode'` resolves to shim

**Deliverable:** Tests can `import * as vscode from 'vscode'` with fluent API and full type safety

---

### Phase 3: Refinement & Edge Cases

**Goal:** Handle edge cases and improve robustness

**Features to address:**
- Error handling and better error messages
- Timeout handling for long-running operations
- Support for events (onDid* APIs) - may require different approach
- Handle edge cases in serialization

**Deliverable:** Production-ready proxy that handles real-world usage

**Note:** Performance optimization (caching, batching) is deferred - optimize later if needed

---

## Technical Deep Dive

### Worker Detection

**Finding the VSCode Extension Host Worker:**
```typescript
// Wait for the extension host worker to be created
const worker = await page.waitForEvent('worker', {
  predicate: (worker) => {
    const url = worker.url();
    return url.includes('extensionHost') || url.includes('workbench');
  },
  timeout: 30000
});
```

**Worker URL patterns:**
- Extension host worker URLs typically contain: `extensionHost`, `workbench`, or are blob URLs
- May need to refine predicate based on actual VSCode web architecture

### Proxy Implementation Strategy

**Key insight:** The `vscode` global in the worker is a proxy object itself. When we access properties like `vscode.workspace`, it calls a `get()` trap that returns another proxy.

**Our approach:**
1. Get handle to `vscode` global: `worker.evaluateHandle(() => vscode)`
2. Create JavaScript Proxy in Node.js that mirrors this structure
3. When test accesses `vscode.workspace.workspaceFolders`:
   - Node.js proxy intercepts `workspace` access
   - Calls `worker.evaluateHandle(() => vscode.workspace)` → returns JSHandle
   - Node.js proxy intercepts `workspaceFolders` access on the handle
   - Calls `handle.evaluateHandle(ws => ws.workspaceFolders)` → returns JSHandle
   - Final call extracts value: `handle.evaluate(f => f)` → Playwright serializes automatically

**Playwright's automatic serialization handles:**
- Primitives
- Plain objects and arrays
- Dates, RegExp, Buffers
- Complex objects become JSHandles that we can evaluate on

### Event Handling Strategy

**Phase 1 (MVP):** No event support
- Tests work with synchronous/async APIs only
- Use polling if needed: `await page.waitForFunction(() => condition)`

**Phase 2:** Event forwarding (future)
- Use `page.exposeFunction()` to expose callback from Node.js to worker
- Worker calls exposed function when events fire
- Node.js fixture maintains event listener registry

### Test Isolation Strategy

**Recommendation:** Test-scoped VSCode instance
- Each test gets fresh browser context via Playwright fixtures
- VSCode launches fresh for each test
- Slower but guarantees isolation
- Can optimize later with worker-scoped fixture for faster tests

## Files to Create/Modify

### New Files
```
playwright.config.ts
src/fixtures/index.ts
src/fixtures/vscode-proxy.ts
src/fixtures/vscode-launcher.ts
tests/example.spec.ts
```

### Modified Files
```
package.json - Add @playwright/test
```

### NO Changes Needed
- No worker-side code changes needed!
- No BroadcastChannel or bridge code
- No extension modifications
- Existing `runTests()` and Mocha tests continue to work unchanged

## Open Questions for User

1. **Dual test setup:** How should both test styles coexist?
   - Option A: Separate directories (`tests/playwright/` vs `sample/`)
   - Option B: Same directory, different extensions (`.spec.ts` vs `.test.ts`)
   - Option C: Completely separate repos/packages

2. **Server management:** Should we:
   - Reuse existing `runServer()` from src/server/main.ts?
   - Use Playwright's `webServer` config to start it automatically?
   - Assume server is already running?

---

## Concrete Code Examples

```typescript
// src/fixtures/vscode-proxy.ts
import type { Worker } from '@playwright/test';
import type { JSHandle } from '@playwright/test';

export class VSCodeProxy {
  private worker: Worker;
  private vscodeHandle: JSHandle | null = null;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  async initialize() {
    // Get handle to vscode global in worker
    this.vscodeHandle = await this.worker.evaluateHandle(() => vscode);
  }

  // Create a namespace proxy that returns handles
  private createNamespaceProxy(namespaceHandle: JSHandle): any {
    return new Proxy({}, {
      get: (_, prop: string) => {
        // Return async function that gets property handle
        return async (...args: any[]) => {
          if (args.length > 0) {
            // Method call: workspace.openTextDocument(uri)
            const result = await namespaceHandle.evaluateHandle(
              (ns, { prop, args }) => (ns as any)[prop](...args),
              { prop, args }
            );
            // If result is serializable, extract value
            return result.evaluate(r => r);
          } else {
            // Property access: workspace.workspaceFolders
            const propertyHandle = await namespaceHandle.evaluateHandle(
              (ns, prop) => (ns as any)[prop],
              prop
            );
            // Try to serialize, if it fails return the handle
            try {
              return await propertyHandle.evaluate(p => p);
            } catch {
              // Non-serializable, return handle wrapped in proxy
              return this.createHandleProxy(propertyHandle);
            }
          }
        };
      }
    });
  }

  // Wrap JSHandle in proxy for property access
  private createHandleProxy(handle: JSHandle): any {
    return new Proxy({}, {
      get: (_, prop: string) => {
        return async (...args: any[]) => {
          if (args.length > 0) {
            // Method call on handle
            const result = await handle.evaluateHandle(
              (obj, { prop, args }) => (obj as any)[prop](...args),
              { prop, args }
            );
            return result.evaluate(r => r);
          } else {
            // Property access on handle
            const propertyHandle = await handle.evaluateHandle(
              (obj, prop) => (obj as any)[prop],
              prop
            );
            try {
              return await propertyHandle.evaluate(p => p);
            } catch {
              return this.createHandleProxy(propertyHandle);
            }
          }
        };
      }
    });
  }

  get workspace() {
    return this.createNamespaceProxy(
      this.vscodeHandle!.evaluateHandle((vscode: any) => vscode.workspace) as any
    );
  }

  get window() {
    return this.createNamespaceProxy(
      this.vscodeHandle!.evaluateHandle((vscode: any) => vscode.window) as any
    );
  }

  get commands() {
    return this.createNamespaceProxy(
      this.vscodeHandle!.evaluateHandle((vscode: any) => vscode.commands) as any
    );
  }
}
```

### Example 2: Fixture Setup

```typescript
// src/fixtures/index.ts
import { test as base } from '@playwright/test';
import type { Page, Worker } from '@playwright/test';
import { VSCodeProxy } from './vscode-proxy';
import { launchVSCode } from './vscode-launcher';

type VSCodeFixtures = {
  vscode: VSCodeProxy;
  vscodePage: Page;
  vscodeWorker: Worker;
};

export const test = base.extend<VSCodeFixtures>({
  // Launch VSCode
  vscodePage: async ({ browser }, use) => {
    const page = await launchVSCode(browser, {
      extensionDevelopmentPath: process.cwd(),
      workspaceDir: './test-workspace',
    });

    await use(page);
    await page.close();
  },

  // Get VSCode extension host worker
  vscodeWorker: async ({ vscodePage }, use) => {
    // Wait for worker to be created
    const worker = await vscodePage.waitForEvent('worker', {
      predicate: (worker) => worker.url().includes('extensionHost') ||
                            worker.url().includes('workbench')
    });

    await use(worker);
  },

  // Create VSCode API proxy
  vscode: async ({ vscodeWorker }, use) => {
    const vscodeProxy = new VSCodeProxy(vscodeWorker);
    await vscodeProxy.initialize();
    await use(vscodeProxy);
  },
});

export { expect } from '@playwright/test';
```

### Example 3: VSCode Launcher

```typescript
// src/fixtures/vscode-launcher.ts
import type { Browser, Page } from '@playwright/test';
import path from 'path';

export interface LaunchVSCodeOptions {
  extensionDevelopmentPath: string;
  workspaceDir: string;
  headless?: boolean;
}

export async function launchVSCode(
  browser: Browser,
  options: LaunchVSCodeOptions
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Build URL (assuming server is running)
  const url = new URL('http://localhost:3000');
  url.searchParams.set('folder', path.resolve(options.workspaceDir));
  url.searchParams.set('extensionDevelopmentPath',
                       path.resolve(options.extensionDevelopmentPath));

  // Navigate to VSCode
  await page.goto(url.toString());

  // Wait for VSCode workbench to load
  await page.waitForSelector('.monaco-workbench', { timeout: 30000 });

  return page;
}
```

### Example 4: Test Example

```typescript
// tests/workspace.spec.ts
import { test, expect } from '../src/fixtures';

test('should list workspace folders', async ({ vscode }) => {
  // Access workspace.workspaceFolders
  const folders = await vscode.workspace.workspaceFolders();

  expect(folders).toBeDefined();
  expect(folders.length).toBeGreaterThan(0);
  expect(folders[0].name).toBe('test-workspace');
});

test('should read file', async ({ vscode }) => {
  // Create Uri
  const uri = await vscode.workspace.workspaceFolders();
  const folder = uri[0];

  // Read file
  const fileUri = await vscode.Uri.joinPath(folder.uri, 'README.md');
  const content = await vscode.workspace.fs.readFile(fileUri);

  expect(content).toBeDefined();
});
```

## Open Questions for User

1. **Proxy injection point:** Should the worker proxy server be:
   - Initialized in the extension's `activate()` function?
   - Loaded as a separate entry point before extensions?
   - Bundled with test suite setup?

2. **Dual test setup:** Should we:
   - Keep both in same repo with separate configs?
   - Use different file extensions (.spec.ts vs .test.ts)?
   - Separate directories (tests/ vs sample/)?

## Success Criteria

- [ ] Can run `npx playwright test`
- [ ] Tests access VSCode API via `vscode` fixture
- [ ] Tests use standard Playwright features (expect, test.describe, etc.)
- [ ] Old Mocha tests still work via `runTests()`
- [ ] Example tests demonstrating migration
- [ ] Documentation for writing tests

## Next Steps

1. Review this plan with user
2. Answer open questions
3. Implement Phase 1
4. Iterate on Phase 2 with real API usage
