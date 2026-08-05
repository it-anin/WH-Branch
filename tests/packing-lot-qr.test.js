import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKING_LOT_QR_REASONS,
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
