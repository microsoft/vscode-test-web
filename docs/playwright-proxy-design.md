# Playwright VSCode Proxy Design

## Overview

The Playwright test integration allows tests to run in Node.js while accessing the VSCode API that lives in the browser's extension host worker. This document describes the proxy architecture, current issues, and the design for a proper solution.

## Architecture

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│      Node.js        │         │     Browser (Extension Host)    │
│                     │         │                                 │
│  Test code uses     │  proxy  │  Real vscode API lives here     │
│  vscode proxy   ────┼────────►│  - vscode.workspace             │
│                     │         │  - vscode.Uri                   │
│                     │         │  - vscode.window                │
└─────────────────────┘         └─────────────────────────────────┘
```

### Key Concepts

**JSHandle (Playwright)**
A reference to an object living in the browser/worker. It's like a pointer - you can't directly access the object's properties from Node.js, but you can:
- Pass it back to `evaluate()` calls where it gets resolved to the real object
- Call `handle.getProperty('foo')` to get another handle
- Call `handle.jsonValue()` to serialize and bring the data to Node.js

**Proxy (JavaScript)**
A wrapper object that intercepts property access and method calls. It provides a nice developer-facing API while hiding the complexity of cross-context communication.

In our implementation:
- **Handles** are the implementation detail - they maintain references to objects in the worker
- **Proxies** are the developer-facing API - they make it feel like you're using the real vscode API

## Current Issues

### Issue 1: Fixture Runner Thenable Problem

**The Problem:**

Playwright's fixture system checks if values are "thenable" (have a `.then` method). When it sees a thenable, it awaits it.

```typescript
// Inside Playwright's fixture runner (simplified)
const vscodeProxy = await createVSCodeProxy(extensionHostWorker);
await use(vscodeProxy);  // Playwright checks if vscodeProxy is thenable
```

Our proxy has a `.then` property to support `await vscode.workspace.workspaceFolders`. But this causes:

1. `createVSCodeProxy()` returns the proxy
2. Playwright sees the proxy has `.then`
3. Playwright calls `.then()` on it, thinking it's a Promise
4. Our `.then()` handler calls `jsonValue()`, serializing the entire vscode API
5. The test receives a plain JS object, not a proxy

**Attempted Solution (Probably Wrong):**

Split into two proxy types:
- `createRootProxy` - does NOT have `.then`, so Playwright won't await it
- `createThenableProxy` - has `.then`, used for property chains

This feels like a hack. The root proxy behaves differently from child proxies, which is confusing and may cause other issues.

**Questions to Investigate:**

1. Is there a standard way to mark an object as "not a Promise" even if it has `.then`?
2. Should the fixture return something other than the proxy directly?
3. How do other libraries handle this thenable detection problem?
4. Is there a Playwright API to avoid this thenable check?

### Issue 2: Eager Serialization

**The Problem:**

The current proxy eagerly serializes objects when awaited:

```typescript
const folders = await vscode.workspace.workspaceFolders;
// folders is now a plain JS object: [{ uri: { scheme, path, ... }, name, index }]

const uri = folders[0].uri;
// uri is a plain object: { scheme: 'file', path: '/foo', ... }
// NOT a real vscode.Uri - it has no methods

