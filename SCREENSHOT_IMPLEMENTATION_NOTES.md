# Playwright Bridge Implementation Notes

## Date: 2025-10-10

## ✅ IMPLEMENTED SOLUTION: BroadcastChannel Message Passing Bridge

### Implementation Overview

We successfully implemented a **BroadcastChannel-based message-passing bridge** that allows extension tests (running in Web Worker context) to access Playwright's full API capabilities. This provides the most general and flexible solution.

**Architecture:**

```
Node.js (Playwright)
  ↓ page.exposeFunction('__playwrightBridge')
Main Page Context
  ↓ BroadcastChannel('playwright-bridge')
Extension Tests (Web Worker)
  ↓ import @vscode/test-web/out/test-helpers/playwright
Test Code
```

**Status**: ✅ All 10 Playwright tests passing

**Key Components:**

1. **`src/server/playwright-bridge.ts`**: Server-side module that exposes Playwright operations via `page.exposeFunction('__playwrightBridge')`
2. **Client-side bridge code**: Injected into main page via `page.addInitScript()` using `BroadcastChannel('playwright-bridge')` for worker communication
3. **`src/test-helpers/playwright.ts`**: TypeScript module that extension tests import - uses `BroadcastChannel` to communicate with main page
4. **`sample/src/web/test/suite/playwright.test.ts`**: 10 example tests demonstrating all capabilities (all passing)

**Usage in Tests:**

```typescript
import * as playwright from '@vscode/test-web/out/test-helpers/playwright';

test('Check if editor is visible', async () => {
  const isVisible = await playwright.isVisible('.monaco-editor');
  assert.ok(isVisible);
});

test('Take screenshot', async () => {
  const screenshot = await playwright.screenshot({ type: 'png' });
  // screenshot is base64-encoded PNG
});
```

### Why This Approach Works

- ✅ No modification to VS Code workbench required
- ✅ Full Playwright API available (screenshot, DOM queries, keyboard, etc.)
- ✅ Type-safe API for extension developers
- ✅ Works despite Web Worker isolation
- ✅ Extensible - easy to add more Playwright operations

---

## Original Problem & Analysis

### Goal

Provide full Playwright API access to extension tests running in `vscode-test-web`, enabling:

- Screenshot testing and visual regression
- DOM queries and UI element verification
- Keyboard/mouse interaction
- Any other Playwright capabilities needed for comprehensive web extension testing

**CRITICAL CLARIFICATION**: This is NOT about adding tests to this project itself. This is about providing an API/feature that extension developers can use when they write tests with `vscode-test-web`.

### User Story

As an extension developer using `vscode-test-web`, I want to use Playwright's full capabilities (screenshots, DOM queries, interactions) within my extension test suite to verify UI behavior and appearance.

## Implementation: Message-Passing Bridge (SUCCESSFUL)

### Approach Taken

Implemented **Option 1: Message Passing** - A communication bridge between the extension test Web Worker and the Node.js Playwright instance via the main page context.

### Architecture

The solution uses a three-layer communication architecture:

```
┌─────────────────────────────────────────┐
│  Node.js (Playwright)                   │
│  - setupPlaywrightBridge() exposes      │
│    __playwrightBridge function          │
│  - Handles screenshot, DOM queries, etc │
└─────────────────────────────────────────┘
                  ↑
            (exposed function)
                  ↓
┌─────────────────────────────────────────┐
│  Browser Main Page Context              │
│  - PLAYWRIGHT_BRIDGE_CLIENT_CODE        │
│    injected via addInitScript()         │
│  - Listens for postMessage from workers │
│  - Calls __playwrightBridge()           │
│  - Posts results back to worker         │
└─────────────────────────────────────────┘
                  ↑
            (postMessage)
                  ↓
┌─────────────────────────────────────────┐
│  Extension Host (Web Worker)            │
│  - Extension tests run here             │
│  - Import playwright helper module      │
│  - Helper posts message to main page    │
│  - Receives results via message event   │
└─────────────────────────────────────────┘
```

### Implementation Files

1. **`src/server/playwright-bridge.ts`**
   - Exposes `setupPlaywrightBridge()` to set up the Node.js side
   - Defines `PlaywrightMessage` types for all supported operations
   - Exports `PLAYWRIGHT_BRIDGE_CLIENT_CODE` for injection into browser
   - Handles serialization (e.g., Buffer to base64 for screenshots)

2. **`src/test-helpers/playwright.ts`**
   - User-facing API that tests import
   - Type-safe functions matching Playwright's API
   - Uses `postMessage` to communicate with main page
   - Handles async request/response pattern

