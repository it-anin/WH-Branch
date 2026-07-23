import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLotRows,
  calculateLotUsage,
  finalizePackedItemEdits,
  preparePackedItemsForEdit,
  resolveWarehouseScanParent,
} from '../src/warehouseHelpers.js';

test('multi-LOT edit round-trip preserves the original breakdown on a no-op save', () => {
  const source = [{
    sku: 'SKU-A', name: 'สินค้า A', unit: 'ชิ้น', qty: 3, got: 3, gotBase: 3,
    lot: 'LOT-B', exp: '02/02/2028', scannedBarcode: '222', scannedUnit: 'ชิ้น',
    picklistRowId: 'ROW-1', picklistRunId: 'RUN-1',
    scannedLots: [
      { lot: 'LOT-A', qty: 2, exp: '01/01/2028', scannedBarcode: '111', unit: 'ชิ้น' },
      { lot: 'LOT-B', qty: 1, exp: '02/02/2028', scannedBarcode: '222', unit: 'ชิ้น' },
    ],
  }];

  const editable = preparePackedItemsForEdit(source);
  assert.notStrictEqual(editable[0].scannedLots, source[0].scannedLots);
  assert.notStrictEqual(editable[0].scannedLots[0], source[0].scannedLots[0]);

  const saved = finalizePackedItemEdits(editable, { 'SKU-A__ชิ้น': 99 });
  assert.deepEqual(saved, source);
  assert.deepEqual(buildLotRows(saved[0]), [
    { barcode: '111', qty: 2, lot: 'LOT-A', exp: '01/01/2028', unit: 'ชิ้น' },
    { barcode: '222', qty: 1, lot: 'LOT-B', exp: '02/02/2028', unit: 'ชิ้น' },
  ]);
});

test('LOT/EXP-only edits preserve the packed base total even if today\'s factor map changed', () => {
  const source = [{
    sku: 'FACTOR', unit: 'กล่อง', qty: 2, got: 2, gotBase: 24,
    scannedLots: [{ lot: 'OLD', qty: 2, exp: '01/01/2028', scannedBarcode: '111', unit: 'กล่อง' }],
  }];
  const editable = preparePackedItemsForEdit(source);
  editable[0].scannedLots[0].lot = 'NEW';
  editable[0].scannedLots[0].exp = '02/02/2029';

  const [saved] = finalizePackedItemEdits(editable, { 'FACTOR__กล่อง': 10 });
  assert.equal(saved.gotBase, 24);
  assert.equal(saved.lot, 'NEW');
  assert.equal(saved.exp, '02/02/2029');
});

test('editing each LOT row updates nested data and recomputes scan/base totals', () => {
  const source = [{
    sku: 'SKU-A', name: 'สินค้า A', unit: 'กล่อง', qty: 3, got: 3, gotBase: 3,
    lot: 'LOT-B', exp: '02/02/2028', scannedBarcode: '222', scannedUnit: 'ชิ้น',
    scannedLots: [
      { lot: 'LOT-A', qty: 2, exp: '01/01/2028', scannedBarcode: '111', unit: 'ชิ้น' },
      { lot: 'LOT-B', qty: 1, exp: '02/02/2028', scannedBarcode: '222', unit: 'ชิ้น' },
    ],
  }];
  const editable = preparePackedItemsForEdit(source);
  editable[0].scannedLots[0] = {
    ...editable[0].scannedLots[0],
    lot: 'LOT-A-EDIT', exp: '11/11/2029', qty: 2, scannedBarcode: 'BOX-111', unit: 'กล่อง',
  };
  editable[0].scannedLots[1] = {
    ...editable[0].scannedLots[1],
    lot: 'LOT-B-EDIT', exp: '12/12/2030', qty: 1, scannedBarcode: 'PCS-222', unit: 'ชิ้น',
  };

  const [saved] = finalizePackedItemEdits(editable, { 'SKU-A__กล่อง': 12, 'SKU-A__ชิ้น': 1 });
  assert.equal(saved.qty, 3);
  assert.equal(saved.got, 3);
  assert.equal(saved.gotBase, 25);
  assert.equal(saved.unit, 'กล่อง', 'outer Picklist unit must not be overwritten');
  assert.deepEqual(saved.scannedLots, [
    { lot: 'LOT-A-EDIT', qty: 2, exp: '11/11/2029', scannedBarcode: 'BOX-111', unit: 'กล่อง' },
    { lot: 'LOT-B-EDIT', qty: 1, exp: '12/12/2030', scannedBarcode: 'PCS-222', unit: 'ชิ้น' },
  ]);
  assert.equal(saved.lot, 'LOT-B-EDIT');
  assert.equal(saved.exp, '12/12/2030');
  assert.equal(saved.scannedBarcode, 'PCS-222');
  assert.equal(saved.scannedUnit, 'ชิ้น');
});

test('legacy flat item remains unchanged on no-op and uses factor 1 when edited without scannedUnit', () => {
  const source = [{
    sku: 'LEGACY', name: 'สินค้าเก่า', unit: 'กล่อง', qty: 2, got: 2, gotBase: 2,
    lot: 'OLD-LOT', exp: '01/01/2027', scannedBarcode: '999',
  }];
  const editable = preparePackedItemsForEdit(source);
  const noOp = finalizePackedItemEdits(editable, { 'LEGACY__กล่อง': 12 });
  assert.deepEqual(JSON.parse(JSON.stringify(noOp)), source);

  editable[0].scannedLots[0].qty = 3;
  const [changed] = finalizePackedItemEdits(editable, { 'LEGACY__กล่อง': 12 });
  assert.equal(changed.qty, 3);
  assert.equal(changed.gotBase, 3);
  assert.equal(changed.scannedLots[0].unit, '');
});

