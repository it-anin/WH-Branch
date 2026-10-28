import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLEAR_BLOCKER_KINDS,
  buildClearBlockedMessage,
  classifyClearBlocker,
  countReceiveExemptBoxes,
  describeClearBlockers,
  isReceiveExemptBox,
  summarizeClearBlockers,
} from '../src/warehouseHelpers.js';

// progress โหลดแล้ว + ไม่มีลังไหนมีของสแกนค้าง — บริบทปกติของ Desktop คลังที่หน้ารายการลัง
const loaded = { itemsByBox: {}, scanProgress: {}, progressLoaded: true };

test('Clear is allowed when every box was already received by the branch', () => {
  const boxes = [
    { id: 'BX-2810-0001', status: 'received' },
    { id: 'BX-2810-0002', status: 'received', receivePending: false },
  ];
  assert.deepEqual(summarizeClearBlockers(boxes, loaded), { total: 0, groups: [] });
});

test('end-of-day Clear still works when the only leftover is the empty box Desktop auto-opened', () => {
  const boxes = [
    { id: 'BX-2810-0001', status: 'received' },
    { id: 'BX-2810-0002', status: 'open' },
  ];
  assert.equal(classifyClearBlocker(boxes[1], loaded), null);
  assert.equal(summarizeClearBlockers(boxes, loaded).total, 0);
});

test('boxes the branch has not received block Clear under the right kind', () => {
  assert.equal(classifyClearBlocker({ id: 'A', status: 'closed' }, loaded), 'closed');
  assert.equal(classifyClearBlocker({ id: 'B', status: 'exported' }, loaded), 'exported');
  assert.equal(classifyClearBlocker({ id: 'C', status: 'exported', receivePending: true }, loaded), 'pending');
  assert.equal(
    classifyClearBlocker({ id: 'D', status: 'exported', problemReported: true, problemResolved: false }, loaded),
    'problem',
  );
});

test('a box counts once, under the most urgent kind', () => {
  // ปัญหาที่ยังไม่แก้ชนะ receivePending; แก้แล้ว (problemResolved) ถอยกลับไปเป็น pending/exported
  const problemAndPending = { id: 'A', status: 'exported', receivePending: true, problemReported: true, problemResolved: false };
  const resolvedAndPending = { ...problemAndPending, problemResolved: true };
  const resolvedOnly = { id: 'B', status: 'exported', problemReported: true, problemResolved: true };
  assert.equal(classifyClearBlocker(problemAndPending, loaded), 'problem');
  assert.equal(classifyClearBlocker(resolvedAndPending, loaded), 'pending');
  assert.equal(classifyClearBlocker(resolvedOnly, loaded), 'exported');
});

test('an open box with scanned items blocks Clear but zero-count progress does not', () => {
  const open = { id: 'BX-2810-0003', status: 'open' };
  assert.equal(
    classifyClearBlocker(open, { ...loaded, scanProgress: { [open.id]: [{ sku: '1', got: 2 }] } }),
    'packing',
  );
  assert.equal(
    classifyClearBlocker(open, { ...loaded, scanProgress: { [open.id]: [{ sku: '1', got: 0 }] } }),
    null,
  );
  assert.equal(
    classifyClearBlocker({ ...open, status: 'packing' }, { ...loaded, scanProgress: { [open.id]: [{ sku: '1', gotBase: 12 }] } }),
    'packing',
  );
});

test('an open box that already has saved items is never treated as empty', () => {
  const open = { id: 'BX-2810-0004', status: 'open' };
  const withItems = { itemsByBox: { [open.id]: [{ sku: '1', qty: 1 }] }, scanProgress: {}, progressLoaded: false };
  assert.equal(classifyClearBlocker(open, withItems), 'packing');
});

