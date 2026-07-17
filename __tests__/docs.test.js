'use strict';

// Guards against docs drifting from code - the failure mode the 1.0 API-freeze
// audit found (a documented export that was not actually exported).

const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('..');

// The public API promised by docs/api.md and docs/stability.md. Keep this list
// in sync with those docs; the test asserts the code exports exactly this set.
const PUBLIC_API = ['diff', 'emitDbml', 'emitJson', 'emitMermaid', 'emitMigration', 'emitText'];

describe('docs stay in sync with code', () => {
  test('package exports exactly the documented public API', () => {
    expect(Object.keys(pkg).sort()).toEqual(PUBLIC_API);
  });

  test('every documented export is a function', () => {
    for (const name of PUBLIC_API) {
      expect(typeof pkg[name]).toBe('function');
    }
  });

  test('docs/cli.md matches the live --help output', () => {
    const script = path.join(__dirname, '..', 'scripts', 'build-cli-docs.js');
    const res = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });
});