3. **`src/server/index.ts`** (modified)
   - Calls `setupPlaywrightBridge()` in `configPage`
   - Injects client code via `page.addInitScript()`

### Usage Example

```typescript
import * as playwright from '@vscode/test-web/out/test-helpers/playwright';
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('UI Tests', () => {
  test('Editor is visible', async () => {
    await playwright.waitForSelector('.monaco-editor', {
      timeout: 5000,
      state: 'visible'
    });
    const isVisible = await playwright.isVisible('.monaco-editor');
    assert.ok(isVisible);
  });

  test('Take screenshot', async () => {
    const screenshot = await playwright.screenshot({
      type: 'png',
      fullPage: false
    });
    assert.ok(screenshot.length > 0);
  });

  test('Query DOM elements', async () => {
    const divCount = await playwright.querySelectorAll('div');
    assert.ok(divCount > 0);
  });

  test('Keyboard interaction', async () => {
    await vscode.commands.executeCommand('workbench.action.showCommands');
    await playwright.keyboard.type('Hello World');
    await playwright.keyboard.press('Escape');
  });
});
```

### Available API Methods

From `src/test-helpers/playwright.ts`:

- `screenshot(options?)` - Take screenshots
- `waitForSelector(selector, options?)` - Wait for elements
- `querySelector(selector)` - Check element existence
- `querySelectorAll(selector)` - Count elements
- `click(selector, options?)` - Click elements
- `fill(selector, value, options?)` - Fill inputs
- `textContent(selector)` - Get element text
- `getAttribute(selector, name)` - Get attributes
- `isVisible(selector)` - Check visibility
- `isHidden(selector)` - Check if hidden
- `evaluate(script, arg?)` - Execute page scripts
- `waitForTimeout(ms)` - Wait
- `keyboard.press(key, options?)` - Press keys
- `keyboard.type(text, options?)` - Type text

### Key Insights

1. **Worker Isolation**: Extension tests run in Web Workers and cannot directly access `page.exposeFunction()` results
2. **Message Passing Works**: `postMessage` successfully bridges the Worker ↔ Main Page ↔ Node.js gap
3. **`addInitScript()`**: Perfect for injecting bridge code before VS Code loads
4. **Serialization**: Binary data (screenshots) must be base64 encoded for message passing
5. **Type Safety**: TypeScript interfaces provide excellent developer experience

### Advantages of This Approach

- ✅ Full Playwright API access from extension tests
- ✅ Type-safe API with intellisense support
- ✅ Works in Web Worker context (extension tests)
- ✅ No VS Code workbench modifications needed
- ✅ Extensible - easy to add more Playwright methods
- ✅ Same test file for functional + UI testing
- ✅ Async/await friendly

### Testing

See `sample/src/web/test/suite/playwright.test.ts` for comprehensive examples including:

- Waiting for UI elements
- Taking screenshots
- DOM queries and counting elements
- Keyboard interactions
- Combining VS Code API with Playwright
- Checking element visibility
- Getting text content and attributes

---

## Original Exploration (Archived for Reference)

Below is the original analysis from when screenshot-only functionality was being explored:

From the original investigation:
```
expectScreenshotToMatch: checking for function { hasFunction: false, globalKeys: [] }
```

The exposed functions simply don't exist in the worker's global scope.

### Architecture Understanding

```
┌─────────────────────────────────────────┐
│  Node.js (Playwright)                   │
│  - Has page object                      │
│  - Can take screenshots                 │
│  - Has file system access               │
│  - page.exposeFunction() adds to        │
│    main page window object              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Browser Main Page Context              │
│  - Loads VS Code workbench              │
│  - Exposed functions available here     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Extension Host (Web Worker)            │
│  - Extension code runs here             │
│  - Tests run here                       │
│  - ISOLATED from main page              │
│  - Cannot access exposed functions ❌   │
└─────────────────────────────────────────┘
```

### Key Findings

1. **page.exposeFunction() limitations**: Only available in the main page context, not in workers/iframes
2. **Extension isolation**: By design, extensions run in a separate context for security
3. **Communication required**: Need a message-passing mechanism between worker and main page

## Better Approaches

### Option 1: Message Passing (Most Flexible)
Use `postMessage` to communicate from extension worker → main page → Node.js

**Pros:**
- Allows tests to explicitly request screenshots
- Flexible timing control
- Tests can specify what to capture

**Cons:**
- Complex implementation
- Requires modifying VS Code's workbench code or injecting message handlers
- May not have access to inject into the workbench

### Option 2: Automatic Screenshots (Simpler)
Take screenshots automatically at key points without test code involvement