await vscode.Uri.joinPath(uri, 'test.txt');
// FAILS: VSCode expects a real Uri instance with .with() method
```

**Attempted Solution (Wrong - Removed):**

A hack was added to detect Uri-like objects and reconstruct them:

```typescript
if (arg && arg.scheme !== undefined && arg.path !== undefined) {
    return vscodeApi.Uri.from(arg);  // Reconstruct Uri from plain object
}
```

This is wrong because:
1. It only works for `Uri`, not `Position`, `Range`, `TextDocument`, etc.
2. It relies on duck-typing rather than proper type safety
3. The types are too permissive - this code compiles but shouldn't

### Issue 3: Type Safety

Consider this VSCode API:

```typescript
Uri.joinPath(base: vscode.Uri, ...pathSegments: string[]): vscode.Uri
```

Our proxied version should be:

```typescript
Uri.joinPath(base: Promisified<vscode.Uri>, ...pathSegments: string[]): Promise<Promisified<vscode.Uri>>
```

TypeScript must enforce:
1. `Promisified<vscode.Uri>` is NOT compatible with `vscode.Uri`
2. A plain object `{ scheme, path }` is NOT compatible with `Promisified<vscode.Uri>`
3. Only values obtained through the proxy can be passed to proxy functions

### Four Cases to Handle

**Case 1: Proxied function, proxied argument ✓**
```typescript
const uri = await vscode.workspace.workspaceFolders[0].uri;  // Promisified<Uri>
await vscode.Uri.joinPath(uri, 'test.txt');
// Both execute in worker, handle resolves to real Uri - WORKS
```

**Case 2: Proxied function, plain object argument ✗**
```typescript
const plainUri = { scheme: 'file', path: '/foo' };
await vscode.Uri.joinPath(plainUri, 'test.txt');
// Should FAIL TO COMPILE - plainUri is not Promisified<vscode.Uri>
```

**Case 3: Non-proxied function, proxied argument ✗**
```typescript
function localFunction(uri: vscode.Uri) { ... }
const uri = await vscode.workspace.workspaceFolders[0].uri;
localFunction(uri);
// Should FAIL TO COMPILE - uri is Promisified<vscode.Uri>, not vscode.Uri
```

**Case 4: Primitives ✓**
```typescript
await vscode.Uri.joinPath(uri, 'test.txt');
// 'test.txt' is a string primitive - can be serialized directly - WORKS
```

## The Solution

### 1. Keep Handles, Don't Serialize Eagerly

Property access should return proxies wrapping handles, not serialized data:

```typescript
const folders = await vscode.workspace.workspaceFolders;
// folders is a Proxy wrapping a JSHandle to the array

const folder = await folders[0];
// folder is a Proxy wrapping a JSHandle to the folder object

const uri = await folder.uri;
// uri is a Proxy wrapping a JSHandle to the Uri instance
```

Only serialize when accessing primitive leaf values:

```typescript
const path = await uri.path;
// NOW we serialize - path is a string primitive
```

### 2. Proper `Promisified<T>` Type

The type must:
- Make property access return `Promisified<PropertyType>` (another proxy)
- Make method calls return `Promise<Promisified<ReturnType>>`
- Be incompatible with the original type `T`
- Be incompatible with plain objects

```typescript
type Promisified<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? (...args: PromisifiedArgs<A>) => Promise<Promisified<R>>
        : Promisified<T[K]>
} & { __brand: 'Promisified' }  // Brand to make it incompatible with T
```

### 3. Handle Resolution in Worker

When calling a proxied function with proxied arguments:

**Node.js side:**
1. Detect which arguments are proxies (have underlying handles)
2. Send the function call request to the worker
3. Include handle references for proxy arguments, serialized values for primitives

**Worker side:**
1. Receive the function call request
2. Resolve handle references to real objects
3. Call the real function with real arguments
4. Return a handle to the result

### 4. Runtime Error for Type Mismatches

If somehow the type system is bypassed (e.g., `any` casting), throw meaningful runtime errors:

```typescript
// If a plain object is passed where a proxy is expected:
throw new Error(
    'Expected a proxied vscode.Uri but received a plain object. ' +
    'Make sure you are passing values obtained from the vscode proxy, ' +
    'not manually constructed objects.'
);
```

## Implementation Tasks

1. **Investigate thenable problem**
   - Find the right solution for Issue 1 (fixture runner thenable detection)
   - The current split proxy approach is probably wrong

2. **Refactor proxy to keep handles**
   - Don't call `jsonValue()` on await
   - Property access returns new proxies wrapping `handle.getProperty()`
   - Only serialize primitives

3. **Define proper `Promisified<T>` types**
   - Brand the type to prevent mixing with real vscode types
   - Ensure plain objects don't satisfy the type

4. **Implement handle passing for function calls**
   - Detect proxy arguments by checking for internal handle reference
   - Pass handle IDs to worker
   - Resolve handles to real objects in worker before calling function

5. **Add runtime validation**
   - Check argument types at runtime
   - Throw descriptive errors for mismatches

6. **Update tests**
   - Verify type safety (invalid code should not compile)
   - Verify runtime errors for edge cases

## Open Questions

1. How do we solve the thenable detection problem properly? (Issue 1)

2. How do we handle arrays? `folders[0]` needs to work but arrays are tricky with proxies.

3. How do we handle iteration? `for (const folder of folders)` should work.

4. How do we serialize only when needed? When does the user "need" the actual data vs. just passing it around?

5. Performance implications of keeping handles vs. eager serialization?
