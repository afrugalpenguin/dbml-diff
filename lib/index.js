'use strict';

const { diff } = require('./diff');
const { emitDbml, emitText, emitJson } = require('./emit');

/**
 * Public API.
 *
 * @example
 * const { diff, emitText, emitJson, emitDbml } = require('dbml-diff');
 * const result = diff(oldDbmlString, newDbmlString);
 * console.log(emitText(result));
 */
module.exports = { diff, emitText, emitJson, emitDbml };
