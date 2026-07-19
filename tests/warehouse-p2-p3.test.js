import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_RETENTION_DAYS,
  filterTodayBoxes,
  historyCutoff,
  isHistoryExpired,
} from '../src/warehouseHelpers.js';

const boxes = [
  { id: 'BX-1907-0001', pos: 'POS-AbC', branch: 'SSS' },
  { id: 'BX-1907-0002', pos: 'POS-XYZ', branch: 'BBB' },
];
const itemsByBox = {
  'BX-1907-0001': [{ sku: 'Sku-One', name: 'ยาพารา TEST', barcode: '885ABC', scannedLots: [{ scannedBarcode: 'LOT-BAR-1' }] }],
  'BX-1907-0002': [{ sku: 'SKU-TWO', name: 'สินค้า B', scannedBarcode: '999XYZ' }],
};

test('today box search is case-insensitive across Box ID, POS, SKU, barcode and name', () => {
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, 'bx-1907-0001').map(box => box.id), ['BX-1907-0001']);
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, 'pos-abc').map(box => box.id), ['BX-1907-0001']);
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, 'sku-one').map(box => box.id), ['BX-1907-0001']);
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, '885abc').map(box => box.id), ['BX-1907-0001']);
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, 'lot-bar-1').map(box => box.id), ['BX-1907-0001']);
  assert.deepEqual(filterTodayBoxes(boxes, itemsByBox, 'พารา test').map(box => box.id), ['BX-1907-0001']);
});

test('search respects the branch-filtered input and does not change its source list', () => {
  const branchBoxes = boxes.filter(box => box.branch === 'SSS');
  assert.deepEqual(filterTodayBoxes(branchBoxes, itemsByBox, '999xyz'), []);
  assert.equal(branchBoxes.length, 1);
});

test('history keeps the exact 30-day boundary and expires anything older', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');
  const cutoff = historyCutoff(now, HISTORY_RETENTION_DAYS);
  assert.equal(cutoff.toISOString(), '2026-06-19T12:00:00.000Z');
  assert.equal(isHistoryExpired('2026-06-19T12:00:00.000Z', now), false);
  assert.equal(isHistoryExpired('2026-06-19T11:59:59.999Z', now), true);
  assert.equal(isHistoryExpired('2026-06-19T12:00:00.001Z', now), false);
});