test('duplicate LOT+unit rows merge, conflicting EXP is blocked, and different units stay separate', () => {
  const source = [{
    sku: 'DUP', unit: 'ชิ้น', qty: 3, got: 3, gotBase: 3,
    scannedLots: [
      { lot: 'LOT-A', qty: 1, exp: '01/01/2028', scannedBarcode: '111', unit: 'ชิ้น' },
      { lot: 'LOT-B', qty: 2, exp: '01/01/2028', scannedBarcode: '222', unit: 'ชิ้น' },
    ],
  }];
  const editable = preparePackedItemsForEdit(source);
  editable[0].scannedLots[1].lot = 'LOT-A';
  const [merged] = finalizePackedItemEdits(editable, {});
  assert.deepEqual(merged.scannedLots, [
    { lot: 'LOT-A', qty: 3, exp: '01/01/2028', scannedBarcode: '222', unit: 'ชิ้น' },
  ]);

  const conflicting = preparePackedItemsForEdit(source);
  conflicting[0].scannedLots[1].lot = 'LOT-A';
  conflicting[0].scannedLots[1].exp = '02/02/2029';
  assert.throws(
    () => finalizePackedItemEdits(conflicting, {}),
    error => error?.code === 'conflicting-lot-exp',
  );

  const differentUnits = preparePackedItemsForEdit(source);
  differentUnits[0].scannedLots[1].lot = 'LOT-A';
  differentUnits[0].scannedLots[1].unit = 'กล่อง';
  const [separate] = finalizePackedItemEdits(differentUnits, { 'DUP__กล่อง': 12 });
  assert.equal(separate.scannedLots.length, 2);
  assert.equal(separate.gotBase, 25);
});

test('deleting one LOT preserves siblings and deleting every LOT removes only that parent item', () => {
  const source = [
    {
      sku: 'A', qty: 3, got: 3, gotBase: 3,
      scannedLots: [{ lot: 'A1', qty: 1, unit: 'ชิ้น' }, { lot: 'A2', qty: 2, unit: 'ชิ้น' }],
    },
    { sku: 'B', qty: 1, got: 1, gotBase: 1, scannedLots: [{ lot: 'B1', qty: 1, unit: 'ชิ้น' }] },
  ];
  const oneDeleted = preparePackedItemsForEdit(source);
  oneDeleted[0].scannedLots.splice(0, 1);
  const saved = finalizePackedItemEdits(oneDeleted, {});
  assert.deepEqual(saved.map(item => item.sku), ['A', 'B']);
  assert.deepEqual(saved[0].scannedLots.map(entry => entry.lot), ['A2']);
  assert.equal(saved[0].qty, 2);

  const allDeleted = preparePackedItemsForEdit(source);
  allDeleted[0].scannedLots = [];
  assert.deepEqual(finalizePackedItemEdits(allDeleted, {}).map(item => item.sku), ['B']);
});

test('LOT usage counts every LOT/unit entry instead of assigning the parent total to the latest LOT', () => {
  const boxes = [
    { id: 'CLOSED', status: 'closed' },
    { id: 'LEGACY', status: 'exported' },
    { id: 'OPEN', status: 'open' },
  ];
  const itemsByBox = {
    CLOSED: [{
      sku: 'SKU-A', qty: 3, lot: 'LOT-B', scannedUnit: 'ชิ้น',
      scannedLots: [
        { lot: 'LOT-A', qty: 2, unit: 'กล่อง' },
        { lot: 'LOT-B', qty: 1, unit: 'ชิ้น' },
      ],
    }],
    LEGACY: [{ sku: 'OLD', qty: 2, lot: 'OLD-LOT', unit: 'กล่อง' }],
    OPEN: [{ sku: 'IGNORED', qty: 99, lot: 'NOPE', scannedUnit: 'ชิ้น' }],
  };
  const currentItems = [{
    sku: 'SKU-A', got: 1, lot: 'LOT-A', scannedUnit: 'ชิ้น',
    scannedLots: [{ lot: 'LOT-A', qty: 1, unit: 'ชิ้น' }],
  }];

  assert.deepEqual(calculateLotUsage({
    boxes,
    itemsByBox,
    currentItems,
    factorMap: { 'SKU-A__กล่อง': 12, 'SKU-A__ชิ้น': 1, 'OLD__กล่อง': 12 },
  }), {
    'SKU-A__LOT-A': 25,
    'SKU-A__LOT-B': 1,
    'OLD__OLD-LOT': 2,
  });
});

test('warehouse add-scan keeps a unique SKU parent and blocks ambiguous duplicate Picklist rows', () => {
  const oneParent = [{
    sku: 'SKU-A', unit: 'กล่อง', picklistRowId: 'ROW-1',
    scannedLots: [{ lot: 'LOT-A', qty: 1, unit: 'ชิ้น' }],
  }];
  assert.deepEqual(resolveWarehouseScanParent(oneParent, 'SKU-A', 'กล่อง'), { index: 0, ambiguous: false });

  const duplicateParents = [
    ...oneParent,
    { sku: 'SKU-A', unit: 'ชิ้น', picklistRowId: 'ROW-2', scannedLots: [{ lot: 'LOT-B', qty: 1, unit: 'ชิ้น' }] },
  ];
  assert.deepEqual(resolveWarehouseScanParent(duplicateParents, 'SKU-A', 'กล่อง'), { index: 0, ambiguous: false });
  assert.deepEqual(resolveWarehouseScanParent(duplicateParents, 'SKU-A', 'ชิ้น'), { index: -1, ambiguous: true });
  assert.deepEqual(resolveWarehouseScanParent(duplicateParents, 'NEW', 'ชิ้น'), { index: -1, ambiguous: false });
});
