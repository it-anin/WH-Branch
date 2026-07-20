import test from 'node:test';
import assert from 'node:assert/strict';

import { findIncompletePackTarget } from '../src/warehouseHelpers.js';
import {
  LEGACY_PICKLIST_RUN_ID,
  boxMatchesPicklistRuns,
  boxPicklistRunFields,
  buildPackItems,
  catalogPackStatus,
  catalogSig,
  createPicklistRunId,
  effectivePicklistRunKey,
  mergePicklistRun,
  samePicklistRun,
  stampPicklistRun,
  withBoxPicklistRunFields,
} from '../src/units.js';

const packer = { code: 'P1', name: 'พนักงาน 1' };
const baseCatalog = (runId, qty = 2) => [{
  sku: 'SKU-1', unit: 'ชิ้น', qty, barcode: '111', name: 'สินค้า 1',
  ...(runId ? { picklistRunId: runId, picklistRowId: `${runId}:1` } : {}),
}];
const closedBox = (id, runId, owner = packer) => ({
  id, status: 'closed', packer: owner,
  ...(runId ? { picklistRunId: runId } : {}),
});
const packedItem = (runId, gotBase = 2) => ({
  sku: 'SKU-1', unit: 'ชิ้น', qty: gotBase, gotBase,
  ...(runId ? { picklistRunId: runId } : {}),
});

test('fresh Picklist run is not completed by an older run with the same SKU and unit', () => {
  const catalog = baseCatalog('N-NEW');
  const boxes = [closedBox('BX-OLD', 'N-OLD')];
  const itemsByBox = { 'BX-OLD': [packedItem('N-OLD')] };

  assert.equal(buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap: {} })[0].need, 2);
  assert.deepEqual(catalogPackStatus({ catalog, boxes, itemsByBox, factorMap: {} }), [
    { needFull: 2, packed: 0, done: false },
  ]);
});

test('same-run closed box completes the active Picklist on PDA and Picklist view', () => {
  const catalog = baseCatalog('N-NEW');
  const boxes = [closedBox('BX-NEW', 'N-NEW')];
  const itemsByBox = { 'BX-NEW': [packedItem('N-NEW')] };

  assert.deepEqual(buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap: {} }), []);
  assert.deepEqual(catalogPackStatus({ catalog, boxes, itemsByBox, factorMap: {} }), [
    { needFull: 2, packed: 2, done: true },
  ]);
});

test('legacy catalog and legacy boxes keep old behavior without migration', () => {
  const catalog = baseCatalog(null);
  const boxes = [closedBox('BX-LEGACY', null)];
  const itemsByBox = { 'BX-LEGACY': [packedItem(null)] };

  assert.deepEqual(buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap: {} }), []);
  assert.equal(effectivePicklistRunKey(boxes[0], itemsByBox['BX-LEGACY'][0]), LEGACY_PICKLIST_RUN_ID);
});

test('legacy boxes do not decrement a post-update Picklist run', () => {
  const catalog = baseCatalog('N-NEW');
  const boxes = [closedBox('BX-LEGACY', null)];
  const itemsByBox = { 'BX-LEGACY': [packedItem(null)] };

  assert.equal(buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap: {} })[0].need, 2);
});

test('open or other-packer boxes never decrement the employee checklist', () => {
  const catalog = baseCatalog('N-1');
  const boxes = [
    { ...closedBox('BX-OPEN', 'N-1'), status: 'open' },
    closedBox('BX-OTHER', 'N-1', { code: 'P2' }),
  ];
  const itemsByBox = {
    'BX-OPEN': [packedItem('N-1')],
    'BX-OTHER': [packedItem('N-1')],
  };

  assert.equal(buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap: {} })[0].need, 2);
  assert.equal(catalogPackStatus({ catalog, boxes, itemsByBox, factorMap: {} })[0].done, true);
});

