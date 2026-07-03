'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.join(__dirname, '..', 'bin', 'dbml-diff.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name) => path.join(FIXTURES, name);

const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

describe('CLI', () => {
  test('differing pair: exit code 1 and counts on stderr', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('added: 1, removed: 1, modified: 4');
    expect(res.stdout).toContain('dbo.PlanKind');
    expect(res.stdout).toContain('dbo.LegacyLog');
  });

  test('identical pair: exit code 0', () => {
    const res = run(fixture('empty-a.dbml'), fixture('empty-b.dbml'));
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('added: 0, removed: 0, modified: 0');
    expect(res.stdout).toContain('No differences found.');
  });

  test('missing file: exit code 2 with a message on stderr', () => {
    const res = run(fixture('does-not-exist.dbml'), fixture('v2.dbml'));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('cannot read');
    expect(res.stderr).toContain('does-not-exist.dbml');
  });

  test('malformed DBML: exit code 2 with a parse error on stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-test-'));
    const bad = path.join(dir, 'bad.dbml');
    fs.writeFileSync(bad, 'Table Broken {\n  id int [pk\n');
    try {
      const res = run(bad, fixture('v2.dbml'));
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('parse error');
      expect(res.stderr).toContain('bad.dbml');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--format json emits JSON on stdout', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'json');
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.counts).toEqual({ added: 1, removed: 1, modified: 4 });
  });

  test('--format dbml with -o writes the file, counts still on stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-test-'));
    const out = path.join(dir, 'diff.dbml');
    try {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', '-o', out);
      expect(res.status).toBe(1);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain('added: 1, removed: 1, modified: 4');
      const written = fs.readFileSync(out, 'utf8');
      expect(written).toContain('Note diff_summary {');
      expect(written).toContain('Table "NEW · dbo.PlanKind"');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalid --format: exit code 2', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'yaml');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('invalid --format');
  });

  test('--help exits 0 and prints usage', () => {
    const res = run('--help');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: dbml-diff');
  });

  test('--version exits 0 and prints the package version', () => {
    const res = run('--version');
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(require('../package.json').version);
  });
});
