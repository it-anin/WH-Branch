import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReceiveBoxScan } from '../src/warehouseHelpers.js';

const boxes = [
  { id: 'BX-1907-0001', pos: 'ONN 12345', branch: 'ONN' },
  { id: 'BX-1907-0002', pos: 'SSS 67890', branch: 'SSS' },
];

test('first receiving scan is queued instead of falsely reported missing before snapshots load', () => {
  const result = resolveReceiveBoxScan([], 'BX-1907-0002', { ready: false });
  assert.equal(result.status, 'loading');
});

test('queued receiving scan resolves after snapshots are ready', () => {
  const result = resolveReceiveBoxScan(boxes, 'BX-1907-0002', { ready: true });
  assert.equal(result.status, 'found');
  assert.equal(result.box.branch, 'SSS');
});

test('receiving lookup distinguishes Firestore load failure from a missing box', () => {
  const failed = resolveReceiveBoxScan([], 'BX-1907-0002', {
    ready: false,
    loadError: 'permission-denied',
  });
  assert.equal(failed.status, 'load-error');

  const missing = resolveReceiveBoxScan(boxes, 'BX-DOES-NOT-EXIST', { ready: true });
  assert.equal(missing.status, 'not-found');
});

test('receiving lookup remains compatible with space-insensitive POS scans', () => {
  const result = resolveReceiveBoxScan(boxes, 'SSS67890', { ready: true });
  assert.equal(result.status, 'found');
  assert.equal(result.box.id, 'BX-1907-0002');
});
