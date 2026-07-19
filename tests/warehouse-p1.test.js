import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adjustPackedItem,
  aggregateReceiveItems,
  assignZoneExclusively,
  buildReceiveDifferences,
  buildTopLevelFieldPatch,
  computeCatalogByPacker,
  findIncompletePackTarget,
  normalizeExclusiveZoneAssignments,
} from '../src/warehouseHelpers.js';
import { resolvePackPicklistDisplay } from '../src/units.js';

const matchesBarcode = (item, barcode) =>
  String(item.barcode || '').split(',').map(value => value.trim()).includes(barcode);

test('packing selects the next incomplete duplicate SKU+unit row in order', () => {
  const catalog = Array.from({ length: 3 }, () => ({ sku: 'SKU-1', unit: 'ชิ้น', barcode: '8850001' }));
  let items = [
    { sku: 'SKU-1', unit: 'ชิ้น', need: 1, gotBase: 1 },
    { sku: 'SKU-1', unit: 'ชิ้น', need: 2, gotBase: 0 },
    { sku: 'SKU-1', unit: 'ชิ้น', need: 1, gotBase: 0 },
  ];

  let found = findIncompletePackTarget(catalog, items, '8850001', matchesBarcode);
  assert.equal(found.itemIndex, 1);
  items = items.map((item, index) => index === found.itemIndex ? { ...item, gotBase: 2 } : item);
  found = findIncompletePackTarget(catalog, items, '8850001', matchesBarcode);
  assert.equal(found.itemIndex, 2);
  items = items.map((item, index) => index === found.itemIndex ? { ...item, gotBase: 1 } : item);
  assert.equal(findIncompletePackTarget(catalog, items, '8850001', matchesBarcode), null);
});

test('urgent-only packer sees the urgent Picklist branch instead of normal catalog metadata', () => {
  const display = resolvePackPicklistDisplay(
    [
      { sku: 'URG-1', urgent: true, branch: 'SSS' },
      { sku: 'URG-2', urgent: true, branch: 'SSS' },
    ],
    { branch: 'ONN', fileDate: '19/7/2026' },
  );

  assert.equal(display.label, 'Picklist_SSS_เบิกด่วน');
  assert.equal(display.branch, 'SSS');
  assert.equal(display.fileDate, null);
  assert.equal(display.mixed, false);
});

test('urgent Picklist display uses its own filename and date metadata', () => {
  const display = resolvePackPicklistDisplay(
    [{ sku: 'URG-1', urgent: true, branch: 'SSS' }],
    {
      branch: 'ONN',
      fileDate: '18/7/2026',
      urgent: {
        branch: 'SSS',
        fileDate: '19/7/2026',
        fileName: 'Picklist_SSS_เบิกด่วน_19072026',
      },
    },
  );

  assert.equal(display.label, 'Picklist_SSS_เบิกด่วน_19072026');
  assert.equal(display.fileDate, '19/7/2026');
});

test('mixed normal and urgent assignment never presents itself as one normal Picklist', () => {
  const display = resolvePackPicklistDisplay(
    [
      { sku: 'NORMAL-1' },
      { sku: 'URG-1', urgent: true, branch: 'SSS' },
    ],
    { branch: 'ONN', fileDate: '19/7/2026' },
  );

  assert.equal(display.label, 'หลาย Picklist');
  assert.equal(display.mixed, true);
});

test('receiving aggregates duplicate SKU rows before exact/short/over checks', () => {
  const rows = [
    { sku: 'SKU-1', name: 'สินค้า A', gotBase: 12, barcode: '111' },
    { sku: 'SKU-1', name: 'สินค้า A', gotBase: 6, scannedBarcode: '222' },
    { sku: 'SKU-2', name: 'สินค้า B', qty: 2 },
  ];
  const aggregated = aggregateReceiveItems(rows);
  assert.equal(aggregated.length, 2);
  assert.equal(aggregated[0].gotBase, 18);
  assert.equal(aggregated[0].barcode, '111,222');

  assert.deepEqual(buildReceiveDifferences(rows, { 'SKU-1': 18, 'SKU-2': 2 }), []);
  assert.deepEqual(
    buildReceiveDifferences(rows, { 'SKU-1': 17, 'SKU-2': 3 }).map(({ sku, diff }) => ({ sku, diff })),
    [{ sku: 'SKU-1', diff: 1 }, { sku: 'SKU-2', diff: -1 }],
  );
});

