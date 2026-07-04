'use strict';

const { diff } = require('../lib');

describe('diff', () => {
  test('detects an added table', () => {
    const a = `Table users { id int [pk] }`;
    const b = `Table users { id int [pk] }
Table orders { id int [pk]
  total decimal(10,2) [not null] }`;
    const result = diff(a, b);
    expect(result.counts).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(result.tables.added[0].name).toBe('orders');
    expect(result.tables.added[0].columns.map((c) => c.name)).toEqual(['id', 'total']);
  });

  test('detects a removed table', () => {
    const a = `Table users { id int [pk] }
Table audit { id int [pk] }`;
    const b = `Table users { id int [pk] }`;
    const result = diff(a, b);
    expect(result.counts).toEqual({ added: 0, removed: 1, modified: 0 });
    expect(result.tables.removed[0].name).toBe('audit');
  });

  test('detects an added column', () => {
    const a = `Table users { id int [pk] }`;
    const b = `Table users { id int [pk]
  email varchar(200) [not null] }`;
    const result = diff(a, b);
    expect(result.counts).toEqual({ added: 0, removed: 0, modified: 1 });
    const m = result.tables.modified[0];
    expect(m.columnsAdded).toHaveLength(1);
    expect(m.columnsAdded[0]).toMatchObject({ name: 'email', type: 'varchar(200)', notNull: true });
    expect(m.columnsRemoved).toHaveLength(0);
    expect(m.renames).toHaveLength(0);
  });

  test('detects a removed column', () => {
    const a = `Table users { id int [pk]
  email varchar(200) }`;
    const b = `Table users { id int [pk] }`;
    const result = diff(a, b);
    const m = result.tables.modified[0];
    expect(m.columnsRemoved).toHaveLength(1);
    expect(m.columnsRemoved[0].name).toBe('email');
    expect(m.columnsAdded).toHaveLength(0);
    expect(m.renames).toHaveLength(0);
  });

  test('detects a type change', () => {
    const a = `Table users { id int [pk]
  settled datetime }`;
    const b = `Table users { id int [pk]
  settled bigint }`;
    const result = diff(a, b);
    const m = result.tables.modified[0];
    expect(m.columnsChanged).toHaveLength(1);
    expect(m.columnsChanged[0].column.name).toBe('settled');
    expect(m.columnsChanged[0].changes).toEqual(['type datetime -> bigint']);
  });

  test('detects nullability change: NOT NULL -> nullable', () => {
    const a = `Table users { id int [pk]
  name varchar(50) [not null] }`;
    const b = `Table users { id int [pk]
  name varchar(50) }`;
    const result = diff(a, b);
    expect(result.tables.modified[0].columnsChanged[0].changes)
      .toEqual(['was NOT NULL, now nullable']);
  });

  test('detects nullability change: nullable -> NOT NULL', () => {
    const a = `Table users { id int [pk]
  name varchar(50) }`;
    const b = `Table users { id int [pk]
  name varchar(50) [not null] }`;
    const result = diff(a, b);
    expect(result.tables.modified[0].columnsChanged[0].changes)
      .toEqual(['was nullable, now NOT NULL']);
  });

  test('rename heuristic fires for one removed + one added column with same signature', () => {
    const a = `Table lines { id int [pk]
  ZoneId int }`;
    const b = `Table lines { id int [pk]
  GeoZoneId int }`;
    const result = diff(a, b);
    const m = result.tables.modified[0];
    expect(m.renames).toHaveLength(1);
    expect(m.renames[0].from.name).toBe('ZoneId');
    expect(m.renames[0].to.name).toBe('GeoZoneId');
    expect(m.columnsAdded).toHaveLength(0);
    expect(m.columnsRemoved).toHaveLength(0);
  });

  test('rename heuristic does NOT fire when 2+ columns were added alongside 1 removal', () => {
    const a = `Table lines { id int [pk]
  ZoneId int }`;
    const b = `Table lines { id int [pk]
  GeoZoneId int
  ExtraId int }`;
    const result = diff(a, b);
    const m = result.tables.modified[0];
    expect(m.renames).toHaveLength(0);
    expect(m.columnsRemoved.map((c) => c.name)).toEqual(['ZoneId']);
    expect(m.columnsAdded.map((c) => c.name)).toEqual(['GeoZoneId', 'ExtraId']);
  });

  test('rename heuristic does NOT fire when signatures differ', () => {
    const a = `Table lines { id int [pk]
  ZoneId int [not null] }`;
    const b = `Table lines { id int [pk]
  GeoZoneId int }`;
    const result = diff(a, b);
    const m = result.tables.modified[0];
    expect(m.renames).toHaveLength(0);
    expect(m.columnsRemoved).toHaveLength(1);
    expect(m.columnsAdded).toHaveLength(1);
  });

  test('identical schemas produce zero counts', () => {
    const s = `Table users { id int [pk]
  name varchar(50) [not null] }`;
    const result = diff(s, s);
    expect(result.counts).toEqual({ added: 0, removed: 0, modified: 0 });
    expect(result.tables.added).toEqual([]);
    expect(result.tables.removed).toEqual([]);
    expect(result.tables.modified).toEqual([]);
  });

  test('detects a PK declared via an Indexes block', () => {
    const a = `Table dbo.Shipments { Id int [not null] }`;
    const b = `Table dbo.Shipments { Id int [not null] }
TABLE dbo.Refunds {
  Id UNIQUEIDENTIFIER [not null]
  TicketRef NVARCHAR(50)
  Indexes { Id [pk] }
}`;
    const result = diff(a, b);
    const added = result.tables.added[0];
    expect(added.name).toBe('dbo.Refunds');
    const idCol = added.columns.find((c) => c.name === 'Id');
    expect(idCol.pk).toBe(true);
    expect(added.columns.find((c) => c.name === 'TicketRef').pk).toBe(false);
  });

  test('preserves schema-qualified table names', () => {
    const a = `Table dbo.Shipments { Id int [pk] }`;
    const b = `Table dbo.Shipments { Id int [pk]
  Freight decimal(24,8) }`;
    const result = diff(a, b);
    expect(result.tables.modified[0].name).toBe('dbo.Shipments');
  });

  test('detects an added enum', () => {
    const a = `Table users { id int [pk] }`;
    const b = `Table users { id int [pk] }
Enum order_status {
  pending
  paid
  shipped
}`;
    const result = diff(a, b);
    expect(result.enums.added).toHaveLength(1);
    expect(result.enums.added[0].name).toBe('order_status');
    expect(result.enums.added[0].values).toEqual(['pending', 'paid', 'shipped']);
    expect(result.enums.removed).toHaveLength(0);
    expect(result.enums.modified).toHaveLength(0);
  });

  test('detects a removed enum', () => {
    const a = `Table users { id int [pk] }
Enum order_status {
  pending
  paid
}`;
    const b = `Table users { id int [pk] }`;
    const result = diff(a, b);
    expect(result.enums.removed).toHaveLength(1);
    expect(result.enums.removed[0].name).toBe('order_status');
    expect(result.enums.removed[0].values).toEqual(['pending', 'paid']);
    expect(result.enums.added).toHaveLength(0);
  });

  test('detects enum values added and removed', () => {
    const a = `Enum order_status {
  pending
  paid
  cancelled
}`;
    const b = `Enum order_status {
  pending
  paid
  shipped
}`;
    const result = diff(a, b);
    expect(result.enums.modified).toHaveLength(1);
    const m = result.enums.modified[0];
    expect(m.name).toBe('order_status');
    expect(m.valuesAdded).toEqual(['shipped']);
    expect(m.valuesRemoved).toEqual(['cancelled']);
    expect(m.values).toEqual(['pending', 'paid', 'shipped']);
  });

  test('reordering enum values is not a change', () => {
    const a = `Enum order_status {
  pending
  paid
  shipped
}`;
    const b = `Enum order_status {
  shipped
  pending
  paid
}`;
    const result = diff(a, b);
    expect(result.enums.modified).toHaveLength(0);
  });

  test('preserves schema-qualified enum names', () => {
    const a = `Enum dbo.order_status {
  pending
}`;
    const b = `Enum dbo.order_status {
  pending
  paid
}`;
    const result = diff(a, b);
    expect(result.enums.modified[0].name).toBe('dbo.order_status');
    expect(result.enums.modified[0].valuesAdded).toEqual(['paid']);
  });

  test('identical schemas produce empty enum diffs', () => {
    const s = `Table users { id int [pk] }
Enum order_status {
  pending
  paid
}`;
    const result = diff(s, s);
    expect(result.enums).toEqual({ added: [], removed: [], modified: [] });
  });

  test('strips DiagramView and TableGroup blocks before parsing', () => {
    const a = `Table users { id int [pk] }`;
    const b = `Table users { id int [pk] }

TableGroup "Dictionaries" [color: #000000] {
  users
}

DiagramView Default {
  *
}`;
    const result = diff(a, b);
    expect(result.counts).toEqual({ added: 0, removed: 0, modified: 0 });
  });
});

