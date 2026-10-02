'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pako = require('pako');
const { diff, emitDbml } = require('..');
const { buildEmbedUrl, buildIframe } = require('../lib/embed');

const BIN = path.join(__dirname, '..', 'bin', 'dbml-diff.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name) => path.join(FIXTURES, name);
const read = (name) => fs.readFileSync(fixture(name), 'utf8');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

const PREFIX = 'https://dbdiagram.io/embed#';

// Independent decoder, written from the dbdiagram.io spec rather than from
// lib/embed.js, so a round trip proves the link is readable by the embed page.
function decodeEmbedUrl(url) {
  expect(url.startsWith(PREFIX)).toBe(true);
  const params = {};
  for (const part of url.slice(PREFIX.length).split('&')) {
    const eq = part.indexOf('=');
    params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const value = decodeURIComponent(params.c);
  const dbml = value.startsWith('pako:')
    ? Buffer.from(pako.inflate(Buffer.from(value.slice('pako:'.length), 'base64'))).toString('utf8')
    : Buffer.from(value, 'base64').toString('utf8');
  return { dbml, theme: params.theme, compressed: value.startsWith('pako:') };
}

function srcOf(iframe) {
  const m = /^<iframe src="([^"]*)"/.exec(iframe);
  expect(m).not.toBeNull();
  return m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const PAIRS = [
  ['v1.dbml', 'v2.dbml'],
  ['empty-a.dbml', 'empty-b.dbml'],
];

describe('buildEmbedUrl', () => {
  for (const [a, b] of PAIRS) {
    const dbml = emitDbml(diff(read(a), read(b)), { oldLabel: a, newLabel: b });

    test(`plain round trip, ${a} -> ${b}`, () => {
      const url = buildEmbedUrl(dbml);
      const decoded = decodeEmbedUrl(url);
      expect(decoded.compressed).toBe(false);
      expect(decoded.dbml).toBe(dbml);
    });

    test(`pako round trip, ${a} -> ${b}`, () => {
      const url = buildEmbedUrl(dbml, { compress: true });
      expect(url.startsWith(`${PREFIX}c=pako%3A`)).toBe(true);
      const decoded = decodeEmbedUrl(url);
      expect(decoded.compressed).toBe(true);
      expect(decoded.dbml).toBe(dbml);
    });
  }

  test('round trip preserves non-ASCII text byte for byte', () => {
    const dbml = 'Table "MOD · café" {\n  naïve int [note: \'日本\']\n}\n';
    expect(decodeEmbedUrl(buildEmbedUrl(dbml)).dbml).toBe(dbml);
    expect(decodeEmbedUrl(buildEmbedUrl(dbml, { compress: true })).dbml).toBe(dbml);
  });

  test('URL-encodes the + / = characters of the Base64 payload', () => {
    const dbml = '>>>???a';
    const b64 = Buffer.from(dbml, 'utf8').toString('base64');
    // Guard: the input really does exercise all three characters.
    expect(b64).toBe('Pj4+Pz8/YQ==');
    const url = buildEmbedUrl(dbml);
    expect(url).toBe(`${PREFIX}c=Pj4%2BPz8%2FYQ%3D%3D`);
    expect(url.slice(PREFIX.length + 2)).not.toMatch(/[+/=]/);
    expect(decodeEmbedUrl(url).dbml).toBe(dbml);
  });

  test('theme dark goes before c= in the fragment', () => {
    const url = buildEmbedUrl('Table t {\n  id int\n}\n', { theme: 'dark' });
    expect(url.startsWith(`${PREFIX}theme=dark&c=`)).toBe(true);
    expect(decodeEmbedUrl(url).theme).toBe('dark');
  });

  test('no theme by default', () => {
    expect(buildEmbedUrl('x').startsWith(`${PREFIX}c=`)).toBe(true);
  });

  test('an unrecognised theme fails closed', () => {
    expect(() => buildEmbedUrl('x', { theme: 'light' })).toThrow('invalid theme "light" (expected dark)');
  });

  test('a non-string dbml is rejected', () => {
    expect(() => buildEmbedUrl(undefined)).toThrow(TypeError);
  });
});

describe('buildIframe', () => {
  const url = buildEmbedUrl('Table t {\n  id int\n}\n');

  test('wraps the link in a single iframe tag with the default height', () => {
    expect(buildIframe(url)).toBe(
      `<iframe src="${url}" width="100%" height="700" style="border:0" loading="lazy" allowfullscreen></iframe>`,
    );
  });

  test('honours a custom height', () => {
    expect(buildIframe(url, { height: 450 })).toContain(' height="450" ');
  });

  test('attribute-escapes the & of a themed link', () => {
    const themed = buildEmbedUrl('x', { theme: 'dark' });
    const tag = buildIframe(themed);
    expect(tag).toContain('#theme=dark&amp;c=');
    expect(srcOf(tag)).toBe(themed);
  });

  test.each([0, -1, 1.5, NaN, '700'])('rejects height %p', (height) => {
    expect(() => buildIframe(url, { height })).toThrow('invalid height');
  });
});

describe('CLI --format url / iframe', () => {
  for (const [a, b] of PAIRS) {
    for (const compress of [false, true]) {
      test(`url decodes to the --format dbml output, ${a} -> ${b}${compress ? ' (compressed)' : ''}`, () => {
        const extra = compress ? ['--compress'] : [];
        const dbmlRun = run(fixture(a), fixture(b), '--format', 'dbml');
        const urlRun = run(fixture(a), fixture(b), '--format', 'url', ...extra);
        // Exit codes match the diff result, unchanged by the new formats.
        expect(urlRun.status).toBe(dbmlRun.status);
        expect(urlRun.stderr).toBe(dbmlRun.stderr);
        const decoded = decodeEmbedUrl(urlRun.stdout.trimEnd());
        expect(decoded.compressed).toBe(compress);
        // The emitter output already ends in a newline, so the CLI prints it
        // verbatim; the embedded payload must be exactly those bytes.
        expect(decoded.dbml).toBe(dbmlRun.stdout);
      });
    }
  }

  test('exit codes: 1 for a differing pair, 0 for an identical pair', () => {
    expect(run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'iframe').status).toBe(1);
    expect(run(fixture('empty-a.dbml'), fixture('empty-b.dbml'), '--format', 'iframe').status).toBe(0);
  });

  test('dbml emitter flags flow through to the embedded diff', () => {
    const flags = ['--colors', '--full-new-tables', '--hide-unchanged-pk', '--include-notes'];
    const dbmlRun = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', ...flags);
    const plainRun = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml');
    // Guard: the flags really do change the emitted document.
    expect(dbmlRun.stdout).not.toBe(plainRun.stdout);
    expect(dbmlRun.stdout).toContain('headercolor');
    for (const format of ['url', 'iframe']) {
      const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', format, ...flags);
      expect(res.stderr).not.toContain('ignored');
      const url = format === 'url' ? res.stdout.trimEnd() : srcOf(res.stdout.trimEnd());
      expect(decodeEmbedUrl(url).dbml).toBe(dbmlRun.stdout);
    }
  });

  test('iframe output is one tag, with --theme and --embed-height applied', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'iframe', '--theme', 'dark', '--embed-height', '480');
    expect(res.status).toBe(1);
    const tag = res.stdout.trimEnd();
    expect(tag.split('\n')).toHaveLength(1);
    expect(tag).toMatch(/^<iframe src="https:\/\/dbdiagram\.io\/embed#theme=dark&amp;c=[^"]+" width="100%" height="480" style="border:0" loading="lazy" allowfullscreen><\/iframe>$/);
    expect(decodeEmbedUrl(srcOf(tag)).theme).toBe('dark');
  });

  test('-o writes url and iframe output to a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-test-'));
    try {
      for (const format of ['url', 'iframe']) {
        const out = path.join(dir, `diff.${format}`);
        const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', format, '--compress', '-o', out);
        expect(res.status).toBe(1);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain('added: 1, removed: 1, modified: 4');
        const written = fs.readFileSync(out, 'utf8');
        const url = format === 'url' ? written.trimEnd() : srcOf(written);
        expect(decodeEmbedUrl(url).dbml).toContain('Table "NEW · dbo.PlanKind"');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an invalid --theme fails closed naming the valid values', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'url', '--theme', 'light');
    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('invalid --theme "light" (expected dark)');
  });

  test('--theme without a value fails closed', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'url', '--theme');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--theme requires a value');
  });

  test.each(['0', '-5', '12px', '1.5'])('an invalid --embed-height %p fails closed', (h) => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'iframe', '--embed-height', h);
    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain(`invalid --embed-height "${h}"`);
  });

  test('an unknown --format names every valid value, including url and iframe', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'html');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('expected text, json, dbml, d2, svg, url, or iframe');
  });

  test('embed flags warn when the format ignores them', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'dbml', '--compress', '--theme', 'dark', '--embed-height', '300');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--compress, --theme apply only to --format url or iframe; ignored with --format dbml');
    expect(res.stderr).toContain('--embed-height applies only to --format iframe; ignored with --format dbml');
  });

  test('--embed-height warns with --format url', () => {
    const res = run(fixture('v1.dbml'), fixture('v2.dbml'), '--format', 'url', '--embed-height', '300');
    expect(res.stderr).toContain('--embed-height applies only to --format iframe; ignored with --format url');
  });
});
