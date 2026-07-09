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
      expect(written).toContain('Table "DIFF SUMMARY');
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

  test('--include-notes: a note-only change is invisible by default, reported with the flag (#68)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-test-'));
    const a = path.join(dir, 'a.dbml');
    const b = path.join(dir, 'b.dbml');
    fs.writeFileSync(a, "Table t {\n  id int [pk]\n  name varchar(50) [note: 'old']\n}\n");
    fs.writeFileSync(b, "Table t {\n  id int [pk]\n  name varchar(50) [note: 'new']\n}\n");
    try {
      const off = run(a, b);
      expect(off.status).toBe(0);
      expect(off.stdout).toContain('No differences found.');

      const on = run(a, b, '--include-notes');
      expect(on.status).toBe(1);
      expect(on.stderr).toContain('added: 0, removed: 0, modified: 1');
      expect(on.stdout).toContain('note changed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--hide-unchanged-pk drops the PK row from MOD tables in dbml output (#64)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-hidepk-'));
    const a = path.join(dir, 'a.dbml');
    const b = path.join(dir, 'b.dbml');
    fs.writeFileSync(a, 'Table t {\n  id int [pk]\n  drop_me varchar(10)\n}\n');
    fs.writeFileSync(b, 'Table t {\n  id int [pk]\n}\n');
    try {
      const on = run(a, b, '--format', 'dbml', '--hide-unchanged-pk');
      expect(on.status).toBe(1);
      expect(on.stdout).not.toContain('unchanged columns omitted');
      expect(on.stdout).toContain('drop_me__REMOVED');

      const off = run(a, b, '--format', 'dbml');
      expect(off.stdout).toContain('unchanged columns omitted');
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

  test('warns when a dbml-only flag is used with an incompatible format (#87)', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'json', '--colors');
    // The command still succeeds and produces JSON...
    expect(res.status).toBe(1);
    expect(() => JSON.parse(res.stdout)).not.toThrow();
    // ...but a warning tells the user the flag was ignored.
    expect(res.stderr).toContain('--colors');
    expect(res.stderr).toContain('apply only to --format dbml');
  });

  test('does not warn when a dbml-only flag is used with --format dbml', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', '--colors');
    expect(res.stderr).not.toContain('apply only to --format dbml');
  });

  describe('arg-validation guards (#86)', () => {
    test('one input file: exit 2 naming the wrong count', () => {
      const res = run(fixture('v1.dbml'));
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('expected exactly two input files, got 1');
    });

    test('three input files: exit 2 naming the wrong count', () => {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), fixture('v1.dbml'));
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('expected exactly two input files, got 3');
    });

    test('--format as the last arg with no value: exit 2', () => {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format');
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('--format requires a value');
    });

    test('-o as the last arg with no value: exit 2', () => {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '-o');
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('-o requires a value');
    });

    test('unknown option: exit 2 naming the flag', () => {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--bogus');
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('Unknown option: --bogus');
    });
  });

  test('--full-new-tables reaches emitDbml: added table lists all columns (#91)', () => {
    const stub = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml');
    // Default: the added table is stubbed to its PK plus a column-count note.
    expect(stub.stdout).toContain('NEW TABLE - 3 columns');
    expect(stub.stdout).not.toContain('Title');

    const full = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', '--full-new-tables');
    // With the flag, every column of dbo.PlanKind is emitted.
    expect(full.stdout).toContain('Title');
    expect(full.stdout).toContain('Sku');
    expect(full.stdout).not.toContain('NEW TABLE - 3 columns');
  });

  test('--colors reaches emitDbml: headercolor annotations are emitted (#91)', () => {
    const off = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml');
    expect(off.stdout).not.toContain('headercolor');

    const on = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', '--colors');
    expect(on.stdout).toContain('headercolor');
  });

  test('large diff is not truncated when written to a piped stdout (#89)', () => {
    // process.exit() after a stdout write drops buffered data on POSIX when
    // stdout is a pipe (async writes) and the output exceeds the ~64KB OS pipe
    // buffer. The captured spawnSync stdout is a pipe, so this reproduces it on
    // Linux/macOS (on Windows pipe writes are synchronous, so it always passes).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-trunc-'));
    const a = path.join(dir, 'a.dbml');
    const b = path.join(dir, 'b.dbml');
    const ref = path.join(dir, 'ref.txt');
    try {
      // ~5000 modified tables -> a few hundred KB of text, far past 64KB and
      // under the 1MB spawnSync maxBuffer default.
      let src = '';
      let dst = '';
      for (let i = 0; i < 5000; i++) {
        src += `Table t${i} {\n  id int [pk]\n  c1 varchar(50)\n}\n`;
        dst += `Table t${i} {\n  id int [pk]\n  c1 bigint\n  c2 varchar(99)\n}\n`;
      }
      fs.writeFileSync(a, src);
      fs.writeFileSync(b, dst);

      // Reference: -o writes via writeFileSync (synchronous, never truncated).
      const toFile = run(a, b, '-o', ref);
      expect(toFile.status).toBe(1);
      const reference = fs.readFileSync(ref, 'utf8');
      expect(reference.length).toBeGreaterThan(100_000); // guard: genuinely large

      // Piped path: spawnSync captures the child's stdout over a pipe.
      const piped = run(a, b);
      expect(piped.status).toBe(1);
      expect(piped.stdout).toBe(reference);
      expect(piped.stdout.endsWith(reference.slice(-80))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
