import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isReceiveVerificationComplete,
  isReceiveProblemExpired,
  notifyWarehouseReceiveProblems,
  normalizeReceiveProblem,
  problemTypeLabels,
  receiveProblemBoxAction,
  receiveProblemId,
  receiveProblemRoute,
  receiveProblemSkuFromId,
  selectHistoryReceiveProblems,
  selectProblemHistoryBoxes,
  selectWarehouseReceiveProblems,
  upsertReceiveProblemList,
} from '../src/warehouseHelpers.js';

test('history problem viewer keeps evidence for one box in report order', () => {
  const problems = [
    { id: 'other', boxId: 'BX-OTHER', sku: 'X', createdAt: 1, image: 'data:image/jpeg;base64,other' },
    { id: 'second', boxId: 'BX-OLD', sku: 'B', createdAt: 200, image: null },
    { id: 'first', boxId: 'BX-OLD', sku: 'A', createdAt: 100, image: 'data:image/jpeg;base64,evidence' },
  ];

  const selected = selectHistoryReceiveProblems(problems, ' BX-OLD ');
  assert.deepEqual(selected.map(problem => problem.id), ['first', 'second']);
  assert.equal(selected[0].image, 'data:image/jpeg;base64,evidence');
  assert.deepEqual(selectHistoryReceiveProblems(problems, ''), []);
});

test('problem history index combines live and archived problem boxes without duplicates', () => {
  const archived = {
    clearedAt: '2026-08-04T17:00:00.000Z',
    boxes: [
      { id: 'BX-OLD', problemReviewed: true, problemCount: 2, closedAt: 100 },
      { id: 'BX-CLEAN', problemReviewed: false, closedAt: 200 },
      { id: 'BX-DUP', problemReviewed: true, branch: 'OLD', closedAt: 300 },
    ],
  };
  const live = [
    { id: 'BX-LIVE', problemIds: ['BX-LIVE__SKU'], closedAt: 400 },
    { id: 'BX-DUP', problemResolved: true, branch: 'NEW', closedAt: 500 },
    { id: 'BX-NORMAL', closedAt: 600 },
  ];

  const problems = [
    { id: 'P-ORPHAN', boxId: 'BX-ORPHAN', status: 'submitted', updatedAt: 700 },
    { id: 'P-RESOLVED', boxId: 'BX-DUP', status: 'resolved', resolvedAt: 800 },
    { id: 'P-DRAFT', boxId: 'BX-DRAFT', status: 'draft', updatedAt: 900 },
  ];

  const selected = selectProblemHistoryBoxes(live, [archived], problems);
  assert.deepEqual(selected.map(box => box.id), ['BX-DUP', 'BX-ORPHAN', 'BX-LIVE', 'BX-OLD']);
  assert.equal(selected[0].branch, 'NEW', 'live metadata must be retained when problem documents are merged');
  assert.equal(selected[0].problemResolved, true);
  assert.equal(selected[1].problemCount, 1, 'orphan problem documents must remain discoverable by Box ID');
  assert.equal(selected[3].historyClearedAt, archived.clearedAt);
});

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

test('reviewed problems wait for warehouse instead of reopening Android recheck', () => {
  assert.equal(receiveProblemBoxAction({
    problemReported: true,
    problemResolved: false,
    problemReviewed: true,
    problemType: 'incomplete',
  }), 'wait_warehouse');
  assert.equal(receiveProblemBoxAction({
    problemReported: true,
    problemResolved: false,
    problemReviewed: false,
    problemType: 'incomplete',
  }), 'recheck');
  assert.equal(receiveProblemBoxAction({
    problemReported: true,
    problemResolved: true,
    problemReviewed: true,
    problemType: 'incomplete',
  }), 'continue');
});

test('zero-target recheck completes after the latest warehouse data removes every count difference', () => {
  assert.equal(isReceiveVerificationComplete({
    recheckMode: true,
    verifyItems: [],
    scanCounts: {},
  }), true);
  assert.equal(isReceiveVerificationComplete({
    recheckMode: false,
    verifyItems: [],
    scanCounts: {},
  }), false);
  assert.equal(isReceiveVerificationComplete({
    recheckMode: true,
    verifyItems: [{ sku: 'SKU-1', gotBase: 2 }],
    scanCounts: { 'SKU-1': 1 },
  }), false);
  assert.equal(isReceiveVerificationComplete({
    recheckMode: true,
    verifyItems: [{ sku: 'SKU-1', gotBase: 2 }],
    scanCounts: { 'SKU-1': 2 },
  }), true);
});

