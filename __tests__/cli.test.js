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

  test('--help exits 0 and prints usage with examples', () => {
    const res = run('--help');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: dbml-diff');
    expect(res.stdout).toContain('Examples:');
  });

  test('bare invocation exits 2 and prints the quickstart on stderr', () => {
    const res = run();
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('Usage: dbml-diff');
    expect(res.stderr).toContain('Examples:');
    expect(res.stdout).toBe('');
  });

  test('enum-only change: exit code 1 and enum counts on stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-test-'));
    const a = path.join(dir, 'a.dbml');
    const b = path.join(dir, 'b.dbml');
    fs.writeFileSync(a, 'Enum status {\n  pending\n}\n');
    fs.writeFileSync(b, 'Enum status {\n  pending\n  paid\n}\n');
    try {
      const res = run(a, b);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('enums added: 0, removed: 0, modified: 1');
      expect(res.stdout).toContain('Modified enums (1):');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--migrate emits a T-SQL migration on stdout, counts on stderr', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--migrate');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('CREATE TABLE [dbo].[PlanKind]');
    expect(res.stdout).toContain('ALTER TABLE [dbo].[Subscriptions] ADD [PlanKindId]');
    expect(res.stderr).toContain('added: 1, removed: 1, modified: 4');
  });

  test('--migrate never emits an uncommented DROP', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--migrate');
    const offending = res.stdout
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .filter((l) => /\bDROP\b/i.test(l));
    expect(offending).toEqual([]);
  });

  test('--migrate combined with --format is a usage error (exit 2)', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--migrate', '--format', 'json');
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/--migrate/);
  });

  test('--migrate honors -o by writing the script to a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-mig-'));
    const outFile = path.join(dir, 'up.sql');
    try {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--migrate', '-o', outFile);
      expect(res.status).toBe(1);
      const written = fs.readFileSync(outFile, 'utf8');
      expect(written).toContain('CREATE TABLE [dbo].[PlanKind]');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--migrate emits ADD CONSTRAINT for a new foreign key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-fk-'));
    const oldF = path.join(dir, 'old.dbml');
    const newF = path.join(dir, 'new.dbml');
    try {
      fs.writeFileSync(oldF, 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}\n');
      fs.writeFileSync(newF, 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}\n');
      const res = run(oldF, newF, '--migrate');
      expect(res.status).toBe(1);
      expect(res.stdout).toContain('ADD CONSTRAINT [FK_Orders_Customers_CustomerId]');
      expect(res.stderr).toContain('refs added: 1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refs-only diff exits 1 and reports refs on stderr (any format)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-refonly-'));
    const oldF = path.join(dir, 'old.dbml');
    const newF = path.join(dir, 'new.dbml');
    try {
      fs.writeFileSync(oldF, 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}\n');
      fs.writeFileSync(newF, 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P.Id]\n}\n');
      const res = run(oldF, newF);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('added: 0, removed: 0, modified: 0');
      expect(res.stderr).toContain('refs added: 1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('groups-only diff exits 1 and reports groups on stderr', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-grouponly-'));
    const oldF = path.join(dir, 'old.dbml');
    const newF = path.join(dir, 'new.dbml');
    try {
      fs.writeFileSync(oldF, 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\n');
      fs.writeFileSync(newF, 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\nTableGroup g {\n  A\n  B\n}\n');
      const res = run(oldF, newF);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('groups added: 1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--version exits 0 and prints the package version', () => {
    const res = run('--version');
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(require('../package.json').version);
  });
});
