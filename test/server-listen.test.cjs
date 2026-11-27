/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:net');
const { test } = require('node:test');

const config = {
  build: { type: 'cdn', uri: 'https://example.invalid' },
  printServerLog: false,
};

function attempt(host, port) {
  return spawnSync(process.execPath, ['-e', `
    const { runServer } = require('./out/server/main');
    runServer(${JSON.stringify(host)}, ${port}, ${JSON.stringify(config)}).then(
      server => { console.log('resolved:' + server.listening); setTimeout(() => server.close(), 100); },
      error => { console.log('rejected:' + error.code); }
    );
  `], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 10000 });
}

test('runServer rejects when its port is already in use', async () => {
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const child = attempt('127.0.0.1', occupied.address().port);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /rejected:EADDRINUSE/);
    assert.doesNotMatch(child.stdout, /resolved/);
  } finally {
    await new Promise(resolve => occupied.close(resolve));
  }
});

test('runServer rejects an invalid listen address', () => {
  const child = attempt('256.256.256.256', 0);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /rejected:ENOTFOUND/);
  assert.doesNotMatch(child.stdout, /resolved/);
});

test('runServer resolves only after the server starts listening', () => {
  const child = attempt('127.0.0.1', 0);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /resolved:true/);
  assert.doesNotMatch(child.stdout, /rejected:/);
});
