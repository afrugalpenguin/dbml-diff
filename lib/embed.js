'use strict';

const pako = require('pako');

// dbdiagram.io renders DBML carried in the URL fragment of its embed page, so
// the diagram needs no account and nothing is stored server side. Format per
// https://docs.dbdiagram.io/dbml-in-link-diagram:
//
//   https://dbdiagram.io/embed#[theme=dark&]c=<value>
//
// where <value> is encodeURIComponent(base64(utf8(dbml))), or, compressed,
// encodeURIComponent('pako:' + base64(zlibDeflate(utf8(dbml)))).

const EMBED_BASE = 'https://dbdiagram.io/embed#';

// dbdiagram recognises only `dark`; any other value silently renders light,
// so reject it rather than emit a link that ignores what was asked for.
const THEMES = ['dark'];

const DEFAULT_HEIGHT = 700;

function encodePayload(dbml, compress) {
  const bytes = Buffer.from(dbml, 'utf8');
  if (compress) {
    return encodeURIComponent(`pako:${Buffer.from(pako.deflate(bytes)).toString('base64')}`);
  }
  return encodeURIComponent(bytes.toString('base64'));
}

/**
 * Build a dbdiagram.io embed link that renders `dbml`.
 *
 * @param {string} dbml - DBML source (e.g. the output of emitDbml()).
 * @param {object} [opts]
 * @param {boolean} [opts.compress=false] - deflate the payload and prefix it
 *   with `pako:` (shorter link for large schemas).
 * @param {string} [opts.theme] - `dark`, or omit for the default light theme.
 * @returns {string}
 */
function buildEmbedUrl(dbml, { compress = false, theme } = {}) {
  if (typeof dbml !== 'string') {
    throw new TypeError('buildEmbedUrl: dbml must be a string');
  }
  if (theme !== undefined && theme !== null && !THEMES.includes(theme)) {
    throw new Error(`invalid theme "${theme}" (expected ${THEMES.join(', ')})`);
  }
  const themePart = theme ? `theme=${theme}&` : '';
  return `${EMBED_BASE}${themePart}c=${encodePayload(dbml, compress)}`;
}

/**
 * Wrap an embed link in a single <iframe> tag, ready to paste into a web page.
 *
 * @param {string} url - link from buildEmbedUrl().
 * @param {object} [opts]
 * @param {number} [opts.height=700] - iframe height in pixels.
 * @returns {string}
 */
function buildIframe(url, { height = DEFAULT_HEIGHT } = {}) {
  if (typeof url !== 'string') {
    throw new TypeError('buildIframe: url must be a string');
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`invalid height "${height}" (expected a positive whole number of pixels)`);
  }
  // Attribute-escape the link: a themed link contains `&`.
  const src = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<iframe src="${src}" width="100%" height="${height}" style="border:0" loading="lazy" allowfullscreen></iframe>`;
}

module.exports = { buildEmbedUrl, buildIframe, THEMES, DEFAULT_HEIGHT };