describe('ref diff', () => {
  const tables = `Table users { id int [pk] }
Table members { id int [pk] }
Table posts { id int [pk]
  uid int
  eid int }
`;

  test('detects an added ref', () => {
    const a = tables;
    const b = `${tables}Ref: posts.uid > users.id`;
    const result = diff(a, b);
    expect(result.refs.added).toHaveLength(1);
    expect(result.refs.added[0].from).toEqual({ table: 'posts', columns: ['uid'] });
    expect(result.refs.added[0].to).toEqual({ table: 'users', columns: ['id'] });
    expect(result.refs.removed).toHaveLength(0);
    expect(result.refs.retargeted).toHaveLength(0);
    expect(result.refs.unresolved).toHaveLength(0);
  });

  test('detects a removed ref', () => {
    const a = `${tables}Ref: posts.uid > users.id`;
    const b = tables;
    const result = diff(a, b);
    expect(result.refs.removed).toHaveLength(1);
    expect(result.refs.removed[0].from).toEqual({ table: 'posts', columns: ['uid'] });
    expect(result.refs.removed[0].to).toEqual({ table: 'users', columns: ['id'] });
    expect(result.refs.added).toHaveLength(0);
    expect(result.refs.retargeted).toHaveLength(0);
    expect(result.refs.unresolved).toHaveLength(0);
  });

  test('reports a retargeted ref instead of add + remove', () => {
    const a = `${tables}Ref: posts.uid > users.id`;
    const b = `${tables}Ref: posts.uid > members.id`;
    const result = diff(a, b);
    expect(result.refs.retargeted).toHaveLength(1);
    expect(result.refs.retargeted[0].from).toEqual({ table: 'posts', columns: ['uid'] });
    expect(result.refs.retargeted[0].oldTo).toEqual({ table: 'users', columns: ['id'] });
    expect(result.refs.retargeted[0].newTo).toEqual({ table: 'members', columns: ['id'] });
    expect(result.refs.added).toHaveLength(0);
    expect(result.refs.removed).toHaveLength(0);
    expect(result.refs.unresolved).toHaveLength(0);
  });

  test('reports ambiguous many-to-many ref changes as unresolved', () => {
    const a = `${tables}Ref: posts.uid > users.id`;
    const b = `${tables}Ref: posts.uid > members.id
Ref: posts.uid > posts.id`;
    // posts.uid retargets from {users} to two distinct parents {members, posts}.
    // There is no single 1-to-1 mapping, so it is surfaced as unresolved
    // rather than force-classified as one retarget.
    const result = diff(a, b);
    expect(result.refs.unresolved).toHaveLength(1);
    expect(result.refs.unresolved[0].from).toEqual({ table: 'posts', columns: ['uid'] });
    const oldTargets = result.refs.unresolved[0].oldTargets.map((t) => t.table);
    const newTargets = result.refs.unresolved[0].newTargets.map((t) => t.table).sort();
    expect(oldTargets).toEqual(['users']);
    expect(newTargets).toEqual(['members', 'posts']);
    expect(result.refs.retargeted).toHaveLength(0);
    expect(result.refs.added).toHaveLength(0);
    expect(result.refs.removed).toHaveLength(0);
  });
});