test('warehouse accepts reviewed legacy pending problems but not unreviewed or draft problems', () => {
  const first = normalizeReceiveProblem({
    boxId: 'BX-LEGACY', sku: 'SKU_1', types: ['damaged'], status: 'pending_recheck',
  }, 1000);
  const second = normalizeReceiveProblem({
    boxId: 'BX-LEGACY', sku: 'SKU-2', types: ['wrong_item'], status: 'submitted',
  }, 1000);
  const draft = normalizeReceiveProblem({
    boxId: 'BX-LEGACY', sku: 'SKU-3', types: ['other'], status: 'draft',
  }, 1000);
  const box = {
    id: 'BX-LEGACY',
    problemIds: [first.id, second.id, draft.id],
    problemCount: 3,
  };

  const unreviewed = selectWarehouseReceiveProblems(box, [first, second, draft]);
  assert.deepEqual(unreviewed.problems.map(problem => problem.id), [second.id]);
  assert.deepEqual(unreviewed.missingIds, [first.id, draft.id]);
  assert.equal(unreviewed.complete, false);

  const reviewed = selectWarehouseReceiveProblems(
    { ...box, problemReviewed: true },
    [first, second, draft],
  );
  assert.deepEqual(reviewed.problems.map(problem => problem.id), [first.id, second.id]);
  assert.deepEqual(reviewed.missingIds, [draft.id]);
  assert.equal(reviewed.complete, false);
  assert.equal(receiveProblemSkuFromId(first.id), 'SKU_1');
});

test('warehouse completeness follows exact problem ids instead of unrelated document count', () => {
  const expectedFirst = normalizeReceiveProblem({
    boxId: 'BX-EXACT', sku: 'SKU-1', types: ['damaged'], status: 'submitted',
  }, 1000);
  const expectedMissing = normalizeReceiveProblem({
    boxId: 'BX-EXACT', sku: 'SKU-2', types: ['wrong_item'], status: 'submitted',
  }, 1000);
  const unrelated = normalizeReceiveProblem({
    boxId: 'BX-EXACT', sku: 'SKU-X', types: ['other'], status: 'submitted',
  }, 1000);
  const state = selectWarehouseReceiveProblems({
    id: 'BX-EXACT',
    problemReviewed: true,
    problemIds: [expectedFirst.id, expectedMissing.id],
    problemCount: 2,
  }, [expectedFirst, unrelated]);

  assert.deepEqual(state.problems.map(problem => problem.id), [expectedFirst.id]);
  assert.deepEqual(state.missingIds, [expectedMissing.id]);
  assert.equal(state.expectedCount, 2);
  assert.equal(state.missingCount, 1);
  assert.equal(state.complete, false);
});

test('notifying warehouse submits every expected pending problem with the box atomically', async () => {
  const first = normalizeReceiveProblem({
    boxId: 'BX-NOTIFY', sku: 'SKU-1', types: ['damaged'], status: 'pending_recheck',
  }, 1000);
  const second = normalizeReceiveProblem({
    boxId: 'BX-NOTIFY', sku: 'SKU-2', types: ['wrong_item'], status: 'pending_recheck',
  }, 1000);
  const box = {
    id: 'BX-NOTIFY',
    problemReviewed: false,
    problemIds: [first.id, second.id],
    problemCount: 2,
  };
  const calls = [];

  const result = await notifyWarehouseReceiveProblems({
    box,
    problemNote: 'ส่งให้คลังแก้ 2 รายการ',
    loadReceiveProblems: async boxId => {
      assert.equal(boxId, box.id);
      return [first, second];
    },
    commitReceiveOutcome: async (...args) => {
      calls.push(args);
      return args[2].map(problem => ({ ...problem, status: args[3] }));
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], box.id);
  assert.deepEqual(calls[0][1], {
    problemNote: 'ส่งให้คลังแก้ 2 รายการ',
    problemReviewed: true,
  });
  assert.deepEqual(calls[0][2].map(problem => problem.id), [first.id, second.id]);
  assert.equal(calls[0][3], 'submitted');
  assert.deepEqual(result.savedProblems.map(problem => problem.status), ['submitted', 'submitted']);
});

test('warehouse notification blocks missing expected problems and propagates commit failures for retry', async () => {
  const first = normalizeReceiveProblem({
    boxId: 'BX-RETRY', sku: 'SKU-1', types: ['damaged'], status: 'pending_recheck',
  }, 1000);
  const second = normalizeReceiveProblem({
    boxId: 'BX-RETRY', sku: 'SKU-2', types: ['wrong_item'], status: 'pending_recheck',
  }, 1000);
  const box = {
    id: 'BX-RETRY',
    problemIds: [first.id, second.id],
    problemCount: 2,
  };
  let commitCalls = 0;

  await assert.rejects(
    notifyWarehouseReceiveProblems({
      box,
      loadReceiveProblems: async () => [first],
      commitReceiveOutcome: async () => { commitCalls += 1; },
    }),
    error => error.code === 'receive-problems-incomplete'
      && error.problemState.missingIds[0] === second.id,
  );
  assert.equal(commitCalls, 0);

  await assert.rejects(
    notifyWarehouseReceiveProblems({
      box,
      loadReceiveProblems: async () => [first, second],
      commitReceiveOutcome: async () => {
        commitCalls += 1;
        throw new Error('firestore-offline');
      },
    }),
    /firestore-offline/,
  );
  assert.equal(commitCalls, 1);
});

test('drafts survive retention while submitted/resolved problems expire after 30 days', () => {
  const now = new Date('2026-07-20T12:00:00.000Z');
  const boundary = new Date('2026-06-20T12:00:00.000Z').getTime();
  assert.equal(isReceiveProblemExpired({ status: 'draft', updatedAt: 1 }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'pending_recheck', updatedAt: 1 }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'submitted', submittedAt: boundary }, now), false);
  assert.equal(isReceiveProblemExpired({ status: 'resolved', resolvedAt: boundary - 1 }, now), true);
});