**Implementation:**
- Hook into Mocha test lifecycle events visible from Node.js
- Automatically capture screenshots before/after each test
- Name based on test suite and test name
- Compare automatically

**Pros:**
- No browser-side code needed
- Tests don't need to import anything
- Simpler architecture

**Cons:**
- Less control over timing
- May capture screenshots at wrong moments
- Hard to screenshot specific elements

### Option 3: External API (Pragmatic)
Provide a simple HTTP endpoint that tests can call

**Implementation:**
- Tests make HTTP requests to `localhost:3000/__screenshot?name=test-name`
- Server side takes screenshot and returns result
- Works because tests can make HTTP requests

**Pros:**
- Works from worker context
- Simple to implement
- No need for exposed functions

**Cons:**
- Requires HTTP requests from tests
- Network dependency (though it's localhost)
- Less elegant API

### Option 4: Playwright Test Integration (Most Robust)
Don't run screenshots from within extension tests at all. Instead, use Playwright Test

**Implementation:**
```typescript
// playwright.config.ts
export default {
  projects: [{
    name: 'vscode-web',
    use: { browserType: 'chromium' }
  }]
}

// tests/visual.spec.ts
test('VS Code editor appearance', async ({ page }) => {
  // Launch vscode-test-web
  await page.goto('http://localhost:3000');
  await page.waitForSelector('.monaco-editor');
  await expect(page).toHaveScreenshot();
});
```

**Pros:**
- Uses Playwright's built-in screenshot testing (battle-tested)
- Clean separation: extension tests vs visual tests
- Full Playwright API available
- Already handles all the complexity

**Cons:**
- Separate test suite
- Requires running vscode-test-web server separately
- Two different testing paradigms

## Implementation Complete ✅

The **BroadcastChannel Message Passing Bridge** approach has been successfully implemented and tested.

### What Was Built

**Files Created:**

- `src/server/playwright-bridge.ts` - Core bridge exposing 14 Playwright operations via `page.exposeFunction()`
- `src/test-helpers/playwright.ts` - Test-facing API using BroadcastChannel for worker-to-main communication
- `src/test-helpers/tsconfig.json` - Compilation config for test helpers
- `sample/src/web/test/suite/playwright.test.ts` - 10 comprehensive example tests

**Files Modified:**

- `src/server/index.ts` - Added bridge initialization in `runTests()` function
- `tsconfig.json` - Added reference to test-helpers project
- `README.md` - Added "Using Playwright for UI Testing" documentation section

**Files from Failed Attempt (Can Be Removed):**

- `src/server/snapshots.ts` - Screenshot comparison logic (from original attempt)
- `src/browser/screenshot.ts` - Browser-side helpers (unusable in worker)
- `src/browser/index.ts` - Exports (unusable in worker)

### Test Results

All 10 Playwright tests passing:

1. ✅ Monaco editor visibility check (10s timeout)
2. ✅ Workbench title verification
3. ✅ DOM element counting
4. ✅ Screenshot capture (PNG and JPEG formats)
5. ✅ File and editor operations
6. ✅ Keyboard interaction
7. ✅ UI element querying
8. ✅ Attribute reading
9. ✅ Visibility checks
10. ✅ Text content extraction

### Key Technical Insights

**BroadcastChannel vs postMessage:**

The initial implementation used `self.postMessage()` from the Web Worker, which failed because:
- Web Workers cannot use `self.postMessage()` to communicate with parent windows
- `event.source.postMessage()` only works for iframe/window contexts, not workers

BroadcastChannel API solved this immediately:
- Specifically designed for cross-context communication including isolated workers
- Named channel that any context can join without needing references
- Bidirectional communication with simple API
- All tests passed as soon as BroadcastChannel was implemented

**Architecture Pattern:**

Three-layer bridge design:
1. **Node.js layer**: Playwright page/browser objects with full API access
2. **Main page layer**: BroadcastChannel listener calling `window.__playwrightBridge()`
3. **Worker layer**: Test helper module using BroadcastChannel to send requests

This pattern allows isolated Web Workers to access Node.js APIs despite complete isolation.

## Lessons Learned

- Always verify execution context before using `page.exposeFunction()` - the function exists on the main page, not in workers
- Extension tests run in isolated Web Workers - this is fundamental to VS Code architecture
- `postMessage` from workers to parent windows doesn't work - use BroadcastChannel for worker communication
- Playwright error messages in test output prove communication is working (request reached Playwright, executed, returned detailed error)
- Architecture constraints should drive API design - the BroadcastChannel pattern emerged from understanding the isolation model
- Sometimes you need to try an approach to discover why it won't work (postMessage attempt revealed the need for BroadcastChannel)
