import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKING_LOT_QR_REASONS,
  calculateLotUsage,
  collectLotSettledBoxIds,
  parsePackingLotQr,
  validatePackingLotQr,
} from '../src/warehouseHelpers.js';

test('packing LOT QR parser accepts printed and Android-collapsed payloads', () => {
  assert.deepEqual(parsePackingLotQr('LOT:LOT-001\nEXP:31/12/2030'), {
    lot: 'LOT-001',
    exp: '31/12/2030',
  });
  assert.deepEqual(parsePackingLotQr('LOT:LOT-001EXP:31/12/2030'), {
    lot: 'LOT-001',
    exp: '31/12/2030',
  });
  assert.deepEqual(parsePackingLotQr('LOT:NOLOTEXP:31/12/9999'), {
    lot: 'NOLOT',
    exp: '31/12/9999',
  });
  assert.deepEqual(parsePackingLotQr('LOT:NOTLOT\r\nEXP:1/2/9999'), {
    lot: 'NOTLOT',
    exp: '1/2/9999',
  });
});

test('packing LOT QR parser does not classify ordinary or incomplete product barcodes as QR', () => {
  assert.equal(parsePackingLotQr('8851234567890'), null);
  assert.equal(parsePackingLotQr('LOT:LOT-001'), null);
  assert.equal(parsePackingLotQr('EXP:31/12/2030'), null);
  assert.equal(parsePackingLotQr('LOT:\nEXP:31/12/2030'), null);
});

test('packing LOT QR validation matches SKU, LOT, EXP and base-unit stock', () => {
  const lotMap = {
    'SKU-A': [
      { lot: 'LOT-A', exp: '31/12/2030', qty: 20 },
      { lot: 'LOT-B', exp: '31/12/2031', qty: 5 },
    ],
  };
  const usage = { 'SKU-A__LOT-A': 8 };

  assert.deepEqual(validatePackingLotQr({
    sku: 'SKU-A',
    qr: { lot: 'LOT-A', exp: '31/12/2030' },
    lotMap,
    usage,
    factor: 12,
  }), {
    ok: true,
    lot: 'LOT-A',
    exp: '31/12/2030',
    remaining: 12,
    required: 12,
  });

  assert.deepEqual(validatePackingLotQr({
    sku: 'SKU-A',
    qr: { lot: 'LOT-A', exp: '31/12/2030' },
    lotMap,
    usage,
    factor: 13,
  }), {
    ok: false,
    reason: PACKING_LOT_QR_REASONS.INSUFFICIENT_STOCK,
    remaining: 12,
    required: 13,
  });
});

test('packing LOT QR validation rejects wrong pairs and missing operational LOT data', () => {
  const lotMap = {
    'SKU-A': [{ lot: 'LOT-A', exp: '31/12/2030', qty: 20 }],
  };

  assert.equal(validatePackingLotQr({
    sku: 'SKU-A', qr: { lot: 'LOT-X', exp: '31/12/2030' }, lotMap,
  }).reason, PACKING_LOT_QR_REASONS.LOT_NOT_FOUND);

  assert.deepEqual(validatePackingLotQr({
    sku: 'SKU-A', qr: { lot: 'LOT-A', exp: '01/01/2031' }, lotMap,
  }), {
    ok: false,
    reason: PACKING_LOT_QR_REASONS.EXP_MISMATCH,
    expectedExp: ['31/12/2030'],
  });

  assert.equal(validatePackingLotQr({
    sku: 'SKU-B', qr: { lot: 'LOT-A', exp: '31/12/2030' }, lotMap,
  }).reason, PACKING_LOT_QR_REASONS.NO_LOT_DATA);
});

test('regression SKU 500504: a box already sent to POS is not deducted twice from a fresh LOT file', () => {
  // ไฟล์ LOT ดึงจาก ERP หลังลังเก่าเข้า POS แล้ว: G1323 รับเข้า 48 จ่ายออก 24 → เหลือ 24 ซอง (= Picklist ขอพอดี)
  // exp เป็นค่าสมมติของ fixture (validatePackingLotQr ต้องให้ EXP ใน QR ตรงกับไฟล์)
  const lotMap = { '500504': [{ lot: 'G1323', qty: 24, exp: '31/12/2027' }] };
  const qr = { lot: 'G1323', exp: '31/12/2027' };
  const factorMap = { '500504__ซอง': 1, '500504__กล่อง': 24 };
  // ลังเก่าที่ส่ง POS ไปแล้ว (= ยอดจ่ายออก 24 ในไฟล์) ยังค้างในระบบเพราะ Clear ถูกล็อกจนกว่าสาขาจะรับครบ
  const boxes = [{ id: 'BX-OLD', status: 'exported', textExported: true }];
  const itemsByBox = {
    'BX-OLD': [{
      sku: '500504', qty: 1, scannedUnit: 'กล่อง',
      scannedLots: [{ lot: 'G1323', qty: 1, unit: 'กล่อง' }],
    }],
  };

  // เดิม: หักลังเก่าซ้ำ → เหลือ 0 → หน้าแพ็คขึ้น "LOT นี้สินค้าหมด" / QR บอกยอดไม่พอ
  const doubleCounted = calculateLotUsage({ boxes, itemsByBox, factorMap });
  assert.equal(doubleCounted['500504__G1323'], 24);
  assert.deepEqual(validatePackingLotQr({ sku: '500504', qr, lotMap, usage: doubleCounted, factor: 1 }), {
    ok: false,
    reason: PACKING_LOT_QR_REASONS.INSUFFICIENT_STOCK,
    remaining: 0,
    required: 1,
  });

  // แก้แล้ว: ข้ามลังที่จดไว้ตอนอัปไฟล์ LOT ว่าส่ง POS แล้ว → เหลือ 24 ครบตามไฟล์ (สแกนบาร์โค้ดกล่อง = 24 ซองได้)
  const settledAtImport = collectLotSettledBoxIds(boxes);
  const usage = calculateLotUsage({ boxes, itemsByBox, factorMap, excludeBoxIds: settledAtImport });
  assert.deepEqual(validatePackingLotQr({ sku: '500504', qr, lotMap, usage, factor: 24 }), {
    ok: true,
    lot: 'G1323',
    exp: '31/12/2027',
    remaining: 24,
    required: 24,
  });

  // ลังที่แพ็คหลังอัปไฟล์ LOT ยังถูกหักตามปกติ แม้จะส่ง POS ไปแล้ว — ไฟล์ที่อัปไว้ยังไม่ได้หักลังนี้
  const laterBoxes = [...boxes, { id: 'BX-NEW', status: 'exported', textExported: true }];
  const laterItems = {
    ...itemsByBox,
    'BX-NEW': [{ sku: '500504', qty: 10, scannedUnit: 'ซอง', scannedLots: [{ lot: 'G1323', qty: 10, unit: 'ซอง' }] }],
  };
  const laterUsage = calculateLotUsage({
    boxes: laterBoxes, itemsByBox: laterItems, factorMap, excludeBoxIds: settledAtImport,
  });
  assert.equal(laterUsage['500504__G1323'], 10);
});