test('open boxes stay locked until progress has loaded (fail-safe, never guess empty)', () => {
  const open = { id: 'BX-2810-0005', status: 'open' };
  const notLoaded = { itemsByBox: {}, scanProgress: {}, progressLoaded: false };
  assert.equal(classifyClearBlocker(open, notLoaded), 'checking');
  assert.equal(classifyClearBlocker(open), 'checking');
  // ลังที่ไม่ใช่ open ไม่ต้องรอ progress — ตัดสินจาก status ได้เลย
  assert.equal(classifyClearBlocker({ id: 'X', status: 'received' }, notLoaded), null);
  assert.equal(classifyClearBlocker({ id: 'Y', status: 'exported' }, notLoaded), 'exported');
});

test('unknown status blocks Clear and missing boxes are ignored', () => {
  assert.equal(classifyClearBlocker({ id: 'A' }, loaded), 'unknown');
  assert.equal(classifyClearBlocker({ id: 'B', status: 'weird' }, loaded), 'unknown');
  assert.equal(classifyClearBlocker(null, loaded), null);
  assert.deepEqual(summarizeClearBlockers(undefined), { total: 0, groups: [] });
});

test('summary groups boxes by kind in priority order with ids and a total', () => {
  const boxes = [
    { id: 'BX-0001', status: 'closed' },
    { id: 'BX-0002', status: 'exported' },
    { id: 'BX-0003', status: 'exported' },
    { id: 'BX-0004', status: 'exported', problemReported: true },
    { id: 'BX-0005', status: 'received' },
  ];
  const summary = summarizeClearBlockers(boxes, loaded);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.groups.map(group => [group.kind, group.count, group.ids]), [
    ['problem', 1, ['BX-0004']],
    ['exported', 2, ['BX-0002', 'BX-0003']],
    ['closed', 1, ['BX-0001']],
  ]);
  // ลำดับกลุ่มต้องตรงกับ CLEAR_BLOCKER_KINDS (ใช้ลำดับเดียวกันทั้งแถบเตือนและ toast)
  const order = CLEAR_BLOCKER_KINDS.map(entry => entry.kind);
  const positions = summary.groups.map(group => order.indexOf(group.kind));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.equal(
    describeClearBlockers(summary),
    'สาขาแจ้งปัญหา รอคลังแก้ไข/รีเช็ค 1 · อนุมัติเอกสารแล้ว รอสาขารับ 2 · ปิดลังแล้ว รอคลังอนุมัติเอกสาร 1',
  );
});

test('blocked toast shows the total and only a few box ids', () => {
  const boxes = ['0001', '0002', '0003', '0004', '0005'].map(n => ({ id: `BX-${n}`, status: 'exported' }));
  const message = buildClearBlockedMessage(summarizeClearBlockers(boxes, loaded));
  assert.match(message, /ยังมี 5 ลัง/);
  assert.match(message, /BX-0001, BX-0002, BX-0003/);
  assert.match(message, /และอีก 2 ลัง/);
  assert.doesNotMatch(message, /BX-0004/);

  const fewBoxes = summarizeClearBlockers(boxes.slice(0, 2), loaded);
  assert.doesNotMatch(buildClearBlockedMessage(fewBoxes), /และอีก/);
});

test('document numbers starting with BKK are exempt from branch receipt, ignoring case and spaces', () => {
  ['BKK261000064', 'bkk261000064', '  BKK 261000064 '].forEach(pos =>
    assert.equal(isReceiveExemptBox({ pos }), true, pos));
  // เลขที่เอกสารสาขาอื่น / BKK ไม่ได้อยู่หน้าสุด / ก่อนอนุมัติ ('—' หรือเลข 14 หลักจาก generatePOS) / ไม่มีค่า → ไม่ยกเว้น
  ['SRC261000064', 'XBKK261000064', '02060001000000', '—', '', null, undefined].forEach(pos =>
    assert.equal(isReceiveExemptBox({ pos }), false, String(pos)));
  assert.equal(isReceiveExemptBox(null), false);
  assert.equal(isReceiveExemptBox(undefined), false);
});