test('item-level run wins inside a mixed normal and urgent box', () => {
  const normal = { ...baseCatalog('N-1', 1)[0], picklistRowId: 'N-1:1' };
  const urgent = { ...baseCatalog('U-2', 1)[0], picklistRowId: 'U-2:1' };
  const box = { id: 'BX-MIX', status: 'closed', packer, picklistRunIds: ['N-1', 'U-2'] };
  const normalPacked = packedItem('N-1', 1);
  const urgentPacked = packedItem('U-2', 1);

  assert.equal(samePicklistRun(normal, box, normalPacked), true);
  assert.equal(samePicklistRun(normal, box, urgentPacked), false);
  assert.deepEqual(catalogPackStatus({
    catalog: [normal, urgent], boxes: [box], itemsByBox: { 'BX-MIX': [normalPacked, urgentPacked] }, factorMap: {},
  }).map(row => row.done), [true, true]);
});

test('run stamping creates stable row identities and identical uploads get a different signature', () => {
  const id1 = createPicklistRunId('normal', 1000, 'aaa');
  const id2 = createPicklistRunId('normal', 1001, 'bbb');
  const first = stampPicklistRun(baseCatalog(null), id1);
  const second = stampPicklistRun(baseCatalog(null), id2);

  assert.equal(first[0].picklistRunId, id1);
  assert.equal(first[0].picklistRowId, `${id1}:1`);
  assert.notEqual(catalogSig(first), catalogSig(second));
  assert.equal(catalogSig(first), catalogSig(stampPicklistRun(baseCatalog(null), id1)));
});

test('normal and urgent imports create independent runs with current replacement semantics', () => {
  const normalOld = { ...baseCatalog('N-OLD', 1)[0] };
  const urgentOld = { ...baseCatalog('U-OLD', 1)[0], urgent: true, branch: 'SSS' };
  const urgentNewSource = [{ ...baseCatalog(null, 3)[0], urgent: true, branch: 'SSS' }];

  const urgentUpdated = mergePicklistRun([normalOld, urgentOld], urgentNewSource, { urgent: true, runId: 'U-NEW' });
  assert.equal(urgentUpdated[0].picklistRunId, 'N-OLD');
  assert.equal(urgentUpdated[1].picklistRunId, 'U-NEW');
  assert.equal(urgentUpdated[1].qty, 3);

  const normalUpdated = mergePicklistRun(urgentUpdated, baseCatalog(null, 4), { urgent: false, runId: 'N-NEW' });
  assert.equal(normalUpdated.length, 1);
  assert.equal(normalUpdated[0].picklistRunId, 'N-NEW');
  assert.equal(normalUpdated[0].qty, 4);
});

test('box metadata supports homogeneous, mixed and legacy runs and detects stale open boxes', () => {
  assert.deepEqual(boxPicklistRunFields(baseCatalog('N-1')), { picklistRunId: 'N-1' });
  assert.deepEqual(boxPicklistRunFields([...baseCatalog('N-1'), ...baseCatalog('U-2')]), { picklistRunIds: ['N-1', 'U-2'] });
  assert.deepEqual(boxPicklistRunFields(baseCatalog(null)), {});

  const oldBox = { id: 'BX-1', status: 'open', picklistRunId: 'N-OLD' };
  assert.equal(boxMatchesPicklistRuns(oldBox, baseCatalog('N-NEW')), false);
  assert.equal(boxMatchesPicklistRuns({ ...oldBox, picklistRunId: 'N-NEW' }, baseCatalog('N-NEW')), true);
  assert.equal(boxMatchesPicklistRuns({ id: 'BX-L' }, baseCatalog(null)), true);

  assert.deepEqual(withBoxPicklistRunFields(
    { id: 'BX-MIX', picklistRunIds: ['N-1', 'U-2'] },
    baseCatalog('N-1'),
  ), { id: 'BX-MIX', picklistRunId: 'N-1' });
});

test('duplicate barcode selection does not cross normal and urgent runs', () => {
  const matchesBarcode = (item, barcode) => item.barcode === barcode;
  const catalog = [
    { ...baseCatalog('N-1', 1)[0], picklistRowId: 'N-1:1' },
    { ...baseCatalog('U-2', 1)[0], picklistRowId: 'U-2:1' },
  ];
  const items = [
    { ...catalog[0], need: 1, gotBase: 1 },
    { ...catalog[1], need: 1, gotBase: 0 },
  ];

  const found = findIncompletePackTarget(catalog, items, '111', matchesBarcode);
  assert.equal(found.itemIndex, 1);
  assert.equal(found.catalogItem.picklistRunId, 'U-2');
});
