'use strict';

const { emitD2 } = require('./emit');

/**
 * The optional dependency that turns D2 source into an SVG. It ships a
 * multi-megabyte WASM blob, so it is deliberately NOT a hard dependency: only
 * `--format svg` needs it, and it is required lazily here so that every other
 * format keeps working with `@dbml/core` as the only install.
 *
 * It is listed under `peerDependenciesMeta` as optional (not
 * `optionalDependencies`, which npm installs by default) so a plain
 * `npm i dbml-diff` never pulls it, and a user who wants SVG opts in with
 * `npm i @terrastruct/d2`.
 */
const D2_PACKAGE = '@terrastruct/d2';

class D2NotInstalledError extends Error {
  constructor() {
    super(
      `dbml-diff: --format svg needs the optional "${D2_PACKAGE}" package, which is not installed.\n` +
      `  Install it:  npm i ${D2_PACKAGE}\n` +
      `  Or emit the diagram source without rendering:  --format d2 -o diff.d2`
    );
    this.name = 'D2NotInstalledError';
    this.code = 'D2_NOT_INSTALLED';
  }
}

async function loadD2() {
  let mod;
  try {
    // @terrastruct/d2 is ESM-first: its CommonJS entry is an empty stub, and the
    // working API lives behind the ESM entry, so it must be loaded with a dynamic
    // import() rather than require().
    mod = await import(D2_PACKAGE);
  } catch (err) {
    if (err && (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND')) {
      throw new D2NotInstalledError();
    }
    throw err;
  }
  const D2 = mod && (mod.D2 || (mod.default && mod.default.D2));
  if (typeof D2 !== 'function') {
    throw new Error(`dbml-diff: "${D2_PACKAGE}" is installed but does not export the expected D2 API.`);
  }
  return D2;
}

/**
 * Render a diff result to a self-contained SVG string via D2.
 *
 * `--format svg` is `emitD2` plus this one render step; all the diff-to-diagram
 * logic lives in the dependency-free `emitD2`, so this layer only compiles and
 * renders. The `dagre` layout is used deliberately: `elk` can hang for minutes
 * on a large disconnected diagram, while `dagre` handles the same input in
 * well under a second.
 *
 * @param {import('./diff').DiffResult} result
 * @param {Object} [opts] Same shape as `emitD2` options, plus:
 * @param {boolean} [opts.sketch=false] D2 hand-drawn style.
 * @param {number} [opts.scale=1] SVG scale; 1 renders at natural size (no
 *   fit-to-screen shrinking), which is the whole point of rendering locally.
 * @returns {Promise<string>} SVG source, fonts embedded, no external fetches.
 */
async function renderSvg(result, opts = {}) {
  const D2 = await loadD2();
  const source = emitD2(result, opts);
  const d2 = new D2();
  const { diagram } = await d2.compile(source, { layout: 'dagre' });
  return d2.render(diagram, {
    scale: opts.scale == null ? 1 : opts.scale,
    sketch: !!opts.sketch,
    pad: 20,
    noXMLTag: false,
  });
}

module.exports = { renderSvg, D2NotInstalledError, D2_PACKAGE };
