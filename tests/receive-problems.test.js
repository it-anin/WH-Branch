import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isReceiveProblemExpired,
  normalizeReceiveProblem,
  problemTypeLabels,
  receiveProblemId,
  receiveProblemRoute,
  upsertReceiveProblemList,
} from '../src/warehouseHelpers.js';

test('one box has one deterministic receive problem per SKU', () => {
  const first = normalizeReceiveProblem({
    boxId: 'BX/001',
    sku: 'SKU/01',
    name: 'สินค้าเดิม',
    types: ['damaged'],
    note: 'กล่องบุบ',
  }, 1000);
  const edited = normalizeReceiveProblem({
    ...first,
    name: 'สินค้าเดิม',
    types: ['damaged', 'other', 'damaged'],
    note: 'แก้หมายเหตุ',
    createdAt: first.createdAt,
  }, 2000);
  const list = upsertReceiveProblemList([first], edited);

  assert.equal(receiveProblemId('BX/001', 'SKU/01'), 'BX%2F001__SKU%2F01');
  assert.notEqual(receiveProblemId('BX__001', 'SKU'), receiveProblemId('BX', '001__SKU'));
  assert.equal(list.length, 1);
  assert.equal(list[0].note, 'แก้หมายเหตุ');
  assert.deepEqual(list[0].types, ['damaged', 'other']);
  assert.equal(list[0].createdAt, 1000);
  assert.equal(list[0].updatedAt, 2000);
});

test('receive problem keeps LOT/EXP and accepts only positive optional base quantity', () => {
  const valid = normalizeReceiveProblem({
    boxId: 'BX-1', sku: 'SKU-1', types: ['lot_exp_mismatch'], affectedQty: '3',
    lotExpRows: [{ lot: 'LOT-A', exp: '31/12/2027' }],
  }, 1000);
  const invalid = normalizeReceiveProblem({
    boxId: 'BX-1', sku: 'SKU-2', types: ['wrong_item'], affectedQty: '1.5',
  }, 1000);

  assert.equal(valid.affectedQty, 3);
  assert.deepEqual(valid.lotExpRows, [{ lot: 'LOT-A', exp: '31/12/2027' }]);
  assert.equal(invalid.affectedQty, null);
  assert.deepEqual(problemTypeLabels(['damaged', 'wrong_item']), ['ชำรุด', 'สินค้าผิด']);
});

test('receiving routes item drafts through count and recheck outcomes', () => {
  assert.deepEqual(receiveProblemRoute({ result: 'ok', hasProblems: false }), {
    action: 'receive_pending', problemStatus: null, problemType: null,
  });
  assert.deepEqual(receiveProblemRoute({ result: 'ok', hasProblems: true }), {
    action: 'submit_problem', problemStatus: 'submitted', problemType: 'item',
  });
  assert.deepEqual(receiveProblemRoute({ result: 'fail', hasProblems: true }), {
    action: 'pending_recheck', problemStatus: 'pending_recheck', problemType: 'incomplete',
  });
  assert.deepEqual(receiveProblemRoute({ result: 'over', recheckMode: true, isPharmacist: true, hasProblems: true }), {
    action: 'submit_problem', problemStatus: 'submitted', problemType: 'mixed',
  });
  assert.deepEqual(receiveProblemRoute({ result: 'fail', recheckMode: true, isPharmacist: true, hasProblems: false }), {
    action: 'submit_problem', problemStatus: null, problemType: 'incomplete',
  });
});

test('drafts survive retention while submitted/resolved problems expire after 30 days', () => {
  const now = new Date('2026-07-20T12:00:00.000Z');
  const boundary = new Date('2026-06-20T12:00:00.000Z').getTime();
  assert.equal(isReceiveProblemExpired({ status: 'draft', updatedAt: 1 }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'pending_recheck', updatedAt: 1 }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'submitted', submittedAt: boundary }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'resolved', resolvedAt: boundary - 1 }, now), true);
});
