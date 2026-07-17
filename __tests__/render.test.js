'use strict';

// These tests drive the real CLI as a subprocess so the D2 renderer (a
// devDependency) actually runs and produces a real SVG - a render test that
// never renders is exactly the gap that lets a broken diagram ship. Running the
// bin in its own Node process also sidesteps Jest's ESM-import interception
// (@terrastruct/d2 is ESM-first and loaded via dynamic import).

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { D2NotInstalledError, D2_PACKAGE } = require('../lib/render');

const BIN = path.join(__dirname, '..', 'bin', 'dbml-diff.js');

let dir;
let oldFile;
let newFile;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-svg-'));
  oldFile = path.join(dir, 'old.dbml');
  newFile = path.join(dir, 'new.dbml');
  fs.writeFileSync(oldFile, `Table dbo.Orders {
  Id int [pk]
  LegacyCode varchar(20)
}`);
  fs.writeFileSync(newFile, `Table dbo.Orders {
  Id int [pk]
  Total "DECIMAL(18,2)" [not null]
}
Table dbo.Shipments {
  Id int [pk]
  OrderId int
}`);
});

describe('--format svg (real D2 render)', () => {
  let svg;
  let status;
  beforeAll(() => {
    const outFile = path.join(dir, 'diff.svg');
    const res = spawnSync(process.execPath, [BIN, oldFile, newFile, '--format', 'svg', '-o', outFile],
      { encoding: 'utf8', timeout: 60000 });
    status = res.status;
    svg = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  }, 70000);

  test('exits 1 (differences) and writes an SVG document', () => {
    expect(status).toBe(1);
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toMatch(/<\/svg>\s*/);
    expect(svg).toContain('viewBox');
  });

  test('is self-contained: no external network references', () => {
    // w3.org namespace declarations are fine; fetchable resources are not.
    expect(svg).not.toMatch(/xlink:href="https?:/);
    expect(svg).not.toMatch(/<image[^>]+href="https?:/);
    expect(svg).not.toMatch(/url\(\s*['"]?https?:/);
    expect(svg).not.toMatch(/@import|href="[^"]*\.(?:woff2?|ttf)/);
  });

  test('carries the state fill colours', () => {
    const lower = svg.toLowerCase();
    expect(lower).toContain('#f39c12'); // modified: dbo.Orders
    expect(lower).toContain('#2ecc71'); // added: dbo.Shipments
  });

  test('a comma-precision type survives to the rendered output', () => {
    // The exact construct that broke mermaid; D2 renders it verbatim.
    expect(svg).toContain('DECIMAL(18,2)');
  });

  test('renders a compact shape, not one wide degenerate row', () => {
    const w = Number((svg.match(/width="(\d+)"/) || [])[1]);
    const h = Number((svg.match(/height="(\d+)"/) || [])[1]);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    // The grid keeps the aspect ratio bounded. The failure this guards against
    // is the mermaid-style linear blowup (thousands-to-one on a real diff); a
    // healthy grid stays in single digits even for this small 3-shape case.
    expect(w / h).toBeLessThan(10);
  });

  test('does not hang: the render process exits on its own', () => {
    // status is only set if the subprocess exited (spawnSync would report a
    // timeout signal otherwise). Reaching here with a numeric status proves it.
    expect(typeof status).toBe('number');
  });
});

describe('missing optional dependency', () => {
  test('D2NotInstalledError names the package and the escape hatch', () => {
    const err = new D2NotInstalledError();
    expect(err.code).toBe('D2_NOT_INSTALLED');
    expect(err.message).toContain(D2_PACKAGE);
    expect(err.message).toContain('npm i');
    expect(err.message).toContain('--format d2'); // the no-render fallback
  });
});
