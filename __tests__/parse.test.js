'use strict';

const { parseSchema } = require('../lib/parse');

test('an indented DiagramView block does not consume a following table (#88)', () => {
  // dbdiagram usually exports DiagramView at column 0, but an indented block
  // whose closing brace is not at column 0 must still be stripped exactly,
  // without swallowing the next table.
  const src = [
    'Table alpha {',
    '  id int [pk]',
    '}',
    '  DiagramView vw {',
    '    tables {',
    '      alpha { x 1 }',
    '    }',
    '  }',
    'Table keep {',
    '  id int [pk]',
    '}',
  ].join('\n');
  const names = [...parseSchema(src).tables.keys()];
  expect(names.some((n) => n.endsWith('alpha'))).toBe(true);
  expect(names.some((n) => n.endsWith('keep'))).toBe(true);
});