test('warehouse +/- updates only the clicked row and keeps base quantity in sync', () => {
  const rows = [
    { sku: 'SKU-1', unit: 'ชิ้น', scannedUnit: 'ชิ้น', qty: 2, got: 2, gotBase: 2, scannedLots: [{ lot: 'A', qty: 2, unit: 'ชิ้น' }] },
    { sku: 'SKU-1', unit: 'กล่อง', scannedUnit: 'กล่อง', qty: 1, got: 1, gotBase: 12, scannedLots: [{ lot: 'B', qty: 1, unit: 'กล่อง' }] },
  ];
  const factorMap = { 'SKU-1__ชิ้น': 1, 'SKU-1__กล่อง': 12 };
  const next = adjustPackedItem(rows, 1, 1, factorMap);
  assert.equal(next[0], rows[0]);
  assert.deepEqual(
    { qty: next[1].qty, got: next[1].got, gotBase: next[1].gotBase, lotQty: next[1].scannedLots[0].qty },
    { qty: 2, got: 2, gotBase: 24, lotQty: 2 },
  );
});

test('warehouse +/- uses latest LOT/unit entry as LIFO', () => {
  const row = {
    sku: 'SKU-1', unit: 'โหล', qty: 3, got: 3, gotBase: 14,
    scannedLots: [
      { lot: 'LOT-A', qty: 1, unit: 'โหล' },
      { lot: 'LOT-B', qty: 2, unit: 'ชิ้น' },
    ],
  };
  const factorMap = { 'SKU-1__โหล': 12, 'SKU-1__ชิ้น': 1 };
  const minusOne = adjustPackedItem([row], 0, -1, factorMap)[0];
  assert.deepEqual(minusOne.scannedLots.map(({ lot, qty }) => ({ lot, qty })), [
    { lot: 'LOT-A', qty: 1 },
    { lot: 'LOT-B', qty: 1 },
  ]);
  assert.deepEqual({ qty: minusOne.qty, got: minusOne.got, gotBase: minusOne.gotBase }, { qty: 2, got: 2, gotBase: 13 });

  const minusAgain = adjustPackedItem([minusOne], 0, -1, factorMap)[0];
  assert.deepEqual(minusAgain.scannedLots.map(({ lot, qty }) => ({ lot, qty })), [{ lot: 'LOT-A', qty: 1 }]);
  assert.deepEqual({ qty: minusAgain.qty, got: minusAgain.got, gotBase: minusAgain.gotBase }, { qty: 1, got: 1, gotBase: 12 });
});

test('warehouse +/- keeps legacy rows without scannedUnit on factor 1', () => {
  const legacy = { sku: 'SKU-OLD', unit: 'โหล', qty: 2, got: 2 };
  const adjusted = adjustPackedItem([legacy], 0, 1, { 'SKU-OLD__โหล': 12 })[0];
  assert.deepEqual({ qty: adjusted.qty, got: adjusted.got, gotBase: adjusted.gotBase }, { qty: 3, got: 3, gotBase: 3 });
  assert.equal(adjusted.scannedLots[0].unit, '');
});

test('zone distribution gives unassigned staff zero items and never duplicates rows', () => {
  const packers = [{ code: 'P1' }, { code: 'P2' }, { code: 'P3' }];
  const catalog = [
    { sku: 'A', location: 'A01' },
    { sku: 'B', location: 'B01' },
  ];
  const distributed = computeCatalogByPacker(catalog, { P1: ['A'], P2: ['A', 'B'], P3: [] }, packers);
  assert.deepEqual(distributed.P1.map(item => item.sku), ['A']);
  assert.deepEqual(distributed.P2.map(item => item.sku), ['B']);
  assert.deepEqual(distributed.P3, []);
  assert.equal(Object.values(distributed).flat().length, catalog.length);

  const exclusive = assignZoneExclusively({ P1: ['A'], P2: [], P3: [] }, 'P2', 'A', true);
  assert.deepEqual(exclusive, { P1: [], P2: ['A'], P3: [] });
  assert.deepEqual(
    normalizeExclusiveZoneAssignments({ P1: ['A'], P2: ['A', 'B'], P3: [] }, packers),
    { P1: ['A'], P2: ['B'], P3: [] },
  );
});

test('top-level Firestore patches preserve fields changed by another client', () => {
  const base = { id: 'BX-1', status: 'exported', note: '', receivingBy: null, updated: '10:00' };
  const deleteSentinel = Symbol('delete');
  const notePatch = buildTopLevelFieldPatch(base, { ...base, note: 'ตรวจแล้ว' }, deleteSentinel);
  const receivingPatch = buildTopLevelFieldPatch(base, { ...base, receivingBy: { code: 'S01' } }, deleteSentinel);
  assert.deepEqual(notePatch, { note: 'ตรวจแล้ว' });
  assert.deepEqual(receivingPatch, { receivingBy: { code: 'S01' } });
  assert.deepEqual({ ...base, ...notePatch, ...receivingPatch }, {
    ...base,
    note: 'ตรวจแล้ว',
    receivingBy: { code: 'S01' },
  });

  const removedPatch = buildTopLevelFieldPatch(base, { ...base, note: undefined }, deleteSentinel);
  assert.equal(removedPatch.note, deleteSentinel);
});
