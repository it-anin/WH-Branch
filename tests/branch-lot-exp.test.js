import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLotRows,
  buildReceiveLotExpMap,
  receiveBarcodePolicy,
  toBuddhistExpiry,
} from '../src/warehouseHelpers.js';

test('PDA uses the same multi-LOT rows as outbound export', () => {
  const item = {
    sku: 'SKU-LOT',
    barcode: 'FALLBACK',
    scannedUnit: 'กล่อง',
    scannedLots: [
      { lot: 'LOT-A', qty: 2, exp: '31/12/2027', scannedBarcode: '111', unit: 'กล่อง' },
      { lot: 'LOT-B', qty: 1, exp: '', scannedBarcode: '222', unit: 'ชิ้น' },
    ],
  };
  const lotMap = { 'SKU-LOT': [{ lot: 'LOT-B', exp: '30/06/2028' }] };

  assert.deepEqual(buildLotRows(item, lotMap), [
    { barcode: '111', qty: 2, lot: 'LOT-A', exp: '31/12/2027', unit: 'กล่อง' },
    { barcode: '222', qty: 1, lot: 'LOT-B', exp: '30/06/2028', unit: 'ชิ้น' },
  ]);
});

test('legacy boxes fall back to item LOT/EXP and lotMap safely', () => {
  const lotMap = { OLD: [{ lot: 'OLD-LOT', exp: '01/01/2029' }] };
  assert.deepEqual(buildLotRows({ sku: 'OLD', qty: 3, barcode: '999', unit: 'ชิ้น' }, lotMap), [
    { barcode: '999', qty: 3, lot: 'OLD-LOT', exp: '01/01/2029', unit: 'ชิ้น' },
  ]);
  assert.deepEqual(buildLotRows({ sku: 'OLD', qty: 1, lot: 'MANUAL', exp: '02/02/2030' }, lotMap), [
    { barcode: '', qty: 1, lot: 'MANUAL', exp: '02/02/2030', unit: '' },
  ]);
});

test('receiving combines duplicate SKU LOT/EXP without exposing quantities', () => {
  const items = [
    { sku: 'DUP', scannedLots: [{ lot: 'A', qty: 2, exp: '01/01/2028' }] },
    { sku: 'DUP', scannedLots: [{ lot: 'A', qty: 4, exp: '01/01/2028' }, { lot: 'B', qty: 1, exp: '' }] },
    { sku: 'NO-LOT', qty: 1 },
  ];
  const map = buildReceiveLotExpMap(items);

  assert.deepEqual(map.DUP, [
    { lot: 'A', exp: '01/01/2028' },
    { lot: 'B', exp: '' },
  ]);
  assert.deepEqual(map['NO-LOT'], []);
  assert.equal(Object.hasOwn(map.DUP[0], 'qty'), false);
});

test('expiry conversion remains unchanged for outbound Text export', () => {
  assert.equal(toBuddhistExpiry('31/12/2027'), '31/12/2570');
  assert.equal(toBuddhistExpiry('31/12/2570'), '31/12/2570');
  assert.equal(toBuddhistExpiry('ไม่ระบุ'), 'ไม่ระบุ');
  assert.equal(toBuddhistExpiry(''), '');
});

test('receiving accepts expensive carton barcodes but locks manual quantity entry', () => {
  const costMap = {
    '100335__กล่อง': 1050,
    '100445__กล่อง': 335,
  };

  assert.deepEqual(receiveBarcodePolicy(costMap, '100335', 'กล่อง'), {
    cost: 1050,
    scanAllowed: true,
    quantityEditable: false,
  });
  assert.deepEqual(receiveBarcodePolicy(costMap, '100445', 'กล่อง'), {
    cost: 335,
    scanAllowed: true,
    quantityEditable: true,
  });
});

test('receiving quantity threshold is strictly greater than 1000', () => {
  assert.equal(receiveBarcodePolicy({ 'SKU__กล่อง': 1000 }, 'SKU', 'กล่อง').quantityEditable, true);
  assert.equal(receiveBarcodePolicy({ 'SKU__กล่อง': 1000.01 }, 'SKU', 'กล่อง').quantityEditable, false);
});