test('an approved BKK box no longer blocks Clear while other exported boxes still do', () => {
  const bkk = { id: 'BX-2810-0001', status: 'exported', pos: 'BKK261000064' };
  const other = { id: 'BX-2810-0002', status: 'exported', pos: 'SRC261000010' };
  assert.equal(classifyClearBlocker(bkk, loaded), null);
  assert.equal(classifyClearBlocker(other, loaded), 'exported');
  // ตัดสินจาก status + เลขที่เอกสาร ไม่ต้องรอ progress โหลด
  assert.equal(classifyClearBlocker(bkk, { itemsByBox: {}, scanProgress: {}, progressLoaded: false }), null);
});

test('Clear opens when the only leftovers are BKK boxes, the empty auto-opened box and received boxes', () => {
  const boxes = [
    { id: 'BX-2810-0001', status: 'received', pos: 'SRC261000010' },
    { id: 'BX-2810-0002', status: 'exported', pos: 'BKK261000064' },
    { id: 'BX-2810-0003', status: 'exported', pos: 'bkk261000065' },
    { id: 'BX-2810-0004', status: 'open', pos: '—' },
    { id: 'BX-2810-0005', status: 'received', pos: 'BKK261000066' },
  ];
  assert.deepEqual(summarizeClearBlockers(boxes, loaded), { total: 0, groups: [] });
  // นับเฉพาะลังที่ Clear ปล่อยผ่านเพราะ BKK จริง (received ไม่นับ) — ไว้บอกในกล่องยืนยัน
  assert.equal(countReceiveExemptBoxes(boxes), 2);
  assert.equal(countReceiveExemptBoxes(undefined), 0);
});

test('a leftover non-BKK box still blocks Clear and BKK boxes are not named in the warning', () => {
  const boxes = [
    { id: 'BX-2810-0001', status: 'exported', pos: 'BKK261000064' },
    { id: 'BX-2810-0002', status: 'exported', pos: 'SRC261000010' },
  ];
  const summary = summarizeClearBlockers(boxes, loaded);
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.groups.map(group => [group.kind, group.ids]), [['exported', ['BX-2810-0002']]]);
  assert.doesNotMatch(buildClearBlockedMessage(summary), /BX-2810-0001/);
});

test('BKK exemption only covers approved boxes that nobody is working on in the system', () => {
  const pos = 'BKK261000064';
  // ยังไม่อนุมัติเอกสาร = ยังเป็นงานของคลัง
  assert.equal(classifyClearBlocker({ id: 'A', status: 'closed', pos }, loaded), 'closed');
  // มีคนสแกนรับ/แจ้งปัญหาในระบบจริงแล้ว = ยังล็อก (Clear จะลบงานที่กำลังทำอยู่ทิ้ง)
  assert.equal(classifyClearBlocker({ id: 'B', status: 'exported', pos, receivePending: true }, loaded), 'pending');
  assert.equal(
    classifyClearBlocker({ id: 'C', status: 'exported', pos, problemReported: true, problemResolved: false }, loaded),
    'problem',
  );
  // เลขที่เอกสารไม่ใช่ใบผ่านให้ลังที่ยังแพ็คค้างอยู่
  assert.equal(
    classifyClearBlocker({ id: 'D', status: 'open', pos }, { ...loaded, scanProgress: { D: [{ sku: '1', got: 2 }] } }),
    'packing',
  );
});

test('blocked toast stays empty when nothing blocks and explains the progress wait', () => {
  assert.equal(buildClearBlockedMessage(summarizeClearBlockers([], loaded)), '');
  assert.equal(buildClearBlockedMessage(undefined), '');

  const waiting = summarizeClearBlockers(
    [{ id: 'BX-0001', status: 'open' }],
    { itemsByBox: {}, scanProgress: {}, progressLoaded: false },
  );
  assert.match(buildClearBlockedMessage(waiting), /กำลังตรวจสถานะ/);
});
